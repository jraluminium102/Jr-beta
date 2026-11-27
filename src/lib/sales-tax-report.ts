/**
 * รายงานภาษีขายรายเดือน (เจ้าของ 27 พ.ย.69) — แทนงานพิมพ์ชีต "ขาย" ของธุรการ
 *
 *   แหล่ง 1 = ใบเสร็จ/ใบกำกับภาษีในระบบ (ตาราง receipts) — ตัวหลัก
 *   แหล่ง 2 = ใบที่ออกจากที่อื่น (FlowAccount) — นำเข้าไฟล์ หรือกรอกเอง · เก็บใน app_config รายเดือน ไม่มี migration
 *
 * ⚠ กติกาที่ห้ามแก้โดยไม่ถามเจ้าของ (ผ่านตัวตรวจบัญชี 27 พ.ย.69)
 *   - "ไม่นับ" ทำได้เฉพาะใบที่ซ้ำกับอีกใบ (เงินก้อนเดียวกันมี 2 เลข) — ต้องชี้คู่เสมอ ห้ามทำปุ่มเอาใบออกเฉย ๆ
 *   - ใบที่นับแทน ยอดต้องไม่น้อยกว่าใบที่ไม่นับ (ต่างได้ไม่เกิน PAIR_SLACK) — กันยอดขายหายเพราะจับคู่ผิด
 *     เช็คทุกครั้งที่คิดรายงาน ไม่ใช่แค่ตอนตั้งคู่ → ยอดถูกแก้ทีหลังจนไม่ผ่าน = ใบกลับมานับเอง
 *   - ฐานภาษี = base_amt ของใบ (0095) · ใบเก่าที่ไม่มี = amount − vat_amt · ห้ามใช้ net − vat (มีหัก ณ ที่จ่ายแล้วฐานขาด)
 *   - ใบยกเลิกยังอยู่ในรายงาน (เลขไม่ขาด) แต่ยอดเป็น 0
 *
 * ไฟล์นี้ไม่แตะฐานข้อมูล และห้าม import ของฝั่ง server (หน้าจอ import ไฟล์นี้) — ตัวออก Excel อยู่ sales-tax-report-xlsx.ts
 * เทสด้วย: node --experimental-strip-types scripts/verify-sales-tax-report.mts
 */
import type { SheetGrid } from "./floor-calc/xlsx-read.ts";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** ยอดรวมของคู่ที่ถือว่า "เท่ากัน" (ไฟล์เก่าคิด VAT ไม่ปัด ต่างกันได้ 1–2 สตางค์) */
export const PAIR_EQUAL = 0.02;
/** ใบที่นับแทน น้อยกว่าใบที่ไม่นับได้ไม่เกินเท่านี้ (เศษปัด VAT ตอนถอดจากยอดรวม) */
export const PAIR_SLACK = 1;

export const THAI_MONTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export type TaxRow = {
  /** "s:<เลขที่>" = ใบในระบบ · "x:<id>" = ใบที่เพิ่มจากที่อื่น */
  key: string;
  source: "system" | "extra";
  code: string;
  /** ค.ศ. YYYY-MM-DD */
  date: string;
  name: string;
  tax_id: string;
  branch: string;
  base: number;
  vat: number;
  total: number;
  voided: boolean;
  note: string;
  receipt_id?: number;
};

export type ExtraRow = {
  id: string;
  code: string;
  date: string;
  name: string;
  tax_id: string;
  branch: string;
  /** ติดลบได้ = ใบลดหนี้ */
  base: number;
  vat: number;
  note: string;
  /** ใบยกเลิก — เก็บไว้ให้เลขไม่ขาด ยอดเป็น 0 */
  voided?: boolean;
  at?: string;
  by?: string;
};

/** ของที่เก็บต่อเดือน: ใบจากที่อื่น + คู่ที่ซ้ำกัน (skip[ใบที่ไม่นับ] = ใบที่นับแทน) */
export type TaxExtra = { rows: ExtraRow[]; skip: Record<string, string> };

export const extraKey = (month: string) => `sales_tax_extra:${month}`;
export const isMonth = (m: unknown): m is string => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function parseExtra(raw: string | null | undefined): TaxExtra {
  if (!raw) return { rows: [], skip: {} };
  try {
    const j = JSON.parse(raw);
    const rows = Array.isArray(j?.rows) ? (j.rows as ExtraRow[]).filter((r) => r && typeof r.id === "string" && typeof r.code === "string") : [];
    const skip: Record<string, string> = {};
    if (j?.skip && typeof j.skip === "object") {
      for (const [k, v] of Object.entries(j.skip)) if (typeof v === "string" && v) skip[k] = v;
    }
    return { rows, skip };
  } catch {
    return { rows: [], skip: {} };
  }
}

export function monthRange(month: string): { start: string; nextStart: string; y: number; m0: number } {
  const [y, mm] = month.split("-").map(Number);
  const m0 = mm - 1;
  const ny = m0 === 11 ? y + 1 : y;
  const nm = m0 === 11 ? 1 : mm + 1;
  return { start: `${month}-01`, nextStart: `${ny}-${String(nm).padStart(2, "0")}-01`, y, m0 };
}

export function thaiDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y + 543}`;
}

/** สาขาแบบที่ใช้ในรายงาน: ไม่มีเลขผู้เสียภาษี = "-" · สำนักงานใหญ่ = "สนญ." · สาขา = เลข 5 หลัก */
export function reportBranch(taxId: string, branch: string): string {
  if (!taxId) return "-";
  const b = (branch ?? "").trim();
  if (!b || /สำนักงานใหญ่|สนญ|^0{5}$/.test(b)) return "สนญ.";
  const num = /(\d{1,5})/.exec(b)?.[1];
  if (num && /^0+$/.test(num)) return "สนญ.";
  return num ? num.padStart(5, "0") : b;
}

export const cleanTaxId = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return /^0*$/.test(d) ? "" : d;
};

export type ReceiptLike = {
  id: number; code: string; issue_date: string;
  customer_snapshot: { name?: string; tax_id?: string | null; branch?: string | null } | null;
  amount: number | string | null; vat_amt: number | string | null;
  base_amt?: number | string | null; is_voided?: boolean | null;
};

export function receiptToRow(rc: ReceiptLike): TaxRow {
  const vat = round2(Number(rc.vat_amt) || 0);
  const base = round2(rc.base_amt != null ? Number(rc.base_amt) || 0 : (Number(rc.amount) || 0) - vat);
  const taxId = cleanTaxId(rc.customer_snapshot?.tax_id);
  return {
    key: `s:${rc.code}`,
    source: "system",
    code: rc.code,
    date: rc.issue_date,
    name: (rc.customer_snapshot?.name ?? "").trim(),
    tax_id: taxId,
    branch: reportBranch(taxId, rc.customer_snapshot?.branch ?? ""),
    base, vat, total: round2(base + vat),
    voided: !!rc.is_voided,
    note: "",
    receipt_id: rc.id,
  };
}

export function extraToRow(x: ExtraRow): TaxRow {
  const base = round2(Number(x.base) || 0);
  const vat = round2(Number(x.vat) || 0);
  const taxId = cleanTaxId(x.tax_id);
  return {
    key: `x:${x.id}`, source: "extra", code: x.code, date: x.date, name: x.name,
    tax_id: taxId, branch: reportBranch(taxId, x.branch),
    base, vat, total: round2(base + vat), voided: !!x.voided, note: x.note ?? "",
  };
}

// ─── จับคู่ใบที่น่าจะซ้ำ (เงินก้อนเดียวกัน มีทั้งใบในระบบและใบ FlowAccount) ───────────────

// ตัดคำนำหน้า/คำบอกประเภทกิจการ "เป็นคำ ๆ" เท่านั้น — ห้ามตัดกลางคำ (เคยตัด "นาง" ใน "สมนาง")
const NOISE_WORD = /^(บริษัท|จำกัด|มหาชน|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วน|หจก\.?|บจก\.?|บมจ\.?|สำนักงานใหญ่|คุณ|นาย|นาง|นางสาว|น\.ส\.|k\.?|khun)$/i;
export function nameTokens(name: string): string[] {
  // คำนำหน้าที่เขียนติดชื่อ ("คุณสมชาย") ตัดเฉพาะ "คำแรกของแต่ละคน" — คำถัดไปอาจเป็นคำจริง เช่น "คุณภาพ" ในชื่อบริษัท
  return (name ?? "")
    .replace(/\(.*?\)/g, " ")
    .split(/[/·,]+/)
    .flatMap((person) => person.trim().split(/\s+/).map((t, i) => (i === 0 ? t.replace(/^(คุณ|นางสาว|นาย|นาง)(?=.{3,})/, "") : t)))
    .filter((t) => t.length >= 2 && !NOISE_WORD.test(t));
}
/** 2 = คำแรกของชื่อ (ชื่อตัว/ชื่อกิจการ) ตรงกับอีกฝั่ง · 1 = มีคำอื่นตรงกัน (คำสามัญอย่าง "อลูมิเนียม" ก็ตกมาตรงนี้) · 0 = ไม่ตรง */
function nameScore(a: string, b: string): 0 | 1 | 2 {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  if ((ta[0].length >= 3 && tb.includes(ta[0])) || (tb[0].length >= 3 && ta.includes(tb[0]))) return 2;
  return ta.some((x) => x.length >= 3 && tb.includes(x)) ? 1 : 0;
}
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000;

export type DupPair = {
  system: string; extra: string;
  /** เลขผู้เสียภาษีตรง หรือชื่อตัวตรงและวันห่างไม่เกิน 3 วัน = มั่นใจ (กดทั้งก้อนได้) · นอกนั้นให้คนดูทีละคู่ */
  sure: boolean;
};

/**
 * ยอดรวมต้องเท่ากัน แล้วดูชื่อ/เลขผู้เสียภาษี/วันที่ · จับแบบ 1 ต่อ 1 เรียงคู่ที่คะแนนสูงก่อน
 * ค่าประเมิน 2,000 บาทมีหลายสิบใบยอดเท่ากัน → ต้องมีชื่อหรือวันช่วยเสมอ
 */
export function suggestPairs(rows: TaxRow[], skip: Record<string, string>): DupPair[] {
  const used = new Set<string>([...Object.keys(skip), ...Object.values(skip)]);
  const ok = (r: TaxRow) => !r.voided && r.vat > 0 && r.total > 0 && !used.has(r.key);
  const sys = rows.filter((r) => r.source === "system" && ok(r));
  const ext = rows.filter((r) => r.source === "extra" && ok(r));
  const cand: { s: TaxRow; x: TaxRow; score: number; sure: boolean }[] = [];
  for (const s of sys) for (const x of ext) {
    if (Math.abs(s.total - x.total) > PAIR_EQUAL) continue;
    const dd = dayDiff(s.date, x.date);
    if (dd > 10) continue;
    const idHit = !!s.tax_id && s.tax_id.replace(/^0+/, "") === x.tax_id.replace(/^0+/, "");
    const nm = idHit ? 3 : nameScore(s.name, x.name);
    const dt = dd === 0 ? 1 : dd <= 3 ? 0.5 : 0;
    if (nm === 0 && dt === 0) continue;
    cand.push({ s, x, score: nm + dt, sure: idHit || (nm === 2 && dd <= 3) });
  }
  cand.sort((a, b) => b.score - a.score || a.s.code.localeCompare(b.s.code) || a.x.code.localeCompare(b.x.code));
  const out: DupPair[] = [];
  const taken = new Set<string>();
  for (const c of cand) {
    if (taken.has(c.s.key) || taken.has(c.x.key)) continue;
    taken.add(c.s.key); taken.add(c.x.key);
    out.push({ system: c.s.key, extra: c.x.key, sure: c.sure });
  }
  return out;
}

const money2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ตั้งคู่ "ไม่นับ a เพราะซ้ำกับ b" ได้ไหม — คืนข้อความเหตุผลถ้าไม่ได้ (ใช้ทั้งตอนตั้งคู่และตอนคิดรายงาน) */
export function pairProblem(skipRow: TaxRow | undefined, twin: TaxRow | undefined): string | null {
  if (!skipRow || !twin) return "ไม่พบใบที่เลือก (อาจถูกลบหรือย้ายเดือนไปแล้ว) — โหลดหน้าใหม่แล้วลองอีกครั้ง";
  if (skipRow.key === twin.key) return "ใบที่ซ้ำกันต้องเป็นคนละใบ";
  if (skipRow.source === twin.source) return "คู่ที่ซ้ำต้องเป็นใบในระบบกับใบจากที่อื่น อย่างละใบ";
  if (skipRow.voided) return "ใบที่จะไม่นับถูกยกเลิกอยู่แล้ว ไม่ต้องจับคู่";
  if (twin.voided) return "ใบที่จะนับแทนถูกยกเลิกแล้ว";
  if (twin.vat <= 0 || twin.total <= 0) return "ใบที่จะนับแทนไม่มี VAT จึงไม่ได้อยู่ในรายงาน";
  if (skipRow.total <= 0) return "ใบลดหนี้/ใบยอดติดลบ จับคู่ซ้ำไม่ได้";
  if (twin.total < skipRow.total - PAIR_SLACK) {
    return `ใบที่จะนับ (${twin.code}) ยอด ${money2(twin.total)} บาท น้อยกว่าใบที่จะไม่นับ (${skipRow.code}) ยอด ${money2(skipRow.total)} บาท — ทำแบบนี้ยอดขายจะหาย ให้นับใบที่ยอดมากกว่า หรือแก้ยอดใบที่ผิดที่ต้นทางก่อน`;
  }
  return null;
}

// ─── รวมเป็นรายงาน ─────────────────────────────────────────────────────────

export type SkippedRow = TaxRow & { twin: string; twinTotal: number };

export type TaxReport = {
  month: string;
  /** ใบที่เข้ารายงาน (เรียงวันที่ → เลขที่) รวมใบยกเลิก (ยอด 0) */
  rows: TaxRow[];
  /** ใบที่ไม่นับเพราะซ้ำ — โชว์ให้เห็นว่าไปซ้ำกับใบไหน ยอดเท่าไหร่ */
  skipped: SkippedRow[];
  /** ใบเสร็จในระบบที่ไม่มี VAT — ไม่เข้ารายงานภาษีขาย */
  noVat: TaxRow[];
  pairs: DupPair[];
  /** คู่ที่ยังมีผลจริง (ตัดคู่ที่ใบหาย/ยกเลิก/ยอดไม่ผ่านออกแล้ว) — API ใช้ค่านี้ ไม่ใช้ของดิบ */
  skip: Record<string, string>;
  /** เลขใบในระบบที่ไม่มีในเดือนนี้ (เลขกระโดด) — ให้ธุรการรู้ก่อนยื่น */
  gaps: string[];
  /** ใบที่เพิ่มเองแต่เลขที่ตรงกับใบในระบบ (นับซ้ำแน่) */
  sameCode: string[];
  totals: { count: number; base: number; vat: number; total: number };
};

const byDate = (a: TaxRow, b: TaxRow) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code);

/** เลขรัน 4 หลักท้ายของใบในระบบ (INV<พ.ศ.><เดือน><run4>) ที่หายไปจากช่วง 1..สูงสุด */
export function findGaps(codes: string[]): string[] {
  const groups = new Map<string, Set<number>>();
  for (const c of codes) {
    const m = /^(.*?)(\d{4})$/.exec(c.trim());
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], new Set());
    groups.get(m[1])!.add(Number(m[2]));
  }
  const out: string[] = [];
  for (const [prefix, set] of groups) {
    const max = Math.max(...set);
    for (let i = 1; i <= max && out.length < 200; i++) if (!set.has(i)) out.push(prefix + String(i).padStart(4, "0"));
  }
  return out.sort();
}

export function buildReport(month: string, receipts: ReceiptLike[], extra: TaxExtra): TaxReport {
  const sysRows = receipts.map(receiptToRow);
  const all: TaxRow[] = [...sysRows, ...extra.rows.map(extraToRow)];
  const byKey = new Map(all.map((r) => [r.key, r]));
  // คู่ที่ใช้ไม่ได้แล้ว (ใบถูกลบ/ยกเลิก/ย้ายเดือน · ยอดถูกแก้จนใบที่นับน้อยกว่า · ชี้กันเป็นวง) = ไม่มีผล → ใบกลับมานับเอง กันยอดหายเงียบ
  const skip: Record<string, string> = {};
  const twinUsed = new Set<string>();
  for (const [k, twin] of Object.entries(extra.skip)) {
    if (extra.skip[twin] || twinUsed.has(twin)) continue;
    if (pairProblem(byKey.get(k), byKey.get(twin))) continue;
    skip[k] = twin; twinUsed.add(twin);
  }
  const rows: TaxRow[] = [], skipped: SkippedRow[] = [], noVat: TaxRow[] = [];
  for (const r of all) {
    if (skip[r.key]) { const t = byKey.get(skip[r.key])!; skipped.push({ ...r, twin: t.code, twinTotal: t.total }); continue; }
    if (r.source === "system" && r.vat <= 0) { noVat.push(r); continue; }
    rows.push(r.voided ? { ...r, base: 0, vat: 0, total: 0, note: "ยกเลิก" } : r);
  }
  rows.sort(byDate); skipped.sort(byDate); noVat.sort(byDate);
  const live = rows.filter((r) => !r.voided);
  const sysCodes = new Set(sysRows.map((r) => r.code.trim()));
  return {
    month, rows, skipped, noVat, skip,
    pairs: suggestPairs(all, skip),
    gaps: findGaps(sysRows.map((r) => r.code)),
    sameCode: extra.rows.map((r) => r.code.trim()).filter((c) => sysCodes.has(c)),
    totals: {
      count: live.length,
      base: round2(live.reduce((s, r) => s + r.base, 0)),
      vat: round2(live.reduce((s, r) => s + r.vat, 0)),
      total: round2(live.reduce((s, r) => s + r.total, 0)),
    },
  };
}

// ─── อ่านไฟล์ที่นำเข้า (ไฟล์ส่งออกของ FlowAccount หรือชีต "ขาย" ที่พิมพ์ไว้เอง) ─────────────

const norm = (s: string) => String(s ?? "").replace(/\s+/g, "");
type ColKey = "code" | "date" | "name" | "tax" | "branch" | "vat" | "base" | "total" | "status";
const COLS: { key: ColKey; re: RegExp }[] = [
  { key: "code", re: /^เลขที่เอกสาร|^เลขที่ใบ|^เลขที่$/ },
  { key: "date", re: /^วัน\/เดือน\/ปี|^วันที่(?!ครบ|ชำระ|นัด)/ },
  { key: "name", re: /ชื่อผู้ประกอบการ|ชื่อลูกค้า|ชื่อผู้ซื้อ/ },
  { key: "tax", re: /ผู้เสียภาษี/ },
  { key: "branch", re: /สาขา/ },
  // ⚠ "ภาษีมูลค่าเพิ่ม" มีคำว่า "มูลค่า" อยู่ข้างใน → เช็ค VAT ก่อนฐาน · "มูลค่ารวม" = ยอดรวม ไม่ใช่ฐาน
  { key: "vat", re: /ภาษีมูลค่าเพิ่ม|^vat$|^ภาษีขาย$/i },
  { key: "base", re: /^ยอดขาย|^มูลค่า$|^มูลค่า(ก่อน|สินค้า|บริการ)|ก่อนvat|ก่อนภาษี/i },
  { key: "total", re: /^รวม$|ยอดรวมสุทธิ|^รวมทั้งสิ้น|^ยอดรวม|^มูลค่ารวม|^จำนวนเงินรวม/ },
  { key: "status", re: /^สถานะ/ },
];

/** ตัวเลขในไฟล์ — ช่องว่าง/อ่านไม่ได้ = NaN (ห้ามคืน 0 ไม่งั้นแยกไม่ออกว่า "ไม่มีข้อมูล" กับ "ศูนย์") · (100.00) = ติดลบ */
export const fileNum = (v: string): number => {
  let s = String(v ?? "").replace(/[,\s฿]|บาท/g, "");
  if (!s) return NaN;
  let neg = false;
  const p = /^\((.+)\)$/.exec(s);
  if (p) { neg = true; s = p[1]; }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
};
const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** วันที่ในไฟล์ (วันขึ้นก่อนเสมอ): 31/10/2026 · 31/10/2569 · 31/10/69 · มีเวลาต่อท้าย · 2026-10-31 · เลขวันของ Excel (ทั้ง ค.ศ. และที่พิมพ์ปี พ.ศ.) */
export function parseFileDate(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const fixYear = (y: number) => (y < 100 ? (y >= 43 ? y + 2500 - 543 : y + 2000) : y > 2400 ? y - 543 : y);
  let m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?:[\sT].*)?$/.exec(s);
  if (m) return valid(fixYear(+m[3]), +m[2], +m[1]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT].*)?$/.exec(s);
  if (m) return valid(fixYear(+m[1]), +m[2], +m[3]);
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 20000 || n > 400000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return valid(fixYear(d.getUTCFullYear()), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}
function valid(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? iso(y, m, d) : null;
}

export type ImportResult = {
  rows: Omit<ExtraRow, "id">[];
  /** แถวที่วันที่ไม่ใช่เดือนที่เลือก (ไม่นำเข้า · มีรายละเอียดใน problems) */
  otherMonth: number;
  /** แถวที่ "ไม่นำเข้า" พร้อมเหตุผล (ให้คนดู ไม่ทิ้งเงียบ) */
  problems: string[];
  /** แถวที่ "นำเข้าแล้ว" แต่ตัวเลขน่าสงสัย ควรเปิดใบจริงเทียบ */
  warnings: string[];
  sheet: string;
};

export function parseSalesImport(sheets: SheetGrid[], month: string): ImportResult {
  // เลือกชีต: ชื่อ "ขาย" ก่อน (ไฟล์รายงานภาษีมีชีตซื้ออยู่ด้วย หัวตารางเหมือนกัน) · ไม่มีจึงไล่หาชีตแรกที่มีหัวตารางและมีข้อมูล
  const order = [...sheets.filter((s) => /ขาย/.test(s.name)), ...sheets.filter((s) => !/ขาย/.test(s.name) && !/ซื้อ/.test(s.name))];
  let firstEmpty: ImportResult | null = null;
  for (const sh of order) {
    let hdr = -1; let map: Partial<Record<ColKey, number>> = {};
    for (let r = 0; r < Math.min(sh.rows.length, 30); r++) {
      const m: typeof map = {};
      (sh.rows[r] ?? []).forEach((cell, c) => {
        const t = norm(cell);
        if (!t) return;
        const hit = COLS.find((x) => x.re.test(t));
        if (hit && m[hit.key] == null) m[hit.key] = c;
      });
      if (m.code != null && m.date != null && (m.base != null || m.total != null)) { hdr = r; map = m; break; }
    }
    if (hdr < 0) continue;

    const out: ImportResult = { rows: [], otherMonth: 0, problems: [], warnings: [], sheet: sh.name };
    const seen = new Set<string>();
    let lastDate: string | null = null;
    for (let r = hdr + 1; r < sh.rows.length; r++) {
      const row = sh.rows[r] ?? [];
      const cell = (k: ColKey) => (map[k] != null ? String(row[map[k]!] ?? "").trim() : "");
      const code = cell("code");
      if (!code) continue; // แถวรวม/แถวว่าง
      const line = `แถว ${r + 1} (${code})`;
      const status = cell("status");
      let date = parseFileDate(cell("date"));
      // ใบยกเลิก: ไฟล์ที่พิมพ์เองเขียน "ยกเลิก" ในช่องชื่อ เว้นวันที่ว่าง · เก็บไว้ให้เลขเรียงครบ ยอด 0 (ไม่มีวันที่ = ใช้วันของแถวก่อนหน้า)
      if (/ยกเลิก|cancel|void/i.test(status) || /^ยกเลิก/.test(cell("name"))) {
        date = date ?? lastDate ?? `${month}-01`;
        if (date.slice(0, 7) !== month) { out.otherMonth++; out.problems.push(`${line}: ใบยกเลิก วันที่ ${thaiDate(date)} ไม่ใช่เดือนนี้ ไม่นำเข้า`); continue; }
        if (seen.has(code)) { out.problems.push(`${line}: เลขที่ซ้ำในไฟล์ ใช้แถวแรก`); continue; }
        seen.add(code);
        out.rows.push({ code, date, name: "ยกเลิก", tax_id: "", branch: "", base: 0, vat: 0, note: "", voided: true });
        continue;
      }
      // ฉบับร่าง/ยังไม่อนุมัติ = ยังไม่ใช่ใบกำกับที่ออกจริง
      if (/ร่าง|รออนุมัติ|ไม่อนุมัติ|draft|pending/i.test(status)) { out.problems.push(`${line}: สถานะ "${status}" ยังไม่ใช่ใบที่ออกจริง ไม่นำเข้า`); continue; }
      if (!date) { out.problems.push(`${line}: อ่านวันที่ไม่ได้`); continue; }
      let base = fileNum(cell("base")), vat = fileNum(cell("vat"));
      const total = fileNum(cell("total"));
      // ไฟล์ที่มีไม่ครบ 3 ช่อง → ถอดจากช่องที่มี
      if (Number.isNaN(base) && !Number.isNaN(total)) base = Number.isNaN(vat) ? total / 1.07 : total - vat;
      if (Number.isNaN(base)) { out.problems.push(`${line}: อ่านยอดขายไม่ได้`); continue; }
      if (Number.isNaN(vat)) vat = Number.isNaN(total) ? base * 0.07 : total - base;
      base = round2(base); vat = round2(vat);
      if (base === 0) { out.problems.push(`${line}: ยอดขายเป็น 0 ไม่นำเข้า`); continue; }
      if (vat === 0) { out.problems.push(`${line}: ไม่มี VAT ไม่เข้ารายงานภาษีขาย`); continue; }
      if (base < 0 !== vat < 0) { out.problems.push(`${line}: ยอดขายกับ VAT เครื่องหมายไม่ตรงกัน ไม่นำเข้า`); continue; }
      if (date.slice(0, 7) !== month) { out.otherMonth++; out.problems.push(`${line}: วันที่ ${thaiDate(date)} ไม่ใช่เดือนนี้ ไม่นำเข้า`); continue; }
      lastDate = date;
      if (seen.has(code)) { out.problems.push(`${line}: เลขที่ซ้ำในไฟล์ ใช้แถวแรก`); continue; }
      seen.add(code);
      if (Math.abs(vat - base * 0.07) > 1) out.warnings.push(`${line}: VAT ${money2(vat)} ไม่เท่ากับ 7% ของยอดขาย ${money2(base)} — เปิดใบจริงเทียบ`);
      if (!Number.isNaN(total) && Math.abs(base + vat - total) > 0.05) out.warnings.push(`${line}: ยอดขาย + VAT (${money2(base + vat)}) ไม่เท่ากับยอดรวมในไฟล์ (${money2(total)}) — เปิดใบจริงเทียบ`);
      out.rows.push({ code, date, name: cell("name"), tax_id: cleanTaxId(cell("tax")), branch: cell("branch"), base, vat, note: base < 0 ? "ใบลดหนี้" : "", voided: false });
    }
    if (out.rows.length || out.problems.length) return out;
    firstEmpty = firstEmpty ?? out; // ชีตมีหัวตารางแต่ไม่มีข้อมูล → ลองชีตถัดไป
  }
  if (firstEmpty) return firstEmpty;
  throw new Error("ไม่พบตารางในไฟล์ — ต้องมีหัวคอลัมน์ เลขที่เอกสาร · วัน/เดือน/ปี · ยอดขาย (หรือมูลค่า)");
}
