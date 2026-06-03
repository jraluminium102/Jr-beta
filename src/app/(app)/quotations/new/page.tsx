import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import QuotationForm from "@/components/QuotationForm";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/quotations");

  const supabase = createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, job")
    .eq("is_active", true)
    .order("name");

  return <QuotationForm customers={(data ?? []) as Pick<Customer, "id" | "name" | "job">[]} />;
}
