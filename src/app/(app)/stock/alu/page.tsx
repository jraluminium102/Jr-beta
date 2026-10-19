import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import StoreAluClient from "./StoreAluClient";

export const dynamic = "force-dynamic";

const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING", "STORE"];

/**
 * สโตร์อลู (เจ้าของสั่ง 19 ต.ค.69) — "สโตร์เปลี่ยนจากคนพิมพ์เป็นคนตรวจ"
 *   เห็นเฉพาะหมวดอลู: ใบที่ช่างเบิกวันนี้ (ตรวจแล้ว/แก้/คืน/ยกเลิก) · นับเฉพาะที่เคลื่อนไหว · ใกล้หมด · เบิกแทนช่าง
 *   ไม่มีราคาในหน้านี้ (role สโตร์ตาบอดราคาอยู่แล้ว)
 */
export default async function StoreAluPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const role = profile.role ?? "";
  if (!can(role, "stock", "read")) redirect("/stock");
  return <StoreAluClient canWrite={STORE_WRITE.includes(role)} myName={profile.full_name ?? ""} />;
}
