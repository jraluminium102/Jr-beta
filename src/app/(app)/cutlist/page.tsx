import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import CutlistListClient from "@/components/cutlist/CutlistListClient";

export const dynamic = "force-dynamic";

// ใบตัด / BOQ — หน้ารายการ: ใบตัดทั้งหมด + สร้างใหม่ (จากงานลูกค้า ดึงใบเสนอ / ใบเปล่ากรอกมือ)
export default async function CutlistPage() {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <CutlistListClient rows={(rows ?? []) as any} jobs={(jobs ?? []) as any} canWrite={canWrite} />;
}
