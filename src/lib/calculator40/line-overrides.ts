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
export function isSafeCalcExpr(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length > 300) return false;
  if (/(require|import|process|global|constructor|prototype|eval|Function|await|=>|;|`|\$\{|\[)/.test(t)) return false;
  const stripped = t
    .replace(/'[^']*'|"[^"]*"/g, "")                                   // สตริงเปรียบเทียบ เช่น form==='อิสระ'
    .replace(/\bMath\.(min|max|ceil|floor|round|abs|pow|sqrt|trunc)\b/g, "")
    .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*\b/g, "")   // ชื่อตัวแปร/ฟิลด์
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
function applyFieldOverrides(item: LineItem, ov: LineOverride): LineItem {
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
    if (ov.set_qty != null && ov.set_qty !== "" && "count" in next && isSafeCalcExpr(ov.set_qty)) {
      next.count = ov.set_qty;
    }
  }
  return next;
}

// เลือก array ที่จะ "เพิ่มบรรทัดใหม่" ให้ (is_added) — เดารูปแบบจาก match_key/set_sku
//   รหัสหน้าตาเหมือนเส้นอลู (B####/F####) → ไปกลุ่มเส้นอลู (alu ฝั่งคิดราคา / profiles ฝั่งใบตัด)
//   นอกนั้นถือเป็นอุปกรณ์/วัสดุสิ้นเปลือง (hardware/consum ฝั่งคิดราคา / hardware ฝั่งใบตัด)
// ครอบคลุมรูปแบบรหัสเส้นที่ใช้จริงในสูตร: B####/F#### (+ต่อท้ายตัวอักษรได้) · E-## · WM-K##
const ALU_CODE_RE = /^(?:[FB]\d{3,5}[A-Z]?|E-?\d{1,3}|WM-K\d{1,3})$/;
function pickArrayForAdd(ov: LineOverride, arrKeys: readonly string[]): string | null {
  const key = String(ov.set_sku || ov.match_key || "").toUpperCase();
  const looksLikeAluCode = ALU_CODE_RE.test(key);
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

function buildAddedLine(ov: LineOverride, targetKey: string): LineItem {
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
    const seg = isSafeCalcExpr(ov.set_len ?? "") ? (ov.set_len || "W") : "W";
    const cnt = isSafeCalcExpr(ov.set_qty ?? "") ? (ov.set_qty || "1") : "1";
    return { name, code: ov.set_sku || "", price, kg: Number(ov.set_kg) || 0, seg, count: cnt };
  }
  return { name, sku: ov.set_sku || "", price, unit: ov.unit || "ชิ้น",
    count: isSafeCalcExpr(ov.set_qty ?? "") ? (ov.set_qty || "1") : "1" };
}

// ทับ override ทั้งหมดของ "สินค้าตัวเดียว" — คืนสำเนาใหม่เฉพาะเมื่อมีการเปลี่ยนแปลงจริง (copy-on-write)
//   ไม่มีบรรทัดไหนถูกแตะ = คืน object เดิม (reference เดิม) ไม่ clone ทิ้งเปล่า ๆ
function applyToProduct(prod: ProductLike, ovs: LineOverride[]): ProductLike {
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
      // แถวเพิ่มเอง — ไม่มีในซอร์สอยู่แล้ว ไม่ต้องหา ใส่เพิ่มท้าย array ที่เดาได้เลย
      const targetKey = pickArrayForAdd(ov, arrKeys);
      if (!targetKey) continue;   // สินค้านี้ไม่มี array ที่ scope นี้ใช้ได้เลย (ผิด scope/ผิดสินค้า) → ข้ามเงียบ ๆ
      dirtyArray(targetKey);
      (current[targetKey] as LineItem[]).push(buildAddedLine(ov, targetKey));
      continue;
    }

    // บรรทัดที่ "แก้ของเดิม" — ต้องหาให้เจอก่อนถึงจะทับได้
    let found = false;
    for (const key of arrKeys) {
      const arr = current[key] as LineItem[];
      const idx = arr.findIndex((item) => lineKeyOf(item, ov.scope) === ov.match_key);
      if (idx < 0) continue;
      found = true;
      dirtyArray(key);
      const arr2 = current[key] as LineItem[];
      if (ov.disabled) arr2.splice(idx, 1);
      else arr2[idx] = applyFieldOverrides(arr2[idx], ov);
      break;   // unique(product_id, scope, match_key) กันชนกันเองอยู่แล้ว — เจอที่เดียวพอ
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
