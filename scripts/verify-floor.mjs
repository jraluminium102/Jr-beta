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
  MIN_SPAN, MAX_SPAN,
} from "../src/lib/floor-calc/engine.mjs";

let failed = 0;
const bad = (msg) => { failed++; console.log("  ❌ " + msg); };

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
console.log(`  ℹ️  คาน: ระบบใช้ ${RATE.beam.toLocaleString()}/ม. ตาม Excel (ใบจริงใช้ 2,200 — เจ้าของสั่ง "2400 ตามเอกเซล")`);

// ═══ ④ ค่าเริ่มต้นงานเหมา ไล่ระดับถูกทาง ═══
console.log("\n═══ ④ ค่าเริ่มต้นงานเหมา — พื้นที่เล็กต้องแพงกว่า (ต่อ ตร.ม.) ═══");
const tapered = [
  ["กระเบื้อง", suggest.tile, 800, 500],
  ["ฝ้า", suggest.ceiling, 2500, 1500],
];
for (const [label, fn, hi, lo] of tapered) {
  const small = fn(5), mid = fn(25), big = fn(60);
  if (small === hi && big === lo && mid < small && mid > big) {
    console.log(`  ✅ ${label.padEnd(10)} 5 ตร.ม.=${small.toLocaleString().padStart(5)} · 25=${mid.toLocaleString().padStart(5)} · 60=${big.toLocaleString().padStart(5)} /ตร.ม.`);
  } else bad(`${label} ไล่ระดับผิด: 5=${small} 25=${mid} 60=${big} (ต้อง ${hi}→${lo})`);
}
// ทราย: ฟิตจากของจริง 2 จุด
for (const [area, want, from] of [[6.3, 6900, "ไฟล์ใช้ 7,000"], [23, 11900, "ใบจริงใช้ 12,000"]]) {
  const got = suggest.sand(area);
  if (Math.abs(got - want) <= 100) console.log(`  ✅ ทราย ${String(area).padStart(4)} ตร.ม. = ${got.toLocaleString().padStart(6)}   (${from})`);
  else bad(`ทราย ${area} ตร.ม. → ${got.toLocaleString()} (คาด ~${want.toLocaleString()})`);
}
// ต่อ ตร.ม. ของทรายต้องลดลงเมื่อพื้นที่โต
if (suggest.sand(50) / 50 < suggest.sand(10) / 10) console.log("  ✅ ทราย ต่อ ตร.ม. ลดลงเมื่อพื้นที่ใหญ่ขึ้น");
else bad("ทราย ต่อ ตร.ม. ไม่ลดลงตามพื้นที่");

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

console.log(`\n═══ สรุป: ${failed === 0 ? "✅ ผ่านทั้งหมด" : `❌ ไม่ผ่าน ${failed} ข้อ`} ═══`);
process.exit(failed === 0 ? 0 : 1);
