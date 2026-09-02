// เลือก "ใบเสนอราคาที่ใช้จริงของงาน" สำหรับใบปะหน้า/สแตมป์แบบ
//
// ปัญหาเดิม: งาน 1 งานมีใบเสนอหลายใบ (revise/เสนอใหม่) → เดิมเลือก "ใบล่าสุดตาม created_at"
//   แต่ลูกค้ามัดจำ/วางบิลบนใบเก่ากว่า → ใบปะหน้าดึงผิดใบ (ใบที่ไม่ได้มัดจำ)
//
// แก้ระยะยาว: เลือก "ใบที่ลูกค้าตกลงจริง" = ใบที่มีใบวางบิล (ไม่ยกเลิก) ผูกอยู่
//   ชอบใบที่ "มีเงินเข้าแล้ว" (paid/partial = มัดจำ/ชำระ) ก่อน · ถ้าเสมอ เอาใบวางบิลล่าสุด
//   ถ้าไม่มีใบวางบิลเลย (ยังไม่มัดจำ) → fallback ใบเสนอล่าสุด (พฤติกรรมเดิม)
//
// 0136: เพิ่ม "เลือก rev เอง" — ถ้าผู้ใช้เคย pin quotation_id ไว้ (เก็บบน cover_sheets/job_drawings)
//   ให้ใช้ตัวที่ pin ก่อนเสมอ (ข้าม logic บิล) เพื่อไม่ auto-overwrite ของที่เลือกไว้แล้ว
//   listJobQuotations() ใช้เติมดรอปดาวน์ให้เลือกเอง (มีทุก rev/ใบที่ยังไม่ยกเลิกของงาน)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };
type QuoRow = { id: number; code: string; created_at: string; revision_no: number | null; revision_label: string | null };

// มีเงินเข้าแล้ว (มัดจำ/ชำระบางส่วน/ครบ) ควรชนะใบที่ยังไม่จ่าย
const billRank = (status?: string) => (status === "paid" || status === "partial") ? 2 : 1;

export type PickedQuotation = { id: number; code: string; revision_no: number };
export type JobQuotationOption = {
  id: number;
  code: string;
  revision_no: number;
  revision_label: string | null;
  created_at: string;
  has_bill: boolean;
};

/**
 * คืนใบเสนอราคาที่ควรใช้ของงาน (id, code, revision_no) หรือ null ถ้างานไม่มีใบเสนอเลย
 * ⚠ ใช้ร่วม cover-sheets GET/generate + job-drawings GET (ต้องเลือกใบเดียวกันเสมอ)
 *
 * pinnedId: ถ้าส่งมาและยังมีอยู่ในรายการใบเสนอของงาน (ไม่ถูกยกเลิก) → คืนแถวนั้นเลย ข้าม logic เลือกอัตโนมัติ
 *   (ใช้กรณีผู้ใช้เคยสร้างใบปะหน้า/แบบช่างแล้ว หรือกดเลือกใบเสนอเองจากดรอปดาวน์ — ไม่ auto-overwrite)
 */
export async function pickJobQuotation(sb: AnySb, jobId: string, pinnedId?: number | null): Promise<PickedQuotation | null> {
  const { data: quos } = await sb
    .from("quotations")
    .select("id, code, created_at, revision_no, revision_label")
    .eq("job_id", jobId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  const list = (quos ?? []) as QuoRow[];
  if (list.length === 0) return null;

  if (pinnedId != null) {
    const pinned = list.find((x) => x.id === pinnedId);
    if (pinned) return { id: pinned.id, code: pinned.code, revision_no: pinned.revision_no ?? 0 };
    // pin ชี้ไปใบที่ไม่มีแล้ว (ยกเลิก/ลบ) → ตกไปเลือกอัตโนมัติแทน
  }

  if (list.length === 1) return { id: list[0].id, code: list[0].code, revision_no: list[0].revision_no ?? 0 };

  // มีหลายใบ → หาใบที่ "ลูกค้าตกลงจริง" (มีใบวางบิลไม่ยกเลิกผูกอยู่)
  const ids = list.map((q) => q.id);
  const { data: bns } = await sb
    .from("billing_notes")
    .select("quotation_id, status, created_at")
    .in("quotation_id", ids)
    .neq("status", "cancelled");
  const bills = (bns ?? []) as { quotation_id: number; status: string; created_at: string }[];

  if (bills.length > 0) {
    // เลือกใบวางบิล "ดีที่สุด": มีเงินเข้าก่อน (rank) → แล้วใบวางบิลล่าสุด (created_at)
    let best = bills[0];
    for (const b of bills) {
      if (billRank(b.status) > billRank(best.status)
        || (billRank(b.status) === billRank(best.status) && b.created_at > best.created_at)) best = b;
    }
    const q = list.find((x) => x.id === best.quotation_id);
    if (q) return { id: q.id, code: q.code, revision_no: q.revision_no ?? 0 };
  }

  // ไม่มีใบวางบิลเลย → ใบเสนอล่าสุด (เหมือนเดิม)
  return { id: list[0].id, code: list[0].code, revision_no: list[0].revision_no ?? 0 };
}

/**
 * รายการใบเสนอทั้งหมดของงาน (ไม่ยกเลิก) เรียง created_at ล่าสุดก่อน — สำหรับดรอปดาวน์ให้เลือกเอง
 */
export async function listJobQuotations(sb: AnySb, jobId: string): Promise<JobQuotationOption[]> {
  const { data: quos } = await sb
    .from("quotations")
    .select("id, code, created_at, revision_no, revision_label")
    .eq("job_id", jobId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  const list = (quos ?? []) as QuoRow[];
  if (list.length === 0) return [];

  const ids = list.map((q) => q.id);
  const { data: bns } = await sb
    .from("billing_notes")
    .select("quotation_id")
    .in("quotation_id", ids)
    .neq("status", "cancelled");
  const billedIds = new Set(((bns ?? []) as { quotation_id: number }[]).map((b) => b.quotation_id));

  return list.map((q) => ({
    id: q.id,
    code: q.code,
    revision_no: q.revision_no ?? 0,
    revision_label: q.revision_label ?? null,
    created_at: q.created_at,
    has_bill: billedIds.has(q.id),
  }));
}
