import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requirePermission, HttpError, type Ctx } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTaxLockBefore } from "@/lib/doc-cutoff";
import { loadConfig, saveConfig, type Sb } from "@/lib/app-config-json";
import { readXlsx } from "@/lib/floor-calc/xlsx-read";
import { writeXlsx } from "@/lib/floor-calc/xlsx-write";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";
import { isMonth, monthRange, round2, THAI_MONTH } from "@/lib/sales-tax-report";
import {
  billKeys, buildPurchaseReport, mergeSuppliers, OUR_TAX_ID, parseOldPurchaseFile, parsePurchaseStore, parseSupplierStore,
  PAY_KINDS, purchaseKey, SUPPLIERS_KEY, taxId13, type PurchaseRow, type PurchaseStore, type ScanMiss, type Supplier,
} from "@/lib/purchase-tax";
import { buildPurchaseSheets } from "@/lib/purchase-tax-xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * รายงานภาษีซื้อรายเดือน (เจ้าของ 27 พ.ย.69)
 *   GET    ?m=YYYY-MM[&format=xlsx]         → รายงาน + สมุดร้าน (json) หรือไฟล์ Excel แบบชีต "ซื้อ"
 *   POST   json { m, rows:[…], misses:[…] } → เพิ่มบิลหลายใบ (ผลที่ AI อ่าน หรือกรอกเอง) + จดหน้าสแกนที่ไม่ได้บิล
 *   POST   multipart (m, file, rows=0|1)    → นำเข้าไฟล์รายงานเดิมของธุรการ: เติมสมุดร้าน (+ บิลของเดือนนั้นถ้า rows=1)
 *   PUT    json { m, row:{id,…} }           → แก้บิล 1 ใบ (ติ๊ก "ตรวจแล้ว" · วิธีชำระ · ไม่ใช้ภาษีซื้อ · ยืนยันผู้ซื้อ)
 *   DELETE ?m=&id= | ?m=&src=ai&unchecked=1 | ?m=&miss=<id|all> → ลบ 1 ใบ | ลบบิลที่ AI อ่านซึ่งยังไม่มีคนแตะ | ลบรายการหน้าที่ไม่ได้บิล
 *
 * เก็บใน app_config: purchase_tax:<เดือน> + purchase_suppliers — ไม่มี migration · ไม่แตะสต็อก/การเงินจริง
 * สิทธิ์: finance:write ทั้งดูและแก้ (ราคาซื้อจากร้านค้าไม่ให้ฝ่ายขายเห็น) · เดือนที่ยื่นภาษีปิดแล้วแก้ไม่ได้ · ลง audit_logs (purchase_tax_report)
 * ⚠ ติ๊ก "ตรวจแล้ว" ไม่ได้ถ้าบิลยังมีปัญหาร้ายแรง (blockers ใน purchase-tax.ts) — ต้องแก้ให้ถูก หรือตั้งเป็นไม่ใช้ภาษีซื้อ (no_claim)
 * ตัวอ่านบิลด้วย AI อยู่ที่ /api/purchase-tax/read (แยก เพราะใช้เวลานานกว่า)
 */
const svc = () => createServiceClient() as unknown as Sb;
const MAX_ROWS = 2000;
const MAX_MB = 4;

const monthOf = (v: unknown): string => {
  if (!isMonth(v)) throw new HttpError(400, "เดือนไม่ถูกต้อง");
  return v;
};
async function assertUnlocked(month: string): Promise<void> {
  const lock = await getTaxLockBefore();
  if (lock && monthRange(month).nextStart <= lock) throw new HttpError(409, "เดือนนี้ยื่นภาษีปิดแล้ว — แก้รายงานไม่ได้");
}
const log = (ctx: Ctx, month: string, action: string, newValue: unknown, oldValue?: unknown) =>
  audit({ userId: ctx.user.id, action, table: "purchase_tax_report", recordId: month, oldValue, newValue });

/** บิลที่ลงไว้ในเดือนอื่น (ย้อน 7 เดือน + ถัดไป 1 เดือน) → กันเอาบิลใบเดียวไปใช้ภาษีซื้อ 2 เดือน */
async function loadOtherMonths(sb: Sb, month: string): Promise<Map<string, string>> {
  const { y, m0 } = monthRange(month);
  const months: string[] = [];
  for (const d of [-7, -6, -5, -4, -3, -2, -1, 1]) {
    const t = new Date(Date.UTC(y, m0 + d, 1));
    months.push(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const { data, error } = await sb.from("app_config").select("key, value").in("key", months.map(purchaseKey));
  if (error) throw new Error(error.message ?? "อ่านบิลเดือนอื่นไม่สำเร็จ");
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { key: string; value: string }[]) {
    const mo = row.key.slice("purchase_tax:".length);
    for (const r of parsePurchaseStore(row.value).rows) if (!r.no_claim) for (const k of billKeys(r)) map.set(k, mo);
  }
  return map;
}

/** withOther = ต้องเทียบบิลเดือนอื่นด้วย (ตอนโชว์รายงาน และตอนจะติ๊กตรวจ) — งานเขียนทั่วไปไม่ต้อง จะได้ไม่อ่าน 8 เดือนทุกคลิก */
async function loadAll(month: string, withOther: boolean) {
  const sb = svc();
  const [store, sup, other] = await Promise.all([
    loadConfig(sb, purchaseKey(month)), loadConfig(sb, SUPPLIERS_KEY),
    withOther ? loadOtherMonths(sb, month) : Promise.resolve(new Map<string, string>()),
  ]);
  return { sb, store: parsePurchaseStore(store.value), stamp: store.stamp, suppliers: parseSupplierStore(sup.value), supStamp: sup.stamp, other };
}

export const GET = withRoute(async (req: Request) => {
  await requirePermission("finance", "write");
  const url = new URL(req.url);
  const month = monthOf(url.searchParams.get("m"));
  const { store, suppliers, other } = await loadAll(month, true);
  const report = buildPurchaseReport(month, store, suppliers.list, other);
  if (url.searchParams.get("format") === "xlsx") {
    const buf = writeXlsx(buildPurchaseSheets(report, { name: COMPANY.nameFull, taxId: COMPANY.taxId, branch: COMPANY.branch }));
    const { y, m0 } = monthRange(month);
    // ⚠ ชื่อไฟล์ไทย → ต้องใช้ filename* (RFC 5987)
    const name = `รายงานภาษีซื้อ ${THAI_MONTH[m0]} ${y + 543}${report.totals.unchecked ? " (ร่าง)" : ""}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="purchase-tax-${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  }
  return ok({ ...report, suppliers: suppliers.list });
});

const realDate = (s: string) => { const t = new Date(s + "T00:00:00Z"); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น ปปปป-ดด-วว").refine(realDate, "วันที่ไม่มีจริง");
const rowFields = {
  code: z.string().trim().max(60),
  // ผลจาก AI อาจอ่านวันที่ไม่ออก → ยอมให้ว่าง แล้วให้ตัวตรวจบล็อกไว้ (ดีกว่าทิ้งทั้งใบ)
  date: z.union([iso, z.literal("")]),
  name: z.string().trim().max(300),
  tax_id: z.string().trim().max(20),
  branch: z.string().trim().max(40),
  base: z.number().min(-1_000_000_000).max(1_000_000_000),
  vat: z.number().min(-100_000_000).max(100_000_000),
  pay: z.enum(["", ...PAY_KINDS]),
  note: z.string().trim().max(300),
  checked: z.boolean(),
  no_claim: z.string().trim().max(200),
};
const newRow = z.object({
  ...rowFields,
  tax_id: rowFields.tax_id.default(""), branch: rowFields.branch.default(""), pay: rowFields.pay.default(""), note: rowFields.note.default(""),
  checked: rowFields.checked.default(false), no_claim: rowFields.no_claim.optional(),
  src: z.enum(["ai", "manual"]).default("manual"),
  ref: z.string().trim().max(200).default(""),
  ai_flags: z.array(z.string().max(300)).max(30).default([]),
  kind: z.enum(["invoice", "credit", "debit", "abbr"]).optional(),
  buyer_tax_id: z.string().trim().max(20).optional(),
});
const editRow = z.object({ id: z.string().min(1).max(80) })
  .merge(z.object(rowFields).partial())
  // buyer_ok = คนดูกระดาษแล้วยืนยันว่าบิลออกในนามบริษัทเรา (AI อ่านเลขผู้ซื้อผิด/ไม่เห็น)
  .merge(z.object({ buyer_ok: z.literal(true).optional() }));
const missIn = z.object({ ref: z.string().trim().max(200), reason: z.string().trim().max(300) });

/** บิลที่ "ตรวจแล้ว" และยังใช้ภาษีซื้อ ต้องไม่มีปัญหาร้ายแรง — คืนข้อความของใบแรกที่ไม่ผ่าน */
function checkGate(month: string, store: PurchaseStore, suppliers: Supplier[], other: Map<string, string>, ids: string[]): string | null {
  const rep = buildPurchaseReport(month, store, suppliers, other);
  for (const id of ids) {
    const v = rep.rows.find((r) => r.id === id);
    if (v && v.checked && v.blockers.length) {
      return `ยังติ๊กตรวจแล้วไม่ได้: บิล ${v.code || "(ไม่มีเลขที่)"} ของ ${v.name} — ${v.blockers[0]} · แก้ข้อมูลให้ถูก หรือกด “ไม่ใช้ภาษีซื้อ”`;
    }
  }
  return null;
}

/** ร้าน/สาขาใหม่ที่คนตรวจแล้ว → เข้าสมุดร้าน (ครั้งหน้า AI อ่านร้านนี้จะได้ชื่อ/วิธีชำระเดิม) · เลขที่ไม่ผ่านตัวตรวจไม่เข้าสมุด */
async function learnSuppliers(sb: Sb, cur: Supplier[], stamp: string | null, rows: PurchaseRow[]): Promise<void> {
  const add = rows.filter((r) => r.checked && !r.no_claim && r.name.trim() && r.base > 0)
    .map((r) => ({ name: r.name, tax_id: r.tax_id, branch: r.branch, pay: r.pay }));
  if (!add.length) return;
  const merged = mergeSuppliers(cur, add);
  if (!merged.changed) return;
  try { await saveConfig(sb, SUPPLIERS_KEY, { list: merged.list }, stamp); } catch { /* สมุดร้านพลาด ไม่ให้บิลพลาดตาม — ครั้งหน้าเรียนใหม่ได้ */ }
}

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const stamp = { at: new Date().toISOString(), by: ctx.user.id };
  const ctype = req.headers.get("content-type") ?? "";

  // ── นำเข้าไฟล์รายงานเดิม (สมุดร้าน ± บิลของเดือน) ──
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) throw new HttpError(400, "อ่านไฟล์ที่อัปโหลดไม่ได้");
    const month = monthOf(form.get("m"));
    const withRows = form.get("rows") === "1";
    const f = form.get("file");
    if (!(f instanceof File)) throw new HttpError(400, "ยังไม่ได้แนบไฟล์");
    if (!/\.xlsx$/i.test(f.name)) throw new HttpError(400, "รองรับเฉพาะไฟล์ .xlsx");
    if (f.size > MAX_MB * 1024 * 1024) throw new HttpError(400, `ไฟล์ใหญ่เกิน ${MAX_MB} MB`);
    let parsed;
    try { parsed = parseOldPurchaseFile(readXlsx(Buffer.from(await f.arrayBuffer()))); }
    catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ"); }
    if (!parsed.suppliers.length && !parsed.rows.length) throw new HttpError(400, parsed.problems[0] ?? "ไม่พบข้อมูลร้านค้าหรือบิลซื้อในไฟล์");
    if (withRows) await assertUnlocked(month);
    const { sb, store, stamp: rowsStamp, suppliers, supStamp } = await loadAll(month, false);
    let addedRows = 0, dupRows = 0;
    if (withRows) {
      // ซ้ำ = กุญแจบิลเดียวกัน (เลขผู้เสียภาษี+เลขที่ · หรือ ชื่อ+วัน+ยอด ถ้าไม่มีเลข) และวัน/ยอดตรง — ชื่อร้านอยู่ในกุญแจสำรองแล้ว
      const sig = (r: Pick<PurchaseRow, "tax_id" | "code" | "name" | "date" | "base" | "vat">) => `${billKeys(r).join("+")}|${r.name.trim()}|${r.date}|${round2(r.base)}`;
      const have = new Set(store.rows.map(sig));
      for (const r of parsed.rows) {
        const k = sig(r);
        if (have.has(k)) { dupRows++; continue; }
        have.add(k);
        store.rows.push({ id: randomUUID(), ...r, ...stamp }); addedRows++;
      }
      if (store.rows.length > MAX_ROWS) throw new HttpError(400, `เดือนนี้มีบิลเกิน ${MAX_ROWS} ใบ — ไฟล์น่าจะผิด`);
      // บันทึกบิลก่อนสมุดร้าน — บิลพลาดจะได้ไม่เหลือสมุดร้านที่อัปเดตไปครึ่งเดียว
      if (addedRows) await saveConfig(sb, purchaseKey(month), store, rowsStamp);
    }
    const merged = mergeSuppliers(suppliers.list, parsed.suppliers);
    if (merged.changed) await saveConfig(sb, SUPPLIERS_KEY, { list: merged.list }, supStamp);
    await log(ctx, month, "import_old_file", { file: f.name, suppliers_added: merged.added, rows_added: addedRows });
    return ok({ suppliers_added: merged.added, suppliers_total: merged.list.length, rows_added: addedRows, rows_dup: dupRows, problems: parsed.problems });
  }

  // ── เพิ่มบิล (หลายใบ) + จดหน้าที่ไม่ได้บิล ──
  const json = await req.json().catch(() => null);
  if (!json) throw new HttpError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  const body = z.object({ m: z.string(), rows: z.array(newRow).max(100).default([]), misses: z.array(missIn).max(100).default([]) }).parse(json);
  if (!body.rows.length && !body.misses.length) throw new HttpError(400, "ไม่มีรายการให้บันทึก");
  const month = monthOf(body.m);
  await assertUnlocked(month);
  const anyChecked = body.rows.some((r) => r.checked);
  const { sb, store, stamp: rowsStamp, suppliers, supStamp, other } = await loadAll(month, anyChecked);
  if (store.rows.length + body.rows.length > MAX_ROWS) throw new HttpError(400, `เดือนนี้เพิ่มได้ไม่เกิน ${MAX_ROWS} ใบ`);
  const added: PurchaseRow[] = body.rows.map((r) => {
    const { kind, buyer_tax_id, no_claim, ...rest } = r;
    const base = round2(r.base);
    return {
      id: randomUUID(), ...rest, tax_id: taxId13(r.tax_id), base, vat: round2(r.vat),
      ...(base < 0 ? { kind: "credit" as const } : kind ? { kind } : {}),
      ...(buyer_tax_id !== undefined ? { buyer_tax_id: taxId13(buyer_tax_id) } : {}),
      ...(no_claim ? { no_claim } : {}), ...stamp,
    };
  });
  store.rows.push(...added);
  const newMisses: ScanMiss[] = body.misses.map((x) => ({ id: randomUUID(), ...x, at: stamp.at }));
  store.misses = [...(store.misses ?? []), ...newMisses].slice(-500);
  if (anyChecked) { const gate = checkGate(month, store, suppliers.list, other, added.map((r) => r.id)); if (gate) throw new HttpError(400, gate); }
  await saveConfig(sb, purchaseKey(month), store, rowsStamp);
  await learnSuppliers(sb, suppliers.list, supStamp, added);
  if (added.length) await log(ctx, month, "add_rows", added.map((r) => ({ id: r.id, code: r.code, name: r.name, base: r.base, vat: r.vat, src: r.src })));
  return ok({ added: added.map((r) => r.id), misses: newMisses.length });
});

export const PUT = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const json = await req.json().catch(() => null);
  if (!json) throw new HttpError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  const body = z.object({ m: z.string(), row: editRow }).parse(json);
  const month = monthOf(body.m);
  await assertUnlocked(month);
  const { sb, store, stamp: rowsStamp, suppliers, supStamp, other } = await loadAll(month, true);
  const i = store.rows.findIndex((x) => x.id === body.row.id);
  if (i < 0) throw new HttpError(404, "ไม่พบบิลนี้ (อาจถูกลบไปแล้ว)");
  const before = { ...store.rows[i] };
  const { id: _id, buyer_ok, no_claim, ...patch } = body.row;
  void _id;
  const next: PurchaseRow = { ...before, ...patch, at: new Date().toISOString(), by: ctx.user.id };
  next.tax_id = taxId13(next.tax_id); next.base = round2(next.base); next.vat = round2(next.vat);
  if (buyer_ok) next.buyer_tax_id = OUR_TAX_ID;
  if (no_claim !== undefined) { if (no_claim) next.no_claim = no_claim; else delete next.no_claim; }
  // ยอดติดลบ = ใบลดหนี้ · กลับเป็นบวก = ไม่ใช่ใบลดหนี้แล้ว (ชนิดอื่นคงตามที่ AI อ่าน)
  if (next.base < 0) next.kind = "credit"; else if (next.kind === "credit") next.kind = "invoice";
  // ธงชั่วคราวจากตอนอ่าน (อ่านไม่ชัด/ระบบถอดตัวเลขเอง) หมดความหมายเมื่อคนแก้ตัวเลขหรือติ๊กตรวจ
  //   ส่วนเรื่องผู้ซื้อ/ชนิดเอกสาร/บิลซ้ำ/ช่วงเวลา คิดใหม่จากข้อมูลในแถวทุกครั้ง ไม่ได้อยู่ในธงนี้
  const touched = (["code", "date", "name", "tax_id", "branch", "base", "vat"] as const).some((k) => patch[k] !== undefined && patch[k] !== before[k]);
  if (touched) next.edited = true;
  if (touched || (next.checked && !before.checked)) next.ai_flags = [];
  store.rows[i] = next;
  const gate = checkGate(month, store, suppliers.list, other, [next.id]);
  if (gate) throw new HttpError(400, gate);
  await saveConfig(sb, purchaseKey(month), store, rowsStamp);
  await learnSuppliers(sb, suppliers.list, supStamp, [next]);
  await log(ctx, month, "edit_row", next, before);
  return ok(next);
});

export const DELETE = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const url = new URL(req.url);
  const month = monthOf(url.searchParams.get("m"));
  await assertUnlocked(month);
  const sb = svc();
  const loaded = await loadConfig(sb, purchaseKey(month));
  const store = parsePurchaseStore(loaded.value);
  const miss = url.searchParams.get("miss");
  if (miss) {
    const before = store.misses ?? [];
    store.misses = miss === "all" ? [] : before.filter((x) => x.id !== miss);
    if (store.misses.length !== before.length) await saveConfig(sb, purchaseKey(month), store, loaded.stamp);
    return ok({ removed: before.length - store.misses.length });
  }
  let gone: PurchaseRow[];
  if (url.searchParams.get("unchecked") === "1" && url.searchParams.get("src") === "ai") {
    // เฉพาะบิลที่ AI อ่านและ "ยังไม่มีคนแตะ" — ใบที่คนแก้ตัวเลขแล้วแต่ยังไม่ติ๊ก ไม่ลบ (งานที่ทำไปแล้ว)
    const drop = (r: PurchaseRow) => r.src === "ai" && !r.checked && !r.edited && !r.no_claim;
    gone = store.rows.filter(drop);
    store.rows = store.rows.filter((r) => !drop(r));
  } else {
    const id = url.searchParams.get("id") ?? "";
    const i = store.rows.findIndex((x) => x.id === id);
    if (i < 0) throw new HttpError(404, "ไม่พบบิลนี้ (อาจถูกลบไปแล้ว)");
    gone = store.rows.splice(i, 1);
  }
  if (!gone.length) return ok({ removed: 0 });
  await saveConfig(sb, purchaseKey(month), store, loaded.stamp);
  await log(ctx, month, gone.length > 1 ? "delete_unchecked_ai" : "delete_row", null, gone); // เก็บของที่ลบไว้ กู้คืนได้
  return ok({ removed: gone.length });
});
