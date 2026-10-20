/**
 * ใบเบิกอลู — ของกลางที่ทั้งลิงก์ช่าง / สโตร์อลู / API ใช้ร่วมกัน
 *
 * เจ้าของเคาะ 19 ต.ค.69:
 *   · ช่างเลือกชื่อตัวเองจากรายการ (ยังไม่ทำบัญชีช่าง) — PICKER_NAMES
 *   · หมวดเลือกเส้น = ประตู/หน้าต่าง แยกแบรนด์ (Fuji / SMS / ตลาด) · กล่อง · ฉาก · อื่นๆ  **ไม่เอาหลังคา**
 *   · งานที่ไม่มีชื่อลูกค้า ต้องเลือกเหตุผล: งานซ่อม / อื่นๆ (ระบุ)
 */
import { FAMILIES, skuInFamily } from "@/lib/cutlist/family-codes";
import { isAuxAluName } from "@/lib/cutlist/codes";
import { aluBrandOfRow } from "@/lib/calculator40/alu-brand";

/** ชื่อช่างที่เบิกได้ (เจ้าของให้มา 19 ต.ค.69) — พิมพ์ชื่ออื่นเองได้ด้วย */
export const PICKER_NAMES = ["เนียน", "จอย", "แบงค์", "ต้น", "เป", "โรง3", "ชัย"];

export const PICK_REASONS: { key: "repair" | "other"; label: string }[] = [
  { key: "repair", label: "งานซ่อม" },
  { key: "other", label: "อื่นๆ (ระบุ)" },
];
export const reasonLabel = (reason: string, note?: string | null) =>
  reason === "repair" ? "งานซ่อม" : reason === "other" ? `อื่นๆ${note ? ": " + note : ""}` : "";

/**
 * หมวดในหน้าเบิก — เจ้าของเคาะ 20 ต.ค.69: "แยกหมวดบานเลื่อน บานเปิด ตามประเภท ไม่เอาตามยี่ห้ออย่างเดียว"
 *   ประเภทบานก่อน → กรองยี่ห้อด้านใน (ชิป) · กล่อง/ฉาก/อื่นๆ ไม่แยกยี่ห้อ · ไม่เอาหลังคา
 *   20 ต.ค.69 รอบ 2: ประตู + บานติดตาย ยุบเข้า "บานเปิด / กระทุ้ง" · เส้นของบานเลื่อนขึ้นแค่หมวดบานเลื่อน (ไม่ซ้ำหมวดอื่น)
 *   · ฉาก → "ฉาก / Z"
 */
export type PickTypeKey = "slide" | "swing" | "bifold" | "louver" | "box" | "angle" | "other";
export const PICK_TYPES: { key: PickTypeKey; label: string }[] = [
  { key: "slide", label: "บานเลื่อน" },
  { key: "swing", label: "บานเปิด / กระทุ้ง" },
  { key: "bifold", label: "บานเฟี้ยม" },
  { key: "louver", label: "บานระแนง" },
  { key: "box", label: "กล่อง" },
  { key: "angle", label: "ฉาก / Z" },
  { key: "other", label: "อื่นๆ" },
];
/** ตระกูลรุ่น (FAMILIES ของใบตัด) → ประเภทบาน */
const FAMILY_TYPE: Record<string, PickTypeKey> = {
  sms_slide: "slide", fuji_slide: "slide", slimlux: "slide", toprail: "slide",
  fuji_swing: "swing", fuji_hung: "swing", velora: "swing", woodjamb: "swing",
  fuji_door: "swing", pcdoor: "swing", solid: "swing", gate: "swing",   // ประตู = บานเปิด
  sms_bifold: "bifold", euro_bifold: "bifold", euro_lift: "bifold",
  fixed: "swing", fuji_fix: "swing",                                    // บานติดตาย ยุบเข้าบานเปิด/กระทุ้ง
  louver: "louver",
};
/** ชื่อบอกประเภทชัด ๆ (ใช้เมื่อสูตรตัดไม่รู้จักโปรไฟล์นี้) — เช่น "เฟรมล่างบานเลื่อน" "10-เฟรมบานกระทุ้ง" */
const NAME_TYPE: [RegExp, PickTypeKey][] = [
  [/เลื่อน|เลือน|^OPK-|^XSW/i, "slide"],   // OPK/XSW = รหัส SlimLux · "เลือน" สโตร์พิมพ์ตกไม้เอก
  [/เฟี้ยม/, "bifold"],
  [/ติดตาย|บานตาย|\bfix\b/i, "swing"],
  [/กระทุ้ง|บานเปิด|บานยก/, "swing"],
  [/ประตู/, "swing"],
  [/ระแนง/, "louver"],
];
export const PICK_BRANDS: { key: string; label: string }[] = [
  { key: "fuji", label: "Euro Fuji" }, { key: "sms", label: "SMS" }, { key: "market", label: "ตลาด" },
];

/** ตระกูลรุ่นที่เป็น "หลังคา" — เส้นที่ใช้กับหลังคาอย่างเดียวไม่ขึ้นในหน้าเบิก */
const ROOF_FAMILIES = new Set(["awning", "gable", "glasshouse"]);
const BOX_RE = /^(กล่อง|บังใบกล่อง|ฝาปิดกล่อง|ตบปิดกล่อง)/i;
const ANGLE_RE = /^(ฉาก|แซด|ตัว\s?Z|Z\s*[\d"”]|ยู\s)/i;
const CODE_RE = /^([BF][0-9]{3,5}[A-Z]?)$/i;
const CODE_HEAD_RE = /^([BF][0-9]{3,5}[A-Z]?)\s*-/i;

/** ตัดหัวรหัส "B22001-" / "JR00123-" ออกจากชื่อ ให้เหลือชื่อจริง */
function bareName(name: string): string {
  return String(name ?? "").trim().replace(/^(JR[0-9]{5}|[A-Za-z]{1,3}[0-9]{3,5}[A-Za-z]?)\s*-\s*/i, "").trim();
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** ตัดสีท้ายชื่อ ("…-อบขาว" / "… (อบขาว)" / "…((ดำ))") → ชื่อโปรไฟล์ */
function stripColor(name: string, color: string): string {
  let t = name.trim();
  const c = color.trim();
  if (c) t = t.replace(new RegExp(`\\s*(?:-\\s*${esc(c)}|\\(\\(?\\s*${esc(c)}\\s*\\)?\\))\\s*$`, "i"), "").trim();
  return t || name.trim();
}

export type PickSourceRow = {
  sku?: string | null; name?: string | null; color?: string | null; category?: string | null;
  alu_brand?: string | null; is_stocked?: boolean | null;
};
export type PickInfo = {
  types: PickTypeKey[];
  /** ยี่ห้อ fuji/sms/market — "" = ไม่แยกยี่ห้อ (กล่อง/ฉาก/อื่นๆ) */
  brand: string;
  /** คีย์โปรไฟล์ (รวมทุกสีเป็นแถวเดียว) — รหัส B/F หรือชื่อไม่มีสี */
  pkey: string;
  /** ชื่อโปรไฟล์ไม่มีสี ไว้โชว์ */
  base: string;
  /** รหัสโปรไฟล์ไว้โชว์ (B/F) — เส้นทั่วไปว่าง */
  code: string;
};

/**
 * เส้นนี้ขึ้นหมวดไหนในหน้าเบิก — null = ไม่ขึ้น (ไม่ใช่อลู · ของสั่งตามงาน · ใช้กับหลังคาอย่างเดียว)
 */
export function pickInfoOf(r: PickSourceRow): PickInfo | null {
  if (!/อลู/.test(String(r.category ?? ""))) return null;
  if (r.is_stocked === false) return null;            // สีมิว/ของสั่งตามงาน ไม่มีบนชั้น
  const rawName = String(r.name ?? "").trim();
  const color = String(r.color ?? "").trim();
  const nm = bareName(rawName);
  const skuCode = String(r.sku ?? "").trim().match(CODE_RE)?.[1] ?? rawName.match(CODE_HEAD_RE)?.[1] ?? "";
  const code = skuCode.toUpperCase();
  const base = stripColor(nm, color);
  const pkey = code || "N:" + base.replace(/\s+/g, "").toLowerCase();

  // โปรไฟล์ที่มีรหัส B/F (เช่น F7868 กล่องก้าน…) = เส้นประตู/หน้าต่าง ไม่ใช่กล่อง/ฉากทั่วไป
  if (!code && BOX_RE.test(nm)) return { types: ["box"], brand: "", pkey, base, code };
  if (!code && ANGLE_RE.test(nm)) return { types: ["angle"], brand: "", pkey, base, code };

  const fams = FAMILIES.filter((f) => skuInFamily(r.sku, f.key, r.name)).map((f) => f.key);
  if (fams.length && fams.every((k) => ROOF_FAMILIES.has(k))) return null;   // หลังคาอย่างเดียว
  const b = aluBrandOfRow(r.sku, r.name, r.color, r.alu_brand);
  const brand = b === "fuji" || b === "sms" || b === "market" ? b : "";
  // อลูเสริมทั่วไป (ไม่มีรหัส B/F) = ใช้ได้ทุกรุ่น ไม่แยกยี่ห้อ · ตัวที่มีรหัส B/F เป็นโปรไฟล์ของแบรนด์ เก็บยี่ห้อไว้
  if (!code && isAuxAluName(nm)) return { types: ["other"], brand: "", pkey, base, code };   // ลูกฟูก/เส้นกลาง/ตบร่อง… ใช้ได้ทุกรุ่น
  const types = [...new Set(fams.map((k) => FAMILY_TYPE[k]).filter(Boolean))] as PickTypeKey[];
  if (!types.length) for (const [re, t] of NAME_TYPE) if (re.test(nm) && !types.includes(t)) types.push(t);
  // เส้นของบานเลื่อน ขึ้นแค่หมวดบานเลื่อน (เจ้าของ: "ซ้ำกับบานเลื่อน ก็มาโชว์อีกทำไม")
  if (types.includes("slide")) types.splice(0, types.length, "slide");
  return { types: types.length ? types : ["other"], brand, pkey, base, code };
}

/** ใช้เช็คฝั่ง server ว่าเส้นนี้เบิกผ่านหน้านี้ได้ไหม */
export const pickGroupOf = (r: PickSourceRow) => (pickInfoOf(r) ? "ok" : null);
