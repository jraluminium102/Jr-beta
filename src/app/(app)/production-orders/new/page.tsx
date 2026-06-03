import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewProductionClient from "./NewProductionClient";

export const dynamic = "force-dynamic";

export default async function NewProductionOrderPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/production-orders");

  const supabase = createClient();
  const { data } = await supabase
    .from("quotations")
    .select("id, code, customer_snapshot")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const quotations = (data ?? []) as {
    id: number; code: string; customer_snapshot: { name: string; job: string };
  }[];

  return <NewProductionClient quotations={quotations} />;
}
