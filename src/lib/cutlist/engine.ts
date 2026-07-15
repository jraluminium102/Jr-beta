/**
 * cutlist/engine — เอนจิน "ใบตัดอลู" (production cut list) JR
 * นำร่อง: SMS บานเลื่อน · พอร์ตสูตรฝังตรงจาก Excel โฟลเดอร์ "ตัดประกอบ"
 *
 * รากของ 3 ระบบที่ผูกกัน:
 *   1) ใบตัด (หน้านี้) — ช่างตัดอลูรู้ว่าตัดเส้นไหน ยาวเท่าไร กี่เส้น
 *   2) BOQ ต่องานลูกค้า — รวมทุกรายการในงาน → สรุป "เส้นต่อรหัสอลู" ทั้งงาน
 *   3) ตัดสต็อก — เอาเส้นต่อรหัสไปหักสต็อก (sku = รหัส B####) ที่เราผูกไว้แล้ว
 *
 * หน่วยภายใน = ซม. · เส้นสต็อกมาตรฐานตั้งต่อรุ่น (SMS = 640 ซม. = 6.4 ม.)
 */

export type CutInput = {
  W: number;      // กว้างช่อง (ซม.)
  H: number;      // สูงช่อง (ซม.)
  N: number;      // จำนวนบาน (บานติดตาย = จำนวนช่อง)
  rail: string;   // ราง (เช่น "3รางเสียบ" / "รางเตี้ย7มม")
  honk: boolean;  // มีโหนกไหม (SMS)
  // ตัวเลือกเฉพาะรุ่น (optional — รุ่นไหนใช้ประกาศผ่าน spec.opts ให้ UI render เอง)
  fit?: string;      // SlimLux: "ยัดในช่อง" | "แปะนอก"
  sashMode?: string; // SlimLux: "อิสระ" | "ลากจูง" | "เปิดคู่กลาง"
  beam?: string;     // SlimLux: คาน "1×2".."4×4"
  handle?: string;   // SlimLux: "X-J" | "ไม่มี"
  box?: string;      // บานติดตาย: ชนิดกล่อง
  L?: number;        // เฟี้ยมยูโร: จำนวนบานพับซ้าย (ที่เหลือ = ขวา)
  glass?: number;    // ความหนากระจก (มม.) — เลือกรหัสคิ้วตบกระจก (เฟี้ยม)
};

// ตัวเลือกต่อรุ่น — UI render อัตโนมัติ (นอกเหนือจาก W/H/N/ราง/โหนก) · type "number" = ช่องตัวเลข
export type CutOpt = { key: string; label: string; choices?: string[]; type?: "number" };

// โปรไฟล์ 1 เส้นในใบตัด — code/len/qty เป็นฟังก์ชันของอินพุต (พอร์ตสูตร Excel)
export type CutProfile = {
  name: string;
  code: string | ((o: CutInput) => string);   // รหัสอลู B#### (ผูกสต็อก) · "-" = ไม่มีรหัส
  len: (o: CutInput) => number;                // ยาวตัด (ซม.)
  qty: (o: CutInput) => number;                // จำนวนเส้น
  note?: string;
};

export type CutSpec = {
  id: string;
  name: string;
  stockLen: number;              // ความยาวเส้นสต็อก (ซม.)
  defaults: CutInput;
  rails: string[];               // ตัวเลือกราง ([] = รุ่นนี้ไม่มีราง)
  opts?: CutOpt[];               // ตัวเลือกเฉพาะรุ่น (dropdown เพิ่มเติม)
  profiles: CutProfile[];
  hardware?: { name: string; qty: (o: CutInput) => number; unit?: string }[];
};

export type CutRow = {
  name: string; code: string; len: number; qty: number; bars: number; note?: string;
};
export type CutResult = {
  rows: CutRow[];
  barsByCode: { code: string; bars: number; totalLenCm: number }[]; // สรุปเส้นต่อรหัส (รากของ BOQ + ตัดสต็อก)
  hardware: { name: string; qty: number; unit: string }[];
  totalBars: number;
};

const ceil = (x: number) => Math.ceil(x - 1e-9);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** คิดใบตัด 1 ชุด (1 บาน/ช่อง ตามสเปก) — sets = จำนวนชุดที่ผลิต (คูณจำนวน) */
export function computeCutList(spec: CutSpec, input: Partial<CutInput>, sets = 1): CutResult {
  const o: CutInput = { ...spec.defaults, ...input } as CutInput;
  const n = Math.max(1, sets);
  const rows: CutRow[] = spec.profiles.map((p) => {
    const len = round1(p.len(o));
    const qty = Math.max(0, Math.round(p.qty(o))) * n;
    const code = typeof p.code === "function" ? p.code(o) : p.code;
    const bars = qty > 0 && len > 0 ? ceil((len * qty) / spec.stockLen) : 0;
    return { name: p.name, code, len, qty, bars, note: p.note };
  });
  // สรุปเส้นต่อรหัส — รวมความยาวต่อรหัสก่อน แล้วปัดเป็นเส้น (nesting ต่อรหัส · แม่นกว่าปัดรายบรรทัด)
  const byCode = new Map<string, number>();
  for (const r of rows) {
    if (!r.code || r.code === "-" || r.qty <= 0 || r.len <= 0) continue;
    byCode.set(r.code, (byCode.get(r.code) ?? 0) + r.len * r.qty);
  }
  const barsByCode = [...byCode.entries()]
    .map(([code, totalLenCm]) => ({ code, totalLenCm: round1(totalLenCm), bars: ceil(totalLenCm / spec.stockLen) }))
    .sort((a, b) => a.code.localeCompare(b.code));
  // ฮาร์ดแวร์: จำนวนทศนิยมได้ (เช่น เทปหนุนกระจกเป็นเมตร 7.0) — ปัด 1 ตำแหน่ง ไม่ใช่จำนวนเต็ม
  const hardware = (spec.hardware ?? []).map((h) => ({ name: h.name, qty: round1(Math.max(0, h.qty(o)) * n), unit: h.unit ?? "ชิ้น" }));
  const totalBars = rows.reduce((s, r) => s + r.bars, 0);
  return { rows, barsByCode, hardware, totalBars };
}
