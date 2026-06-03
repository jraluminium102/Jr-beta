import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { QuotationStatus } from "@/lib/types";

const VALID: QuotationStatus[] = ["draft", "sent", "approved", "cancelled"];

// PATCH /api/quotations/[id]/status  { status }
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const status = body.status as QuotationStatus;
  if (!VALID.includes(status)) return fail("สถานะไม่ถูกต้อง");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("quotations")
    .update({ status })
    .eq("id", params.id)
    .select("id, status")
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
