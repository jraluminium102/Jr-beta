/**
 * alu-from-cutlist — "เส้นอลู/กล่อง" ในคิดราคา 4.0 ดึงรายการมาจาก "ใบตัด" ตัวเดียวกัน
 * ─────────────────────────────────────────────────────────────────────────────
 * ตัวเดียวกับ hardware-from-cutlist แต่เป็นฝั่งอลู
 *
 * ทำไม (เจ้าของสั่ง 27 ส.ค.69 "ทำหลังคาหลายด้านให้ครบ"):
 *   หลังคาหลายด้าน = หลังคาที่หักมุมรอบบ้าน ได้ถึง 6 ด้าน · จันทันตรงรอยต่อใช้ร่วมกัน 2 ด้าน
 *   และร่นสั้นลงตามมุมที่หัก (ตะเข้) → คิดแยกทีละด้านแล้วบวกกัน "ไม่ตรงของจริง"
 *
 *   ของเดิมในเว็บ (ปุ่ม "หลังคาหลายช่วง (ขยัก)") คิดแต่ละช่วงเป็นหลังคาเดี่ยวเต็มใบแล้วบวกกัน
 *   เทียบกับใบตัดจริงที่ 4 ด้าน (400×150 · 300×100 · 350×200 · 200×150):
 *     กล่อง 4"x4"    ใบตัด 14 ชิ้น → คิดแยกช่วง  0 ชิ้น  (ขอบ/ตะเข้ หายทั้งหมด)
 *     กล่อง 1.6"x4"  ใบตัด 41 ชิ้น → คิดแยกช่วง 60 ชิ้น  (เกิน)
 *     กล่อง 1"x1.5"  ใบตัด 82 ชิ้น → คิดแยกช่วง 146 ชิ้น (เกิน)
 *
 *   แทนที่จะลอกเรขาคณิตตะเข้ (mhPos/mhAD/mhAE ~150 บรรทัด) มาเขียนใหม่เป็นสูตรในคิดราคา
 *   ให้คิดราคา "เรียกเอนจินใบตัดตัวจริง" แล้วแปลงแถวเป็นบรรทัดอลู → ตรงกันโดยโครงสร้าง
 *   แก้สูตรตัดที่เดียว คิดราคาเด้งตาม ไม่มีทางหลุดกัน
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computeCutList, type CutInput } from "../cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../cutlist/products.ts";

/** รุ่นที่ "เส้นอลู" คิดจากใบตัดแล้ว — เปิดทีละรุ่น */
export const ALU_FROM_CUTLIST: Record<string, string> = {
  roof_multi: "awning_multi",
  glasshouse: "glasshouse",
  glasshouse_multi: "glasshouse_multi",
  gable_multi: "gable_multi",
};

/**
 * รหัสกล่องในใบตัด → คีย์ราคากล่องในสโตร์ (PB.BOXPRICE) + ราคาสำรองต่อเส้น
 * ราคาสำรอง = ราคาที่สูตรคิดราคาเดิมใช้อยู่ (ใช้ต่อเมื่อสโตร์ยังไม่ตั้งราคากล่องนั้น ห้ามหล่นเป็น 0)
 */
export const BOX_BY_CODE: Record<string, { box: string; price: number }> = {
  'กล่อง 1"x1"': { box: "กล่อง|1X1", price: 310 },
  'กล่อง 1"x1.5"': { box: "กล่อง|1X1.5", price: 393 },
  'กล่อง 1"x1.6"': { box: "กล่อง|1X1.6", price: 485 },
  'กล่อง 1"x3"': { box: "กล่อง|1X3", price: 761 },
  'กล่อง 1"x4"': { box: "กล่อง|1X4", price: 905 },
  'กล่อง 1.6"x1.6"': { box: "กล่อง|1.6X1.6", price: 770 },
  'กล่อง 1.6"x3"': { box: "กล่อง|1.6X3", price: 950 },
  'กล่อง 1.6"x4"': { box: "กล่อง|1.6X4", price: 1220 },
  'กล่อง 2"x4"': { box: "กล่อง|2X4", price: 1540 },
  'กล่อง 4"x4"': { box: "กล่อง|4X4", price: 2208 },
  // ฉาก/แซด = อลูมิเนียม ไม่ใช่เหล็ก (เจ้าของท้วง 27 ส.ค.69) — สโตร์มี "ฉาก 6 หุน-<สี>" แล้ว
  //   ⚠ "แซด 4"" ยังไม่มีในสโตร์ → ใช้ราคาสำรองในสูตรไปก่อน (ห้ามหล่นเป็น 0)
  'ฉาก 6 หุน': { box: "ฉาก|6หุน", price: 140 },
  'แซด 4"': { box: "ตัวZ|4", price: 140 },
};

export type AluLine = {
  box?: string; code: string; name: string;
  price: number; kg: number;
  seg: number;    // ยาวต่อชิ้น (เมตร) — engine คิดเส้นจากตรงนี้
  count: number;  // จำนวนชิ้น
};

export type CalcAluInput = {
  prodId: string;
  cutInput: Record<string, unknown>;   // ช่องกรอกฝั่งใบตัด (ด้าน/รอยต่อ/ชนิดแผ่น ฯลฯ)
};

/**
 * บรรทัดอลูของรุ่นนี้ = แถวใบตัดที่มีรหัสกล่อง ยุบตามรหัส+ความยาว
 * คืน null = รุ่นยังไม่เปิด / ไม่มีสูตรตัด → ผู้เรียกใช้ prod.alu เดิม
 *
 * ⚠ ยุบตาม "รหัส+ความยาว" ไม่ใช่ตามชื่อ — จันทันหลายด้านออกมาเป็นคนละแถวแต่ยาวเท่ากันได้
 *   ถ้าไม่ยุบจะได้บรรทัดละชิ้นเป็นร้อยบรรทัดในใบเสนอ
 */
/**
 * ชื่อแถวใบตัด → ชื่อบรรทัดคิดราคา: ตัดเลขด้าน/เลขตำแหน่งออก (ยุบข้ามด้านแล้ว เลขด้านทำให้เข้าใจผิด)
 * ⚠ ตัดเฉพาะ "ด้าน" ที่ตามด้วยตัวเลข ไม่งั้นกินคำว่า "รวมทุกด้าน" ไปด้วย
 */
const cleanRowName = (n: string) =>
  n.replace(/\s*#\d+/g, "").replace(/\s*ด้าน\s*\d+/g, "").replace(/\s{2,}/g, " ").replace(/\s+\)/g, ")").trim();

/** ต่อท้าย "(ทุกด้าน)" — เว้นแถวที่ใบตัดเขียนว่ารวมทุกด้านมาอยู่แล้ว (เพลทเหล็ก) */
const allSides = (n: string) => (/ทุกด้าน/.test(n) ? n : `${n} (ทุกด้าน)`);
/** รุ่นด้านเดียว (กลาสเฮ้าส์เพิงตรง) ไม่ต้องต่อท้าย "(ทุกด้าน)" — มีด้านเดียวอยู่แล้ว อ่านแล้วงง */
const SINGLE_SIDE = new Set(["glasshouse"]);

export function cutAluLines(inp: CalcAluInput): AluLine[] | null {
  const specId = ALU_FROM_CUTLIST[inp.prodId];
  if (!specId) return null;
  const spec = CUT_SPEC_BY_ID[specId];
  if (!spec) return null;

  let rows;
  try {
    rows = computeCutList(spec, { ...spec.defaults, ...inp.cutInput } as CutInput, 1).rows;
  } catch {
    return null;
  }

  const agg = new Map<string, AluLine>();
  for (const r of rows) {
    const code = String(r.code ?? "");
    if (!code || code === "-" || !(r.qty > 0) || !(r.len > 0)) continue;
    const b = BOX_BY_CODE[code];
    const key = `${code}|${r.len}`;
    const hit = agg.get(key);
    if (hit) { hit.count += r.qty; continue; }
    agg.set(key, {
      box: b?.box, code,
      // ชื่อไม่เอาเลขด้าน/เลขตำแหน่ง (จันทัน ด้าน 1 #3) — ยุบข้ามด้านแล้ว เลขด้านทำให้เข้าใจผิด
      name: `${cleanRowName(String(r.name))} (ยาว ${r.len} ซม.)`,
      price: b?.price ?? 0, kg: 0,
      seg: r.len / 100, count: r.qty,
    });
  }
  const out = [...agg.values()];
  return out.length ? out : null;
}

/** ราคาสำรองต่อหน่วย ของแถวใบตัดที่ "ไม่มีรหัสสโตร์" (เหล็ก/ราง) — ตรงกับสูตรหลังคาเดี่ยวที่ใช้อยู่ */
const NO_CODE_PRICE: { match: RegExp; price: number; unit: string }[] = [
  { match: /^ฉาก 6 หุน/, price: 140, unit: "เส้น" },
  { match: /^แซด 4/, price: 140, unit: "เส้น" },
  { match: /^กล่องเหล็ก/, price: 110, unit: "เส้น" },
  { match: /^เพลทเหล็ก/, price: 15, unit: "แผ่น" },
  // รางน้ำอลู 2,273/เส้น ตามชีตถอดทุน v9 — เดิมใส่ 393 = ราคากล่อง 1×1½ ที่อยู่บรรทัดข้าง ๆ (คนละของ)
  { match: /^(รางน้ำอลู|ราง\/เชิงชาย)/, price: 2273, unit: "เส้น" },
  // กลาสเฮ้าส์เพิงตรง — ไฟล์ตัดเขียน "ราง (เท่ากว้าง) · ขอบต่ำ" ไม่ระบุวัสดุ
  //   = รางน้ำที่ขอบต่ำ ใช้ราคาเดียวกับรางน้ำอลูของหลังคา (2,273/เส้น ชีตถอดทุน v9)
  { match: /^ราง \(เท่ากว้าง\)/, price: 2273, unit: "เส้น" },
];

/**
 * ราคาต่อ "แถวใบตัดที่ไม่มีรหัสสโตร์" ของรุ่นที่ไม่ใช่หลังคา — คีย์ = ชื่อแถวในใบตัด
 * ⚠ แถวพวกนี้เป็นของจริงที่ต้องจ่ายเงิน ถ้าไม่ประกาศไว้ = หายไปจากทุนเงียบ ๆ
 *   (เจอตอนผูกบานเลื่อนรางบน 27 ส.ค.69: ราง/เสารับ/ชนกลาง/ฉาก รวม ~10,365 บาท เกือบหลุด)
 *   ราคายกมาจากสูตรเดิมของรุ่นนั้นตรง ๆ — จำนวนเปลี่ยนไปใช้ของใบตัดแทน
 */
const UNCODED_BY_PROD: Record<string, { match: RegExp; name: string; price: number; unit: string; stockLen?: number }[]> = {
  topslide: [
    { match: /^รางบน Hafele/, name: "รางบน Hafele", price: 2010, unit: "เส้น" },
    { match: /^เสารับบาน/, name: 'เสารับบาน (กล่อง 1"x4")', price: 905, unit: "เส้น" },
    { match: /^ชนกลางรับบาน/, name: "ชนกลางรับบาน", price: 300, unit: "เส้น" },
    { match: /^ฉาก 4/, name: 'ฉาก 4" ปิดราง', price: 280, unit: "เส้น" },
  ],
};

/**
 * แถวใบตัดที่ไม่มีรหัสสโตร์ → บรรทัดสิ้นเปลือง (นับเป็น "เส้น" จากความยาวจริง ตัดจากเส้น 6 ม.)
 * คืน null = รุ่นนี้ไม่ได้ประกาศราคาไว้ → ผู้เรียกต้องไม่ตัด prod.consum ทิ้ง
 */
export function cutUncodedLines(inp: CalcAluInput): ConsumLine[] | null {
  const map = UNCODED_BY_PROD[inp.prodId];
  const specId = ALU_FROM_CUTLIST[inp.prodId];
  const spec = specId ? CUT_SPEC_BY_ID[specId] : null;
  if (!map || !spec) return null;
  let rows;
  try {
    rows = computeCutList(spec, { ...spec.defaults, ...inp.cutInput } as CutInput, 1).rows;
  } catch { return null; }

  // รวมความยาวต่อชนิดก่อน แล้วค่อยหารเส้น (เศษเส้นเอาไปตัดท่อนอื่นชนิดเดียวกันต่อได้)
  const len = new Map<number, number>();
  for (const r of rows) {
    const code = String(r.code ?? "");
    if (code && code !== "-") continue;
    if (!(r.qty > 0) || !(r.len > 0)) continue;
    const i = map.findIndex((m) => m.match.test(String(r.name)));
    if (i < 0) continue;
    len.set(i, (len.get(i) ?? 0) + r.len * r.qty);
  }
  const out: ConsumLine[] = [];
  for (const [i, total] of len) {
    const m = map[i];
    const bars = Math.ceil(total / (m.stockLen ?? 600) - 1e-9);
    if (bars > 0) out.push({ name: m.name, price: m.price, unit: m.unit, count: bars });
  }
  return out.length ? out : null;
}

/** วัสดุมุงคิดราคา (18 ชนิด) → ชนิดแผ่นใบตัด (6 ชนิด) — กติกาเดียวกับ from-recipe ห้ามแยกกัน */
export function sheetOfMaterial(mat: string): string {
  const m = String(mat ?? "ไวนิล");
  if (m.startsWith("เมทัล")) return "เมทัลชีท";
  if (m === "ชินโคร์ Sup") return "ชินโคร์ Sup";
  if (m.startsWith("ชินโคร์")) return "ชินโคร์ HC";
  if (m === "ไวนิล" || m === "ดีไลท์" || m === "โพลีตัน") return m;
  return "ไวนิล";   // กระจก/อื่นๆ ยังไม่มีชนิดแผ่นในใบตัด → ไวนิล (ช่างปรับเอง)
}

/** ความยาวแผ่นมุงที่ขายเป็นแผ่น (ไวนิล/ดีไลท์) — ซม. · ใช้หารว่า 1 แผ่นตัดได้กี่แถบ */
const SHEET_LEN_CM = 700;

/** กว้างใช้งานต่อแผ่น (ซม.) ตามตาราง MH_SHEET ของไฟล์หลายด้าน — ⚠ ไวนิล 25 · ไม่ใช่ตาราง ROOF_SHEET */
const MH_W: Record<string, number> = {
  "ไวนิล": 25, "ดีไลท์": 100, "เมทัลชีท": 34, "โพลีตัน": 122, "ชินโคร์ HC": 138, "ชินโคร์ Sup": 138,
};

export type ConsumLine = { name: string; price: number; ref?: string; unit: string; count: number };

/**
 * บรรทัด "แผ่นมุง + เหล็ก + ราง" จากแถวใบตัดที่ไม่มีรหัสสโตร์
 * แผ่นมุงคิดตามหน่วยที่ราคาตั้งไว้ (แผ่น / เมตร / ตร.ม.) — ใบตัดบอกจำนวนแผ่น + ยาวต่อแผ่น
 */
export function cutRoofConsumLines(
  inp: CalcAluInput & { material: string; rm: Record<string, { p: number; u: string }>; planArea?: number },
): ConsumLine[] | null {
  const specId = ALU_FROM_CUTLIST[inp.prodId];
  const spec = specId ? CUT_SPEC_BY_ID[specId] : null;
  if (!spec) return null;
  let rows;
  try {
    rows = computeCutList(spec, { ...spec.defaults, ...inp.cutInput } as CutInput, 1).rows;
  } catch { return null; }

  const sheetKey = sheetOfMaterial(inp.material);
  const sheetW = MH_W[sheetKey] ?? 25;
  // วัสดุที่ใบตัดไม่มีชนิดแผ่นให้ (กระจก) → sheetOfMaterial ตกไปเป็นไวนิล ทั้งที่ไม่ใช่ไวนิลจริง
  const noSheetType = sheetKey !== inp.material;
  const planArea = Number(inp.planArea) || 0;
  const sideTag = SINGLE_SIDE.has(inp.prodId) ? (n: string) => n : allSides;
  let flatAreaDone = false;   // กระจกคิดพื้นที่รวมครั้งเดียว ไม่ใช่ต่อด้าน
  const out: ConsumLine[] = [];
  const bump = (name: string, price: number, ref: string | undefined, unit: string, count: number) => {
    if (!(count > 0)) return;
    const hit = out.find((x) => x.name === name);
    if (hit) hit.count = Math.round((hit.count + count) * 100) / 100;
    else out.push({ name, price, ref, unit, count: Math.round(count * 100) / 100 });
  };

  for (const r of rows) {
    const code = String(r.code ?? "");
    if (code && code !== "-") continue;
    // ⚠ กันความยาว/จำนวนติดลบ — รอยต่อ "เว้า" หักยื่นของด้านข้างเคียง ถ้ายื่นนั้นยาวกว่ากว้างด้านนี้
    //   ใบตัดจะได้ J ติดลบ (เอนจินใบตัดมีตัวกันอยู่แล้ว แต่ฝั่งคิดราคาไม่มี → ทุนติดลบเงียบ ๆ)
    //   เพลทเหล็กเป็นข้อยกเว้น: ใบตัดให้ len = 0 เพราะนับเป็นแผ่น ไม่มีความยาว
    if (!(r.qty > 0)) continue;
    if (r.len < 0) continue;
    const nm = String(r.name);

    if (/^แผ่นหลังคา/.test(nm)) {
      const price = inp.rm[inp.material];
      if (!price) continue;
      // ⚠ วัสดุที่ใบตัด "ไม่มีชนิดแผ่น" (กระจก) จะตกไปใช้เรขาคณิตของไวนิล (แผ่นกว้าง 25 ซม.)
      //   ถ้าเอาจำนวนแผ่นนั้นมาคูณกลับเป็น ตร.ม. จะเกินจริง 37-96% → กระจกคิดจากพื้นที่หลังคาตรง ๆ
      //   (หลังคาทรงเดี่ยวก็คิดแบบนี้: rm('กระจก 4+4', …, "material==='กระจก 4+4'?area:0"))
      if (noSheetType && price.u === "ตร.ม.") {
        // ใบตัดออกแถว "แผ่นหลังคา" ด้านละแถว → ต้องลงบรรทัดเดียว ไม่ใช่บวกพื้นที่รวมซ้ำทุกด้าน
        if (planArea > 0 && !flatAreaDone) {
          flatAreaDone = true;
          bump(sideTag(`แผ่น${inp.material}`), price.p, `ROOFMAT.${inp.material}`, price.u, planArea);
        }
        continue;
      }
      // ⚠ ไวนิลขายเป็นแผ่นยาว 7 ม. เอามาตัดแบ่งเอง (เจ้าของยืนยัน 27 ส.ค.69)
      //   ใบตัดนับเป็น "แถบ" (ยาวเท่าจันทัน) → ต้องหารว่า 1 แผ่นตัดได้กี่แถบ ก่อนคิดเงิน
      //   คิดแยกต่อด้าน เหมือนที่ชีตถอดทุนคิดแยกต่อช่วง (แถบยาวไม่เท่ากันข้ามด้าน เอามารวมแผ่นเดียวไม่ได้)
      const n = price.u === "แผ่น" ? Math.ceil(r.qty / Math.max(1, Math.trunc(SHEET_LEN_CM / r.len)))
        : price.u === "ม." ? (r.qty * r.len) / 100
        : (r.qty * (sheetW / 100) * (r.len / 100));
      bump(sideTag(`แผ่น${inp.material === "ไวนิล" ? "ไวนิล" : inp.material}`), price.p, `ROOFMAT.${inp.material}`, price.u, n);
      // ฝาครอบไวนิล เดินคู่แผ่นไวนิลเสมอ (เหมือนหลังคาเดี่ยว)
      if (inp.material === "ไวนิล" && inp.rm["ฝาครอบไวนิล"]) {
        bump(sideTag("ฝาครอบไวนิล"), inp.rm["ฝาครอบไวนิล"].p, "ROOFMAT.ฝาครอบไวนิล", inp.rm["ฝาครอบไวนิล"].u, r.qty);   // เดินคู่แผ่นไวนิลเสมอ
      }
      continue;
    }
    if (/^ฝาครอบ/.test(nm)) continue;   // คิดคู่แผ่นไปแล้วด้านบน ไม่นับซ้ำ

    const hit = NO_CODE_PRICE.find((x) => x.match.test(nm));
    if (hit) bump(sideTag(cleanRowName(nm)), hit.price, undefined, hit.unit, r.qty);
  }
  return out.length ? out : null;
}

/** พื้นที่หลังคารวมทุกด้าน (ตร.ม.) — ใช้คิดค่าแรง/ราคาต่อ ตร.ม. แทน กว้าง×สูง */
export function multiRoofArea(prodId: string, cutInput: Record<string, unknown>): number {
  const n = (k: string) => Number(cutInput[k]) || 0;
  // กลาสเฮ้าส์เพิงตรง = ด้านเดียว ไม่มี side1..6 → พื้นที่ผัง = กว้าง × ยาวทิศลาด
  //   ถ้าไม่ดักไว้จะได้ 0 แล้วค่าแรงหายทั้งก้อน (ค่าแรงหลังคาคิดต่อ ตร.ม.)
  if (prodId === "glasshouse") return Math.round((n("W") / 100) * (n("D") / 100) * 100) / 100;
  let a = 0;
  for (let i = 1; i <= 6; i++) {
    if (prodId === "gable_multi") {
      // จั่วหลายด้าน: ด้าน i ยาว D · กว้างสแปนใช้ค่าเดียวทั้งงาน (W) · 2 สโลป
      const d = n(`side${i}D`);
      if (d > 0) a += (d / 100) * (n("W") / 100);
    } else {
      const w = n(`side${i}W`), p = n(`side${i}P`);
      if (w > 0 && p > 0) a += (w / 100) * (p / 100);
    }
  }
  return Math.round(a * 100) / 100;
}
