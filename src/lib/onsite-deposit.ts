// ============================================================
// ตั้งธง "มัดจำหน้างาน" (jobs.onsite_deposit · 0044) จากทุกทางที่บันทึกเงินมัดจำ
// บัญชีใช้นับต่อเซลล์ว่าได้มัดจำหน้างานกี่งาน
//
// ใช้ service client เพราะ RLS jobs_update = ADMIN/SALES/DESIGNER เท่านั้น
// แต่คนรับเงิน (ACCOUNTING) ก็ต้องติ๊กได้ — เรียกหลัง route ตรวจสิทธิ์ finance:write แล้วเท่านั้น
// ล้มเหลว = log + ไม่ throw (ห้ามทำให้การชำระพัง)
// ============================================================
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * @param markQuoteSent ติ๊กจากทางที่ "มีใบเสนอ/บิลแล้วแน่ ๆ" (บันทึกชำระบิล · ใบเสร็จ) → ถ้า jobs.quote_sent_date ยังว่างให้ตั้งเป็นวันนี้ด้วย
 *   เหตุผล: เช็คลิสต์ใบเสนอมีข้อยกเว้น 0044 "onsite_deposit และยังไม่ส่งใบ → ดึงงานกลับเข้าเช็คลิสต์" ถ้าติ๊กจากบิลโดยไม่ตั้งวันส่ง งานที่จบแล้วจะโผล่ในเช็คลิสต์
 *   ทางที่ยังไม่แน่ว่ามีใบเสนอ (โมดัลรับเงิน/ใส่ยอดย้อนหลัง) ไม่ตั้ง — ให้เช็คลิสต์ทำงานตามเดิม
 */
export async function setJobOnsiteDeposit(jobId: string | null | undefined, value: unknown, markQuoteSent = false): Promise<void> {
  if (!jobId || typeof value !== "boolean") return; // ไม่ส่งมา = ไม่แตะ (พฤติกรรมเดิม)
  try {
    // Supabase generic เข้มเกินจริง (ตามที่ route อื่นทำ) → cast any แค่จุดนี้
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServiceClient() as any;
    const { error } = await sb.from("jobs").update({ onsite_deposit: value }).eq("id", jobId);
    if (error) console.error("[onsite_deposit] update failed:", jobId, error.message);
    if (!error && value && markQuoteSent) {
      const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      const { error: e2 } = await sb.from("jobs").update({ quote_sent_date: today }).eq("id", jobId).is("quote_sent_date", null);
      if (e2) console.error("[onsite_deposit] set quote_sent_date failed:", jobId, e2.message);
    }
  } catch (e) {
    console.error("[onsite_deposit] update threw:", jobId, e instanceof Error ? e.message : e);
  }
}
