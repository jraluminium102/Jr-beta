// option-coverage.mjs — ทดสอบทุกออปชันที่เพิ่มเข้ามา (R5.0)
// รันซ้ำได้: node test/option-coverage.mjs
// พิมพ์ตารางผล + process.exit(0) pass / process.exit(1) fail
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HTML_PATH = join(ROOT, "public/calculator/index.html");

// ===== JSDOM bootstrap =====
const html = readFileSync(HTML_PATH, "utf8");
const vc = new VirtualConsole();
const jsdomErrors = [];
vc.on("jsdomError", (e) => {
  if (!/scrollTo|Not implemented/i.test(e.message)) jsdomErrors.push(e.message);
});
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/calculator/index.html",
});
await new Promise((r) => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 1500);
});
const w = dom.window;
const doc = w.document;

// ===== helpers =====
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

// roundUp เหมือนในแอพ (ปัดขึ้นทุก 1,000)
const roundUp = (x) => Math.ceil(x / 1000) * 1000;

function setF(ch, sel, v) {
  const el = ch.querySelector(sel);
  if (!el) return null;
  if (el.type === "checkbox") {
    el.checked = !!v;
  } else {
    el.value = String(v);
  }
  fire(el, "input");
  fire(el, "change");
  return el;
}

function setById(id, v) {
  const el = doc.getElementById(id);
  if (!el) return null;
  if (el.type === "checkbox") {
    el.checked = !!v;
  } else {
    el.value = String(v);
  }
  fire(el, "input");
  fire(el, "change");
  return el;
}

function checkById(id, checked) {
  const el = doc.getElementById(id);
  if (!el) return null;
  el.checked = !!checked;
  fire(el, "change");
  return el;
}

function clearAll() {
  doc.getElementById("items").innerHTML = "";
  ["svc-protect","svc-lift","svc-travel","svc-ship","svc-elec","svc-demo"].forEach((id) => {
    const el = doc.getElementById(id);
    if (el && el.checked) { el.checked = false; fire(el, "change"); }
  });
  ["svc-elec-run","svc-demo-roof","svc-demo-floor","svc-demo-rail","svc-demo-door"].forEach((id) => {
    const el = doc.getElementById(id);
    if (el && el.checked) { el.checked = false; fire(el, "change"); }
  });
  setById("discFlat", 0);
  setById("discPct", 0);
}

function addItem(opts) {
  w.addItem(doc.getElementById("items"));
  const chs = doc.querySelectorAll("#items .ch");
  const ch = chs[chs.length - 1];

  if (opts.g != null) setF(ch, ".i-group", opts.g);

  if (opts.prod != null) {
    const ps = ch.querySelector(".i-prod");
    if (ps && !ps.querySelector(`option[value="${opts.prod}"]`)) {
      ps.innerHTML = w.prodOptionsG6(String(opts.g || 1));
    }
    if (ps) { ps.value = opts.prod; fire(ps, "change"); }
  }

  if (opts.itype != null) setF(ch, ".i-type", opts.itype);
  if (opts.w != null) setF(ch, ".i-w", opts.w);
  if (opts.h != null) setF(ch, ".i-h", opts.h);
  if (opts.panels != null) setF(ch, ".i-panels", opts.panels);
  if (opts.qty != null) setF(ch, ".i-qty", opts.qty);
  return ch;
}

function getQuoteText() {
  w.calcQuote();
  w.genQuote();
  const el = doc.getElementById("quoteContent");
  return (el ? el.textContent : "").replace(/\s+/g, " ").trim();
}

function readItemSell(ch) {
  const ri = w.readItem && w.readItem(ch);
  return ri ? (ri.r ? ri.r.sell : NaN) : NaN;
}

// parse ตัวเลขจาก q2 format: "66,000.00 บาท" → 66000
// ต้องตัด ".XX" ก่อน แล้วค่อยเอาตัวเลข
function parseQ2(text) {
  if (!text) return NaN;
  // ตัด decimal (.nn) ออกก่อน
  const stripped = text.replace(/\.\d+/g, "").replace(/[^\d]/g, "");
  return stripped ? parseInt(stripped, 10) : NaN;
}

const fmt = (n) => (isNaN(n) ? "—" : Math.round(n).toLocaleString("en-US"));

// ===== ตาราง result =====
const results = [];
function check(optName, setup, expected, detail) {
  results.push({ optName, setup, expected, detail, ok: null });
  return results[results.length - 1];
}

// ===== TEST 1: หลังคา แปคู่ =====
// คาดหวัง: ราคาเท่าแปเดี่ยว (delta=0) · ใบมี "(แปคู่)"
{
  clearAll();
  const ch = addItem({ g: 3, prod: "roof_vinyl", w: 4, h: 3 });
  const baseSell = readItemSell(ch);

  setF(ch, ".o-roofbatten", "แปคู่");
  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;

  const qt = getQuoteText();
  const hasText = qt.includes("(แปคู่)") || qt.includes("แปคู่");

  const ok = delta === 0 && hasText;
  const entry = check(
    "หลังคา แปคู่",
    "roof_vinyl 4×3, .o-roofbatten=แปคู่",
    "delta=0, ใบมี '(แปคู่)'",
    `delta=${delta} | hasText=${hasText} | base=${fmt(baseSell)} after=${fmt(afterSell)}`
  );
  entry.ok = ok;
}

// ===== TEST 2: หลังคา โครงเหล็กชุบ =====
// คาดหวัง: delta=0 · ใบมี "เหล็กชุบ"
{
  clearAll();
  const ch = addItem({ g: 3, prod: "roof_vinyl", w: 4, h: 3 });
  const baseSell = readItemSell(ch);

  setF(ch, ".o-roofframe", "โครงเหล็กชุบซิงค์");
  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;

  const qt = getQuoteText();
  const hasText = qt.includes("เหล็กชุบ");

  const ok = delta === 0 && hasText;
  const entry = check(
    "หลังคา โครงเหล็กชุบ",
    "roof_vinyl 4×3, .o-roofframe=โครงเหล็กชุบซิงค์",
    "delta=0, ใบมี 'เหล็กชุบ'",
    `delta=${delta} | hasText=${hasText} | base=${fmt(baseSell)} after=${fmt(afterSell)}`
  );
  entry.ok = ok;
}

// ===== TEST 3: หลังคา ปิดปลายกันน้ำกระเด็น (G3-round2 C: เป็นตัวเลือกที่ 3 ของ o-roofend · auto ยาว=i-w · 1,000/ม.) =====
{
  clearAll();
  const ch = addItem({ g: 3, prod: "roof_vinyl", w: 4, h: 3 });
  const baseSell = readItemSell(ch);

  // G3-round2 C: o-roofend ต้อง "มี" ตัวเลือก "ปิดปลาย" แล้ว (single-select 3 ค่า)
  const roofendOpts = [...ch.querySelector(".o-roofend").options].map(o => o.value);
  const hasEndOption = roofendOpts.includes("ปิดปลาย");

  setF(ch, ".o-roofend", "ปิดปลาย"); // เลือก → onchange auto เติม o-rfeave = i-w (4)
  const rfeaveAuto = parseFloat(ch.querySelector(".o-rfeave").value) || 0;
  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;
  const expectedDelta = roundUp(baseSell + 4000) - baseSell; // 1,000 × 4

  const ok = hasEndOption && rfeaveAuto === 4 && delta === expectedDelta;
  const entry = check(
    "หลังคา ปิดปลายกันน้ำกระเด็น (o-roofend=ปิดปลาย)",
    "roof_vinyl 4×3, เลือก o-roofend='ปิดปลาย' · auto ยาว=4",
    `o-roofend มี 'ปิดปลาย' + auto ยาว=4 + delta=+${expectedDelta} (1,000×4)`,
    `hasEndOption=${hasEndOption} | rfeaveAuto=${rfeaveAuto} | delta=${delta} (คาด ${expectedDelta})`
  );
  entry.ok = ok;
}

// ===== TEST 4: หลังคา รางน้ำ ท่อ สีดำ =====
// G3-round2 C (มติพี่นัท): รางน้ำ "คิดเงิน" = เรตราง(o-rfgut) × ยาว(auto=i-w) · default อลู S 1,000 × 4 = 4,000 (ไม่ใช่ฟรี)
{
  clearAll();
  const ch = addItem({ g: 3, prod: "roof_vinyl", w: 4, h: 3 });
  const baseSell = readItemSell(ch);

  setF(ch, ".o-roofend", "รางน้ำ");
  // trigger show/hide ของ guttersys-wrap (jsdom ไม่รัน inline onchange DOM อัตโนมัติ)
  const gutWrap = ch.querySelector(".o-guttersys-wrap");
  if (gutWrap) gutWrap.style.display = "block";
  setF(ch, ".o-guttersys", "ท่อ");
  const pipeWrap = ch.querySelector(".o-gutter-pipe-wrap");
  if (pipeWrap) pipeWrap.style.display = "inline";
  setF(ch, ".o-gutter-pipecolor", "ดำ");

  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;

  const qt = getQuoteText();
  const hasText = qt.includes("ท่อ สีดำ") || qt.includes("รางน้ำ (ท่อ สีดำ)");

  const ok = delta === 4000 && hasText;
  const entry = check(
    "หลังคา รางน้ำ ท่อ สีดำ",
    "roof_vinyl 4×3, .o-roofend=รางน้ำ, .o-guttersys=ท่อ, .o-gutter-pipecolor=ดำ",
    "delta=4,000 (อลู S 1,000×ยาว 4 · G3-round2 C คิดเงิน), ใบมี 'รางน้ำ...(ท่อ สีดำ)'",
    `delta=${delta} | hasText=${hasText} | base=${fmt(baseSell)} after=${fmt(afterSell)}`
  );
  entry.ok = ok;
}

// ===== TEST 5: สีวัสดุมุง โพลีตัน (แสงผ่าน) =====
// คาดหวัง: delta=0 · ใบมี "สีวัสดุมุง" + "แสงผ่าน"
{
  clearAll();
  const ch = addItem({ g: 3, prod: "roof_polyton", w: 4, h: 3 });
  const baseSell = readItemSell(ch);

  // เลือก option ที่มี "แสงผ่าน"
  const colorSel = ch.querySelector(".o-roofcolor");
  let chosenColor = "";
  if (colorSel) {
    for (const opt of colorSel.options) {
      if (opt.value.includes("แสงผ่าน")) { chosenColor = opt.value; break; }
    }
    if (chosenColor) { colorSel.value = chosenColor; fire(colorSel, "input"); fire(colorSel, "change"); }
  }

  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;

  const qt = getQuoteText();
  const hasSeeThru = qt.includes("แสงผ่าน");
  // F6: สีวัสดุมุงรวมในหัว "หลังคาโพลีตัน <สี>" แทนบรรทัด "สีวัสดุมุง:" แยก
  const hasColorLine = qt.includes("หลังคาโพลีตัน");

  const ok = delta === 0 && hasSeeThru && hasColorLine;
  const entry = check(
    "สีวัสดุมุง โพลีตัน (แสงผ่าน)",
    `roof_polyton 4×3, .o-roofcolor='${chosenColor.slice(0,20)}...'`,
    "delta=0, ใบมี 'หลังคาโพลีตัน' + 'แสงผ่าน'",
    `delta=${delta} | hasColorLine=${hasColorLine} | hasSeeThru=${hasSeeThru} | chosen='${chosenColor.slice(0,30)}'`
  );
  entry.ok = ok;
}

// ===== TEST 6a: คาดตาราง (ไม่โค้ง) =====
// บานเปิด 2×2, nh=2, nv=2, rate=200
// gridcost raw = (2×2 + 2×2)×200 = 1,600
// sell = roundUp(base_raw + 1,600) → delta = roundUp(base_raw+1600) - roundUp(base_raw)
// ตรวจ: delta ≥ rawGridCost (round-up ขึ้นได้แต่ไม่เกิน rawGridCost + 999)
{
  clearAll();
  const ch = addItem({ g: 1, prod: "casement_euro", itype: "door", w: 2, h: 2, panels: 2 });
  const baseSell = readItemSell(ch);

  const gmCk = ch.querySelector(".o-gridmark");
  if (gmCk) { gmCk.checked = true; fire(gmCk, "input"); fire(gmCk, "change"); }
  const gmWrap = ch.querySelector(".o-gm-wrap");
  if (gmWrap) gmWrap.style.display = "flex";

  setF(ch, ".o-gm-nh", 2);
  setF(ch, ".o-gm-nv", 2);
  setF(ch, ".o-gm-rate", 200);
  setF(ch, ".o-gm-curve", 0);

  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;

  const rawGridCost = (2 * 2 + 2 * 2) * 200; // 1600
  // casement_euro = ceLinear: sell=Math.round(core+extras) (ไม่ roundUp พัน) · base ×100 ลงตัว → delta = rawGridCost เป๊ะ
  const expectedDelta = rawGridCost;
  const ok = delta === expectedDelta;
  const entry = check(
    "คาดตาราง (ไม่โค้ง)",
    "casement_euro 2×2, .o-gridmark เช็ค, nh=2, nv=2, rate=200, curve=0",
    `delta=+${expectedDelta} (rawGridCost=${rawGridCost} · ceLinear Math.round)`,
    `delta=${delta} (คาด ${expectedDelta}) | rawGridCost=${rawGridCost} | base=${fmt(baseSell)} after=${fmt(afterSell)}`
  );
  entry.ok = ok;
}

// ===== TEST 6b: คาดตาราง + โค้ง 1 เส้น =====
// rawGridCost = 1,600 + 3,000 = 4,600
// delta = roundUp(base + 4600) - base
{
  clearAll();
  const ch = addItem({ g: 1, prod: "casement_euro", itype: "door", w: 2, h: 2, panels: 2 });
  const baseSell = readItemSell(ch);

  const gmCk = ch.querySelector(".o-gridmark");
  if (gmCk) { gmCk.checked = true; fire(gmCk, "input"); fire(gmCk, "change"); }
  const gmWrap = ch.querySelector(".o-gm-wrap");
  if (gmWrap) gmWrap.style.display = "flex";

  setF(ch, ".o-gm-nh", 2);
  setF(ch, ".o-gm-nv", 2);
  setF(ch, ".o-gm-rate", 200);
  setF(ch, ".o-gm-curve", 1);

  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;

  const rawGridCost = (2 * 2 + 2 * 2) * 200 + 1 * 3000; // 4600
  // ceLinear (Math.round · base ×100 ลงตัว) → delta = rawGridCost เป๊ะ ไม่ roundUp พัน
  const expectedDelta = rawGridCost;
  const ok = delta === expectedDelta;
  const entry = check(
    "คาดตาราง + โค้ง 1 เส้น",
    "casement_euro 2×2, nh=2, nv=2, rate=200, curve=1",
    `delta=+${expectedDelta} (rawGridCost=${rawGridCost} · ceLinear Math.round)`,
    `delta=${delta} (คาด ${expectedDelta}) | rawGridCost=${rawGridCost} | base=${fmt(baseSell)} after=${fmt(afterSell)}`
  );
  entry.ok = ok;
}

// ===== TEST 7: งานไฟ =====
// svc-elec + svc-elec-run → +3,000 · svc-elec-sw=2 → +2,000 · รวม = 5,000
{
  clearAll();
  addItem({ g: 1, prod: "sliding_euro", w: 2, h: 2, panels: 2 });

  checkById("svc-elec", true);
  checkById("svc-elec-run", true);
  setById("svc-elec-sw", 2);
  w.calcQuote();

  const qt = getQuoteText();
  const hasElecRun = qt.includes("เดินไฟ") || qt.includes("งานไฟ");
  const hasSw = qt.includes("สวิตซ์") || qt.includes("สวิตช์");

  // ตรวจตัวเลขผ่าน jobServices API
  const svc = w.jobServices ? w.jobServices(0, 0) : null;
  const elecLines = svc ? svc.lines.filter((l) => /งานไฟ/.test(l[0])) : [];
  const elecTotal = elecLines.reduce((a, l) => a + l[1], 0);

  const expectedElec = 3000 + 2 * 1000; // 5000
  const ok = elecTotal === expectedElec && hasElecRun;
  const entry = check(
    "งานไฟ (เดินไฟ + สวิตซ์ 2 จุด)",
    "svc-elec + svc-elec-run เช็ค, svc-elec-sw=2",
    `ยอดงานไฟ=${expectedElec} (3,000+2,000), ใบมี 'เดินไฟ'`,
    `elecTotal=${elecTotal} (คาด ${expectedElec}) | lines=${JSON.stringify(elecLines)} | hasElecRun=${hasElecRun} | hasSw=${hasSw}`
  );
  entry.ok = ok;
}

// ===== TEST 8: งานรื้อ ครบทุกชนิด =====
// roof 2ชุด=10,000, floor 1ราง=5,000, rail 4ม.=3,000+700×4=5,800, door เหมา 6,000
// รวม = 26,800 · ใบมี "งานรื้อของเดิม"
{
  clearAll();
  addItem({ g: 1, prod: "sliding_euro", w: 2, h: 2 });

  checkById("svc-demo", true);
  checkById("svc-demo-roof", true);
  setById("svc-demo-roof-qty", 2);
  checkById("svc-demo-floor", true);
  setById("svc-demo-floor-qty", 1);
  checkById("svc-demo-rail", true);
  setById("svc-demo-rail-len", 4);
  checkById("svc-demo-door", true);
  setById("svc-demo-door-amt", 6000);

  const svc = w.jobServices ? w.jobServices(0, 0) : null;
  const demoLine = svc ? svc.lines.find((l) => /งานรื้อ/.test(l[0])) : null;
  const demoTotal = demoLine ? demoLine[1] : NaN;

  const expectedDemo = 5000 * 2 + 5000 * 1 + (3000 + 700 * 4) + 6000; // 26800
  const qt = getQuoteText();
  const hasDemo = qt.includes("งานรื้อของเดิม");

  const ok = demoTotal === expectedDemo && hasDemo;
  const entry = check(
    "งานรื้อ ครบทุกชนิด",
    "roof×2=10,000 + floor×1=5,000 + rail 4ม.=5,800 + door เหมา 6,000",
    `รวม=${expectedDemo}, ใบมี 'งานรื้อของเดิม'`,
    `demoTotal=${demoTotal} (คาด ${expectedDemo}) | hasDemo=${hasDemo}`
  );
  entry.ok = ok;
}

// ===== TEST 9: ธรณีหลังเต่า บานเปิด =====
// +1,000 (ก่อน roundUp ด้วย) · ใบมี "หลังเต่า"
{
  clearAll();
  const ch = addItem({ g: 1, prod: "casement_euro", itype: "door", w: 1.2, h: 2.2, panels: 1 });
  const baseSell = readItemSell(ch);

  setF(ch, ".o-thresh", "turtle");
  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;

  const qt = getQuoteText();
  const hasText = qt.includes("หลังเต่า");

  // delta จริง = roundUp(baseSell + 1000) - baseSell
  const expectedDelta = roundUp(baseSell + 1000) - baseSell;
  const ok = delta === expectedDelta && hasText;
  const entry = check(
    "ธรณีหลังเต่า บานเปิด",
    "casement_euro 1.2×2.2, .o-thresh=turtle",
    `delta=+${expectedDelta} (1,000 หลัง roundUp), ใบมี 'หลังเต่า'`,
    `delta=${delta} (คาด ${expectedDelta}) | hasText=${hasText} | base=${fmt(baseSell)} after=${fmt(afterSell)}`
  );
  entry.ok = ok;
}

// ===== TEST 10: ธรณีเฟี้ยม (.o-threshf=inner) =====
// delta=0 · ใบมีข้อความ "ธรณี"
{
  clearAll();
  const ch = addItem({ g: 1, prod: "folding", itype: "door", w: 2.4, h: 2.4, panels: 4 });
  const baseSell = readItemSell(ch);

  setF(ch, ".o-threshf", "inner");
  const afterSell = readItemSell(ch);
  const delta = afterSell - baseSell;

  const qt = getQuoteText();
  const hasText = qt.includes("ธรณี");

  const ok = delta === 0 && hasText;
  const entry = check(
    "ธรณีเฟี้ยม (.o-threshf=inner)",
    "folding 2.4×2.4, .o-threshf=inner",
    "delta=0, ใบมีข้อความ 'ธรณี'",
    `delta=${delta} | hasText=${hasText} | base=${fmt(baseSell)} after=${fmt(afterSell)}`
  );
  entry.ok = ok;
}

// ===== TEST 11: Shower door_fixed + sliding =====
// ใบมี "บานติดตายพร้อมบานเลื่อน" + "กระจกเทมเปอร์ใส 10 มม." + "ราวสแตนเลส"
{
  clearAll();
  const ch = addItem({ g: 1, prod: "shower", w: 1.2, h: 2.0 });

  setF(ch, ".o-shtype", "door_fixed");
  setF(ch, ".o-shdoortype", "sliding");

  const qt = getQuoteText();
  const hasConfig = qt.includes("บานติดตายพร้อมบานเลื่อน");
  const hasGlass = qt.includes("กระจกเทมเปอร์ใส 10 มม.") || qt.includes("กระจกเทมเปอร์ใส");
  const hasRail = qt.includes("ราวสแตนเลส");

  const ok = hasConfig && hasGlass && hasRail;
  const entry = check(
    "Shower door_fixed + sliding",
    "shower 1.2×2.0, .o-shtype=door_fixed, .o-shdoortype=sliding",
    "ใบมี 'บานติดตายพร้อมบานเลื่อน' + 'กระจกเทมเปอร์ใส 10 มม.' + 'ราวสแตนเลส'",
    `hasConfig=${hasConfig} | hasGlass=${hasGlass} | hasRail=${hasRail}`
  );
  entry.ok = ok;
}

// ===== TEST 12: กั้นห้องกระจก (2 ด้าน + หลังคา) =====
// ใบมี "ด้าน A"/"ด้าน B" · ไม่มี "ค่าทำชุด" · subtotal = sumParts (ยกเลิก 5,000 แล้ว)
{
  clearAll();

  const sb = w.addGlasshouseSet();

  if (sb) {
    // ตั้งชื่อชุด
    const sn = sb.querySelector(".set-name");
    if (sn) { sn.value = "กั้นห้องกระจก ทดสอบ"; fire(sn, "input"); fire(sn, "change"); }

    const parts = sb.querySelector(".set-parts");
    let chs = parts ? parts.querySelectorAll(".ch") : [];

    // ด้าน A: sliding_euro
    if (chs.length >= 1) {
      const ch0 = chs[0];
      const ps = ch0.querySelector(".i-prod");
      if (ps && !ps.querySelector('option[value="sliding_euro"]')) ps.innerHTML = w.prodOptionsG6("6");
      if (ps) { ps.value = "sliding_euro"; fire(ps, "change"); }
      setF(ch0, ".i-w", 3.0); setF(ch0, ".i-h", 2.4);
      const pA = ch0.querySelector(".i-position");
      if (pA) { pA.value = "ด้าน A"; fire(pA, "input"); fire(pA, "change"); }
    }

    // เพิ่มด้าน B
    const addBtn = sb.querySelector(".set-addpart");
    if (addBtn) fire(addBtn, "click");
    chs = parts ? parts.querySelectorAll(".ch") : [];
    if (chs.length >= 2) {
      const ch1 = chs[chs.length - 1];
      const ps = ch1.querySelector(".i-prod");
      if (ps && !ps.querySelector('option[value="fixed_glass"]')) ps.innerHTML = w.prodOptionsG6("6");
      if (ps) { ps.value = "fixed_glass"; fire(ps, "change"); }
      setF(ch1, ".i-w", 2.0); setF(ch1, ".i-h", 2.4);
      const pB = ch1.querySelector(".i-position");
      if (pB) { pB.value = "ด้าน B"; fire(pB, "input"); fire(pB, "change"); }
    }

    // เพิ่มหลังคา
    const roofBtn = sb.querySelector(".set-addroof");
    if (roofBtn) fire(roofBtn, "click");
    chs = parts ? parts.querySelectorAll(".ch") : [];
    if (chs.length >= 3) {
      const roofCh = chs[chs.length - 1];
      const ps = roofCh.querySelector(".i-prod");
      if (ps) { ps.value = "roof_std"; fire(ps, "change"); }
      setF(roofCh, ".i-w", 6.0); setF(roofCh, ".i-h", 2.5);
    }
  }

  w.calcQuote();

  // อ่านราคาแต่ละส่วนจาก ch ใน setbox
  const allChs = sb ? [...sb.querySelectorAll(".ch")] : [];
  const partPrices = allChs.map((ch) => {
    const ri = w.readItem && w.readItem(ch);
    return ri && ri.r ? (ri.r.sell || 0) : 0;
  }).filter((v) => v > 0);
  const sumParts = partPrices.reduce((a, b) => a + b, 0);

  w.genQuote();
  const qt = getQuoteText();
  const hasSetName = qt.includes("กั้นห้องกระจก");
  const hasSideA = qt.includes("ด้าน A");
  const hasSideB = qt.includes("ด้าน B");
  const noSetFee = !qt.includes("ค่าทำชุด"); // ยกเลิกค่าทำชุด 5,000 แล้ว — ไม่ควรปรากฏในใบ

  // อ่าน subtotal จาก .qtot .l แรก — text: "รวมเป็นเงิน 61,000.00 บาท"
  // ต้องตัด decimal (.00) ก่อน แล้วถึงเอาตัวเลข
  const subEl = doc.querySelector("#quoteContent .qtot .l");
  const subText = subEl ? subEl.textContent : "";
  const subtotal = parseQ2(subText);
  const expectedSub = sumParts; // ไม่มี +5000 แล้ว
  const subOk = subtotal === expectedSub;

  const ok = hasSetName && hasSideA && hasSideB && noSetFee && subOk;
  const entry = check(
    "กั้นห้องกระจก (2 ด้าน + หลังคา)",
    "addGlasshouseSet, ด้าน A=sliding_euro 3×2.4, ด้าน B=fixed_glass 2×2.4, หลังคา=roof_std 6×2.5",
    "ใบมี 'ด้าน A'/'ด้าน B' + ไม่มี 'ค่าทำชุด' + subtotal = sumParts",
    `hasSetName=${hasSetName} | hasSideA=${hasSideA} | hasSideB=${hasSideB} | noSetFee=${noSetFee} | subtotal=${subtotal} expected=${expectedSub} (sumParts=${sumParts}) | subOk=${subOk} | subText='${subText.slice(0,50)}'`
  );
  entry.ok = ok;
}

// ===== พิมพ์ตาราง =====
const COL1 = 34, COL2 = 46, COL3 = 46, COL4 = 8;
function pad(s, n) { return String(s).slice(0, n).padEnd(n); }
function padL(s, n) { return String(s).slice(0, n).padStart(n); }
const DIV = "+" + "-".repeat(COL1+2) + "+" + "-".repeat(COL2+2) + "+" + "-".repeat(COL3+2) + "+" + "-".repeat(COL4+2) + "+";

console.log("\n=== option-coverage.mjs — ผลทดสอบออปชัน ===\n");
console.log(DIV);
console.log("| " + pad("ออปชัน", COL1) + " | " + pad("ใส่ค่าอะไร", COL2) + " | " + pad("ค่าที่คาด/ข้อความ", COL3) + " | " + pad("ผล", COL4) + " |");
console.log(DIV);

let passCount = 0;
for (const r of results) {
  const icon = r.ok ? "PASS" : "FAIL";
  console.log("| " + pad(r.optName, COL1) + " | " + pad(r.setup, COL2) + " | " + pad(r.expected, COL3) + " | " + padL(icon, COL4) + " |");
  if (!r.ok) {
    // พิมพ์ detail บรรทัดถัดไปถ้าไม่ผ่าน
    const detail = "  => " + r.detail;
    const maxW = COL1 + COL2 + COL3 + COL4 + 9;
    console.log("|  " + pad(detail, maxW) + " |");
  }
  if (r.ok) passCount++;
}
console.log(DIV);
console.log(`\nผ่าน ${passCount}/${results.length} ออปชัน`);

if (jsdomErrors.length > 0) {
  console.log(`\njsdom errors (${jsdomErrors.length}):`);
  jsdomErrors.slice(0, 5).forEach((e) => console.log("  " + e));
}

console.log("\n--- Detail ทุก case ---");
for (const r of results) {
  console.log(`[${r.ok ? "PASS" : "FAIL"}] ${r.optName}`);
  console.log(`       ${r.detail}`);
}

process.exit(passCount === results.length ? 0 : 1);
