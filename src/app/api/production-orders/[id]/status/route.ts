import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { ProductionStatus } from "@/lib/types";

const VALID: ProductionStatus[] = [
  "queued", "measuring", "manufacturing", "qc", "ready", "installed", "done", "cancelled",
];

// PATCH /api/production-orders/[id]/status  { status }
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const status = body.status as ProductionStatus;
  if (!VALID.includes(status)) return fail("สถานะไม่ถูกต้อง");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("production_orders")
    .update({ status })
    .eq("id", params.id)
    .select("id, status")
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
