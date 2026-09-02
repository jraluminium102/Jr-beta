// line-overrides.ts — ชั้นทับค่าสูตร (override layer) สำหรับ "คิดราคา 4.0" / "ใบตัด" (0134)
// ─────────────────────────────────────────────────────────────────────────────
// สูตรตั้งต้นทั้งหมดอยู่ในซอร์ส (products.mjs / cutlist/products.ts) เว็บ deploy แล้วแก้ไฟล์เองไม่ได้
// ตารางนี้เก็บ "ส่วนต่าง" ที่ผู้ใช้แก้ผ่านหน้าเว็บ แล้วไฟล์นี้ทำหน้าที่ประกบส่วนต่างนั้นเข้ากับซอร์สตอนรัน
//
//   ซอร์ส (สูตรตั้งต้น) + calc_line_overrides (DB) = สูตรที่ใช้จริง
//
// ⚠ ไฟล์นี้ต้องเป็น "pure function" ล้วน — ห้ามแตะ DB/network ในนี้ (ให้ API route ดึงแถวมาป้อนเข้าแทน)
//   เทสได้ทันทีโดยไม่ต้องต่อ Supabase — ดู scripts/verify-line-overrides.mjs
//
// วิธีต่อเข้าโค้ดเดิม (งานของอีกคน — ห้ามแก้หน้า UI ในรอบนี้):
//   เดิม   : import { PRODUCTS } from "@/lib/calculator40/products.mjs"; ... PRODUCTS[prodId]
//   ใหม่   : const effProducts = applyLineOverrides(PRODUCTS, overrides.filter(o => o.scope === "calc"));
//            ... effProducts[prodId]   (แทนที่ PRODUCTS ตรง ๆ ทุกจุดที่ใช้)
//   ฝั่งใบตัด: เหมือนกันแต่สลับเป็น CUT_SPEC_BY_ID จาก "../cutlist/products.ts" + scope === "cut"
//
//   ⚠ ห้ามส่ง effProducts/effCutSpecs ข้าม RSC boundary (server → client component prop) —
//     ฝั่งใบตัดมีฟังก์ชันจริงอยู่ในบรรทัด (CutSpec.profiles[].len/qty) ส่งข้าม prop จะพัง (ไม่ serializable)
//     ต้องเรียก applyLineOverrides ที่ "ฝั่งเดียวกับที่ใช้ PRODUCTS อยู่แล้ว" (ตอนนี้คือฝั่ง client component)

export type LineOverrideScope = "calc" | "cut";

export type LineOverride = {
  product_id: string;
  scope: LineOverrideScope;
  match_key: string;
  /** ชื่อบรรทัด — ใช้คู่กับ match_key เพราะรหัสเดียวถูกใช้หลายบรรทัดในรุ่นเดียวกันได้ (0135) */
  match_name?: string | null;
  /** น้ำหนัก กก./เส้น (บรรทัดอลูที่เพิ่มเอง) — ไม่ใส่ = ค่าอบสีคิดขาด (0135) */
  set_kg?: number | null;
  set_sku?: string | null;
  set_qty?: string | null;
  set_len?: string | null;
  set_price?: number | null;
  is_added?: boolean;
  item_name?: string | null;
  unit?: string | null;
  disabled?: boolean;
  note?: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type LineItem = Record<string, any>;
type ProductLike = Record<string, any>;
type ProductsDict = Record<string, ProductLike>;

// ชื่อ array ของ "บรรทัดวัสดุ" ต่อ scope — ตรงกับโครงจริงใน products.mjs (alu/hardware/consum)
// และ cutlist/products.ts (profiles/hardware) เท่านั้น — กัน override หลุดไปแก้ array อื่นที่ไม่เกี่ยว
//   (เช่น addons/opts ที่ไม่ใช่ "รายการวัสดุ")
const ARRAY_KEYS_BY_SCOPE: Record<LineOverrideScope, readonly string[]> = {
  calc: ["alu", "hardware", "consum"],
  cut: ["profiles", "hardware"],
};

/**
 * คีย์ของบรรทัด — รหัสก่อน ไม่มีรหัสใช้ 'name:<ชื่อ>'
 * รองรับทั้งบรรทัดฝั่งคิดราคา (code/sku เป็น string หรือ expression string) และฝั่งใบตัด
 * (code/sku อาจเป็นฟังก์ชัน (o) => string — กรณีนั้นไม่รู้ค่าจริงล่วงหน้า จึงตกไปใช้ชื่อแทน)
 */
/** ชื่อบรรทัดแบบข้อความ — ใบตัดบางบรรทัดชื่อเป็นฟังก์ชัน (o)=>string จึงต้องกันไว้ */
export function lineNameOf(item: LineItem): string {
  return typeof item?.name === "string" ? item.name.trim() : "";
}

export function lineKeyOf(item: LineItem, _scope: LineOverrideScope): string {
  const code = typeof item?.code === "string" ? item.code.trim() : "";
  if (code && code !== "-") return code;
  const sku = typeof item?.sku === "string" ? item.sku.trim() : "";
  if (sku) return sku;
  return `name:${String(item?.name ?? "").trim()}`;
}

// คอมไพล์ข้อความสูตร → ฟังก์ชัน (o) => number สำหรับฝั่งใบตัด (cutlist engine เรียก p.len(o)/p.qty(o) ตรง ๆ
// ไม่มีการเช็ค typeof เหมือนฝั่ง code — ต้องได้ฟังก์ชันเสมอ ห้ามปล่อยเป็น string เฉย ๆ)
// ⚠ ต้อง try/catch ทั้งตอนคอมไพล์ (syntax ผิด) และตอนรัน (ตัวแปรไม่มีจริง) — สูตรพังต้องไม่ทำทั้งระบบล่ม (คืนค่า fallback แทน)
/**
 * สูตรที่กรอกจากหน้าเว็บ "ปลอดภัยพอจะรันไหม"
 *
 * ⚠ ทำไมต้องมี: สูตรนี้มาจากฐานข้อมูล (คนกรอกผ่านหน้าเว็บ) แล้วถูกรันด้วย new Function ฝั่ง "เซิร์ฟเวอร์"
 *   ถ้าไม่กรอง = คนที่มีสิทธิ์แค่แก้สูตร (ACCOUNTING/PRODUCTION) รันโค้ดอะไรก็ได้บนเซิร์ฟเวอร์
 *   อ่าน env / คีย์ service role ได้ = ยกระดับสิทธิ์เกินบทบาทตัวเอง
 *   → อนุญาตเฉพาะ ตัวเลข · ตัวดำเนินการคณิต · วงเล็บ · o.<ฟิลด์> · Math.<ฟังก์ชัน> เท่านั้น
 *   (ยืดหยุ่นพอสำหรับสูตรตัดจริงทุกแบบที่ใช้อยู่ แต่ไม่เปิดช่องรันโค้ดอิสระ)
 */
/**
 * สูตรฝั่ง "คิดราคา" (count/seg) — ตัวแปรเป็นชื่อเปล่า ๆ (W, H, P, form, spec…) ไม่ใช่ o.<ฟิลด์>
 *   engine.mjs เอาไปเข้า new Function เองตอนรัน (buildEvaluator) → ต้องกรองที่นี่ก่อนเสมอ
 *   อนุญาต: ตัวเลข · ตัวดำเนินการ · วงเล็บ · Math.<ฟังก์ชัน> · ชื่อตัวแปร/ฟิลด์ล้วน · สตริงในเครื่องหมายคำพูด
 */
/**
 * ชื่อที่สูตรฝั่งคิดราคาอ้างได้ — ต้องตรงกับ base ใน engine.mjs buildEvaluator() เป๊ะ
 * ⚠ ห้ามอนุญาต "ชื่ออะไรก็ได้" — QA รอบ 2 พิสูจน์แล้วว่าเป็นช่องโหว่จริง:
 *   new Function ที่ไม่รู้จักชื่อจะตกไปหา global เอง → เรียก RegExp/String/Buffer/Array ได้หมด
 *   ยิง regex ระเบิด (catastrophic backtracking) ผ่าน RegExp(String.fromCharCode(...)) แล้ว
 *   แถวถูกบันทึกลง DB ก่อนคำนวณ → ทุกคนที่เปิดหน้าคิดราคารุ่นนั้นค้างถาวร ต้องเข้า SQL ลบเอง
 */
const CALC_VARS = new Set([
  "W", "H", "P", "form", "area", "color", "material", "ROW", "spec", "mult", "GMM", "CKEY", "TBL",
  "Math", "true", "false", "null", "undefined",
]);
const MATH_FNS = new Set(["min", "max", "ceil", "floor", "round", "abs", "pow", "sqrt", "trunc"]);

export function isSafeCalcExpr(text: string, extraVars?: readonly string[]): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length > 300) return false;
  if (/(=>|;|`|\$\{|\[|\\u|\\x)/.test(t)) return false;
  const allowed = new Set(CALC_VARS);
  for (const v of extraVars ?? []) if (v) allowed.add(v);   // ตัวแปรของรุ่นนั้น (prod.vars)
  // ตัดสตริงเปรียบเทียบ + เลขยกกำลัง (1e-9 มีในสูตรจริงหลายที่) ออกก่อน ไม่งั้น 'e' ถูกอ่านเป็นชื่อ
  const noStr = t
    .replace(/'[^']*'|"[^"]*"/g, "'ส'")
    .replace(/\b\d+(?:\.\d+)?[eE][+-]?\d+\b/g, "0");
  // ① ไล่ทุก "ชื่อ" ที่ปรากฏ — ต้องอยู่ในรายชื่อที่ประกาศจริงเท่านั้น (allowlist ไม่ใช่ blacklist)
  //    รองรับโซ่ยาว (spec.gaterail.indexOf) — ตัวแรกต้องเป็นชื่อที่อนุญาต ตัวถัด ๆ เป็นฟิลด์/เมธอดอ่านค่า
  for (const m of noStr.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)((?:\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*)/g)) {
    const root = m[1];
    const props = (m[2] || "").split(".").map((x) => x.trim()).filter(Boolean);
    if (!allowed.has(root)) return false;
    if (root === "Math" && (props.length !== 1 || !MATH_FNS.has(props[0]))) return false;
    for (const pr of props) {
      // ฟิลด์/เมธอดอ่านค่าที่ปลอดภัยเท่านั้น — ห้ามแตะ prototype chain (ทางเข้า RCE คลาสสิก)
      if (/^(constructor|prototype|__proto__|__defineGetter__|__lookupGetter__|call|apply|bind|valueOf)$/.test(pr)) return false;
    }
  }
  // ② เหลือแต่ตัวเลข/ตัวดำเนินการ/วงเล็บ หลังตัดชื่อ+สตริงออก
  const stripped = noStr
    .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*(\s*\.\s*[A-Za-z_$][A-Za-z0-9_$]*)*/g, "")
    .replace(/'ส'/g, "")
    .replace(/[0-9.\s+\-*/%()?:<>=!&|,]/g, "");
  return stripped === "";
}

export function isSafeExpr(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length > 300) return false;
  // ตัดคำอันตรายที่รู้จักออกก่อน (กันเลี่ยงด้วยการต่อสตริง)
  if (/(require|import|process|global|constructor|prototype|eval|Function|await|=>|;|`|\$\{)/.test(t)) return false;
  // เหลือเฉพาะ token ที่อนุญาต
  const stripped = t
    .replace(/\bMath\.(min|max|ceil|floor|round|abs|pow|sqrt|trunc)\b/g, "")
    .replace(/\bo\.[A-Za-z_][A-Za-z0-9_]*/g, "")
    .replace(/[0-9.\s+\-*/%()?:<>=!&|,]/g, "");
  return stripped === "";
}

function compileCutExpr(text: string, fallback: (o: any) => number): (o: any) => number {
  if (!isSafeExpr(text)) return fallback;   // สูตรไม่ผ่านด่านความปลอดภัย → ใช้สูตรเดิม
  let fn: (o: any) => any;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function("o", '"use strict"; return (' + text + ")") as (o: any) => any;
  } catch {
    return fallback;   // parse ไม่ผ่าน (syntax ผิด) → ใช้สูตรเดิม ปลอดภัยสุด
  }
  return (o: any) => {
    try {
      const v = fn(o);
      // ⚠ ได้ค่าไม่ใช่ตัวเลข → ถอยไปใช้ "สูตรเดิม" ไม่ใช่ 0
      //   คืน 0 = ความยาวตัดกลายเป็นศูนย์เงียบ ๆ ใบตัดผิดโดยไม่มีใครรู้ (อันตรายกว่าสูตรเดิมที่ยังถูก)
      return typeof v === "number" && Number.isFinite(v) ? v : fallback(o);
    } catch {
      return fallback(o);   // รันแล้วพัง → กลับไปใช้สูตรเดิม ไม่ทำใบตัดเพี้ยน
    }
  };
}

// ทับฟิลด์ในบรรทัดเดียว (คืนสำเนาใหม่ ไม่แตะของเดิม)
function applyFieldOverrides(item: LineItem, ov: LineOverride, prodVars?: readonly string[]): LineItem {
  const next: LineItem = { ...item };
  if (ov.set_sku != null && ov.set_sku !== "") {
    if ("code" in next) next.code = ov.set_sku;
    else if ("sku" in next) next.sku = ov.set_sku;
  }
  if (ov.set_price != null && "price" in next) next.price = ov.set_price;
  if (ov.scope === "cut") {
    // ฝั่งใบตัด: len/qty เป็นฟังก์ชันเสมอในซอร์ส (ดู cutlist/engine.ts) — ต้องคอมไพล์ข้อความเป็นฟังก์ชันจริง
    if (ov.set_len != null && ov.set_len !== "" && "len" in next) {
      next.len = compileCutExpr(ov.set_len, typeof item.len === "function" ? item.len : () => 0);
    }
    if (ov.set_qty != null && ov.set_qty !== "" && "qty" in next) {
      next.qty = compileCutExpr(ov.set_qty, typeof item.qty === "function" ? item.qty : () => 0);
    }
  } else {
    // ฝั่งคิดราคา: count เป็น "ข้อความสูตร" ที่ engine.mjs คอมไพล์เองตอนรัน (buildEvaluator)
    // 🔴 ต้องกรองด้วย isSafeCalcExpr ก่อนเสมอ — QA เจอช่องโหว่จริง 1 ก.ย.69:
    //   เดิมทับเป็น string ดิบ ๆ แล้ว engine.mjs เอาไปเข้า new Function ต่อโดยไม่กรอง
    //   = คนที่มีสิทธิ์แค่แก้สูตร (SALES/PRODUCTION/ACCOUNTING) รันโค้ดอะไรก็ได้บนเซิร์ฟเวอร์
    //   พิสูจน์แล้วว่าดึง process.version ออกมาได้ → process.env / service-role key ก็ได้เหมือนกัน
    //   ⚠ ห้ามถอดด่านนี้ออกไม่ว่ากรณีใด
    if (ov.set_qty != null && ov.set_qty !== "" && "count" in next && isSafeCalcExpr(ov.set_qty, prodVars)) {
      next.count = ov.set_qty;
    }
  }
  return next;
}

// เลือก array ที่จะ "เพิ่มบรรทัดใหม่" ให้ (is_added) — เดารูปแบบจาก match_key/set_sku
//   รหัสหน้าตาเหมือนเส้นอลู (B####/F####) → ไปกลุ่มเส้นอลู (alu ฝั่งคิดราคา / profiles ฝั่งใบตัด)
//   นอกนั้นถือเป็นอุปกรณ์/วัสดุสิ้นเปลือง (hardware/consum ฝั่งคิดราคา / hardware ฝั่งใบตัด)
// ครอบคลุมรูปแบบรหัสเส้นที่ใช้จริงในสูตร: B####/F#### (+ต่อท้ายตัวอักษรได้) · E-## · WM-K##
/**
 * "รหัสนี้หน้าตาเหมือนเส้นอลูไหม" — ใช้เดาว่าบรรทัดที่เพิ่มเองควรลง alu/profiles หรือ hardware/consum
 *
 * ⚠ QA จับได้ 1 ก.ย.69: ชุดเดิม (F/B/E-/WM-K) พลาดรหัสอลูที่ใช้จริงถึง 36 ตัว (คิดราคา) / 24 ตัว (ใบตัด)
 *   เช่น SlimLux (OPK-A201-40 · XSW40008) · กล่อง/ฉากภาษาไทย ("กล่อง 1\"x4\"") · E-02C (มีตัวอักษรท้าย)
 *   · JR0289x ที่อยู่ในกลุ่ม alu
 *   เดาผิด = บรรทัดไปลง hardware → ข้ามการนับเส้น/น้ำหนัก/ค่าอบสีทั้งหมด = ทุนผิดเงียบ ๆ
 *
 * ทางที่ปลอดภัยกว่าเดาเอง: ให้ผู้เรียกระบุมาตรง ๆ ผ่าน unit === 'เส้น' ก็ได้
 */
//   \d{4} ท้ายสุด = รหัสเปล่า 4 หลักที่ใช้จริง (9014 คัลเทิลวอล · 7864 กรอบประตู)
const ALU_CODE_RE = /^(?:[FB]\d{3,5}[A-Z]?|E-?\d{1,3}[A-Z]?|WM-K\d{1,3}|OPK-[A-Z0-9-]+|XSW\d+|JR028\d\d|JR029\d\d|\d{4})$/;
const ALU_NAME_RE = /^(กล่อง|ฉาก|ยู\s*\d|แซด|ตัวZ)/;
function pickArrayForAdd(ov: LineOverride, arrKeys: readonly string[]): string | null {
  const key = String(ov.set_sku || ov.match_key || "").toUpperCase();
  const looksLikeAluCode =
    ALU_CODE_RE.test(key) ||
    ALU_NAME_RE.test(String(ov.set_sku || ov.match_key || "").trim()) ||
    String(ov.unit ?? "").trim() === "เส้น";   // ผู้ใช้ระบุหน่วยเป็น "เส้น" = ตั้งใจให้เป็นเส้นอลู
  if (ov.scope === "cut") {
    if (looksLikeAluCode && arrKeys.includes("profiles")) return "profiles";
    if (arrKeys.includes("hardware")) return "hardware";
    return arrKeys.includes("profiles") ? "profiles" : null;
  }
  if (looksLikeAluCode && arrKeys.includes("alu")) return "alu";
  if (arrKeys.includes("hardware")) return "hardware";
  if (arrKeys.includes("consum")) return "consum";
  return arrKeys.includes("alu") ? "alu" : null;
}

function buildAddedLine(ov: LineOverride, targetKey: string, prodVars?: readonly string[]): LineItem {
  const name = ov.item_name || ov.match_key || "รายการเพิ่มเอง";
  const price = ov.set_price ?? 0;
  if (ov.scope === "cut") {
    if (targetKey === "profiles") {
      return {
        name,
        code: ov.set_sku || "-",
        len: compileCutExpr(ov.set_len || "0", () => 0),
        qty: compileCutExpr(ov.set_qty || "1", () => 1),
      };
    }
    return { name, sku: ov.set_sku || "", qty: compileCutExpr(ov.set_qty || "1", () => 1), unit: ov.unit || "ชิ้น" };
  }
  if (targetKey === "alu") {
    // 🔴 กรองสูตรก่อนเสมอ (ช่องเดียวกับ applyFieldOverrides — QA เจอ 1 ก.ย.69)
    const seg = isSafeCalcExpr(ov.set_len ?? "", prodVars) ? (ov.set_len || "W") : "W";
    const cnt = isSafeCalcExpr(ov.set_qty ?? "", prodVars) ? (ov.set_qty || "1") : "1";
    return { name, code: ov.set_sku || "", price, kg: Number(ov.set_kg) || 0, seg, count: cnt };
  }
  return { name, sku: ov.set_sku || "", price, unit: ov.unit || "ชิ้น",
    count: isSafeCalcExpr(ov.set_qty ?? "", prodVars) ? (ov.set_qty || "1") : "1" };
}

// ทับ override ทั้งหมดของ "สินค้าตัวเดียว" — คืนสำเนาใหม่เฉพาะเมื่อมีการเปลี่ยนแปลงจริง (copy-on-write)
//   ไม่มีบรรทัดไหนถูกแตะ = คืน object เดิม (reference เดิม) ไม่ clone ทิ้งเปล่า ๆ
function applyToProduct(prod: ProductLike, ovs: LineOverride[]): ProductLike {
  // ชื่อตัวแปรของรุ่นนี้ (prod.vars) — สูตรอ้างได้เฉพาะชื่อพวกนี้ + ชื่อกลาง กัน global หลุด
  const prodVars = Object.keys((prod?.vars ?? {}) as Record<string, unknown>);
  let current = prod;
  const dirtyArrays = new Set<string>();
  const dirtyProduct = () => { if (current === prod) current = { ...prod }; };
  const dirtyArray = (key: string) => {
    dirtyProduct();
    if (!dirtyArrays.has(key)) {
      current[key] = Array.isArray(current[key]) ? [...current[key]] : [];
      dirtyArrays.add(key);
    }
  };

  for (const ov of ovs) {
    const scopeKeys = ARRAY_KEYS_BY_SCOPE[ov.scope] ?? [];
    const arrKeys = scopeKeys.filter((k) => Array.isArray(current[k]));

    if (ov.is_added) {
      // ⚠ ปิดแถวชนะการเพิ่มเสมอ (QA จับได้: is_added + disabled พร้อมกันแล้วยังเพิ่มอยู่)
      if (ov.disabled) continue;
      // ⚠ กันคิดทุนซ้ำ — ถ้ารหัส+ชื่อนี้มีอยู่ในซอร์สแล้ว ห้ามเพิ่มซ้ำ (QA จับได้ 1 ก.ย.69)
      const dupName = String(ov.item_name ?? "").trim();
      const already = arrKeys.some((k) => (current[k] as LineItem[]).some((it) =>
        lineKeyOf(it, ov.scope) === ov.match_key && (!dupName || lineNameOf(it) === dupName)));
      if (already) continue;
      // แถวเพิ่มเอง — ไม่มีในซอร์สอยู่แล้ว ไม่ต้องหา ใส่เพิ่มท้าย array ที่เดาได้เลย
      const targetKey = pickArrayForAdd(ov, arrKeys);
      if (!targetKey) continue;   // สินค้านี้ไม่มี array ที่ scope นี้ใช้ได้เลย (ผิด scope/ผิดสินค้า) → ข้ามเงียบ ๆ
      dirtyArray(targetKey);
      (current[targetKey] as LineItem[]).push(buildAddedLine(ov, targetKey, prodVars));
      continue;
    }

    // บรรทัดที่ "แก้ของเดิม" — ต้องหาให้เจอก่อนถึงจะทับได้
    let found = false;
    for (const key of arrKeys) {
      const arr = current[key] as LineItem[];
      // ⚠ ต้องเทียบ "รหัส + ชื่อ" (0135) — รหัสอย่างเดียวไม่ซ้ำจริง (F7935 ใช้ 5 บรรทัดในบานเปิด)
      //   ตรวจข้อมูลจริงแล้ว (รหัส+ชื่อ) ไม่ซ้ำเลยจาก 598 บรรทัดคิดราคา + 1,140 บรรทัดใบตัด
      //   override เก่าที่ยังไม่มี match_name → เทียบรหัสอย่างเดียวเหมือนเดิม (เข้ากันได้ย้อนหลัง)
      const wantName = String(ov.match_name ?? "").trim();
      const idx = arr.findIndex((item) =>
        lineKeyOf(item, ov.scope) === ov.match_key && (!wantName || lineNameOf(item) === wantName));
      if (idx < 0) continue;
      found = true;
      dirtyArray(key);
      const arr2 = current[key] as LineItem[];
      if (ov.disabled) arr2.splice(idx, 1);
      else arr2[idx] = applyFieldOverrides(arr2[idx], ov, prodVars);
      break;   // unique(product_id, scope, match_key, match_name) กันชนกันเองแล้ว — เจอที่เดียวพอ
    }
    // ไม่เจอบรรทัด (ซอร์สเปลี่ยนไปแล้ว/match_key พิมพ์ผิด/สูตรจำนวนพัง) → ข้ามเงียบ ๆ ไม่ throw
    void found;
  }
  return current;
}

/**
 * ประกบ override ลงชุดสูตร → คืนชุดใหม่ (ห้าม mutate ของเดิม)
 * ไม่มี override ที่เกี่ยวข้อง → คืน `products` เดิมเป๊ะ (deep-equal และ reference เดิมด้วย)
 * override ที่ product_id ไม่มีจริงในชุดสูตรนี้ → ข้ามเงียบ ๆ ไม่ throw
 */
// ── applyOverridesInPlace — mutate "singleton" ที่หลายไฟล์ import ตรง ๆ (PRODUCTS/CUT_SPEC_BY_ID) ──
// ⚠ ทำไมต้องมี: PRODUCTS/CUT_SPEC_BY_ID ถูก import แบบ module binding กระจายอยู่หลายสิบจุดทั่ว
//   Calculator40Client.tsx (2,000+ บรรทัด)/compare-cut.ts/stock-audit.ts — ไล่แก้ให้ทุกจุดถือ "effProducts"
//   แทนความเสี่ยงสูงเกินไปในรอบเดียว จึง mutate singleton ตัวเดียวกันในที่แทน
//   ตรงกับแพตเทิร์นที่มีอยู่แล้วในโปรเจกต์: applyBootstrap() (bootstrap.mjs) mutate PRODUCTS ตรง ๆ เหมือนกัน
//
// เก็บ "pristine snapshot" (shallow copy ตอนเรียกครั้งแรก ก่อนโดน mutate) ไว้เป็นฐานคำนวณเสมอ
//   ไม่งั้นเรียกซ้ำรอบสอง (override เปลี่ยน/ถูกลบ) จะคำนวณทับบนของที่ถูก mutate ไปแล้วรอบก่อน = ผิดเพี้ยนสะสม
//   shallow copy พอ (ไม่ต้อง deep clone) เพราะ applyLineOverrides ทำ copy-on-write ทีละ "รายการสินค้า" อยู่แล้ว
//   — สลับ key ในสำเนา pristine ไม่กระทบรายการสินค้าเดิมที่ key นั้นเคยชี้อยู่
const pristineCache = new WeakMap<ProductsDict, ProductsDict>();

/**
 * ชุดสูตร "ต้นฉบับ" ของ singleton ตัวนั้น (ก่อนโดน applyOverridesInPlace ทับ)
 * ⚠ ใครก็ตามที่จะคำนวณ "ทุนก่อน/หลังแก้" ต้องใช้ตัวนี้เป็นฐาน ห้ามใช้ PRODUCTS ตรง ๆ
 *   QA รอบ 2 เจอ: ถ้าผู้ใช้เปิดหน้าคิดราคา 4.0 มาก่อน PRODUCTS จะถูกทับด้วย override เดิมไปแล้ว
 *   → โมดัล "ทุนเดิม → ทุนใหม่" จะโชว์ส่วนต่างผิด (เทียบกับของที่แก้แล้ว ไม่ใช่ต้นฉบับ)
 *   ยังไม่เคยเรียก applyOverridesInPlace = ยังไม่โดนแตะ คืน target ไปตรง ๆ ได้เลย
 */
export function pristineProducts<T extends ProductsDict>(target: T): T {
  return (pristineCache.get(target) as T) ?? target;
}
export function applyOverridesInPlace(
  target: ProductsDict,
  overrides: LineOverride[] | null | undefined,
  scope: LineOverrideScope,
): void {
  if (!target) return;
  let pristine = pristineCache.get(target);
  if (!pristine) {
    pristine = { ...target };   // สำเนาตื้นครั้งแรก ก่อนโดนแตะ — ใช้เป็นฐานคำนวณตลอดไป
    pristineCache.set(target, pristine);
  }
  const eff = applyLineOverrides(pristine, overrides, scope);
  // ทับกลับเข้า target ทุก key (ของที่ไม่โดน override จะได้ค่า pristine เดิมกลับคืน — ล้าง mutation ค้างจากรอบก่อน)
  Object.assign(target, eff);
}

export function applyLineOverrides<T extends ProductsDict>(
  products: T,
  overrides: LineOverride[] | null | undefined,
  /**
   * scope ที่อนุญาตให้ทำงานกับชุดสูตรนี้ — ต้องระบุเสมอเมื่อใช้งานจริง
   * ⚠ QA จับได้ 1 ก.ย.69: เดิมพึ่ง "วินัยผู้เรียก" ให้ filter เอง แต่ฝั่ง calc กับ cut ใช้ชื่อ array
   *   'hardware' ร่วมกัน → ลืม filter เมื่อไร override ของใบตัดจะไปแก้ราคาฝั่งคิดราคาเงียบ ๆ
   *   พิสูจน์แล้วว่าเกิดขึ้นได้จริง → ย้ายการกรองมาไว้ในนี้ ผู้เรียกลืมไม่ได้อีก
   */
  onlyScope?: LineOverrideScope,
): T {
  if (!overrides || !overrides.length) return products;
  if (onlyScope) overrides = overrides.filter((o) => o?.scope === onlyScope);
  if (!overrides.length) return products;

  const byProduct = new Map<string, LineOverride[]>();
  for (const ov of overrides) {
    if (!ov || !ov.product_id || !(ov.product_id in products)) continue;   // product_id ไม่มีจริง → ข้าม
    const arr = byProduct.get(ov.product_id) ?? [];
    arr.push(ov);
    byProduct.set(ov.product_id, arr);
  }
  if (!byProduct.size) return products;

  const out: ProductsDict = { ...products };
  for (const [pid, ovs] of byProduct) out[pid] = applyToProduct(out[pid], ovs);
  return out as T;
}
