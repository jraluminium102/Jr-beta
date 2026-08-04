import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import NewFeeClient from "./NewFeeClient";

export const dynamic = "force-dynamic";

// ออกใบวางบิล/ใบเสร็จ "ค่าประเมินหน้างาน" — เอกสารอิสระ ไม่ผูกใบเสนอราคา (แนว A เจ้าของ+accountant เคาะ)
export default async function NewFeePage() {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/billing-notes");

  return <NewFeeClient />;
}
