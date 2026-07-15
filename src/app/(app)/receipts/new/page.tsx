import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewReceiptClient, { type BillingNoteOption } from "./NewReceiptClient";
import { effectiveBillVat, type BillVatSource } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/receipts");

  const supabase = createClient();
  // ดึงใบวางบิลที่ยังไม่ชำระครบ (unpaid / partial) + งวดชำระ + vat ของ "ใบวางบิล" (fallback งาน)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("billing_notes")
    .select("id, code, customer_snapshot, total, status, job_id, vat_rate, vat_rate_set, wht_rate, jobs(vat_rate), billing_installments(id, seq, label, amount, paid_amount, status, sort_order)")
    .in("status", ["unpaid", "partial"])
    .order("created_at", { ascending: false });

  // vat ที่โชว์บนจอ = effectiveBillVat ตัวเดียวกับ POST /api/receipts (ห้ามคิดเอง — จอกับใบจริงต้องตรงกัน)
  const notes = ((data ?? []) as (BillingNoteOption & BillVatSource & { jobs?: { vat_rate?: number } | null; wht_rate?: number | null })[]).map((n) => ({
    ...n,
    job_vat_rate: effectiveBillVat(n, Number(n.jobs?.vat_rate ?? 7)) as 0 | 7,
    bill_wht_rate: Number(n.wht_rate) || 0, // ใบที่มีหัก ณ ที่จ่าย → จอต้อง gross-up เหมือน server
    billing_installments: (n.billing_installments ?? []).slice().sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
  }));

  return <NewReceiptClient notes={notes} />;
}
