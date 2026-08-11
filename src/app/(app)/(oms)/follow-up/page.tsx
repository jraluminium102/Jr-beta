// Server component wrapper — อ่าน role แล้วส่ง props ให้ client
// /follow-up รวม: ปิดการขาย + ผลิต + ติดตั้ง (3 แท็บ)
export const dynamic = "force-dynamic";

import { getProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/database.types";
import FollowUpHubClient from "./FollowUpHubClient";

export default async function FollowUpPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const role = profile.role as Role;

  return (
    <FollowUpHubClient
      isSales={role === "SALES"}
    />
  );
}
