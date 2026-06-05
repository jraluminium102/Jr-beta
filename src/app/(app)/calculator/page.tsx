import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import CalculatorClient from "@/components/CalculatorClient";

export const dynamic = "force-dynamic";

// หน้าคิดราคา — ดึงลูกค้าจากทะเบียนมาให้เลือก (ผูก customer_id เข้าใบเสนอราคา)
export default async function CalculatorPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, job")
    .eq("is_active", true)
    .order("name");

  return <CalculatorClient customers={(data ?? []) as Pick<Customer, "id" | "name" | "job">[]} />;
}
