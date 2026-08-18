/**
 * เครื่องคิดราคางานพื้น / งานผู้รับเหมา (ช่างเพยาว์) — แกนคำนวณล้วน ไม่มี type
 * (แพตเทิร์นเดียวกับ calculator40/engine.mjs — verify script โหลดไฟล์นี้ตรง ๆ ได้)
 *
 * ⚠ แก้ไฟล์นี้ต้องรัน `node scripts/verify-floor.mjs` เสมอ
 *   หมุด: ใบตรวจขนาดทดสอบ 10 เคส + ใบเสนอจริงคุณพิทยารัตน์ Rev03
 *
 * ── ที่มาของสูตร (คู่มือใช้งาน_คิดราคาผู้รับเหมา_JR.docx + ใบตรวจขนาด) ──
 *   แถวเข็มต่อด้าน = ปัดขึ้น((ด้าน − 1.0) ÷ 4) + 1     [−1.0 = คานยื่นปลาย 0.5 ม. หัวท้าย]
 *   เสาเข็มรวม    = แถวด้านกว้าง × แถวด้านยาว
 *   คานยาวรวม     = (ยาว × แถวกว้าง) + (กว้าง × แถวยาว)   ← กริดเต็ม ไม่ใช่แค่รอบนอก
 *
 * ── กฎที่เจ้าของเคาะเพิ่ม 6 ส.ค.2569 ──
 *   1. เข็มห่างกันขั้นต่ำ 1.0 ม. — เดิมสูตรให้ 0.20 ม. ได้ (เคส 1.2×8.0) ลงจริงไม่ได้
 *      แก้โดย "ลดระยะร่นจากขอบ" ไม่ใช่ยุบแถว → จำนวนเข็ม/ราคาเท่าเดิม เปลี่ยนแค่ตำแหน่ง
 *   2. ด้านแคบ ≤ 1.0 ม. บังคับ 2 แถว — เคส 1.0×5.0 จึงเปลี่ยนจาก 2 → 4 ต้น
 *      (เป็นข้อที่ไฟล์ PDF ยกเป็นคำถามไว้เอง)
 *
 * ── ราคาที่ยืนยันกับใบจริงแล้ว ──
 *   เข็ม I18 11,000/ต้น · ขุด 2,000/หลุม · ฟุตติ้ง 2,500/หลุม → ตรงเป๊ะกับใบคุณพิทยารัตน์
 *   คาน 2,400/ม. → ใบจริงใช้ 2,200 แต่เจ้าของสั่ง "2400 ตามเอกเซล"
 */

export const CANTILEVER = 0.5; // ระยะร่นเข็มจากขอบพื้น (คานยื่นออกไปรับ)
export const MAX_SPAN = 4;     // เข็มห่างกันได้ไม่เกิน (ม.)
export const MIN_SPAN = 1;     // เข็มห่างกันต่ำกว่านี้ไม่ได้ (ม.) — เคาะ 6 ส.ค.69

/** ราคาต่อหน่วยส่วนโครงสร้าง — ตรงกับ "ประเมินราคาเบื้องต้นงานพื้นอัพเดท.xlsx" ชีต "ราคาอ้างอิง" */
export const RATE = {
  dig: 2000,      // งานขุด/ตัดหัวเข็ม /ต้น (=หลุม)
  footing: 2500,  // งานฟุตติ้ง /หลุม
  // งานคาน — เจ้าของแยกเป็น "ค่าวัสดุ + ค่าแรง" (18 ส.ค.69) · เดิมเหมารวม 2,400/ม.
  //   ตอนนี้ = 1,200 + 1,000 = 2,200/ม. (ตรงกับใบเสนอจริงคุณพิทยารัตน์ที่ใช้ 2,200)
  beam_material: 1200, // ค่าวัสดุคาน /เมตร
  beam_labor: 1000,    // ค่าแรงคาน /เมตร
  get beam() { return this.beam_material + this.beam_labor; }, // รวม /เมตร (2,200)
};

export const PILE_TYPES = [
  { key: "i18", label: "ไมโครไพล์ I18", price: 11000, note: "มาตรฐาน · บ้าน 1 ชั้น" },
  { key: "i22", label: "ไมโครไพล์ I22", price: 12000, note: "บ้าน 2 ชั้น" },
  { key: "hex", label: "เข็มหกเหลี่ยม", price: 1200, note: "งานเบา · รับถังน้ำ/ทางเดิน" },
  { key: "steel", label: "เข็มเหล็ก", price: 30000, note: "" },
  // ลูกค้าลงเข็มไว้เองแล้ว (เจ้าของสั่ง 6 ส.ค.69) — ไม่ตอกเพิ่ม เหลือแค่ค่าตัดหัวเข็ม 2,000/ต้น
  // (= RATE.dig เท่าเดิม) · ฟุตติ้ง/คาน/พื้น คิดเหมือนทุกเคส
  { key: "existing", label: "ใช้เข็มเดิมของลูกค้า", price: 0, note: "ไม่ตอกเพิ่ม · คิดค่าตัดหัวเข็ม 2,000/ต้น", existing: true },
];

export const pileType = (key) => PILE_TYPES.find((p) => p.key === key) ?? PILE_TYPES[0];

/** เคส "ลูกค้ามีเข็มอยู่แล้ว" — ไม่มีบรรทัดค่าตอกเข็มบนใบ */
export const isExistingPile = (key) => !!pileType(key).existing;

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** จำนวนแถวเข็มของด้านหนึ่ง (ด้าน ≤ 1 ม. บังคับ 2 แถว) */
export function rowsFor(side) {
  if (side <= 1.0) return 2;
  return Math.ceil((side - CANTILEVER * 2) / MAX_SPAN) + 1;
}

/**
 * วางเข็มบนด้านหนึ่ง — เริ่มจากร่นขอบ 0.5 ม.
 * ถ้าได้ระยะห่าง < 1 ม. ให้ "ขยับออกจากกัน" (ลดระยะร่น) จนได้ 1 ม. แต่ห้ามล้นออกนอกพื้น
 */
export function layoutAxis(side) {
  const rows = rowsFor(side);
  if (rows <= 1) return { rows: 1, span: 0, inset: side / 2, positions: [side / 2], tooTight: false };
  const gaps = rows - 1;
  const byDefault = (side - CANTILEVER * 2) / gaps; // ร่นขอบ 0.5 ตามสูตรเดิม
  const widest = side / gaps;                        // ร่นขอบ 0 = กว้างสุดที่เป็นไปได้
  const span = Math.min(widest, Math.max(byDefault, MIN_SPAN));
  const inset = (side - span * gaps) / 2;
  return {
    rows, span, inset,
    positions: Array.from({ length: rows }, (_, i) => inset + i * span),
    tooTight: span < MIN_SPAN - 1e-9,
  };
}

/** คิดผังเข็ม+คานจาก กว้าง × ยาว (เจ้าของสั่ง: กรอกแค่ 2 ค่านี้ ที่เหลือระบบคิดเอง) */
export function planFloor(width, length) {
  const w = Math.max(0.1, Number(width) || 0.1);
  const l = Math.max(0.1, Number(length) || 0.1);
  const aw = layoutAxis(w);
  const al = layoutAxis(l);
  return {
    width: w, length: l, area: round2(w * l),
    rowsW: aw.rows, rowsL: al.rows,
    piles: aw.rows * al.rows,
    beamLen: round2(l * aw.rows + w * al.rows),
    xs: al.positions, ys: aw.positions,
    spanW: aw.span, spanL: al.span,
    insetW: aw.inset, insetL: al.inset,
    tooTight: aw.tooTight || al.tooTight,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ค่าเริ่มต้นงานเหมา — "ยิ่งพื้นที่เล็ก ราคาต่อ ตร.ม. ยิ่งแพง" (เจ้าของยืนยัน 6 ส.ค.69)
//  ค่าที่ได้เป็นแค่ "ค่าตั้งต้น" — แก้ทับได้ทุกบรรทัดบนหน้าจอ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ไล่ระดับราคาต่อ ตร.ม. จากปลายสูง (พื้นที่เล็ก) ลงปลายต่ำ (พื้นที่ใหญ่)
 * ค่าตั้งต้น 10 → 30 ตร.ม. : เจ้าของเคาะ 7 ส.ค.69 ว่า **"30 ตร.ม. คือใหญ่"**
 * ⚠ 18 ส.ค.69: กระเบื้อง/ฝ้า เปลี่ยนเป็น "ราคาตัวเดียว" แล้ว → เหลือแค่ rampRate/รื้อสกัดที่ใช้ตัวนี้
 */
export function taperRate(area, hi, lo, aMin = 10, aMax = 30) {
  if (area <= aMin) return hi;
  if (area >= aMax) return lo;
  return Math.round(hi - (hi - lo) * ((area - aMin) / (aMax - aMin)));
}

/**
 * ไล่ระดับ "ราคาเหมาทั้งงาน" ขึ้นตามพื้นที่ (เล็ก→ถูก · ใหญ่→แพง)
 * เป็นตัวไล่ระดับตัวเดียวกับ taperRate แค่สลับปลาย — แยกชื่อไว้กันอ่านสูตรผิดทิศ
 *   taperRate = ราคา "ต่อ ตร.ม." ยิ่งใหญ่ยิ่งถูก · rampRate = ราคา "เหมาทั้งงาน" ยิ่งใหญ่ยิ่งแพง
 */
export const rampRate = (area, atMin, atMax, aMin, aMax) => taperRate(area, atMin, atMax, aMin, aMax);

export const suggest = {
  // ═══ ค่าแนะนำ = "ราคาผู้รับเหมา (ค่าแรง) ราคาตัวเดียว" จากชีตเปรียบเทียบ 5 งาน (18 ส.ค.69) ═══
  //   คุณพิมพ์พรรณ/อริน/โชติกา/ลีฟ/พิทยารัตน์ · วัสดุแยกตามขอบเขตงาน (ไม่รวมในราคานี้)
  //   เดิมไล่ระดับตามพื้นที่ → เจ้าของเคาะใช้ "ราคาตัวเดียว" ต่อรายการ (แก้ทับได้ทุกช่อง)
  /** ปูกระเบื้อง (ค่าแรง) 850 /ตร.ม. — เดิมไล่ 500–800 (ช่วงจริง 850–1,730) */
  tile: () => 850,
  /** ฝ้าเพดาน 1,100 /ตร.ม. — เดิมไล่ 1,500–2,500 (ช่วงจริง 1,000–1,550) */
  ceiling: () => 1100,
  /** ก่ออิฐ+ฉาบ 1,100 /ตร.ม. — เดิม 1,000 (ใบจริงใช้ 1,100) */
  wall: () => 1100,
  /** เทพื้นคอนกรีต 10 ซม. 1,500 /ตร.ม. */
  floor: () => 1500,
  /** ทรายถม เหมา 10,000 /งาน — เดิมสูตรเชิงเส้น (ช่วงจริง 8,500–12,500) */
  sand: () => 10000,
  /**
   * งานไฟฟ้า — คิดต่อจุด · คง 1,200/จุด (เดินท่อร้อยสายไฟพร้อมอุปกรณ์เต็มสโคป)
   * ชีตใหม่แยก เต้ารับ/สวิตช์ 500/จุด (เฉพาะจุดอุปกรณ์) + เหมารวม 600/ตร.ม. — คนละสโคป
   */
  electric: () => 1200,
  /**
   * รื้อสกัดพื้น — "ราคาเหมาทั้งงาน" ไม่ใช่ต่อ ตร.ม. → พื้นที่มากขึ้นต้องแพงขึ้นเรื่อย ๆ
   * (เจ้าของเคาะ 7 ส.ค.69 · ของเดิมไล่ลงในแต่ละช่วงแล้วเด้งขึ้นตอนข้ามช่วง
   *  ทำให้รื้อ 15 ตร.ม. = 13,500 แพงกว่ารื้อ 30 ตร.ม. = 11,000 ซึ่งผิด)
   * ต่อช่วงตามไฟล์ "ราคาอ้างอิง" ให้ปลายชนกันพอดี ไม่มีรอยเด้ง:
   *   0–10 ตร.ม. (แย๊ก)            8,500 → 11,000
   *   10–30 ตร.ม. (แย๊กหนัก/แบคโฮ) 11,000 → 14,000
   *   30–80 ตร.ม. (แบคโฮ/โรงจอดรถ) 14,000 → 16,000  · เกิน 80 ตันที่ 16,000 (เพดานในไฟล์)
   */
  demolish: (area) => {
    const r500 = (n) => Math.round(n / 500) * 500;
    if (area <= 10) return r500(rampRate(area, 8500, 11000, 0, 10));
    if (area <= 30) return r500(rampRate(area, 11000, 14000, 10, 30));
    return r500(rampRate(area, 14000, 16000, 30, 80));
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  รายการเริ่มต้นบนใบเสนอ
// ═══════════════════════════════════════════════════════════════════════════

const mk = (name, qty, unit, unitPrice, source, material = null, labor = null) => ({
  name, qty, unit,
  material_price: material, labor_price: labor,
  unit_price: round2(unitPrice), line_total: round2(qty * unitPrice),
  remark: "", source,
});

/**
 * รายการตั้งต้นจากผังพื้น
 *   source='auto'    = ส่วนโครงสร้าง — พิสูจน์กับใบจริงแล้วว่าสูตรตรง
 *   source='suggest' = ค่าแนะนำจากช่วงราคา — ตั้งใจให้แก้ทับ
 * ทุกบรรทัดแก้/ลบได้ และเพิ่มรายการเองได้ไม่จำกัดที่หน้าจอ
 */
export function draftItems(plan, pileKey, opts) {
  const pile = pileType(pileKey);
  const o = { sand: true, floor: true, tile: true, ...(opts ?? {}) };
  const existing = !!pile.existing;
  // จำนวนเข็ม — ยึด opts.piles ถ้าเจ้าของกรอกแก้เอง (นับของจริงหน้างาน) ไม่งั้นใช้ที่ระบบคิดจากผัง
  const nOverride = Number(o.piles);
  const piles = Number.isFinite(nOverride) && nOverride > 0 ? Math.round(nOverride) : plan.piles;
  const out = [
    // ลูกค้าลงเข็มไว้เองแล้ว → ไม่มีบรรทัด "ค่าตอกเข็ม" (ใส่บรรทัด 0 บาทบนใบดูแปลก)
    ...(existing ? [] : [mk(`งานตอกเข็ม${pile.label}`, piles, "ต้น", pile.price, "auto", pile.price, null)]),
    // ข้อ 1 — ปริมาณ = จำนวนต้น/หลุม · ค่าแรง 2,000/ต้น (เจ้าของสั่ง 18 ส.ค.69 · เดิมเหมา 1 งาน)
    mk(
      existing
        ? "งานขุดหลุมตัดหัวเข็มเดิม (ลูกค้าลงเข็มไว้แล้ว)"
        : "งานขุดหลุมตัดหัวเข็ม",
      piles, existing ? "ต้น" : "หลุม", RATE.dig, "auto", null, RATE.dig,
    ),
    // ข้อ 2 — ปริมาณ = จำนวนหลุม · ค่าแรง 2,500/หลุม (เดิมเหมา 1 งาน)
    mk(
      "งานผูกเหล็กเข้าแบบเทฟุตติ้ง ขนาด 50×50×50 ซม. ใช้เหล็ก DB12 mm. ใช้ปูนคอนกรีตกำลังอัด 280 ksc",
      piles, "หลุม", RATE.footing, "auto", null, RATE.footing,
    ),
    // ข้อ 3 — คาน แยกค่าวัสดุ 1,200 + ค่าแรง 1,000 /เมตร (เดิมเหมารวม 2,400)
    mk(
      "งานผูกเหล็กเข้าแบบเทคาน ขนาด 20×40 ซม. ใช้เหล็ก DB12 mm. ใช้ปูนคอนกรีตกำลังอัด 280 ksc",
      plan.beamLen, "เมตร", RATE.beam, "auto", RATE.beam_material, RATE.beam_labor,
    ),
  ];
  if (o.sand) out.push(mk("งานปรับพื้นอัดทราย", 1, "งาน", suggest.sand(plan.area), "suggest", null, suggest.sand(plan.area)));
  if (o.floor) out.push(mk(
    "งานผูกเหล็กเทพื้น หนา 10 ซม. ใช้เหล็ก RB9 mm. ใช้ปูนคอนกรีตกำลังอัด 280 ksc",
    plan.area, "ตร.ม.", suggest.floor(), "suggest",
  ));
  if (o.tile) out.push(mk(
    "งานปูกระเบื้องพื้นพร้อมปูนทราย (ไม่รวมกระเบื้อง/ลูกค้าจัดซื้อ)",
    plan.area, "ตร.ม.", suggest.tile(plan.area), "suggest",
  ));
  return out;
}

/** รายการที่มักเพิ่มเอง — ปุ่มลัดบนหน้าจอ (กดแล้วเติมบรรทัดพร้อมราคาแนะนำ) */
export function quickAdds(area) {
  return [
    { label: "ผนังก่ออิฐ", item: mk('งานตั้งเสาเหล็ก 3"×3"×3" (ชุบซิงค์) ก่ออิฐ เทเอ็น จับเซี้ยม ฉาบปูน ใช้อิฐมวลเบา', area, "ตร.ม.", suggest.wall(), "manual") },
    { label: "รื้อสกัดพื้นเดิม", item: mk("งานสกัดพื้นเดิมออก", 1, "งาน", suggest.demolish(area), "manual", null, suggest.demolish(area)) },
    { label: "งานไฟฟ้า (ต่อจุด)", item: mk("งานเดินท่อร้อยสายไฟ พร้อมอุปกรณ์", 1, "จุด", suggest.electric(), "manual") },
    { label: "ฝ้าเพดาน", item: mk("งานติดตั้งฝ้าเพดาน", area, "ตร.ม.", suggest.ceiling(area), "manual") },
    { label: "ทาสี", item: mk("งานทาสี+สกิมผนัง ภายนอก-ภายใน (รวมสี)", 1, "งาน", 12000, "manual", null, 12000) },
    { label: "ว่าง (พิมพ์เอง)", item: mk("", 1, "งาน", 0, "manual") },
  ];
}

/** หมายเหตุท้ายใบ — ลอกจากใบจริงของช่าง (แก้ได้ต่อใบ) */
export const DEFAULT_FOOTER_NOTES = [
  "นอกเหนือจากรายการที่เสนอจะคิดเป็นงานเพิ่ม ต้องทำราคาก่อนดำเนินการ",
  "ใบเสนอราคานี้มีอายุ 30 วัน นับจากวันที่ออกเอกสาร ทางช่างผู้รับจ้างขอสงวนสิทธิ์ในการเปลี่ยนแปลงราคาและเงื่อนไขภายหลังจากระยะเวลาดังกล่าว",
  "ในกรณีตอกเข็มหากมีการทรุดตัวหรือแตกร้าวของกำแพงหรือพื้นอันไม่ได้เกิดจากทางช่างผู้รับจ้างทุกกรณี ทางช่างผู้รับจ้างจะไม่รับผิดชอบใด ๆ ทั้งสิ้น",
  "หากมีการชำระเงินมัดจำแล้ว ขอเรียนแจ้งว่าทางเราขอสงวนสิทธิ์ในการคืนเงินมัดจำในทุกกรณี หากลูกค้ามีความประสงค์จะยกเลิกรายการทั้งหมด",
];

/** ผู้รับจ้างเริ่มต้น — ช่างเพยาว์ (จากใบเสนอ/ใบเบิกงวดจริง) */
export const DEFAULT_CONTRACTOR = {
  name: "นายเพยาว์ สุขอุทัย",
  phone: "089-035-8526",
  bank_name: "ธนาคารไทยพาณิชย์",
  bank_acc: "426-197442-8",
};

/**
 * ชื่อเอกสาร/ชื่อไฟล์ — "ใบเสนอราคางานพื้น คุณสมชาย" · แก้แล้วต่อท้าย " rev1" ตามจำนวนครั้งที่แก้
 * ใช้ที่เดียวทั้ง ชื่อไฟล์ Excel · ชื่อไฟล์ PDF (document.title) · หัวเรื่องหน้าพิมพ์ — จะได้ไม่เพี้ยนกัน
 */
export function quoteFileName(customerName, rev) {
  const who = String(customerName ?? "").trim();
  const r = Number(rev) || 0;
  // กันอักขระที่ตั้งชื่อไฟล์ไม่ได้ (\ / : * ? " < > |) — ที่เหลือคงไว้ ภาษาไทยใช้ได้ปกติ
  const safe = who.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  // ยุบช่องไฟซ้ำอีกรอบ — กันเคสไม่มีชื่อลูกค้าแล้วได้ "ใบเสนอราคางานพื้น  rev1" (เว้นวรรคซ้อน)
  return `ใบเสนอราคางานพื้น ${safe}${r > 0 ? ` rev${r}` : ""}`.replace(/\s+/g, " ").trim();
}

/** ผลรวมใบ = ผลบวก line_total ทุกรายการ (ไม่มี VAT — ตามฟอร์มช่าง) */
export const sumItems = (items) =>
  round2((items ?? []).reduce((a, it) => a + (Number(it.line_total) || 0), 0));

/** ชื่อหมวดที่มีอยู่ เรียงตามที่ปรากฏบนใบ (ไม่ซ้ำ · ไม่มีเลย = [""]) */
export function groupNames(items) {
  const seen = [];
  for (const it of items ?? []) {
    const g = String(it?.group_label ?? "").trim();
    if (!seen.includes(g)) seen.push(g);
  }
  return seen.length ? seen : [""];
}

/**
 * แทรกรายการใหม่ "ท้ายหมวดที่เลือก" (ไม่ใช่ท้ายใบ)
 *
 * เดิมปุ่มลัดต่อท้ายสุดเสมอ → พอเพิ่มหมวดใหม่แล้วกด "+ งานลงเข็ม" รายการไปโผล่ผิดหมวด
 * (บั๊กที่เจ้าของเจอ 6 ส.ค.69) · หมวดที่ยังไม่มีรายการเลย → ต่อท้ายใบ
 */
export function addItemToGroup(items, item, group) {
  const g = String(group ?? "").trim();
  const row = { ...item, group_label: g };
  const list = (items ?? []).slice();
  let last = -1;
  list.forEach((it, i) => { if (String(it?.group_label ?? "").trim() === g) last = i; });
  if (last < 0) return [...list, row];
  list.splice(last + 1, 0, row);
  return list;
}

/** จัดรายการเป็นหมวด เรียงตาม sort_order (หมวดว่าง = "" มาก่อน) */
export function groupItems(items) {
  const order = [];
  const byGroup = new Map();
  for (const it of (items ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    const g = String(it.group_label ?? "").trim();
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
    byGroup.get(g).push(it);
  }
  return order.map((label) => ({
    label,
    items: byGroup.get(label),
    subtotal: sumItems(byGroup.get(label)),
  }));
}
