// Server component wrapper — อ่าน role แล้วส่ง isSales ให้ client
// SALES จะเห็นเฉพาะงานตัวเอง (privacy ข้อมูลลูกค้าคนอื่น)
export const dynamic = "force-dynamic";

import { getProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import FollowUpClient from "./FollowUpClient";

export default async function FollowUpPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return <FollowUpClient isSales={profile.role === "SALES"} />;
}
