import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import ChecklistView from "./ChecklistView";

export const dynamic = "force-dynamic";

export default async function ChecklistPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const role = profile.role as Role;
  if (!can(role, "checklists", "read")) redirect(`/production-orders/${params.id}`);

  const canCheck = can(role, "checklists", "write");
  return <ChecklistView orderId={params.id} canCheck={canCheck} role={role} />;
}
