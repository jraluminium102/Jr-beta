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
  id: number; name?: string | null; sku?: string | null; color?: string | null;
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
