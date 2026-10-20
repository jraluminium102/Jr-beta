import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

export const dynamic = "force-dynamic";

/**
 * เฟบหน้าตัดอลู (0160) — ชุดเดียวกันทุกเครื่อง/ทุกคนในสโตร์
 * GET  /api/alu-picks/favorites            → string[] (pkey)
 * POST /api/alu-picks/favorites {pkey, on} → เพิ่ม/เอาออก
 * ยังไม่รัน 0160 → GET คืน [] + meta.missing=true (หน้าใช้ localStorage แทนชั่วคราว)
 */
export const GET = withRoute(async () => {
  const ctx = await requirePermission("stock", "read");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (ctx.supabase as any).from("alu_favorites").select("pkey");
  if (error) return ok([], { missing: true });
  return ok(((data ?? []) as { pkey: string }[]).map((r) => r.pkey));
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "write");
  const b = await req.json().catch(() => ({}));
  const pkey = String(b?.pkey ?? "").trim().slice(0, 200);
  if (!pkey) return err("ไม่มีคีย์หน้าตัด", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { error } = b?.on === false
    ? await sb.from("alu_favorites").delete().eq("pkey", pkey)
    : await sb.from("alu_favorites").upsert({ pkey, created_by: ctx.user.id }, { onConflict: "pkey" });
  if (error) {
    if (/alu_favorites|does not exist|42P01/i.test(error.message ?? "")) return err("ยังไม่ได้รัน migration 0160 (เฟบหน้าตัด) — รันก่อนใช้งาน", 400, { missing: true });
    return err(error.message, 500);
  }
  return ok({ pkey, on: b?.on !== false });
});
