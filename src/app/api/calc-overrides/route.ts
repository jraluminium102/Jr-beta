import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { buildPriceOverride, applyPriceOverride, type StockRow } from "@/lib/calculator40/stock-link";
import { applyLineOverrides, type LineOverride } from "@/lib/calculator40/line-overrides";
import { PRODUCTS } from "@/lib/calculator40/products.mjs";
import { computeCost } from "@/lib/calculator40/engine.mjs";
import { CUT_SPEC_BY_ID } from "@/lib/cutlist/products";
// pricebook.json ต้องโหลดด้วย import assertion เดียวกับ stock-link.ts (ไม่งั้นได้คนละ instance)
import PRICEBOOK from "@/lib/calculator40/pricebook.json" with { type: "json" };

export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

const SELECT =
  "id, product_id, scope, match_key, set_sku, set_qty, set_len, set_price, is_added, item_name, unit, disabled, note, created_by, created_at, updated_at, reviewed_at, reviewed_by";

// GET /api/calc-overrides?product_id=sms_slide — รายการ override (ไม่ระบุ product_id = ทั้งหมด)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("calc_overrides", "read");
  const sb = ctx.supabase as unknown as Sb;
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id");
  const scope = searchParams.get("scope");

  let q = sb.from("calc_line_overrides").select(SELECT).order("scope").order("match_key");
  if (productId) q = q.eq("product_id", productId);
  if (scope === "calc" || scope === "cut") q = q.eq("scope", scope);
  const { data, error } = await q;
  if (error) throw dbError(error);
  return ok(data ?? []);
});

const upsertSchema = z
  .object({
    product_id: z.string().trim().min(1, "ต้องระบุรุ่น"),
    scope: z.enum(["calc", "cut"]),
    match_key: z.string().trim().min(1, "ต้องระบุรหัส/คีย์ของบรรทัด"),
    set_sku: z.string().trim().optional().nullable(),
    set_qty: z.string().trim().optional().nullable(),
    set_len: z.string().trim().optional().nullable(),
    set_price: z.number().finite().optional().nullable(),
    is_added: z.boolean().optional(),
    item_name: z.string().trim().optional().nullable(),
    unit: z.string().trim().optional().nullable(),
    disabled: z.boolean().optional(),
    note: z.string().optional(),
  })
  .strict();

// POST /api/calc-overrides — สร้าง/แก้ override (upsert ตาม product_id+scope+match_key)
//   คืน "ผลกระทบต่อทุน" (ก่อน/หลัง ที่ขนาดดีฟอลต์ของรุ่นนั้น) มาด้วย ให้ UI โชว์ก่อนผู้ใช้กดยืนยันจริง
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("calc_overrides", "write");
  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 422);
  const body = parsed.data;

  // is_added ต้องมี item_name + set_price อย่างน้อย (ตามสเปก) — ไม่งั้นได้บรรทัดว่างไม่มีความหมาย
  if (body.is_added && (!body.item_name || !body.item_name.trim() || body.set_price == null)) {
    return err("เพิ่มรายการใหม่ต้องระบุ ชื่อรายการ และ ราคา อย่างน้อย", 422);
  }

  // เตือนไม่บล็อก (ตามนิสัยโปรเจกต์ "ห้ามฟิก") — เช็คว่ารุ่นนี้มีจริงในซอร์สไหม
  const sourceDict = (body.scope === "calc" ? PRODUCTS : CUT_SPEC_BY_ID) as Record<string, unknown>;
  const productExists = body.product_id in sourceDict;
  if (!productExists) {
    return err(body.scope === "calc" ? "ไม่พบรุ่นนี้ในคิดราคา 4.0 (product_id ผิด)" : "ไม่พบรุ่นนี้ในใบตัด (product_id ผิด)", 422);
  }

  const sb = ctx.supabase as unknown as Sb;
  const { data: existing } = await sb
    .from("calc_line_overrides")
    .select(SELECT)
    .eq("product_id", body.product_id)
    .eq("scope", body.scope)
    .eq("match_key", body.match_key)
    .maybeSingle();

  const row = {
    product_id: body.product_id,
    scope: body.scope,
    match_key: body.match_key,
    set_sku: body.set_sku || null,
    set_qty: body.set_qty || null,
    set_len: body.set_len || null,
    set_price: body.set_price ?? null,
    is_added: !!body.is_added,
    item_name: body.item_name || null,
    unit: body.unit || null,
    disabled: !!body.disabled,
    note: body.note ?? "",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let saved: any;
  if (existing) {
    const { data, error } = await sb.from("calc_line_overrides").update(row).eq("id", existing.id).select(SELECT).single();
    if (error) throw dbError(error);
    saved = data;
  } else {
    const { data, error } = await sb.from("calc_line_overrides").insert({ ...row, created_by: ctx.user.id }).select(SELECT).single();
    if (error) throw dbError(error);
    saved = data;
  }

  // ── ผลกระทบต่อทุน (ขนาดดีฟอลต์ของรุ่นนั้น) — มีความหมายเฉพาะฝั่งคิดราคา (ใบตัดไม่มีแนวคิด "ทุน") ──
  //   best-effort: รุ่นแปลก ๆ ที่คำนวณด้วยขนาดดีฟอลต์เปล่า ๆ ไม่ได้ (ต้องมี spec เพิ่ม) → ข้าม ไม่บล็อกการเซฟ
  let costImpact: { before: number; after: number; diff: number } | null = null;
  if (body.scope === "calc") {
    try {
      const stock = await fetchAllPaged<StockRow>((f, t) =>
        sb
          .from("stock_items")
          .select("name, sku, supplier, is_weight_based, unit_cost, price_per_kg")
          .eq("is_active", true)
          .order("id", { ascending: true })
          .range(f, t),
      );
      const pb = applyPriceOverride(JSON.parse(JSON.stringify(PRICEBOOK)), buildPriceOverride(stock));

      const { data: others } = await sb
        .from("calc_line_overrides")
        .select(SELECT)
        .eq("product_id", body.product_id)
        .eq("scope", "calc")
        .neq("id", saved.id);
      const otherOverrides = (others ?? []) as LineOverride[];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const beforeProducts = applyLineOverrides(PRODUCTS as Record<string, any>, otherOverrides);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const afterProducts = applyLineOverrides(PRODUCTS as Record<string, any>, [...otherOverrides, saved as LineOverride]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const before = Number((computeCost(pb, (beforeProducts as any)[body.product_id], {}) as any)?.cost?.total) || 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const after = Number((computeCost(pb, (afterProducts as any)[body.product_id], {}) as any)?.cost?.total) || 0;
      if (Number.isFinite(before) && Number.isFinite(after)) {
        costImpact = { before, after, diff: Math.round((after - before) * 100) / 100 };
      }
    } catch (e) {
      console.error("[calc-overrides] คำนวณผลกระทบต่อทุนไม่สำเร็จ (ไม่บล็อกการเซฟ)", e);
    }
  }

  await audit({
    userId: ctx.user.id,
    action: existing ? "UPDATE_CALC_OVERRIDE" : "CREATE_CALC_OVERRIDE",
    table: "calc_line_overrides",
    recordId: String(saved.id),
    oldValue: existing ?? null,
    newValue: saved,
  });

  return ok({ override: saved, cost_impact: costImpact }, undefined, existing ? 200 : 201);
});
