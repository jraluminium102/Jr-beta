import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { cutlistActor } from "@/lib/cutlist/actor";
import { resolveStock, fetchAllStockRows, type StockLite } from "@/lib/cutlist/stock-match";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

// POST /api/cutlists/[id]/cut-stock-retry — หัก "รายการที่ค้าง" (failed) ของใบที่ตัดไปแล้ว
//  ใช้กับใบที่ตัดตอนอลูยอดไม่พอ (ก่อนปลดกฎติดลบ 0110) → หักไม่สำเร็จ · ตอนนี้อลูติดลบได้ → หักซ้ำเฉพาะรายการค้าง
//  หักตาม bars ที่บันทึกไว้ใน stock_cut_summary.failed (ไม่คิดใหม่ · กันเพี้ยน) · สำเร็จ → ย้าย failed→deducted
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const actor = await cutlistActor(req);
  if (!actor) return UNAUTHORIZED();
  if (!actor.canCutStock) return FORBIDDEN();

  const id = Number(params.id);
  const sb = actor.sb as unknown as Sb;
  const body = await req.json().catch(() => ({}));
  const requesterName = String((body as { requester?: string })?.requester ?? "").trim() || actor.actorName;

  const { data: cl } = await sb.from("cutlists").select("id, code, status, job_id, stock_cut_summary").eq("id", id).maybeSingle();
  if (!cl) return fail("ไม่พบใบตัด", 404);
  if (cl.status !== "stock_cut") return fail("ใบนี้ยังไม่ได้ตัดสต็อก — กด 'ตัดออกสโตร์' ตามปกติ", 400);

  const summary = cl.stock_cut_summary || {};
  const failedList: { code: string; color: string; bars: number }[] = Array.isArray(summary.failed) ? summary.failed : [];
  if (!failedList.length) return fail("ไม่มีรายการที่ค้าง (หักครบแล้ว)", 400);

  const stockRows = await fetchAllStockRows<{ id: number; sku: string | null; name: string | null; color: string | null; unit_cost: number | null }>(sb, "id, sku, name, color, unit_cost");
  const stockList: (StockLite & { id: number })[] = stockRows.map((s) => ({ id: Number(s.id), sku: s.sku ?? "", name: s.name ?? "", color: s.color ?? "", qty: 0, unitCost: Number(s.unit_cost) || 0 }));

  const newDeducted: { code: string; color: string; bars: number; stock_item_id: number }[] = [];
  const stillFailed: { code: string; color: string; bars: number; error: string }[] = [];

  for (const f of failedList) {
    const bars = Number(f.bars) || 0;
    if (bars <= 0) continue;
    const item = resolveStock(stockList, f.code, f.color) as (StockLite & { id: number }) | null;
    if (!item) { stillFailed.push({ code: f.code, color: f.color, bars, error: "ไม่มีในสต็อก (สร้างวัสดุก่อน)" }); continue; }
    const unitCost = Number(item.unitCost) || 0;
    const { error: mvErr } = await sb.from("stock_moves").insert({
      stock_item_id: Number(item.id),
      type: "out",
      qty: bars,
      ref: cl.code || `CL-${id}`,
      note: `หักที่ค้างจากใบตัด ${cl.code || `CL-${id}`}${f.color ? ` · สี${f.color}` : ""} (ตัดภายหลัง)`,
      requester: requesterName,
      job_id: cl.job_id || null,
      unit_cost: unitCost,
      total_price: Math.round(bars * unitCost * 100) / 100,
      created_by: actor.userId,
    });
    if (mvErr) { stillFailed.push({ code: f.code, color: f.color, bars, error: mvErr.message }); continue; }
    newDeducted.push({ code: f.code, color: f.color, bars, stock_item_id: Number(item.id) });
  }

  // อัปเดต summary: ย้ายที่สำเร็จ failed→deducted · เหลือ stillFailed
  const mergedSummary = {
    ...summary,
    deducted: [...(Array.isArray(summary.deducted) ? summary.deducted : []), ...newDeducted],
    failed: stillFailed,
    retriedAt: new Date().toISOString(),
  };
  const { error: upErr } = await sb.from("cutlists").update({ stock_cut_summary: mergedSummary }).eq("id", id);
  if (upErr) console.warn("[cut-stock-retry] save summary failed (non-fatal):", upErr.message);

  return ok({ newDeducted, stillFailed });
}
