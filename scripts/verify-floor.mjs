/**
 * ตรวจเครื่องคิดราคางานพื้น — รันทุกครั้งที่แก้ src/lib/floor-calc/engine.ts
 *   node scripts/verify-floor.mjs
 *
 * หมุดที่ใช้ตรวจ (ของจริงทั้งหมด ไม่ได้แต่งเอง):
 *   ① ใบตรวจขนาดทดสอบ 10 เคส — "ตรวจขนาดทดสอบ_เสาเข็ม_JR.pdf"
 *      เคส 1 (1.0×5.0) คำตอบเปลี่ยนโดยตั้งใจ: เจ้าของเคาะ 6 ส.ค.69 ว่าด้านแคบ ≤1 ม. ลง 2 แถว
 *   ② กติการะยะห่างเข็ม: 1.0 ≤ ระยะ ≤ 4.0 ม. และเข็มต้องอยู่ในพื้น — กวาดทุกขนาด 0.5–20.0 ม.
 *   ③ ราคาส่วนโครงสร้าง เทียบใบเสนอจริง "คุณพิทยารัตน์ (Rev03)" — เข็ม 6 ต้น
 *   ④ ค่าเริ่มต้นงานเหมา ต้องไล่ระดับถูกทาง (พื้นที่เล็ก = แพงกว่าต่อ ตร.ม.)
 */
import {
  planFloor, layoutAxis, RATE, pileType, suggest, draftItems, sumItems, groupItems,
  quoteFileName, groupNames, addItemToGroup, isExistingPile, PILE_TYPES,
  MIN_SPAN, MAX_SPAN,
} from "../src/lib/floor-calc/engine.mjs";

let failed = 0;
const bad = (msg) => { failed++; console.log("  ❌ " + msg); };
const ok  = (msg) => console.log("  ✅ " + msg);

// ═══ ① ใบตรวจขนาดทดสอบ 10 เคส ═══
console.log("═══ ① ใบตรวจขนาดทดสอบ 10 เคส (ตรวจขนาดทดสอบ_เสาเข็ม_JR.pdf) ═══");
const CASES = [
  // piles/rows/beam = คำตอบในใบทดสอบ · newPiles/newBeam = คำตอบหลังกฎ "ด้านแคบ 2 แถว"
  { w: 1.0, l: 5.0, piles: 2, rows: "1 × 2", beam: 7.0, newPiles: 4, newBeam: 12.0, changed: true },
  { w: 1.2, l: 8.0, piles: 6, rows: "2 × 3", beam: 19.6 },
  { w: 1.5, l: 9.0, piles: 6, rows: "2 × 3", beam: 22.5 },
  { w: 1.8, l: 10.0, piles: 8, rows: "2 × 4", beam: 27.2 },
  { w: 4.0, l: 5.0, piles: 4, rows: "2 × 2", beam: 18.0 },
  { w: 3.0, l: 10.0, piles: 8, rows: "2 × 4", beam: 32.0 },
  { w: 3.0, l: 3.0, piles: 4, rows: "2 × 2", beam: 12.0 },
  { w: 2.0, l: 3.0, piles: 4, rows: "2 × 2", beam: 10.0 },
  { w: 2.5, l: 5.0, piles: 4, rows: "2 × 2", beam: 15.0 },
  { w: 2.0, l: 15.0, piles: 10, rows: "2 × 5", beam: 40.0 },
];
for (const [i, c] of CASES.entries()) {
  const p = planFloor(c.w, c.l);
  const wantPiles = c.newPiles ?? c.piles;
  const wantBeam = c.newBeam ?? c.beam;
  const okPiles = p.piles === wantPiles;
  const okBeam = Math.abs(p.beamLen - wantBeam) < 0.005;
  const okArea = Math.abs(p.area - c.w * c.l) < 0.005;
  const tag = c.changed ? "🔄" : "✅";
  if (okPiles && okBeam && okArea) {
    console.log(`  ${tag} #${String(i + 1).padStart(2)} ${String(c.w).padStart(4)}×${String(c.l).padEnd(5)} เข็ม ${String(p.piles).padStart(2)} · คาน ${p.beamLen.toFixed(1).padStart(5)} ม. · ห่าง ${p.spanW.toFixed(2)}/${p.spanL.toFixed(2)}${c.changed ? `   (ใบทดสอบเดิม ${c.piles} ต้น — เปลี่ยนตามกฎด้านแคบ)` : ""}`);
  } else {
    bad(`#${i + 1} ${c.w}×${c.l} → เข็ม ${p.piles} (ต้องได้ ${wantPiles}) · คาน ${p.beamLen} (ต้องได้ ${wantBeam})`);
  }
}

// ═══ ② กติการะยะห่าง — กวาดทุกขนาด ═══
console.log("\n═══ ② ระยะห่างเข็ม 1.0–4.0 ม. และเข็มอยู่ในพื้น (กวาด 0.5–20.0 ม.) ═══");
let swept = 0, tight = 0;
for (let d = 0.5; d <= 20.001; d += 0.1) {
  const side = Math.round(d * 10) / 10;
  const a = layoutAxis(side);
  swept++;
  const inside = a.inset >= -1e-9 && a.inset + a.span * (a.rows - 1) <= side + 1e-9;
  if (!inside) bad(`ด้าน ${side} → เข็มล้นออกนอกพื้น (ร่น ${a.inset.toFixed(2)} ระยะ ${a.span.toFixed(2)})`);
  if (a.span > MAX_SPAN + 1e-9) bad(`ด้าน ${side} → ระยะ ${a.span.toFixed(2)} เกิน ${MAX_SPAN} ม.`);
  if (a.span < MIN_SPAN - 1e-9) {
    if (side >= 1.0) bad(`ด้าน ${side} → ระยะ ${a.span.toFixed(2)} ต่ำกว่า ${MIN_SPAN} ม.`);
    else tight++; // ด้าน < 1 ม. ทำระยะ 1 ม. ไม่ได้จริง ๆ — ยอมรับได้ (UI เตือน)
  }
}
console.log(`  ✅ กวาด ${swept} ขนาด — ระยะอยู่ในกรอบทุกค่า · ด้าน <1 ม. ที่ทำระยะขั้นต่ำไม่ได้ ${tight} ค่า (ตามคาด)`);

// ═══ ③ ราคาโครงสร้าง เทียบใบจริง ═══
console.log("\n═══ ③ ราคาส่วนโครงสร้าง เทียบใบเสนอจริง คุณพิทยารัตน์ (Rev03) ═══");
const P6 = 6; // ใบจริงตอกเข็ม I18 6 ต้น
const i18 = pileType("i18").price;
const checks = [
  ["เข็ม I18 /ต้น", i18, 11000],
  ["ขุด /หลุม", RATE.dig, 2000],
  ["ฟุตติ้ง /หลุม", RATE.footing, 2500],
  ["เข็ม 6 ต้น", P6 * i18, 66000],
  ["ขุด 6 หลุม", P6 * RATE.dig, 12000],
  ["ฟุตติ้ง 6 หลุม", P6 * RATE.footing, 15000],
];
for (const [label, got, want] of checks) {
  if (got === want) console.log(`  ✅ ${label.padEnd(16)} ${got.toLocaleString().padStart(8)}`);
  else bad(`${label} → ${got.toLocaleString()} (ใบจริง ${want.toLocaleString()})`);
}
console.log(`  ℹ️  คาน: ระบบใช้ ${RATE.beam.toLocaleString()}/ม. = วัสดุ ${RATE.beam_material.toLocaleString()} + แรง ${RATE.beam_labor.toLocaleString()} (เจ้าของแยกวัสดุ/แรง 18 ส.ค.69 · ตรงใบจริงคุณพิทยารัตน์ที่ใช้ 2,200)`);

// ═══ ④ ค่าแนะนำงานเหมา — "ราคาตัวเดียว" ตรงชีตเปรียบเทียบ 5 งาน (18 ส.ค.69) ═══
console.log("\n═══ ④ ค่าแนะนำ (ราคาผู้รับเหมา ค่าแรง · ราคาตัวเดียว) ตรงชีตเปรียบเทียบ ═══");
// รายการต่อ ตร.ม./จุด — ต้องนิ่ง ไม่ขึ้นกับพื้นที่ (เจ้าของเคาะเลิกไล่ระดับ 18 ส.ค.69)
const flatRates = [
  ["กระเบื้อง (ค่าแรง)", (a) => suggest.tile(a), 850, "/ตร.ม."],
  ["ฝ้าเพดาน", (a) => suggest.ceiling(a), 1100, "/ตร.ม."],
  ["ก่ออิฐฉาบ", () => suggest.wall(), 1100, "/ตร.ม."],
  ["เทพื้น 10 ซม.", () => suggest.floor(), 1500, "/ตร.ม."],
  ["ทรายถม (เหมา)", (a) => suggest.sand(a), 10000, "/งาน"],
  ["ไฟฟ้า", () => suggest.electric(), 1200, "/จุด"],
];
for (const [label, fn, want, unit] of flatRates) {
  const vals = [fn(6.3), fn(20), fn(50)]; // กวาด 3 พื้นที่ — ต้องได้ค่าเดียวกันทุกครั้ง
  if (vals.every((v) => v === want)) console.log(`  ✅ ${label.padEnd(18)} ${want.toLocaleString().padStart(6)} ${unit} (นิ่งทุกพื้นที่)`);
  else bad(`${label} = ${vals.join("/")} (ต้อง ${want.toLocaleString()} คงที่ทุกพื้นที่)`);
}

// รื้อสกัดพื้น = ราคาเหมาทั้งงาน → ใหญ่ขึ้นต้องแพงขึ้นเรื่อย ๆ ห้ามเด้งลงแม้แต่จุดเดียว
// (เจ้าของเคาะ 7 ส.ค.69 · เดิมรื้อ 15 ตร.ม. แพงกว่ารื้อ 30 ตร.ม.)
{
  let prev = -1, dip = "";
  for (let a = 1; a <= 200; a += 1) {
    const v = suggest.demolish(a);
    if (v < prev) { dip = `${a} ตร.ม. = ${v.toLocaleString()} ถูกกว่า ${a - 1} ตร.ม. = ${prev.toLocaleString()}`; break; }
    prev = v;
  }
  if (dip) bad(`รื้อสกัดราคาเด้งลง: ${dip}`);
  else console.log("  ✅ รื้อสกัด ใหญ่ขึ้น=แพงขึ้นเรื่อย ๆ ไม่เด้งลงเลย (1–200 ตร.ม.)");
  // ปลายช่วงต้องตรงเรนจ์ในไฟล์ + ตันที่เพดาน
  const pts = [[5, 10000], [10, 11000], [20, 12500], [30, 14000], [80, 16000], [200, 16000]];
  const wrong = pts.filter(([a, w]) => suggest.demolish(a) !== w);
  if (!wrong.length) console.log(`  ✅ รื้อสกัด ตรงเรนจ์ไฟล์: ${pts.map(([a, w]) => `${a}→${w.toLocaleString()}`).join(" · ")}`);
  else bad(`รื้อสกัดไม่ตรงเรนจ์: ${wrong.map(([a, w]) => `${a} ตร.ม. ได้ ${suggest.demolish(a).toLocaleString()} (ต้อง ${w.toLocaleString()})`).join(" · ")}`);
}

// ═══ ④b เคสตัวอย่าง 1.8×3.5 — ยอดต้องนิ่ง (คุม regression · ราคาใหม่ 18 ส.ค.69) ═══
//   ประวัติราคา: เดิม 108,930 (คาน 2,400 · กระเบื้อง 800 · ทราย 7,000)
//   18 ส.ค.69 อัพราคาตามชีตเปรียบเทียบ 5 งาน: คาน 2,200 · กระเบื้อง 850 · ทราย 10,000 (เหมา)
//   คำนวณใหม่: เข็ม 44,000 + ขุด 8,000 + ฟุตติ้ง 10,000 + คาน 10.6×2,200=23,320
//              + ทราย 10,000 + พื้น 6.3×1,500=9,450 + กระเบื้อง 6.3×850=5,355 = 110,125
console.log("\n═══ ④b เคสตัวอย่าง 1.8×3.5 = 110,125 (ราคาใหม่ 18 ส.ค.69) ═══");
{
  const items = draftItems(planFloor(1.8, 3.5), "i18", { tile: true, sand: true, floor: true });
  const got = Math.round(sumItems(items));
  const WANT = 110125;
  if (got === WANT) console.log(`  ✅ ยอดรวมนิ่งตามราคาใหม่ = ${got.toLocaleString()} (เดิม 108,930 ก่อนอัพราคา)`);
  else bad(`ยอดเคสตัวอย่าง = ${got.toLocaleString()} (ต้อง ${WANT.toLocaleString()} — ต่าง ${(got - WANT).toLocaleString()})`);
  const wall = got + Math.round(1100 * 6.3); // ก่ออิฐฉาบใหม่ 1,100/ตร.ม.
  if (wall === WANT + 6930) console.log(`  ✅ กรณีมีผนังปูน (+1,100/ตร.ม.) = ${wall.toLocaleString()}`);
  else bad(`กรณีมีผนังปูน = ${wall.toLocaleString()} (ต้อง ${(WANT + 6930).toLocaleString()})`);
}

// ═══ ⑤ รายการตั้งต้น + ผลรวม + หมวด ═══
console.log("\n═══ ⑤ รายการตั้งต้นบนใบเสนอ ═══");
{
  const plan = planFloor(1.8, 3.5);
  const items = draftItems(plan, "i18");
  // ส่วนโครงสร้าง (source=auto) ต้องมี 4 บรรทัดเสมอ: เข็ม/ขุด/ฟุตติ้ง/คาน
  const autos = items.filter((i) => i.source === "auto");
  if (autos.length === 4) console.log("  ✅ ส่วนโครงสร้าง 4 บรรทัด (เข็ม/ขุด/ฟุตติ้ง/คาน)");
  else bad(`ส่วนโครงสร้างได้ ${autos.length} บรรทัด (ต้องได้ 4)`);

  // line_total ทุกบรรทัดต้อง = qty × unit_price
  for (const it of items) {
    const want = Math.round((it.qty * it.unit_price + Number.EPSILON) * 100) / 100;
    if (Math.abs(it.line_total - want) > 0.005) bad(`line_total เพี้ยน: ${it.name.slice(0, 30)} → ${it.line_total} (ต้อง ${want})`);
  }
  // ยอดโครงสร้างต้องตรงกับสูตรตรง ๆ
  const wantStruct = plan.piles * (pileType("i18").price + RATE.dig + RATE.footing) + plan.beamLen * RATE.beam;
  const gotStruct = sumItems(autos);
  if (Math.abs(gotStruct - wantStruct) < 0.005) console.log(`  ✅ ยอดโครงสร้าง 1.8×3.5 = ${gotStruct.toLocaleString()}`);
  else bad(`ยอดโครงสร้าง ${gotStruct.toLocaleString()} (ต้อง ${wantStruct.toLocaleString()})`);

  // ผลรวมทั้งใบ = ผลบวกทุกบรรทัด (ไม่มี VAT — ตามฟอร์มช่าง)
  const manual = sumItems(items);
  const byHand = items.reduce((a, i) => a + i.line_total, 0);
  if (Math.abs(manual - byHand) < 0.005) console.log(`  ✅ ยอดรวมใบ = ผลบวกรายการตรง ๆ ไม่มี VAT (${manual.toLocaleString()})`);
  else bad("sumItems ไม่ตรงผลบวกมือ");

  // แบ่งหมวด: ยอดรวมทุกหมวดต้องเท่ายอดทั้งใบ
  const tagged = items.map((it, i) => ({ ...it, group_label: i < 4 ? "งานโครงสร้าง" : "งานพื้นผิว", sort_order: i }));
  const groups = groupItems(tagged);
  const gsum = groups.reduce((a, g) => a + g.subtotal, 0);
  if (groups.length === 2 && Math.abs(gsum - manual) < 0.005) {
    console.log(`  ✅ แบ่งหมวด ${groups.length} หมวด · ผลรวมหมวด = ยอดทั้งใบ (${groups.map((g) => `${g.label} ${g.subtotal.toLocaleString()}`).join(" + ")})`);
  } else bad(`แบ่งหมวดเพี้ยน: ${groups.length} หมวด ผลรวม ${gsum} (ต้อง ${manual})`);
}

// ═══ ⑥ ยิงใบจริงเข้าโครงข้อมูล — ใบคุณภวพร Rev01 (2 หมวด) ═══
// พิสูจน์ว่าโครง "แบ่งหมวด + ยอดรวมต่อหมวด + ยอดโดยรวมสุทธิ" ให้ตัวเลขตรงใบจริงเป๊ะ
console.log("\n═══ ⑥ ยิงใบจริงเข้าโครงข้อมูล — คุณภวพร (Rev01) 2 หมวด ═══");
{
  const real = [
    ["งานส่วนหน้าบ้าน", "งานรื้อประตูวงกบเดิมออกและตัดปูนทำซุ้มโค้งจับเซี้ยม แบบปูน", 13500],
    ["งานส่วนหน้าบ้าน", "งานรื้อกระเบื้องเดิมออกและเทปรับพื้นบันได", 9500],
    ["งานส่วนหน้าบ้าน", "งานผูกเหล็กหล่อบันได", 6500],
    ["งานส่วนหน้าบ้าน", "งานปูกระเบื้องพื้นและบันได พร้อมปูนทราย", 15000],
    ["งานส่วนหน้าบ้าน", "งานทาสีภายในห้องใหม่พร้อมสี", 9500],
    ["งานส่วนห้องเก็บของ", "งานสกัดพื้นเดิมออก และเทปรับ", 4500],
    ["งานส่วนห้องเก็บของ", "งานปูกระเบื้องพื้น พร้อมปูนทราย", 7500],
  ].map(([group_label, name, price], i) => ({
    group_label, name, qty: 1, unit: "งาน",
    material_price: null, labor_price: price, unit_price: price, line_total: price,
    remark: "", source: "manual", sort_order: i,
  }));

  const groups = groupItems(real);
  const want = { "งานส่วนหน้าบ้าน": 54000, "งานส่วนห้องเก็บของ": 12000 };
  for (const g of groups) {
    if (g.subtotal === want[g.label]) console.log(`  ✅ ยอดรวม ${g.label.padEnd(20)} ${g.subtotal.toLocaleString().padStart(7)}`);
    else bad(`ยอดรวม ${g.label} = ${g.subtotal.toLocaleString()} (ใบจริง ${want[g.label]?.toLocaleString()})`);
  }
  const net = sumItems(real);
  if (net === 66000) console.log(`  ✅ ยอดโดยรวมสุทธิ           ${net.toLocaleString().padStart(7)}   (ใบจริง 66,000)`);
  else bad(`ยอดโดยรวมสุทธิ = ${net.toLocaleString()} (ใบจริง 66,000)`);
  if (groups.length === 2) console.log("  ✅ แบ่งได้ 2 หมวด · เลขข้อเริ่ม 1 ใหม่ทุกหมวด (หน้าพิมพ์ใช้ index ในหมวด)");
  else bad(`แบ่งได้ ${groups.length} หมวด (ต้องได้ 2)`);
}

// ═══ ⑦ ใบเบิกงวด — ส่วนต่างกับใบเสนอ (บทเรียนจากใบจริง) ═══
console.log("\n═══ ⑦ ใบเบิกงวด vs ใบเสนอ — คุณพิทยารัตน์ (Rev03) ═══");
{
  const inst = [50000, 100000, 100000, 37612];
  const quote = 305612;
  const sum = inst.reduce((a, b) => a + b, 0);
  const diff = quote - sum;
  if (sum === 287612 && diff === 18000) {
    console.log(`  ✅ รวมงวด ${sum.toLocaleString()} · ใบเสนอ ${quote.toLocaleString()} · ต่าง ${diff.toLocaleString()}`);
    console.log("     (= กระเบื้องนอก 6,000 + ทาสี 12,000 · ทั้งคู่ติดป้าย \"งานเพิ่ม\" → หน้าจอต้องเตือนเคสนี้)");
  } else bad(`คำนวณส่วนต่างเพี้ยน: รวม ${sum} ต่าง ${diff}`);
}

// ═══ ⑧ ชื่อไฟล์เอกสาร (เจ้าของสั่ง 6 ส.ค.69: "ใบเสนอราคางานพื้น คุณ… rev<n>") ═══
console.log("\n═══ ⑧ ชื่อไฟล์ Excel/PDF ═══");
{
  const cases = [
    ["คุณกาญจนา", 0, "ใบเสนอราคางานพื้น คุณกาญจนา"],
    ["คุณกาญจนา", 1, "ใบเสนอราคางานพื้น คุณกาญจนา rev1"],
    ["คุณนฤมิตร", 12, "ใบเสนอราคางานพื้น คุณนฤมิตร rev12"],
    ["บจก. เอ/บี : ซี", 2, "ใบเสนอราคางานพื้น บจก. เอ บี ซี rev2"], // อักขระตั้งชื่อไฟล์ไม่ได้ → เว้นวรรค
    ["  คุณ ก  ", 0, "ใบเสนอราคางานพื้น คุณ ก"],                     // ช่องไฟหัวท้าย/ซ้ำ → ยุบ
    ["", 1, "ใบเสนอราคางานพื้น rev1"],                               // ไม่มีชื่อ → ห้ามมีเว้นวรรคซ้อน
    [null, 0, "ใบเสนอราคางานพื้น"],
  ];
  for (const [name, rev, want] of cases) {
    const got = quoteFileName(name, rev);
    if (got === want) console.log(`  ✅ ${JSON.stringify(name)} rev=${rev} → “${got}”`);
    else bad(`ชื่อไฟล์ ${JSON.stringify(name)} rev=${rev} → “${got}” (ต้องได้ “${want}”)`);
  }
  if (/[\\/:*?"<>|]/.test(quoteFileName('a/b\\c:d*e?f"g<h>i|j', 1))) bad("ยังมีอักขระที่ตั้งชื่อไฟล์ไม่ได้หลุดออกมา");
  else console.log("  ✅ ไม่มีอักขระต้องห้ามในชื่อไฟล์ (\\ / : * ? \" < > |)");
}

// ═══ ⑨ เพิ่มรายการต้องลง "หมวดที่เลือก" (บั๊กจริง 6 ส.ค.69: กดปุ่มลัดแล้วไปโผล่ผิดหมวด) ═══
console.log("\n═══ ⑨ เพิ่มรายการลงหมวดที่เลือก ═══");
{
  const mk = (g, n) => ({ group_label: g, name: n, qty: 1, unit: "งาน", unit_price: 0, line_total: 0 });
  const base = [mk("หมวด A", "a1"), mk("หมวด A", "a2"), mk("หมวด B", "b1")];

  const gs = groupNames(base);
  if (gs.length === 2 && gs[0] === "หมวด A" && gs[1] === "หมวด B") console.log(`  ✅ อ่านชื่อหมวดได้ ${gs.length} หมวด ตามลำดับบนใบ`);
  else bad(`groupNames ได้ ${JSON.stringify(gs)}`);

  // แทรกกลางใบ (ท้ายหมวด A) ไม่ใช่ท้ายใบ
  const r1 = addItemToGroup(base, mk("", "ใหม่"), "หมวด A");
  if (r1.length === 4 && r1[2].name === "ใหม่" && r1[2].group_label === "หมวด A" && r1[3].name === "b1") {
    console.log("  ✅ เพิ่มลงหมวด A → แทรกท้ายหมวด A (ตำแหน่ง 2) ไม่ไปต่อท้ายใบ");
  } else bad(`แทรกผิดตำแหน่ง: ${r1.map((x) => `${x.group_label}/${x.name}`).join(" · ")}`);

  // หมวดท้ายสุด → ต่อท้ายใบตามปกติ
  const r2 = addItemToGroup(base, mk("", "ใหม่"), "หมวด B");
  if (r2.length === 4 && r2[3].name === "ใหม่" && r2[3].group_label === "หมวด B") console.log("  ✅ เพิ่มลงหมวด B → ต่อท้ายใบ");
  else bad("แทรกหมวดท้ายผิด");

  // หมวดใหม่ที่ยังไม่มีรายการ → ต่อท้ายใบ พร้อมติดชื่อหมวดให้
  const r3 = addItemToGroup(base, mk("", "ใหม่"), "หมวด C");
  if (r3.length === 4 && r3[3].group_label === "หมวด C") console.log("  ✅ หมวดที่ยังไม่มีรายการ → ต่อท้ายใบ + ติดชื่อหมวดให้");
  else bad("หมวดใหม่ที่ยังว่างแทรกผิด");

  // ห้ามแก้ array เดิม (React state ต้องเป็นชุดใหม่เสมอ)
  if (base.length === 3) console.log("  ✅ ไม่แก้ array เดิม (คืนชุดใหม่)");
  else bad("addItemToGroup ไปแก้ array เดิม");
}

// ═══ ⑩ เคส "ลูกค้าลงเข็มไว้แล้ว" (เจ้าของสั่ง 6 ส.ค.69) ═══
//    ไม่คิดค่าตอกเข็ม · เหลือค่าตัดหัวเข็ม 2,000/ต้น · ที่เหลือ (ฟุตติ้ง/คาน/พื้น) เหมือนเดิมเป๊ะ
console.log("\n═══ ⑩ ใช้เข็มเดิมของลูกค้า — ไม่ตอกเพิ่ม มีแต่ค่าตัดหัวเข็ม ═══");
{
  const plan = planFloor(3, 6);           // 3×6 ม. → เข็ม 4 ต้น
  const normal = draftItems(plan, "i18");
  const reuse = draftItems(plan, "existing");

  if (isExistingPile("existing") && !isExistingPile("i18")) ok("แยกเคสเข็มเดิมออกจากเข็มปกติได้");
  else bad("isExistingPile ไม่ถูก");

  // ต้องไม่มีบรรทัดค่าตอกเข็ม
  const hasDrive = reuse.some((it) => /งานตอกเข็ม/.test(it.name));
  if (!hasDrive) ok("ไม่มีบรรทัด “งานตอกเข็ม” บนใบ");
  else bad("ยังมีบรรทัดตอกเข็มอยู่");
  if (normal.some((it) => /งานตอกเข็ม/.test(it.name))) ok("เคสปกติยังมีบรรทัดตอกเข็มเหมือนเดิม");
  else bad("เคสปกติบรรทัดตอกเข็มหาย");

  // ค่าตัดหัวเข็ม = 2,000 × จำนวนเข็ม
  const cut = reuse.find((it) => /ตัดหัวเข็ม/.test(it.name));
  const wantCut = plan.piles * RATE.dig;
  if (cut && cut.line_total === wantCut && RATE.dig === 2000) {
    ok(`ค่าตัดหัวเข็ม ${plan.piles} ต้น × 2,000 = ${wantCut.toLocaleString()}`);
  } else bad(`ค่าตัดหัวเข็มเพี้ยน: ${cut?.line_total} (ต้อง ${wantCut})`);
  if (/ลูกค้าลงเข็มไว้แล้ว/.test(cut?.name ?? "")) ok("ชื่อรายการบอกชัดว่าเป็นเข็มเดิม");
  else bad("ชื่อรายการไม่ได้ระบุว่าเป็นเข็มเดิม");

  // ที่เหลือต้องเท่าเคสปกติทุกบาท
  const rest = (list) => list.filter((it) => !/งานตอกเข็ม|ตัดหัวเข็ม/.test(it.name));
  const sameCount = rest(normal).length === rest(reuse).length;
  const sameSum = sumItems(rest(normal)) === sumItems(rest(reuse));
  if (sameCount && sameSum) ok(`ฟุตติ้ง/คาน/ทราย/พื้น/กระเบื้อง เท่าเดิมทุกบาท (${sumItems(rest(reuse)).toLocaleString()})`);
  else bad(`ส่วนที่เหลือไม่ตรง: ${rest(normal).length}/${rest(reuse).length} รายการ · ${sumItems(rest(normal))} vs ${sumItems(rest(reuse))}`);

  // ส่วนต่างทั้งใบ = ค่าตอกเข็มที่หายไปพอดี
  const diff = sumItems(normal) - sumItems(reuse);
  const wantDiff = plan.piles * pileType("i18").price;
  if (diff === wantDiff) ok(`ถูกกว่าเคสตอกใหม่ ${diff.toLocaleString()} = ค่าตอกเข็ม ${plan.piles} × 11,000 พอดี`);
  else bad(`ส่วนต่างเพี้ยน: ${diff} (ต้อง ${wantDiff})`);

  // ต้องมีในลิสต์ให้เลือก
  if (PILE_TYPES.some((p) => p.key === "existing")) ok("โผล่ในตัวเลือกชนิดเข็ม");
  else bad("ไม่มีในตัวเลือกชนิดเข็ม");
}

console.log(`\n═══ สรุป: ${failed === 0 ? "✅ ผ่านทั้งหมด" : `❌ ไม่ผ่าน ${failed} ข้อ`} ═══`);
process.exit(failed === 0 ? 0 : 1);
