import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewReceiptClient, { type BillingNoteOption } from "./NewReceiptClient";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/receipts");

  const supabase = createClient();
  // ดึงใบวางบิลที่ยังไม่ชำระครบ (unpaid / partial) + งวดชำระ + vat ของ "ใบวางบิล" (fallback งาน)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("billing_notes")
    .select("id, code, customer_snapshot, total, status, job_id, vat_rate, has_tax_breakdown, jobs(vat_rate), billing_installments(id, seq, label, amount, paid_amount, status, sort_order)")
    .in("status", ["unpaid", "partial"])
    .order("created_at", { ascending: false });

  // vat_rate ที่โชว์/ใช้ = ของใบวางบิลใบนั้น (ผู้ใช้กด "แก้ VAT/ส่วนลด" ที่ใบวางบิล = แหล่งความจริง)
  // ใบเก่า/ใบนำเข้า (has_tax_breakdown=false) → fallback jobs.vat_rate (พฤติกรรมเดิม) · ต้องตรงกับ POST /api/receipts
  const notes = ((data ?? []) as (BillingNoteOption & { jobs?: { vat_rate?: number } | null; vat_rate?: number | null; has_tax_breakdown?: boolean | null })[]).map((n) => ({
    ...n,
    job_vat_rate: (n.has_tax_breakdown ? Number(n.vat_rate) || 0 : Number(n.jobs?.vat_rate ?? 7)) as 0 | 7,
    billing_installments: (n.billing_installments ?? []).slice().sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
  }));

  return <NewReceiptClient notes={notes} />;
}
