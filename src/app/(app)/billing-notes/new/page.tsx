import { redirect } from "next/navigation";
import { getProfile, canWrite } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NewBillingClient from "./NewBillingClient";

export const dynamic = "force-dynamic";

// ใบเสนอราคาที่สร้างบิลได้ (ไม่ cancelled, ยังไม่มีบิล active)
export type AvailableQuotation = {
  id: number;
  code: string;
  status: string;
  net: number;
  customer_snapshot: { name: string; job: string };
};

export default async function NewBillingNotePage({
  searchParams,
}: {
  searchParams: { quotation?: string };
}) {
  const profile = await getProfile();
  if (!canWrite(profile?.role)) redirect("/billing-notes");

  const supabase = createClient();

  // ดึงใบเสนอทุกสถานะที่ไม่ cancelled
  const { data: allQ } = await supabase
    .from("quotations")
    .select("id, code, status, net, customer_snapshot")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  const quotations = (allQ ?? []) as AvailableQuotation[];

  // ดึง quotation_id ที่มีบิล active (ไม่ cancelled) อยู่แล้ว — เพื่อกรองออก
  const { data: activeBillQ } = await supabase
    .from("billing_notes")
    .select("quotation_id")
    .neq("status", "cancelled")
    .not("quotation_id", "is", null);

  const usedIds = new Set(
    ((activeBillQ ?? []) as { quotation_id: number | null }[])
      .map((r) => r.quotation_id)
      .filter((id): id is number => id !== null)
  );

  // กรองเฉพาะใบที่ยังไม่มีบิล active
  const available = quotations.filter((q) => !usedIds.has(q.id));

  const raw = Number(searchParams.quotation);
  const preselectId = available.some((q) => q.id === raw) ? raw : null;

  return <NewBillingClient quotations={available} preselectId={preselectId} />;
}
