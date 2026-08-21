/**
 * compare-cut — เทียบ "คิดราคา 4.0" ↔ "ใบตัด" ทีละรหัส (เจ้าของสั่ง 19 ส.ค.69)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ ไฟล์นี้ "ไม่มีสูตรของตัวเอง" — ดึงผลจากของเดิมทั้งหมด แล้วเอามาวางเทียบเท่านั้น
 *     คิดราคา → computeCost() (engine.mjs)      ← สูตรเดียวกับหน้าคิดราคา 4.0
 *     ใบตัด    → computeCutList() (cutlist/engine) ← สูตรเดียวกับหน้าใบตัด
 *     ราคา     → pricebook + ราคาสโตร์ (stock-link) ← ชุดเดียวกับที่ใช้จริง
 *   แก้สูตรที่ต้นทางที่เดียว หน้านี้เปลี่ยนตามทันที · ห้ามคำนวณอะไรใหม่ในไฟล์นี้เด็ดขาด
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computeCost } from "./engine.mjs";
import { PRODUCTS } from "./products.mjs";
import { computeCutList, type CutInput } from "../cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../cutlist/products.ts";
import { cutInputFromRecipe } from "../cutlist/from-recipe.ts";
import { cutHardwareLines, HANDLE_FIELDS, HW_FROM_CUTLIST } from "./hardware-from-cutlist.ts";
import { stockColorOfCalc } from "./stock-link.ts";
import { resolveAluColor } from "./alu-colors.ts";

export { HANDLE_FIELDS, HW_FROM_CUTLIST };

/** รุ่นในคิดราคา 4.0 ที่แมปเข้าใบตัดได้ (ตาม from-recipe) — มีเท่านี้ที่เทียบได้ */
export const COMPARABLE = ["sms_slide", "euro_slide", "slimlux", "fixed", "folding", "velora", "pcdoor", "gate"] as const;

export type CompareInput = {
  prodId: string;
  w: number; h: number; p: number;
  form?: string;
  color?: string;                       // คีย์สีในคิดราคา (white/black/sahara/...)
  glassType?: string;
  spec?: Record<string, unknown>;
  cut?: Record<string, unknown>;        // ตัวเลือกฝั่งใบตัด (มือจับ/ราง/มุ้ง)
  profitPct?: number;
};

export type AluRow = {
  code: string; name: string;
  calcBars: number; calcPricePerBar: number; calcAmount: number; kgPerBar: number; bahtPerKg: number;
  calcLenCm: number; calcPieces: number; barCounted: boolean;
  cutBars: number; cutTotalLenCm: number; cutStockLen: number; cutPieces: number;
  status: "ตรง" | "จำนวนต่าง" | "มีแต่คิดราคา" | "มีแต่ใบตัด" | "ไม่มีรหัส";
};
export type HwRow = {
  sku: string; name: string;
  calcQty: number; calcPrice: number; calcAmount: number; calcUnit: string;
  cutQty: number; cutUnit: string;
  status: "ตรง" | "จำนวนต่าง" | "มีแต่คิดราคา" | "มีแต่ใบตัด" | "ไม่มีรหัส";
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const eq = (a: number, b: number) => Math.abs(a - b) < 0.05;

/** สถานะจากคู่จำนวน (ฝั่งคิดราคา, ฝั่งใบตัด) */
function statusOf(calc: number, cut: number, hasKey: boolean): AluRow["status"] {
  if (!hasKey) return "ไม่มีรหัส";
  if (calc > 0 && cut <= 0) return "มีแต่คิดราคา";
  if (cut > 0 && calc <= 0) return "มีแต่ใบตัด";
  return eq(calc, cut) ? "ตรง" : "จำนวนต่าง";
}


/**
 * บอกให้ชัดว่า "ทำไมเทียบไม่ได้" — บอกด้วยว่าไฟล์ตัดประกอบมีแบบไหนบ้าง
 * เจ้าของงง 20 ส.ค.69: เห็นขึ้นว่าไม่มีสูตร ทั้งที่ไฟล์มีชีตอยู่ (แค่คนละจำนวนบาน)
 */
function whyNoCut(prodId: string, form: string, panels: number): string {
  if (prodId === "euro_slide") {
    if (form === "เปิดคู่กลาง")
      return `ไฟล์ตัดประกอบ FUJI มีเปิดคู่กลางเฉพาะ 4 บาน (ชีต "เลื่อนแบ่ง4") กับ 6 บาน (ชีต "เลื่อนแบ่ง6-กลาง") — ตอนนี้เลือก ${panels} บาน`;
    if (form === "ลากจูง")
      return "ไฟล์ตัดประกอบ FUJI ไม่มีชีตลากจูงเลย (มีเฉพาะไฟล์ SMS) — ต้องกรอกใบตัดเอง";
    return `ไฟล์ตัดประกอบ FUJI ที่ลงระบบแล้วมี 2 กับ 3 บาน — ตอนนี้เลือก ${panels} บาน (ไฟล์มีชีต 4/5 บานอยู่ แต่ยังไม่ได้พอร์ตขึ้นระบบ)`;
  }
  return "รุ่น/รูปแบบนี้ยังไม่มีสูตรใบตัดในระบบ — ต้องกรอกใบตัดเอง";
}

export function compareCut(PB: any, inp: CompareInput) {
  const prod = (PRODUCTS as any)[inp.prodId];
  if (!prod) return null;

  // ── ฝั่งคิดราคา 4.0 — เรียก engine ตัวเดียวกับหน้าคิดราคา ──────────────
  const rc = resolveAluColor(inp.color || "white");
  const opt: any = {
    w: inp.w, h: inp.h, p: inp.p, form: inp.form || prod.defForm,
    color: rc.bake, colorName: rc.label, stockColor: stockColorOfCalc(inp.color || "white"), colorKey: inp.color || "white",
    glassType: inp.glassType || prod.defGlass || undefined,
    spec: inp.spec ?? {}, addons: {},
    profitPct: inp.profitPct ?? 100, installProfitPct: inp.profitPct ?? 100,
  };
  const hwl = cutHardwareLines({ prodId: inp.prodId, w: inp.w, h: inp.h, p: inp.p, form: opt.form, spec: inp.spec, cut: inp.cut });
  if (hwl?.length) opt.hardwareLines = hwl;
  const calc: any = computeCost(PB, prod, opt);

  // ── ฝั่งใบตัด — เรียก engine ใบตัดตัวเดียวกับหน้าใบตัด ────────────────
  const map = cutInputFromRecipe({
    kind: "std", prodId: inp.prodId, w: inp.w, h: inp.h, p: inp.p,
    form: opt.form, spec: inp.spec ?? {}, glassType: opt.glassType,
  });
  const spec = map ? CUT_SPEC_BY_ID[map.spec_id] : null;
  const cutSel = Object.fromEntries(Object.entries(inp.cut ?? {}).filter(([, v]) => v != null && v !== ""));
  const cut = spec ? computeCutList(spec, { ...map!.input, ...cutSel } as Partial<CutInput>, map!.multiplier ?? 1) : null;

  // จำนวนชิ้นต่อรหัสฝั่งใบตัด (รวมทุกบรรทัดที่ใช้รหัสเดียวกัน เช่น ขวางบน+ขวางล่าง)
  const cutPiecesOf = (code: string) => r2((cut?.rows ?? []).filter((r: any) => r.code === code).reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0));

  // ── ① เทียบอลูรายรหัส ─────────────────────────────────────────────────
  const calcAlu = (calc.lines ?? []).filter((l: any) => l.cat === "alu");
  const byCode = new Map<string, AluRow>();
  for (const l of calcAlu) {
    const code = String(l.code || "");
    const key = code || `ไม่มีรหัส:${l.name}`;
    const e = byCode.get(key) ?? {
      code, name: l.name, calcBars: 0, calcPricePerBar: l.unitPrice, calcAmount: 0,
      kgPerBar: l.kg || 0, bahtPerKg: l.kg > 0 ? r2(l.unitPrice / l.kg) : 0,
      calcLenCm: 0, calcPieces: 0, barCounted: false,
      cutBars: 0, cutTotalLenCm: 0, cutStockLen: 0, cutPieces: 0, status: "ตรง",
    };
    e.calcBars = r2(e.calcBars + l.qty); e.calcAmount = r2(e.calcAmount + l.amount);
    e.calcLenCm = r2(e.calcLenCm + (Number(l.lenM) || 0) * 100); e.calcPieces = r2(e.calcPieces + (Number(l.pieces) || 0));
    if (l.barCounted) e.barCounted = true;
    byCode.set(key, e);
  }
  for (const b of (cut?.barsByCode ?? [])) {
    const e = byCode.get(b.code);
    if (e) { e.cutBars = b.bars; e.cutTotalLenCm = b.totalLenCm; e.cutStockLen = b.stockLen; e.cutPieces = cutPiecesOf(b.code); }
    else byCode.set(b.code, {
      code: b.code, name: cut!.rows.find((r) => r.code === b.code)?.name ?? "",
      calcBars: 0, calcPricePerBar: 0, calcAmount: 0, kgPerBar: 0, bahtPerKg: 0, calcLenCm: 0, calcPieces: 0, barCounted: false,
      cutBars: b.bars, cutTotalLenCm: b.totalLenCm, cutStockLen: b.stockLen, cutPieces: cutPiecesOf(b.code), status: "มีแต่ใบตัด",
    });
  }
  // เทียบด้วย "จำนวนชิ้นที่ต้องตัด" ไม่ใช่ "จำนวนเส้น" และไม่ใช่ "ความยาว":
  //   • จำนวนเส้น — สองฝั่งนับคนละวิธีโดยตั้งใจ (คิดราคา = ยาวรวม÷6.4+เศษ30% ตามไฟล์ถอดทุน · ใบตัด = เส้นเต็มที่หยิบมาตัด)
  //   • ความยาว   — ใบตัดหักเผื่อประกอบรายเส้น (เช่น เฟรมบน = กว้าง−4.4 ซม.) คิดราคาใช้ขนาดเต็ม
  //   • จำนวนชิ้น — ต้องตรงกันเป๊ะ: ของที่ช่างตัดจริงกี่ท่อน คิดราคาต้องคิดเงินเท่านั้นท่อน
  // บรรทัดที่ไฟล์ถอดทุนนับเป็น "เส้นเต็ม" (ไม่ได้บอกความยาวชิ้น) → คิดราคาไม่รู้จำนวนชิ้น
  //   เทียบชิ้นกับใบตัดไม่ได้ แต่เทียบ "จำนวนเส้นที่ต้องซื้อ" ได้ตรง ๆ → เทียบช่องเส้นแทน
  //   (เจ้าของถาม 20 ส.ค.69: ป้าย "นับคนละหน่วย" เดิมขึ้นทุกบรรทัดพวกนี้ ทั้งที่ส่วนใหญ่เส้นตรงกันอยู่แล้ว)
  const alu: AluRow[] = [...byCode.values()].map((e) => ({
    ...e,
    calcPieces: e.barCounted ? 0 : e.calcPieces,   // 0 = หน้าจอขึ้น "—" (คิดราคาไม่ได้นับเป็นชิ้น)
    status: e.barCounted
      ? statusOf(r2(e.calcBars), r2(e.cutBars), !!e.code)
      : statusOf(r2(e.calcPieces), r2(e.cutPieces), !!e.code),
  }));

  // ── ② เทียบอุปกรณ์รายรหัสสโตร์ ────────────────────────────────────────
  const calcHw = (calc.lines ?? []).filter((l: any) => l.cat === "hardware" || l.cat === "consum");
  const bySku = new Map<string, HwRow>();
  for (const l of calcHw) {
    const sku = String(l.sku || "");
    const key = sku || `ไม่มีรหัส:${l.name}`;
    const e = bySku.get(key) ?? {
      sku, name: l.name, calcQty: 0, calcPrice: l.unitPrice, calcAmount: 0, calcUnit: l.unit || "",
      cutQty: 0, cutUnit: "", status: "ตรง" as HwRow["status"],
    };
    e.calcQty = r2(e.calcQty + l.qty); e.calcAmount = r2(e.calcAmount + l.amount);
    bySku.set(key, e);
  }
  for (const h of (cut?.hardware ?? [])) {
    const key = h.sku || `ไม่มีรหัส:${h.name}`;
    const e = bySku.get(key);
    if (e) { e.cutQty = r2(e.cutQty + h.qty); e.cutUnit = h.unit; }
    else bySku.set(key, {
      sku: h.sku, name: h.name, calcQty: 0, calcPrice: 0, calcAmount: 0, calcUnit: "",
      cutQty: h.qty, cutUnit: h.unit, status: "มีแต่ใบตัด",
    });
  }
  const hardware: HwRow[] = [...bySku.values()].map((e) => ({ ...e, status: statusOf(e.calcQty, e.cutQty, !!e.sku) }));

  // ── ③ เรตอลู ฿/กก. ที่ใช้จริง ────────────────────────────────────────
  const brand = prod.brand || "SMS";
  const rate = Number(PB.ALU?.[brand]) || 0;
  const base = Number(PB.ALU_BASE?.[brand]) || rate || 1;

  const order = { "มีแต่ใบตัด": 0, "จำนวนต่าง": 1, "มีแต่คิดราคา": 2, "ไม่มีรหัส": 3, "ตรง": 4 } as const;
  const sortFn = (a: { status: string; code?: string; sku?: string }, b: typeof a) =>
    (order as any)[a.status] - (order as any)[b.status] || String(a.code ?? a.sku).localeCompare(String(b.code ?? b.sku));

  return {
    ok: !!cut,
    cutSpecId: map?.spec_id ?? "",
    cutSpecName: spec?.name ?? "",
    note: cut ? "" : whyNoCut(inp.prodId, inp.form || prod.defForm, inp.p),
    alu: alu.sort(sortFn as any),
    hardware: hardware.sort(sortFn as any),
    aluRate: { brand, rate, base, mult: r2(rate / base) },
    totals: {
      calcAluBars: r2(alu.reduce((s, r) => s + r.calcBars, 0)),
      cutAluBars: cut?.totalBars ?? 0,
      cutBarsByCode: (cut?.barsByCode ?? []).reduce((s, b) => s + b.bars, 0),
      aluCost: calc.cost?.alu ?? 0, bakeCost: calc.cost?.bake ?? 0, glassCost: calc.cost?.glass ?? 0,
      hwCost: (calc.cost?.hardware ?? 0) + (calc.cost?.consum ?? 0),
      costTotal: calc.cost?.total ?? 0, aluKg: calc.aluKg ?? 0,
      sellMfg: calc.sell?.mfgOnly ?? 0, sellInstall: calc.sell?.withInstall ?? 0,
      laborProd: calc.labor?.prod ?? 0, laborInstall: calc.labor?.install ?? 0,
    },
    hwFromCutlist: !!calc.hwFromCutlist,
    hwMissing: calc.hwMissing ?? [],
    hwFileFallback: calc.hwFileFallback ?? [],
    cutRows: cut?.rows ?? [],
  };
}
