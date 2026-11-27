import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requirePermission, HttpError, type Ctx } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { getTaxLockBefore } from "@/lib/doc-cutoff";
import { readXlsx } from "@/lib/floor-calc/xlsx-read";
import { writeXlsx } from "@/lib/floor-calc/xlsx-write";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";
import {
  buildReport, extraKey, extraToRow, isMonth, monthRange, pairProblem, parseExtra, parseSalesImport, receiptToRow, round2,
  THAI_MONTH, type ExtraRow, type ReceiptLike, type TaxExtra, type TaxRow,
} from "@/lib/sales-tax-report";
import { buildSalesSheets } from "@/lib/sales-tax-report-xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * รายงานภาษีขายรายเดือน (เจ้าของ 27 พ.ย.69) — ใบเสร็จในระบบ + ใบจาก FlowAccount ที่เพิ่มเข้ามา
 *   GET    ?m=YYYY-MM              → รายงาน (json)
 *   GET    ?m=YYYY-MM&format=xlsx  → ไฟล์ Excel หน้าตาเดียวกับชีต "ขาย" ที่ใช้ยื่น
 *   POST   multipart (m, file)     → นำเข้าไฟล์ส่งออกของ FlowAccount (เลขที่ซ้ำ = ทับของเดิม)
 *   POST   json { m, row }         → เพิ่ม/แก้ใบจากที่อื่นทีละใบ (มี row.id = แก้)
 *   PATCH  json { m, pairs:[{skip,twin}] | unskip:[key] } → ตั้ง/เลิก "ใบนี้ซ้ำกับอีกใบ ไม่นับ"
 *   DELETE ?m=&id=  |  ?m=&all=1   → ลบใบจากที่อื่น (ใบในระบบลบจากที่นี่ไม่ได้)
 *
 * เก็บใน app_config key sales_tax_extra:<เดือน> — ไม่มี migration · ไม่แตะใบเสร็จ/การเงินจริง
 * สิทธิ์: ดู = finance:read · แก้ = finance:write · เดือนที่ยื่นภาษีปิดแล้ว (tax_lock_before) แก้ไม่ได้
 * ทุกการแก้ลง audit_logs (table_name = sales_tax_report)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };
const svc = () => createServiceClient() as unknown as Sb;
const MAX_ROWS = 1000;
const MAX_MB = 4; // เพดาน body ของ Vercel ~4.5 MB

const monthOf = (v: unknown): string => {
  if (!isMonth(v)) throw new HttpError(400, "เดือนไม่ถูกต้อง");
  return v;
};

/** ของที่เก็บ + ตราเวลา (ใช้กันบันทึกซ้อนกัน) */
type Loaded = { extra: TaxExtra; stamp: string | null };

async function loadExtra(sb: Sb, month: string): Promise<Loaded> {
  const { data, error } = await sb.from("app_config").select("value, updated_at").eq("key", extraKey(month)).maybeSingle();
  if (error) throw new Error(error.message ?? "อ่านรายการที่เพิ่มไว้ไม่สำเร็จ");
  return { extra: parseExtra(data?.value ?? null), stamp: data ? String(data.updated_at) : null };
}

/**
 * เขียนทั้งก้อน JSON แบบ "ต้องเป็นของที่เราอ่านมาเท่านั้น" — ถ้ามีคนอื่น (หรือคลิกซ้ำ) บันทึกแทรกระหว่างอ่านกับเขียน → 409 ไม่เขียนทับ
 * (อ่าน-แก้-เขียนทั้งก้อน ถ้าไม่กัน ใบของอีกคนหายเงียบ หรือใบเดียวกันถูกเพิ่ม 2 ครั้ง = ภาษีซ้ำ)
 */
async function saveExtra(sb: Sb, month: string, extra: TaxExtra, prevStamp: string | null): Promise<void> {
  const busy = () => new HttpError(409, "มีการบันทึกเดือนนี้ซ้อนกันพอดี — โหลดหน้าใหม่แล้วทำอีกครั้ง (ยังไม่ได้บันทึกรายการนี้)");
  const row = { value: JSON.stringify(extra), updated_at: new Date().toISOString() };
  if (prevStamp == null) {
    const { error } = await sb.from("app_config").insert({ key: extraKey(month), ...row });
    if (error) { if (/duplicate|unique|23505/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw busy(); throw new Error(error.message ?? "บันทึกไม่สำเร็จ"); }
    return;
  }
  const { data, error } = await sb.from("app_config").update(row).eq("key", extraKey(month)).eq("updated_at", prevStamp).select("key");
  if (error) throw new Error(error.message ?? "บันทึกไม่สำเร็จ");
  if (!data || data.length === 0) throw busy();
}

async function loadReceipts(ctx: Ctx, month: string): Promise<ReceiptLike[]> {
  const { start, nextStart } = monthRange(month);
  let failed: unknown = null;
  // select("*") — ไม่ระบุชื่อคอลัมน์ใหม่ตรง ๆ (base_amt มาจาก 0095) · แบ่งหน้ากันโดนตัดที่ 1,000 แถวเงียบ ๆ
  const rows = await fetchAllPaged<ReceiptLike>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (from, to) => (ctx.supabase as any).from("receipts").select("*")
      .gte("issue_date", start).lt("issue_date", nextStart)
      .order("code", { ascending: true }).order("id", { ascending: true }).range(from, to),
    1000,
    (e) => { failed = e; },
  );
  // รายงานภาษีห้าม "ได้เท่าที่ได้" — ดึงไม่ครบ = ล้มทั้งคำขอ ดีกว่ายอดขาดโดยไม่มีใครรู้
  if (failed) throw new Error((failed as { message?: string })?.message ?? "อ่านใบเสร็จไม่สำเร็จ");
  return rows;
}

async function loadAll(ctx: Ctx, month: string) {
  const receipts = await loadReceipts(ctx, month);
  const loaded = await loadExtra(svc(), month);
  return { receipts, ...loaded, report: buildReport(month, receipts, loaded.extra) };
}

async function assertUnlocked(month: string): Promise<void> {
  const lock = await getTaxLockBefore();
  if (lock && monthRange(month).nextStart <= lock) throw new HttpError(409, "เดือนนี้ยื่นภาษีปิดแล้ว — แก้รายงานไม่ได้");
}

const log = (ctx: Ctx, month: string, action: string, newValue: unknown, oldValue?: unknown) =>
  audit({ userId: ctx.user.id, action, table: "sales_tax_report", recordId: month, oldValue, newValue });

export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "read");
  const url = new URL(req.url);
  const month = monthOf(url.searchParams.get("m"));
  const { report } = await loadAll(ctx, month);

  if (url.searchParams.get("format") === "xlsx") {
    const buf = writeXlsx(buildSalesSheets(report, { name: COMPANY.nameFull, taxId: COMPANY.taxId, branch: COMPANY.branch }));
    const { y, m0 } = monthRange(month);
    // ⚠ ชื่อไฟล์ไทย → ต้องใช้ filename* (RFC 5987) · ใส่ไทยดิบใน header ไม่ได้
    const name = `รายงานภาษีขาย ${THAI_MONTH[m0]} ${y + 543}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="sales-tax-${month}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  }
  return ok(report);
});

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น ปปปป-ดด-วว").refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")), "วันที่ไม่ถูกต้อง");
const rowSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  code: z.string().trim().min(1, "กรอกเลขที่เอกสาร").max(60),
  date: iso,
  name: z.string().trim().max(300).default(""),
  tax_id: z.string().trim().max(20).default(""),
  branch: z.string().trim().max(40).default(""),
  // ติดลบ = ใบลดหนี้
  base: z.number().min(-1_000_000_000).max(1_000_000_000),
  vat: z.number().min(-100_000_000).max(100_000_000),
  note: z.string().trim().max(300).default(""),
  voided: z.boolean().default(false),
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const sb = svc();
  const stamp = { at: new Date().toISOString(), by: ctx.user.id };
  const ctype = req.headers.get("content-type") ?? "";

  // ── นำเข้าไฟล์ ──
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) throw new HttpError(400, "อ่านไฟล์ที่อัปโหลดไม่ได้");
    const month = monthOf(form.get("m"));
    await assertUnlocked(month);
    const f = form.get("file");
    if (!(f instanceof File)) throw new HttpError(400, "ยังไม่ได้แนบไฟล์");
    if (!/\.xlsx$/i.test(f.name)) throw new HttpError(400, "รองรับเฉพาะไฟล์ .xlsx — ถ้าเป็น .xls หรือ .csv ให้เปิดใน Excel แล้วบันทึกเป็น .xlsx ก่อน");
    if (f.size > MAX_MB * 1024 * 1024) throw new HttpError(400, `ไฟล์ใหญ่เกิน ${MAX_MB} MB`);
    let parsed;
    try {
      parsed = parseSalesImport(readXlsx(Buffer.from(await f.arrayBuffer())), month);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
    }
    const { receipts, extra, stamp: prev } = await loadAll(ctx, month);
    const sysCodes = new Set(receipts.map((r) => String(r.code).trim()));
    const problems = [...parsed.problems];
    const byCode = new Map(extra.rows.map((r) => [r.code.trim(), r]));
    let added = 0, updated = 0;
    for (const r of parsed.rows) {
      const code = r.code.trim();
      if (sysCodes.has(code)) { problems.push(`${code}: เลขนี้เป็นใบในระบบอยู่แล้ว ไม่นำเข้าซ้ำ`); continue; }
      const old = byCode.get(code);
      // ⚠ voided ต้องเขียนทับทุกครั้ง — ไฟล์รอบใหม่บอกว่าเป็นใบปกติ ใบที่เคยเป็น "ยกเลิก" ต้องกลับมามียอด
      if (old) { Object.assign(old, r, { voided: !!r.voided, note: r.voided ? "" : (old.note || r.note) }, stamp); updated++; }
      else { const row: ExtraRow = { id: randomUUID(), ...r, ...stamp }; extra.rows.push(row); byCode.set(code, row); added++; }
    }
    if (added + updated === 0) {
      // ไม่มีใบไหนเข้าเลย → ส่งเหตุผลรายแถวกลับไปด้วย (ไม่ใช่ข้อความรวมอย่างเดียว)
      return ok({ added: 0, updated: 0, otherMonth: parsed.otherMonth, problems, warnings: parsed.warnings, sheet: parsed.sheet, empty: true });
    }
    if (extra.rows.length > MAX_ROWS) throw new HttpError(400, `เดือนนี้มีใบที่เพิ่มเกิน ${MAX_ROWS} ใบ — ไฟล์น่าจะผิด`);
    await saveExtra(sb, month, extra, prev);
    await log(ctx, month, "import", { file: f.name, added, updated, skipped: problems.length });
    return ok({ added, updated, otherMonth: parsed.otherMonth, problems, warnings: parsed.warnings, sheet: parsed.sheet, empty: false });
  }

  // ── เพิ่ม/แก้ทีละใบ ──
  const json = await req.json().catch(() => null);
  if (!json) throw new HttpError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  const body = z.object({ m: z.string(), row: rowSchema }).parse(json);
  const month = monthOf(body.m);
  await assertUnlocked(month);
  const r = body.row;
  if (r.date.slice(0, 7) !== month) throw new HttpError(400, "วันที่ของใบไม่อยู่ในเดือนที่เปิดอยู่");
  if (!r.voided) {
    if (!r.name) throw new HttpError(400, "กรอกชื่อลูกค้า");
    if (r.base === 0) throw new HttpError(400, "กรอกยอดขายก่อน VAT");
    if (r.vat === 0) throw new HttpError(400, "ใบที่ไม่มี VAT ไม่ต้องใส่ในรายงานภาษีขาย");
    if (r.base < 0 !== r.vat < 0) throw new HttpError(400, "ยอดขายกับ VAT ต้องเป็นบวกทั้งคู่ หรือติดลบทั้งคู่ (ใบลดหนี้)");
    if (Math.abs(r.vat - r.base * 0.07) > Math.max(1, Math.abs(r.base) * 0.001)) throw new HttpError(400, "VAT ไม่เท่ากับ 7% ของยอดขาย — เช็คตัวเลขอีกครั้ง");
  }
  const { receipts, extra, stamp: prev } = await loadAll(ctx, month);
  if (receipts.some((x) => String(x.code).trim() === r.code)) throw new HttpError(409, `เลขที่ ${r.code} เป็นใบในระบบอยู่แล้ว ไม่ต้องเพิ่มซ้ำ`);
  const clash = extra.rows.find((x) => x.code.trim() === r.code && x.id !== r.id);
  if (clash) throw new HttpError(409, `เลขที่ ${r.code} มีอยู่แล้วในเดือนนี้`);
  const fields = { code: r.code, date: r.date, name: r.voided ? "ยกเลิก" : r.name, tax_id: r.tax_id, branch: r.branch,
    base: r.voided ? 0 : round2(r.base), vat: r.voided ? 0 : round2(r.vat), note: r.note, voided: r.voided };
  let row: ExtraRow; let before: ExtraRow | undefined;
  if (r.id) {
    const i = extra.rows.findIndex((x) => x.id === r.id);
    if (i < 0) throw new HttpError(404, "ไม่พบใบนี้ (อาจถูกลบไปแล้ว)");
    before = { ...extra.rows[i] };
    row = extra.rows[i] = { ...extra.rows[i], ...fields, ...stamp };
  } else {
    if (extra.rows.length >= MAX_ROWS) throw new HttpError(400, `เดือนนี้เพิ่มได้ไม่เกิน ${MAX_ROWS} ใบ`);
    row = { id: randomUUID(), ...fields, ...stamp };
    extra.rows.push(row);
  }
  await saveExtra(sb, month, extra, prev);
  await log(ctx, month, r.id ? "edit_row" : "add_row", row, before);
  return ok(row);
});

const key = z.string().regex(/^[sx]:.{1,100}$/);
const patchSchema = z.object({
  m: z.string(),
  pairs: z.array(z.object({ skip: key, twin: key })).max(MAX_ROWS).optional(),
  unskip: z.array(key).max(MAX_ROWS).optional(),
});

export const PATCH = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const json = await req.json().catch(() => null);
  if (!json) throw new HttpError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  const body = patchSchema.parse(json);
  const month = monthOf(body.m);
  await assertUnlocked(month);
  const { receipts, extra, stamp: prev, report } = await loadAll(ctx, month);
  const byKey = new Map<string, TaxRow>([...receipts.map(receiptToRow), ...extra.rows.map(extraToRow)].map((r) => [r.key, r]));
  // เริ่มจากคู่ที่ "ยังมีผลจริง" (ตัดคู่ค้างที่ใบหาย/ยกเลิก/ยอดไม่ผ่านทิ้ง) — ไม่งั้นคู่ค้างที่มองไม่เห็นจะบล็อกการจับคู่ใหม่
  const skip: Record<string, string> = { ...report.skip };
  const before = { ...skip };

  for (const k of body.unskip ?? []) delete skip[k];
  for (const p of body.pairs ?? []) {
    // "ไม่นับ" ได้เฉพาะใบที่ชี้คู่ได้จริง คู่ต้องอยู่ในรายงาน และยอดใบที่นับต้องไม่น้อยกว่า — กันเอาใบออกจากรายงานลอย ๆ
    const why = pairProblem(byKey.get(p.skip), byKey.get(p.twin));
    if (why) throw new HttpError(400, why);
    if (skip[p.twin]) throw new HttpError(400, "ใบที่จะนับแทนถูกตั้งเป็นไม่นับอยู่ — กด “กลับมานับ” ใบนั้นก่อน");
    if (Object.values(skip).includes(p.skip)) throw new HttpError(400, "ใบนี้ถูกใช้นับแทนอีกใบอยู่ — เลิกคู่นั้นก่อน");
    if (Object.entries(skip).some(([k, t]) => t === p.twin && k !== p.skip)) throw new HttpError(400, "ใบที่จะนับแทนถูกจับคู่กับใบอื่นไปแล้ว");
    skip[p.skip] = p.twin;
  }
  extra.skip = skip;
  await saveExtra(svc(), month, extra, prev);
  await log(ctx, month, "set_pairs", { pairs: body.pairs ?? [], unskip: body.unskip ?? [] }, before);
  return ok({ skip });
});

export const DELETE = withRoute(async (req: Request) => {
  const ctx = await requirePermission("finance", "write");
  const url = new URL(req.url);
  const month = monthOf(url.searchParams.get("m"));
  await assertUnlocked(month);
  const sb = svc();
  const { extra, stamp: prev } = await loadExtra(sb, month);
  if (url.searchParams.get("all") === "1") {
    const n = extra.rows.length;
    await saveExtra(sb, month, { rows: [], skip: {} }, prev);
    await log(ctx, month, "delete_all", { removed: n }, extra); // เก็บของเดิมทั้งก้อนไว้ กู้คืนได้
    return ok({ removed: n });
  }
  const id = url.searchParams.get("id") ?? "";
  const i = extra.rows.findIndex((x) => x.id === id);
  if (i < 0) throw new HttpError(404, "ไม่พบใบนี้ (อาจถูกลบไปแล้ว)");
  const [gone] = extra.rows.splice(i, 1);
  const k = `x:${id}`;
  for (const [a, b] of Object.entries(extra.skip)) if (a === k || b === k) delete extra.skip[a];
  await saveExtra(sb, month, extra, prev);
  await log(ctx, month, "delete_row", null, gone);
  return ok({ removed: 1 });
});
