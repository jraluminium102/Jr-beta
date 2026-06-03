import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CustomersClient from "./CustomersClient";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const profile = await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return <CustomersClient initial={(data ?? []) as Customer[]} canWrite={canWrite(profile?.role)} />;
}
