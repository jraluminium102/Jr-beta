import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import Icon from "@/components/Icon";
import FloorEditor from "@/components/floor/FloorEditor";

export const dynamic = "force-dynamic";

/**
 * ดึงงานที่ "JR รับทำพื้น" มาให้เลือกผูก (floor_work = 'jr') — ไม่ผูกก็ได้ พิมพ์ชื่อเองได้
 *
 * ดึง ชื่อ/ที่อยู่/เบอร์ มาด้วย เพื่อเติมหัวใบให้อัตโนมัติตอนเลือกงาน (เจ้าของสั่ง 6 ส.ค.69)
 *   · เบอร์ใช้ jobs.customer_tel (เบอร์ที่ใช้จริงกับงานนั้น) · ไม่มีค่อยถอยไปใช้ของทะเบียน
 *   · ที่อยู่มีเฉพาะในทะเบียนลูกค้า → join ผ่าน customer_id (งานที่ยังไม่ผูกทะเบียนจะไม่มีที่อยู่)
 */
export async function loadFloorJobs() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_code, customer_name, customer_tel, floor_note, customers(name, address, phone)")
    .eq("floor_work", "jr")
    .order("created_at", { ascending: false })
    .limit(500);

  // กันพัง: ถ้า join ทะเบียนไม่ได้ (schema ต่าง) → เอาเท่าที่ได้ ไม่ให้ทั้งหน้าล้ม
  if (error) {
    const { data: plain } = await supabase
      .from("jobs")
      .select("id, job_code, customer_name, customer_tel, floor_note")
      .eq("floor_work", "jr")
      .order("created_at", { ascending: false })
      .limit(500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (plain ?? []) as any[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((j) => {
    const c = Array.isArray(j.customers) ? j.customers[0] : j.customers;
    return {
      id: j.id,
      job_code: j.job_code,
      customer_name: j.customer_name ?? c?.name ?? "",
      address: c?.address ?? "",
      phone: j.customer_tel || c?.phone || "",
      floor_note: j.floor_note ?? null,
    };
  });
}

export default async function NewFloorWorkPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!canWrite(profile.role)) redirect("/floor-works");

  const jobs = await loadFloorJobs();

  return (
    <div className="space-y-4">
      <Link href="/floor-works" className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
        <Icon name="arrowLeft" size={16} /> กลับ
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-ink">คิดราคางานพื้น</h1>
        <p className="text-sm text-ink-3">กรอกขนาดพื้นที่ → ระบบคิดเข็ม/คานให้ → แก้รายการ/เพิ่มเอง → บันทึก</p>
      </div>
      <FloorEditor mode="create" jobs={jobs} />
    </div>
  );
}
