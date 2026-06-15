import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

export const dynamic = "force-dynamic";

// GET /api/measurers — รายชื่อช่างที่วัดได้ (PRODUCTION + ADMIN role)
// ใช้ใน ProductionStepModal dropdown เลือกช่างวัดหน้างาน
// สิทธิ์ production:read (ช่างผลิตดูได้)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");

  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["PRODUCTION", "ADMIN"])
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);

  return ok(
    (data ?? []).map((p) => ({ id: p.id, full_name: p.full_name ?? p.id }))
  );
});
