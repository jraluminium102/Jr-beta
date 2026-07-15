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
  glass?: number;    // ความหนากระจก (มม.) — เลือกรหัสคิ้วตบกระจก (เฟี้ยม) · มู่ลี่ = -1
  color?: string;    // สีอลู (token สต็อก เช่น "ดำ"/"อบขาว") — ไม่กระทบความยาวตัด · ใช้ตอนจับคู่/หักสต็อกต่อสี
  // เฟี้ยมยูโรเข้ามุม (CORNER) — โครงต่างจากบานเดี่ยว: ใช้ WA/WB/nA/nB แทน W/N (ช่อง W/N ในจอไม่ใช้)
  WA?: number;       // กว้างผนัง A (ซม.)
  WB?: number;       // กว้างผนัง B (ซม.)
  nA?: number;       // จำนวนบานฝั่ง A
  nB?: number;       // จำนวนบานฝั่ง B
  openSide?: string; // ฝั่งที่เปิดบาน "A" | "B" (ฝั่งเปิดหักลึกกว่า)
};

// ตัวเลือกต่อรุ่น — UI render อัตโนมัติ (นอกเหนือจาก W/H/N/ราง/โหนก) · type "number" = ช่องตัวเลข
export type CutOpt = { key: string; label: string; choices?: string[]; type?: "number" };

// โปรไฟล์ 1 เส้นในใบตัด — code/len/qty เป็นฟังก์ชันของอินพุต (พอร์ตสูตร Excel)
export type CutProfile = {
  name: string;
  code: string | ((o: CutInput) => string);   // รหัสอลู B#### (ผูกสต็อก) · "-" = ไม่มีรหัส
  len: (o: CutInput) => number;                // ยาวตัด (ซม.)
  qty: (o: CutInput) => number;                // จำนวนเส้น
  stockLens?: number[];                        // ความยาวเส้นสต็อกที่มีให้เลือกของโปรไฟล์นี้ (ซม.) — เว้น = ใช้ spec.stockLen · engine เลือกอันที่คุ้มสุด
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
  name: string; code: string; len: number; qty: number; bars: number; stockLen: number; note?: string;
};
export type CutResult = {
  rows: CutRow[];
  // สรุปเส้นต่อรหัส (รากของ BOQ + ตัดสต็อก) — stockLen = ความยาวเส้นที่เลือกใช้จริงต่อรหัส (คุ้มสุด)
  barsByCode: { code: string; bars: number; totalLenCm: number; stockLen: number }[];
  hardware: { name: string; qty: number; unit: string }[];
  totalBars: number;
};

const ceil = (x: number) => Math.ceil(x - 1e-9);
const round1 = (x: number) => Math.round(x * 10) / 10;

// เลือกความยาวเส้นสต็อกที่ "คุ้มสุด" ต่อรหัส (เศษน้อยสุด) จากตัวเลือกที่มี (เช่น เสากุญแจ SlimLux 4.8/6 ม.)
//  · ต้องยาว ≥ ชิ้นยาวสุด (ตัดได้จริง) · เศษ = bars×B − sumLen ต่ำสุด · เท่ากันเลือกจำนวนเส้นน้อยกว่า
function pickStock(sumLen: number, maxCut: number, candidates: number[]): { stockLen: number; bars: number } {
  const uniq = [...new Set(candidates.filter((b) => b > 0))].sort((a, b) => a - b);
  const feasible = uniq.filter((b) => b >= maxCut - 1e-9);
  const pool = feasible.length ? feasible : [Math.max(...uniq)]; // ไม่มีอันไหนพอ → ยาวสุด (ของจริงต้องต่อ)
  let best = pool[0], bestWaste = Infinity, bestBars = Infinity;
  for (const b of pool) {
    const bars = ceil(sumLen / b);
    const waste = bars * b - sumLen;
    if (waste < bestWaste - 1e-9 || (Math.abs(waste - bestWaste) < 1e-9 && bars < bestBars)) {
      best = b; bestWaste = waste; bestBars = bars;
    }
  }
  return { stockLen: best, bars: ceil(sumLen / best) };
}

/** คิดใบตัด 1 ชุด (1 บาน/ช่อง ตามสเปก) — sets = จำนวนชุดที่ผลิต (คูณจำนวน) */
export function computeCutList(spec: CutSpec, input: Partial<CutInput>, sets = 1): CutResult {
  const o: CutInput = { ...spec.defaults, ...input } as CutInput;
  const n = Math.max(1, sets);
  // ตัวเลือกความยาวเส้นต่อโปรไฟล์ (เว้น = spec.stockLen) — เก็บไว้รวม+เลือกต่อรหัส
  const meta = spec.profiles.map((p) => {
    const len = round1(p.len(o));
    const qty = Math.max(0, Math.round(p.qty(o))) * n;
    const code = typeof p.code === "function" ? p.code(o) : p.code;
    const stockLens = p.stockLens?.length ? p.stockLens : [spec.stockLen];
    // เส้นระดับบรรทัด (โชว์): ใช้เส้นสั้นสุดที่ตัดได้ ของโปรไฟล์นี้
    const rowStock = stockLens.filter((b) => b >= len).sort((a, b) => a - b)[0] ?? Math.max(...stockLens);
    const bars = qty > 0 && len > 0 ? ceil((len * qty) / rowStock) : 0;
    return { row: { name: p.name, code, len, qty, bars, stockLen: rowStock, note: p.note } as CutRow, stockLens };
  });
  const rows = meta.map((m) => m.row);
  // สรุปเส้นต่อรหัส — รวมยาว + ชิ้นยาวสุด + ตัวเลือกเส้น ต่อรหัส แล้วเลือกเส้นคุ้มสุด (nesting ต่อรหัส)
  const agg = new Map<string, { sumLen: number; maxCut: number; bars: Set<number> }>();
  for (const m of meta) {
    const r = m.row;
    if (!r.code || r.code === "-" || r.qty <= 0 || r.len <= 0) continue;
    const a = agg.get(r.code) ?? { sumLen: 0, maxCut: 0, bars: new Set<number>() };
    a.sumLen += r.len * r.qty;
    a.maxCut = Math.max(a.maxCut, r.len);
    m.stockLens.forEach((b) => a.bars.add(b));
    agg.set(r.code, a);
  }
  const barsByCode = [...agg.entries()]
    .map(([code, a]) => {
      const pick = pickStock(a.sumLen, a.maxCut, [...a.bars]);
      return { code, totalLenCm: round1(a.sumLen), bars: pick.bars, stockLen: pick.stockLen };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  // ฮาร์ดแวร์: จำนวนทศนิยมได้ (เช่น เทปหนุนกระจกเป็นเมตร 7.0) — ปัด 1 ตำแหน่ง ไม่ใช่จำนวนเต็ม
  const hardware = (spec.hardware ?? []).map((h) => ({ name: h.name, qty: round1(Math.max(0, h.qty(o)) * n), unit: h.unit ?? "ชิ้น" }));
  const totalBars = rows.reduce((s, r) => s + r.bars, 0);
  return { rows, barsByCode, hardware, totalBars };
}
