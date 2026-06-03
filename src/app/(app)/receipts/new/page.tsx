import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewReceiptClient, { type BillingNoteOption } from "./NewReceiptClient";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/receipts");

  const supabase = createClient();
  // ดึงใบวางบิลที่ยังไม่ชำระครบ (unpaid / partial) + งวดชำระ
  const { data } = await supabase
    .from("billing_notes")
    .select("id, code, customer_snapshot, total, status, billing_installments(id, seq, label, amount, status, sort_order)")
    .in("status", ["unpaid", "partial"])
    .order("created_at", { ascending: false });

  const notes = ((data ?? []) as BillingNoteOption[]).map((n) => ({
    ...n,
    billing_installments: (n.billing_installments ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }));

  return <NewReceiptClient notes={notes} />;
}
