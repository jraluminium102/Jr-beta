import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import StockClient from "./StockClient";
import type { StockItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const profile = await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("stock_items")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return <StockClient initial={(data ?? []) as StockItem[]} canWrite={canWrite(profile?.role)} />;
}
