import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewBillingClient from "./NewBillingClient";

export const dynamic = "force-dynamic";

export type ApprovedQuotation = {
  id: number;
  code: string;
  net: number;
  customer_snapshot: { name: string; job: string };
};

export default async function NewBillingNotePage({
  searchParams,
}: {
  searchParams: { quotation?: string };
}) {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/billing-notes");

  const supabase = createClient();
  const { data } = await supabase
    .from("quotations")
    .select("id, code, net, customer_snapshot")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const list = (data ?? []) as ApprovedQuotation[];
  const raw = Number(searchParams.quotation);
  const preselectId = list.some((q) => q.id === raw) ? raw : null;

  return <NewBillingClient quotations={list} preselectId={preselectId} />;
}
