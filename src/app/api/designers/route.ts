import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/designers — list active designers (used by board dropdown)
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "designer", "read")) return FORBIDDEN();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("designers")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) return fail(error.message, 500);

  return ok({ designers: data ?? [] });
}

const createSchema = z.object({
  name: z.string().min(1, "กรุณาระบุชื่อผู้ออกแบบ").max(80),
});

// POST /api/designers — add a new designer (requires designer write permission)
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role, "designer", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.errors[0]?.message ?? "ข้อมูลไม่ถูกต้อง");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("designers")
    .insert({ name: parsed.data.name, active: true })
    .select("id, name")
    .single();

  if (error) {
    // unique constraint → duplicate name
    if (error.code === "23505") return fail("ชื่อผู้ออกแบบนี้มีอยู่แล้ว", 409);
    return fail(error.message, 500);
  }

  return ok({ designer: data }, 201);
}
