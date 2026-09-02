import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import NewStandaloneReceiptClient from "./NewStandaloneReceiptClient";

export const dynamic = "force-dynamic";

// ออกใบเสร็จ/ใบกำกับภาษี "สร้างใหม่" — กรอกหัวบิลเอง ไม่ผูกงาน/ใบเสนอ (doc_kind='standalone')
//   สิทธิ์ finance:write (ADMIN/ACCOUNTING) เท่านั้น — ตรงกับ API /api/receipts/standalone
export default async function NewStandaloneReceiptPage() {
  const profile = await getProfile();
  if (!profile || !can(profile.role as Role, "finance", "write")) redirect("/receipts");
  return <NewStandaloneReceiptClient />;
}
