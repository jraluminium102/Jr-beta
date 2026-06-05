import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import DesignerBoard from "@/components/designer/DesignerBoard";

export const dynamic = "force-dynamic";

export type DesignerOption = { id: string; full_name: string };

export default async function DesignerPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!can(profile.role, "designer", "read")) redirect("/dashboard");

  const supabase = createClient();
  // รายชื่อผู้ออกแบบ (ใช้ทำ filter dropdown บน board)
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "DESIGNER")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  const rows = (data ?? []) as { id: string; full_name: string | null }[];
  const designers: DesignerOption[] = rows.map((d) => ({
    id: d.id,
    full_name: d.full_name ?? "(ไม่มีชื่อ)",
  }));

  return <DesignerBoard designers={designers} canWrite={canWrite(profile.role) && can(profile.role, "designer", "write")} />;
}
