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
  boxSide?: string;  // SlimLux: กล่องสั้น (บานกลาง) ด้าน "ซ้าย" | "ขวา" — เลือก SKU กล่องสั้นซ้าย/ขวา
  sashMode?: string; // SlimLux: "อิสระ" | "ลากจูง" | "เปิดคู่กลาง"
  beam?: string;     // SlimLux: คาน "1×2".."4×4"
  handle?: string;   // SlimLux: "X-J" | "ไม่มี" | "อื่นๆ"
  handle_other?: string; // SlimLux: ชื่อมือจับที่พิมพ์เองเมื่อ handle="อื่นๆ"
  receiverBox?: string; // SlimLux: เสารับบาน (เลือกกล่องเอง) เช่น "1×4+1×4" (รองรับกล่องผสมด้วย "+")
  box?: string;      // บานติดตาย: ชนิดกล่อง
  L?: number;        // เฟี้ยมยูโร: จำนวนบานพับซ้าย (ที่เหลือ = ขวา)
  glass?: number;    // ความหนากระจก (มม.) — เลือกรหัสคิ้วตบกระจก (เฟี้ยม) · มู่ลี่ = -1
  fold2?: string;    // SMS240 เฟี้ยม: "แบ่งบาน" (พับ 2 กองชนกลาง) | "เดี่ยว" — เลือกแถว LUT อุปกรณ์
  cutAngle?: string; // SMS240 เฟี้ยม: "45°" | "90°" (default 45°) — มุมตัดขวางบน/ล่าง+คิ้ว+เสากุญแจ (เสา/บังใบ/มือจับ ไม่ผูกมุม)
  color?: string;    // สีอลู (token สต็อก เช่น "ดำ"/"อบขาว") — ไม่กระทบความยาวตัด · ใช้ตอนจับคู่/หักสต็อกต่อสี
  // เฟี้ยมยูโรเข้ามุม (CORNER) — โครงต่างจากบานเดี่ยว: ใช้ WA/WB/nA/nB แทน W/N (ช่อง W/N ในจอไม่ใช้)
  WA?: number;       // กว้างผนัง A (ซม.)
  WB?: number;       // กว้างผนัง B (ซม.)
  nA?: number;       // จำนวนบานฝั่ง A
  nB?: number;       // จำนวนบานฝั่ง B
  openSide?: string; // ฝั่งที่เปิดบาน "A" | "B" (ฝั่งเปิดหักลึกกว่า)
  // ประตู (PC Door / โซลิด / วงกบไม้)
  split?: string;    // PC Door: "แบ่ง 2" | "แบ่ง 4"
  sill?: string;     // ธรณี — PC/วงกบไม้: "มีธรณี"|"ไม่มีธรณี" · โซลิด: "มี"|"ไม่มี"
  doorSplit?: string;// แบ่งบาน — โซลิด: "แม่-ลูก"|"เท่ากัน" · วงกบไม้: "แม่ลูก"|"เท่ากัน"
  motherW?: number;  // บานแม่ กว้าง (ซม.) เมื่อแบ่งแม่-ลูก
  // ประตูรั้ว (gate) + บานระแนง
  slatDir?: string;  // แนวระแนง/เกล็ด "ตั้ง" | "นอน"
  slatType?: string; // ชนิดใบ "ระแนง" | "ระแนงสลับ"
  showA?: string;    // ด้านโชว์ A
  showB?: string;    // ด้านโชว์ B (โหมดสลับ)
  gap?: number;      // ช่องห่าง (ซม.)
  aRun?: number;     // สลับ: A กี่ท่อน/ชุด
  bRun?: number;     // สลับ: B กี่ท่อน/ชุด
  boxA?: string;     // บานระแนง: กล่อง A (label)  · boxB = กล่อง B
  boxB?: string;
  gapA?: number;     // บานระแนง: ระยะห่าง A (ซม.) · gapB = ระยะห่าง B
  gapB?: number;
  // หลังคา / กันสาด / จั่ว / กลาสเฮ้าส์
  sheet?: string;    // ชนิดแผ่น (ไวนิล/ดีไลท์/เมทัลชีท/โพลีตัน/ชินโคร์) → ระยะจันทันสูงสุด + กว้าง/แผ่น
  P?: number;        // กันสาดเพิง: ยื่น (ซม.)
  deg?: number;      // กันสาดเพิง: องศาเอียง (ยื่นเอียง = P/cos)
  purlin?: string;   // แป "แปคู่" | "แปเดี่ยว"
  roofEnd?: string;  // ปลายหลังคา "รางน้ำ" | "ปิดปลาย" | "ยื่นปลาย" (จั่ว: "รางน้ำ" | "ปล่อยปลาย")
  shape?: string;    // กันสาด_L: "ตัวแอล" | "เพิงตรง"
  LA?: number;       // กันสาด_L: ยาวผนัง A · LB = ยาวผนัง B
  LB?: number;
  PA?: number;       // กันสาด_L: ยื่น A · PB = ยื่น B
  PB?: number;
  drop?: number;     // กันสาด_L: สูง (ตก)
  hipMode?: string;  // กันสาด_L: มุมตะเข้ "ยุบ" | "นูน"
  D?: number;        // จั่ว/กลาสเฮ้าส์: ลึก/ยาวทิศลาด
  ridgeH?: number;   // จั่ว: สูงสัน
  hiH?: number;      // กลาสเฮ้าส์(เดี่ยว/หลายด้าน): สูงฝั่งสูง (ชนบ้าน) · loH = สูงฝั่งต่ำ (หน้า) — ใช้ร่วมกันทุกด้าน (สูงเท่ากันทั้งหลัง)
  loH?: number;
  // กลาสเฮ้าส์หลายด้าน (GLASSHOUSE_MULTI): สูงสุด 6 ด้าน — ด้านที่ side{n}W ว่าง/0 = ไม่ใช้งาน
  //   กว้าง(side{n}W)+ยื่น(side{n}P) ต่อด้าน · รอยต่อ joint{n} (n=1..5) ระหว่างด้าน n กับ n+1: "นูน"|"เว้า"|"ชนผนัง"
  side1W?: number; side1P?: number;
  side2W?: number; side2P?: number;
  side3W?: number; side3P?: number;
  side4W?: number; side4P?: number;
  side5W?: number; side5P?: number;
  side6W?: number; side6P?: number;
  joint1?: string; joint2?: string; joint3?: string; joint4?: string; joint5?: string;
  sys?: string;      // รางบนเฟรมปกติ: ระบบ "SMS" | "ยูโร"
  // ⑤ อุปกรณ์ — มือจับ (เลื่อน/ประตู): เลือกยี่ห้อ+สี+ชนิดซ้าย/ขวา → ได้ SKU + จำนวนถูก (ตาราง lookup ในไฟล์)
  handleBrand?: string; // "เมโทร" | "Align"
  handleColor?: string; // "อบขาว" | "ดำ"
  handleL?: string;     // มือจับ ซ้าย: "กุญแจ+ล็อค" | "ล็อค+ดัมมี่" | "ล็อค" | "ดัมมี่+ดัมมี่" | "ดัมมี่" | "Digital lock" | "-" | "อื่นๆ"
  handleR?: string;     // มือจับ ขวา (เลื่อนบานเดียว/ลากจูง = ใช้ handleL อย่างเดียว)
  handleL_other?: string; // ชื่อมือจับซ้ายที่พิมพ์เองเมื่อ handleL="อื่นๆ"
  handleR_other?: string; // ชื่อมือจับขวาที่พิมพ์เองเมื่อ handleR="อื่นๆ"
  // ⑤ อุปกรณ์ บานโซลิด/เปิด (เงื่อนไข SKU): สีอุปกรณ์ · ชนิดตลับกุญแจ · ทิศเปิด · มือจับใบแม่/ลูก (คิงโบ/Cmech)
  hwColor?: string;     // "ดำ" | "ขาว" — สีอุปกรณ์ (บานพับ/มือจับคิงโบ พลิก SKU ดำ↔ขาว)
  lockType?: string;    // "ล็อคปกติ" | "มัลติพ้อยล็อค"
  openDir?: string;     // "เปิดออก" | "เปิดเข้า" (ไส้กุญแจ)
  motherHandle?: string;// มือจับใบแม่: "คิงโบ ล็อค+กุญแจ" | "คิงโบ ดัมมี่+ดัมมี่" | "Cmech กุญแจ+ล็อค" | "Cmech ล็อค+ดัมมี่" | "Cmech ดัมมี่+ดัมมี่" | "อื่นๆ" (SOLID_DOOR ยังใช้ "Cmech" เดี่ยว)
  childHandle?: string; // มือจับใบลูก: "ไม่ใส่" | "คิงโบ ล็อค+กุญแจ" | "คิงโบ ดัมมี่+ดัมมี่" | "Cmech" | "อื่นๆ"
  motherHandle_other?: string; // ชื่อมือจับใบแม่ที่พิมพ์เองเมื่อ motherHandle="อื่นๆ"
  childHandle_other?: string;  // ชื่อมือจับใบลูกที่พิมพ์เองเมื่อ childHandle="อื่นๆ"
  // FUJI บานเปิด (FUJI_SWING): มุ้ง/กันสาด เป็นตัวเลือกเสริม (บางตัวมี บางตัวไม่มี)
  //   ⚠ ฟิลด์ mesh ใช้ร่วม 2 ความหมาย: FUJI_SWING = "ไม่ใส่"|"ใส่" · SMS เลื่อน (FREE/CENTER/TOW) = "ไม่มี"|"เฟรมเล็ก"|"เฟรมใหญ่" (ระบบมุ้งเต็มรูปแบบ)
  mesh?: string;    // FUJI_SWING: "ไม่ใส่" | "ใส่" — ใส่ = เพิ่มเสามุ้ง F7944 + คิ้วมุ้ง F7949
  awning?: string;  // "ไม่ใส่" | "ใส่" — ใส่ = เพิ่มกันสาด F7948
  // SMS เลื่อน (FREE/CENTER/TOW): ระบบมุ้ง (ตบรางล้อ + มุ้งเฟรมเล็ก/ใหญ่)
  meshCount?: number;      // จำนวนมุ้ง (FREE/TOW ผู้ใช้กรอกเอง · CENTER ตายตัว=2 ไม่ใช้ฟิลด์นี้)
  meshHandleBrand?: string; // ยี่ห้อมือจับมุ้ง (เฉพาะ "เฟรมใหญ่")
  meshHandleL?: string;     // มือจับมุ้ง ซ้าย (เฉพาะ "เฟรมใหญ่")
  meshHandleR?: string;     // มือจับมุ้ง ขวา (เฉพาะ "เฟรมใหญ่")
  // กันสาดเพิง (AWNING): จันทันรวม override (ช่างกรอกเอง)
  rakeTotal?: number; // จันทันรวม (เส้น) — 0/ว่าง = อัตโนมัติ (⌈W/max⌉+1) · >0 = ใช้ค่านี้แทน
  // FUJI บานยก (FUJI_HUNG): สีมือจับ + กระจก
  hungHandleColor?: string; // สีมือจับบานยก "ดำ"|"ขาว"|"เทาซาฮาร่า"|"มะฮอกกานี"|อื่นๆ (รหัสผู้ผลิต 06-008-xx · noStock)
};

// ctx ให้สูตรฮาร์ดแวร์อ้าง "ความยาว/จำนวน" ของโปรไฟล์ตามชื่อได้ (ตรงกับที่ Excel อ้างเซลล์ในตาราง ④ ใบตัด)
//   len(name) = ยาวตัดต่อชิ้น (ซม.) ของโปรไฟล์แรกที่ชื่อตรง · qty(name) = จำนวนชิ้น (ยังไม่คูณ sets)
export type HardwareCtx = { len: (name: string) => number; qty: (name: string) => number };

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
  // ⑤ อุปกรณ์/ฮาร์ดแวร์ — sku = รหัสสโตร์ JR##### (ผูกสต็อก · ตัดสต็อก+เทียบคงเหลือได้)
  //   sku เป็นฟังก์ชันได้ (มือจับ: ยี่ห้อ+ชนิด+สี → SKU ต่างกัน) · "" = ยังไม่ผูกรหัส (โชว์อย่างเดียว)
  //   noStock = true → ไม่ตัดสต็อก (เช่น Digital lock ซื้อแยก) · unit default "ชิ้น"
  hardware?: {
    name: string | ((o: CutInput) => string);
    qty: (o: CutInput, ctx: HardwareCtx) => number;
    sku?: string | ((o: CutInput) => string);
    unit?: string;
    note?: string;
    noStock?: boolean;
  }[];
};

export type CutRow = {
  name: string; code: string; len: number; qty: number; bars: number; stockLen: number; note?: string;
};
export type HardwareRow = { name: string; sku: string; qty: number; unit: string; note?: string; noStock?: boolean };
export type CutResult = {
  rows: CutRow[];
  // สรุปเส้นต่อรหัส (รากของ BOQ + ตัดสต็อก) — stockLen = ความยาวเส้นที่เลือกใช้จริงต่อรหัส (คุ้มสุด)
  barsByCode: { code: string; bars: number; totalLenCm: number; stockLen: number }[];
  hardware: HardwareRow[];
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
  // ctx: ให้สูตรฮาร์ดแวร์อ้างความยาว/จำนวนต่อชิ้นของโปรไฟล์ (per-unit ก่อนคูณ sets) ตามชื่อ — ตรง Excel ตาราง ④
  const lenOf = (name: string) => meta.find((m) => m.row.name === name)?.row.len ?? 0;
  const qtyOf = (name: string) => (meta.find((m) => m.row.name === name)?.row.qty ?? 0) / n; // row.qty คูณ sets แล้ว → หารกลับ
  const hwCtx: HardwareCtx = { len: lenOf, qty: qtyOf };
  // ฮาร์ดแวร์: จำนวนทศนิยมได้ (เช่น สักหลาด/เทปหนุนกระจกเป็นเมตร 7.0) — ปัด 1 ตำแหน่ง ไม่ใช่จำนวนเต็ม
  //   sku/name เป็นฟังก์ชันได้ (มือจับขึ้นกับยี่ห้อ+สี) · รวมเฉพาะรายการที่ qty>0 (ตัวเลือกที่ไม่ใช้ = ซ่อน)
  const hardware: HardwareRow[] = (spec.hardware ?? [])
    .map((h) => ({
      name: typeof h.name === "function" ? h.name(o) : h.name,
      sku: (typeof h.sku === "function" ? h.sku(o) : h.sku) ?? "",
      qty: round1(Math.max(0, h.qty(o, hwCtx)) * n),
      unit: h.unit ?? "ชิ้น",
      note: h.note,
      noStock: h.noStock,
    }))
    .filter((h) => h.qty > 0);
  const totalBars = rows.reduce((s, r) => s + r.bars, 0);
  return { rows, barsByCode, hardware, totalBars };
}
