/**
 * alu-brand — "แถวอลูในสโตร์ตัวนี้ เป็นเส้นแบรนด์ไหน"
 * ─────────────────────────────────────────────────────────────────────────
 * แหล่งเดียวกับที่คิดราคา 4.0 ใช้ (`PB.ALU_BRAND_OF`) แล้วค่อยเดาจากรหัส/ชื่อเมื่อไม่มีในตาราง
 *   ⚠ ห้ามมีตัวเดาแบรนด์ของตัวเองซ้ำอีกที่ — 10 ต.ค.69 เคยมี 2 ตัว (หน้าเรตอลูเดาเอง)
 *     แล้วไม่ตรงกัน → เส้นกลาง/ลูกฟูก ตกกอง "ซื้อเป็นเส้น" ไม่มีเรตให้กด
 *     ราคาในสโตร์ค้างของเก่าเงียบ ๆ ทั้งที่คิดราคาขยับไปแล้ว
 *
 * เจ้าของเคาะไว้ (8-10 ต.ค.69)
 *   รหัส B#### = SMS · F#### = Euro Fuji  (รหัสอยู่ใน sku หรือ "หน้าชื่อ" ก็ได้)
 *   กล่อง/ฉาก ไซส์ในลิสต์ = ฟูจิ · ไซส์นอกลิสต์ หรือมีชื่อเรียก = ตลาด · ตัว Z = ตลาด
 *   ลูกฟูกทุกเส้น = ฟูจิ · ชุดสแตนดาร์ดบานสวิง Schimmer (ตบร่อง/ตบเรียบ/ฝาแจ๊คสัน…) = ตลาด
 *   WM-/OPK/XSW/E-/Velora = ซื้อเป็นเส้น ไม่คิดต่อโล
 */
import PRICEBOOK from "./pricebook.json" with { type: "json" };

export type AluBrand = "fuji" | "sms" | "market" | "fixed" | "";

export const ALU_BRAND_LABEL: Record<string, string> = {
  fuji: "Euro Fuji",
  sms: "SMS",
  market: "ตลาด",
  fixed: "ซื้อเป็นเส้น — ไม่คิดต่อโล",
  "": "ซื้อเป็นเส้น — ไม่คิดต่อโล",
};
export const ALU_BRAND_ORDER = ["fuji", "sms", "market", ""];

/* eslint-disable @typescript-eslint/no-explicit-any */
const BRAND_OF: Record<string, string> = ((PRICEBOOK as any).ALU_BRAND_OF ?? {}) as Record<string, string>;

// กล่อง/ฉาก ไซส์ที่เป็นฟูจิ (ลิสต์เจ้าของ 8 ต.ค.69) — ไซส์นอกลิสต์/มีชื่อเรียก = ตลาด
const FUJI_BOX = ["1X1", "1X1.6", "1X2", "1X4", "1.6X1.6", "1.6X3", "1.6X4", "2X2", "2X4", "4X4"];
const FUJI_ANG = ["3หุน", "4หุน", "6หุน", "1", "2", "3", "4"];
const sizeKey = (t: string) => t.toUpperCase().replace(/["”]/g, "").replace(/\s+/g, "").replace(/นิ้ว/g, "").replace(/×/g, "X");

/** ชื่อแถวสโตร์ → "รหัสกลาง" ที่สูตรใช้ (ตัดรหัสหน้า + สีท้าย) · "เส้นกลาง-ดำ" → "เส้นกลาง" */
export function aluCodesOfRow(sku: string, name: string): string[] {
  const out = [String(sku ?? "").trim().toUpperCase()];
  const p = String(name ?? "").split("-").map((x) => x.trim()).filter(Boolean);
  if (p.length > 1 && /^(JR\d{5}|B\d{5}|F\d{4}[A-Z]?)$/i.test(p[0])) p.shift();
  if (p.length > 1) p.pop();                     // ท้ายสุด = สี
  out.push(p.join("-"));
  const head = String(name ?? "").trim().match(/^([A-Za-z]{1,3}\d{3,5}[A-Za-z]?)\b/);
  if (head) out.push(head[1].toUpperCase());
  return out.filter(Boolean);
}

/** เดาแบรนด์จากรหัส/ชื่อ (ใช้เมื่อ ALU_BRAND_OF ไม่รู้จักรหัสนี้) */
export function guessAluBrand(sku: string, name: string): AluBrand {
  const s = String(sku ?? "").toUpperCase(), n = String(name ?? "").trim();
  if (/^(WM-|OPK|XSW|E-)/i.test(s) || /^(WM-|OPK|XSW|E-|VELORA)/i.test(n)) return "";
  // ⚠ สโตร์หลายแถวใส่ sku เป็น JR0xxxx แต่รหัสจริงอยู่หน้าชื่อ ("B24013-คิ้วตบกระจก 14-22 มม.-ดำ")
  const head = (n.match(/^([A-Za-z]{1,3}\d{3,5}[A-Za-z]?)\b/)?.[1] ?? "").toUpperCase();
  if (/^B\d/.test(s) || /^B\d/.test(head)) return "sms";
  if (/^F\d/.test(s) || /^F\d/.test(head)) return "fuji";
  if (/^(Z |ตัวZ|แซด)/i.test(n)) return "market";
  const bx = n.match(/^กล่อง\s*([\d."x×/ ]+?)\s*(?:-|\(|$)/i);
  if (bx) return FUJI_BOX.includes(sizeKey(bx[1])) ? "fuji" : "market";
  const ag = n.match(/^ฉาก\s*([\d."x×/ ]+?|\d+\s*หุน)\s*(?:-|\(|$)/i);
  if (ag) return FUJI_ANG.includes(sizeKey(ag[1])) ? "fuji" : "market";
  if (/^(กล่อง|ฉาก)/.test(n)) return "market";          // กล่อง/ฉากที่มีชื่อเรียก (เรียบ/ร่อง/แจ๊คสัน)
  if (/^ลูกฟูก/.test(n)) return "fuji";                  // ลูกฟูกทุกเส้น = ฟูจิ
  if (/^(ตบร่อง|ตบเรียบ|ฝาแจ๊คสัน|ฝาปิดกล่อง|คิ้วลอย)/.test(n)) return "market";
  return "";
}

/** แบรนด์ของแถวสโตร์ — ตาราง pricebook มาก่อน แล้วค่อยเดา */
export function aluBrandOfRow(sku?: string | null, name?: string | null): AluBrand {
  for (const c of aluCodesOfRow(String(sku ?? ""), String(name ?? ""))) {
    const b = BRAND_OF[c];
    if (b && b !== "fixed") return b as AluBrand;
  }
  return guessAluBrand(String(sku ?? ""), String(name ?? ""));
}

/** ป้ายแบรนด์สำหรับโชว์บนจอ — "" = ซื้อเป็นเส้น */
export function aluBrandLabel(sku?: string | null, name?: string | null): string {
  return ALU_BRAND_LABEL[aluBrandOfRow(sku, name)] ?? ALU_BRAND_LABEL[""];
}
