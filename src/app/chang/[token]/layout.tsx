import { notFound } from "next/navigation";
import { getChangToken } from "@/lib/chang-token";
import ChangGate from "@/components/chang/ChangGate";

/**
 * ทุกหน้าใต้ลิงก์ช่าง (ตารางผลิต · เบิกอลู · ใบตัด) ต้องล็อกอินด้วยรหัสพนักงานก่อน (0161 · เจ้าของสั่ง 21 ต.ค.69)
 *   ตรวจโทเคนที่นี่ด้วย — โทเคนผิดต้องไม่เห็นฟอร์มล็อกอิน (แต่ละหน้ายังตรวจซ้ำเหมือนเดิม)
 */
export const dynamic = "force-dynamic";

export default async function ChangLayout({ children, params }: { children: React.ReactNode; params: { token: string } }) {
  const expected = await getChangToken();
  if (!expected || params.token !== expected) notFound();
  return <ChangGate>{children}</ChangGate>;
}
