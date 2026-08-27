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
import { cutAluLines, cutRoofConsumLines, cutUncodedLines, multiRoofArea, ALU_FROM_CUTLIST } from "./alu-from-cutlist.ts";
import { RM } from "./products.mjs";
import { stockColorOfCalc } from "./stock-link.ts";
import { resolveAluColor } from "./alu-colors.ts";

export { HANDLE_FIELDS, HW_FROM_CUTLIST };

/** รุ่นในคิดราคา 4.0 ที่แมปเข้าใบตัดได้ (ตาม from-recipe) — มีเท่านี้ที่เทียบได้ */
export const COMPARABLE = ["sms_slide", "euro_slide", "slimlux", "fixed", "folding", "fold_euro", "fold_lift", "velora", "pcdoor", "gate", "roof", "roof_gable",
  "roof_multi", "glasshouse_multi", "gable_multi"] as const;

export type CompareInput = {
  prodId: string;
  w: number; h: number; p: number;
  form?: string;
  color?: string;                       // คีย์สีในคิดราคา (white/black/sahara/...)
  material?: string;                    // วัสดุมุง (หลังคา/กันสาด) — รุ่นที่มี prod.materials
  glassType?: string;
  spec?: Record<string, unknown>;
  cut?: Record<string, unknown>;        // ตัวเลือกฝั่งใบตัด (มือจับ/ราง/มุ้ง)
  profitPct?: number;
};

export type AluRow = {
  code: string; name: string;
  calcBars: number; calcPricePerBar: number; calcAmount: number; kgPerBar: number; bahtPerKg: number;
  calcLenCm: number; calcPieces: number; barCounted: boolean;
  /** ของสั่งตามงาน — ตั้งใจไม่ผูกสโตร์ ราคาอยู่ในสูตร */
  orderOnly?: boolean;
  cutBars: number; cutTotalLenCm: number; cutStockLen: number; cutPieces: number;
  status: "ตรง" | "จำนวนต่าง" | "มีแต่คิดราคา" | "มีแต่ใบตัด" | "ไม่มีรหัส" | "ไม่สต็อก สั่งใหม่";
};
export type HwRow = {
  sku: string; name: string;
  calcQty: number; calcPrice: number; calcAmount: number; calcUnit: string;
  /** ของสั่งตามงาน — ตั้งใจไม่ผูกสโตร์ ราคาอยู่ในสูตร */
  orderOnly?: boolean;
  cutQty: number; cutUnit: string;
  status: "ตรง" | "จำนวนต่าง" | "มีแต่คิดราคา" | "มีแต่ใบตัด" | "ไม่มีรหัส" | "ไม่สต็อก สั่งใหม่";
};

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
// เท่ากันไหม — ของนับเป็น "เมตร" (ยาง/สักหลาด) สองฝั่งปัดทศนิยม 1 ตำแหน่งคนละจังหวะ
//   ต่างกันได้ถึง 0.1 ม. ทั้งที่สูตรเดียวกัน → ยอมรับถ้า ≤10 ซม. และ ≤2% ของค่าที่มากกว่า
//   ของนับเป็นชิ้น/ท่อน ไม่กระทบ (8 vs 16 = 100% → ยังจับได้)
// +1e-9 กันทศนิยมลอย: 20.3-20.2 ออกมาเป็น 0.10000000000000142 ซึ่งเกิน 0.1 พอดี
const eq = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return d < 0.05 || (d <= 0.1 + 1e-9 && d <= Math.max(a, b) * 0.02 + 1e-9);
};

/** สถานะจากคู่จำนวน (ฝั่งคิดราคา, ฝั่งใบตัด) */
function statusOf(calc: number, cut: number, hasKey: boolean, orderOnly = false): AluRow["status"] {
  // ของสั่งตามงาน (มอเตอร์/ราง/เหล็กยัดเสา ฯลฯ) — ตั้งใจไม่ผูกสโตร์ ราคาอยู่ในสูตร
  //   ไม่ใช่ "ตกหล่น" → ขึ้นเขียว ไม่ต้องให้ใครมาไล่ตามอีก (เจ้าของสั่ง 26 ส.ค.69)
  if (orderOnly && calc > 0) return "ไม่สต็อก สั่งใหม่";
  // ⚠ ลำดับสำคัญ: เช็ค "จำนวนตรงกันไหม" ก่อน แล้วค่อยเช็คว่าผูกรหัสหรือยัง
  //   ของบางตัวยังไม่มีรหัสสโตร์ (ยาง/สักหลาด) แต่ทั้งสองฝั่งมีชื่อเดียวกันจำนวนเท่ากัน = ตรง
  //   เรื่อง "ผูกรหัสหรือยัง" มีหน้าตรวจสโตร์ดูแลแยกอยู่แล้ว (เจ้าของสั่ง 21 ส.ค.69 เอาเขียวล้วน)
  if (calc > 0 && cut > 0) return eq(calc, cut) ? "ตรง" : "จำนวนต่าง";
  if (!hasKey) return "ไม่มีรหัส";
  if (calc > 0) return "มีแต่คิดราคา";
  if (cut > 0) return "มีแต่ใบตัด";
  return "ตรง";
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
    if (panels >= 4 && panels <= 5)
      return `บานเลื่อน ${panels} บาน รับเฉพาะงานนอก (รางกันน้ำ) — งานใน (รางเตี้ย) เจ้าของตัดออก เพราะต้องสั่งโปรไฟล์เพิ่มเยอะ`;
    return `ไฟล์ตัดประกอบ FUJI มี 2 · 3 · 4 · 5 บาน — ตอนนี้เลือก ${panels} บาน`;
  }
  return "รุ่น/รูปแบบนี้ยังไม่มีสูตรใบตัดในระบบ — ต้องกรอกใบตัดเอง";
}

/**
 * ตัวเลือกฝั่งใบตัดของรุ่นนี้จริง ๆ (มือจับ/ราง/คาน ฯลฯ) — หน้าจอเอาไปสร้าง dropdown
 * ⚠ ห้าม hardcode รายการมือจับของ SMS ไว้ทุกรุ่น — SlimLux ไม่มี "ล็อค+ดัมมี่" (เจ้าของเจอ 21 ส.ค.69)
 */
export function cutOptionsFor(inp: Pick<CompareInput, "prodId" | "w" | "h" | "p" | "form" | "spec" | "glassType" | "material">) {
  const prod = (PRODUCTS as any)[inp.prodId];
  if (!prod) return [];
  const map = cutInputFromRecipe({
    kind: "std", prodId: inp.prodId, w: inp.w, h: inp.h, p: inp.p,
    form: inp.form || prod.defForm, spec: inp.spec ?? {}, glassType: inp.glassType,
    material: inp.material ?? prod.defMaterial,
  }, { rawCompare: true });   // หน้าเทียบ read-only → อนุญาตรุ่นดิบ (กันสาด)
  const spec = map ? CUT_SPEC_BY_ID[map.spec_id] : null;
  if (!spec) return [];
  const def = (spec.defaults ?? {}) as Record<string, unknown>;
  // ⚠ ตัดช่องที่ from-recipe กำหนดให้แล้วจากฝั่งคิดราคาออก (เช่น SlimLux "มือจับ" มาจาก spec.slxhandle)
  //   ถ้าโชว์ซ้ำ = มี 2 ช่อง กดช่องใบตัดแล้วราคาไม่ขยับ (เจ้าของเจอ 21 ส.ค.69: เลือก X-J แล้วยังคิดมือจับล็อค)
  const derived = new Set(Object.keys(map?.input ?? {}));
  // บาง spec มี opt ที่ไม่ใช่ dropdown (ช่องกรอกเอง) → ข้ามไป ไม่งั้นหน้าจอพัง
  return (spec.opts ?? [])
    .filter((o: { key: string; choices?: readonly string[] }) => !derived.has(o.key))
    .filter((o: { choices?: readonly string[] }) => Array.isArray(o.choices) && o.choices.length > 0)
    .map((o: any) => ({
      key: o.key, label: o.label, choices: [...o.choices],
      def: String(def[o.key] ?? o.choices[0] ?? ""),
    }));
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
    material: inp.material ?? prod.defMaterial ?? undefined,   // วัสดุมุง (หลังคา/กันสาด)
    spec: inp.spec ?? {}, addons: {},
    profitPct: inp.profitPct ?? 100, installProfitPct: inp.profitPct ?? 100,
  };
  const hwl = cutHardwareLines({ prodId: inp.prodId, w: inp.w, h: inp.h, p: inp.p, form: opt.form, spec: inp.spec, cut: inp.cut });
  if (hwl?.length) opt.hardwareLines = hwl;

  // ── ฝั่งใบตัด — เรียก engine ใบตัดตัวเดียวกับหน้าใบตัด ────────────────
  //   ⚠ ต้องทำก่อน computeCost — หลังคาหลายด้านเอาเส้นอลูมาจากใบตัดโดยตรง (ALU_FROM_CUTLIST)
  const map = cutInputFromRecipe({
    kind: "std", prodId: inp.prodId, w: inp.w, h: inp.h, p: inp.p,
    form: opt.form, spec: inp.spec ?? {}, glassType: opt.glassType,
    material: inp.material ?? prod.defMaterial,   // วัสดุมุง → ชนิดแผ่นใบตัด (กันสาด)
    color: inp.color || "white",   // ⚠ ต้องส่งสีด้วย — เส้นที่เลือกรหัสตามสี (X-J) จะเพี้ยนถ้าไม่ส่ง
  }, { rawCompare: true });   // หน้าเทียบ read-only → อนุญาตรุ่นดิบ (กันสาด)
  if (ALU_FROM_CUTLIST[inp.prodId] && map) {
    const ci = { ...map.input, ...Object.fromEntries(Object.entries(inp.cut ?? {}).filter(([, v]) => v != null && v !== "")) };
    const ar = multiRoofArea(inp.prodId, ci as Record<string, unknown>);   // พื้นที่รวมทุกด้าน (ตร.ม.)
    const al = cutAluLines({ prodId: inp.prodId, cutInput: ci as Record<string, unknown> });
    if (al?.length) opt.aluLines = al;
    const cl = cutRoofConsumLines({ prodId: inp.prodId, cutInput: ci as Record<string, unknown>, material: String(opt.material ?? "ไวนิล"), rm: RM as never, planArea: ar });
    if (cl?.length) opt.consumLines = cl;
    // แถวใบตัดที่ไม่มีรหัสสโตร์ (ราง/เสารับ/ฉาก) — ของจริงที่ต้องจ่าย ห้ามหล่นหาย
    const un = cutUncodedLines({ prodId: inp.prodId, cutInput: ci as Record<string, unknown> });
    if (un?.length) opt.consumLines = [...(opt.consumLines ?? prod.consum ?? []), ...un];
    // พื้นที่ = ผลรวมทุกด้าน (ไม่ใช่ กว้าง×สูง) — ส่งเสมอแม้เป็น 0 ไม่งั้นตกไปใช้ กว้าง×สูง
    if (ar > 0 || prod.multiSide) opt.areaOverride = ar;
  }
  const calc: any = computeCost(PB, prod, opt);
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
      calcLenCm: 0, calcPieces: 0, barCounted: false, orderOnly: !!l.orderOnly,
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
      ? statusOf(r2(e.calcBars), r2(e.cutBars), !!e.code, e.orderOnly)
      : statusOf(r2(e.calcPieces), r2(e.cutPieces), !!e.code, e.orderOnly),
  }));

  // ── ② เทียบอุปกรณ์รายรหัสสโตร์ ────────────────────────────────────────
  // ⚠ รุ่นที่ "ค่าของมาจากใบตัด" (HW_FROM_CUTLIST): ถ้ามีรหัสไหนยังไม่ตั้งราคาในสโตร์แม้ตัวเดียว
  //   engine จะถอยไปใช้รายการอุปกรณ์เดิมในสูตรทั้งชุด (กันราคาตก) — ตัวเลขเงินถูกแล้ว
  //   แต่ "หน้าเทียบ" ต้องโชว์รายการที่รุ่นนี้ใช้จริง (= รายการจากใบตัด) ไม่งั้นขึ้น
  //   "มีแต่ใบตัด" ทั้งแผงทั้งที่ของตรงกันเป๊ะ (เจ้าของเจอ 21 ส.ค.69 — ไม่ตรงสักรุ่น)
  //   → ฝั่งคิดราคาใช้ hwl เป็นตัวตั้ง แล้วดึงราคาที่ engine คิดได้จริงมาแปะ
  const engHw = (calc.lines ?? []).filter((l: any) => l.cat === "hardware" || l.cat === "consum");
  const engBySku = new Map<string, any>();
  for (const l of engHw) if (l.sku) engBySku.set(String(l.sku).toUpperCase(), l);
  const calcHw = hwl?.length
    ? hwl.map((h) => {
      const eng = engBySku.get(String(h.sku || "").toUpperCase());
      const unitPrice = Number(eng?.unitPrice) || 0;
      return { sku: h.sku, name: h.name, qty: h.qty, unit: h.unit, unitPrice, amount: r2(unitPrice * h.qty) };
    })
    : engHw;
  const bySku = new Map<string, HwRow>();
  for (const l of calcHw) {
    const sku = String(l.sku || "");
    const key = sku || `ไม่มีรหัส:${l.name}`;
    const e = bySku.get(key) ?? {
      sku, name: l.name, calcQty: 0, calcPrice: l.unitPrice, calcAmount: 0, calcUnit: l.unit || "",
      orderOnly: !!(l as { orderOnly?: boolean }).orderOnly,
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
  const hardware: HwRow[] = [...bySku.values()].map((e) => ({ ...e, status: statusOf(e.calcQty, e.cutQty, !!e.sku, e.orderOnly) }));

  // ── ③ เรตอลู ฿/กก. ที่ใช้จริง ────────────────────────────────────────
  const brand = prod.brand || "SMS";
  const rate = Number(PB.ALU?.[brand]) || 0;
  const base = Number(PB.ALU_BASE?.[brand]) || rate || 1;

  const order = { "มีแต่ใบตัด": 0, "จำนวนต่าง": 1, "มีแต่คิดราคา": 2, "ไม่มีรหัส": 3, "ไม่สต็อก สั่งใหม่": 4, "ตรง": 5 } as const;
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
