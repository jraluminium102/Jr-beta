import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import BoqTabs from "@/components/cutlist/BoqTabs";

export const dynamic = "force-dynamic";

// BOQ / สโตร์ — เมนูเดียว 2 แท็บ (เจ้าของเคาะ 23 ก.ค.69):
//   ?tab=daily (ปริยาย) ความเคลื่อนไหวรายวัน (เบิก+รับเข้า)  ·  ?tab=cutlist จัดการ+สร้างใบตัด
export default async function CutlistPage({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await getProfile();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as unknown as { from: (t: string) => any };

  const [{ data: rows }, { data: jobs }] = await Promise.all([
    sb.from("cutlists")
      .select("id, code, name, status, job_id, created_at, stock_cut_at, jobs:job_id(job_code, customer_name)")
      .order("created_at", { ascending: false })
      .limit(200),
    // งานให้เลือกผูก — งานที่ยังไม่ปิด/ยกเลิก ล่าสุดก่อน
    sb.from("jobs")
      .select("id, job_code, customer_name")
      .not("status", "in", "(COMPLETED,CANCELLED)")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const canWrite = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"].includes(profile?.role ?? "");
  const initialTab = searchParams.tab === "cutlist" ? "cutlist" : "daily";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <BoqTabs rows={(rows ?? []) as any} jobs={(jobs ?? []) as any} canWrite={canWrite} initialTab={initialTab} />;
}
