/**
 * weight-backfill — จับคู่ "น้ำหนัก กก./เส้น จากไฟล์ถอดทุน" กับเส้นอลูในสโตร์
 * ─────────────────────────────────────────────────────────────────────────
 * ทำไม (เจ้าของสั่ง 19 ส.ค.69): เส้นที่ไม่มีน้ำหนักในสโตร์ → กดเปลี่ยนเรตต่อโลแล้วราคาไม่ขยับ
 *   (API ตั้งเรตข้ามให้เลย · ดูแท็บ "ราคาต่อโล → ราคาต่อเส้น" ในหน้าตรวจผูกสโตร์)
 *
 * แหล่งน้ำหนัก = PB.ALUWEIGHT ← ชีต "น้ำหนักโปรไฟล์" (ชั่งจริง) ไม่ใช่คอลัมน์ในชีตราคาสี (= ราคา÷187)
 * ⚠ PB.ALUWEIGHT_SUSPECT = รหัสที่น้ำหนักในชีตยังน่าสงสัย → ห้ามเติม รอเจ้าของยืนยันก่อน
 *
 * ไฟล์นี้ไม่มีสูตรของตัวเอง — แค่จับคู่ + จัดสถานะ (คำนวณจริงอยู่ที่ pricebook/สโตร์)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import PRICEBOOK from "./pricebook.json" with { type: "json" };

const PB: any = PRICEBOOK;
const up = (s: unknown) => String(s ?? "").trim().toUpperCase();
const num = (v: unknown) => Number(v) || 0;

export type StockLite = {
  id: number; name?: string | null; sku?: string | null; color?: string | null; category?: string | null;
  weight_per_unit?: number | string | null; price_per_kg?: number | string | null;
  unit_cost?: number | string | null; is_weight_based?: boolean | null;
};

export type WeightStatus =
  | "fill"        // ยังไม่มีน้ำหนัก → เติมได้เลย
  | "differ"      // มีแล้วแต่ไม่ตรงไฟล์ → เลือกได้ว่าจะทับไหม
  | "same"        // ตรงแล้ว ไม่ต้องทำอะไร
  | "suspect";    // ไฟล์ยังไม่ชัวร์ → ห้ามเติม

export const WEIGHT_STATUS_LABEL: Record<WeightStatus, string> = {
  fill: "ยังไม่มีน้ำหนัก — เติมได้",
  differ: "มีแล้วแต่ไม่ตรงไฟล์",
  same: "ตรงแล้ว",
  suspect: "⚠ น้ำหนักในไฟล์ยังไม่ชัวร์ — ข้ามไว้",
};

export type WeightRow = {
  id: number; sku: string; name: string; color: string;
  current: number;      // น้ำหนักในสโตร์ตอนนี้
  fromFile: number;     // น้ำหนักจากไฟล์
  ratePerKg: number; unitCost: number;
  status: WeightStatus;
};

/** รหัสที่มีน้ำหนักในไฟล์และเชื่อถือได้ (ตัดตัวที่ยังไม่ชัวร์ออก) */
/**
 * รหัสจริงของแถวสโตร์ — สโตร์หลายแถวใส่ sku เป็น JR0xxxx แต่รหัสจริงอยู่หน้าชื่อ
 *   "JR02029 | 9014 ตัวตบเคอเทนวอล" · "JR02885 | Velora01" · "F7865 | F7865B-แผงประตู"
 *   (9 ต.ค.69 เจ้าของทักว่าน้ำหนักในสโตร์ยังไม่ถูกแก้ — เพราะจับคู่ด้วย sku อย่างเดียวเลยพลาด 358 แถว)
 */
export function codesOf(r: StockLite): string[] {
  const list: string[] = [];
  const sku = up(r.sku);
  if (sku) list.push(sku);
  const head = String(r.name ?? "").trim().match(/^([A-Za-z]{0,3}\d{3,5}[A-Za-z]?)\b/);
  if (head) list.push(up(head[1]));
  // รหัสที่ขึ้นต้นด้วยตัวอักษรล้วน (OPK-A205-40 / WM-K01 / Velora01 / E-01)
  const alpha = String(r.name ?? "").trim().match(/^([A-Za-z]{2,}-?[A-Za-z0-9-]*\d[A-Za-z0-9-]*)/);
  if (alpha) list.push(up(alpha[1]));
  // sku ที่ตัดตัวอักษรท้ายของรหัสไฟล์ (สโตร์ F7865 ↔ ไฟล์ F7865B)
  if (/^F\d{4}$/.test(sku)) { list.push(sku + "B"); list.push(sku + "C"); }
  return [...new Set(list)].filter(Boolean);
}

/** น้ำหนักของแถวสโตร์ จากรหัสตัวแรกที่ไฟล์รู้จัก */
/** ชื่อแถวสโตร์ตัดสีท้ายออก + ล้างช่องว่าง/เครื่องหมายนิ้ว — ใช้จับคู่กับ ALUWEIGHT_BYNAME */
/**
 * ชื่อแถวสโตร์ → คีย์กลาง สำหรับจับคู่กับ ALUWEIGHT_BYNAME
 *   ตัดสีท้าย · ตัดคำนำหน้า (ดาม/ใบ/เสา…) · Z = แซด = ตัวZ · 1"1/2 = 1.5" · cm = ซม.
 *   (9 ต.ค.69 สโตร์เขียนชื่อหลายแบบสำหรับของชิ้นเดียวกัน)
 */
const normName = (s: unknown) => {
  let t = String(s ?? "").replace(/\s*\([^)]*\)\s*$/, "").replace(/-[^-]*$/, "").trim().toUpperCase();   // ตัดวงเล็บสีท้าย แล้วค่อยตัดสีท้าย
  t = t.replace(/[”"″']/g, '"').replace(/\s+/g, " ");
  t = t.replace(/(\d)"\s*1\/2/g, "$1.5\"");          // 1"1/2 → 1.5"
  t = t.replace(/(\d)\s*1\/2"/g, "$1.5\"");
  t = t.replace(/\bCM\b|\bซม\.?/g, "ซม.");
  t = t.replace(/^(?:ดาม|ใบ|เส้น)\s+/, "");            // "ดาม กล่อง1×1" → "กล่อง1×1"
  t = t.replace(/^(?:ตัว\s?Z|Z)\s*(?=[\d"])/, "แซด ");  // Z 4" / ตัวZ 4" → แซด 4"
  t = t.replace(/\s*[xX×]\s*/g, "X");
  t = t.replace(/^(กล่อง|ฉาก|แซด)\s*/, "$1 ");
  return t.trim();
};
const BYNAME: Record<string, number> = Object.fromEntries(
  Object.entries((PB.ALUWEIGHT_BYNAME ?? {}) as Record<string, unknown>)
    .map(([k, v]) => [normName(k), num(v)] as const)
    .filter(([k, v]) => k !== "" && v > 0),   // คีย์ว่าง = ชื่อถูกล้างจนหมด ห้ามเก็บ (เคยทำให้ทุกเส้นได้น้ำหนักเดียวกัน)
);

export function weightOf(r: StockLite, W?: Record<string, number>): { kg: number; code: string } {
  const tab = W ?? usableWeights();
  for (const c of codesOf(r)) if (num(tab[c]) > 0) return { kg: num(tab[c]), code: c };
  // กล่อง/ฉาก/แซด ในสโตร์ไม่มีรหัส — จับด้วยชื่อขนาด (ตัดสีท้ายออก)
  const nn = normName(r.name);
  const byName = nn ? BYNAME[nn] : 0;
  if (num(byName) > 0) return { kg: num(byName), code: nn };
  return { kg: 0, code: "" };
}
export function usableWeights(): Record<string, number> {
  const bad = new Set<string>((PB.ALUWEIGHT_SUSPECT ?? []).map(up));
  const out: Record<string, number> = {};
  for (const [code, kg] of Object.entries(PB.ALUWEIGHT ?? {}))
    if (!bad.has(up(code)) && num(kg) > 0) out[up(code)] = num(kg);
  return out;
}

/** จับคู่แถวสโตร์กับน้ำหนักในไฟล์ — คืนเฉพาะแถวที่รหัสตรงกับไฟล์ */
export function matchWeights(stock: StockLite[]): WeightRow[] {
  const W = usableWeights();
  const suspect = new Set<string>((PB.ALUWEIGHT_SUSPECT ?? []).map(up));
  const rows: WeightRow[] = [];
  for (const r of stock ?? []) {
    const sku = up(r.sku);
    if (!sku) continue;
    const fromFile = W[sku];
    if (!(fromFile > 0)) {
      // รหัสที่ไฟล์มีแต่ยังไม่ชัวร์ → โชว์ไว้ให้เห็น แต่เติมไม่ได้
      if (suspect.has(sku) && num(PB.ALUWEIGHT?.[sku]) > 0) rows.push({
        id: Number(r.id), sku, name: String(r.name ?? ""), color: String(r.color ?? ""),
        current: num(r.weight_per_unit), fromFile: num(PB.ALUWEIGHT[sku]),
        ratePerKg: num(r.price_per_kg), unitCost: num(r.unit_cost), status: "suspect",
      });
      continue;
    }
    const current = num(r.weight_per_unit);
    rows.push({
      id: Number(r.id), sku, name: String(r.name ?? ""), color: String(r.color ?? ""),
      current, fromFile, ratePerKg: num(r.price_per_kg), unitCost: num(r.unit_cost),
      status: current <= 0 ? "fill" : Math.abs(current - fromFile) < 0.005 ? "same" : "differ",
    });
  }
  const order: Record<WeightStatus, number> = { fill: 0, differ: 1, suspect: 2, same: 3 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.sku.localeCompare(b.sku) || a.color.localeCompare(b.color));
}

export function summarize(rows: WeightRow[]) {
  const c: Record<WeightStatus, number> = { fill: 0, differ: 0, same: 0, suspect: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

/** ชื่อขนาดของแถว (ตัดสีท้าย + รหัสนำหน้าออก) — ใช้รวมกลุ่มตอนกรอกน้ำหนักเอง */
export function sizeLabel(r: StockLite): string {
  return String(r.name ?? "").replace(/-[^-]*$/, "").replace(/^[A-Za-z]{0,3}\d{3,5}[A-Za-z]?\s+/, "").trim();
}

export type ManualGroup = {
  key: string; label: string; ids: number[]; colors: string[];
  withKg: number;        // กี่สีที่มีน้ำหนักแล้ว
  current: number;       // น้ำหนักที่ใช้อยู่ (ถ้ามี)
};

/**
 * เส้นอลูที่ไฟล์ไม่มีน้ำหนักให้ → รวมตามชื่อขนาด ให้เจ้าของกรอก กก./เส้น เองทีเดียวทุกสี
 *   (9 ต.ค.69 เจ้าของสั่ง "ก่อนอื่นแก้หน้าน้ำหนักให้ใส่น้ำหนักให้ได้ด้วย")
 */
export function manualGroups(stock: StockLite[]): ManualGroup[] {
  const W = usableWeights();
  const by = new Map<string, ManualGroup>();
  for (const r of stock ?? []) {
    if (!/อลูมิเนียม/.test(String(r.category ?? ""))) continue;
    if (weightOf(r, W).kg > 0) continue;              // ไฟล์มีให้แล้ว ไปใช้ตารางด้านบน
    const label = sizeLabel(r) || String(r.name ?? "").trim();
    if (!label) continue;
    const g = by.get(label) ?? { key: label, label, ids: [], colors: [], withKg: 0, current: 0 };
    g.ids.push(Number(r.id));
    const c = String(r.color ?? "").replace(/[()]/g, "").trim();
    if (c && !g.colors.includes(c)) g.colors.push(c);
    const kg = num(r.weight_per_unit);
    if (kg > 0) { g.withKg++; if (!(g.current > 0)) g.current = kg; }
    by.set(label, g);
  }
  return [...by.values()].sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label, "th"));
}
