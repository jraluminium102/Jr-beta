// quote-fidelity.mjs — ตรวจว่าใบเสนอราคาที่ gen จริง มีข้อมูลครบ 13 หมวด
// render ด้วย JSDOM จริง → อ่าน table row (td[1]=รายละเอียด, td[4]=ยอดรวม) → ตรวจ field
// รันซ้ำได้: node test/quote-fidelity.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const calcHtml = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");

// ============================================================
// boot JSDOM
// ============================================================
const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", (e) => {
  if (!/scrollTo|Not implemented/i.test(e.message)) jsErrors.push(e.message);
});

const dom = new JSDOM(calcHtml, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/",
});
await new Promise((r) => {
  dom.window.addEventListener("load", r);
  setTimeout(r, 1500);
});

const w = dom.window;
const doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

function setF(ch, sel, v) {
  const el = ch.querySelector(sel);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
}
function setF2(id, v) {
  const el = doc.getElementById(id);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
}
function clearItems() { doc.getElementById("items").innerHTML = ""; }

// ปิดค่าบริการ
["svc-protect", "svc-lift", "svc-travel", "svc-ship"].forEach((id) => {
  const e = doc.getElementById(id);
  if (e && e.checked) { e.checked = false; fire(e, "change"); }
});

// ============================================================
// helpers — อ่านผลใบจริงจาก table rows เท่านั้น
// text = textContent ของ td[1] (ช่องรายละเอียด) ทุกแถว รวมกัน
// priceText = textContent ของ td[4] (ช่องยอดรวม) แถวแรก
// ============================================================
function readQuoteRows() {
  const qc = doc.getElementById("quoteContent");
  const rows = [...qc.querySelectorAll("table.qt tbody tr")];
  let detailText = "";
  let priceRaw = "";
  rows.forEach((row) => {
    const tds = row.querySelectorAll("td");
    if (tds[1]) detailText += " " + (tds[1].textContent || "").replace(/\s+/g, " ").trim();
    if (!priceRaw && tds[4]) priceRaw = (tds[4].textContent || "").replace(/\s+/g, " ").trim();
  });
  // สกัดราคาจาก td[4] แรก: "176,000.00" → 176000
  const priceNum = priceRaw
    ? parseInt(priceRaw.replace(/[^\d]/g, "")) || 0
    : 0;
  return { detailText: detailText.trim(), price: priceNum };
}

// ============================================================
// addItem — สร้าง 1 รายการ + auto-set color/glass
// ============================================================
function addItem(it) {
  w.addItem(doc.getElementById("items"));
  const chs = doc.querySelectorAll("#items .ch");
  const ch = chs[chs.length - 1];
  setF(ch, ".i-group", it.g);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + it.prod + '"]')) {
    ps.innerHTML = w.prodOptionsG6(String(it.g));
  }
  ps.value = it.prod;
  fire(ps, "change");
  if (it.w != null) setF(ch, ".i-w", it.w);
  if (it.h != null) setF(ch, ".i-h", it.h);
  if (it.panels != null) setF(ch, ".i-panels", it.panels);
  if (it.qty != null) setF(ch, ".i-qty", it.qty);
  if (it.pos) setF(ch, ".i-position", it.pos);
  if (it.itype) setF(ch, ".i-type", it.itype);
  for (const [sel, val] of Object.entries(it.opts || {})) setF(ch, sel, val);
  // auto-set color index 1 + glass index 1 (ถ้า autoColor ไม่ถูก disable)
  if (it.autoColor !== false) {
    const c = ch.querySelector(".i-color");
    if (c && c.options.length > 1) { c.value = c.options[1].value; fire(c, "change"); }
    const g = ch.querySelector(".i-glass");
    if (g && g.options.length > 1) { g.value = g.options[1].value; fire(g, "change"); }
  }
  // mosquito: เลือก option 1 ของ .o-mosq
  if (it.mosquito) {
    const mq = ch.querySelector(".o-mosq");
    if (mq && mq.options.length > 1) { mq.value = mq.options[1].value; fire(mq, "change"); }
  }
  // slidelock: เลือก option 1 ของ .o-slidelock
  if (it.slidelock) {
    const sl = ch.querySelector(".o-slidelock");
    if (sl && sl.options.length > 1) { sl.value = sl.options[1].value; fire(sl, "change"); }
  }
  return ch;
}

// ============================================================
// addGlasshouseSet2 — ชุดกั้นห้องกระจก (flow เหมือน gen-quotes-full)
// ============================================================
function addGlasshouseSet2(cfg) {
  // A4: ห้องต่อเติม (paged room · เลิก setbox) — กรอก state ตรงๆ จาก cfg
  const d = w.addGlasshouseSet();
  const st = d.__g6state;
  const sides = cfg.sides || [];
  const catOf = (id) => (w.PBYID && w.PBYID[id] ? w.PBYID[id].cat : "บาน");
  if (sides.length) {
    st.sides = sides.map((s) => ({ type: "glass", cols: [{ pcs: [{ cat: catOf(s.prod), id: s.prod || "casement_euro", w: s.w != null ? s.w : 1, h: s.h != null ? s.h : 2.4, opt: {} }] }] }));
  }
  if (cfg.roof) {
    st.roof = { on: 1, matId: cfg.roof.prod || "roof_vinyl", w: cfg.roof.w != null ? cfg.roof.w : 3, l: cfg.roof.h != null ? cfg.roof.h : 3, frame: "โครงอลูมิเนียม", gut: 0, gutlen: 0, eave: 0, ex: {} };
  }
  w.calcQuote();
  return d;
}

// ============================================================
// render helpers — คืน { detailText, price }
// ============================================================
function renderSingle(it, setupFn) {
  clearItems();
  setF2("discFlat", 0); setF2("discPct", 0);
  setF2("custName", "ทดสอบ"); setF2("qdate", "01-01-69");
  if (setupFn) setupFn();
  else addItem(it);
  w.calcQuote();
  w.genQuote();
  return readQuoteRows();
}

function renderGlasshouse(cfg) {
  clearItems();
  setF2("discFlat", 0); setF2("discPct", 0);
  setF2("custName", "ทดสอบ"); setF2("qdate", "01-01-69");
  addGlasshouseSet2(cfg);
  w.calcQuote();
  w.genQuote();
  return readQuoteRows();
}

// ============================================================
// test runner
// ============================================================
const results = [];

function test(cat, itemKeywords, detailKeywords, renderFn, notInDetail) {
  let detailText = "";
  let price = 0;
  try {
    const r = renderFn();
    detailText = r.detailText;
    price = r.price;
  } catch (e) {
    results.push({
      cat,
      itemOk: false, detailOk: false,
      missing: ["RENDER ERROR: " + e.message],
      price: 0, pass: false,
    });
    return;
  }

  const itemMissing = [];
  for (const kw of itemKeywords) {
    if (!detailText.includes(kw)) itemMissing.push(kw);
  }

  const detailMissing = [];
  for (const kw of detailKeywords) {
    if (!detailText.includes(kw)) detailMissing.push(kw);
  }

  // ตรวจคำที่ "ไม่ควรปรากฏ" ใน detail section
  const shouldNotAppear = [];
  for (const kw of (notInDetail || [])) {
    if (detailText.includes(kw)) shouldNotAppear.push(kw);
  }

  const missing = [
    ...itemMissing.map((k) => "[รายการ] ขาด: " + k),
    ...detailMissing.map((k) => "[รายละเอียด] ขาด: " + k),
    ...shouldNotAppear.map((k) => "[รายละเอียด] ไม่ควรมี: " + k),
  ];

  const itemOk = itemMissing.length === 0;
  const detailOk = detailMissing.length === 0 && shouldNotAppear.length === 0;
  const pass = itemOk && detailOk && price > 0;
  results.push({ cat, itemOk, detailOk, missing, price, pass });
}

// ============================================================
// 1. บานเลื่อน — sliding_euro 3.6×2.4 4บาน + มุ้ง + ล็อค
// ============================================================
test(
  "1. บานเลื่อน",
  ["บานเลื่อน", "3.6", "2.4", "4 บาน"],
  ["อลูมิเนียม", "กระจก", "มุ้ง", "ชุดล็อค"],
  () => renderSingle(null, () => {
    addItem({
      g: 1, prod: "sliding_euro", pos: "ประตูหน้าบ้าน",
      w: 3.6, h: 2.4, panels: 4, qty: 1,
      mosquito: true, slidelock: true,
    });
  })
);

// ============================================================
// 2. บานเปิด — casement_euro 1.6×2.2 2บาน
// ============================================================
test(
  "2. บานเปิด",
  ["บานเปิด", "1.6", "2.2"],
  ["อลูมิเนียม", "กระจก"],
  () => renderSingle({ g: 1, prod: "casement_euro", itype: "window", w: 1.6, h: 2.2, panels: 2, qty: 1 })
);

// ============================================================
// 3. บานติดตาย — fixed_glass 1.5×0.5
// ============================================================
test(
  "3. บานติดตาย",
  ["กระจกติดตาย", "1.5", "0.5"],
  ["อลูมิเนียม", "กระจก"],
  () => renderSingle({ g: 1, prod: "fixed_glass", pos: "ช่องแสง", w: 1.5, h: 0.5, qty: 1 })
);

// ============================================================
// 4. บานเฟี้ยม — folding 4×2.4
// ============================================================
test(
  "4. บานเฟี้ยม",
  ["บานเฟี้ยม", "4", "2.4"],
  ["อลูมิเนียม", "กระจก"],
  () => renderSingle({ g: 1, prod: "folding", pos: "ประตูระเบียง", w: 4.0, h: 2.4, panels: 4, qty: 1 })
);

// ============================================================
// 5. บานกระทุ้ง — awning_euro 0.8×1.0
// ============================================================
test(
  "5. บานกระทุ้ง",
  ["บานกระทุ้ง", "0.8", "1"],
  ["อลูมิเนียม", "กระจก"],
  () => renderSingle({ g: 1, prod: "awning_euro", itype: "window", w: 0.8, h: 1.0, qty: 1 })
);

// ============================================================
// 6. หลังคา — roof_vinyl 4×3 (default ปลายปล่อย → F3 ไม่มีรางน้ำ · F6 ระบุชนิด "หลังคาไวนิล")
// ============================================================
test(
  "6. หลังคา",
  ["หลังคา", "4", "3"],
  ["โครง", "หลังคาไวนิล"],
  () => renderSingle({ g: 3, prod: "roof_vinyl", pos: "หลังคาโรงจอดรถ", w: 4.0, h: 3.0, qty: 1 })
);

// ============================================================
// 7. มุ้ง — imp23 1.8×2.1
// ควรมี: ชื่อมุ้ง + สีผ้า (ไฟเบอร์)
// ไม่ควรมี: "กระจก" ใน detail section
// ============================================================
test(
  "7. มุ้ง (imp23)",
  ["มุ้ง", "1.8", "2.1"],
  ["ผ้า"],
  () => renderSingle({ g: 5, prod: "imp23", pos: "มุ้งเฟรมใหญ่", w: 1.8, h: 2.1, qty: 1 }),
  ["กระจก"]   // notInDetail — มุ้งไม่ควรมีกระจกใน detail row
);

// ============================================================
// 8. ม่านซิป — zipscreen 3×2.8
// ควรมี: สีผ้า/ความโปร่ง
// ไม่ควรมี: "กระจก" ใน detail section
// ============================================================
test(
  "8. ม่านซิป",
  ["ม่านซิป", "3", "2.8"],
  ["ผ้า"],
  () => renderSingle({
    g: 7, prod: "zipscreen", w: 3.0, h: 2.8, qty: 1,
    autoColor: false,
    opts: { ".o-zgrp": "retail", ".o-zmodel": "auto", ".o-zfab": "5", ".o-zctrl": "aok220" },
  }),
  ["กระจก"]
);

// ============================================================
// 9. Shower — shower 1.2×2 ชนิด door_fixed สวิง
// ============================================================
test(
  "9. Shower",
  ["กั้นห้องอาบน้ำ", "1.2", "2"],
  ["บานติดตาย", "กระจกเทมเปอร์ใส 10 มม.", "ราวสแตนเลส", "อลูมิเนียม"],
  () => renderSingle({
    g: 1, prod: "shower", w: 1.2, h: 2.0, qty: 1,
    autoColor: true,
    opts: { ".o-shtype": "door_fixed", ".o-shdoortype": "swing" },
  })
);

// ============================================================
// 10. บานเปลือย — frameless_door 0.9×2.1 (สวิง)
// ============================================================
test(
  "10. บานเปลือย (สวิง)",
  ["บานเปลือย", "0.9", "2.1"],
  ["สวิง", "เฟรมอลูมิเนียม"],
  () => renderSingle({
    g: 1, prod: "frameless_door", w: 0.9, h: 2.1, qty: 1,
    autoColor: false,
    opts: { ".o-frametype": "swing", ".o-framecolor": "ดำ" },
  })
);

// 10b. บานเปลือย เลื่อน
test(
  "10b. บานเปลือย (เลื่อน)",
  ["บานเปลือย", "1.6", "2.1"],
  ["เลื่อน", "เฟรมอลูมิเนียม"],
  () => renderSingle({
    g: 1, prod: "frameless_door", w: 1.6, h: 2.1, qty: 1,
    autoColor: false,
    opts: { ".o-frametype": "sliding", ".o-framecolor": "ขาว" },
  })
);

// ============================================================
// 11. ระแนง — rn2 (บังตาผนังระแนง 1x5 รวมโครง) 3×2
// R2-2(G2): ใช้ rn2 (รวมโครง) แทน rn1 (ไม่โครง) — ไม่โครงขายเดี่ยวไม่ได้แล้ว (กฎพี่นัท)
// ============================================================
test(
  "11. ระแนง (rn2 รวมโครง)",
  ["บังตาผนังระแนง", "3", "2"],
  [],
  () => renderSingle({ g: 2, prod: "rn2", pos: "ระแนงบังตา", w: 3.0, h: 2.0, qty: 1 })
);

// ============================================================
// 12. ราวบันได — imp1 (บันไดเฉียง หมุดแปะปูน) ยาว 3 ม.
// ============================================================
test(
  "12. ราวบันได (imp1)",
  ["ราวกันตก", "3"],
  [],
  () => renderSingle({ g: 2, prod: "imp1", pos: "ราวบันได ชั้น 2", w: 3.0, h: null, qty: 1 })
);

// ============================================================
// 13. กั้นห้องกระจก — ชุด 2 ด้าน + หลังคา
// ควรมี: group ด้าน A/B · อลู/กระจก
// ไม่ควรมี: "ค่าทำชุด" (ยกเลิก 2026-06-08)
// ============================================================
test(
  "13. กั้นห้องกระจก (ชุด)",
  ["กั้นห้องกระจก", "ด้าน A", "ด้าน B"],
  ["อลูมิเนียม", "กระจก"],
  () => renderGlasshouse({
    name: "กั้นห้องกระจก ระเบียง",
    sides: [
      { prod: "sliding_euro", w: 3.6, h: 2.4, pos: "ด้าน A" },
      { prod: "fixed_glass",  w: 2.4, h: 2.4, pos: "ด้าน B" },
    ],
    roof: { prod: "roof_vinyl", w: 6.0, h: 3.0 },
  }),
  ["ค่าทำชุด"]   // notInDetail — กั้นห้องไม่ควรมีค่าทำชุดแล้ว (ยกเลิก 2026-06-08)
);

// ============================================================
// พิมพ์ตาราง
// ============================================================
const PAD = { cat: 36, item: 9, det: 11, price: 14, pass: 5 };
const pad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length); };

console.log("\n=== QUOTE FIDELITY TEST — ตรวจใบเสนอราคา gen จริง 13 หมวด ===\n");

const hdr =
  pad("หมวด", PAD.cat) + " | " +
  pad("รายการ?", PAD.item) + " | " +
  pad("รายละเอียด?", PAD.det) + " | " +
  pad("ราคา>0?", PAD.price) + " | " +
  pad("ผล", PAD.pass);
const sep = "-".repeat(hdr.length);
console.log(hdr);
console.log(sep);

let pass = 0, fail = 0;
for (const r of results) {
  const iStr = r.itemOk ? "ครบ" : "ขาด";
  const dStr = r.detailOk ? "ครบ" : "ขาด";
  const pStr = r.price > 0 ? "YES (" + r.price.toLocaleString() + ")" : "NO";
  const psStr = r.pass ? "PASS" : "FAIL";
  if (r.pass) pass++; else fail++;
  console.log(
    pad(r.cat, PAD.cat) + " | " +
    pad(iStr, PAD.item) + " | " +
    pad(dStr, PAD.det) + " | " +
    pad(pStr, PAD.price) + " | " +
    psStr
  );
  for (const m of r.missing) console.log("   " + m);
}
console.log(sep);
console.log("\nสรุป: PASS " + pass + " / " + results.length + "  |  FAIL " + fail);

if (jsErrors.length) {
  console.log("\nJS errors:");
  jsErrors.forEach((e) => console.log("  " + e));
}

process.exit(fail === 0 ? 0 : 1);
