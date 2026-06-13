import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewReceiptClient, { type BillingNoteOption } from "./NewReceiptClient";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/receipts");

  const supabase = createClient();
  // ดึงใบวางบิลที่ยังไม่ชำระครบ (unpaid / partial) + งวดชำระ + vat_rate จากงาน
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("billing_notes")
    .select("id, code, customer_snapshot, total, status, job_id, jobs(vat_rate), billing_installments(id, seq, label, amount, paid_amount, status, sort_order)")
    .in("status", ["unpaid", "partial"])
    .order("created_at", { ascending: false });

  const notes = ((data ?? []) as (BillingNoteOption & { jobs?: { vat_rate?: number } | null })[]).map((n) => ({
    ...n,
    job_vat_rate: Number(n.jobs?.vat_rate ?? 7) as 0 | 7,
    billing_installments: (n.billing_installments ?? []).slice().sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
  }));

  return <NewReceiptClient notes={notes} />;
}
