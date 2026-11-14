// file-calc.mjs — สูตรจากไฟล์ถอดทุนที่ยาวเกินจะเขียนเป็นนิพจน์ในสเปกสินค้า (products.mjs)
// ─────────────────────────────────────────────────────────────────────────────
// เอนจินฉีดเข้า scope ของนิพจน์เป็น `FN` → สเปกสินค้าเรียก FN.cutFromStock(...) ฯลฯ ได้
// ที่มา: ไฟล์ ถอดทุน_รวมทั้งหมด (12 พ.ย.69) ชีต "คิดทุน พื้นไม้เทียม" + "คิดทุน อลูทึบ" (บันทึกการแก้ไข ข้อ 4–31)
// ⚠ ลอกลำดับการคิดของ Excel ทีละขั้น (ROUND/INT/CEILING/MOD) — แก้แล้วต้องรัน scripts/verify-file-calc.mjs
//    ซึ่งเทียบกับผลจาก Excel จริง (scripts/fixtures/file-calc-excel.json)

/** ROUND แบบ Excel — ปัดจากเลขฐานสิบ 15 หลัก (5.405 ที่เก็บเป็น 5.40499999… ต้องได้ 5.41) */
export function xround(x, d = 0) {
  const f = 10 ** d;
  return Math.round(Number((x * f).toPrecision(15))) / f;
}
/** เลขที่ Excel "เห็น" = ปัดเหลือ 15 หลักนัยสำคัญ — Excel เทียบจริงแล้ว INT(2.8/0.4) = 7 (เลขดิบ 6.999999999999999) · พื้นไม้เทียม 6×6 ม. แผ่น 93 ไม่ใช่ 94 */
const snap = (x) => Number(Number(x).toPrecision(15));
/** INT / CEILING(x,1) แบบ Excel (ตัดเศษจากเลข 15 หลัก ไม่ใช่เลขดิบ) */
export const xint = (x) => Math.floor(snap(x));
export const xceil = (x) => Math.ceil(snap(x));
/** MOD แบบ Excel = n − d × INT(n ÷ d) */
const xmod = (n, d) => n - d * xint(n / d);

/**
 * ตัดท่อนยาว len จำนวน n ท่อน จากของยาว stock — ท่อนที่ยาวเกินใช้เต็มเส้นก่อน เศษที่เหลือเอาไปตัดแถวอื่นได้ถ้าพอ
 *   พื้นไม้เทียม B17 (แผ่น 2.8 ม.) · B18 (ตงซอยจากเหล็ก 6 ม.)
 *   =IF(OR(ROUND(MOD(len,stock),3)=0, …=stock), n×ROUND(len÷stock), n×INT(ROUND(len÷stock,6)) + CEILING(n ÷ INT(stock ÷ ROUND(MOD(len,stock),3))))
 */
export function cutFromStock(n, len, stock) {
  if (!(n > 0) || !(len > 0) || !(stock > 0)) return 0;
  const m = xround(xmod(len, stock), 3);
  if (m === 0 || m === stock) return n * xround(len / stock, 0);
  return n * xint(xround(len / stock, 6)) + xceil(n / xint(stock / m));
}

// ── อลูทึบ (ไส้บาน) ─────────────────────────────────────────────────────────
/** คีย์สีของเว็บ → ชื่อสีในชีตอลูทึบ (B8) · สีที่ชีตไม่มี = ตกไปตามหมวดค่าอบ */
const SOLID_COLOR = {
  white: "อบขาว", black: "ดำ", sahara: "เทาซาฮาร่า", sahara_black: "สีดำซาฮาร่า", aztec: "แอทแทคเกรย์",
  wood_teak: "ลายไม้สักทอง", wood_maho: "ลายไม้มะฮอกกานี", wood_whiteoak: "ลายไม้ไวท์โอ๊ค",
  special: "สีอบพิเศษ", wood_special: "สีลายไม้อบพิเศษ",
};
export function solidColor(ckey, bake) {
  if (SOLID_COLOR[ckey]) return SOLID_COLOR[ckey];
  if (bake === "woodSpecial") return "สีลายไม้อบพิเศษ";
  if (bake === "special") return "สีอบพิเศษ";
  if (bake === "sahara") return "เทาซาฮาร่า";
  if (bake === "woodStock") return "ลายไม้สักทอง";
  return "อบขาว";
}
/** ราคาลูกฟูก/เส้น 6 ม. ตามขนาด+สี — ราคาสี!B199:K201 · สีอบพิเศษ = ราคาอบขาว + เรตอบ × น้ำหนัก/เส้น (ปัดบาท) */
export function corrPrice(row, colName, BAKE) {
  if (!row) return 0;
  if (colName === "สีอบพิเศษ") return xround(row.p["อบขาว"] + (Number(BAKE && BAKE.special) || 0) * row.kg, 0);
  if (colName === "สีลายไม้อบพิเศษ") return xround(row.p["อบขาว"] + (Number(BAKE && BAKE.woodSpecial) || 0) * row.kg, 0);
  if (row.p[colName] != null) return Number(row.p[colName]) || 0;
  // row.derive = ขนาดที่ชีตราคาสีเว้นช่องราคาสีไว้ (ลูกฟูกเล็ก แถว 162 ช่อง G-J ว่าง) → ราคาอบขาว + เรตอบ × น้ำหนัก/เส้น
  //   แอทแทค = เรตสีอบพิเศษ (O162) · ลายไม้ 3 สี = เรตลายไม้อบพิเศษ (P-R162)
  if (row.derive && colName === "แอทแทคเกรย์") return xround(row.p["อบขาว"] + (Number(BAKE && BAKE.special) || 0) * row.kg, 0);
  if (row.derive && String(colName).includes("ลายไม้")) return xround(row.p["อบขาว"] + (Number(BAKE && BAKE.woodSpecial) || 0) * row.kg, 0);
  return 0;
}
/** เรตอบสีแผ่นอลูเรียบ บาท/กก. (I8) — แอทแทค/อบพิเศษ = เรตอบพิเศษ · ลายไม้ทุกแบบ = เรตลายไม้อบพิเศษ · นอกนั้น = เรตเทา */
export function flatBakeRate(colName, BAKE) {
  const B = BAKE || {};
  if (colName === "แอทแทคเกรย์" || colName === "สีอบพิเศษ") return Number(B.special) || 0;
  if (String(colName).includes("ลายไม้")) return Number(B.woodSpecial) || 0;
  return Number(B.sahara) || 0;
}
/** ราคาเส้นคาดตาราง/เส้น 6 ม. (I13:I22) — อบสีพิเศษ/อบลายไม้พิเศษ = ราคาอบขาว + เรตอบ × 0.6 กก. */
export function gridPrice(tbl, name, BAKE) {
  if (!tbl) return 0;
  if (name === "อบสีพิเศษ") return xround(tbl.p["อบขาว"] + (Number(BAKE && BAKE.special) || 0) * tbl.kg, 0);
  if (name === "อบลายไม้พิเศษ") return xround(tbl.p["อบขาว"] + (Number(BAKE && BAKE.woodSpecial) || 0) * tbl.kg, 0);
  return Number(tbl.p[name]) || 0;
}
/** ค่าเปิดตู้อบ 1 ครั้ง/งาน (B21) — อลูเรียบ แอทแทค/ลายไม้/อบพิเศษ · ลูกฟูก อบพิเศษ/ลายไม้อบพิเศษ · เส้นคาด อบพิเศษ */
export function solidOven(kind, colName, gridM, gridCol) {
  const cn = String(colName || "");
  const flat = kind === "flat" && (cn === "แอทแทคเกรย์" || cn.includes("ลายไม้") || cn === "สีอบพิเศษ");
  const corr = kind === "corr" && (cn === "สีอบพิเศษ" || cn === "สีลายไม้อบพิเศษ");
  const grid = gridM > 0 && (gridCol === "อบสีพิเศษ" || gridCol === "อบลายไม้พิเศษ");
  return (flat || corr || grid) ? 1 : 0;
}

/**
 * ลูกฟูก 2 ทาง 2 ฝั่ง — จำนวนเส้น 6 ม. (คิดทุน อลูทึบ L12 · ค่าช่วย K3:Q619)
 *   แถบกว้าง 10 ซม. วางทำมุม deg (90 = แนวตั้ง · 0 = แนวนอน) · ตัดไม่ต่อ · จัดลงเส้นแบบสลับ ยาว-สั้น (next-fit)
 *   เส้นที่ใช้ = MAX(ตัดจริง, ยาวรวม × (1 + เผื่อเสีย%) ÷ 600) · เผื่อเสีย: เฉียง 50% (L15) · 0°/90° 30% (M15)
 */
export function corrBars(wCm, hCm, pieces, deg, skewPct = 50, straightPct = 30) {
  const w = Number(wCm) || 0, h = Number(hCm) || 0, n0 = Math.max(0, Math.round(Number(pieces) || 0));
  if (!(w > 0) || !(h > 0) || !(n0 > 0)) return { bars: 0, strips: 0, pieces: 0, totalCm: 0, cutBars: 0, wasteBars: 0, longest: 0 };
  const dg = Math.min(Math.max(Number(deg) || 0, 0), 90);
  const th = dg * Math.PI / 180;                                            // L4 RADIANS
  const s = Math.sin(th), c = Math.cos(th);
  const a = Math.min(w * s, h * c);                                         // L5 ช่วงเส้นสั้น→ยาว
  const D = w * s + h * c;                                                  // L7 ความกว้างรวมตั้งฉากเส้น
  const Lmax = c < 0.000001 ? h : s < 0.000001 ? w : Math.min(w / c, h / s);   // L8 เส้นยาวสุด
  const strips = xceil(xround(D, 6) / 10);                              // L9 จำนวนเส้น/ด้าน/ชิ้น
  const sets = 2 * n0;                                                      // L10 ชุด (2 ฝั่ง × ชิ้น)
  const total = strips * sets;                                              // L11 ท่อนทั้งหมด
  const lens = [];                                                          // L20… ยาวแต่ละเส้น (ใช้ขอบยาวของแถบ)
  for (let k = 1; k <= strips; k++) lens.push(xround(a < 0.001 ? Lmax : Math.min(Lmax, Lmax * Math.min(k * 10, D - (k - 1) * 10) / a), 1));
  const sorted = [...lens].sort((x, y) => y - x);                            // M เรียงยาว→สั้น
  let used = 0, cutBars = 0, totalCm = 0;
  for (let i = 1; i <= total; i++) {                                         // N/O/P/Q สลับ ยาว-สั้น แล้วไล่ลงเส้น
    const rank = xceil((i % 2 === 1 ? xceil(i / 2) : total + 1 - i / 2) / sets);
    const L = sorted[rank - 1];
    totalCm += L;
    if (i === 1 || used + L > 600) { cutBars += 1; used = L; } else used += L;
  }
  const pct = (dg === 0 || dg === 90) ? straightPct : skewPct;
  const wasteBars = xceil(totalCm * (1 + pct / 100) / 600);              // L18
  return { bars: Math.max(cutBars, wasteBars), strips, pieces: total, totalCm, cutBars, wasteBars, longest: Lmax };
}

/**
 * แผ่น 120×240 ที่ต้องใช้ปิดชิ้นขนาด w×h จำนวน n ชิ้น (คอมโพสิต/อลูเรียบ · I25:I35)
 *   ชิ้นใหญ่กว่าแผ่น = แบ่งเป็นชิ้นย่อยแล้วต่อ · ลองวางแผ่นตั้ง/นอน เอาแบบที่ใช้น้อยสุด
 *   แล้วไม่ต่ำกว่า พื้นที่ × (1 + เผื่อเสีย%) ÷ 2.88 ตร.ม./แผ่น (I33 = 30%)
 */
export function sheetCount(wCm, hCm, n, wastePct = 30) {
  const w = Number(wCm) || 0, h = Number(hCm) || 0, q = Number(n) || 0;
  if (!(w > 0) || !(h > 0) || !(q > 0)) return 0;
  const a1 = xceil(w / 120), b1 = xceil(h / 240);
  const per1 = Math.max(1, xint(xround(120 / (w / a1), 6)) * xint(xround(240 / (h / b1), 6)));
  const a2 = xceil(w / 240), b2 = xceil(h / 120);
  const per2 = Math.max(1, xint(xround(240 / (w / a2), 6)) * xint(xround(120 / (h / b2), 6)));
  const cut = Math.min(xceil(q * a1 * b1 / per1), xceil(q * a2 * b2 / per2));
  return Math.max(cut, xceil(q * w * h / 10000 * (1 + wastePct / 100) / 2.88));
}

export const FILE_CALC = { xround, ceil: xceil, int: xint, cutFromStock, solidColor, corrPrice, flatBakeRate, gridPrice, solidOven, corrBars, sheetCount };
