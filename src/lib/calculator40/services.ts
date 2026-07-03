// services.ts — ค่าบริการเพิ่มเติมทั้งใบ (พาริตี้ R3.9): นั่งร้าน/เดินทาง/ขนส่ง/ค่าไฟ/ความเสี่ยง/รื้อ
// กฎ (ตาม R3.9): นั่งร้าน (ชั้น-1)×5,000 · เดินทาง ceil(กม./100)×5,000 · รื้อหลังคา จุด×5,000
//   กทม./ปริมณฑล + ยอดสินค้า > 20,000 → ยกเว้น "นั่งร้าน + ค่าเดินทาง(ระยะ)" (ค่าที่พัก/ขนส่ง/ไฟ/เสี่ยง ไม่ยกเว้น)
export type ServiceInput = {
  inBKK: boolean;
  floors: number;      // จำนวนชั้น (นั่งร้านคิดชั้น 2 ขึ้นไป)
  travelKm: number;    // ระยะทาง (กม.)
  lodging: number;     // ค่าที่พัก (กรอกเอง)
  shipping: number;    // ขนส่ง (กรอกเอง)
  power: number;       // ค่าไฟ (กรอกเอง)
  risk: number;        // ความเสี่ยง (กรอกเอง)
  demoRoofPts: number; // รื้อหลังคาเดิม (จุด × 5,000)
};

export type ServiceLine = { name: string; amount: number; waived?: boolean };
export type ServiceResult = { lines: ServiceLine[]; total: number; waivedNote?: string };

export const EMPTY_SERVICES: ServiceInput = {
  inBKK: false, floors: 1, travelKm: 0, lodging: 0, shipping: 0, power: 0, risk: 0, demoRoofPts: 0,
};

const r0 = (n: number) => Math.max(0, Math.round(Number(n) || 0));

// goodsSubtotal = ยอดสินค้า (ก่อนค่าบริการ) ใช้เช็คเงื่อนไขยกเว้น กทม.
export function computeServices(s: ServiceInput, goodsSubtotal: number): ServiceResult {
  const floors = Math.max(1, Math.round(Number(s.floors) || 1));
  const km = Math.max(0, Number(s.travelKm) || 0);
  const scaffoldRaw = floors >= 2 ? (floors - 1) * 5000 : 0;
  const travelRaw = km > 0 ? Math.ceil(km / 100) * 5000 : 0;
  const waive = !!s.inBKK && goodsSubtotal > 20000; // ยกเว้นเฉพาะนั่งร้าน+เดินทาง(ระยะ)

  const lines: ServiceLine[] = [];
  const push = (name: string, amount: number, waivedFlag = false) => {
    const a = r0(amount);
    if (a > 0) lines.push({ name, amount: waivedFlag ? 0 : a, waived: waivedFlag && a > 0 });
  };

  push(`ค่านั่งร้าน (${floors} ชั้น)`, scaffoldRaw, waive);
  push(`ค่าเดินทาง (${km} กม.)`, travelRaw, waive);
  push("ค่าที่พัก", s.lodging);
  push("ค่าขนส่ง", s.shipping);
  push("ค่าไฟหน้างาน", s.power);
  push("ค่าความเสี่ยง (งานสูง/พิเศษ)", s.risk);
  push(`รื้อหลังคาเดิม (${Math.max(0, Math.round(Number(s.demoRoofPts) || 0))} จุด)`, (Number(s.demoRoofPts) || 0) * 5000);

  const total = lines.reduce((a, l) => a + l.amount, 0);
  const waivedNote = waive && (scaffoldRaw > 0 || travelRaw > 0)
    ? "งานในกรุงเทพฯ/ปริมณฑล + ยอด > 20,000 → ยกเว้นค่านั่งร้าน + ค่าเดินทาง"
    : undefined;
  return { lines, total, waivedNote };
}
