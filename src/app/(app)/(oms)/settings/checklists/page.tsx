import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import ChecklistAdmin from "./ChecklistAdmin";

export const dynamic = "force-dynamic";

export default async function ChecklistSettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const role = profile.role as Role;
  if (!can(role, "checklists", "read")) redirect("/settings");

  const isAdmin = role === "ADMIN";
  return <ChecklistAdmin isAdmin={isAdmin} />;
}
