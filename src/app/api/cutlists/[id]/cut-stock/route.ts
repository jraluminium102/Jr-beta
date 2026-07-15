import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { computeCutList } from "@/lib/cutlist/engine";
import { CUT_SPEC_BY_ID } from "@/lib/cutlist/products";

export const dynamic = "force-dynamic";

const CUT_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

// POST /api/cutlists/[id]/cut-stock — หักสต็อกจริงตาม "เส้นต่อรหัส" ของทั้งใบ
//  · คิดฝั่ง server จาก spec+input (ไม่เชื่อตัวเลข client)
//  · claim สถานะ draft→stock_cut แบบ atomic "ก่อน" หัก (QA CRITICAL: กัน race กด 2 ครั้งพร้อมกัน + กันกดซ้ำหลังหักได้บางส่วน)
//  · หักทีละรหัสแบบไม่ล้มทั้งใบ: รหัสไหน insert ล้ม (เช่นสต็อกไม่พอ ติด check qty_on_hand>=0) → เข้า failed list แล้วไปต่อ
//  · รหัสที่ไม่มีในสต็อก (sku ไม่เจอ) = skipped · ทุกผลบันทึกใน stock_cut_summary
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!CUT_WRITE.includes(profile.role)) return FORBIDDEN();

  const id = Number(params.id);
  const sb = createClient() as unknown as Sb;

  const { data: cl } = await sb
    .from("cutlists")
    .select("id, code, status, job_id, cutlist_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (!cl) return fail("ไม่พบใบตัด", 404);
  if (cl.status === "stock_cut") return fail("ใบนี้ตัดสต็อกไปแล้ว — หักซ้ำไม่ได้", 409);

  // รวมความยาวต่อรหัสจากทุกข้อก่อน แล้วค่อยปัดเป็นเส้น (nesting รวมทั้งใบ — logic เดียวกับ BOQ ฝั่งจอ)
  const lenByCode = new Map<string, number>();
  const stockLenByCode = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of (cl.cutlist_items ?? []) as any[]) {
    const spec = CUT_SPEC_BY_ID[String(it.spec_id)];
    if (!spec) continue; // สเปกหาย (โค้ดรุ่นถูกถอด) — จอเตือนอยู่แล้ว
    const r = computeCutList(spec, it.input ?? {}, Math.max(1, Number(it.sets) || 1));
    for (const bc of r.barsByCode) {
      lenByCode.set(bc.code, (lenByCode.get(bc.code) ?? 0) + bc.totalLenCm);
      stockLenByCode.set(bc.code, spec.stockLen);
    }
  }
  if (lenByCode.size === 0) return fail("ใบตัดนี้ไม่มีเส้นที่มีรหัสอลูให้หัก", 400);

  // ── claim atomic: draft → stock_cut ก่อนหัก ──
  // conditional update (id + status='draft') — request ที่สองที่วิ่งมาพร้อมกันจะไม่ได้แถว → 409 ทันที
  // ผลพลอยได้: หักได้บางส่วนแล้ว error ผู้ใช้กดซ้ำ = โดน 409 (ไม่มีทางหักซ้ำ) — ที่เหลือหักมือที่หน้าสต๊อกตาม summary
  const { data: claimed, error: claimErr } = await sb
    .from("cutlists")
    .update({ status: "stock_cut", stock_cut_at: new Date().toISOString(), stock_cut_by: profile.id })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (claimErr) return fail("ล็อกใบตัดไม่สำเร็จ: " + claimErr.message, 500);
  if (!claimed?.length) return fail("ใบนี้ตัดสต็อกไปแล้ว (หรือกำลังตัดอยู่) — หักซ้ำไม่ได้", 409);

  // จับคู่รหัส → stock item: ดึงทั้งชุดแล้ว normalize ฝั่ง JS (QA MEDIUM: sku ในฐานอาจมีช่องว่าง/ตัวเล็กปน — exact .in() พลาด)
  const { data: stockRows } = await sb
    .from("stock_items")
    .select("id, sku, name, unit_cost")
    .eq("is_active", true)
    .neq("sku", "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bySku = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (stockRows ?? []) as any[]) {
    const k = String(s.sku ?? "").trim().toUpperCase();
    if (k && !bySku.has(k)) bySku.set(k, s);
  }

  const deducted: { code: string; bars: number; stock_item_id: number }[] = [];
  const skipped: { code: string; bars: number }[] = [];
  const failed: { code: string; bars: number; error: string }[] = [];

  for (const code of lenByCode.keys()) {
    const stockLen = stockLenByCode.get(code) || 640;
    const bars = Math.ceil((lenByCode.get(code) ?? 0) / stockLen - 1e-9);
    if (bars <= 0) continue;
    const item = bySku.get(code.trim().toUpperCase());
    if (!item) { skipped.push({ code, bars }); continue; }
    const unitCost = Number(item.unit_cost) || 0;
    const { error: mvErr } = await sb.from("stock_moves").insert({
      stock_item_id: Number(item.id),
      type: "out",
      qty: bars,
      ref: cl.code || `CL-${id}`,
      note: `ตัดสต็อกจากใบตัด ${cl.code || `CL-${id}`}`,
      requester: profile.full_name ?? "",
      job_id: cl.job_id || null,
      unit_cost: unitCost,
      total_price: Math.round(bars * unitCost * 100) / 100,
      created_by: profile.id,
    });
    if (mvErr) {
      // หักรหัสนี้ไม่ได้ (เช่นสต็อกไม่พอ ติด constraint) → จดแล้วไปต่อ (ใบถูกล็อกแล้ว ไม่มีทางหักซ้ำ)
      failed.push({ code, bars, error: mvErr.message });
      continue;
    }
    deducted.push({ code, bars, stock_item_id: Number(item.id) });
  }

  const summary = { deducted, skipped, failed, at: new Date().toISOString() };
  const { error: upErr } = await sb.from("cutlists").update({ stock_cut_summary: summary }).eq("id", id);
  if (upErr) console.warn("[cut-stock] save summary failed (non-fatal):", upErr.message);

  return ok({ deducted, skipped, failed });
}
