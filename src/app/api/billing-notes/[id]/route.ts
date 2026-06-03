import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";

// GET /api/billing-notes/[id]  → ใบวางบิล + งวดชำระ
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_notes")
    .select("*, billing_installments(*)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "billing_installments", ascending: true })
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}
