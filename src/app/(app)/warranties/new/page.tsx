import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewWarrantyClient from "./NewWarrantyClient";

export const dynamic = "force-dynamic";

export default async function NewWarrantyPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/warranties");

  const supabase = createClient();
  const { data } = await supabase
    .from("quotations")
    .select("id, code, customer_snapshot")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const quotations = (data ?? []) as {
    id: number; code: string; customer_snapshot: { name: string; job: string };
  }[];

  return <NewWarrantyClient quotations={quotations} />;
}
