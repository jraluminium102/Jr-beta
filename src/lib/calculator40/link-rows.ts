// link-rows.ts — สร้างข้อมูลตาราง "3 ช่องความจริง" (คิดราคา 4.0 · ใบตัด · สโตร์) ต่อรายการ
// ให้หน้า /calculator40/link (เจ้าของสั่ง 1 ก.ย.69 — ดู docs/SPEC-หน้าลิงก์รวม-สโตร์-ใบตัด-คิดราคา.md)
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ ไฟล์นี้ "ไม่มีสูตรของตัวเอง" — เรียก engine เดิมทั้งหมด (computeCost/computeCutList ผ่าน cutInputFromRecipe)
//   ตรรกะจับคู่ "คิดราคา ↔ ใบตัด" (รหัสก่อน แล้วค่อยชื่อ · รวมตามรหัสก่อนเทียบ · สุ่มหลายขนาดกัน "ของใช้เฉพาะรูปแบบ" หลุด)
//   พอร์ตมาจาก scripts/gen-store-link-csv.mjs (ตัวออกรายงาน CSV ที่เจ้าของใช้ตรวจอยู่แล้ว ผ่าน verify-store-link-report)
//   เพื่อให้หน้าเว็บกับรายงาน CSV "พูดเรื่องเดียวกัน" ไม่ขัดกันเอง (ยึดชุดสถานะเดียวกัน)
//   ⚠ ต้อง apply override ให้ products/cutSpecsById "ก่อน" ส่งเข้าไฟล์นี้ (ไฟล์นี้เองไม่รู้จัก override)
//   ⚠ รับ cutSpecsById เป็นพารามิเตอร์ตรง ๆ (ไม่อ่านจาก CUT_SPEC_BY_ID import ตรง ๆ เหมือนไฟล์อื่นในโฟลเดอร์นี้)
//     เพราะไฟล์นี้ถูกเรียกจาก "เซิร์ฟเวอร์" (page.tsx) — ถ้า mutate module singleton ในที่ (applyOverridesInPlace)
//     ฝั่งเซิร์ฟเวอร์ singleton ใช้ร่วมกันข้ามคำขอ/ผู้ใช้ได้ (ต่างจากฝั่ง client ที่แยกตาม browser tab)
//     → override cut-scope จะรั่วไปกระทบใบตัด/BOQ จริงของคนอื่นที่ไม่เกี่ยวข้องกับหน้านี้เลย (นอกขอบเขตรอบนี้)
//     ผู้เรียกฝั่งเซิร์ฟเวอร์ต้องใช้ applyLineOverrides (pure) แล้วส่ง dict ใหม่เข้ามาตรงนี้แทน
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computeCost } from "./engine.mjs";
import { cutInputFromRecipe } from "../cutlist/from-recipe.ts";
import type { LineOverride } from "./line-overrides";

// คอลัมน์ที่ API /api/calc-overrides ใช้อยู่แล้ว — ใช้ค่าเดียวกันทุกจุดที่ query ตาราง (route.ts + หน้านี้)
//   match_name/set_kg มาพร้อม 0134 (ยุบ 0135 เข้าไปแล้ว) — ฝั่ง page.tsx มี fallback ถ้าคอลัมน์ยังไม่มี
export const CALC_OVERRIDE_SELECT =
  "id, product_id, scope, match_key, match_name, set_kg, set_sku, set_qty, set_len, set_price, is_added, item_name, unit, disabled, note, created_by, created_at, updated_at, reviewed_at, reviewed_by";

/** ชุดคอลัมน์แบบเก่า (ก่อนมี match_name/set_kg) — ใช้ถอยเมื่อฐานข้อมูลยังไม่ได้อัปเดต */
export const CALC_OVERRIDE_SELECT_LEGACY =
  "id, product_id, scope, match_key, set_sku, set_qty, set_len, set_price, is_added, item_name, unit, disabled, note, created_by, created_at, updated_at, reviewed_at, reviewed_by";

export type OverrideRow = LineOverride & {
  id: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type LinkStockRow = {
  id: number;
  name: string;
  sku: string;
  color: string;
  category: string;
  supplier: string;
  is_weight_based: boolean;
  unit_cost: number;
  price_per_kg: number;
  weight_per_unit: number;
  qty_on_hand: number;
};

export type LinkRowStatus = "fix" | "add" | "over" | "decide" | "untested" | "fyi" | "pass";

export type LinkSectionKey = "อลูมิเนียม" | "กระจก" | "อุปกรณ์/สิ้นเปลือง" | "มีแต่ในใบตัด" | "มีแต่ในใบตัด (อลู)";

export type LinkRow = {
  key: string;                 // unique ต่อแถว (ใช้เป็น React key)
  productId: string;
  productName: string;
  productGroup: number;
  section: LinkSectionKey;
  name: string;
  /** คีย์ที่ override อ้างอิง (match_key) — รหัสก่อน ไม่มีรหัสใช้ name:<ชื่อ> (กติกาเดียวกับ line-overrides.ts) */
  matchKey: string;
  calcSku: string;
  calcQty: number | null;
  calcUnit: string;
  calcPrice: number | null;
  calcAmount: number | null;
  cutSku: string;
  cutQty: number | null;
  cutUnit: string;
  /** ความยาวเฉลี่ยต่อชิ้น (ซม.) — เฉพาะบรรทัดอลูที่มีใบตัด */
  cutLenPerPiece: number | null;
  status: LinkRowStatus;
  sizeLabel: string;
  hasCutSpec: boolean;
  /** id ของ CutSpec (คีย์ใน CUT_SPEC_BY_ID) — คนละ namespace กับ productId (PRODUCTS)
   *  ⚠ เขียน override scope='cut' ต้องส่ง product_id = ค่านี้ ไม่ใช่ productId — ไม่งั้นเขียนผิดรุ่นเงียบ ๆ (ดู line-overrides.ts) */
  cutSpecId: string | null;
  /** รหัสนี้ถูกใช้ >1 บรรทัดในรุ่นเดียวกัน — แยกกันได้ด้วย match_name (มากับ 0134) */
  dupKeyInProduct: boolean;
};

// ป้ายสถานะดิบ (เหมือน scripts/gen-store-link-csv.mjs LEVEL) → คีย์ป้าย 7 แบบที่ UI ใช้
const STATUS_MAP: Record<string, LinkRowStatus> = {
  "รหัสไม่ตรง": "fix",
  "จำนวนต่าง": "fix",
  "คิดราคาไม่มีรายการนี้": "add",
  "คิดราคายังไม่มีรหัส": "decide",
  "ใบตัดไม่ให้รหัส": "decide",
  "ตรง": "pass",
  "ใบตัดไม่มีรายการนี้": "over",
  "ใบตัดไม่ลงประเภทนี้": "fyi",
  "ยังไม่ผูกไฟล์": "fyi",
  "ยังไม่ได้ตรวจ": "untested",
};
export const STATUS_LABEL: Record<LinkRowStatus, string> = {
  fix: "ต้องแก้", add: "ต้องเติม", over: "เช็คว่าคิดเกินไหม", decide: "ต้องเคาะ",
  untested: "ยังไม่ได้ตรวจ", fyi: "ดูเฉย ๆ", pass: "ผ่าน",
};

/**
 * อธิบายเป็นประโยคว่า "แถวนี้ผิดตรงไหน · ต้องทำอะไร"
 *
 * ⚠ ทำไมต้องมี (เจ้าของท้วง 1 ก.ย.69):
 *   "ไม่มีเขียนดี ๆ ว่ามันผิดตรงไหน ... แท็กที่ต้องลงมือ ที่ต้องคิด บอกตรง ๆ ไม่รู้เรื่องว่าต้องการให้ชั้นทำอะไร"
 *   ป้ายสีอย่างเดียวไม่พอ — ต้องบอกเป็นคำพูดว่าเลขไหนไม่ตรงกับเลขไหน แล้วให้ทำอะไรต่อ
 *   และต้องกำกับเสมอว่า "พูดถึงบานแบบไหน ขนาดเท่าไร" (ดู sizeLabel) เพราะขนาด/รูปแบบเปลี่ยนของที่ใช้
 */
export type LinkRowExplain = { problem: string; todo: string };

const q = (n: number | null, u: string) =>
  n == null ? "—" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}${u ? " " + u : ""}`;

export function explainRow(r: {
  status: LinkRowStatus; name: string; calcSku: string; cutSku: string;
  calcQty: number | null; cutQty: number | null; calcUnit: string; cutUnit: string;
  section: string; hasCutSpec: boolean;
}): LinkRowExplain {
  const cq = q(r.calcQty, r.calcUnit), uq = q(r.cutQty, r.cutUnit);
  switch (r.status) {
    case "fix":
      if (r.calcSku && r.cutSku && r.calcSku.toUpperCase() !== r.cutSku.toUpperCase())
        return {
          problem: `คนละรหัสกัน — คิดราคาใช้ ${r.calcSku} แต่ใบตัดเบิก ${r.cutSku}`,
          todo: "เลือกว่าจะยึดรหัสไหน แล้วกดแก้ให้ตรงกันทั้งสองฝั่ง",
        };
      return {
        problem: `จำนวนไม่เท่ากัน — คิดราคาคิด ${cq} แต่ใบตัดเบิก ${uq}`,
        todo: `ถ้าใบตัดถูก แก้จำนวนฝั่งคิดราคาเป็น ${uq} · ถ้าคิดราคาถูก แก้ใบตัดแทน`,
      };
    case "add":
      return {
        problem: `ใบตัดเบิก ${uq} แต่คิดราคาไม่มีรายการนี้เลย = เบิกของจริงแต่ไม่ได้คิดเงิน`,
        todo: "กด “เพิ่มรายการ” ใส่เข้าคิดราคา (ทุนจะเพิ่ม ราคาขายขยับตาม)",
      };
    case "over":
      return {
        problem: `คิดราคาคิดเงิน ${cq} แต่ใบตัดไม่ได้เบิกของนี้ = อาจคิดเกินลูกค้า`,
        todo: "ถ้าใช้จริงแต่ใบตัดตกหล่น เติมในใบตัด · ถ้าไม่ได้ใช้ ปิดแถวนี้ (ทุนจะลด)",
      };
    case "decide":
      return {
        problem: r.calcSku ? "ใบตัดไม่ได้ระบุรหัสสโตร์ให้" : "ยังไม่มีรหัสสโตร์ — แก้ราคาที่สโตร์แล้วราคาตรงนี้ไม่ขยับตาม",
        todo: "หารหัสจริงในสโตร์แล้วกดใส่ในช่องรหัส (กดรหัสข้าง ๆ เพื่อเปิดดูสโตร์ได้)",
      };
    case "untested":
      return {
        problem: "ของชิ้นนี้ไม่โผล่ในขนาด/รูปแบบที่ระบบลองให้ เลยยังไม่เคยถูกเทียบกับใบตัดเลย",
        todo: "เปลี่ยนขนาด/รูปแบบด้านบนให้ตรงกับงานที่ใช้ของชิ้นนี้ แล้วดูอีกที",
      };
    case "fyi":
      return {
        problem: "ใบตัดไม่เคยลงของประเภทนี้อยู่แล้ว (กระจก/ซิลิโคน/ค่าอบสี)",
        todo: "ไม่ต้องทำอะไร",
      };
    default:
      return {
        problem: r.hasCutSpec ? `ตรงกันทั้งรหัสและจำนวน (${cq})` : "ไม่มีใบตัดให้เทียบ แต่รหัสผูกสโตร์แล้ว",
        todo: "",
      };
  }
}

const isCodeLike = (t: string) => /^(JR\d{5}|[A-Z]{1,4}-?\d{3,5}[A-Z]?|OPK-[A-Z0-9-]+|XSW\d+|HD-\d+)$/i.test(t);
/** รหัสทั้งหมดของบรรทัดนี้ — สูตร sku เลือกตามสีได้ (เช่น "CKEY==='black'?'JR00316':'JR00318'") ต้องกางออกทีละรหัส */
function skuVariants(line: any, rawItem: any): string[] {
  const rawSku = String(rawItem?.sku ?? "");
  if (rawSku.includes("?")) return [...rawSku.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => (m[1] ?? m[2]).toUpperCase()).filter(isCodeLike);
  const one = String(line.sku || line.code || rawSku || "").toUpperCase();
  return one ? [one] : [];
}
const norm = (s: unknown) => String(s ?? "").replace(/[\s\-–—()"'·.]/g, "").toLowerCase();
const val = (f: any, o: any): any => { try { return typeof f === "function" ? f(o) : f; } catch { return ""; } };
const n2 = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v)) ? Math.round(v * 100) / 100 : null;

export type Sample = { w: number; h: number; p: number; form: string; label: string };
// สุ่มหลายขนาด/รูปแบบต่อรุ่น (ไม่งั้นของที่ใช้เฉพาะบางรูปแบบออกมา 0 แล้วดูเหมือน "ไม่ต้องทำ")
//   คุมจำนวนไม่ให้เกิน 6 ชุดต่อรุ่น — หน้านี้คำนวณสด SSR ทุกครั้งที่โหลด (ต่างจาก gen-store-link-csv.mjs ที่รันออฟไลน์ได้ไม่จำกัดเวลา)
/** รูปแบบ + ช่วงจำนวนบานที่รุ่นนี้รองรับ — หน้าจอเอาไปทำ dropdown ให้ผู้ใช้เลือกขนาดเองได้ */
export function caseOptionsOf(p: any): { forms: string[]; minP: number; maxP: number; defaults: { w: number; h: number; p: number }; defForm: string } {
  const d = p?.defaults ?? { w: 150, h: 150, p: 1 };
  return {
    forms: (p?.forms && p.forms.length ? p.forms : [p?.defForm].filter(Boolean)) as string[],
    minP: Number(p?.minP) || 1,
    maxP: Number(p?.maxP) || Number(d.p) || 1,
    defaults: { w: d.w, h: d.h, p: d.p || 1 },
    defForm: p?.defForm ?? "",
  };
}

function samplesOf(p: any): Sample[] {
  const d = p.defaults || { w: 150, h: 150, p: 1 };
  const forms: string[] = (p.forms && p.forms.length ? p.forms : [p.defForm]).slice(0, 3);
  const panels = [...new Set([d.p || 1, p.minP, p.maxP].filter((x: any) => Number.isFinite(x) && x > 0))].slice(0, 2) as number[];
  const out: Sample[] = [];
  for (const form of forms) for (const pn of panels) {
    out.push({ w: d.w, h: d.h, p: pn, form, label: `${d.w}×${d.h} ${pn} บาน${form ? ` · ${form}` : ""}` });
    if (out.length >= 6) return out;
  }
  return out.length ? out : [{ w: d.w, h: d.h, p: d.p || 1, form: p.defForm, label: `${d.w}×${d.h} ${d.p || 1} บาน` }];
}

// เลขน้อย = สถานะ "ตรวจได้จริง" มากกว่า — ใช้ merge ผลจากหลายขนาดเข้าบรรทัดเดียว
const RANK0: Record<string, number> = {
  "ตรง": 0, "จำนวนต่าง": 1, "รหัสไม่ตรง": 2, "คิดราคาไม่มีรายการนี้": 3, "ใบตัดไม่มีรายการนี้": 4,
  "คิดราคายังไม่มีรหัส": 5, "ใบตัดไม่ให้รหัส": 6, "ใบตัดไม่ลงประเภทนี้": 7, "ยังไม่ผูกไฟล์": 8, "ยังไม่ได้ตรวจ": 9,
};

type RawRow = {
  section: LinkSectionKey; name: string; calcSku: string; calcPrice: number | null; calcUnit: string;
  calcQty: number | null; calcAmount: number | null; sizeLabel: string; cutSku: string; cutQty: number | null;
  cutUnit: string; cutLenPerPiece: number | null; rawStatus: string; hasCutSpec: boolean;
  /** id ของ CutSpec (คีย์ใน CUT_SPEC_BY_ID) — คนละ namespace กับ product_id ฝั่งคิดราคา (PRODUCTS)
   *  ⚠ ต้องส่งค่านี้ (ไม่ใช่ product_id ของ PRODUCTS) เวลาเขียน override scope='cut' ไม่งั้นเขียนผิดรุ่นเงียบ ๆ */
  cutSpecId: string | null;
};

/** แถวของ "รุ่นเดียว" — ครบทุกบรรทัดในสูตร (มี "ยังไม่ได้ตรวจ" ต่อท้ายถ้าไม่โผล่ในตัวอย่างที่ลองเลย) */
function buildProductRows(p: any, PB: any, cutSpecsById: Record<string, any>): RawRow[] {
  const merged = new Map<string, RawRow>();

  for (const SMP of samplesOf(p)) {
    let calc: any;
    try {
      calc = computeCost(PB, p, { w: SMP.w, h: SMP.h, p: SMP.p || 1, form: SMP.form, color: "white", colorKey: "white" });
    } catch { continue; }

    const rec = cutInputFromRecipe(
      { kind: "std", prodId: p.id, w: SMP.w, h: SMP.h, p: SMP.p || 1, form: SMP.form || p.defForm, spec: {}, glassType: p.defGlass },
      { rawCompare: true },
    );
    const spec = rec && cutSpecsById[rec.spec_id] ? cutSpecsById[rec.spec_id] : null;
    const co = spec ? { ...(spec as any).defaults, ...(rec?.input ?? {}) } : null;
    const mult = rec?.multiplier || 1;

    // ── ฝั่งใบตัด: รวมอุปกรณ์ตามรหัส (ของชิ้นเดียวถูกเขียนหลายบรรทัดได้) ──
    const cutList: { name: string; sku: string; qty: number; unit: string; _names: string[] }[] = [];
    const cutBySku = new Map<string, (typeof cutList)[number]>();
    if (spec) for (const h of ((spec as any).hardware || [])) {
      const q = (Number(val(h.qty, co)) || 0) * mult; if (q <= 0) continue;
      const sku = String(val(h.sku, co) || ""); const nm = String(val(h.name, co));
      const key = sku ? sku.toUpperCase() : null;
      if (key && cutBySku.has(key)) { const e = cutBySku.get(key)!; e.qty += q; e._names.push(nm); continue; }
      const e = { name: nm, sku, qty: q, unit: h.unit || "", _names: [nm] };
      cutList.push(e); if (key) cutBySku.set(key, e);
    }
    for (const e of cutList) if (e._names.length > 1) e.name = e._names.join(" + ");

    // ── ฝั่งใบตัด: รวมอลูตามรหัส (ชิ้น + ความยาวรวม → คำนวณความยาวเฉลี่ย/ชิ้นทีหลัง) ──
    const cutProf = new Map<string, { sku: string; qty: number; unit: string; name: string; totalLen: number }>();
    if (spec) for (const pr of ((spec as any).profiles || [])) {
      const c = String(val(pr.code, co) || "").toUpperCase(); if (!c || c === "-") continue;
      const q = (Number(val(pr.qty, co)) || 0) * mult; if (q <= 0) continue;
      const len = Number(val(pr.len, co)) || 0;
      const e = cutProf.get(c) || { sku: c, qty: 0, unit: "ชิ้น", name: String(val(pr.name, co)), totalLen: 0 };
      e.qty += q; e.totalLen += len * q; cutProf.set(c, e);
    }

    const rawBy = new Map<string, any>();
    for (const g of ["hardware", "consum"]) for (const it of (p[g] || [])) if (!rawBy.has(it.name)) rawBy.set(it.name, it);
    const rawAlu = new Map<string, any>();
    for (const it of (p.alu || [])) if (!rawAlu.has(it.name)) rawAlu.set(it.name, it);

    const used = new Set<number>(), usedProf = new Set<string>();
    // อลูฝั่งคิดราคาต้องรวมตามรหัสก่อนเทียบ (รหัสเดียวถูกเขียนหลายบรรทัดได้ เช่น เสา/ขวาง/คิ้วใช้รหัสเดียวกัน)
    const lines: any[] = [];
    const aluByCode = new Map<string, any>();
    for (const l of (calc.lines || [])) {
      if (l.cat === "labor") continue;
      const c = String(l.cat === "alu" ? (l.code || "") : (l.code || l.sku || "")).toUpperCase();
      if (!c || l.cat === "glass") { lines.push(l); continue; }
      const e = aluByCode.get(c);
      if (!e) { aluByCode.set(c, { ...l, _names: [l.name] }); lines.push(aluByCode.get(c)); continue; }
      e.qty = (e.qty || 0) + (l.qty || 0); e.pieces = (e.pieces || 0) + (l.pieces || 0);
      e.amount = (e.amount || 0) + (l.amount || 0); e._names.push(l.name);
    }
    for (const e of aluByCode.values()) if (e._names.length > 1) e.name = e._names.join(" + ");

    // ── จับคู่ 2 รอบ: รหัสก่อน แล้วค่อยชื่อจากที่เหลือ (กันชื่อคล้ายแย่งกันจับผิดคู่) ──
    const hitOf = new Map<any, any>();
    for (const l of lines) {
      if (l.cat === "alu") continue;
      const mine = skuVariants(l, rawBy.get(l.name));
      if (!mine.length) continue;
      const i = cutList.findIndex((c, ix) => !used.has(ix) && c.sku && mine.includes(String(c.sku).toUpperCase()));
      if (i >= 0) { used.add(i); hitOf.set(l, cutList[i]); }
    }
    for (const l of lines) {
      if (l.cat === "alu" || hitOf.has(l)) continue;
      const i = cutList.findIndex((c, ix) => !used.has(ix)
        && (norm(c.name) === norm(l.name) || norm(c.name).includes(norm(l.name)) || norm(l.name).includes(norm(c.name))));
      if (i >= 0) { used.add(i); hitOf.set(l, cutList[i]); }
    }

    for (const l of lines) {
      const cat: LinkSectionKey = l.cat === "alu" ? "อลูมิเนียม" : l.cat === "glass" ? "กระจก" : "อุปกรณ์/สิ้นเปลือง";
      const code = String(l.code || l.sku || "");
      const raw = rawBy.get(l.name);
      let hit: any = null, cutLenPerPiece: number | null = null;
      if (l.cat === "alu") {
        const e = cutProf.get(code.toUpperCase());
        if (e) { hit = e; usedProf.add(code.toUpperCase()); cutLenPerPiece = e.qty > 0 ? n2(e.totalLen / e.qty) : null; }
      } else {
        hit = hitOf.get(l) || null;
      }
      const myQty = l.cat === "alu" ? Number(l.pieces) || 0 : Number(l.qty) || 0;
      const notInCutByNature = l.cat === "glass" || /ซิลิโคน|ค่าอบ|ค่าดัด|ปัดขึ้น/.test(String(l.name));
      const rawStatus = !spec ? "ยังไม่ผูกไฟล์"
        : !hit ? (notInCutByNature ? "ใบตัดไม่ลงประเภทนี้" : "ใบตัดไม่มีรายการนี้")
        : !code ? "คิดราคายังไม่มีรหัส" : !hit.sku ? "ใบตัดไม่ให้รหัส"
        : code.toUpperCase() !== String(hit.sku).toUpperCase() ? "รหัสไม่ตรง"
        : Math.abs(myQty - hit.qty) <= Math.max(0.05, hit.qty * 0.02) ? "ตรง" : "จำนวนต่าง";
      const row: RawRow = {
        section: cat, name: l.name, calcSku: code, calcPrice: n2(l.unitPrice), calcUnit: l.unit || "",
        calcQty: n2(l.cat === "alu" ? myQty : (l.qty ?? null)), calcAmount: n2(l.amount), sizeLabel: SMP.label,
        cutSku: hit ? (hit.sku || "") : "", cutQty: hit ? n2(hit.qty) : null, cutUnit: hit ? (hit.unit || "") : "",
        cutLenPerPiece, rawStatus, hasCutSpec: !!spec, cutSpecId: spec ? (spec as { id: string }).id : null,
      };
      void raw;
      const key = String(row.calcSku || row.cutSku || `ชื่อ:${row.name}`).toUpperCase();
      const cur = merged.get(key);
      if (!cur || (RANK0[row.rawStatus] ?? 99) < (RANK0[cur.rawStatus] ?? 99)) merged.set(key, row);
    }

    // ── ใบตัดมี แต่ฝั่งคิดราคาไม่โผล่เลย (แยก "สูตรไม่มีรหัสนี้" กับ "สูตรมีแต่เงื่อนไขไม่เข้า/คิดออก 0") ──
    const calcAllCodes = new Set<string>();
    for (const it of (p.alu || [])) for (const c of skuVariants({}, { sku: it.code })) calcAllCodes.add(c);
    for (const g of ["hardware", "consum"]) for (const it of (p[g] || [])) for (const c of skuVariants({}, it)) calcAllCodes.add(c);
    const cutOnlySt = (sku: string) => (sku && calcAllCodes.has(sku.toUpperCase())) ? "จำนวนต่าง" : "คิดราคาไม่มีรายการนี้";
    cutList.forEach((c, ix) => {
      if (used.has(ix)) return;
      const st = cutOnlySt(c.sku);
      const row: RawRow = {
        section: "มีแต่ในใบตัด", name: c.name, calcSku: "", calcPrice: null, calcUnit: c.unit || "",
        calcQty: st === "จำนวนต่าง" ? 0 : null, calcAmount: null, sizeLabel: SMP.label,
        cutSku: c.sku || "", cutQty: n2(c.qty), cutUnit: c.unit || "", cutLenPerPiece: null, rawStatus: st, hasCutSpec: true,
        cutSpecId: spec ? (spec as { id: string }).id : null,
      };
      const key = String(row.cutSku || `ชื่อ:${row.name}`).toUpperCase();
      const cur = merged.get(key);
      if (!cur || (RANK0[row.rawStatus] ?? 99) < (RANK0[cur.rawStatus] ?? 99)) merged.set(key, row);
    });
    for (const [c, e] of cutProf) {
      if (usedProf.has(c)) continue;
      const st = cutOnlySt(e.sku);
      const row: RawRow = {
        section: "มีแต่ในใบตัด (อลู)", name: e.name, calcSku: "", calcPrice: null, calcUnit: e.unit,
        calcQty: st === "จำนวนต่าง" ? 0 : null, calcAmount: null, sizeLabel: SMP.label,
        cutSku: e.sku, cutQty: n2(e.qty), cutUnit: e.unit, cutLenPerPiece: e.qty > 0 ? n2(e.totalLen / e.qty) : null,
        rawStatus: st, hasCutSpec: true, cutSpecId: spec ? (spec as { id: string }).id : null,
      };
      const key = String(row.cutSku || `ชื่อ:${row.name}`).toUpperCase();
      const cur = merged.get(key);
      if (!cur || (RANK0[row.rawStatus] ?? 99) < (RANK0[cur.rawStatus] ?? 99)) merged.set(key, row);
    }
  } // ← จบลูปตัวอย่างขนาด

  const rows = [...merged.values()];

  // ── ของที่ "ไม่โผล่เลยสักขนาดที่ลอง" → "ยังไม่ได้ตรวจ" (ไม่ใช่ "ไม่ต้องทำ" — เจ้าของท้วง 1 ก.ย.69) ──
  {
    const shown = new Set<string>();
    for (const r of rows) for (const c of [r.calcSku.toUpperCase(), r.cutSku.toUpperCase()]) if (c) shown.add(c);
    const seenX = new Set<string>();
    for (const g of ["alu", "hardware", "consum"]) for (const it of (p[g] || [])) {
      const codes = g === "alu" ? skuVariants({}, { sku: it.code }) : skuVariants({}, it);
      for (const c of codes) {
        if (!c || shown.has(c) || seenX.has(c)) continue;
        seenX.add(c);
        rows.push({
          section: g === "alu" ? "อลูมิเนียม" : "อุปกรณ์/สิ้นเปลือง", name: it.name, calcSku: c,
          calcPrice: n2(it.price), calcUnit: it.unit || "", calcQty: null, calcAmount: null,
          sizeLabel: "— ไม่โผล่ในขนาด/รูปแบบที่ลอง —", cutSku: "", cutQty: null, cutUnit: "", cutLenPerPiece: null,
          rawStatus: "ยังไม่ได้ตรวจ", hasCutSpec: false, cutSpecId: null,
        });
      }
    }
  }
  return rows;
}

/**
 * สร้างแถวของ "ทุกรุ่น" — products ต้อง apply override (ทั้ง calc/cut) มาก่อนแล้ว
 * PB ต้องเป็น pricebook ที่ทับราคาสโตร์ไว้แล้ว (buildPriceOverride/applyPriceOverride) — ราคาชุดเดียวกับหน้าคิดราคาจริง
 */
export function buildLinkRowsWithPricebook(products: Record<string, any>, PB: any, cutSpecsById: Record<string, any>, only?: { productId: string; sample: Sample } | null): LinkRow[] {
  const out: LinkRow[] = [];
  for (const p of Object.values(products) as any[]) {
    if (!p || !p.id) continue;
    if (p.id === "sms_slide") continue;   // รุ่นเก่าที่ถูกแทนแล้ว — เว้นเหมือน gen-store-link-csv.mjs
    let raw: RawRow[];
    try { raw = buildProductRows(p, PB, cutSpecsById, only && only.productId === p.id ? only.sample : null); } catch { continue; }
    if (!raw.length) continue;

    // นับรหัสซ้ำในรุ่นเดียวกัน (0135 ยังไม่รัน → override แก้ได้แค่บรรทัดแรกของรหัสที่ซ้ำ)
    const keyCount = new Map<string, number>();
    for (const r of raw) {
      const k = (r.calcSku || r.cutSku || `name:${r.name}`).toUpperCase();
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }

    raw.forEach((r, i) => {
      const matchKey = r.calcSku || r.cutSku || `name:${r.name}`;
      out.push({
        key: `${p.id}::${r.section}::${matchKey}::${i}`,
        productId: p.id, productName: p.name, productGroup: Number(p.group) || 0,
        section: r.section, name: r.name, matchKey,
        calcSku: r.calcSku, calcQty: r.calcQty, calcUnit: r.calcUnit, calcPrice: r.calcPrice, calcAmount: r.calcAmount,
        cutSku: r.cutSku, cutQty: r.cutQty, cutUnit: r.cutUnit, cutLenPerPiece: r.cutLenPerPiece,
        status: STATUS_MAP[r.rawStatus] ?? "fyi", sizeLabel: r.sizeLabel, hasCutSpec: r.hasCutSpec, cutSpecId: r.cutSpecId,
        dupKeyInProduct: (keyCount.get(matchKey.toUpperCase()) ?? 0) > 1,
      });
    });
  }
  return out;
}

export type LinkRowFull = LinkRow & {
  stockName: string | null;
  stockPrice: number | null;
  stockQty: number | null;
  stockColor: string | null;
  stockCategory: string | null;
  stockFound: boolean;
  /** override ฝั่งคิดราคา (scope='calc', คีย์ด้วย productId) — ใช้โชว์ป้าย "แก้แล้ว"/ปุ่มคืนค่า/ตรวจแล้วหลัก */
  override: OverrideRow | null;
  /** override ฝั่งใบตัด (scope='cut', คีย์ด้วย cutSpecId — คนละ namespace) — แถวที่มีทั้งคิดราคา+ใบตัดแก้ได้ทั้งคู่พร้อมกัน */
  cutOverride: OverrideRow | null;
  reviewed: boolean;
};

/** ต่อข้อมูลสโตร์ + override เข้าแถว (แยกจาก buildLinkRowsWithPricebook เพื่อให้ทดสอบตรรกะคำนวณล้วน ๆ ได้โดยไม่ง้อ DB) */
export function attachStockAndOverrides(rows: LinkRow[], stock: LinkStockRow[], overrides: OverrideRow[]): LinkRowFull[] {
  const bySku = new Map<string, LinkStockRow[]>();
  for (const s of stock) {
    const k = String(s.sku || "").trim().toUpperCase();
    if (!k) continue;
    const arr = bySku.get(k);
    if (arr) arr.push(s); else bySku.set(k, [s]);
  }
  const ovByKey = new Map<string, OverrideRow>();
  // ⚠ กุญแจจริงคือ รหัส + ชื่อบรรทัด (รหัสเดียวใช้หลายบรรทัดได้) — เก็บทั้ง 2 แบบ
  //   แถวเก่าที่ยังไม่มี match_name ผูกด้วยรหัสอย่างเดียวเหมือนเดิม (เข้ากันได้ย้อนหลัง)
  for (const o of overrides) {
    const nm = String((o as { match_name?: string }).match_name ?? "").trim();
    if (nm) ovByKey.set(`${o.product_id}::${o.scope}::${o.match_key}::${nm}`, o);
    else ovByKey.set(`${o.product_id}::${o.scope}::${o.match_key}`, o);
  }

  return rows.map((r) => {
    const sku = (r.calcSku || r.cutSku || "").trim().toUpperCase();
    const candidates = sku ? (bySku.get(sku) ?? []) : [];
    // หลายสี → เอาราคาแถวแรกโชว์เป็นตัวแทน (ตารางย่อยในดรอว์เออร์โชว์ครบทุกสีอยู่แล้ว)
    const s = candidates[0] ?? null;
    // ของคิดต่อโล (อลูรายเส้น) — ราคา "ต่อหน่วยจริง" = น้ำหนัก/เส้น × เรตต่อโล ไม่ใช่ price_per_kg เฉย ๆ
    //   (เหมือน StockDrawer.tsx ต้องคำนวณสมการเดียวกัน ไม่งั้นตัวเลขในตารางหลักกับในดรอว์เออร์ไม่ตรงกัน)
    const stockPrice = s ? (s.is_weight_based ? s.weight_per_unit * s.price_per_kg : s.unit_cost) : null;
    // ⚠ scope='calc' คีย์ด้วย productId (PRODUCTS) · scope='cut' คีย์ด้วย cutSpecId (CUT_SPEC_BY_ID) — คนละ namespace
    //   ผูกผิด id จะหาไม่เจอ (แถว "แก้แล้ว" หาย) หรือแย่กว่านั้นคือไปชนกับรุ่นอื่นที่ id เดียวกันโดยบังเอิญ
    const ov = ovByKey.get(`${r.productId}::calc::${r.matchKey}`) ?? null;
    const cutOv = r.cutSpecId ? (ovByKey.get(`${r.cutSpecId}::cut::${r.matchKey}`) ?? null) : null;
    return {
      ...r,
      stockName: s?.name ?? null, stockPrice,
      stockQty: s?.qty_on_hand ?? null, stockColor: s?.color ?? null, stockCategory: s?.category ?? null, stockFound: !!s,
      override: ov, cutOverride: cutOv, reviewed: !!(ov?.reviewed_at || cutOv?.reviewed_at),
    };
  });
}
