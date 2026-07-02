import { createClient } from "@/lib/supabase/server";
import Calculator40Client from "@/components/Calculator40Client";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

// เครื่องคิดราคา 4.0 (ต้นทุนจริง) — แยกเอกเทศจาก /calculator (R3.9) เดิม
// ดึงลูกค้าจากทะเบียนมาให้ผูก (เฟส B: ออกใบเสนอราคาจริง) — เหมือนเครื่องคิดราคาเดิม
export default async function Calculator40Page() {
  const supabase = createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, job, phone, address, contact_person")
    .eq("is_active", true)
    .order("name");
  return (
    <Calculator40Client
      customers={
        (data ?? []) as Pick<Customer, "id" | "name" | "job" | "phone" | "address" | "contact_person">[]
      }
    />
  );
}
