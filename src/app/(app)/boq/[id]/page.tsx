import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import BoqEditor, { type BoqHeader, type BoqItem } from "@/components/boq/BoqEditor";

export const dynamic = "force-dynamic";

export default async function BoqDetailPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();

  const { data } = await supabase
    .from("boqs")
    .select("*, boq_items(*), job:job_id(job_code)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "boq_items", ascending: true })
    .single();
  if (!data) notFound();

  const boq = data as unknown as BoqHeader & { boq_items: BoqItem[]; job: { job_code: string } | null };
  const items = (boq.boq_items ?? []).slice();

  const header: BoqHeader = {
    id: boq.id,
    code: boq.code,
    status: boq.status,
    note: boq.note,
    customer_snapshot: boq.customer_snapshot,
    job_code: boq.job?.job_code ?? null,
  };

  return (
    <BoqEditor
      header={header}
      initialItems={items}
      writable={can(profile!.role, "boq", "write")}
    />
  );
}
