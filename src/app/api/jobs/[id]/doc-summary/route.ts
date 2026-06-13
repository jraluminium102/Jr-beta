import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ── types (local to this route, untyped tables) ───────────────────────────────

type QuotationRow = {
  id: number;
  code: string;
  status: string;
  net: number;
  vat_rate: number;
};

type InstallmentRow = {
  id: number;
  status: string;
  amount: number;
  paid_amount: number | null;
};

type BillingRow = {
  id: number;
  code: string;
  status: string;
  total: number;
  billing_installments: InstallmentRow[];
};

type ReceiptRow = {
  id: number;
  code: string;
  net: number;
  issue_date: string | null;
  is_voided: boolean;
  billing_note_id: number;
};

// ── GET /api/jobs/[id]/doc-summary ───────────────────────────────────────────
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  await requirePermission("jobs", "read");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any;
  const jobId = params.id;

  // 1) ตรวจว่างานมีอยู่ + ดึง vat_rate
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("id, vat_rate")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) return notFound("ไม่พบงาน");

  const vatRate: number = Number(job.vat_rate ?? 7);

  // 2) ใบเสนอราคา active ล่าสุด (status != cancelled)
  const { data: quotationRows, error: qErr } = await sb
    .from("quotations")
    .select("id, code, status, net, vat_rate")
    .eq("job_id", jobId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1);
  if (qErr) return notFound("ดึงใบเสนอราคาไม่สำเร็จ");

  const quotation: QuotationRow | null =
    Array.isArray(quotationRows) && quotationRows.length > 0 ? quotationRows[0] : null;

  // 3) ใบวางบิล ของ job นี้ (status != cancelled) + งวดชำระ
  const { data: billingRows, error: bnErr } = await sb
    .from("billing_notes")
    .select("id, code, status, total, billing_installments(id, status, amount, paid_amount)")
    .eq("job_id", jobId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  if (bnErr) return notFound("ดึงใบวางบิลไม่สำเร็จ");

  const billings: BillingRow[] = Array.isArray(billingRows) ? billingRows : [];

  // คำนวณ paid / installmentCount / paidCount ต่อบิล
  const billingSummary = billings.map((bn) => {
    const insts: InstallmentRow[] = Array.isArray(bn.billing_installments)
      ? bn.billing_installments
      : [];
    const installmentCount = insts.length;
    const paidCount = insts.filter((i) => i.status === "paid").length;
    const paid = insts.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);
    return {
      id: bn.id,
      code: bn.code,
      status: bn.status,
      total: Number(bn.total),
      paid,
      installmentCount,
      paidCount,
    };
  });

  // 4) ใบเสร็จ — ผ่าน billing_notes ของงานนี้
  const billingIds = billings.map((bn) => bn.id);
  let receipts: Array<{ id: number; code: string; net: number; issue_date: string | null; is_voided: boolean }> = [];
  if (billingIds.length > 0) {
    const { data: receiptRows, error: rcErr } = await sb
      .from("receipts")
      .select("id, code, net, issue_date, is_voided, billing_note_id")
      .in("billing_note_id", billingIds)
      .order("issue_date", { ascending: false });
    if (!rcErr && Array.isArray(receiptRows)) {
      receipts = (receiptRows as ReceiptRow[]).map((r) => ({
        id: r.id,
        code: r.code,
        net: Number(r.net),
        issue_date: r.issue_date,
        is_voided: Boolean(r.is_voided),
      }));
    }
  }

  return ok({
    vat_rate: vatRate,
    quotation: quotation
      ? {
          id: quotation.id,
          code: quotation.code,
          status: quotation.status,
          net: Number(quotation.net),
          vat_rate: Number(quotation.vat_rate),
        }
      : null,
    billings: billingSummary,
    receipts,
  });
});
