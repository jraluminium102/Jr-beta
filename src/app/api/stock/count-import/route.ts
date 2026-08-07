import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { colorFromName } from "@/lib/cutlist/stock-match";

// นำเข้า "นับสต็อก" (stocktake) — อัปโหลด CSV นับจริง → ตั้ง qty_on_hand = จำนวนนับ (ผ่าน stock_moves adjust · trigger ปรับ qty ให้)
//   body { mode:'preview'|'apply', rows:[{sku,name,qty}] } · จับคู่ด้วย sku + สี (colorFromName) · โหมด preview ไม่แตะข้อมูล
const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING", "STORE"];
type Sb = { from: (t: string) => any };
type StockItem = { id: number; sku: string; name: string; color: string | null; qty_on_hand: number; unit_cost: number | null };
type Row = { sku: string; name: string; qty: number };

// สีที่ใช้จริงของ item (ช่องสี ถ้ามี · ไม่งั้นดึงจากชื่อ)
const effColor = (i: StockItem) => String(i.color ?? "").trim() || colorFromName(i.name, i.sku);

// จับคู่ 1 แถว CSV → stock item (เป็นชั้น ๆ กันชนสี/ชื่อฝัง)
function matchRow(row: Row, items: StockItem[]): { item: StockItem | null; ambiguous: boolean } {
  if (items.length === 1) return { item: items[0], ambiguous: false };
  // 1) ชื่อตรงเป๊ะ (รองรับเส้น generic / ชื่อฝังสี / JR)
  let m = items.filter((i) => i.name === row.name);
  // 2) ชื่อ = ชื่อ item + "-" + สี (CSV ประกอบชื่อ+สี)
  if (m.length !== 1) { const byCompose = items.filter((i) => `${i.name}-${i.color ?? ""}` === row.name); if (byCompose.length === 1) m = byCompose; }
  // 3) สีที่ดึงจากชื่อ CSV ตรงกับสีของ item
  if (m.length !== 1) {
    const csvColor = colorFromName(row.name, row.sku);
    if (csvColor) { const byColor = items.filter((i) => effColor(i) === csvColor); if (byColor.length === 1) m = byColor; }
  }
  if (m.length === 1) return { item: m[0], ambiguous: false };
  if (m.length === 0) return { item: null, ambiguous: false };
  return { item: m[0], ambiguous: true }; // หลายตัว → เลือกตัวแรก + ธงกำกวม
}

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!STORE_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  const mode = body?.mode === "apply" ? "apply" : "preview";
  const rawRows = Array.isArray(body?.rows) ? body.rows : [];
  const rows: Row[] = rawRows
    .map((r: { sku?: string; name?: string; qty?: unknown }) => ({
      sku: String(r?.sku ?? "").trim(),
      name: String(r?.name ?? "").trim(),
      qty: Number(r?.qty),
    }))
    .filter((r: Row) => r.sku && Number.isFinite(r.qty) && r.qty >= 0);
  if (rows.length === 0) return fail("ไม่มีแถวข้อมูลที่ใช้ได้ (ต้องมี sku + จำนวน)");

  const supabase = createClient() as unknown as Sb;

  // ดึงสต็อกของ sku ที่อยู่ใน CSV (แบ่ง batch กัน .in() ยาวเกิน)
  const skus = [...new Set(rows.map((r) => r.sku))];
  const bySku = new Map<string, StockItem[]>();
  for (let i = 0; i < skus.length; i += 200) {
    const chunk = skus.slice(i, i + 200);
    const { data, error } = await supabase
      .from("stock_items")
      .select("id, sku, name, color, qty_on_hand, unit_cost")
      .in("sku", chunk);
    if (error) return fail(error.message, 500);
    for (const it of (data ?? []) as StockItem[]) {
      if (!bySku.has(it.sku)) bySku.set(it.sku, []);
      bySku.get(it.sku)!.push(it);
    }
  }

  const matched: { id: number; sku: string; name: string; color: string; oldQty: number; newQty: number; changed: boolean; ambiguous: boolean }[] = [];
  const unmatched: Row[] = [];
  for (const row of rows) {
    const items = bySku.get(row.sku);
    if (!items || items.length === 0) { unmatched.push(row); continue; }
    const { item, ambiguous } = matchRow(row, items);
    if (!item) { unmatched.push(row); continue; }
    const oldQty = Number(item.qty_on_hand) || 0;
    matched.push({ id: item.id, sku: item.sku, name: item.name, color: String(item.color ?? ""), oldQty, newQty: row.qty, changed: oldQty !== row.qty, ambiguous });
  }

  const changedList = matched.filter((m) => m.changed);
  const summary = { total: rows.length, matched: matched.length, changed: changedList.length, unmatched: unmatched.length, ambiguous: matched.filter((m) => m.ambiguous).length };

  if (mode === "preview") {
    return ok({ summary, matched, unmatched });
  }

  // ── apply: ตั้ง qty ผ่าน stock_moves adjust (trigger ปรับ qty_on_hand) — เฉพาะตัวที่เปลี่ยน ──
  //   dedup ตาม stock_item_id (กันแถว CSV ซ้ำ id เดียว → adjust ครั้งเดียว ค่าท้ายชนะ)
  const byId = new Map<number, typeof changedList[number]>();
  for (const c of changedList) byId.set(c.id, c);
  const toApply = [...byId.values()];
  if (toApply.length === 0) return ok({ summary, applied: 0, note: "ไม่มีจำนวนที่เปลี่ยน — ไม่ต้องปรับ" });

  const now = new Date().toISOString();
  const moves = toApply.map((c) => ({
    stock_item_id: c.id,
    type: "adjust",
    qty: c.newQty,                         // adjust = ตั้งยอด (trigger set qty_on_hand = qty)
    ref: "นับสต็อก",
    note: `นับสต็อก (CSV) — เดิม ${c.oldQty} → ${c.newQty}`,
    requester: "",
    unit_cost: Number(c.oldQty) >= 0 ? null : null,   // ต้นทุนคงเดิม (adjust ไม่แตะราคา)
    created_by: profile.id,
    created_at: now,
  }));

  // insert เป็นชุด (batch) — trigger ปรับ qty_on_hand ต่อแถว
  let applied = 0;
  for (let i = 0; i < moves.length; i += 200) {
    const chunk = moves.slice(i, i + 200);
    const { error } = await supabase.from("stock_moves").insert(chunk);
    if (error) return fail(`ปรับสต็อกไม่สำเร็จที่แถว ${i}: ${error.message}`, 500);
    applied += chunk.length;
  }

  return ok({ summary, applied });
}
