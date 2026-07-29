import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { specBulletsFromDetail } from "@/lib/cover-sheet/generate.mjs";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

const schema = z.object({ job_id: z.string().uuid() });

// แยกสเปคจากบุลเลทของข้อใบเสนอ → ช่องในชุดงาน (best-effort · อ่านจากข้อความตามที่บันทึกไว้)
//   กระจก→glass_spec · มุ้ง→screen_type · ที่เหลือ (อลู/สี/มือจับ ฯลฯ)→note (สีอลูที่พิมพ์เองก็ติดมาที่นี่)
function specFromBullets(bullets: string[]) {
  const glass = bullets.find((b) => /กระจก/.test(b)) ?? "";
  const screen = bullets.find((b) => /มุ้ง/.test(b)) ?? "";
  const rest = bullets.filter((b) => b !== glass && b !== screen);
  return { glass_spec: glass, screen_type: screen, note: rest.join(" · ") };
}

// POST /api/production-sets/from-quotation { job_id }
//   "ดึงจากใบเสนอ" — สร้าง 1 ชุด/ข้อ (ที่เป็นงานจริง) + เติมสเปคจากข้อความในใบเสนอ (แก้ได้)
//   ไม่ทับของเดิม: ข้ามข้อที่มีชุดชื่อเดียวกันอยู่แล้ว (กดซ้ำได้ ดึงเฉพาะข้อใหม่)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const { job_id } = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  // ใบเสนอล่าสุดของงาน (ตัด cancelled · เรียง created_at ล่าสุด — pattern เดียวกับใบปะหน้า)
  const { data: quos, error: qErr } = await sb.from("quotations")
    .select("id, created_at").eq("job_id", job_id).neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (qErr) throw dbError(qErr);
  const latest = (quos ?? [])[0];
  if (!latest) return ok({ created: 0, skipped: 0, reason: "no_quotation" });

  const { data: items, error: iErr } = await sb.from("quotation_items")
    .select("name, detail, group_label, sort_order")
    .eq("quotation_id", latest.id).order("sort_order", { ascending: true });
  if (iErr) throw dbError(iErr);

  // ชุดเดิม (กันสร้างซ้ำ) + productions (prefill วัด/คนวัด/ติดตั้ง) + seq ถัดไป
  const [{ data: existing }, { data: prod }] = await Promise.all([
    sb.from("production_sets").select("set_label, seq").eq("job_id", job_id),
    sb.from("productions").select("measure_actual, measurer_name, planned_install_date").eq("job_id", job_id).maybeSingle(),
  ]);
  const haveLabels = new Set((existing ?? []).map((s: any) => String(s.set_label || "").trim()));
  let seq = Math.max(0, ...(existing ?? []).map((s: any) => Number(s.seq) || 0));

  const rows: Record<string, unknown>[] = [];
  for (const it of items ?? []) {
    const bullets = specBulletsFromDetail((it as any).detail);
    if (/ส่วนลด|discount/i.test(String((it as any).name || ""))) continue; // ข้อส่วนลด = ไม่ใช่งาน
    if (bullets.length === 0) continue; // ไม่มีสเปค = ข้าม(เช่น หมายเหตุล้วน)
    const g = (it as any).group_label ? String((it as any).group_label).trim() + " · " : "";
    const label = (g + String((it as any).name || "").trim()).trim() || `ข้อ ${seq + 1}`;
    if (haveLabels.has(label)) continue; // มีชุดชื่อนี้แล้ว = ข้าม (ไม่ทับ)
    haveLabels.add(label);
    const spec = specFromBullets(bullets);
    seq += 1;
    rows.push({
      job_id, set_label: label, seq,
      glass_spec: spec.glass_spec, screen_type: spec.screen_type, note: spec.note,
      measure_actual: prod?.measure_actual ?? null,
      measurer_name: prod?.measurer_name ?? "",
      install_date: prod?.planned_install_date ?? null,
      created_by: ctx.user.id,
    });
  }

  if (rows.length === 0) return ok({ created: 0, skipped: (items ?? []).length });
  const { error: insErr } = await sb.from("production_sets").insert(rows);
  if (insErr) throw dbError(insErr);
  return ok({ created: rows.length, skipped: (items ?? []).length - rows.length });
});
