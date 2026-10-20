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

export type PickGroupKey = "door_fuji" | "door_sms" | "door_market" | "box" | "angle" | "other";
export const PICK_GROUPS: { key: PickGroupKey; label: string; short: string }[] = [
  { key: "door_fuji", label: "ประตู/หน้าต่าง Euro Fuji", short: "Euro Fuji" },
  { key: "door_sms", label: "ประตู/หน้าต่าง SMS", short: "SMS" },
  { key: "door_market", label: "ประตู/หน้าต่าง ตลาด", short: "ตลาด" },
  { key: "box", label: "กล่อง", short: "กล่อง" },
  { key: "angle", label: "ฉาก", short: "ฉาก" },
  { key: "other", label: "อื่นๆ", short: "อื่นๆ" },
];

/** ตระกูลรุ่นที่เป็น "หลังคา" — เส้นที่ใช้กับหลังคาอย่างเดียวไม่ขึ้นในหน้าเบิก */
const ROOF_FAMILIES = new Set(["awning", "gable", "glasshouse"]);
const BOX_RE = /^(กล่อง|บังใบกล่อง|ฝาปิดกล่อง|ตบปิดกล่อง)/i;
const ANGLE_RE = /^(ฉาก|แซด|ตัว\s?Z|Z\s*[\d"”]|ยู\s)/i;

/** ตัดหัวรหัส "B22001-" / "JR00123-" ออกจากชื่อ ให้เหลือชื่อจริง */
function bareName(name: string): string {
  return String(name ?? "").trim().replace(/^(JR[0-9]{5}|[A-Za-z]{1,3}[0-9]{3,5}[A-Za-z]?)\s*-\s*/i, "").trim();
}

export type PickSourceRow = {
  sku?: string | null; name?: string | null; color?: string | null; category?: string | null;
  alu_brand?: string | null; is_stocked?: boolean | null;
};

/**
 * เส้นนี้อยู่หมวดไหนในหน้าเบิก — คืน null = ไม่ขึ้นในหน้าเบิก (ไม่ใช่อลู · ของสั่งตามงาน · ใช้กับหลังคาอย่างเดียว)
 */
export function pickGroupOf(r: PickSourceRow): PickGroupKey | null {
  if (!/อลู/.test(String(r.category ?? ""))) return null;
  if (r.is_stocked === false) return null;            // สีมิว/ของสั่งตามงาน ไม่มีบนชั้น
  const nm = bareName(String(r.name ?? ""));
  // โปรไฟล์ที่มีรหัส B/F (เช่น F7868 กล่องก้าน…) = เส้นประตู/หน้าต่างของแบรนด์ ไม่ใช่กล่อง/ฉากทั่วไป
  const hasProfileCode = /^[BF][0-9]{3,5}[A-Z]?$/i.test(String(r.sku ?? "").trim()) || /^[BF][0-9]{3,5}[A-Z]?\s*-/i.test(String(r.name ?? "").trim());
  if (!hasProfileCode && BOX_RE.test(nm)) return "box";
  if (!hasProfileCode && ANGLE_RE.test(nm)) return "angle";
  const fams = FAMILIES.filter((f) => skuInFamily(r.sku, f.key, r.name)).map((f) => f.key);
  if (fams.length && fams.every((k) => ROOF_FAMILIES.has(k))) return null;   // หลังคาอย่างเดียว
  if (isAuxAluName(nm)) return "other";               // ลูกฟูก/เส้นกลาง/ตบร่อง… ใช้ได้ทุกรุ่น
  const brand = aluBrandOfRow(r.sku, r.name, r.color, r.alu_brand);
  if (brand === "fuji" || brand === "sms" || brand === "market") return `door_${brand}` as PickGroupKey;
  return "other";
}
