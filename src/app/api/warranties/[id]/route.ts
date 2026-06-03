import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";

// GET /api/warranties/[id]  → ใบรับประกันเดี่ยว
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("warranties")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}
