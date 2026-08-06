import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { audit } from "@/lib/bff/handler";
import { nextDocumentCode } from "@/lib/doc-code";
import { sumItems, DEFAULT_CONTRACTOR } from "@/lib/floor-calc/engine.mjs";

export const dynamic = "force-dynamic";

const NO_TABLE = "ยังไม่ได้รัน migration 0120_floor_works.sql — รันก่อนใช้งานหน้านี้";
const isMissingTable = (msg?: string | null) =>
  /floor_quotation|relation .* does not exist|schema cache/i.test(msg ?? "");

// GET /api/floor-quotations?q=&limit= — รายการใบเสนองานพื้น
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));

  const supabase = createClient();
  let query = supabase
    .from("floor_quotations")
    .select("id, code, job_id, customer_id, customer_snapshot, issue_date, rev, status, total, calc")
    .order("issue_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (q) query = query.or(`code.ilike.%${q}%,customer_snapshot->>name.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return fail(isMissingTable(error.message) ? NO_TABLE : error.message, 500);
  return ok(data ?? []);
}

/**
 * POST /api/floor-quotations — สร้างใบเสนองานพื้น
 * body: { customer: {name,address,phone}, job_id?, customer_id?, issue_date, calc, items[], contractor?, note? }
 *
 * ยอดรวม = ผลบวก line_total ทุกรายการ (ไม่มี VAT — ฟอร์มช่าง เจ้าของยืนยัน 6 ส.ค.69)
 * เลขเอกสารชุด 'FL' แยกจากใบเสนออลูมิเนียม (QT) · รันตามเดือนของ issue_date
 */
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => ({}));

  const name = String(body?.customer?.name ?? "").trim();
  if (!name) return fail("กรุณากรอกชื่อลูกค้า");
  if (name.length > 200) return fail("ชื่อลูกค้ายาวเกินไป");

  const issueDate = String(body?.issue_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return fail("รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");
  if (Number(issueDate.slice(0, 4)) >= 2500) return fail("กรุณากรอกปี ค.ศ. (ไม่ใช่ พ.ศ.)");

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) return fail("ต้องมีอย่างน้อย 1 รายการ");
  if (items.length > 200) return fail("รายการมากเกินไป (สูงสุด 200)");

  const supabase = createClient();
  const { code, error: codeErr } = await nextDocumentCode(supabase, "FL", issueDate);
  if (!code) return fail("ออกเลขเอกสารไม่สำเร็จ: " + codeErr, 500);

  const clean = normalizeItems(items);
  const total = sumItems(clean);

  const { data: head, error: hErr } = await supabase
    .from("floor_quotations")
    .insert({
      code,
      job_id: body?.job_id ?? null,
      customer_id: body?.customer_id ?? null,
      customer_snapshot: {
        name,
        address: String(body?.customer?.address ?? "").trim(),
        phone: String(body?.customer?.phone ?? "").trim(),
      },
      contractor: body?.contractor ?? DEFAULT_CONTRACTOR,
      issue_date: issueDate,
      calc: body?.calc ?? {},
      total,
      note: String(body?.note ?? "").trim(),
      created_by: profile.id,
    })
    .select("id, code")
    .single();
  if (hErr) return fail(isMissingTable(hErr.message) ? NO_TABLE : "บันทึกไม่สำเร็จ: " + hErr.message, 500);

  const { error: iErr } = await supabase
    .from("floor_quotation_items")
    .insert(clean.map((it, i) => ({ ...it, quotation_id: head.id, sort_order: i })));
  if (iErr) {
    // หัวเอกสารสร้างแล้วแต่รายการล้ม → ลบทิ้ง กันใบเปล่าค้างระบบ
    await supabase.from("floor_quotations").delete().eq("id", head.id);
    return fail("บันทึกรายการไม่สำเร็จ: " + iErr.message, 500);
  }

  await audit({
    userId: profile.id, action: "CREATE_FLOOR_QUOTATION", table: "floor_quotations",
    recordId: String(head.id), newValue: { code, total, items: clean.length },
  });

  return ok({ id: head.id, code: head.code, total });
}

/** ล้าง/คำนวณรายการให้ปลอดภัยก่อนลง DB — line_total คิดใหม่เสมอ (ห้ามเชื่อค่าจาก client) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeItems(items: any[]) {
  const num = (v: unknown, dflt = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  };
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return items.map((it: any) => {
    const qty = num(it?.qty, 1);
    const unitPrice = num(it?.unit_price, 0);
    return {
      group_label: String(it?.group_label ?? "").trim().slice(0, 120),
      name: String(it?.name ?? "").trim().slice(0, 500),
      qty: r2(qty),
      unit: String(it?.unit ?? "งาน").trim().slice(0, 20) || "งาน",
      material_price: it?.material_price == null || it.material_price === "" ? null : r2(num(it.material_price)),
      labor_price: it?.labor_price == null || it.labor_price === "" ? null : r2(num(it.labor_price)),
      unit_price: r2(unitPrice),
      line_total: r2(qty * unitPrice),
      remark: String(it?.remark ?? "").trim().slice(0, 120),
      source: ["auto", "suggest", "manual"].includes(it?.source) ? it.source : "manual",
    };
  });
}
