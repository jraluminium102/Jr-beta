import { specBulletsFromDetail } from "@/lib/cover-sheet/generate.mjs";
import { pickJobQuotation, listJobQuotations } from "@/lib/cover-sheet/pick-quotation";
import { createServiceClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message?: string } | null }> };

// แยกสเปคจากบุลเลทของข้อใบเสนอ → ช่องในชุดงาน (best-effort)
//   กระจก→glass_spec · มุ้ง→screen_type · ที่เหลือ→note
function specFromBullets(bullets: string[]) {
  const glass = bullets.find((b) => /กระจก/.test(b)) ?? "";
  const screen = bullets.find((b) => /มุ้ง/.test(b)) ?? "";
  const rest = bullets.filter((b) => b !== glass && b !== screen);
  // หมายเหตุ = บูลเลททีละบรรทัด (เจ้าของ 29 ต.ค.69 · เดิมต่อด้วย " · " บรรทัดเดียว อ่านยาก)
  return { glass_spec: glass, screen_type: screen, note: rest.map((b) => `- ${b}`).join("\n") };
}

// ข้อในใบเสนอที่ "เป็นงานจริง" (ไม่ใช่ส่วนลด · มีสเปค) — กฎเดียวกับตอนสร้างชุด ใช้ทั้งนับและสร้าง
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isWorkItem(item: any): boolean {
  if (/ส่วนลด|discount/i.test(String(item?.name || ""))) return false;
  return specBulletsFromDetail(item?.detail).length > 0;
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

export type QuotationRef = { id: number; code: string; revision_no: number };

export type RegenResult = {
  created: number; skipped: number; replaced: number;
  reason?: "no_quotation" | "bad_quotation" | "other_quotation" | "empty_quotation";
  /** other_quotation: ชุด auto ที่มีอยู่มาจากใบเหล่านี้ (ไม่ใช่ใบที่กำลังจะดึง) */
  current?: QuotationRef[];
  /** ใบที่กำลังจะดึง */
  target?: QuotationRef;
};

export type RegenOpts = {
  /** true = ลบชุด auto ทั้งหมด (ทุกใบ) แล้วดึงใบนี้ใหม่ · false = เพิ่มเฉพาะข้อใหม่ */
  replace: boolean;
  /** ระบุใบเสนอเอง (ต้องเป็นใบของงานนี้ · ไม่ยกเลิก) — ไม่ระบุ = เลือกอัตโนมัติ (ใบที่มีบิล/ล่าสุด) */
  quotationId?: number | null;
  /** replace=false เท่านั้น: ยอมเพิ่มทับทั้งที่ชุดเดิมมาจากใบอื่น (ผู้ใช้ยืนยันแล้ว) — ปกติจะคืน reason other_quotation ให้ถามก่อน */
  force?: boolean;
};

/** ใบเสนอที่ชุด auto ของงานอ้างอยู่ตอนนี้ (distinct · ไม่รวมชุดเพิ่มมือ) — ใช้ตอน Rev ด้วย: Rev ใบไหน regen เฉพาะเมื่อชุดปัจจุบันมาจากใบนั้น */
export async function currentAutoQuotations(sb: Sb, jobId: string): Promise<QuotationRef[]> {
  const { data: sets, error } = await sb.from("production_sets").select("quotation_id").eq("job_id", jobId).not("quotation_id", "is", null);
  if (error) return [];   // 0144 ยังไม่รัน → ถือว่าไม่มี
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = [...new Set((sets ?? []).map((s: any) => Number(s.quotation_id)).filter((n: number) => n > 0))];
  if (ids.length === 0) return [];
  const { data: quos } = await sb.from("quotations").select("id, code, revision_no").in("id", ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((quos ?? []) as any[]).map((q) => ({ id: Number(q.id), code: String(q.code ?? ""), revision_no: Number(q.revision_no) || 0 }));
}

/**
 * ดึง/สร้างชุดงานผลิตจากใบเสนอของงาน
 *   ใบที่ใช้: opts.quotationId (ผู้ใช้เลือกเอง) → ไม่ส่ง = pickJobQuotation (ใบมัดจำ/ล่าสุด)
 *   ⚠ 16 ต.ค.69 (บัค "ดึงมาทั้งลูกค้า"): งานที่มีใบเสนอหลายใบ (หลายออเดอร์ค้างใต้งานเดียว) ปุ่มดึงเดิมไม่เคยเช็คว่า
 *     ชุดเดิมมาจากใบไหน → ดึงใบ A ทีหนึ่ง พอมีบิลใบ B ค่อยดึงอีกที = ชุดของ A+B ปนกัน
 *     → replace=false ตอนนี้: ถ้าชุด auto เดิมมาจากใบอื่น จะไม่ทำเงียบ ๆ คืน reason "other_quotation" ให้หน้าจอถามก่อน
 *   replace=false (ปุ่ม "ดึงจากใบเสนอ" · production:write) = เพิ่มเฉพาะข้อใหม่ (ข้ามชุดชื่อซ้ำ) · เขียนผ่าน session ปกติ
 *   replace=true  (Rev · หรือผู้ใช้เลือก "แทนที่") = ลบชุด auto ทั้งหมด (ทุกใบ) แล้วดึงใหม่ · คงชุดที่เพิ่มมือ
 *       → ทำผ่าน RPC regen_production_sets (security definer · atomic · ข้าม RLS)
 */
export async function regenSetsFromQuotation(
  sb: Sb, jobId: string, userId: string | null, opts: RegenOpts,
): Promise<RegenResult> {
  let target: QuotationRef | null = null;
  if (opts.quotationId != null) {
    // ระบุใบเอง: ต้องเป็นใบของ "งานนี้" เท่านั้น (กันส่ง id ใบของงาน/ลูกค้าอื่นมา)
    const { data: q } = await sb.from("quotations").select("id, code, revision_no")
      .eq("id", opts.quotationId).eq("job_id", jobId).neq("status", "cancelled").maybeSingle();
    if (!q) return { created: 0, skipped: 0, replaced: 0, reason: "bad_quotation" };
    target = { id: Number(q.id), code: String(q.code ?? ""), revision_no: Number(q.revision_no) || 0 };
  } else {
    const picked = await pickJobQuotation(sb, jobId);
    if (!picked) return { created: 0, skipped: 0, replaced: 0, reason: "no_quotation" };
    target = { id: picked.id, code: picked.code, revision_no: picked.revision_no };
  }
  const revNo = target.revision_no;
  const targetId = target.id;

  // โหมดเพิ่ม: ชุด auto เดิมมาจากใบอื่น → ไม่ปนให้เงียบ ๆ (ให้หน้าจอถาม แทนที่/เพิ่ม/ยกเลิก)
  if (!opts.replace && !opts.force) {
    const current = await currentAutoQuotations(sb, jobId);
    const others = current.filter((c) => c.id !== targetId);
    if (others.length > 0) return { created: 0, skipped: 0, replaced: 0, reason: "other_quotation", current, target };
  }

  const { data: items } = await sb.from("quotation_items")
    .select("name, detail, group_label, sort_order")
    .eq("quotation_id", targetId).order("sort_order", { ascending: true });

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
    if (!isWorkItem(item)) continue;                                   // ส่วนลด/ไม่มีสเปค = ไม่ใช่งาน
    const bullets = specBulletsFromDetail(item.detail);
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
      quotation_id: targetId, quotation_rev_no: revNo,
      created_by: userId,
    });
  }

  const skipped = ((items ?? []).length - rows.length);

  if (opts.replace) {
    // ใบที่เลือกไม่มีข้อที่เป็นงานเลย → ห้ามลบชุดเดิมทิ้งเปล่า ๆ (QA #4 · 16 ต.ค.69)
    if (rows.length === 0) return { created: 0, skipped, replaced: 0, reason: "empty_quotation", target };
    // ต้อง atomic + ข้าม RLS (Rev เรียกจาก jobs:write ที่อาจไม่มี production:write) → RPC security definer (0145)
    //   ⚠ ต้องเรียกด้วย "session ผู้ใช้" (sb) — RPC เช็ค is_active() ซึ่งอ่าน auth.uid()
    //     เดิมเรียกด้วย service client → auth.uid() ว่าง → RPC raise 'forbidden' ทุกครั้ง = การ Rev ไม่เคย regen ชุดจริง (QA จับได้ 16 ต.ค.69)
    const rpcRows = rows.map((r) => ({
      set_label: r.set_label, seq: r.seq, glass_spec: r.glass_spec, screen_type: r.screen_type,
      note: r.note, measure_actual: r.measure_actual, measurer_name: r.measurer_name, install_date: r.install_date,
    }));
    const res = sb.rpc
      ? await sb.rpc("regen_production_sets", {
          p_job_id: jobId, p_quotation_id: targetId, p_rev_no: revNo, p_created_by: userId, p_rows: rpcRows,
        })
      : { error: { message: "no rpc" } };
    if (res.error) {
      // RPC ยังไม่มี (0145 ยังไม่รัน) → fallback service client (ข้าม RLS · ไม่ atomic แต่ทำงานได้) · error อื่น (เช่น forbidden) = โยนต่อ ไม่กลืน
      if (/regen_production_sets|function|does not exist|42883|schema cache|no rpc/i.test(res.error.message ?? "")) {
        const svc = createServiceClient() as unknown as Sb;
        await svc.from("production_sets").delete().eq("job_id", jobId).not("quotation_id", "is", null);
        await insertSets(svc, rows);
      } else {
        throw new Error(res.error.message);
      }
    }
    return { created: rows.length, skipped, replaced: 1, target };
  }

  // ปุ่ม "ดึงจากใบเสนอ" — เขียนผ่าน session ปกติ (production:write เขียน production_sets ได้)
  await insertSets(sb, rows);
  return { created: rows.length, skipped, replaced: 0, target };
}

export type QuotationPullOption = {
  id: number; code: string; revision_no: number; revision_label: string | null; created_at: string;
  has_bill: boolean;
  /** จำนวนข้อที่เป็นงานจริง (จะกลายเป็นชุด) */
  work_items: number;
  /** ชุด auto ของงานตอนนี้มาจากใบนี้ */
  is_current: boolean;
};

/**
 * ตัวเลือกให้ผู้ใช้ "เลือกใบที่จะดึง" — ทุกใบของงาน (ไม่ยกเลิก) + จำนวนข้อ + ใบไหนเป็นต้นทางชุดปัจจุบัน + ใบที่ระบบแนะนำ
 *   ออกแบบเผื่อ "ลูกค้าคนนี้คืองานไหน": ถ้างานมีใบ > 1 หน้าจอต้องให้เลือก ไม่เดาให้
 */
export async function listQuotationPullOptions(sb: Sb, jobId: string): Promise<{ options: QuotationPullOption[]; suggested_id: number | null; current_ids: number[] }> {
  const [list, current, picked] = await Promise.all([
    listJobQuotations(sb, jobId),
    currentAutoQuotations(sb, jobId),
    pickJobQuotation(sb, jobId),
  ]);
  if (list.length === 0) return { options: [], suggested_id: null, current_ids: [] };
  const ids = list.map((q) => q.id);
  const { data: items } = await sb.from("quotation_items").select("quotation_id, name, detail").in("quotation_id", ids);
  const counts = new Map<number, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of (items ?? []) as any[]) {
    if (!isWorkItem(it)) continue;
    const k = Number(it.quotation_id);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const currentIds = new Set(current.map((c) => c.id));
  return {
    options: list.map((q) => ({ ...q, work_items: counts.get(q.id) ?? 0, is_current: currentIds.has(q.id) })),
    suggested_id: picked?.id ?? null,
    current_ids: [...currentIds],
  };
}

// งานนี้เคยดึงชุดจากใบเสนอเข้าผลิตแล้วหรือยัง (มีชุด auto อยู่) — ใช้ gate การ regen ตอน Rev
export async function jobHasAutoSets(sb: Sb, jobId: string): Promise<boolean> {
  const { data, error } = await sb.from("production_sets")
    .select("id").eq("job_id", jobId).not("quotation_id", "is", null).limit(1);
  if (error) return false;  // 0144 ยังไม่รัน / error → ถือว่าไม่มี (ข้าม regen · best-effort)
  return (data ?? []).length > 0;
}
