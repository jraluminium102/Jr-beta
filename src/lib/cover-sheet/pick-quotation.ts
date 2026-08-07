// เลือก "ใบเสนอราคาที่ใช้จริงของงาน" สำหรับใบปะหน้า/สแตมป์แบบ
//
// ปัญหาเดิม: งาน 1 งานมีใบเสนอหลายใบ (revise/เสนอใหม่) → เดิมเลือก "ใบล่าสุดตาม created_at"
//   แต่ลูกค้ามัดจำ/วางบิลบนใบเก่ากว่า → ใบปะหน้าดึงผิดใบ (ใบที่ไม่ได้มัดจำ)
//
// แก้ระยะยาว: เลือก "ใบที่ลูกค้าตกลงจริง" = ใบที่มีใบวางบิล (ไม่ยกเลิก) ผูกอยู่
//   ชอบใบที่ "มีเงินเข้าแล้ว" (paid/partial = มัดจำ/ชำระ) ก่อน · ถ้าเสมอ เอาใบวางบิลล่าสุด
//   ถ้าไม่มีใบวางบิลเลย (ยังไม่มัดจำ) → fallback ใบเสนอล่าสุด (พฤติกรรมเดิม)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };
type QuoRow = { id: number; code: string; created_at: string };

// มีเงินเข้าแล้ว (มัดจำ/ชำระบางส่วน/ครบ) ควรชนะใบที่ยังไม่จ่าย
const billRank = (status?: string) => (status === "paid" || status === "partial") ? 2 : 1;

/**
 * คืนใบเสนอราคาที่ควรใช้ของงาน (id, code) หรือ null ถ้างานไม่มีใบเสนอเลย
 * ⚠ ใช้ร่วม cover-sheets GET + generate (ต้องเลือกใบเดียวกันเสมอ)
 */
export async function pickJobQuotation(sb: AnySb, jobId: string): Promise<{ id: number; code: string } | null> {
  const { data: quos } = await sb
    .from("quotations")
    .select("id, code, created_at")
    .eq("job_id", jobId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  const list = (quos ?? []) as QuoRow[];
  if (list.length === 0) return null;
  if (list.length === 1) return { id: list[0].id, code: list[0].code };

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
    if (q) return { id: q.id, code: q.code };
  }

  // ไม่มีใบวางบิลเลย → ใบเสนอล่าสุด (เหมือนเดิม)
  return { id: list[0].id, code: list[0].code };
}
