import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import DesignerBoard from "@/components/designer/DesignerBoard";

export const dynamic = "force-dynamic";

// Designer option sourced from designers lookup table (not profiles)
export type DesignerOption = { id: number; name: string };

export default async function DesignerPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!can(profile.role, "designer", "read")) redirect("/dashboard");

  const supabase = createClient();
  // Pull from designers lookup table (not profiles — designer_id is empty on most rows)
  const { data } = await supabase
    .from("designers")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });

  const designers: DesignerOption[] = (data ?? []) as DesignerOption[];

  return <DesignerBoard designers={designers} canWrite={can(profile.role, "designer", "write")} />;
}
