/**
 * รายงานภาษีซื้อรายเดือน (เจ้าของ 27 พ.ย.69) — แทนงานพิมพ์ชีต "ซื้อ" ของธุรการ
 *
 *   บิลซื้อเข้ามา 3 ทาง: สแกน/ถ่ายรูปแล้วให้ AI อ่าน (src "ai") · กรอกเอง ("manual") · นำเข้าจากไฟล์เดิม ("import")
 *   เก็บใน app_config รายเดือน (purchase_tax:<เดือนที่ยื่น>) + สมุดร้านค้า (purchase_suppliers) — ไม่มี migration
 *
 * ⚠ หลักที่ต้องรักษา (ผ่านตัวตรวจบัญชี 27 พ.ย.69 — แก้ต้องให้ตรวจอีก)
 *   - "เดือน" ของรายงาน = เดือนที่เอาภาษีซื้อไปใช้ ไม่ใช่เดือนบนบิล (บิลเดือนก่อนเอามาใช้ได้ภายใน 6 เดือนถัดไป · ใบลดหนี้ไม่มีกรอบนี้)
 *   - AI อ่านแล้ว "ยังไม่ถือว่าถูก" จนกว่าคนติ๊กตรวจ (checked)
 *   - ปัญหาร้ายแรง (blockers: บิลซ้ำ · เกิน 6 เดือน · ไม่ได้ออกในนามเรา · ไม่มี VAT · ใบกำกับอย่างย่อ ฯลฯ) ติ๊กตรวจไม่ได้
 *     ต้องแก้ข้อมูลให้ถูก หรือตั้งเป็น "ไม่ใช้ภาษีซื้อ" (no_claim) — แถว no_claim ไม่นับยอด แยกไว้อีกชีต
 *   - คำเตือนที่ตรวจซ้ำได้จากข้อมูลในแถว (ผู้ซื้อ · ชนิดเอกสาร) ต้องคิดใหม่ทุกครั้ง ห้ามเก็บเป็นข้อความที่ถูกล้างตอนติ๊ก
 *   - ระบบไม่แก้ตัวเลขให้เอง — ถอดเองเมื่อไหร่ต้องบอก
 *
 * ไฟล์นี้ไม่แตะฐานข้อมูล และห้าม import ของฝั่ง server (หน้าจอ import ไฟล์นี้)
 * เทสด้วย: node --experimental-strip-types scripts/verify-purchase-tax.mts
 */
import type { SheetGrid } from "./floor-calc/xlsx-read.ts";
import { cleanTaxId, fileNum, monthRange, parseFileDate, reportBranch, round2 } from "./sales-tax-report.ts";

/** อัตรา VAT (ต่ออายุเป็นรอบตามพระราชกฤษฎีกา — เปลี่ยนที่นี่ที่เดียว) */
export const VAT_RATE = 0.07;
export const TH_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const PAY_KINDS = ["โอน", "เครดิต", "สด"] as const;
export type PayKind = (typeof PAY_KINDS)[number] | "";

export const purchaseKey = (month: string) => `purchase_tax:${month}`;
export const SUPPLIERS_KEY = "purchase_suppliers";
/** เลขผู้เสียภาษีของบริษัทเรา — บิลซื้อต้องออกในนามเลขนี้จึงใช้ภาษีซื้อได้ */
export const OUR_TAX_ID = "0105560023352";

/** ชนิดเอกสาร: ใบกำกับเต็มรูป · ใบลดหนี้ · ใบเพิ่มหนี้ · ใบกำกับอย่างย่อ (ใช้ภาษีซื้อไม่ได้) */
export type DocKind = "invoice" | "credit" | "debit" | "abbr";

export type PurchaseRow = {
  id: string;
  /** เลขที่ใบกำกับของร้าน */
  code: string;
  /** วันที่บนบิล (ค.ศ. YYYY-MM-DD) · "" = AI อ่านไม่ออก */
  date: string;
  name: string;
  tax_id: string;
  branch: string;
  /** ติดลบ = ใบลดหนี้ */
  base: number;
  vat: number;
  pay: PayKind;
  note: string;
  src: "ai" | "manual" | "import";
  /** คนตรวจกับบิลจริงแล้ว */
  checked: boolean;
  kind?: DocKind;
  /** เลขผู้เสียภาษีของผู้ซื้อที่อ่านได้จากบิล (เฉพาะบิลที่ AI อ่าน) — undefined = ไม่ได้ตรวจ · "" = บนบิลไม่มี */
  buyer_tax_id?: string;
  /** มีข้อความ = ไม่ใช้ภาษีซื้อของใบนี้ (เหตุผล) → ไม่นับยอด แยกไปอีกชีต */
  no_claim?: string;
  /** ที่มาของหน้าสแกน เช่น "บิลตุลา.pdf หน้า 3" — ไว้หยิบกระดาษมาเทียบ */
  ref?: string;
  /** คนแก้ตัวเลข/ร้านของใบนี้แล้ว (ปุ่มล้างบิลที่ AI อ่านจะไม่ลบใบนี้) */
  edited?: boolean;
  /** ข้อสังเกตชั่วคราวจากตอนอ่าน (ช่องที่อ่านไม่ชัด · ตัวเลขที่ระบบถอดเอง) — หายเมื่อคนแก้ตัวเลขหรือติ๊กตรวจ */
  ai_flags?: string[];
  at?: string;
  by?: string;
};
/** หน้าสแกนที่ไม่ได้บิล (อ่านพลาด/ไม่ใช่ใบกำกับ/บันทึกไม่สำเร็จ) — เก็บไว้ให้คนหยิบกระดาษมาดู ไม่หายตอนปิดหน้า */
export type ScanMiss = { id: string; ref: string; reason: string; at: string };
export type PurchaseStore = { rows: PurchaseRow[]; misses?: ScanMiss[] };

export type Supplier = { name: string; tax_id: string; branch: string; pay: PayKind };
export type SupplierStore = { list: Supplier[] };

export function parsePurchaseStore(raw: string | null | undefined): PurchaseStore {
  if (!raw) return { rows: [], misses: [] };
  try {
    const j = JSON.parse(raw);
    return {
      rows: Array.isArray(j?.rows) ? (j.rows as PurchaseRow[]).filter((r) => r && typeof r.id === "string") : [],
      misses: Array.isArray(j?.misses) ? (j.misses as ScanMiss[]).filter((m) => m && typeof m.id === "string") : [],
    };
  } catch { return { rows: [], misses: [] }; }
}
export function parseSupplierStore(raw: string | null | undefined): SupplierStore {
  if (!raw) return { list: [] };
  try {
    const j = JSON.parse(raw);
    return { list: Array.isArray(j?.list) ? (j.list as Supplier[]).filter((s) => s && typeof s.tax_id === "string" && typeof s.name === "string") : [] };
  } catch { return { list: [] }; }
}

// ─── เลขผู้เสียภาษี ───────────────────────────────────────────────────────

/** เติม 0 หน้าให้ครบ 13 หลัก (Excel ตัด 0 หน้าทิ้ง → ไฟล์เดิมเหลือ 12 หลัก) · ว่าง = "" */
export function taxId13(v: unknown): string {
  const d = cleanTaxId(v);
  return d && d.length < 13 ? d.padStart(13, "0") : d;
}
/** เลข 13 หลักของไทย (ทั้งบุคคลและนิติบุคคล) หลักสุดท้ายเป็นตัวตรวจ — อ่านผิดหลักเดียวจะไม่ผ่าน */
export function taxIdValid(v: unknown): boolean {
  const d = taxId13(v);
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

const normName = (s: string) => (s ?? "").replace(/\s+/g, "").replace(/[.\-()]/g, "").toLowerCase();
const branchOf = (taxId: string, branch: string) => reportBranch(taxId13(taxId), branch ?? "");

/**
 * หาร้านในสมุด: เลขผู้เสียภาษีตรง (สาขาตรงก่อน) → ชื่อตรงเป๊ะ (ไม่เดาชื่อคล้าย)
 * sameBranch = false แปลว่าเจอร้านเลขเดียวกันแต่คนละสาขา (ปั๊ม/ร้านเครือ) — ผู้เรียกต้องใช้สาขาจากบิล ไม่ใช่ของสมุด
 */
export function findSupplier(list: Supplier[], taxId: string, name: string, branch = ""): (Supplier & { sameBranch: boolean }) | null {
  const id = taxId13(taxId);
  if (id) {
    const same = list.filter((s) => taxId13(s.tax_id) === id);
    if (same.length) {
      const b = branchOf(id, branch);
      const hit = same.find((s) => branchOf(id, s.branch) === b);
      return hit ? { ...hit, sameBranch: true } : { ...same[0], sameBranch: false };
    }
    return null;
  }
  const n = normName(name);
  const byName = n ? list.find((s) => normName(s.name) === n) : undefined;
  return byName ? { ...byName, sameBranch: true } : null;
}

// ─── วิธีชำระที่โชว์ในรายงาน ───────────────────────────────────────────────

/** คอลัมน์ "วิธีชำระ" แบบที่ธุรการใช้: ใบลดหนี้ · ยอดเดือน <เดือนของบิล> (บิลเดือนก่อน) · โอน/เครดิต/สด */
export function payLabel(row: Pick<PurchaseRow, "base" | "date" | "pay">, month: string): string {
  if (row.base < 0) return "ใบลดหนี้";
  if (row.date && row.date.slice(0, 7) < month) return `ยอดเดือน ${TH_MONTH_SHORT[Number(row.date.slice(5, 7)) - 1] ?? ""}`;
  return row.pay || "";
}

// ─── ตัวตรวจต่อแถว ────────────────────────────────────────────────────────

export type RowCheckCtx = {
  month: string;
  suppliers: Supplier[];
  /** กุญแจบิล (billKeys) ของบิลที่อยู่ในเดือนอื่น → เดือนนั้น (YYYY-MM) */
  otherMonths?: Map<string, string>;
  /** จำนวนครั้งที่กุญแจบิลโผล่ในเดือนนี้ (เฉพาะแถวที่ใช้ภาษีซื้อ) */
  countInMonth?: Map<string, number>;
};

/** เลขที่เอกสารแบบเทียบกัน: ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข + เลข 0 นำหน้า ("IV-0012" = "iv0012" · "0012" = "12") */
export const normCode = (code: string) => (code ?? "").toUpperCase().replace(/[^0-9A-Zก-๙]/g, "").replace(/^0+(?=.)/, "");

/**
 * กุญแจกันบิลซ้ำ: เลขผู้เสียภาษี+เลขที่ (ตัวหลัก) · ไม่มีเลขผู้เสียภาษีหรือเลขที่ → ชื่อ+วันที่+ยอดรวม (ค่าโฆษณาต่างประเทศ ฯลฯ)
 * คืน [] ถ้าข้อมูลไม่พอจะเทียบ
 */
export function billKeys(r: Pick<PurchaseRow, "tax_id" | "code" | "name" | "date" | "base" | "vat">): string[] {
  const id = taxId13(r.tax_id), code = normCode(r.code);
  if (id && code) return [`${id}|${code}`];
  const n = normName(r.name);
  return n && r.date ? [`~${id || n}|${r.date}|${round2((Number(r.base) || 0) + (Number(r.vat) || 0))}`] : [];
}

/** จำนวนเดือนจากเดือนของบิลถึงเดือนที่ยื่น (0 = เดือนเดียวกัน) */
function monthsBetween(billMonth: string, month: string): number {
  const [y1, m1] = billMonth.split("-").map(Number), [y2, m2] = month.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export type RowIssues = {
  /** ทุกข้อที่ควรให้คนเห็น */
  warnings: string[];
  /** ส่วนที่ร้ายแรง — ติ๊กตรวจไม่ได้จนกว่าจะแก้ หรือ ตั้งเป็นไม่ใช้ภาษีซื้อ */
  blockers: string[];
};

export function rowIssues(r: PurchaseRow, ctx: RowCheckCtx): RowIssues {
  const warnings: string[] = [], blockers: string[] = [];
  const warn = (t: string) => warnings.push(t);
  const block = (t: string) => { warnings.push(t); blockers.push(t); };
  const id = taxId13(r.tax_id);
  const isCredit = r.base < 0;

  if (r.kind === "abbr") block("เป็นใบกำกับภาษีอย่างย่อ ใช้ภาษีซื้อไม่ได้ (ต้องขอใบกำกับเต็มรูป)");
  if (r.buyer_tax_id !== undefined) {
    const buyer = taxId13(r.buyer_tax_id);
    if (!buyer) warn("ไม่เห็นเลขผู้เสียภาษีของผู้ซื้อบนบิล เช็คว่าออกในนามบริษัท");
    else if (buyer !== OUR_TAX_ID) block("บิลนี้ไม่ได้ออกในนามบริษัทเรา (เลขผู้ซื้อบนบิลไม่ตรง) ใช้ภาษีซื้อไม่ได้");
  }
  if (r.kind === "debit") warn("เป็นใบเพิ่มหนี้");

  if (!id) warn("ไม่มีเลขผู้เสียภาษีของร้าน");
  else if (!taxIdValid(id)) warn("เลขผู้เสียภาษีไม่ผ่านตัวตรวจ 13 หลัก น่าจะอ่านหรือพิมพ์ผิด");
  else if (id === OUR_TAX_ID) warn("เลขผู้เสียภาษีเป็นของบริษัทเราเอง ต้องเป็นเลขของร้าน");
  if (!r.code.trim()) warn("ไม่มีเลขที่เอกสาร");

  if (!r.date) block("ไม่มีวันที่บนบิล");
  else {
    const gap = monthsBetween(r.date.slice(0, 7), ctx.month);
    if (gap < 0) block("วันที่บนบิลอยู่หลังเดือนที่ยื่น");
    // ใบลดหนี้ต้องหักในเดือนที่ได้รับ ไม่มีกรอบ 6 เดือน (ม.82/10) — ห้ามเตือนให้ตัดทิ้ง
    else if (gap > 6 && !isCredit) block("บิลเก่าเกิน 6 เดือน ใช้ภาษีซื้อเดือนนี้ไม่ได้");
  }

  if (r.base === 0) block("ยอดก่อน VAT เป็น 0");
  if (r.vat === 0) block("บิลนี้ไม่มี VAT ไม่มีภาษีซื้อให้ใช้");
  else if (r.base < 0 !== r.vat < 0) block("ยอดกับ VAT เครื่องหมายไม่ตรงกัน");
  else if (Math.abs(r.vat - r.base * VAT_RATE) > 1) warn("VAT ไม่เท่ากับ 7% ของยอดก่อน VAT");

  if (id && taxIdValid(id) && id !== OUR_TAX_ID) {
    const same = ctx.suppliers.filter((s) => taxId13(s.tax_id) === id);
    if (!same.length) warn("ร้านใหม่ ยังไม่มีในสมุดร้าน เช็คชื่อกับเลขผู้เสียภาษี");
    else if (!same.some((s) => branchOf(id, s.branch) === branchOf(id, r.branch))) warn("สาขานี้ของร้านยังไม่มีในสมุดร้าน เช็คเลขสาขากับบิล");
  }

  for (const k of billKeys(r)) {
    if ((ctx.countInMonth?.get(k) ?? 0) > 1) block("บิลใบนี้ซ้ำกับอีกใบในเดือนนี้");
    const other = ctx.otherMonths?.get(k);
    if (other) block(`บิลนี้ลงไว้ในเดือน ${TH_MONTH_SHORT[Number(other.slice(5, 7)) - 1]} ${Number(other.slice(0, 4)) + 543} แล้ว`);
  }
  if (r.base > 0 && r.date && r.date.slice(0, 7) === ctx.month && !r.pay) warn("ยังไม่ได้เลือกวิธีชำระ");
  for (const f of r.ai_flags ?? []) warn(f);
  return { warnings, blockers };
}

// ─── รวมเป็นรายงาน ─────────────────────────────────────────────────────────

export type PurchaseView = PurchaseRow & { total: number; pay_label: string; warnings: string[]; blockers: string[] };
export type PayBucket = { label: string; count: number; base: number; vat: number; total: number };
export type PurchaseReport = {
  month: string;
  /** บิลที่ใช้ภาษีซื้อ (นับยอด) */
  rows: PurchaseView[];
  /** บิลที่ตั้งเป็นไม่ใช้ภาษีซื้อ (ไม่นับยอด) */
  noClaim: PurchaseView[];
  misses: ScanMiss[];
  totals: { count: number; base: number; vat: number; total: number; unchecked: number; warned: number };
  /** ยอดแยกตามคอลัมน์วิธีชำระ — แบบชีต "สรุปทั้งหมด" */
  byPay: PayBucket[];
};

const sortRows = (a: PurchaseView, b: PurchaseView) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "th") || a.code.localeCompare(b.code);

export function buildPurchaseReport(month: string, store: PurchaseStore, suppliers: Supplier[], otherMonths?: Map<string, string>): PurchaseReport {
  // นับซ้ำเฉพาะแถวที่ใช้ภาษีซื้อ — ใบที่ตั้ง "ไม่ใช้" แล้วไม่ทำให้อีกใบติดซ้ำ
  const countInMonth = new Map<string, number>();
  for (const r of store.rows) if (!r.no_claim) for (const k of billKeys(r)) countInMonth.set(k, (countInMonth.get(k) ?? 0) + 1);
  const ctx: RowCheckCtx = { month, suppliers, otherMonths, countInMonth };
  const view = (r: PurchaseRow): PurchaseView => {
    const base = round2(Number(r.base) || 0), vat = round2(Number(r.vat) || 0);
    const row: PurchaseRow = { ...r, base, vat, tax_id: taxId13(r.tax_id) };
    const issues = r.no_claim ? { warnings: [], blockers: [] } : rowIssues(row, ctx);
    return { ...row, branch: branchOf(row.tax_id, r.branch), total: round2(base + vat), pay_label: payLabel(row, month), ...issues };
  };
  const rows = store.rows.filter((r) => !r.no_claim).map(view).sort(sortRows);
  const noClaim = store.rows.filter((r) => !!r.no_claim).map(view).sort(sortRows);
  const pay = new Map<string, PayBucket>();
  for (const r of rows) {
    const k = r.pay_label || "(ยังไม่เลือก)";
    const p = pay.get(k) ?? { label: k, count: 0, base: 0, vat: 0, total: 0 };
    p.count++; p.base = round2(p.base + r.base); p.vat = round2(p.vat + r.vat); p.total = round2(p.total + r.total);
    pay.set(k, p);
  }
  const order = (l: string) => (l === "สด" ? 0 : l === "เครดิต" ? 1 : l === "โอน" ? 2 : l.startsWith("ยอดเดือน") ? 3 : l === "ใบลดหนี้" ? 4 : 5);
  return {
    month, rows, noClaim, misses: store.misses ?? [],
    totals: {
      count: rows.length,
      base: round2(rows.reduce((s, r) => s + r.base, 0)),
      vat: round2(rows.reduce((s, r) => s + r.vat, 0)),
      total: round2(rows.reduce((s, r) => s + r.total, 0)),
      unchecked: rows.filter((r) => !r.checked).length,
      warned: rows.filter((r) => r.warnings.length > 0).length,
    },
    byPay: [...pay.values()].sort((a, b) => order(a.label) - order(b.label) || a.label.localeCompare(b.label, "th")),
  };
}

// ─── ผลที่ AI อ่าน → แถวร่าง ───────────────────────────────────────────────

/** สิ่งที่ขอให้ AI คืนต่อบิล 1 ใบ (ดู src/lib/ai/read-bill.ts) */
export type AiBill = {
  doc_type: "tax_invoice" | "abbreviated_tax_invoice" | "credit_note" | "debit_note" | "other";
  doc_no: string;
  /** ค.ศ. YYYY-MM-DD หรือ "" ถ้าอ่านไม่ได้ */
  date: string;
  seller_name: string;
  seller_tax_id: string;
  seller_branch: string;
  buyer_tax_id: string;
  base: number | null;
  vat: number | null;
  total: number | null;
  /** กระดาษใบนี้พิมพ์/ประทับว่า "สำเนา" */
  is_copy: boolean;
  /** ช่องที่อ่านไม่ชัด/ไม่แน่ใจ (ข้อความไทยสั้น ๆ) */
  unclear: string[];
};

/**
 * เลขผู้เสียภาษีจากข้อความที่ AI คืน: เอาเลข 13 หลักชุดแรก (AI อาจพ่วงสาขามาในช่องเดียวกัน "0105550000015 สาขา 00004")
 * ไม่ต่อเลขทุกตัวเข้าด้วยกัน — ได้เลขยาวเกินแล้วทั้งหน้าบันทึกไม่ผ่าน
 */
export function pickTaxId(v: unknown): string {
  const s = String(v ?? "").replace(/(?<=\d)[\s-](?=\d)/g, "");
  const m = /\d{13}/.exec(s);
  if (m) return m[0];
  const d = taxId13(s);
  return d.length <= 13 ? d : "";
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** วันที่จาก AI: ต้องเป็น ค.ศ. — ถ้าหลุดมาเป็น พ.ศ. (25xx) แปลงให้ · อ่านไม่ออก = "" */
export function aiDate(v: string): string {
  return parseFileDate((v ?? "").trim()) ?? "";
}
const m2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * แปลงบิลที่ AI อ่าน → แถวร่าง (ยังไม่มี id)
 *   - เจอร้านในสมุด (เลขผู้เสียภาษีตรง) → ใช้ชื่อ/วิธีชำระของสมุด · สาขาใช้ของสมุดเฉพาะเมื่อตรงกับบิล ไม่งั้นใช้ของบิล
 *   - ใบลดหนี้ → ยอดติดลบ · ใบกำกับอย่างย่อ → ตั้ง "ไม่ใช้ภาษีซื้อ" ให้เลย
 *   - ตัวเลขที่บิลไม่ได้พิมพ์แล้วระบบถอดเอง / ยอดไม่ลงตัว → ติดธงบอก ไม่แก้ตัวเลขให้
 */
export function aiBillToRow(b: AiBill, suppliers: Supplier[], ref: string): Omit<PurchaseRow, "id"> | null {
  if (b.doc_type === "other") return null;
  const flags: string[] = [...(b.unclear ?? []).slice(0, 8).map((u) => `AI อ่านไม่ชัด: ${clip(String(u), 120)}`)];
  let base = b.base, vat = b.vat;
  const total = b.total;
  if (base == null && vat == null && total != null) flags.push(`บนบิลเห็นแต่ยอดรวม ${m2(total)} ระบบถอดยอดก่อน VAT กับ VAT ให้เอง เช็คว่าเป็นใบกำกับเต็มรูป`);
  else if (vat == null && base != null) flags.push("บนบิลไม่เห็นช่อง VAT ระบบคิดให้เอง เช็คกับบิล");
  else if (base == null && vat != null) flags.push("บนบิลไม่เห็นยอดก่อน VAT ระบบคิดให้เอง เช็คกับบิล");
  if (base == null && total != null) base = vat != null ? total - vat : total / (1 + VAT_RATE);
  if (vat == null && base != null) vat = total != null ? total - base : base * VAT_RATE;
  base = round2(Math.abs(base ?? 0)); vat = round2(Math.abs(vat ?? 0));
  if (total != null && Math.abs(base + vat - Math.abs(total)) > 0.05) flags.push(`ยอดก่อน VAT + VAT ไม่เท่ากับยอดรวมบนบิล (${m2(Math.abs(total))})`);
  if (b.is_copy) flags.push("กระดาษใบนี้เป็นสำเนา ใช้ภาษีซื้อต้องมีต้นฉบับ");
  const kind: DocKind = b.doc_type === "credit_note" ? "credit" : b.doc_type === "debit_note" ? "debit" : b.doc_type === "abbreviated_tax_invoice" ? "abbr" : "invoice";
  if (kind === "credit") { base = -base; vat = -vat; flags.push("ใบลดหนี้: เช็คว่ายอดที่ลงคือส่วนที่ลด ไม่ใช่มูลค่าใบเดิม"); }

  const id = pickTaxId(b.seller_tax_id);
  if (!id && cleanTaxId(b.seller_tax_id)) flags.push(`AI อ่านเลขผู้เสียภาษีของร้านได้ไม่ครบ 13 หลัก (${clip(String(b.seller_tax_id), 30)})`);
  const sup = id ? findSupplier(suppliers, id, "", b.seller_branch) : null;
  if (!id) {
    const byName = findSupplier(suppliers, "", b.seller_name);
    if (byName) flags.push(`AI อ่านเลขผู้เสียภาษีไม่ได้ ในสมุดร้าน "${byName.name}" ใช้เลข ${taxId13(byName.tax_id)}`);
  }
  return {
    code: clip((b.doc_no ?? "").trim(), 60),
    date: aiDate(b.date),
    name: sup ? sup.name : clip((b.seller_name ?? "").trim(), 300),
    tax_id: id,
    branch: sup?.sameBranch ? sup.branch : clip((b.seller_branch ?? "").trim(), 40),
    base, vat,
    pay: sup?.pay ?? "",
    note: "",
    src: "ai",
    checked: false,
    kind,
    buyer_tax_id: pickTaxId(b.buyer_tax_id),
    ...(kind === "abbr" ? { no_claim: "ใบกำกับภาษีอย่างย่อ" } : {}),
    ref: clip(ref, 200),
    ai_flags: flags.slice(0, 15).map((f) => clip(f, 280)),
  };
}

// ─── นำเข้าสมุดร้าน + ประวัติจากไฟล์รายงานเดิมของธุรการ ────────────────────────

const PAY_FROM_TEXT = (t: string): PayKind => (/โอน/.test(t) ? "โอน" : /เครดิต/.test(t) ? "เครดิต" : /สด/.test(t) ? "สด" : "");

/**
 * อ่านไฟล์ "รายงานภาษีซื้อ-ขาย เดือน N.xlsx" → สมุดร้าน (ชีต "ชื่อบริษัท": ชื่อ · เลขผู้เสียภาษี · สาขา)
 * + วิธีชำระที่ร้านนั้นใช้บ่อยสุด (นับจากชีต "ซื้อ" คอลัมน์สุดท้าย) · และแถวบิลของชีต "ซื้อ" (ไว้นำเข้าเป็นประวัติ)
 */
export function parseOldPurchaseFile(sheets: SheetGrid[]): { suppliers: Supplier[]; rows: Omit<PurchaseRow, "id">[]; problems: string[] } {
  const problems: string[] = [];
  const byId = new Map<string, Supplier>();
  const dir = sheets.find((s) => /ชื่อบริษัท/.test(s.name));
  for (const r of dir?.rows ?? []) {
    const name = String(r[0] ?? "").trim(), id = taxId13(r[1]);
    if (!name || !id) continue;
    const key = `${id}|${branchOf(id, String(r[2] ?? ""))}`;
    if (!byId.has(key)) byId.set(key, { name, tax_id: id, branch: branchOf(id, String(r[2] ?? "")), pay: "" });
  }
  const rows: Omit<PurchaseRow, "id">[] = [];
  const payCount = new Map<string, Map<PayKind, number>>();
  const buy = sheets.find((s) => /^ซื้อ/.test(s.name.trim()));
  if (buy) {
    const hdr = buy.rows.findIndex((r) => r.some((c) => /เลขที่เอกสาร/.test(String(c).replace(/\s+/g, ""))));
    for (let i = hdr + 1; hdr >= 0 && i < buy.rows.length; i++) {
      const r = buy.rows[i] ?? [];
      const code = String(r[1] ?? "").trim();
      // แถวข้อมูล = มีเลขลำดับ + มีชื่อร้าน (เลขที่เอกสารว่างได้ — ค่าโฆษณาต่างประเทศไม่มีเลขใบกำกับ)
      if (!/^\d+$/.test(String(r[0] ?? "").trim()) || !String(r[3] ?? "").trim()) continue;
      const date = parseFileDate(String(r[2] ?? ""));
      let base = fileNum(String(r[6] ?? ""));
      if (!date || Number.isNaN(base)) { problems.push(`ชีตซื้อ แถว ${i + 1} (${code || String(r[3]).trim()}): อ่านวันที่หรือยอดไม่ได้ (ในไฟล์เขียน "${String(r[2] ?? "")}")`); continue; }
      const id = taxId13(r[4]);
      const payText = String(r[10] ?? "");
      const pay = PAY_FROM_TEXT(payText);
      const vatRaw = fileNum(String(r[7] ?? ""));
      let vat = Number.isNaN(vatRaw) ? base * VAT_RATE : vatRaw;
      const flags: string[] = [];
      let checked = true;
      // ไฟล์ไม่มีช่อง VAT → ระบบคิดให้ = ยังไม่ถือว่าตรวจแล้ว
      if (Number.isNaN(vatRaw)) { checked = false; flags.push("ในไฟล์ไม่มีช่อง VAT ระบบคิด 7% ให้เอง เช็คกับบิล"); }
      // เขียนว่า "ใบลดหนี้" แต่ยอดเป็นบวก → กลับเป็นติดลบ (ใบลดหนี้ต้องหักภาษีซื้อ) และให้คนดูอีกที
      if (/ลดหนี้/.test(payText) && base > 0) { base = -base; vat = -Math.abs(vat); checked = false; flags.push("ในไฟล์เขียนว่าใบลดหนี้แต่ยอดเป็นบวก ระบบกลับเป็นติดลบให้ เช็คกับบิล"); }
      const branch = branchOf(id, String(r[5] ?? ""));
      rows.push({ code, date, name: String(r[3] ?? "").trim(), tax_id: id, branch, base: round2(base), vat: round2(vat), pay, note: "", src: "import", checked, ...(base < 0 ? { kind: "credit" as const } : {}), ...(flags.length ? { ai_flags: flags } : {}) });
      if (id) {
        const key = `${id}|${branch}`;
        if (!byId.has(key)) byId.set(key, { name: String(r[3] ?? "").trim(), tax_id: id, branch, pay: "" });
        if (pay) { const m = payCount.get(key) ?? new Map(); m.set(pay, (m.get(pay) ?? 0) + 1); payCount.set(key, m); }
      }
    }
  }
  for (const [key, s] of byId) {
    const m = payCount.get(key);
    if (m) s.pay = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (!dir && !buy) problems.push("ไม่พบชีต “ชื่อบริษัท” หรือ “ซื้อ” ในไฟล์");
  return { suppliers: [...byId.values()], rows, problems };
}

/** รวมสมุดร้าน: ของเดิมอยู่ครบ · ร้าน/สาขาใหม่ต่อท้าย · ร้านเดิมที่ยังไม่มีวิธีชำระได้ค่าจากของใหม่ */
export function mergeSuppliers(cur: Supplier[], add: Supplier[]): { list: Supplier[]; added: number; changed: boolean } {
  const key = (s: Supplier) => `${taxId13(s.tax_id)}|${branchOf(s.tax_id, s.branch)}`;
  const map = new Map(cur.map((s) => [key(s), { ...s }]));
  let added = 0, changed = false;
  for (const s of add) {
    if (!taxIdValid(s.tax_id) || taxId13(s.tax_id) === OUR_TAX_ID || !s.name.trim()) continue; // เลขที่ไม่ผ่านตัวตรวจไม่เข้าสมุด (กันอ่านผิดแล้วจำผิดถาวร)
    const old = map.get(key(s));
    if (old) { if (!old.pay && s.pay) { old.pay = s.pay; changed = true; } }
    else { map.set(key(s), { name: s.name.trim(), tax_id: taxId13(s.tax_id), branch: branchOf(s.tax_id, s.branch), pay: s.pay }); added++; changed = true; }
  }
  return { list: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "th")), added, changed };
}

export { monthRange, round2 };
