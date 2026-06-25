import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

export const dynamic = "force-dynamic";

// GET /api/production-sets/glass-specs — รายการสเปคกระจกที่เคยบันทึก (distinct) สำหรับเลือกจากประวัติ
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as { from: (t: string) => any };
  const { data, error } = await sb
    .from("production_sets")
    .select("glass_spec")
    .neq("glass_spec", "")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  // distinct + คงลำดับ (ล่าสุดก่อน)
  const seen = new Set<string>();
  const specs: string[] = [];
  for (const r of (data ?? []) as { glass_spec: string | null }[]) {
    const v = (r.glass_spec ?? "").trim();
    if (v && !seen.has(v)) { seen.add(v); specs.push(v); }
  }
  return ok(specs.slice(0, 50));
});
