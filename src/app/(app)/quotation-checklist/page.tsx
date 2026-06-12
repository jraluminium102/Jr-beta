import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import QuotationChecklistClient from "./QuotationChecklistClient";

export const dynamic = "force-dynamic";

export default async function QuotationChecklistPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!can(profile.role as Role, "jobs", "read")) redirect("/");

  return <QuotationChecklistClient />;
}
