import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// GET /api/finance/outstanding — ลูกหนี้: งานที่ยอดรวม > เงินที่รับแล้ว
// [HIGH-1] คำนวณค้างรับโดย scope ตรงกัน:
//   - งานที่มีบิล active → base = Σ(billing_note.total); paid = Σ(finance_entries ที่ผูก installment ของบิล active เหล่านั้น เท่านั้น)
//   - งานที่ไม่มีบิล active → base = jobs.total_amount; paid = Σ(finance_entries ไม่ void ทั้งหมดของ job)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("finance", "read");

  // ดึง jobs พร้อม billing_notes (active) + installments + finance_entries ที่ผูก installment
  const { data, error } = await ctx.supabase
    .from("jobs")
    .select(`
      id, job_code, customer_name, total_amount, status,
      billing_notes!billing_notes_job_id_fkey(
        id, total, status,
        billing_installments(
          id,
          finance_entries(amount, is_voided, is_auto_created)
        )
      ),
      finance_entries(amount, is_voided, billing_installment_id)
    `)
    .in("status", ["DEPOSITED", "COMPLETED"]);
  // หมายเหตุ: ไม่กรอง total_amount null — งานที่ยอดอยู่บนใบวางบิล (job.total_amount ว่าง)
  // ต้องนับด้วย โดยใช้ billingTotal เป็นฐาน (ดู logic ด้านล่าง)
  if (error) throw new Error(error.message);

  type InstRow = {
    id: number;
    finance_entries: { amount: number; is_voided: boolean; is_auto_created: boolean }[];
  };
  type BnRow = { id: number; total: number; status: string; billing_installments: InstRow[] };
  type FeRow = { amount: number; is_voided: boolean; billing_installment_id: number | null };
  type JobRow = {
    id: string;
    job_code: string | null;
    customer_name: string;
    total_amount: number | null;
    status: string;
    billing_notes: BnRow[];
    finance_entries: FeRow[];
  };

  const rows = (data as JobRow[] ?? [])
    .map((j) => {
      const jobTotal = Number(j.total_amount ?? 0);

      // billing_notes active (status != 'cancelled')
      const activeBns = (j.billing_notes ?? []).filter((bn) => bn.status !== "cancelled");
      const billingTotal = activeBns.reduce((s, bn) => s + Number(bn.total), 0);

      let base: number;
      let paid: number;

      if (activeBns.length > 0) {
        // [HIGH-1] scope ตรงกัน: paid มาจาก finance_entries ที่ผูกกับ installment ของ active bns เท่านั้น
        base = billingTotal;
        paid = 0;
        for (const bn of activeBns) {
          for (const inst of bn.billing_installments ?? []) {
            const instEntries = inst.finance_entries ?? [];
            // เอาเฉพาะ entry ที่ไม่ void (is_voided=false)
            for (const fe of instEntries) {
              if (!fe.is_voided) paid += Number(fe.amount) || 0;
            }
          }
        }
        paid = round2(paid);
      } else {
        // ไม่มีบิล active → ใช้ jobs.total_amount − Σ(finance_entries ไม่ void ทั้งหมดของ job)
        base = jobTotal;
        const allEntries = j.finance_entries ?? [];
        paid = round2(
          allEntries
            .filter((e) => !e.is_voided)
            .reduce((s, e) => s + (Number(e.amount) || 0), 0),
        );
      }

      // ยังกรอกยอดไม่ครบ/คำนวณค้างรับไม่ได้ → อย่าตัดทิ้งเงียบ (กันลูกหนี้หาย) ครอบ 2 ร่อง:
      //  (1) total ว่าง + ไม่มีบิล   (2) ฐานยอด ≤ 0 ทั้งที่รับเงินมาแล้ว (เปิดบิล total=0 + มีมัดจำ)
      const needsAmount = (j.total_amount == null && activeBns.length === 0) || (base <= 0 && paid > 0);
      const outstanding = needsAmount ? 0 : round2(base - paid);

      return {
        job_id: j.id,
        job_code: j.job_code,
        customer_name: j.customer_name,
        total: needsAmount ? null : base,
        paid,
        outstanding,
        status: j.status,
        has_billing: activeBns.length > 0,
        needs_amount: needsAmount,   // งานมัดจำแล้วแต่ยังไม่กรอกยอด — ต้องเตือนให้กรอก
      };
    })
    // โชว์ทั้งงานที่ค้างจริง + งานที่ยังไม่กรอกยอด (กันลูกหนี้หาย)
    .filter((r) => r.outstanding > 0 || r.needs_amount)
    .sort((a, b) => Number(b.needs_amount) - Number(a.needs_amount) || b.outstanding - a.outstanding);

  const totalOutstanding = round2(rows.reduce((s, r) => s + r.outstanding, 0));
  return ok(rows, { total_outstanding: totalOutstanding, can_write: can(ctx.role, "finance", "write") });
});
