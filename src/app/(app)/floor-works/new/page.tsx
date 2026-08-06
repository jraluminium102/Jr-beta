import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import Icon from "@/components/Icon";
import FloorEditor from "@/components/floor/FloorEditor";

export const dynamic = "force-dynamic";

/** ดึงงานที่ "JR รับทำพื้น" มาให้เลือกผูก (floor_work = 'jr') — ไม่ผูกก็ได้ พิมพ์ชื่อเองได้ */
export async function loadFloorJobs() {
  const supabase = createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, job_code, customer_name, floor_note")
    .eq("floor_work", "jr")
    .order("created_at", { ascending: false })
    .limit(500);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any[];
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
