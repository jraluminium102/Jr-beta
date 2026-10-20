import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { pickCtx } from "@/lib/alu-pick/route-helpers";
import { pickGroupOf, PICK_GROUPS } from "@/lib/alu-pick/groups";
import { stockDisplayName } from "@/lib/stock/display-name";

export const dynamic = "force-dynamic";

/**
 * GET /api/alu-picks/items → เส้นอลูที่เบิกได้ จัดหมวดตามที่เจ้าของเคาะ (ประตู/หน้าต่าง ตามแบรนด์ · กล่อง · ฉาก · อื่นๆ · ไม่เอาหลังคา)
 *   ไม่ส่งต้นทุน (ช่าง/สโตร์ไม่เห็นราคา) · ส่งทุกเส้นรวมคงเหลือ 0 (ของจริงอาจมีแต่ยอดระบบผิด ให้ช่างเห็นแล้วแจ้ง)
 */
type Row = {
  id: number; sku: string | null; name: string; color: string | null; category: string | null; unit: string | null;
  qty_on_hand: number | null; min_qty: number | null; image_url: string | null; is_stocked: boolean | null; alu_brand?: string | null;
};
const COLS = "id, sku, name, color, category, unit, qty_on_hand, min_qty, image_url, is_stocked";

export const GET = withRoute(async (req: Request) => {
  const { sb } = await pickCtx(req, "read");
  const pull = (cols: string) => fetchAllPaged<Row>((f, t) =>
    sb.from("stock_items").select(cols).eq("is_active", true).like("category", "%อลู%")
      .order("sku", { ascending: true }).order("id", { ascending: true }).range(f, t));
  let rows = await pull(COLS + ", alu_brand");
  if (!rows.length) rows = await pull(COLS);   // ยังไม่รัน 0157

  const items = rows.flatMap((r) => {
    const group = pickGroupOf(r);
    if (!group) return [];
    return [{
      id: r.id, sku: r.sku ?? "", name: stockDisplayName(r), color: String(r.color ?? "").trim(),
      unit: r.unit || "เส้น", qty: Number(r.qty_on_hand) || 0, min_qty: Number(r.min_qty) || 0,
      image_url: r.image_url ?? "", group,
    }];
  });
  // มีของบนชั้นขึ้นก่อน (เส้นที่ระบบมี 0 ยังโชว์ไว้ท้าย ๆ เผื่อยอดระบบผิด)
  items.sort((a, b) => (Number(b.qty > 0) - Number(a.qty > 0)) || a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name));
  return ok({ groups: PICK_GROUPS, items });
});
