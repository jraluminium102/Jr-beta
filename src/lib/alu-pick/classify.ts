/**
 * ใบเบิกอลู — จัดหมวดเส้นอลู (ใช้ฝั่ง server เท่านั้น · import สูตรใบตัด + สูตรคิดราคา)
 *
 * แหล่งข้อมูลว่า "เส้นนี้ใช้กับบานอะไร" ไล่ตามลำดับ:
 *   ① สูตรใบตัด (FAMILIES / skuInFamily)
 *   ② สูตรคิดราคา 4.0 (PRODUCTS — รหัส B/F ในแต่ละรุ่น)
 *   ③ ชื่อเส้น (เลื่อน / เฟี้ยม / กระทุ้ง / แบ่งบาน …) เมื่อ ① ② ไม่รู้จัก
 * แล้วใช้กติกาเจ้าของ (20 ต.ค.69): SlimLux แยก · เมืองทอง แยก · บานเลื่อนไม่ซ้ำหมวดอื่น
 */
import { FAMILIES, skuInFamily } from "@/lib/cutlist/family-codes";
import { isAuxAluName } from "@/lib/cutlist/codes";
import { aluBrandOfRow } from "@/lib/calculator40/alu-brand";
import { PRODUCTS } from "@/lib/calculator40/products.mjs";
import type { PickTypeKey } from "./groups";

/** ตระกูลรุ่นของใบตัด → หมวด */
const FAMILY_TYPE: Record<string, PickTypeKey> = {
  sms_slide: "slide", fuji_slide: "slide", toprail: "slide", slimlux: "slimlux",
  fuji_swing: "swing", fuji_hung: "lift", velora: "swing",
  fuji_door: "swing", pcdoor: "swing", solid: "swing", gate: "swing",     // ประตู = บานเปิด
  fixed: "swing", fuji_fix: "swing",                                      // บานติดตาย ยุบเข้าบานเปิด/กระทุ้ง
  sms_bifold: "bifold", euro_bifold: "bifold", euro_lift: "bifold",
  woodjamb: "muangthong",
  louver: "louver",
};
/** รุ่นในสูตรคิดราคา 4.0 → หมวด (รุ่นที่ไม่อยู่ในนี้ = ไม่นับ เช่น หลังคา/ผนัง/ฝ้า) */
const CALC_TYPE: Record<string, PickTypeKey> = {
  sms_slide: "slide", euro_slide: "slide", topslide: "slide", eseries: "slide", gate: "slide",
  slimlux: "slimlux",
  open_door: "swing", awning: "swing", fixed: "swing", velora: "swing", pcdoor: "swing", banyok: "lift",
  curve_fixed: "swing", curve_open: "swing",
  folding: "bifold", fold_euro: "bifold",
  woodjamb: "muangthong",
};
/** ชื่อบอกประเภท (ใช้เมื่อสูตรไม่รู้จักโปรไฟล์นี้) */
const NAME_TYPE: [RegExp, PickTypeKey][] = [
  [/เมืองทอง|เสาบานพับ/, "muangthong"],
  [/^OPK-|^XSW|มือจับ\s*xj|รางสแตนเล/i, "slimlux"],   // มือจับ X-J + รางสแตนเลสโค้ง = ของ SlimLux (เจ้าของเคาะ 20 ต.ค.69)
  [/เลื่อน|เลือน|เกี่ยว/, "slide"],            // "เลือน" สโตร์พิมพ์ตกไม้เอก · ตบเกี่ยว/เสาเกี่ยว = บานเลื่อน
  [/เฟี้ยม/, "bifold"],
  [/บานยก/, "lift"],
  [/ติดตาย|บานตาย|กระทุ้ง|บานเปิด|ประตู|แบ่งบาน|กล่องก้าน|บานมุ้ง|คิ้วกรอบบาน|คิ้วลอย|บังใบ/, "swing"],
  [/ระแนง/, "louver"],
];
/** รหัสที่ยืนยันจากแคตตาล็อก/ราคาปลีกว่าเป็นชุดบานเลื่อน แต่ชื่อไม่บอก */
const CODE_TYPE: Record<string, PickTypeKey> = {
  F7952: "slide",   // แผ่นยึดเฟรมล่าง — อยู่ถัดจาก F7951 เสารับแรงบานเลื่อน ในราคาปลีก Fuji
};
/** ชุดรหัสทั้งชุดที่เป็นบานเลื่อน — B20xxx = SMS บานเลื่อน (B20001 เฟรมบน · B20002 เฟรมล่าง · B20003 เฟรมข้าง …) */
const SERIES_TYPE: [RegExp, PickTypeKey][] = [[/^B20\d{3}$/, "slide"]];

const ROOF_FAMILIES = new Set(["awning", "gable", "glasshouse"]);
const BOX_RE = /^(กล่อง|บังใบกล่อง|ฝาปิดกล่อง|ตบปิดกล่อง)/i;
const ANGLE_RE = /^(ฉาก|แซด|ตัว\s?Z|Z\s*[\d"”]|ยู\s|ลูกฟูก)/i;     // ลูกฟูก/ยู อยู่กับฉาก/Z (เจ้าของเคาะ 20 ต.ค.69)
const CODE_RE = /^([BF][0-9]{3,5}[A-Z]?)$/i;
const CODE_HEAD_RE = /^([BF][0-9]{3,5}[A-Z]?)\s*-/i;

let _calcByCode: Map<string, Set<PickTypeKey>> | null = null;
function calcTypesOf(code: string): Set<PickTypeKey> {
  if (!_calcByCode) {
    const m = new Map<string, Set<PickTypeKey>>();
    const walk = (x: unknown, t: PickTypeKey) => {
      if (Array.isArray(x)) { x.forEach((y) => walk(y, t)); return; }
      if (!x || typeof x !== "object") return;
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if (k === "code" && typeof v === "string") {
          // code อาจเป็นเงื่อนไข เช่น "GMM>13?'F7917':'F7919'" → เก็บทุกรหัสในนั้น
          // สูตรเขียน F7938B / F7945C (ตัวแปร) แต่สโตร์เก็บ F7938 → ผูกทั้งสองแบบ
          for (const hit of v.toUpperCase().match(/[BF]\d{4,5}[A-Z]?/g) ?? []) {
            for (const key of new Set([hit, hit.replace(/^([BF]\d{4,5})[A-Z]$/, "$1")])) {
              const set = m.get(key) ?? new Set<PickTypeKey>(); set.add(t); m.set(key, set);
            }
          }
        } else walk(v, t);
      }
    };
    for (const [id, prod] of Object.entries(PRODUCTS as Record<string, unknown>)) {
      const t = CALC_TYPE[id];
      if (t) walk(prod, t);
    }
    _calcByCode = m;
  }
  return _calcByCode.get(code) ?? new Set();
}

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
  /** ยี่ห้อ fuji/sms/market — "" = ไม่แยกยี่ห้อ */
  brand: string;
  /** คีย์โปรไฟล์ (รวมทุกสีเป็นแถวเดียว) — รหัส B/F หรือชื่อไม่มีสี */
  pkey: string;
  /** ชื่อโปรไฟล์ไม่มีสี ไว้โชว์ */
  base: string;
  /** รหัสโปรไฟล์ B/F — เส้นทั่วไปว่าง */
  code: string;
};

/** เส้นนี้ขึ้นหมวดไหนในหน้าเบิก — null = ไม่ขึ้น (ไม่ใช่อลู · ของสั่งตามงาน · ใช้กับหลังคาอย่างเดียว) */
export function pickInfoOf(r: PickSourceRow): PickInfo | null {
  if (!/อลู/.test(String(r.category ?? ""))) return null;
  if (r.is_stocked === false) return null;            // สีมิว/ของสั่งตามงาน ไม่มีบนชั้น
  const rawName = String(r.name ?? "").trim();
  const color = String(r.color ?? "").trim();
  const nm = bareName(rawName);
  const code = (String(r.sku ?? "").trim().match(CODE_RE)?.[1] ?? rawName.match(CODE_HEAD_RE)?.[1] ?? "").toUpperCase();
  const base = stripColor(nm, color);
  const pkey = code || "N:" + base.replace(/\s+/g, "").toLowerCase();
  const out = (types: PickTypeKey[], brand = ""): PickInfo => ({ types, brand, pkey, base, code });

  // เส้นทั่วไป (ไม่มีรหัส B/F): กล่อง · ฉาก/Z/ลูกฟูก/ยู
  if (!code && BOX_RE.test(nm)) return out(["box"]);
  if (!code && ANGLE_RE.test(nm)) return out(["angle"]);

  const fams = FAMILIES.filter((f) => skuInFamily(r.sku, f.key, r.name)).map((f) => f.key);
  if (fams.length && fams.every((k) => ROOF_FAMILIES.has(k))) return null;   // หลังคาอย่างเดียว
  const b = aluBrandOfRow(r.sku, r.name, r.color, r.alu_brand);
  const brand = b === "fuji" || b === "sms" || b === "market" ? b : "";

  const types = new Set<PickTypeKey>();
  for (const k of fams) if (FAMILY_TYPE[k]) types.add(FAMILY_TYPE[k]);
  if (code) for (const t of calcTypesOf(code)) types.add(t);
  if (code && CODE_TYPE[code]) types.add(CODE_TYPE[code]);
  if (code) for (const [re, t] of SERIES_TYPE) if (re.test(code)) types.add(t);
  // ชื่อบอกเมืองทอง/SlimLux = ชัดเสมอ · ชื่อบอกประเภทอื่น ใช้เมื่อยังไม่รู้
  for (const [re, t] of NAME_TYPE) {
    if (!re.test(nm) && !re.test(rawName)) continue;
    if (t === "muangthong" || t === "slimlux" || !types.size) types.add(t);
  }
  if (!types.size && isAuxAluName(nm)) return out(["other"]);   // ลูกฟูก/เส้นกลาง/ตบร่อง… ใช้ได้ทุกรุ่น

  // กติกาเจ้าของ: หมวดเฉพาะ (เมืองทอง/SlimLux/บานเลื่อน) ไม่ซ้ำหมวดอื่น
  for (const only of ["muangthong", "slimlux", "slide", "lift"] as PickTypeKey[]) {
    if (types.has(only)) return out([only], brand);
  }
  return out(types.size ? [...types] : ["other"], brand);
}

/** ชื่อโปรไฟล์ไม่มีรหัส/ไม่มีสี ("B20001 - เฟรมบน-อบขาว" → "เฟรมบน") — ใช้กับบรรทัดสีพิเศษ ที่ไม่ควรโชว์สีของแถวอ้างอิง */
export function profileBaseName(r: PickSourceRow): string {
  return stripColor(bareName(String(r.name ?? "")), String(r.color ?? "").trim()) || String(r.name ?? "").trim();
}

/** ใช้เช็คฝั่ง server ว่าเส้นนี้เบิกผ่านหน้านี้ได้ไหม */
export const pickGroupOf = (r: PickSourceRow) => (pickInfoOf(r) ? "ok" : null);
