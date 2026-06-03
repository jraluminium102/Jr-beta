import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";

// GET /api/quotations/[id]  → ใบเสนอ + รายการ
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "quotation_items", ascending: true })
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}
