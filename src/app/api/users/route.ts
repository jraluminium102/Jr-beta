import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

// GET /api/users — admin: รายชื่อผู้ใช้ + role
export const GET = withRoute(async () => {
  const ctx = await requirePermission("users", "read");
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, is_active, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ok(data ?? []);
});
