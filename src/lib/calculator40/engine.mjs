// engine.mjs — เครื่องคิดทุน/ราคา JR R4.0 (cost engine กลางตัวเดียว ทุกรุ่นเรียกร่วม)
// ──────────────────────────────────────────────────────────────────────────────
// กฎ (ตรงไฟล์ทุน xlsx):
//   • อลูเท่านั้น × ราคา/กก. (ผ่านตัวคูณ mult = ราคาปัจจุบัน/ตั้งต้น) — แก้ราคาอลูที่เดียว ทุกบานขยับ
//   • สีพิเศษ: + (ค่าอบ ฿/กก. × น้ำหนักอลูรวม) [+ ค่าเปิดตู้อบ 2000 ถ้าอบพิเศษ/ลายไม้อบพิเศษ]
//   • กระจก = พื้นที่กระจก × ฿/ตร.ม. (คงที่)  • อุปกรณ์/วัสดุสิ้นเปลือง = คงที่ต่อหน่วย
//   • อลูตัดจากเส้น stock 6.4 ม. (bar-nesting)  • ค่าแรง = ฐาน + เรต × ตร.ม. (ผลิต/ติดตั้งแยก)
//   • ขายผลิตอย่างเดียว = ceil100((ทุน+ค่าแรงผลิต)×(1+กำไร%))
//   • ขายผลิต+ติดตั้ง   = ขายผลิต + ceil100(ค่าแรงติดตั้ง×(1+กำไรติดตั้ง%))
// ──────────────────────────────────────────────────────────────────────────────

export const STOCK_LEN = 6.4; // ความยาวเส้นอลู stock มาตรฐาน (ม.) — บางรุ่นใช้ 6.0 (ตั้ง prod.stockLen)

export function ceil100(x) { return Math.ceil(x / 100) * 100; }
export function roundUp1000(x) { return Math.ceil(x / 1000) * 1000; }  // R3.9 ปัดขึ้นหลักพัน

// เลือกเรตขาย R3.9 ตามช่วงพื้นที่ (tier [lo,hi,rate]) — x<lo→เรตแรก · lo≤x<hi→เรตนั้น · เกิน→เรตสุดท้าย
export function rateOf(x, tiers) {
  if (!tiers || !tiers.length) return 0;
  if (x < tiers[0][0]) return tiers[0][2];
  for (const t of tiers) if (x >= t[0] && x < t[1]) return t[2];
  return tiers[tiers.length - 1][2];
}

// เศษอลู — ไฟล์ถอดทุนบวกเศษ 30% ให้เส้นที่ตัดจากความยาว (เจ้าของเคาะ 20 ส.ค.69)
export const WASTE_FACTOR = 1.3;

// จำนวนเส้น stock ที่ต้องใช้ — segLen=ความยาวชิ้น(ม.), count=จำนวนชิ้น
//
// มี 2 วิธี เพราะไฟล์ถอดทุนเองก็ใช้ 2 วิธี (ไล่เทียบทุกชีตแล้ว 20 ส.ค.69):
//   waste=true  "ใช้กี่เมตรรวม ÷ ความยาวเส้น + เศษ 30%" — เศษที่เหลือเอาไปใช้งานอื่นต่อได้
//               ใช้กับเส้นโปรไฟล์ Fuji/SMS (ชีต SMS · ยูโร · บานเปิด · กระทุ้ง · E-series · PC Door · Velora)
//   waste=false "ซื้อเต็มเส้น" (ปัดขึ้น) — ของเดิม · ยังใช้กับรุ่นที่ยังไม่ได้ไล่เทียบทีละเส้นกับชีต
//
// ⚠ เปิด waste ให้รุ่นไหน ต้องไล่เทียบจำนวนทุกเส้นกับชีตของรุ่นนั้นก่อน (scripts/verify-alu-qty.mjs)
//   บางชีตยังเขียนจำนวนเป็นเลขเต็มแบบเก่าอยู่ (เช่น "คิดทุน บานหมุน") — เปิดมั่วจะได้ราคาผิด
//   เส้นที่สูตรเขียน seg = ความยาวเส้นเต็มพอดี = ไฟล์นับเป็น "จำนวนเส้น" มาแล้ว → ไม่คูณเศษซ้ำ
/**
 * จำนวนเส้นที่ต้องซื้อ — จัดชิ้นลงเส้นจริง (First-Fit Decreasing)
 * ⚠ สูตรเดียวกับ packBars() ใน cutlist/engine.ts — แก้ต้องแก้ทั้งคู่ แล้วรัน scripts/verify-gate.mjs
 *   "รวมยาว ÷ ความยาวเส้น" ใช้ไม่ได้กับชิ้นยาว: ใบระแนงนอน 19 ใบ × 3.296 ม. รวม 62.6 ม. ÷ 6 = 11 เส้น
 *   แต่ของจริงตัดได้เส้นละใบ (เศษ 2.7 ม. ทำใบที่ 2 ไม่ได้) = ต้อง 19 เส้น
 */
export function packBars(lengths, stockLen) {
  const items = lengths.filter((L) => L > 0).sort((a, b) => b - a);
  const bins = [];
  for (const L of items) {
    if (L > stockLen + 1e-9) { bins.push(L); continue; }   // ชิ้นยาวเกินเส้น = ต้องต่อ นับเป็นเส้นของมันเอง
    const i = bins.findIndex((used) => used + L <= stockLen + 1e-9);
    if (i < 0) bins.push(L); else bins[i] += L;
  }
  return bins.length;
}

export function barsNeeded(segLen, count, stockLen = STOCK_LEN, waste = false) {
  if (!(segLen > 0) || !(count > 0)) return 0;
  if (waste) {
    if (Math.abs(segLen - stockLen) < 1e-9) return count;
    return (segLen * count / stockLen) * WASTE_FACTOR;
  }
  const fit = Math.floor(stockLen / segLen);
  if (fit >= 1) return Math.ceil(count / fit);
  return Math.ceil(segLen / stockLen) * count;
}

// ── สร้าง evaluator ของ expression strings ในสเปกสินค้า ──────────────────────
function buildEvaluator(extraVarNames) {
  // TBL = ตารางค่าคงที่ของรุ่น (prod.tables) — เช่น จำนวนเสา/บังใบ ต่อ config พับ ที่ลอกมาจากใบตัด
  const base = ['W', 'H', 'P', 'form', 'area', 'color', 'material', 'ROW', 'spec', 'mult', 'GMM', 'CKEY', 'TBL'];
  const names = [...base, ...extraVarNames];
  const cache = new Map();
  const compile = (expr) => {
    if (typeof expr === 'number') return () => expr;
    if (cache.has(expr)) return cache.get(expr);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, 'Math', 'return (' + expr + ')');
    const wrapped = (scope) => fn(...names.map(n => scope[n]), Math);
    cache.set(expr, wrapped);
    return wrapped;
  };
  return { names, compile };
}

/**
 * คิดราคากลาง — ทุกรุ่นเรียกฟังก์ชันนี้
 * @param {object} PB   pricebook { ALU, ALU_BASE, BAKE, BAKE_OPEN_OVEN, GLASS, LABOR }
 * @param {object} prod สเปกสินค้า (จาก products)
 * @param {object} opt  { w, h(cm), p(จำนวนบาน), form, color, glassType, profitPct, installProfitPct }
 * @returns {object} ผลคิดราคาแบบละเอียด
 */
export function computeCost(PB, prod, opt) {
  const W = (opt.w ?? prod.defaults.w) / 100;   // ม.
  const H = (opt.h ?? prod.defaults.h) / 100;   // ม.
  const P = opt.p ?? prod.defaults.p ?? 1;
  const form = opt.form ?? prod.defForm ?? 'std';
  let area = W * H;   // let — หลังคาหลายด้านทับด้วย opt.areaOverride ด้านล่าง (พื้นที่ = ผลรวมทุกด้าน)
  const color = opt.color ?? 'white';
  const colorDisp = opt.colorName || colorLabel(color);      // ชื่อสีเฉพาะ (display) — ราคามาจาก bake key เท่านั้น
  // วัสดุมุงหลังคา (รุ่นที่มีตัวเลือก)
  //   prod.materialAlias = ชื่อเก่า → ชื่อใหม่ (ไฟล์ถอดทุน v20.1 จัดกลุ่มเมทัลชีทใหม่ 3 ก.ย.69)
  //   ใบเสนอเก่าที่บันทึก material ชื่อเดิมไว้ ต้องยังคิดราคาได้ ไม่ใช่ตกไปเป็น 0 เงียบ ๆ
  const materialRaw = opt.material ?? prod.defMaterial ?? null;
  const material = (materialRaw && prod.materialAlias && prod.materialAlias[materialRaw]) ? prod.materialAlias[materialRaw] : materialRaw;
  const glassType = opt.glassType ?? prod.defGlass ?? 'เขียว 6มม.';
  // ── กำไรแยก 3 ส่วน (ไฟล์ถอดทุน v9 บล็อก "⚙ ตั้งค่ากำไร" ท้ายชีตคิดทุนทุกใบ) ──
  //   ค่าวัสดุ · ค่าผลิต · ค่าติดตั้ง ตั้ง % แยกกันได้ · ค่าตั้งต้นต่อรุ่นอยู่ใน PB.PROFIT
  //   สูตรในชีต (ตรวจตรงเป๊ะกับ SMS/ยูโร): ปัดร้อย "ทีละก้อน" ไม่ใช่ปัดทีเดียวตอนท้าย
  //     ขายวัสดุ         = ปัดร้อย( ทุนวัสดุ × (1 + กำไรวัสดุ%) )
  //     ขายผลิตอย่างเดียว = ขายวัสดุ + ปัดร้อย( ค่าแรงผลิต × (1 + กำไรผลิต%) )
  //     ขายผลิต+ติดตั้ง   = ขายผลิตอย่างเดียว + ปัดร้อย( ค่าแรงติดตั้ง × (1 + กำไรติดตั้ง%) )
  const DEFP = (PB.PROFIT && (PB.PROFIT[prod.id] || PB.PROFIT.__default)) || { mat: 100, prod: 100, inst: 200 };
  const pctMat = opt.profitMat ?? opt.profitPct ?? DEFP.mat;
  const pctProd = opt.profitProd ?? opt.profitPct ?? DEFP.prod;
  const pctInst = opt.profitInst ?? opt.installProfitPct ?? opt.profitPct ?? DEFP.inst;
  // ชื่อเดิม — สูตรเก่าหลายที่ยังอ้างอยู่ (ระแนง/R3.9/ม่านซิป) ให้ชี้ไปกำไรค่าวัสดุ
  const profitPct = pctMat;
  const installProfitPct = pctInst;

  const brand = prod.brand;
  const mult = (PB.ALU[brand] ?? 1) / (PB.ALU_BASE[brand] ?? PB.ALU[brand] ?? 1);
  // rawAlu = รุ่นที่ซื้อ "อลูดิบ" มาอบสีเอง (Velora — ชีตคิดทุนขึ้นหัวว่า "อลูดิบ+อบสีแยก")
  //   ต่างจากรุ่นทั่วไปที่ราคาเส้นรวมอบขาว/ดำมาแล้ว → ขาว/ดำ ต้องจ่ายค่าอบด้วย เรตเดียวกับเทา
  //   ตรงสูตรชีต: IF(สี="อบขาว/ดำ/เทา", rate_grey, ...) — ไม่มีเคสค่าอบ 0
  let bakeRate = PB.BAKE[color] ?? 0;
  if (prod.rawAlu && bakeRate <= 0) bakeRate = PB.BAKE.sahara ?? 0;

  // เตรียม scope + evaluator
  const varDefs = prod.vars || {};
  const ev = buildEvaluator(Object.keys(varDefs));
  // ROW = แถวข้อมูลจาก LUT ต่อรุ่น (cascade เช่น ฝ้าไม้เทียม) เลือกด้วย material เป็น key
  // mult ฉีดเข้า scope → สูตรราคา consum (โครงเมืองทอง roof/ระแนง) อ้าง mult ได้ → ขยับตามราคาอลู/กก. (ตั้งต้น mult=1 ไม่กระทบ anchor)
  // GMM = ความหนากระจก (มม.) จากชื่อกระจก — สูตรบางรุ่นเลือกคิ้วตามความหนา (F7919 6-13 · F7917 13-15)
  const GMM = Number((/(\d+)\s*มม/.exec(String(glassType)) || [])[1]) || 6;
  const scope = { W, H, P, form, area, color, material, ROW: prod.lut ? (prod.lut[material] || {}) : {}, spec: opt.spec || {}, mult, GMM, CKEY: String(opt.colorKey ?? ''), TBL: prod.tables || {} };
  for (const [k, expr] of Object.entries(varDefs)) {
    scope[k] = ev.compile(expr)(scope);
  }
  // opt.areaOverride — รุ่นที่ "พื้นที่ ≠ กว้าง×สูง" (หลังคาหลายด้าน = ผลรวมทุกด้าน)
  //   ผู้เรียกคิดมาให้เป็นตัวเลข ไม่ใช่สูตร เพราะขนาดรายด้านอยู่ในอินพุตใบตัด (มีค่าตั้งต้นครบ) ไม่ใช่ spec
  //   ค่าแรง/ราคาต่อ ตร.ม. ใช้ area ตัวนี้ต่อทั้งหมด
  // prod.areaExpr — รุ่นที่พื้นที่คิดเอง จากตัวแปรของรุ่น (หลังคาเลื่อน = ติดตาย + เลื่อน×บาน)
  if (prod.areaExpr) { const a2 = Number(ev.compile(prod.areaExpr)(scope)); if (Number.isFinite(a2) && a2 >= 0) { area = a2; scope.area = a2; } }
  //   ⚠ ต้องรับค่า 0 ด้วย — ยังไม่กรอกด้าน = พื้นที่ 0 ถ้าตกไปใช้ กว้าง×สูง จะได้ค่าแรงจากเลขที่ค้างในช่องที่ซ่อนอยู่
  if (Number.isFinite(Number(opt.areaOverride)) && Number(opt.areaOverride) >= 0) {
    area = Number(opt.areaOverride); scope.area = area;
  }
  const val = (expr) => ev.compile(expr)(scope);

  const stockLen = prod.stockLen ?? STOCK_LEN;
  const lines = [];
  // ⚠ กันคิดต่ำกว่าจริงเงียบ ๆ — เก็บทุกบรรทัดที่ราคาออกมา 0 (สโตร์ยังไม่ตั้งราคา + สูตรไม่มีราคาสำรอง)
  //   ใช้ทั้งฝั่งอลูและฝั่งอุปกรณ์ · หน้าจอเอาไปขึ้นเตือนว่าต้องไปตั้งราคารหัสไหนบ้าง
  const hwMissing = [];
  // วัสดุมุงที่บันทึกไว้ในใบเสนอเก่า แต่ไฟล์ถอดทุนล่าสุดไม่มีแล้ว (และไม่ใช่แค่เปลี่ยนชื่อ ดู materialAlias)
  //   บรรทัดแผ่นทุกบรรทัดจะไม่เข้าเงื่อนไข → ทุนแผ่นหายทั้งก้อนแบบเงียบ ๆ (เคยเจอจริง −54,442)
  //   → ขึ้นเตือนบนหน้าจอให้เลือกวัสดุใหม่ (3 ก.ย.69 ตัด Nature/Grand + เมทัล PU ตามไฟล์ v20.1)
  if (material && Array.isArray(prod.materials) && prod.materials.length && !prod.materials.includes(material))
    hwMissing.push({ sku: '', name: `วัสดุ "${materialRaw}" ไม่มีในไฟล์ถอดทุนล่าสุดแล้ว — เลือกวัสดุใหม่` });
  const noteMissing = (it, count) => {
    if (!(count > 0) || !it.sku) return;
    const sku = String(it.sku).toUpperCase();
    if ((PB.SKUPRICE && PB.SKUPRICE[sku] > 0) || (Number(it.price) || 0) > 0) return;
    if (hwMissing.some((m) => m.sku === sku)) return;
    hwMissing.push({ sku, name: it.name });
  };
  // อุปกรณ์ผูก "รหัสสโตร์" ได้ตรง ๆ — it.sku เป็นข้อความ หรือสูตร (เลือกรหัสตามสี/รูปแบบ) ก็ได้
  //   ราคาจากสโตร์ชนะราคาฝังในสูตรเสมอ (เจ้าของ 19 ส.ค.69: สโตร์เป็นตัวตั้ง)
  const skuOf = (it) => {
    // ไม่มีรหัสในสูตร แต่ผูกตารางราคากลางไว้ → ใช้รหัสสโตร์ของตารางนั้น (PB.REFSKU สร้างจากสโตร์)
    //   ทำให้แผ่นมุง/เหล็ก/มอเตอร์/กระจก มีรหัสติดบรรทัดครบ โดยไม่ต้องไล่ใส่ทีละรุ่น
    if (!it.sku && it.ref && PB.REFSKU && PB.REFSKU[it.ref]) return String(PB.REFSKU[it.ref]).trim().toUpperCase();
    // ผูกด้วย "ชนิด+ขนาด" (กล่อง/ฉาก/แซด) — ไม่มีรหัสโปรไฟล์ แต่สโตร์มีรหัส JR ของมันอยู่
    //   ไม่ติดรหัสให้ = หน้าเทียบใบตัดขึ้น "ยังไม่มีรหัสสโตร์" ทั้งที่ผูกราคาอยู่ (เจ้าของท้วง 31 ส.ค.69)
    if (!it.sku && it.box && PB.BOXSKU) {
      const bk = boxOf(it);
      const bt = bk ? PB.BOXSKU[bk] : null;
      // สีที่เลือกก่อน → มิว/อบขาว → สีไหนก็ได้ (บางกลุ่มใช้รหัสเดียวทุกสี) — หลักเดียวกับ boxPriceOf
      const bc = String(opt.stockColor || "").replace(/s+/g, "");
      const bs = bt ? (bt[bc] || bt["มิว"] || bt["อบขาว"] || bt[Object.keys(bt)[0]] || "") : "";
      if (bs) return String(bs).trim().toUpperCase();
    }
    if (!it.sku) return '';
    const v = String(it.sku).includes('?') ? val(it.sku) : it.sku;
    return String(v ?? '').trim().toUpperCase();
  };
  const skuPrice = (sku) => (sku && PB.SKUPRICE && PB.SKUPRICE[sku] > 0) ? PB.SKUPRICE[sku] : null;
  // กล่อง/ฉาก อลูเมืองทอง — ไม่มีรหัสโปรไฟล์ ผูกด้วย "ชนิด|ขนาด" แล้วเลือกราคาตามสีที่ลูกค้าเลือก
  //   it.box = คีย์ เช่น 'กล่อง|1.6X3' · ไม่เจอในสโตร์ = ใช้ราคาในสูตรเหมือนเดิม (ห้ามหล่นเป็น 0)
  // boxColorDone = จับคู่ "สีที่ลูกค้าเลือก" ได้เป๊ะ → ราคานั้นรวมค่าอบมาแล้ว (ห้ามบวกค่าอบซ้ำ)
  //   หลักเดียวกับเส้นอลูที่มีราคาสี (②) · ตกมาใช้ มิว = สีดิบ ยังต้องอบ → เข้ากองค่าอบตามปกติ
  let boxColorDone = false;
  // it.box เป็นสูตรได้ (เลือกกล่องตามที่ลูกค้าเลือก เช่น ระแนง) — หลักเดียวกับ skuOf
  //   ไม่งั้นระแนงต้องฝังราคากล่องไว้ในสูตร → แก้ราคากล่องในสโตร์แล้วราคาไม่ขยับ (ผิดเป้า "ผูกสโตร์")
  const boxOf = (it) => {
    if (!it.box) return "";
    const raw = String(it.box);
    const v = /[?+()]/.test(raw) ? val(raw) : it.box;   // มีตัวดำเนินการ = เป็นสูตร · คีย์ปกติเป็นข้อความล้วน
    return String(v ?? "").trim();
  };
  const boxPrice = (it) => {
    boxColorDone = false;
    const key = boxOf(it);
    if (!key || !PB.BOXPRICE) return null;
    const b = PB.BOXPRICE[key];
    if (!b) return null;
    const c = opt.stockColor || '';
    if (c && b[c] > 0) { boxColorDone = !/มิว/.test(c); return b[c]; }
    for (const alt of ['มิว', 'อบขาว']) if (b[alt] > 0) return b[alt];
    return null;
  };

  let aluCost = 0, aluKg = 0, aluBarsAll = 0;

  // ราคาต่อชิ้นจาก PB.PARTS (เฉพาะสินค้าติดธง partsLinked = รุ่นถอดทุนใหม่ · แก้ราคาที่ stock แล้วเปลี่ยนตาม)
  // ตั้งต้น PARTS = ราคาเดิมใน BOM → behavior-preserving (verify 63/63 คงเดิม) · รุ่นเดิม (ไม่ติดธง) ใช้ it.price ปกติ
  const pPrice = (name, base) => (prod.partsLinked && PB.PARTS && name in PB.PARTS) ? PB.PARTS[name] : base;

  // prod.poolBars = นับเส้นแบบ "รวมทุกท่อนที่ใช้รหัสเดียวกันก่อน แล้วค่อยหารเส้น" — วิธีเดียวกับหน้าใบตัด
  //   (cutlist/engine barsByCode) · เศษเส้นเอาไปตัดท่อนอื่นของรหัสเดียวกันต่อได้จริงในโรงงาน
  //   ไม่เปิด = นับทีละบรรทัด (เส้นละบรรทัด ปัดขึ้นทุกบรรทัด) เหมือนเดิมทุกรุ่น
  //   จำนวนเส้นรวมของรหัส = ceil(Σยาว/เส้น) แล้วเฉลี่ยกลับเข้าแต่ละบรรทัดตามสัดส่วนความยาว
  //   → บรรทัดละเศษเส้น แต่รวมทั้งรหัสเท่าใบตัดเป๊ะ (ไม่มีบรรทัด ฿0 ให้งง)
  // opt.aluLines = บรรทัดอลูที่ผู้เรียกคิดมาจาก 'ใบตัด' แล้ว (หลังคาหลายด้าน — ดู alu-from-cutlist.ts)
  //   รูปแบบเดียวกับ prod.alu แต่ seg/count เป็นตัวเลขสำเร็จ ไม่ใช่สูตร → ทางเดินราคา/สี/นับเส้น ใช้ของเดิมทั้งหมด
  const ALU = (opt.aluLines && opt.aluLines.length) ? opt.aluLines : (prod.alu || []);
  const poolShare = new Map();
  if (prod.poolBars || prod.packBars) {
    const sum = new Map();
    for (const it of ALU) {
      const seg = typeof it.seg === 'number' ? it.seg : val(it.seg);
      const count = val(it.count);
      const key = (it.code && String(it.code).includes('?')) ? String(val(it.code) ?? '') : it.code;
      if (!key || !(seg > 0) || !(count > 0)) continue;
      const e = sum.get(key) || { len: 0, stock: Number(it.stockLen) || stockLen, lens: [] };
      e.len += seg * count;
      for (let i = 0; i < Math.round(count); i++) e.lens.push(seg);
      sum.set(key, e);
    }
    for (const [key, e] of sum) {
      // packBars = จัดชิ้นลงเส้นจริง (ตรงใบตัด) · ไม่เปิด = รวมยาวหารเส้น (พฤติกรรมเดิม)
      const bars = prod.packBars ? packBars(e.lens, e.stock) : Math.ceil(e.len / e.stock - 1e-9);
      poolShare.set(key, { bars, len: e.len });
    }
  }

  // (1) อลู — bar-nesting × ราคาเส้น × mult  (+bake×kg ถ้าสีพิเศษ)
  // ราคาเส้นผูก "รหัส" (B####/F####) กับสต็อก: PB.ALUCODE[code] มาก่อน → PARTS(ชื่อ) → ราคาเดิมใน BOM
  // ไม่มีราคาสต็อก = ราคาเดิมเป๊ะ (behavior-preserving · verify 63/63 คงเดิม)
  for (const it of ALU) {
    const seg = typeof it.seg === 'number' ? it.seg : val(it.seg);
    const count = typeof it.count === 'number' ? it.count : val(it.count);
    // ราคาเส้น "ตามสี" (PB.ALUCOLOR) มาก่อน — ชีต "ราคาสี" มีคอลัมน์ เทาซาฮาร่า/ลายไม้สต็อค เป็นราคาเส้นสำเร็จ
    //   สูตรในชีตคิดทุนใช้คอลัมน์นั้นตรง ๆ (ไม่ใช่ ขาว + ค่าอบ×กก.) → เส้นที่คิดราคาสีแล้ว ห้ามบวกค่าอบซ้ำ
    //   เหลือแค่ สีอบพิเศษ/ลายไม้อบพิเศษ ที่ยังเป็น ขาว + เรต×กก. (+ค่าเปิดตู้อบ) ตามสูตรชีต
    // ALUCODE_ALIAS = รหัสในสูตรเขียนผิด → ชี้ไปรหัสที่ใช้จริง (ตอนนี้ว่าง — เจ้าของยืนยันว่าสูตรถูกแล้ว)
    // it.code เป็นข้อความ หรือสูตรก็ได้ (เลือกรหัสตามเงื่อนไข เช่น คิ้วกระจกเลือกตามความหนา)
    const rawCode = (it.code && String(it.code).includes('?')) ? String(val(it.code) ?? '') : it.code;
    const code = (rawCode && PB.ALUCODE_ALIAS && PB.ALUCODE_ALIAS[rawCode]) || rawCode;
    // it.stockLen = ความยาวเส้นเฉพาะบรรทัดนี้ (เช่น มือจับ X-J ขายเป็นท่อน 2.8 ม. ไม่ใช่ 6 ม.)
    const pool = poolShare.get(rawCode);
    const bars = pool && pool.len > 0
      ? pool.bars * (seg * count) / pool.len
      : barsNeeded(seg, count, Number(it.stockLen) || stockLen, !!prod.aluWaste && !it.noWaste);
    if (bars <= 0) continue;
    // ALUCODE_NOCOLOR = เส้นสีเงิน/ผิวเดิม ไม่มีการอบสี → ราคาเดียวทุกสี ห้ามบวกค่าอบ
    //   (เจ้าของยืนยัน 8 ส.ค.69: F7994 ตบรางล้อ เป็นสีเงิน ใช้กับทุกสีราคาเดียว)
    const noColor = !!(code && (PB.ALUCODE_NOCOLOR || []).includes(code));
    // ลำดับราคาเส้น: ① สีจริงจากสโตร์ (สโตร์เป็นตัวตั้ง — เจ้าของสั่ง 8 ส.ค.69)
    //                ② ตารางราคาสีในไฟล์  ③ ราคาขาว + ค่าอบ×กก. (ทางสุดท้าย)
    //   opt.stockColor = ชื่อสีในสโตร์ของสีที่ลูกค้าเลือก (แอปส่งมาให้ · "" = สีนั้นไม่มีในสโตร์)
    const stockColorPrice = (!noColor && code && opt.stockColor && PB.ALUCOLOR_STOCK && PB.ALUCOLOR_STOCK[opt.stockColor])
      ? PB.ALUCOLOR_STOCK[opt.stockColor][code] : null;
    // ② ราคาแยก "สีจริง" จากไฟล์ถอดทุน v9 (ALUCOLOR_KEY[คีย์สี][รหัส]) — เจ้าของเคาะ 19 ส.ค.69 ให้ยึดไฟล์
    //    ไฟล์แยก 6 สีจริง (เทาซาฮาร่า/ดำซาฮาร่า/แอทแทคเกรย์/ลายไม้สักทอง/มะฮอกกานี/ไวท์โอ๊ค)
    //    ละเอียดกว่าตารางเดิมที่แยกแค่ "หมวดค่าอบ" → ลายไม้ 3 สี เคยใช้ราคาเดียวกันหมด
    const fileColorPrice = (!noColor && code && opt.colorKey && PB.ALUCOLOR_KEY && PB.ALUCOLOR_KEY[opt.colorKey])
      ? PB.ALUCOLOR_KEY[opt.colorKey][code] : null;
    const colorPrice = stockColorPrice > 0 ? stockColorPrice
      : fileColorPrice > 0 ? fileColorPrice
      : (!noColor && code && PB.ALUCOLOR && PB.ALUCOLOR[color]) ? PB.ALUCOLOR[color][code] : null;
    const bxp = boxPrice(it);   // กล่อง/ฉาก ผูกด้วยชื่อ+ขนาด+สี (สโตร์เป็นตัวตั้ง)
    const price = bxp != null ? bxp
      : colorPrice > 0 ? colorPrice
      : (code && PB.ALUCODE && PB.ALUCODE[code] > 0) ? PB.ALUCODE[code]
      : pPrice(it.name, it.price);
    // ⚠ ห้ามคูณ mult ทับ "ราคาที่มาจากสโตร์" — สโตร์คิด ราคา/เส้น = น้ำหนัก × เรตต่อโล ปัจจุบัน ให้แล้ว
    //   mult (= เรตต่อโลปัจจุบัน ÷ เรตตั้งต้น) มีไว้ขยับ "ราคาฝังในไฟล์" ที่ยังผูกสโตร์ไม่ได้เท่านั้น
    //   ถ้าคูณทั้งคู่ = ขึ้นเรตต่อโล 7% แล้วราคาเด้ง 14% (คิดซ้ำสองต่อ)
    const fromStock = !!(bxp != null || stockColorPrice > 0
      || (!(colorPrice > 0) && code && PB.ALUCODE_FROM_STOCK && PB.ALUCODE_FROM_STOCK[code] && PB.ALUCODE[code] > 0));
    const m = fromStock ? 1 : mult;
    // เส้นที่ราคาออกมาเป็น 0 (สโตร์ยังไม่ตั้งราคา + สูตรไม่มีราคาสำรอง) → เตือนบนหน้าจอ
    //   ไม่งั้นค่าของหายเงียบ ๆ เหมือนเคสอุปกรณ์ (เจ้าของเจอมาแล้ว)
    if (!(price > 0)) noteMissing({ sku: code || it.box || it.name, name: it.name, price: 0 }, bars);
    const amount = bars * price * m;
    aluCost += amount;
    // เส้นที่ราคารวมสีแล้ว หรือเป็นเส้นสีเงินไม่อบสี → ไม่เข้ากองคิดค่าอบ
    if (!(colorPrice > 0) && !boxColorDone && !noColor) aluKg += bars * (it.kg || 0);
    aluBarsAll += bars;   // นับทุกเส้น (รวมเส้นที่ราคารวมสีมาแล้ว) — ใช้ตัดสินค่าเปิดตู้อบ
    // code/kg ติดมากับบรรทัดด้วย — หน้าเทียบ "คิดราคา ↔ ใบตัด" ใช้จับคู่รหัส + คิด ฿/กก. (ไม่กระทบตัวเลขใด ๆ)
    lines.push({ cat: 'alu', name: it.name + (colorPrice > 0 ? ' (' + colorDisp + ')' : ''), code: code || '', kg: it.kg || 0,
      qty: bars, unit: 'เส้น', unitPrice: round2(price * m), amount: round2(amount),
      // ความยาวที่ต้องตัดจริง + จำนวนชิ้น — หน้าเทียบ "คิดราคา ↔ ใบตัด" ใช้ตัวนี้เทียบ
      //   (เทียบ "จำนวนเส้น" ตรง ๆ ไม่ได้แล้ว: คิดราคานับแบบไฟล์ ÷6.4+เศษ · ใบตัดนับเส้นเต็ม)
      lenM: round2(seg * count), pieces: count, orderOnly: !!it.orderOnly,
      // ไฟล์ถอดทุนเขียนบางบรรทัดเป็น "จำนวนเส้นเต็ม" ไม่ใช่จำนวนชิ้น (seg = ความยาวเส้นพอดี)
      //   บรรทัดพวกนี้เอาไปเทียบ "ชิ้น" กับใบตัดไม่ได้ — หน้าเทียบจะขึ้นว่า 'นับคนละหน่วย'
      barCounted: Math.abs(seg - stockLen) < 1e-9 });
  }
  // ค่าอบสี (อลูเท่านั้น)
  let bakeCost = 0, openOven = 0;
  if (bakeRate > 0 && aluKg > 0) {
    bakeCost = bakeRate * aluKg;
    lines.push({ cat: 'bake', name: 'ค่าอบสี (' + colorDisp + ' ' + bakeRate + '/กก. × ' + round2(aluKg) + 'กก.)', qty: round2(aluKg), unit: 'กก.', unitPrice: bakeRate, amount: round2(bakeCost) });
  }
  // ค่าเปิดตู้อบ = คงที่ต่องาน "ไม่ขึ้นตาม กก." (ไฟล์ถอดทุน ชีต อัปเดตราคาอลู)
  //   ⚠ ต้องคิดแม้ทุกเส้นได้ราคารวมสีจากไฟล์/สโตร์มาแล้ว (aluKg = 0) ไม่งั้นตกค่าเปิดตู้อบ 2,000 เงียบ ๆ
  if ((color === 'special' || color === 'woodSpecial') && aluBarsAll > 0) {
    openOven = PB.BAKE_OPEN_OVEN || 0;
    if (openOven) lines.push({ cat: 'bake', name: 'ค่าเปิดตู้อบ', qty: 1, unit: 'งาน', unitPrice: openOven, amount: openOven });
  }

  // (2) กระจก = พื้นที่กระจก × ฿/ตร.ม.
  //   #1 (เจ้าของ 17ก.ค.69): เลือก "แผ่นคอมโพสิต/ลูกฟูก แทนกระจก" → ไม่คิดกระจก · คิดแผ่นแบบ sell-based (เท่า solid_panel 3300/3500)
  let glassCost = 0, glassArea = 0, panelSell = 0;
  //   เกล็ด Z แทนกระจก (21ก.ค.69): ราคาตามขนาด+สีอลูหลัก (zRate) · sell-based เหมือนแผ่นคอมโพสิต · ไม่คิดกระจก
  const zGlassSize = glassType === 'เกล็ด Z 1"' ? '1' : glassType === 'เกล็ด Z 1.6"' ? '1.6' : null;
  const isPanelGlass = glassType === 'แผ่นคอมโพสิต' || glassType === 'แผ่นลูกฟูก' || !!zGlassSize;
  if (prod.glass) {
    glassArea = val(prod.glass);
    if (isPanelGlass) {
      const rate = zGlassSize ? zRate(zGlassSize, color) : (glassType === 'แผ่นคอมโพสิต' ? 3300 : 3500);
      panelSell = round2(glassArea * rate);   // บวกเข้ายอดขายทีหลัง (sell-based) · ไม่คิดกระจก (glassCost=0)
      // ไม่ push บรรทัดกระจก — คำอธิบายไปอยู่ที่ "รายละเอียดงาน" (glassLine) · ราคาแฝงในราคาสินค้า (เหมือนกระจก)
    } else {
      const gp = PB.GLASS[glassType] ?? 0;
      // กระจกที่ไฟล์ถอดทุนล่าสุดไม่มีแล้ว (ใบเสนอเก่าเลือกไว้) → เตือน ไม่ใช่คิดเป็น 0 เงียบ ๆ
      if (!(gp > 0) && glassArea > 0) hwMissing.push({ sku: '', name: `กระจก "${glassType}" ไม่มีในไฟล์ถอดทุนล่าสุดแล้ว — เลือกกระจกใหม่` });
      glassCost = glassArea * gp;
      lines.push({ cat: 'glass', name: 'กระจก ' + glassType, qty: round2(glassArea), unit: 'ตร.ม.', unitPrice: gp, amount: round2(glassCost) });
    }
  }

  // (3) อุปกรณ์ + วัสดุสิ้นเปลือง (คงที่)
  //   opt.hardwareLines = รายการอุปกรณ์ "จากใบตัด" (ชื่อ/รหัสสโตร์/จำนวน ตรงกับที่ช่างเบิกจริง)
  //     ส่งมาเมื่อไร → ใช้แทน prod.hardware+prod.consum ทั้งชุด (กันคิดซ้ำ)
  //     ราคา: รหัสในสโตร์ก่อน (PB.SKUPRICE) → ราคาสำรองที่ส่งมากับบรรทัด
  //     เจ้าของสั่ง 19 ส.ค.69: อุปกรณ์ในใบตัด 15 บรรทัด ต้องเข้า "ค่าของ" ในคิดราคาด้วย
  const rawHwLines = (Array.isArray(opt.hardwareLines) && opt.hardwareLines.length) ? opt.hardwareLines : null;
  // ราคาต่อบรรทัด: รหัสสโตร์ก่อน (÷ per ถ้าสโตร์ขายเป็นแพ็ค) → ราคาสำรองที่ส่งมากับบรรทัด
  //   PB.HWPRICE = ราคาสำรองจากไฟล์ถอดทุน (ชีต "คิดทุน …") สำหรับรหัสที่สโตร์ยังไม่ตั้งราคา
  //   ราคาสโตร์ชนะเสมอ — พอเจ้าของตั้งราคาในสโตร์ ระบบสลับไปใช้ของสโตร์เอง
  const hwPrice = (it) => {
    const sku = String(it.sku || '').toUpperCase();
    if (sku && PB.SKUPRICE && PB.SKUPRICE[sku] > 0) return PB.SKUPRICE[sku] / (Number(it.per) || 1);
    if (sku && PB.HWPRICE && PB.HWPRICE[sku] > 0) return PB.HWPRICE[sku];   // ราคาไฟล์ = ต่อหน่วยย่อยอยู่แล้ว ไม่หาร per
    return Number(it.price) || 0;
  };
  const hwFromFile = (it) => {
    const sku = String(it.sku || '').toUpperCase();
    return !!(sku && !(PB.SKUPRICE && PB.SKUPRICE[sku] > 0) && PB.HWPRICE && PB.HWPRICE[sku] > 0);
  };
  // ⚠ กันคิดต่ำกว่าจริงเงียบ ๆ — รหัสไหนยังไม่ตั้งราคาในสโตร์ ค่าของบรรทัดนั้นจะเป็น 0
  //   ถ้ามีแม้แต่ตัวเดียว → ไม่ใช้รายการจากใบตัดทั้งชุด กลับไปใช้ราคาเดิมในสูตร (ราคาไม่ตก)
  //   แล้วรายงาน hwMissing ให้หน้าจอเตือนว่าต้องไปตั้งราคารหัสไหนบ้าง
  // ราคาตามสูตรของรุ่น (ราคาตั้ง → PARTS override → ตารางกลาง PB.ref → ตัวคูณอลู)
  const formulaHwPrice = (it) => {
    let price = pPrice(it.name, typeof it.price === 'number' ? it.price : val(it.price));
    if (it.ref) { const rp = refPrice(PB, it.ref); if (rp != null) price = rp; }
    if (it.mult) price *= mult;
    return price;
  };
  // ของสั่งตามงานในใบตัด (noStock + ไม่มีรหัสสโตร์ เช่น มอเตอร์/รีโมท ประตูรั้ว) ไม่มีราคาสโตร์โดยธรรมชาติ
  //   ราคาอยู่ในสูตรของรุ่น (orderOnly บรรทัดชื่อเดียวกัน) → ดึงจากตรงนั้น ไม่นับเป็น "ขาดราคา"
  //   ⚠ เดิมนับเป็นขาดราคา → engine ถอยไปสูตรเก่าทั้งชุดตลอด = ประตูรั้วไม่เคยใช้ใบตัดจริงเลย (verify-gate ⑦ จับได้ 3 ก.ย.69)
  const orderOnlyFormula = (it) => (it.noStock && !it.sku) ? (prod.hardware || []).find((h) => h.orderOnly && h.name === it.name) : null;
  const cutHwPrice = (it) => { const f = orderOnlyFormula(it); return f ? formulaHwPrice(f) : hwPrice(it); };
  for (const it of (rawHwLines || [])) {
    if ((Number(it.qty) || 0) > 0 && !(cutHwPrice(it) > 0)) hwMissing.push({ sku: String(it.sku || ''), name: it.name });
  }
  const hwLines = rawHwLines && !hwMissing.length ? rawHwLines : null;
  let hwCost = 0;
  for (const it of (hwLines || [])) {
    const count = Number(it.qty) || 0;
    if (count <= 0) continue;
    const price = cutHwPrice(it);
    const amount = count * price;
    hwCost += amount;
    lines.push({ cat: 'hardware', name: it.name, sku: String(it.sku || '').toUpperCase(),
      qty: round2(count), unit: it.unit || 'ชิ้น', unitPrice: round2(price), amount: round2(amount),
      fromFile: hwFromFile(it), orderOnly: !!orderOnlyFormula(it) });
  }
  // โหมดใบตัด: ของสั่งตามงาน (orderOnly) ที่ใบตัดไม่มีแถวชื่อเดียวกัน ต้องยังคิดเงินตามสูตร (กฎเจ้าของ 2 ก.ย.69
  //   "ไม่มีในไฟล์ตัดประกอบ มีในคิดราคา = ก็ขึ้น") — เช่น เหล็กยัดเสา 4"×4" ประตูรั้ว · ที่ชื่อตรงกับใบตัดคิดไปแล้วข้างบน
  const hwFormulaSrc = hwLines
    ? (prod.hardware || []).filter((h) => h.orderOnly && !hwLines.some((c) => c.name === h.name))
    : (prod.hardware || []);
  for (const it of hwFormulaSrc) {
    const count = val(it.count);
    if (count <= 0) continue;
    let price = formulaHwPrice(it);   // ราคาตั้ง (สูตร/PARTS override) → ตารางกลาง PB.ref → ตัวคูณอลู (mult)
    const hwSku = skuOf(it);
    // per = สโตร์ตั้งราคาเป็นแพ็ค แต่สูตรนับเป็นหน่วยย่อย (เช่น สักหลาดม้วนละ 250 ม.)
    const spRaw = skuPrice(hwSku);
    const sp = spRaw != null ? spRaw / (Number(it.per) || 1) : boxPrice(it);
    if (sp != null) price = sp;   // มีราคาในสโตร์ → ใช้ของสโตร์ (สโตร์เป็นตัวตั้ง)
    noteMissing({ ...it, sku: hwSku }, count);
    // ราคาออกมา 0 ทั้งที่ไม่ได้ตั้งใจ (ตารางราคากลางยังว่าง) → ต้องเตือน ไม่ใช่คิดเป็นศูนย์เงียบ ๆ
    if (!(price > 0) && !it.orderOnly && !it.labor) noteMissing({ sku: hwSku || it.ref || it.name, name: it.name, price: 0 }, count);
    const amount = count * price;
    hwCost += amount;
    lines.push({ cat: 'hardware', name: it.name, sku: hwSku, qty: round2(count), unit: it.unit || 'ชิ้น', unitPrice: price, amount: round2(amount), orderOnly: !!it.orderOnly });
  }
  let consumCost = 0;
  // opt.consumLines = แผ่นมุง/เหล็ก/ราง ที่ผู้เรียกคิดมาจากใบตัดแล้ว (หลังคาหลายด้าน) — ทับ prod.consum
  const CONSUM = (opt.consumLines && opt.consumLines.length) ? opt.consumLines : (hwLines ? [] : prod.consum || []);
  for (const it of CONSUM) {
    const count = typeof it.count === 'number' ? it.count : val(it.count);
    if (count <= 0) continue;
    let unitPrice = pPrice(it.name, typeof it.price === 'number' ? it.price : val(it.price));  // ราคา expression + PARTS override (partsLinked)
    if (it.ref) { const rp = refPrice(PB, it.ref); if (rp != null) unitPrice = rp; }   // ราคาจาก PB (แอดมินแก้ได้ · ไม่มี=ใช้ price เดิม)
    if (it.mult) unitPrice *= mult;   // กล่องอลูเมืองทอง (ระแนงสลับ/หมุน) → ขยับตามราคาอลู/กก.
    const cSku = skuOf(it);
    const cspRaw = skuPrice(cSku);
    const csp = cspRaw != null ? cspRaw / (Number(it.per) || 1) : boxPrice(it);
    if (csp != null) unitPrice = csp;   // มีราคาในสโตร์ → ใช้ของสโตร์ (÷ per ถ้าสโตร์ขายเป็นแพ็ค)
    // it.buf = ตัวคูณเผื่อเศษ (แผ่นหลังคา 1.2 = buf_roof ในไฟล์ถอดทุน "เผื่อเศษแผ่นหลังคา ตัดเสีย/ซ้อนแผ่น 20%")
    //   ชีต E8 คูณ buf_roof ทับราคาแผ่น (รวมราคาจากสโตร์ด้วย) → ต้องคูณหลังจากทับราคาสโตร์แล้ว
    //   ⚠ เว็บไม่เคยคูณตัวนี้เลย (v20 ก็มี) → ทุนแผ่นทุกหลังคาขาด 20% มาตลอด (เจ้าของสั่งอิง v20.1 3 ก.ย.69)
    if (it.buf > 0) unitPrice *= it.buf;
    noteMissing({ ...it, sku: cSku }, count);
    if (!(unitPrice > 0) && !it.orderOnly && !it.labor) noteMissing({ sku: cSku || it.ref || it.name, name: it.name, price: 0 }, count);
    const amount = count * unitPrice;
    consumCost += amount;
    lines.push({ cat: 'consum', name: it.name, sku: cSku, qty: round2(count), unit: it.unit || '', unitPrice: round2(unitPrice), amount: round2(amount) });
  }

  // สีโครงพิเศษ — ค่าสีเพิ่ม/ตร.ม. (per-item · เฉพาะรุ่น showColor เช่น หลังคา · X รอราคา · ไม่ sync ทั้งใบ)
  let frameColorCost = 0;
  if (prod.showColor && (opt.frameColorRate || 0) > 0) {
    frameColorCost = opt.frameColorRate * area;
    lines.push({ cat: 'bake', name: 'สีโครงพิเศษ (' + colorDisp + ' ' + opt.frameColorRate + '/ตร.ม.)', qty: round2(area), unit: 'ตร.ม.', unitPrice: opt.frameColorRate, amount: round2(frameColorCost) });
  }
  const costTotal = aluCost + bakeCost + openOven + glassCost + hwCost + consumCost + frameColorCost;

  // (4) ค่าแรง = ฐาน + เรต × ตร.ม.  (บางรุ่นคิดต่อบาน → ×จำนวนบาน)
  // พื้นที่ 0 = ยังไม่กรอกขนาด (หลังคาหลายด้านที่ยังไม่ใส่ด้าน) → ค่าแรงต้องเป็น 0
  //   ตาราง v20.1 มี "ค่าแรงฐาน" ทุกรุ่น ถ้าไม่กัน จะโชว์ค่าแรงลอย ๆ ทั้งที่ยังไม่มีงาน (QA 27 ส.ค.69)
  const L = (area > 0 ? PB.LABOR[prod.laborKey] : null) || { pBase: 0, pRate: 0, iBase: 0, iRate: 0 };
  let laborProd, laborInstall;
  // laborShow = ตัวเลขดิบของสูตรค่าแรง — หน้าจอเอาไปกาง "วิธีคิด" ให้ผู้ใช้เห็น (ไม่ได้ใช้คำนวณ)
  let laborShow = { mode: 'rate', mult: 1, pBase: 0, pRate: 0, iBase: 0, iRate: 0 };
  if (prod.laborPerLeaf) {
    // ค่าแรง "ต่อใบ": ฐาน×จำนวนใบ + เรต×พื้นที่รวม (เช่น มุ้ง — ชีต "ราคามุ้ง" L–O)
    const leaves = val(prod.laborLeaves);
    laborProd = Math.max(0, L.pBase * leaves + L.pRate * area);
    laborInstall = Math.max(0, L.iBase * leaves + L.iRate * area);
    laborShow = { mode: 'perLeaf', mult: leaves, pBase: L.pBase, pRate: L.pRate, iBase: L.iBase, iRate: L.iRate };
  } else {
    const lp = prod.laborPerPanel ? P : 1;  // บางรุ่นคิดต่อบาน → ×จำนวนบาน
    // laborNoRate = ชีตคิดทุนของรุ่นนั้นใช้ "ฐานอย่างเดียว" ไม่บวกเรตต่อ ตร.ม.
    //   บานเฟี้ยม sms : D64 = ฐานผลิต × จำนวนบาน            (ไม่มีเทอม /ตร.ม.)
    //   บานเฟี้ยมยูโร : E46 = ฐานผลิต เฉย ๆ                   (ไม่ ×บาน ไม่มี /ตร.ม.)
    const rp = prod.laborNoRate ? 0 : L.pRate;
    const ri = prod.laborNoRate ? 0 : L.iRate;
    laborProd = Math.max(0, L.pBase + rp * area) * lp;
    laborInstall = Math.max(0, L.iBase + ri * area) * lp;
    laborShow = { mode: prod.laborNoRate ? 'baseOnly' : 'rate', mult: lp, pBase: L.pBase, pRate: rp, iBase: L.iBase, iRate: ri };
  }

  // (5) ราคาขาย
  let sellBeforeLabor, sellMfgOnly, sellWithInstall;
  let sellCostOverride = null;  // รุ่นซื้อมาขายไป (ม่านซิป) — โชว์ทุนจริง = ขาย÷ตัวคูณ
  if (prod.sellR39) {
    const RR = (prod.cascade && scope.ROW) ? scope.ROW : null;
    if (RR && RR.boxP) {
      // ── ระแนง R4.0: ทุนจริง box/โชว์/ช่องห่าง/โครง (ชีต "คิดทุน ระแนง") → ขาย = ทุน×(1+กำไร%) ──
      const Wc = W * 100, Hc = H * 100;                          // ซม.
      const pitch = RR.showCm + RR.spacing;
      const strands = Math.floor(Hc / pitch) + 1;                // จำนวนเส้นใบ
      const perBar = Math.max(Math.floor(600 / Wc), 1);          // ใบ/ท่อน 6 ม. (bar-nest)
      const bars = Math.ceil(strands / perBar);
      const leaf = bars * RR.boxP;
      const frm = RR.frame ? Math.ceil((Hc <= 250 ? 2 : 3) / Math.max(Math.floor(600 / RR.spacing), 1)) * (Math.round(485 * RR.showCm / 5) * 5) : 0;
      const lab = area * 900;                                    // ค่าแรง ผลิต 300 + ติดตั้ง 600 /ตร.ม.
      // สีอบ (fin) ต่อ SKU — R3.9 +เรต/ตร.ม. (sell) → ถอดทุนตาม markup กลาง ÷(1+กำไร%) (เดิม ÷2 ผูก 100% · แก้ 1ก.ค.) · ฐานอบขาว/ดำ ฟรี
      const finRate = (RR.finMap && opt.ranaeFin) ? (RR.finMap[opt.ranaeFin] || 0) : 0;
      const finCost = finRate * area / (1 + (profitPct || 100) / 100);
      const cost = leaf + frm + lab + finCost;
      sellCostOverride = round2(cost);
      sellBeforeLabor = sellMfgOnly = sellWithInstall = ceil100(cost * (1 + profitPct / 100));
      lines.length = 0;
      lines.push({ cat: 'consum', name: 'ใบระแนง ' + RR.box + ' · ' + strands + ' เส้น (' + bars + ' ท่อน)', qty: bars, unit: 'ท่อน', unitPrice: RR.boxP, amount: round2(leaf) });
      if (frm > 0) lines.push({ cat: 'consum', name: 'โครงดาม', qty: 1, unit: 'ชุด', unitPrice: round2(frm), amount: round2(frm) });
      lines.push({ cat: 'labor', name: 'ค่าแรง (ผลิต+ติดตั้ง)', qty: round2(area), unit: 'ตร.ม.', unitPrice: 900, amount: round2(lab) });
      if (finCost > 0) lines.push({ cat: 'consum', name: 'สีอบ ' + opt.ranaeFin + ' (' + finRate + '/ตร.ม.)', qty: round2(area), unit: 'ตร.ม.', unitPrice: round2(finRate / 2), amount: round2(finCost) });
    } else {
      // fallback ราคาขาย R3.9 (รุ่นที่ยังไม่มีต้นทุน) — ตรงสูตร R3.9: max(min, พื้นที่×เรต) ปัดพัน · รวมติดตั้งแล้ว
      const r39k = (scope.ROW && scope.ROW.r39key) || prod.r39key;   // cascade เลือกตารางเรตต่อแบบ (เช่น ราวบันได imp1-6)
      const tiers = (PB.R39RATES && r39k) ? PB.R39RATES[r39k] : null;
      const lenOrArea = prod.r39method === 'per_length_tier' ? W : area;  // ราวบันได = ความยาว(กว้าง)
      let raw;
      if (prod.r39method === 'per_sqm') {
        const rr = (prod.cascade && scope.ROW && scope.ROW.rate) ? scope.ROW.rate : (prod.r39rate || 0);
        // สีอบ (fin) ต่อ SKU — เลือกสี → +เรต/ตร.ม. (R3.9 ซาฮาร่า/อบพิเศษ/ลายไม้ · ฐานอบขาว/ดำ ฟรี)
        const rf = (prod.cascade && scope.ROW && scope.ROW.finMap && opt.ranaeFin) ? (scope.ROW.finMap[opt.ranaeFin] || 0)
          : ((prod.cascade && scope.ROW && scope.ROW.fin) ? scope.ROW.fin : (prod.r39fin || 0));
        raw = area * (rr + rf);
      }
      else if (prod.r39method === 'per_length_tier') raw = lenOrArea * rateOf(lenOrArea, tiers);
      else if (prod.r39method === 'fold_flat') raw = Math.max(prod.r39min || 0, area * (prod.r39unitRate || 0));  // เฟี้ยม X-series: max(min, พื้นที่×เรต/บาน)
      else if (prod.r39method === 'area_rate_addon') {   // เลื่อนภายในรางล่าง: พื้นที่×tier + เพิ่มตามจำนวนบาน
        const am = (prod.r39addon && prod.r39addon.amounts) ? (prod.r39addon.amounts[Math.min(4, Math.max(1, P))] || 0) : 0;
        raw = area * rateOf(area, tiers) + am;
      }
      else raw = area * rateOf(area, tiers);  // bucket / area_rate
      const goods = roundUp1000(Math.max(prod.r39min || 0, raw));
      sellBeforeLabor = sellMfgOnly = sellWithInstall = goods;
      lines.length = 0;
      lines.push({ cat: 'consum', name: (prod.name || 'รายการ') + ' · ราคา R3.9', qty: round2(area), unit: prod.r39method === 'per_length_tier' ? 'ม.' : 'ตร.ม.', unitPrice: round2(area > 0 ? goods / area : goods), amount: goods });
    }
  } else if (prod.sellCabinet) {
    // ตู้อลู Future Tech (G4) — ทุนจริงจาก บานตู้.xlsx (ตารางต่อชนิดบาน×ขนาด×สี) → ขาย = ทุน×(1+กำไร%)
    // ทุนบาน = เส้น/อุปกรณ์(ตาราง ถอดของ) + กระจก(พื้นที่/บาน×300) + วัสดุ1000 + ผลิต1400 + ติดตั้ง700 + ค่ารถ1000
    const dtype = /เปิด/.test(form || '') ? 'เปิด' : 'เลื่อน';
    const dcolor = /ทอง/.test(material || '') ? 'ทอง' : 'ดำ';
    // FT_FRAME = ทุนเส้น+อุปกรณ์/บาน (ถอดของ จริง) · big=สูง>1.5ม. · ทอง-เปิด-เล็ก ประมาณ (เช็คซ้ำ)
    const FT_FRAME = {
      'ดำ': { 'เลื่อน': { big: 2078, small: 1590 }, 'เปิด': { big: 1830, small: 1111 } },
      'ทอง': { 'เลื่อน': { big: 3117, small: 2242 }, 'เปิด': { big: 2869, small: 1742 } },
    };
    const FLAT = 1000 + 1400 + 700 + 1000;        // วัสดุ+ค่าแรงผลิต+ติดตั้ง+ค่ารถ (ต่อบาน · ชีต H/I/J/K)
    const nDoors = P;
    const aPerDoor = (W * H) / nDoors;
    const band = H > 1.5 ? 'big' : 'small';
    const frameHW = FT_FRAME[dcolor][dtype][band];
    // กระจกหน้าบาน ฝ้า/ชาดำ — R3.9 +500/ตร.ม. (sell) → ทุน 250 (×กำไร100% = +500 ตรง R3.9 · ftglasscolor)
    const FACE_GLASS_ADD = { clear: 0, frost: 250, black: 250 };
    const fgAdd = FACE_GLASS_ADD[opt.faceGlass] || 0;
    const fgLbl = { clear: ' · กระจกใส', frost: ' · กระจกฝ้า', black: ' · กระจกชาดำ' }[opt.faceGlass] || '';
    // สีหน้าบานพิเศษ — R3.9 FT_COLOR_PLUS ต่อบาน ตามพื้นที่/บาน (1,500-3,500 sell) → ทุน ÷2
    const FT_COLOR_TIER = [[1.0, 1500], [1.5, 2000], [2.0, 2500], [2.5, 3000], [3.0, 3500]];
    const ftColorSell = a => { for (const [hi, v] of FT_COLOR_TIER) if (a <= hi) return v; return FT_COLOR_TIER[FT_COLOR_TIER.length - 1][1]; };
    const fcAddDoor = (opt.faceColor === 'special') ? ftColorSell(aPerDoor) / 2 : 0;   // ทุน/บาน
    const fcLbl = (opt.faceColor === 'special') ? (' · สีหน้าบานพิเศษ' + (opt.faceColorCode ? ' (รหัส ' + opt.faceColorCode + ')' : '')) : '';
    const costDoor = frameHW + aPerDoor * (300 + fgAdd) + fcAddDoor + FLAT;   // กระจก 300/ตร.ม. + ฝ้า/ชาดำ + สีพิเศษ/บาน
    let cabCost = costDoor * nDoors;
    lines.length = 0;
    lines.push({ cat: 'consum', name: 'บานหน้า Future Tech · ' + dtype + ' · สี' + dcolor + fgLbl + fcLbl + ' · ' + nDoors + ' บาน', qty: nDoors, unit: 'บาน', unitPrice: round2(costDoor), amount: round2(cabCost) });
    if (!prod.faceOnly) {
      const isShoe = opt.kind === 'shoe';                    // ตู้รองเท้า — ชั้นถี่ (R3.9 spacing 0.2) + ลึก 0.4
      const D = opt.depth || (isShoe ? 0.4 : (prod.defDepth || 0.6));
      const spacing = isShoe ? 0.2 : 0.4;
      let nsh = opt.shelves; if (!(nsh >= 1)) nsh = Math.max(2, Math.round(H / spacing));
      // ผนัง/กั้นด้านตู้ — ติ๊กต่อด้าน ซ้าย/ขวา/หลัง + วัสดุ (R3.9 _calcCabinet · min 1 ตร.ม./ด้าน) · default ซ้าย+ขวา อลู (=เดิม)
      const WMAT = { alu: 1383, glass: (opt.wallGlassRate || 1383), smart: (opt.wallSmartRate || 1383) }; // อลูทุนจริง 1383 · กระจก/สมาร์ท: เรตอลูชั่วคราวจนกว่าจะกรอก
      const WLBL = { alu: 'อลูทึบ', glass: 'กระจก', smart: 'สมาร์ทบอร์ด' };
      const sides = opt.cabSides || { left: { on: true, mat: 'alu' }, right: { on: true, mat: 'alu' }, back: { on: false, mat: 'alu' } };
      const wgcAdd = (opt.wallGlassColor === 'frost' || opt.wallGlassColor === 'black') ? 250 : 0;  // สีกระจกผนัง ฝ้า/ชาดำ R3.9 +500/ตร.ม. → ทุน 250 (×กำไร100%)
      const wgcLbl = opt.wallGlassColor === 'frost' ? ' ฝ้า' : (opt.wallGlassColor === 'black' ? ' ชาดำ' : '');
      let wallCost = 0;
      [['left', 'ซ้าย', D * H], ['right', 'ขวา', D * H], ['back', 'หลัง', W * H]].forEach(([k, lbl, autoA]) => {
        const s = sides[k]; if (!s || !s.on) return;
        const a = Math.max(1, (s.w > 0 && s.h > 0) ? s.w * s.h : autoA);
        const mat = s.mat || 'alu', rate = WMAT[mat] || 1383;
        const wc = a * rate + (mat === 'glass' ? wgcAdd * a : 0);   // กระจกผนัง + ส่วนเพิ่มสีฝ้า/ชาดำ
        const pend = mat !== 'alu' && !((mat === 'glass' ? opt.wallGlassRate : opt.wallSmartRate) > 0);
        wallCost += wc;
        lines.push({ cat: 'consum', name: 'ผนังตู้ ' + lbl + ' (' + WLBL[mat] + (mat === 'glass' ? wgcLbl : '') + ')' + (pend ? ' (รอราคาจริง)' : ''), qty: round2(a), unit: 'ตร.ม.', unitPrice: round2(rate + (mat === 'glass' ? wgcAdd : 0)), amount: round2(wc) });
      });
      const glassShelf = opt.shelfMat === 'glass';
      const glassPending = glassShelf && !(opt.glassShelfRate > 0);
      // อัปเกรดกระจกชั้น 6 ระดับ — R3.9 sell: ใส8/10 +1,200 · เทมเปอร์6/8/10 +600/+1,300/+2,100 → ทุน ÷2 (×กำไร100% = ตรง R3.9 · o-shelfglass)
      const GLASS_GRADE_ADD = { clear6: 0, clear8: 600, clear10: 600, temper6: 300, temper8: 650, temper10: 1050, temper: 300 };
      const gradeAdd = glassShelf ? (GLASS_GRADE_ADD[opt.glassGrade] || 0) : 0;
      const shelfRate = (glassShelf ? (opt.glassShelfRate || 1416) : 1416) + gradeAdd;  // ชั้นอลู 1416 (จริง) · ชั้นกระจก: เรตอลูชั่วคราว + อัปเกรดเกรด (X)
      const aShelf = nsh * D * W, shelfCost = aShelf * shelfRate;
      lines.push({ cat: 'consum', name: 'ชั้นวาง ' + (glassShelf ? 'กระจก' : 'อลู') + ' ' + nsh + ' ชั้น' + (glassPending ? ' (กระจก·รอราคาจริง)' : '') + ' (ลึก ' + D + '×กว้าง ' + round2(W) + ' ม.)', qty: round2(aShelf), unit: 'ตร.ม.', unitPrice: round2(shelfRate), amount: round2(shelfCost) });
      cabCost += wallCost + shelfCost;
    }
    sellCostOverride = round2(cabCost);
    sellBeforeLabor = sellMfgOnly = sellWithInstall = ceil100(cabCost * (1 + profitPct / 100));
  } else if (prod.sellZip) {
    // ม่านซิป R4.0 — ซื้อสำเร็จจากจีน (¥×เรต = ทุน) → ×ตัวคูณ (กำไร 100%) = ขาย
    // ขาย = พื้นที่ × ราคาขายผ้า+โครง/ตร.ม.(ตาม series+ผ้า) + มอเตอร์ + รีโมท (แยกราคา)
    const Z = prod.zip;
    const fab = (material != null) ? material : '5';
    let ser = ({ 'อัตโนมัติ': 'auto', 'Z100': 'Z100', 'Z120': 'Z120', 'Double 2 ชั้น': 'Z200D', 'Ultra Wide': 'Z120W', 'Skylight 100': 'Z100S', 'Skylight 120': 'Z120S' })[form] || 'auto';
    if (ser === 'auto') ser = W > 5 ? 'Z120W' : (H > 3 ? 'Z120' : 'Z100');
    const S = Z.series[ser] || Z.series.Z100;
    const Hc = Math.max(H, S.minH || 1.5);                 // สูงต่ำสุดบังคับ (Hunan)
    const a = Math.max(W * Hc, S.minA || 3);                // พื้นที่ขั้นต่ำ
    const fabMissing = S.fab[fab] == null;
    let fabRate = S.fab[fab]; if (fabRate == null) fabRate = S.fab['5'] || S.fab['0'] || Object.values(S.fab)[0];
    const fabSell = a * fabRate;
    // เตือนเซล (R3.9 msgsZ) — cat:'warn' ไม่โผล่ใน BOM breakdown · UI โชว์ใต้ราคา
    const zWarn = [];
    if (S.maxW && W > S.maxW) zWarn.push('⚠️ กว้างเกินรุ่น ' + ser + ' (สูงสุด ' + S.maxW + ' ม.)');
    if (S.maxH && H > S.maxH) zWarn.push('⚠️ สูงเกินรุ่น ' + ser + ' (สูงสุด ' + S.maxH + ' ม.)');
    if (fabMissing) zWarn.push('⚠️ รุ่น ' + ser + ' ไม่มีผ้า ' + fab + ' — คิดเรตผ้า 5% แทน');
    if (W * H > 0 && W * H < (S.minA || 3)) zWarn.push('ℹ️ คิดพื้นที่ขั้นต่ำ ' + (S.minA || 3) + ' ตร.ม. (กรอก ' + round2(W * H) + ')');
    if (H > 0 && H < (S.minH || 1.5)) zWarn.push('ℹ️ สูงต่ำสุด ' + (S.minH || 1.5) + ' ม. (คิดที่ขั้นต่ำ)');
    let motorKey = opt.motor || (ser === 'Z120W' ? (W > 15 ? 'uwdual' : 'uw') : ((ser === 'Z100S' || ser === 'Z120S') ? 'sky' : 'dooya'));
    const motorSell = Z.motor[motorKey] || 0;
    const remoteSell = opt.noRemote ? 0 : (Z.acc.remote1 || 0);
    const sell = Math.round(fabSell + motorSell + remoteSell);
    sellBeforeLabor = sellMfgOnly = sellWithInstall = sell;
    sellCostOverride = sell / (Z.mult || 2);                // ทุนนำเข้า = ขาย ÷ ตัวคูณ
    lines.length = 0;
    lines.push({ cat: 'consum', name: 'ผ้า+โครง ' + ser + ' · ผ้า ' + fab + ' (' + round2(a) + ' ตร.ม.)', qty: round2(a), unit: 'ตร.ม.', unitPrice: fabRate, amount: round2(fabSell) });
    lines.push({ cat: 'hardware', name: 'มอเตอร์ ' + (Z.motorLabel[motorKey] || motorKey), qty: 1, unit: 'ชุด', unitPrice: motorSell, amount: motorSell });
    if (remoteSell > 0) lines.push({ cat: 'hardware', name: 'รีโมท 1 ตัว', qty: 1, unit: 'ตัว', unitPrice: remoteSell, amount: remoteSell });
    zWarn.forEach(w => lines.push({ cat: 'warn', name: w, amount: 0 }));
  } else if (prod.sellDirect) {
    // ของซื้อสำเร็จ — ราคาขาย = พื้นที่ × เรต/ตร.ม. (B เป็นราคาขายแล้ว ไม่ ×กำไร) + ค่าแรงติดตั้ง/ตร.ม.
    let aSell = area, hNote = '';
    if (prod.heightRound && H > 0 && H <= 3.0) {   // ลูกฟูก/ระแนง: ปัดสูงตามแผ่นสต็อก (R3.9 ranaeHeight [1/1.2/1.5/2/3] · ซื้อเต็มแผ่น=ทุนจริง)
      for (const v of [1.0, 1.2, 1.5, 2.0, 3.0]) { if (H <= v + 1e-9) { if (Math.abs(v - H) > 1e-9) { aSell = W * v; hNote = ' (ปัดสูง ' + round2(H) + '→' + v + 'ม.)'; } break; } }
    }
    const rate = val(prod.sellRate);
    const irate = prod.sellInstallRate ? val(prod.sellInstallRate) : 0;
    const minSell = prod.sellMin ? val(prod.sellMin) : 0;       // ราคาขายขั้นต่ำต่อชนิด (รังผึ้ง/ม้วนเตะ ฯลฯ)
    let matBase = aSell * rate; const minHit = (minSell > 0 && matBase < minSell); if (minHit) matBase = minSell;
    if (prod.sellAdd) matBase += val(prod.sellAdd);   // บวกค่าคงที่หลัง min (เช่น บานเปลือยสวิง/เลื่อน +8,000/บาน · R3.9 ref_plus_panel)
    let rnDisc = 0;
    if (prod.ranaeDisc) { const d = area > 30 ? 0.15 : area > 20 ? 0.11 : area > 15 ? 0.08 : area > 10 ? 0.05 : 0; if (d > 0) { rnDisc = ceil100(matBase) - ceil100(matBase * (1 - d)); } }
    sellBeforeLabor = sellMfgOnly = ceil100(matBase) - rnDisc;
    sellWithInstall = sellMfgOnly + ceil100(aSell * irate);
    lines.length = 0;
    const sdName = (prod.name || 'รายการ');   // เลิกคำ "สำเร็จ" (R3.9 ไม่มี · พี่สั่ง 1ก.ค.) — ใช้ชื่อรุ่นจริง
    lines.push({ cat: 'consum', name: sdName + (material ? ' ' + material : '') + hNote + (minHit ? ' (ขั้นต่ำ)' : ''), qty: round2(aSell), unit: 'ตร.ม.', unitPrice: rate, amount: round2(matBase) });
    if (rnDisc > 0) lines.push({ cat: 'discount', name: 'ส่วนลดปริมาณ ' + Math.round((area > 30 ? 15 : area > 20 ? 11 : area > 15 ? 8 : 5)) + '% (พื้นที่ ' + round2(area) + ' ตร.ม.)', qty: 1, unit: '', unitPrice: -rnDisc, amount: -rnDisc });
    if (irate > 0) lines.push({ cat: 'labor', name: 'ค่าแรงติดตั้ง', qty: round2(aSell), unit: 'ตร.ม.', unitPrice: irate, amount: round2(aSell * irate) });
  } else {
    sellBeforeLabor = ceil100(costTotal * (1 + pctMat / 100));
    sellMfgOnly = sellBeforeLabor + ceil100(laborProd * (1 + pctProd / 100));
    sellWithInstall = sellMfgOnly + ceil100(laborInstall * (1 + pctInst / 100));
    // ค่าดำเนินการ % — ไฟล์ถอดทุน v20 บวกทับราคาขายอีกชั้น (ช่อง "ค่าดำเนินการ %" ท้ายชีต)
    //   สูตรในไฟล์: ขายผลิต = ปัดร้อย( (ขายวัสดุ + ขายค่าแรงผลิต) × (1+op%) )
    //               ขาย+ติดตั้ง = ขายผลิต + ปัดร้อย( ขายค่าแรงติดตั้ง × (1+op%) )
    //   เปิดทีละรุ่นด้วย prod.opCostPct — รุ่นที่ไม่ตั้งไว้ ราคาไม่ขยับ (เจ้าของสั่งพอร์ตเฉพาะบานยก 31 ส.ค.69)
    const opPct = Number(prod.opCostPct) || 0;
    if (opPct > 0) {
      const instSell = sellWithInstall - sellMfgOnly;
      sellMfgOnly = ceil100(sellMfgOnly * (1 + opPct / 100));
      sellBeforeLabor = ceil100(sellBeforeLabor * (1 + opPct / 100));
      sellWithInstall = sellMfgOnly + ceil100(instSell * (1 + opPct / 100));
    }
    // ส่วนลดปริมาณระแนง/รั้ว (R3.9 ranaeDisc) — ลดเฉพาะค่าของ(งานผลิต) ไม่ลดค่าติดตั้ง
    if (prod.ranaeDisc) {
      const d = area > 30 ? 0.15 : area > 20 ? 0.11 : area > 15 ? 0.08 : area > 10 ? 0.05 : 0;
      if (d > 0) {
        const inst = sellWithInstall - sellMfgOnly;          // ค่าติดตั้ง (ไม่ลด)
        const before = sellMfgOnly;
        sellBeforeLabor = ceil100(sellBeforeLabor * (1 - d));
        sellMfgOnly = ceil100(sellMfgOnly * (1 - d));
        sellWithInstall = sellMfgOnly + inst;
        lines.push({ cat: 'discount', name: 'ส่วนลดปริมาณ ' + Math.round(d * 100) + '% (พื้นที่ ' + round2(area) + ' ตร.ม.)', qty: 1, unit: '', unitPrice: round2(-(before - sellMfgOnly)), amount: round2(-(before - sellMfgOnly)) });
      }
    }
  }

  // (6) ออปชั่นเสริม (add-on) — แต่ละตัวเป็นบรรทัดราคาแยก บวกเข้ายอดขาย (ราคา R3.9 ยังไม่ถอดทุน · flag)
  // computeAddon คืน object เดียว หรือ array (มอเตอร์ = หลายบรรทัด: ตัวมอเตอร์+ฟันเฟือง+เซนเซอร์)
  // r.cost (ถ้ามี) = ทุนจริง (มอเตอร์/ออโต้ ถอดจาก "ราคาออโต้") → ไม่ใช่ ÷2 · ไม่มี = R3.9 ทุน≈ขาย÷2
  const selAddons = opt.addons || {};
  let addonTotal = 0, addonCostExplicit = 0, addonSellImplicit = 0;
  for (const ad of (prod.addons || [])) {
    const rr = computeAddon(ad, selAddons[ad], { W, H, P, area, opt, PB });
    if (!rr) continue;
    for (const r of (Array.isArray(rr) ? rr : [rr])) {
      if (!r) continue;
      if (r.cat === 'warn') { lines.push({ cat: 'warn', name: r.label, amount: 0 }); continue; }   // คำเตือน (เช่น มอเตอร์เกินพื้นที่) — โชว์ ไม่บวกเงิน
      if (r.amount > 0) {
        addonTotal += r.amount;
        if (r.cost != null) addonCostExplicit += r.cost;     // ทุนจริง (มอเตอร์ ฯลฯ)
        else addonSellImplicit += r.amount;                  // R3.9 → ÷2
        // cost = ทุนจริงของชุดออโต้ (ชีตราคาออโต้) — ติดไปกับบรรทัดด้วย ให้หน้าจอ/เทสตรวจได้ว่าตรงไฟล์
        lines.push({ cat: 'addon', name: r.label, qty: r.qty || 1, unit: r.unit || '', unitPrice: r.unitPrice || r.amount, amount: round2(r.amount), ...(r.cost != null ? { cost: round2(r.cost) } : {}) });
      }
    }
  }
  // (6b) ค่าทาสีผนังเพิ่มเติม (R3.9 wallpaintprice · กรอกมือ · sell-based · default 0 = ไม่มีผล) — ผนัง G3
  const _wpp = +((opt.spec || {}).wallpaintprice) || 0;
  if (_wpp > 0) { lines.push({ cat: 'addon', name: 'ค่าทาสีผนังเพิ่มเติม (R3.9)', qty: 1, unit: 'งาน', unitPrice: _wpp, amount: _wpp }); addonTotal += _wpp; addonSellImplicit += _wpp; }
  // #1 แผ่นคอมโพสิต/ลูกฟูก แทนกระจก (sell-based) — บวกเข้ายอดขาย + ถอดทุนที่ markup กลาง (เหมือน add-on R3.9)
  if (panelSell > 0) { addonTotal += panelSell; addonSellImplicit += panelSell; }
  if (addonTotal > 0) { sellBeforeLabor += addonTotal; sellMfgOnly += addonTotal; sellWithInstall += addonTotal; }
  // ราคาขายส่ง (ผลิตอย่างเดียว ไม่ไปติดตั้ง) — ลดจากยอดรวมอีก % ตามนโยบายขายส่ง (เจ้าของสั่ง 7 ส.ค.69)
  //   คิดจากยอด "ขายผลิตอย่างเดียว" ที่รวมของเสริมแล้ว → ราคาที่ลูกค้าเห็น = ราคาผลิต − 10%
  //   ⚠ sellMfgOnly ตัวเดิมต้องคงไว้เป็นค่าตามชีตคิดทุน (ด่าน verify-r40 เทียบตัวนี้) — ส่วนลดเป็นชั้นนโยบาย แยกกัน
  const wsPct = PB.WHOLESALE_DISCOUNT_PCT != null ? Number(PB.WHOLESALE_DISCOUNT_PCT) : 0;
  const sellMfgOnlyNet = wsPct > 0 ? ceil100(sellMfgOnly * (1 - wsPct / 100)) : sellMfgOnly;
  // ทุนออปชั่น = ทุนจริง(มอเตอร์) + ถอดทุนจากราคาขาย R3.9 ตาม markup กลาง (÷(1+กำไร%) · เดิม ÷2 ตายตัว=ผูก 100% · แก้ 1ก.ค. ให้ขยับ markup ไม่เพี้ยน) · ที่ 100% = เท่าเดิม
  const addonCost = round2(addonCostExplicit + addonSellImplicit / (1 + (profitPct || 100) / 100));
  const costBase = sellCostOverride != null ? sellCostOverride : costTotal;
  const costTotalOut = round2(costBase + addonCost);
  return {
    input: { W, H, P, form, area: round2(area), color, colorName: colorDisp, material, glassType, brand, mult: round3(mult), profitPct, installProfitPct, sheetColor: opt.sheetColor || '', roofMat: !!opt.roofMat },
    cost: {
      alu: round2(aluCost), bake: round2(bakeCost), openOven, glass: round2(glassCost),
      hardware: round2(hwCost), consum: round2(consumCost + addonCost), total: costTotalOut,
    },
    profit: round2(sellWithInstall - costTotalOut),  // กำไร (ขาย − ทุน)
    glassArea: round2(glassArea), aluKg: round2(aluKg),
    profit3: { mat: pctMat, prod: pctProd, inst: pctInst },   // % ที่ใช้จริง (หน้าจอเอาไปโชว์/แก้)
    // อุปกรณ์จากใบตัด: ใช้จริงไหม + รหัสไหนยังไม่ตั้งราคาในสโตร์ (หน้าจอเอาไปเตือน)
    hwFromCutlist: !!hwLines, hwMissing,
    aluFromCutlist: !!(opt.aluLines && opt.aluLines.length),
    // รหัสที่ยังใช้ "ราคาจากไฟล์ถอดทุน" (สโตร์ยังไม่ตั้งราคา) — หน้าจอเตือนให้ไปตั้งในสโตร์
    hwFileFallback: (hwLines || []).filter((it) => (Number(it.qty) || 0) > 0 && hwFromFile(it))
      .map((it) => ({ sku: String(it.sku || '').toUpperCase(), name: it.name })),
    costPerSqm: area > 0 ? round2(costTotal / area) : 0,
    labor: { prod: round2(laborProd), install: round2(laborInstall) },
    laborCalc: { ...laborShow, key: prod.laborKey || '', area: round2(area), panels: P },
    // mfgOnly = ตามสูตรชีตคิดทุน (อย่าเอาไปโชว์/ขึ้นใบตรง ๆ) · mfgOnlyNet = ราคาขายส่งจริงหลังลด wholesalePct
    sell: { beforeLabor: sellBeforeLabor, mfgOnly: sellMfgOnly, mfgOnlyNet: sellMfgOnlyNet, withInstall: sellWithInstall, wholesalePct: wsPct },
    lines,
  };
}

// ราคาจาก PB section (แอดมินแก้ได้) — ref="STEEL.box1" → PB.STEEL.box1 · ไม่มี = null (ใช้ price เดิม fallback)
function refPrice(PB, ref) { const i = ref.indexOf('.'); if (i < 0) return null; const sec = PB[ref.slice(0, i)]; if (!sec) return null; const v = sec[ref.slice(i + 1)]; return (typeof v === 'number') ? v : null; }
// ราคาขายมอเตอร์/ออโต้ — ขาย = max(ceil100(ทุน×2.5), floor) · ตัวมอเตอร์ floor=6,000 (เซอร์วิสแพง) · อะไหล่ floor=0 (พี่เคาะ 30มิ.ย.)
// ⚠ เลิกใช้กับชุดออโต้แล้ว (เหลือไว้เผื่อของเก่า) — ชีตถอดทุนเขียนกำกับหัวบล็อกว่า
//   "— ชุด auto (ออปชั่น) — บวกเข้าทุน × กำไร%" คือ เอาทุนบวกเข้าค่าของ แล้วคูณกำไร% ปกติ
//   ไม่ใช่ ×2.5 ขั้นต่ำ 6,000 (กติกาเก่า R3.9) — เจ้าของยืนยัน 3 ก.ย.69 "ราคาเป็นราคาทุน ใส่ไปเลย ค่าของสุดท้ายเรา ×2"
function motorSell(cost, floor = 6000) { return Math.max(ceil100((+cost || 0) * 2.5), floor); }
/** ราคาขายชุดออโต้/มอเตอร์ = ทุน × (1 + กำไร%) ตามชีต "— ชุด auto (ออปชั่น) — บวกเข้าทุน × กำไร%" */
function autoSell(cost, ctx) {
  const pct = Number(ctx && ctx.opt && ctx.opt.profitPct);
  return ceil100((+cost || 0) * (1 + (Number.isFinite(pct) ? pct : 100) / 100));
}
function motorCost(PB, key, fallback) { const v = PB && PB.MOTOR && PB.MOTOR[key]; return (typeof v === 'number') ? v : fallback; }
/**
 * มอเตอร์ / ชุดออโต้ ที่แต่ละรุ่นเลือกได้ — ตรงกับชีต "ราคาออโต้" ในไฟล์ถอดทุน (หมวดใครหมวดมัน)
 * ใช้โชว์บนหน้าเทียบ เพื่อตรวจว่า "ขึ้นตามประเภทบาน ไม่ขึ้นมั่ว" (เจ้าของสั่ง 3 ก.ย.69)
 * ⚠ ราคาทุกตัว = ทุน (ตามชีต) · ราคาขาย = ทุน × กำไร% เหมือนค่าของอื่น
 */
export function autoSetsFor(PB, prod) {
  if (!prod) return [];
  const C = (k, fb) => motorCost(PB, k, fb);
  const ads = prod.addons || [], out = [];
  const row = (group, label, cost, note) => out.push({ group, label, cost: round2(cost), note: note || '' });
  if (ads.includes('motor')) {
    const ship = C('บานยก ค่าส่ง', 1700);
    row('บานยก / เฟี้ยมยก', 'ยก 80 กก.', C('บานยก ยก80', 4500) + ship, 'รวมค่าส่ง 1,700');
    row('บานยก / เฟี้ยมยก', 'ยก 300 กก.', C('บานยก ยก300', 12500) + ship, 'รวมค่าส่ง 1,700');
  }
  if (ads.includes('slide_motor')) {
    const ship = C('หลังคาเลื่อน ค่าส่ง', 1700);
    for (const [k, key, fb] of [['80', 'หลังคาเลื่อน ยก80', 4500], ['300', 'หลังคาเลื่อน ยก300', 12500], ['1500', 'หลังคาเลื่อน ยก1500', 13325]])
      row('หลังคาเลื่อน', 'ยก ' + k + ' กก.', C(key, fb) + ship, 'รวมค่าส่ง 1,700' + (k === '1500' ? ' · รวมฟันเฟือง+เซนเซอร์อัตโนมัติ' : ''));
    row('หลังคาเลื่อน', 'ฟันเฟือง (เฉพาะ 1500)', C('ฟันเฟือง/ม.', 340), 'บาท/ม. × ระยะเลื่อน');
    row('หลังคาเลื่อน', 'เซนเซอร์กันฝน', C('เซนเซอร์กันฝน', 1100), 'บังคับมีกับ 1500 กก.');
  }
  if (ads.includes('banklet_motor')) row('บานเกล็ด 38.1', 'มอเตอร์บานเกล็ด', C('บานเกล็ด', 1800), 'ไม่มีค่าส่ง');
  if (ads.includes('awn_auto')) {
    for (const [l, k, fb] of [['โช็ค เปิด 50', 'กระทุ้ง โช้ค50', 3575], ['โช็ค เปิด 80', 'กระทุ้ง โช้ค80', 3725], ['โซ่เดี่ยว 50', 'กระทุ้ง โซ่เดี่ยว50', 1900], ['โซ่คู่ 50', 'กระทุ้ง โซ่คู่50', 2600]])
      row('บานกระทุ้ง', l, C(k, fb), '× จำนวนบาน + ค่าส่ง 1,700 ครั้งเดียว');
    row('บานกระทุ้ง', 'อุปกรณ์พิเศษ (โช็ค 2 ตัว)', C('กระทุ้ง อุปกรณ์พิเศษ', 600), 'บวกเมื่อใช้โช็ค ≥ 2 บาน');
  }
  if (ads.includes('slide_auto')) {
    const br = Array.isArray(prod.autoBrands) ? prod.autoBrands : ['evecca', 'changsaek', 'slimlux'];
    if (br.includes('evecca')) {
      row('เลื่อน SMS/ยูโร', 'Evecca (จีน)', C('เลื่อน Evecca', 13480) + C('เลื่อน Evecca ค่าส่ง', 1700), 'รวมค่าส่ง 1,700 · 1 บาน');
      row('เลื่อน SMS/ยูโร', 'สายพาน Evecca', C('เลื่อน Evecca สายพาน/ม.', 75), 'บาท/ม. = กว้าง×2');
      row('เลื่อน SMS/ยูโร', 'ออป Smart lock', C('เลื่อน Evecca Smart lock', 6500), 'ออปชั่น');
    }
    if (br.includes('changsaek')) {
      row('เลื่อน SMS/ยูโร', 'ช่างแซก', C('เลื่อน ช่างแซก', 8000), 'ไม่มีค่าส่ง · ทั้งก้อน × จำนวนบาน สูงสุด 3');
      row('เลื่อน SMS/ยูโร', 'เซฟตี้ตาแมว', C('เลื่อน ช่างแซก ตาแมว', 1000), 'บังคับคู่ช่างแซก');
      row('เลื่อน SMS/ยูโร', 'ราง ช่างแซก', C('เลื่อน ช่างแซก ราง/ม.', 950), 'บาท/ม. = กว้างช่อง');
      row('เลื่อน SMS/ยูโร', 'ออป Touch Switch', C('เลื่อน ช่างแซก Touch', 1000), 'ออปชั่น');
      row('เลื่อน SMS/ยูโร', 'ออป Infrared', C('เลื่อน ช่างแซก Infrared', 9000), 'ออปชั่น');
    }
    if (br.includes('slimlux')) {
      row('SlimLux', 'ชุด SlimLux (บานแรก)', C('เลื่อน SlimLux ชุดแรก', 6900), 'สูตรในชีตไม่บวกค่าส่ง');
      row('SlimLux', 'บานเพิ่ม', C('เลื่อน SlimLux บานเพิ่ม', 2250), 'บาท/บานเพิ่ม');
      row('SlimLux', 'ราง SlimLux', C('เลื่อน SlimLux ราง/ม.', 1100), 'บาท/ม. = กว้าง × จำนวนบาน');
      row('SlimLux', 'ออป สแกนหน้า', C('เลื่อน SlimLux สแกนหน้า', 2750), 'บังคับเลือก 1 ใน 2');
      row('SlimLux', 'ออป Touch Switch', C('เลื่อน SlimLux Touch', 100), 'บังคับเลือก 1 ใน 2');
    }
  }
  if (ads.includes('gate_motor')) {
    row('ประตูรั้ว', 'มอเตอร์ประตูรั้ว', C('ประตูรั้ว', 10000), '1 ตัวรวมในชุดแล้ว · เลือกเพิ่มได้');
    row('ประตูรั้ว', 'รีโมทประตูรั้ว', 500, 'บาท/ตัว — กรอกจำนวนในช่องรีโมท');
    row('ประตูรั้ว', 'เดินไฟ (เหมา)', C('ประตูรั้ว เดินไฟ', 2000), 'บาท/ชุด — เลือกในช่อง "เดินไฟ"');
  }
  if ((prod.consum || []).some((c) => c.name === 'มอเตอร์ระแนงหมุน'))
    row('ระแนงหมุน', 'มอเตอร์ระแนงหมุน', C('ระแนงหมุน', 1800), 'รวมส่งแล้ว · ปิดได้ที่ช่อง "ชุดมอเตอร์"');
  return out;
}

// ตารางราคามือจับ (แหล่งเดียว · ใช้ทั้ง engine คิดเงิน + UI โชว์ป้าย · แก้ที่เดียวตรงกัน)
export const CMECH_TIERS = {
  embed_door_normal: { p: 1050, l: 'ฝัง ประตู สีปกติ' }, embed_door_special: { p: 1470, l: 'ฝัง ประตู ชุบพิเศษ' },
  embed_window_normal: { p: 350, l: 'ฝัง หน้าต่าง สีปกติ' }, embed_window_special: { p: 490, l: 'ฝัง หน้าต่าง ชุบพิเศษ' },
  metro_door_normal: { p: 1000, l: 'เมโทร ประตู สีปกติ' }, metro_door_special: { p: 1400, l: 'เมโทร ประตู ชุบพิเศษ' },
  metro_window_normal: { p: 600, l: 'เมโทร หน้าต่าง สีปกติ' }, metro_window_special: { p: 840, l: 'เมโทร หน้าต่าง ชุบพิเศษ' },
  awn_normal: { p: 600, l: 'หลบมุ้ง สีปกติ' }, awn_special: { p: 840, l: 'หลบมุ้ง ชุบพิเศษ' },
};
export const STAINLESS_TIERS = { '30': { p: 1500, l: '30.5 ซม.' }, '45': { p: 2000, l: '45 ซม.' }, '60': { p: 2000, l: '60 ซม.' }, '80': { p: 2500, l: '80 ซม.' }, '100': { p: 3000, l: '100 ซม.' }, '120': { p: 3200, l: '120 ซม.' } };
// เรตออปชั่นราคาคงที่ (แหล่งเดียว · ใช้ทั้ง engine คิดเงิน + ป้ายปุ่ม UI) — แก้ที่นี่ที่เดียว ป้าย+ราคาขยับตรงกัน (ป้องกันป้ายโกหก)
export const ADDON_FLAT = { soft_close: 4000, sling: 2000, hide_beam: 4000, u_track: 4000, beam_support: 4000, hide_track: 4000, gate_curve: 4000, shower_black: 4000, shower_gold: 6000 };
// เรตฝ้าใต้หลังคา/ฝ้าในห้อง ฿/ตร.ม. ตามชนิด (R3.9 · +ฉนวน 600) — แหล่งเดียว ใช้ทั้ง engine (ceil_under) + app (G3/G6) · global หลัง deModule
export const CEIL_RATE = { 'ฉาบเรียบ': 480, 'อลูตัวซี': 2100, 'อลูไทยทิพย์': 2100, 'ไม้เทียม remood': 2600, 'ระแนงอลู 1×5': 3300, 'ระแนงอลู เว้นร่อง': 3700 };
// เกล็ด Z (บานเกล็ด) — ใช้ "แทนกระจก" หรือ "แผ่นทึบล่าง" · ราคา "ขาย"/ตร.ม. ตามขนาด + สีตามอลูหลัก (เจ้าของเคาะ 21ก.ค.69)
//   ฐาน = อบขาว/ดำ (white) · เปลี่ยนสี = +surcharge/ตร.ม. ตามหมวดค่าอบ (sell-based เหมือนแผ่นคอมโพสิต) · แหล่งเดียว ใช้ทั้งแทนกระจก+แผ่นทึบล่าง
export const Z_LOUVRE = {
  '1':   { base: 3600, label: 'เกล็ด Z 1"',   sur: { white: 0, sahara: 300, woodStock: 1000, special: 1500, woodSpecial: 2200 } },
  '1.6': { base: 4900, label: 'เกล็ด Z 1.6"', sur: { white: 0, sahara: 500, woodStock: 1600, special: 2200, woodSpecial: 3100 } },
};
export function zRate(size, color) {
  const z = Z_LOUVRE[size]; if (!z) return 0;
  return z.base + (z.sur[color] ?? 0);
}
function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
function round3(x) { return Math.round((x + Number.EPSILON) * 1000) / 1000; }
function colorLabel(c) {
  return ({ white: 'อบขาว/ดำ', sahara: 'เทาซาฮาร่า', special: 'สีอบพิเศษ', woodSpecial: 'ลายไม้อบพิเศษ', woodStock: 'ลายไม้สต็อค' })[c] || c;
}

// ── ออปชั่นเสริม (add-on) — คืน {label,qty,unit,unitPrice,amount} หรือ null ถ้าไม่เลือก ──
// ราคาอ้างอิง R3.9 (ยังไม่ถอดทุน R4.0 · ติดป้าย "(R3.9)") — W,H เป็นเมตร
export function computeAddon(id, sel, ctx) {
  if (sel == null || sel === 'none' || sel === false || sel === '') return null;
  const W = ctx.W, H = ctx.H;
  if (id === 'frame_wrap') {            // ครอบวงกบอลู (รอบวงกบ × เรตตามเกรดสี · Excel มด: 700/800/1,200/1,300)
    const sides = (sel === '4') ? 4 : 3;
    const perim = sides === 4 ? 2 * (W + H) : (2 * H + W);   // 3 ด้าน = บน+ข้าง 2 · 4 ด้าน = รอบ
    const bake = (ctx.opt && ctx.opt.color) || 'white';      // เกรดสีตามสีโครงหลัก
    const rate = ({ white: 700, sahara: 700, woodStock: 800, special: 1200, woodSpecial: 1300 })[bake] || 700;
    return { label: 'ครอบวงกบอลู ' + sides + ' ด้าน', qty: round2(perim), unit: 'ม.', unitPrice: rate, amount: perim * rate };
  }
  if (id === 'handrail_grip') {         // ราวจับด้านบน (R3.9: ยู 5หุน 500/ม. · กล่อง 1"×2" 600/ม. · W=ความยาว)
    const rate = sel === 'u5' ? 500 : sel === 'box' ? 600 : 0;
    if (rate <= 0) return null;
    return { label: 'ราวจับด้านบน (' + (sel === 'u5' ? 'ยู 5 หุน' : 'กล่อง 1"×2"') + ')', qty: round2(W), unit: 'ม.', unitPrice: rate, amount: round2(rate * W) };
  }
  if (id === 'closer') {                // โช้คอัพประตู (ทุกชนิด +5,000 · ชนิดพิมพ์ลงใบ · R3.9)
    const CL = { arm: 'โช้คแขนยื่น', slide: 'โช้ครางเลื่อน', fold: 'บานพับโช้ค', yes: 'โช้คอัพประตู' };
    const nm = CL[sel] || 'โช้คอัพประตู';
    return { label: nm + ' (R3.9)', qty: 1, unit: 'ชุด', unitPrice: 5000, amount: 5000 };
  }
  if (id === 'thresh') {                // ธรณี — หลังเต่า+Drop Seal +1,000 · หลังเต่า+สักหลาด/ไม่มีธรณี ฟรี (R3.9)
    if (sel === 'turtle') return { label: 'ธรณีหลังเต่า + Drop Seal (R3.9)', qty: 1, unit: 'ชุด', unitPrice: 1000, amount: 1000 };
    return null;   // turtle_felt (สักหลาด) / none (ไม่มีธรณี) / std (กันน้ำมาตรฐาน) = ฟรี +0
  }
  if (id === 'grid') {                  // คาดตาราง (เส้นนอน/ตั้ง × ความยาว × เรตสี + เส้นโค้ง × 3,000)
    const nh = (sel.nh | 0), nv = (sel.nv | 0), nc = (sel.nc | 0), rate = sel.rate || 200;
    // custom ความยาวเส้น (ม.) — เจ้าของเคาะ 17ก.ค.69: ตั้งขนาดเองได้ · ไม่ตั้ง = อัตโนมัติตามกว้าง/สูงบาน (พฤติกรรมเดิม · parity)
    const hLen = +sel.hLen > 0 ? +sel.hLen : W;
    const vLen = +sel.vLen > 0 ? +sel.vLen : H;
    const custom = (+sel.hLen > 0 || +sel.vLen > 0);
    const len = nh * hLen + nv * vLen, curveC = nc * 3000;
    if (len <= 0 && curveC <= 0) return null;
    return { label: 'คาดตาราง ' + nh + 'นอน+' + nv + 'ตั้ง' + (nc ? '+โค้ง ' + nc + 'เส้น' : '') + (custom ? ' (กำหนดขนาดเอง)' : '') + ' (R3.9)', qty: round2(len), unit: 'ม.', unitPrice: rate, amount: round2(len * rate + curveC) };
  }
  if (id === 'digihandle') {            // มือจับดิจิตอล (sel = ราคา จาก DIGI) · nc + บานเปิดยูโร → +โช้ค 5,000 (R3.9)
    const pr = +sel || 0;
    if (pr <= 0) return null;
    const ncAdd = (ctx.opt && ctx.opt.digiNc) ? 5000 : 0;
    const n = (ctx.opt && ctx.opt.handleQty > 0) ? Math.round(ctx.opt.handleQty) : 1;   // จำนวนชุด (เจ้าของเคาะ 24ส.ค.69) — default 1 = พฤติกรรมเดิม
    const unitPrice = pr + ncAdd;
    return { label: 'มือจับดิจิตอล' + (ncAdd ? ' +โช้ค 1 ตัว (บานหลัก)' : '') + (n > 1 ? ' × ' + n + ' ชุด' : '') + ' (R3.9)', qty: n, unit: 'ชุด', unitPrice, amount: unitPrice * n };
  }
  if (id === 'mosquito') {              // มุ้งบวกบาน — ใช้ราคา R4.0 จาก cost-engine มุ้ง (app คำนวณส่งมาทาง opt.mosquitoR4)
    const r4 = ctx.opt && ctx.opt.mosquitoR4;
    if (r4 && r4.amount > 0) return { label: r4.label + ' (R4.0)', qty: round2(ctx.area), unit: 'ตร.ม.', unitPrice: round2(r4.amount / (ctx.area || 1)), amount: r4.amount };
    // fallback (ถ้า app ไม่ส่ง R4.0 มา) — ราคา R3.9 ประมาณ
    const M = { small: { rate: 1700, min: 2400, label: 'มุ้งเฟรมเล็ก' }, big: { rate: 1500, min: 7200, label: 'มุ้งเฟรมใหญ่' }, safety: { rate: 5000, min: 5000, label: 'มุ้งนิรภัย' } };
    const m = M[sel]; if (!m) return null;
    return { label: m.label + ' (R3.9)', qty: round2(ctx.area), unit: 'ตร.ม.', unitPrice: m.rate, amount: Math.max(m.min, ctx.area * m.rate) };
  }
  // ── ออปชั่น R4.0 (ทุนจีน×2 · ไม่ติดป้าย R3.9) ──
  if (id === 'zip_smart') {             // ม่านซิป Smart Module (Wi-Fi/Voice/App) — ทุนจีน ¥80×5×2
    return { label: 'Smart Module (Wi-Fi/Voice/App)', qty: 1, unit: 'ชิ้น', unitPrice: 800, amount: 800 };
  }
  if (id === 'zip_remote') {            // ม่านซิป รีโมทเพิ่ม (Multi Frequency)
    const n = +sel || 0;
    return n > 0 ? { label: 'รีโมทเพิ่ม ' + n + ' ตัว (Multi)', qty: n, unit: 'ตัว', unitPrice: 400, amount: n * 400 } : null;
  }
  if (id === 'pullrod') {               // ก้านดึงมือ (มือดึงสำรองไฟดับ) 250/ชุด
    const n = +sel || 0;
    return n > 0 ? { label: 'ก้านดึงมือ (สำรองไฟดับ) ' + n + ' ชุด', qty: n, unit: 'ชุด', unitPrice: 250, amount: n * 250 } : null;
  }
  if (id === 'roof_zip') {              // ม่านซิปบนหลังคา (Skylight 100/120) — app คิดผ่าน computeCost(zipscreen) จริง ส่งเข้า opt.roofZipR4 (แบบ mosquito)
    const r4 = ctx.opt && ctx.opt.roofZipR4;
    if (!r4 || !(r4.amount > 0)) return null;
    return { label: r4.label, qty: 1, unit: 'ชุด', unitPrice: r4.amount, amount: r4.amount, cost: r4.cost };
  }
  if (id === 'door_zip') {              // ม่านซิปประตู (Z100/Z120) — app คิดผ่าน computeCost(zipscreen) จริง ส่งเข้า opt.doorZipR4 (แบบ roof_zip)
    const r4 = ctx.opt && ctx.opt.doorZipR4;
    if (!r4 || !(r4.amount > 0)) return null;
    return { label: r4.label, qty: 1, unit: 'ชุด', unitPrice: r4.amount, amount: r4.amount, cost: r4.cost };
  }
  // ── ออปชั่นเฟส 2 ② (ราคา R3.9 จาก audit · ติดป้าย R3.9) ──
  if (id === 'cmech') {                 // มือจับ Cmech (ตาราง CMECH_TIERS — แหล่งเดียวกับ UI)
    const t = CMECH_TIERS[sel]; if (!t) return null;
    const n = (ctx.opt && ctx.opt.handleQty > 0) ? Math.round(ctx.opt.handleQty) : 1;   // จำนวนชุด (เจ้าของเคาะ 24ส.ค.69) — default 1 = พฤติกรรมเดิม
    return { label: 'มือจับ Cmech ' + t.l + (n > 1 ? ' × ' + n + ' ชุด' : '') + ' (R3.9)', qty: n, unit: 'ชุด', unitPrice: t.p, amount: t.p * n };
  }
  if (id === 'stainless') {             // มือจับสแตนเลสอร่าม (ตาราง STAINLESS_TIERS — แหล่งเดียวกับ UI)
    const t = STAINLESS_TIERS[sel]; if (!t) return null;
    const n = (ctx.opt && ctx.opt.handleQty > 0) ? Math.round(ctx.opt.handleQty) : 1;   // จำนวนชุด (เจ้าของเคาะ 24ส.ค.69) — default 1 = พฤติกรรมเดิม
    return { label: 'มือจับสแตนเลส ' + t.l + (n > 1 ? ' × ' + n + ' ชุด' : '') + ' (R3.9)', qty: n, unit: 'ชุด', unitPrice: t.p, amount: t.p * n };
  }
  if (id === 'motor') {                 // มอเตอร์บานยก / เฟี้ยมยก — ชีต "คิดทุน บานยก" D51 = ราคา + ค่าส่ง
    //   ยก 80 กก. = 4,500 + 1,700 = 6,200 · ยก 300 กก. = 12,500 + 1,700 = 14,200 (เจ้าของยืนยันเลข 3 ก.ย.69)
    const ship = motorCost(ctx.PB, 'บานยก ค่าส่ง', 1700);
    const cmap = { '80': motorCost(ctx.PB, 'บานยก ยก80', 4500) + ship, '300': motorCost(ctx.PB, 'บานยก ยก300', 12500) + ship };
    const cost = cmap[sel]; if (cost == null) return null;
    if (sel === '80' && ctx.area > 3.5) return { cat: 'warn', label: '⚠️ มอเตอร์ 80 กก. ใช้ได้ ≤3.5 ตร.ม. (พื้นที่ ' + round2(ctx.area) + ') — เปลี่ยนเป็น 300 กก.', amount: 0 };
    const sell = autoSell(cost, ctx);
    return { label: 'ชุดออโต้บานยก ' + sel + ' กก. (รวมค่าส่ง)', qty: 1, unit: 'ชุด', unitPrice: sell, amount: sell, cost };
  }
  if (id === 'slide_motor') {           // มอเตอร์หลังคาเลื่อน (80/300/1500 + ฟันเฟือง + เซนเซอร์) · ขาย ×2.5/6,000
    const s = (sel && typeof sel === 'object') ? sel : { kw: '1500' };
    const kw = String(s.kw || '1500');
    const cmap = { '80': motorCost(ctx.PB, 'หลังคาเลื่อน ยก80', 4500), '300': motorCost(ctx.PB, 'หลังคาเลื่อน ยก300', 12500), '1500': motorCost(ctx.PB, 'หลังคาเลื่อน ยก1500', 13325) };
    // ทุนมอเตอร์ = ราคา + ค่าส่ง (ชีตถอดทุน D13 บวก 2 คอลัมน์ · เจ้าของเคาะ 27 ส.ค.69 "เอาตามชีท")
    //   เดิมคิดแต่ราคา ตกค่าส่งไป → 80 กก. คิด 4,500 ทั้งที่ชีตคิด 6,200
    const ship = motorCost(ctx.PB, 'หลังคาเลื่อน ค่าส่ง', 1700);
    const mcost = cmap[kw] == null ? null : cmap[kw] + ship;
    if (mcost == null) return null;
    const out = [{ label: 'มอเตอร์หลังคาเลื่อน ยก ' + kw + ' กก. (รวมค่าส่ง)', qty: 1, unit: 'ชุด', unitPrice: autoSell(mcost, ctx), amount: autoSell(mcost, ctx), cost: mcost }];
    if (kw === '1500') {                 // ฟันเฟือง + เซนเซอร์ เฉพาะ 1500 กก.
      const gl = +s.gearLen || 0;
      if (gl > 0) { const gc = motorCost(ctx.PB, 'ฟันเฟือง/ม.', 340) * gl; const gs = autoSell(gc, ctx); out.push({ label: 'ฟันเฟือง (ระยะยื่น ' + gl + ' ม.)', qty: gl, unit: 'ม.', unitPrice: round2(gs / gl), amount: gs, cost: gc }); }
      // v20.1 (3 ก.ย.69): "เซนเซอร์กันฝน · 1500 กก. บังคับมีเสมอ" — ไม่ใช่ออปชั่นแล้ว
      if (true) { const sc = motorCost(ctx.PB, 'เซนเซอร์กันฝน', 1100); const ss = autoSell(sc, ctx); out.push({ label: 'เซนเซอร์กันฝน (ออโต้)', qty: 1, unit: 'ชุด', unitPrice: ss, amount: ss, cost: sc }); }
    }
    return out;
  }
  if (id === 'banklet_motor') {         // มอเตอร์บานเกล็ด 38.1 — ชีตราคาออโต้ 1,800 "ไม่มีค่าส่ง"
    if (sel !== 'yes') return null;
    const cost = motorCost(ctx.PB, 'บานเกล็ด', 1800);
    return { label: 'มอเตอร์บานเกล็ด', qty: 1, unit: 'ชุด', unitPrice: autoSell(cost, ctx), amount: autoSell(cost, ctx), cost };
  }
  if (id === 'awn_auto') {              // ชุดออโต้บานกระทุ้ง (โช้ค50/80 · โซ่เดี่ยว/คู่) × จำนวนบาน · ขาย ×2.5/6,000
    const map = { choke50: ['โช้คเปิด 50', 'กระทุ้ง โช้ค50', 3575], choke80: ['โช้คเปิด 80', 'กระทุ้ง โช้ค80', 3725], chain1: ['โซ่เดี่ยว 50', 'กระทุ้ง โซ่เดี่ยว50', 1900], chain2: ['โซ่คู่ 50', 'กระทุ้ง โซ่คู่50', 2600] };
    const m = map[sel]; if (!m) return null;
    const each = motorCost(ctx.PB, m[1], m[2]);
    const n = ctx.P || 1;
    // ค่าส่งคิดครั้งเดียวต่องาน (ไม่ใช่ต่อบาน) ตามสูตร D54 — เดิมเว็บตกค่าส่งไปทั้งก้อน
    const cost = each * n + motorCost(ctx.PB, 'กระทุ้ง ค่าส่ง', 1700);
    const sell = autoSell(cost, ctx);
    const out = [{ label: 'ชุดออโต้กระทุ้ง ' + m[0] + (n > 1 ? ' ×' + n + ' บาน' : '') + ' (รวมค่าส่ง)', qty: n, unit: 'ชุด', unitPrice: round2(sell / n), amount: sell, cost }];
    // "2 ตัว→+อุปกรณ์พิเศษ" — เฉพาะโช็ค (โซ่ไม่มี) ตามสูตรในชีต
    if (n >= 2 && (sel === 'choke50' || sel === 'choke80')) {
      const xc = motorCost(ctx.PB, 'กระทุ้ง อุปกรณ์พิเศษ', 600), xs = autoSell(xc, ctx);
      out.push({ label: 'อุปกรณ์พิเศษ (โช็ค 2 ตัว)', qty: 1, unit: 'ชุด', unitPrice: xs, amount: xs, cost: xc });
    }
    return out;
  }
  if (id === 'slide_auto') {            // ชุดออโต้บานเลื่อน — Evecca / ช่างแซก / SlimLux (ชีต "คิดทุน SMS" D57 · "คิดทุน SlimLux" D58)
    const s = (sel && typeof sel === 'object') ? sel : null;
    const brand = s && s.brand; if (!brand || brand === 'none') return null;
    const W = ctx.W || 0, P = ctx.P || 1, out = [];
    const C = (k, fb) => motorCost(ctx.PB, k, fb);
    const acc = (label, cost, qty, unit) => { const sl = autoSell(cost, ctx); out.push({ label, qty: qty || 1, unit: unit || 'ชุด', unitPrice: round2(sl / (qty || 1)), amount: sl, cost }); };
    // ช่างแซก: สูตร D57 คูณทั้งก้อน × MIN(จำนวนบาน, 3) · รูปแบบ "เปิดคู่กลาง" = 1 ชุด
    const csMul = (String((ctx.opt && ctx.opt.form) || '').includes('เปิดคู่กลาง')) ? 1 : Math.max(1, Math.min(P, 3));
    const csTag = csMul > 1 ? ' ×' + csMul + ' ชุด' : '';
    if (brand === 'evecca') {
      // Evecca: ทุน = ตัวชุด + สายพาน(กว้าง×2 ม.) + ค่าส่ง + Smart lock(ถ้าเลือก) — สูตร D57 ในชีต
      const mc = C('เลื่อน Evecca', 13480) + C('เลื่อน Evecca ค่าส่ง', 1700);
      out.push({ label: 'ชุดออโต้เลื่อน Evecca (จีน · รวมค่าส่ง)', qty: 1, unit: 'ชุด', unitPrice: autoSell(mc, ctx), amount: autoSell(mc, ctx), cost: mc });
      const beltLen = W * 2; if (beltLen > 0) acc('สายพาน Evecca (' + round2(beltLen) + ' ม.)', C('เลื่อน Evecca สายพาน/ม.', 75) * beltLen, round2(beltLen), 'ม.');
      if (s.smartlock) acc('Smart lock', C('เลื่อน Evecca Smart lock', 6500));
    } else if (brand === 'changsaek') {
      // ช่างแซก: ทั้งก้อน (ชุด+ตาแมว+ราง+ออป) × จำนวนบาน สูงสุด 3 · "เปิดคู่กลาง" = 1 ชุด (สูตร D57)
      const mc = C('เลื่อน ช่างแซก', 8000) * csMul;
      out.push({ label: 'ชุดออโต้เลื่อน ช่างแซก' + csTag, qty: csMul, unit: 'ชุด', unitPrice: round2(autoSell(mc, ctx) / csMul), amount: autoSell(mc, ctx), cost: mc });
      acc('เซฟตี้ตาแมว (บังคับ)' + csTag, C('เลื่อน ช่างแซก ตาแมว', 1000) * csMul, csMul);
      if (W > 0) acc('ราง ช่างแซก (' + round2(W) + ' ม.)' + csTag, C('เลื่อน ช่างแซก ราง/ม.', 950) * W * csMul, round2(W * csMul), 'ม.');
      if (s.touch) acc('Touch Switch' + csTag, C('เลื่อน ช่างแซก Touch', 1000) * csMul, csMul);
      if (s.infrared) acc('Infrared' + csTag, C('เลื่อน ช่างแซก Infrared', 9000) * csMul, csMul);
    } else if (brand === 'slimlux') {
      // ⚠ ชีตราคาออโต้มีค่าส่ง SlimLux 1,700 แต่สูตร D58 ในชีต "คิดทุน SlimLux" ไม่บวก — ยึดสูตร (แจ้งเจ้าของแล้ว)
      const mc = C('เลื่อน SlimLux ชุดแรก', 6900); out.push({ label: 'ชุดออโต้เลื่อน SlimLux (บานแรก)', qty: 1, unit: 'ชุด', unitPrice: autoSell(mc, ctx), amount: autoSell(mc, ctx), cost: mc });
      if (P > 1) acc('SlimLux บานเพิ่ม ×' + (P - 1), C('เลื่อน SlimLux บานเพิ่ม', 2250) * (P - 1), P - 1, 'บาน');
      if (W > 0) acc('ราง SlimLux (' + round2(W * P) + ' ม.)', C('เลื่อน SlimLux ราง/ม.', 1100) * W * P, round2(W * P), 'ม.');
      if (s.scan) acc('สแกนหน้า', C('เลื่อน SlimLux สแกนหน้า', 2750));
      else acc('Touch Switch', C('เลื่อน SlimLux Touch', 100));   // บังคับเลือก 1 ใน 2
    } else return null;
    return out;
  }
  if (id === 'awn_tt') {                // บานกระทุ้ง tilt & turn (×บาน)
    if (sel !== 'yes') return null;
    const n = ctx.P || 1;
    return { label: 'บานกระทุ้ง Tilt & Turn (R3.9)', qty: n, unit: 'บาน', unitPrice: 5000, amount: 5000 * n };
  }
  if (id === 'awn_brace') {             // เสริมแขนค้ำ (บานกระทุ้ง)
    return sel === 'yes' ? { label: 'เสริมแขนค้ำกระทุ้ง (R3.9)', qty: 1, unit: 'ชุด', unitPrice: 500, amount: 500 } : null;
  }
  if (id === 'hide_track') {            // ซ่อนราง (เฟี้ยม · ฟรี ≤3ม. +500/ม.) — ฐานจาก ADDON_FLAT.hide_track
    if (sel !== 'yes') return null;
    const amt = ADDON_FLAT.hide_track + Math.max(0, W - 3) * 500;
    return { label: 'ซ่อนราง (R3.9)', qty: 1, unit: 'ชุด', unitPrice: round2(amt), amount: round2(amt) };
  }
  if (id === 'inner_track') {           // เลื่อนภายในรางบน — ซ่อนราง +5,000 (R3.9 index.html:2000 · เฉพาะรางบน)
    if (sel !== 'yes') return null;
    return { label: 'ซ่อนราง (รางบน · R3.9)', qty: 1, unit: 'ชุด', unitPrice: 5000, amount: 5000 };
  }
  // ── ออปหลังคา (R3.9 · ราคาขายตรง/ม.,ตร.ม.) ──
  if (id === 'gutter') {                // รางน้ำ ฿/ม. × ยาว (ว่าง=กว้างหลังคา) · อลู1000/M2000/สแตนเลส3000
    const g = sel || {}; const rate = +g.rate || 0; if (!rate) return null;
    const len = (+g.len > 0) ? +g.len : W;
    return { label: (rate >= 3000 ? 'รางน้ำสแตนเลส' : 'รางน้ำอลูมิเนียม') + ' (R3.9)', qty: round2(len), unit: 'ม.', unitPrice: rate, amount: round2(rate * len) };
  }
  if (id === 'chain_drain') {           // โซ่รางน้ำ 3,000/เส้น × จำนวนเส้น (R3.9)
    const n = +sel || 0; if (n <= 0) return null;
    return { label: 'โซ่รางน้ำ (R3.9)', qty: n, unit: 'เส้น', unitPrice: 3000, amount: n * 3000 };
  }
  if (id === 'pipe_cover') {            // ครอบท่อ PVC 1,500/1.5ม. → ปัดขึ้นต่อท่อน 1.5ม. (R3.9)
    const len = +sel || 0; if (len <= 0) return null;
    const seg = Math.ceil(len / 1.5 - 1e-9);
    return { label: 'ครอบท่อ PVC (R3.9)', qty: seg, unit: 'ท่อน(1.5ม.)', unitPrice: 1500, amount: seg * 1500 };
  }
  if (id === 'gutter_cover') {          // ปิดซ่อนรางน้ำ (ลูกฟูก ×0.7) · (กว้างม.+สูงม.)×ยาว×3500×0.7
    const g = sel || {}; const gw = (+g.gw || 0) / 100, gh = (+g.gh || 0) / 100, gll = +g.gll || 0;
    if (!((gw + gh) > 0 && gll > 0)) return null;
    const amt = (gw + gh) * gll * 3500 * 0.7;
    return { label: 'ปิดซ่อนรางน้ำ ลูกฟูก (R3.9)', qty: round2(gll), unit: 'ม.', unitPrice: round2(amt / (gll || 1)), amount: round2(amt) };
  }
  if (id === 'hide_slope') {            // ซ่อนสโลป คอมโพสิต3500 / สมาร์ทบอร์ด4000 · พื้นที่ต่างตามชนิด
    const g = sel || {}; const h = +g.h || 0, l = +g.l || 0, n = +g.n || 1;
    if (!(h > 0 && l > 0)) return null;
    const comp = g.type !== 'smart';
    const area = comp ? (2 * h + 0.1) * n * l : h * n * l;
    const rate = comp ? 3500 : 4000;
    return { label: 'ซ่อนสโลป ' + (comp ? 'คอมโพสิต 3มม.' : 'สมาร์ทบอร์ด 6มม.') + ' (R3.9)', qty: round2(area), unit: 'ตร.ม.', unitPrice: rate, amount: round2(area * rate) };
  }
  if (id === 'gate_curve') {            // ประตูรั้วบานโค้ง — ค่าทำบานโค้ง 4,000/บาน (R3.9 leafC · leaves=ceil(กว้าง/0.75))
    // ⚠️ ค่าดัดรางโค้ง: R3.9 = ราง 2×กว้าง × (โค้ง2500−ตรง1500)=+1,000/ม. · แต่ matrix (=cost×2) โค้งบวกน้อยกว่า (Δ 15,200-54,500 ตามขนาด · ไม่คงที่)
    // → R3.9 vs matrix ขัดกัน · รอพี่เคาะ target (log CSV) · ตอนนี้คงบานโค้ง 4,000 เดิม ไม่บวกรางโค้งเพิ่ม (กันราคากระโดดเกิน matrix)
    if (sel !== 'yes') return null;
    const leaves = Math.ceil(W / 0.75);
    return { label: 'บานโค้ง (R3.9 ' + ADDON_FLAT.gate_curve.toLocaleString() + '/บาน · รางโค้งรอเคาะ R3.9/matrix)', qty: leaves, unit: 'บาน', unitPrice: ADDON_FLAT.gate_curve, amount: ADDON_FLAT.gate_curve * leaves };
  }
  if (id === 'gate_motor') {            // มอเตอร์ประตูรั้ว เพิ่ม (นอกเหนือ 1 ตัวในชุด) — ชีตราคาออโต้ 10,000/ชุด ไม่มีค่าส่ง
    const n = +sel || 0; if (n <= 0) return null;
    const cost = motorCost(ctx.PB, 'ประตูรั้ว', 10000);   // ชีตราคาออโต้ = 10,000 (เว็บเคยค้าง 16,000)
    const each = autoSell(cost, ctx);
    return { label: 'มอเตอร์ประตูรั้ว เพิ่ม', qty: n, unit: 'ตัว', unitPrice: each, amount: n * each, cost: n * cost };
  }
  if (id === 'gate_wire') {             // ค่าเดินสายไฟ/ระบบไฟ ประตูรั้ว · กรอกราคาเอง (X)
    const amt = +sel || 0; if (!amt) return null;
    return { label: 'เดินสายไฟ/ระบบไฟ ประตูรั้ว', qty: 1, unit: 'งาน', unitPrice: round2(amt), amount: round2(amt) };
  }
  if (id === 'louver_door') {            // ระแนงทำเป็นบาน (เลื่อน/เฟี้ยม/เปิด) — ใช้โครงบาน G1 เหมือน R3.9 (พี่สั่ง 1ก.ค.)
    const type = sel;
    if (!type || type === 'ติดตาย') return null;
    const sp = (ctx.opt && ctx.opt.spec) || {};
    const pn = Math.max(1, +sp.rnPanels || 1);
    const A = W * H;
    const ovr = +sp.rnDoorPrice || 0;
    // ออปชั่นบานระแนง R3.9 (มีราคาจริง · sell-based · index.html:2143-2147) — flat add ตามชนิดบาน
    const optLines = [];
    if (type === 'บานเลื่อน' && sp.rnRail === 'low7') optLines.push({ label: 'รางเตี้ย 7มม. (R3.9)', qty: 1, unit: 'ชุด', unitPrice: 500, amount: 500 });
    if (type === 'บานเปิด') {
      const cl = +sp.rnCloser || 0; if (cl > 0) optLines.push({ label: 'โช้คอัดประตู (R3.9)', qty: 1, unit: 'ตัว', unitPrice: cl, amount: cl });
      if (sp.rnThresh === 'turtle') optLines.push({ label: 'ธรณีหลังเต่า + Drop Seal (R3.9)', qty: 1, unit: 'ชุด', unitPrice: 1000, amount: 1000 });
      if (sp.rnSwingHandle === 'lux') { const sz = parseFloat(sp.rnSwingHandleSz) || 1500; optLines.push({ label: 'มือจับสแตนเลสอร่าม (R3.9)', qty: 1, unit: 'ชุด', unitPrice: sz, amount: sz }); }
    }
    if (ovr > 0) { const b = { label: 'ทำเป็น' + type + ' (กำหนดราคาเอง · ' + pn + ' บาน)', qty: pn, unit: 'บาน', unitPrice: round2(ovr / pn), amount: round2(ovr) }; return optLines.length ? [b, ...optLines] : b; }
    // R3.9 bar_slide: ระแนงทำเป็นบาน = doorStructBase (โครงบาน G1 จริง · เลื่อน=SMS/เปิด=OPEN) + ค่ากลไกเลื่อน max(3000,A×1000)
    // ใบระแนง(corrugate) = BOM louver แล้ว → addon นี้บวกเฉพาะ "โครงบาน+กลไก" (ไม่ double-count) · ใช้เรตบาน R3.9 จริง (ห้ามเดา) · พี่ทัก "ใช้บานเหมือน G1"
    const SMS = [[2, 2.3, 6500], [2.3, 3.5, 6000], [3.5, 4.5, 5700], [4.5, 5, 5000], [5, 7, 4700], [7, 9, 4400], [9, 12, 4200], [12, 9999, 4000]];
    const EURO = [[2, 2.3, 7200], [2.3, 3.5, 6600], [3.5, 4.5, 6300], [4.5, 5, 5500], [5, 7, 5200], [7, 9, 4900], [9, 12, 4700], [12, 9999, 4400]];
    const OPEN = [[2, 2.4, 7500], [2.4, 3, 7000], [3, 3.5, 7000], [3.5, 4, 6500], [4, 5, 6000], [5, 6, 5500], [6, 9999, 5000]];
    // เลือกเรตตามรุ่นบาน G1 ที่อ้างอิง (R3.9 bsDoor) · fallback ตามชนิด (เปิด=OPEN · เลื่อน/เฟี้ยม=SMS)
    const RATE_BY_MODEL = { sliding_sms: SMS, sliding_euro: EURO, folding: SMS, folding_xseries: EURO, casement_euro: OPEN, casement_dseries: OPEN };
    const tiers = RATE_BY_MODEL[sp.rnDoorModel] || ((type === 'บานเปิด') ? OPEN : SMS);
    const rOf = (a, t) => { if (a < t[0][0]) return t[0][2]; for (const r of t) if (a >= r[0] && a < r[1]) return r[2]; return t[t.length - 1][2]; };
    const mono = (a, t) => { let v = a * rOf(a, t); for (const r of t) if (r[1] <= a) { const e = r[1] * r[2]; if (e > v) v = e; } return v; };   // R3.9 monoRate
    let doorStruct = mono(A, tiers);
    if (pn > 1) { const per = mono(A / pn, tiers); const floor = per * (1 + 0.67 * (pn - 1)); if (floor > doorStruct) doorStruct = floor; }   // R3.9 floor ต่อบาน
    const mechC = (type === 'บานเปิด') ? 0 : Math.max(3000, A * 1000);   // เลื่อน/เฟี้ยม = ค่ากลไกเลื่อน (R3.9 slideCost) · เปิด=บานพับรวมในโครง
    const amt = ceil100(doorStruct + mechC);
    const b = { label: 'ทำเป็น' + type + ' — โครงบาน G1 (R3.9) ' + pn + ' บาน' + (mechC > 0 ? ' +กลไกเลื่อน' : ''), qty: pn, unit: 'บาน', unitPrice: round2(amt / pn), amount: amt };
    return optLines.length ? [b, ...optLines] : b;
  }
  if (id === 'shower_corner') {         // shower เข้ามุม (L-shape) +3,000 คงที่ (R3.9 corner)
    if (sel !== 'yes') return null;
    return { label: 'เข้ามุม (L-shape)', qty: 1, unit: 'งาน', unitPrice: 3000, amount: 3000 };
  }
  if (id === 'shower_hw') {             // shower อุปกรณ์ราวสี (R3.9 showerhw) เงิน 0 / ดำ +4,000 / ทอง +6,000
    const amt = ({ black: ADDON_FLAT.shower_black, gold: ADDON_FLAT.shower_gold })[sel] || 0; if (!amt) return null;
    return { label: 'อุปกรณ์ราวสี' + ({ black: 'ดำ', gold: 'ทอง' })[sel], qty: 1, unit: 'ชุด', unitPrice: amt, amount: amt };
  }
  if (id === 'ms_color') {              // สีกรอบมุ้ง — ค่าทำสี ×0.5 (R3.9 mscolor) · เรตรอกรอก (0=รอราคา · สูตรพร้อม)
    if (!sel || sel === 'none') return null;
    const rate = ctx.opt && ctx.opt.msColorRate ? ctx.opt.msColorRate : 0;   // ฿/ตร.ม. (×0.5 คิดที่ฝั่ง rate แล้ว)
    return { label: 'สีกรอบมุ้ง ' + sel + (rate ? '' : ' (รอราคา)'), qty: round2(ctx.area), unit: 'ตร.ม.', unitPrice: round2(rate), amount: round2(ctx.area * rate) };
  }
  // ── อุปกรณ์เสริมบาน (R3.9 COMMON_OPTS index.html:1357 + แผ่นทึบ rn89-92) ──
  if (id === 'solid_panel') {           // แผ่นทึบล่าง คอมโพสิต 3,300 / ลูกฟูก 3,500 / เกล็ด Z (ตามสีอลูหลัก) ฿/ตร.ม. × กว้าง×สูงแผ่น
    const g = sel || {}; const t = g.type; if (!t || t === 'none') return null;
    const sw = +g.w > 0 ? +g.w : W, sh = +g.h || 0; if (!(sh > 0)) return null;
    const zsz = t === 'z1' ? '1' : t === 'z16' ? '1.6' : null;   // เกล็ด Z ล่างทึบ — ราคาตามสีอลูหลัก (21ก.ค.69)
    const rate = zsz ? zRate(zsz, (ctx.opt || {}).color || 'white') : (t === 'comp' ? 3300 : 3500);
    const lbl = zsz ? Z_LOUVRE[zsz].label : ((t === 'comp' ? 'คอมโพสิต' : 'อลูลูกฟูก') + ' (R3.9)');
    return { label: 'แผ่นทึบล่าง ' + lbl, qty: round2(sw * sh), unit: 'ตร.ม.', unitPrice: rate, amount: round2(sw * sh * rate) };
  }
  if (id === 'elec') {                   // งานไฟ พัดลม+หน้ากาก+สวิตซ์ (เจ้าของเคาะ 17ก.ค.69 · ราคา "ขาย" ตรง ๆ · sell-based เหมือน add-on R3.9)
    const s = sel || {};                 // sel = { fan8, fan10, cover, sw } (จำนวนตัว/จุด)
    const rows = [
      { q: s.fan8 | 0, label: 'พัดลมดูดอากาศ 8"', price: 3000, unit: 'ตัว' },
      { q: s.fan10 | 0, label: 'พัดลมดูดอากาศ 10"', price: 3000, unit: 'ตัว' },
      { q: s.cover | 0, label: 'ฝาครอบกันแมลง 8"/10"', price: 1000, unit: 'ตัว' },
      { q: s.sw | 0, label: 'สวิตซ์ไฟ', price: 500, unit: 'จุด' },
    ].filter((x) => x.q > 0);
    if (!rows.length) return null;
    return rows.map((x) => ({ label: x.label + ' (งานไฟ)', qty: x.q, unit: x.unit, unitPrice: x.price, amount: x.q * x.price }));
  }
  if (id === 'u_track') {               // ฝังรางยู U-Track · ฟรี ≤2ม. + 500/ม.เกิน
    if (sel !== 'yes') return null;
    const amt = ADDON_FLAT.u_track + Math.max(0, W - 2) * 500;
    return { label: 'ฝังรางยู U-Track (R3.9)', qty: 1, unit: 'งาน', unitPrice: round2(amt), amount: round2(amt) };
  }
  if (id === 'beam_support') {          // เสริมคานซัพพอร์ท · ฟรี ≤3ม. + 500/ม.เกิน
    if (sel !== 'yes') return null;
    const amt = ADDON_FLAT.beam_support + Math.max(0, W - 3) * 500;
    return { label: 'เสริมคานซัพพอร์ท (R3.9)', qty: 1, unit: 'งาน', unitPrice: round2(amt), amount: round2(amt) };
  }
  if (id === 'hide_beam') {             // ซ่อนคาน · ฟรี ≤3ม. + 500/ม.เกิน
    if (sel !== 'yes') return null;
    const amt = ADDON_FLAT.hide_beam + Math.max(0, W - 3) * 500;
    return { label: 'ซ่อนคาน (R3.9)', qty: 1, unit: 'งาน', unitPrice: round2(amt), amount: round2(amt) };
  }
  if (id === 'soft_close') {            // Soft Close สลักหน่วงบาน
    return sel === 'yes' ? { label: 'Soft Close หน่วงบาน (R3.9)', qty: 1, unit: 'ชุด', unitPrice: ADDON_FLAT.soft_close, amount: ADDON_FLAT.soft_close } : null;
  }
  if (id === 'sling') {                 // สลิงเปิดซ้อน × บาน
    if (sel !== 'yes') return null;
    const n = ctx.P || 1;
    return { label: 'สลิงเปิดซ้อน (R3.9)', qty: n, unit: 'บาน', unitPrice: ADDON_FLAT.sling, amount: ADDON_FLAT.sling * n };
  }
  if (id === 'demolish') {              // รื้อของเดิม · กรอกราคาเอง
    const amt = +sel || 0; if (!amt) return null;
    return { label: 'รื้อ/รื้อถอนของเดิม', qty: 1, unit: 'งาน', unitPrice: round2(amt), amount: round2(amt) };
  }
  if (id === 'drop_floor') {            // ดรอปพื้น (ปรับระดับพื้น) · กรอกราคาเอง (X)
    const amt = +sel || 0; if (!amt) return null;
    return { label: 'ดรอปพื้น (ปรับระดับ)', qty: 1, unit: 'งาน', unitPrice: round2(amt), amount: round2(amt) };
  }
  if (id === 'screen_demo') {           // รื้อมุ้งเดิม 1,000 (R3.9)
    if (sel !== 'yes') return null;
    return { label: 'รื้อมุ้งเดิม (R3.9)', qty: 1, unit: 'งาน', unitPrice: 1000, amount: 1000 };
  }
  if (id === 'screen_existing') {       // ติดบานเดิม (เสริมกล่อง/ราง) · กรอกราคาเอง (X)
    const amt = +sel || 0; if (!amt) return null;
    return { label: 'ติดบานเดิม (เสริมกล่อง/ราง)', qty: 1, unit: 'งาน', unitPrice: round2(amt), amount: round2(amt) };
  }
  // ── ออปหลังคาเพิ่ม (R3.9 index.html:2090 · ขายตรง) ──
  if (id === 'roof_pole') {             // เสา แผง4,000 / 4"×8" 2,000 / กลม 1,500 ฿/ต้น
    const g = sel || {}; const pp = +g.polep || 0, p4 = +g.pole4 || 0, p15 = +g.pole15 || 0;
    const amt = pp * 4000 + p4 * 2000 + p15 * 1500; if (!amt) return null;
    const parts = []; if (pp) parts.push('แผง×' + pp); if (p4) parts.push('4"×8"×' + p4); if (p15) parts.push('กลม×' + p15);
    const n = pp + p4 + p15;
    return { label: 'เสา ' + parts.join(' · ') + ' (R3.9)', qty: n, unit: 'ต้น', unitPrice: round2(amt / Math.max(1, n)), amount: round2(amt) };
  }
  if (id === 'truss_beam') {            // คานเหล็กถัก รุ่น1 2,400 / รุ่น2 3,600 / รุ่น3 4,400 ฿/ม. × ยาว
    const g = sel || {}; const rate = +g.rate || 0, len = +g.len || 0; if (!(rate > 0 && len > 0)) return null;
    return { label: 'คานเหล็กถัก (R3.9)', qty: round2(len), unit: 'ม.', unitPrice: rate, amount: round2(rate * len) };
  }
  if (id === 'roof_eave') {             // ปิดปลายหลังคากันน้ำ 1,000/ม. (ว่าง=ด้านยาวหลังคา)
    const g = sel || {}; if (!g.on) return null;
    const len = (+g.len > 0) ? +g.len : W;
    return { label: 'ปิดปลายหลังคากันน้ำ (R3.9)', qty: round2(len), unit: 'ม.', unitPrice: 1000, amount: round2(len * 1000) };
  }
  if (id === 'beam_cover') {            // ครอบคาน ลูกฟูก 1 หน้า ลด 40% · 3500×0.6×กว้างห่อ×ยาวคาน
    const g = sel || {}; const bcw = +g.bcw || 0, bcl = +g.bcl || 0; if (!(bcw > 0 && bcl > 0)) return null;
    return { label: 'ครอบคาน ลูกฟูก (R3.9)', qty: round2(bcw * bcl), unit: 'ตร.ม.', unitPrice: round2(3500 * 0.6), amount: round2(3500 * 0.6 * bcw * bcl) };
  }
  if (id === 'roof_sealer') {           // วัสดุปิดรอยต่อแผ่นหลังคา · ขั้นต่ำ 5,000 + 800/ม.
    const g = sel || {}; if (!g.on) return null;
    const len = +g.len || 0;
    const amt = Math.max(5000, 800 * len);
    return { label: 'วัสดุปิดรอยต่อหลังคา (R3.9)', qty: round2(len), unit: 'ม.', unitPrice: 800, amount: round2(amt) };
  }
  if (id === 'roof_film') {             // ฟิล์ม/ลามิเนตหลังคา (กันร้อน/UV) — กรอก ฿/ตร.ม. เอง × พื้นที่หลังคา
    const rate = +sel || 0; if (rate <= 0) return null;
    return { label: 'ฟิล์ม/ลามิเนตหลังคา (กันร้อน/UV)', qty: round2(ctx.area), unit: 'ตร.ม.', unitPrice: round2(rate), amount: round2(ctx.area * rate) };
  }
  if (id === 'roof_2nd') {              // หลังคาผสม วัสดุที่ 2 (ต่อปลาย) — ยาว × ยื่น × ฿/ตร.ม. (กรอกเอง)
    const g = sel || {}; const len = +g.len || 0, proj = +g.proj || 0, rate = +g.rate || 0;
    if (!(len > 0 && proj > 0 && rate > 0)) return null;
    const a = len * proj;
    return { label: 'หลังคาผสม วัสดุที่ 2' + (g.mat ? ' (' + g.mat + ')' : ''), qty: round2(a), unit: 'ตร.ม.', unitPrice: round2(rate), amount: round2(a * rate) };
  }
  if (id === 'ceil_under') {            // ฝ้าใต้หลังคา (R3.9 ceilmode · ฝ้าในชุดหลังคา) — เรตตามชนิด + ฉนวน · ว่าง=พื้นที่หลังคา
    const g = sel || {}; if (!g.on) return null;
    const rate = (CEIL_RATE[g.type] || 480) + (g.insul ? 600 : 0);
    const a = (+g.area > 0) ? +g.area : ctx.area;
    return { label: 'ฝ้าใต้หลังคา ' + (g.type || 'ฉาบเรียบ') + (g.insul ? ' +ฉนวน' : '') + (g.pos ? ' (' + g.pos + ')' : ''), qty: round2(a), unit: 'ตร.ม.', unitPrice: rate, amount: round2(a * rate) };
  }
  return null;
}
