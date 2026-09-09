import { specBulletsFromDetail } from "@/lib/cover-sheet/generate.mjs";
import { pickJobQuotation } from "@/lib/cover-sheet/pick-quotation";
import { createServiceClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> };

// แยกสเปคจากบุลเลทของข้อใบเสนอ → ช่องในชุดงาน (best-effort)
//   กระจก→glass_spec · มุ้ง→screen_type · ที่เหลือ→note
function specFromBullets(bullets: string[]) {
  const glass = bullets.find((b) => /กระจก/.test(b)) ?? "";
  const screen = bullets.find((b) => /มุ้ง/.test(b)) ?? "";
  const rest = bullets.filter((b) => b !== glass && b !== screen);
  return { glass_spec: glass, screen_type: screen, note: rest.join(" · ") };
}

// insert ชุดงาน — กันพัง: ถ้า 0144 (quotation_id/quotation_rev_no) ยังไม่รัน → insert ซ้ำแบบตัดคอลัมน์ใหม่ออก
async function insertSets(sb: Sb, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  let { error } = await sb.from("production_sets").insert(rows);
  if (error && /quotation_id|quotation_rev_no/i.test(error.message ?? "")) {
    const stripped = rows.map(({ quotation_id: _q, quotation_rev_no: _r, ...rest }) => rest);
    ({ error } = await sb.from("production_sets").insert(stripped));
  }
  if (error) throw new Error(error.message);
}

/**
 * ดึง/สร้างชุดงานผลิตจาก "ใบเสนอที่ใช้จริงของงาน" (ใบมัดจำ/ล่าสุด · pickJobQuotation)
 *   replace=false (ปุ่ม "ดึงจากใบเสนอ" · เรียกโดย production:write) = เพิ่มเฉพาะข้อใหม่ (ข้ามชุดชื่อซ้ำ) · เขียนผ่าน session ปกติ
 *   replace=true  (Rev · เรียกโดย jobs:write ที่อาจไม่มี production:write) = ลบชุด auto แล้วดึงใหม่ทั้งหมด
 *       → ทำผ่าน RPC regen_production_sets (security definer · atomic · ข้าม RLS) · คงชุดที่เพิ่มมือ
 */
export async function regenSetsFromQuotation(
  sb: Sb, jobId: string, userId: string | null, opts: { replace: boolean },
): Promise<{ created: number; skipped: number; replaced: number; reason?: string }> {
  const latest = await pickJobQuotation(sb, jobId);
  if (!latest) return { created: 0, skipped: 0, replaced: 0, reason: "no_quotation" };
  const revNo = Number(latest.revision_no) || 0;

  const { data: items } = await sb.from("quotation_items")
    .select("name, detail, group_label, sort_order")
    .eq("quotation_id", latest.id).order("sort_order", { ascending: true });

  // ชุดเดิม: replace → นับเฉพาะชุดมือ (auto จะถูกลบ) · ไม่ replace → นับทุกชุด (กันสร้างซ้ำ)
  const { data: existing } = await sb.from("production_sets")
    .select("set_label, seq, quotation_id").eq("job_id", jobId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keep = (existing ?? []).filter((s: any) => (opts.replace ? s.quotation_id == null : true));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haveLabels = new Set(keep.map((s: any) => String(s.set_label || "").trim()));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let seq = Math.max(0, ...keep.map((s: any) => Number(s.seq) || 0));

  const { data: prod } = await sb.from("productions")
    .select("measure_actual, measurer_name, planned_install_date").eq("job_id", jobId).maybeSingle();

  const rows: Record<string, unknown>[] = [];
  for (const it of items ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = it as any;
    const bullets = specBulletsFromDetail(item.detail);
    if (/ส่วนลด|discount/i.test(String(item.name || ""))) continue;  // ข้อส่วนลด = ไม่ใช่งาน
    if (bullets.length === 0) continue;                                // ไม่มีสเปค = ข้าม
    const g = item.group_label ? String(item.group_label).trim() + " · " : "";
    const label = (g + String(item.name || "").trim()).trim() || `ข้อ ${seq + 1}`;
    if (haveLabels.has(label)) continue;  // ชื่อชุดซ้ำ = ข้าม (ไม่ทับ)
    haveLabels.add(label);
    const spec = specFromBullets(bullets);
    seq += 1;
    rows.push({
      job_id: jobId, set_label: label, seq,
      glass_spec: spec.glass_spec, screen_type: spec.screen_type, note: spec.note,
      measure_actual: prod?.measure_actual ?? null,
      measurer_name: prod?.measurer_name ?? "",
      install_date: prod?.planned_install_date ?? null,
      quotation_id: latest.id, quotation_rev_no: revNo,
      created_by: userId,
    });
  }

  const skipped = ((items ?? []).length - rows.length);

  if (opts.replace) {
    // Rev: ต้อง atomic + ข้าม RLS (ผู้เรียกอาจไม่มี production:write) → service client + RPC
    const svc = createServiceClient() as unknown as Sb;
    const rpcRows = rows.map((r) => ({
      set_label: r.set_label, seq: r.seq, glass_spec: r.glass_spec, screen_type: r.screen_type,
      note: r.note, measure_actual: r.measure_actual, measurer_name: r.measurer_name, install_date: r.install_date,
    }));
    const res = svc.rpc
      ? await svc.rpc("regen_production_sets", {
          p_job_id: jobId, p_quotation_id: latest.id, p_rev_no: revNo, p_created_by: userId, p_rows: rpcRows,
        })
      : { error: { message: "no rpc" } };
    if (res.error) {
      // RPC ยังไม่มี (0145 ยังไม่รัน) → fallback ผ่าน service client (ข้าม RLS · ยังไม่ atomic แต่ทำงานได้)
      if (/regen_production_sets|function|does not exist|42883|schema cache|no rpc/i.test(res.error.message ?? "")) {
        await svc.from("production_sets").delete().eq("job_id", jobId).not("quotation_id", "is", null);
        await insertSets(svc, rows);
      } else {
        throw new Error(res.error.message);
      }
    }
    return { created: rows.length, skipped, replaced: 1 };
  }

  // ปุ่ม "ดึงจากใบเสนอ" — เขียนผ่าน session ปกติ (production:write เขียน production_sets ได้)
  await insertSets(sb, rows);
  return { created: rows.length, skipped, replaced: 0 };
}

// งานนี้เคยดึงชุดจากใบเสนอเข้าผลิตแล้วหรือยัง (มีชุด auto อยู่) — ใช้ gate การ regen ตอน Rev
export async function jobHasAutoSets(sb: Sb, jobId: string): Promise<boolean> {
  const { data, error } = await sb.from("production_sets")
    .select("id").eq("job_id", jobId).not("quotation_id", "is", null).limit(1);
  if (error) return false;  // 0144 ยังไม่รัน / error → ถือว่าไม่มี (ข้าม regen · best-effort)
  return (data ?? []).length > 0;
}
