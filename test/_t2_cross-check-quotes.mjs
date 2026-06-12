// _t2_cross-check-quotes.mjs
// QA Tester #2 — cross-check quote-01..05 ยอดจริง vs ใบอ้างอิง
// รัน: node test/_t2_cross-check-quotes.mjs
//
// หมายเหตุ (มติ 2026-06-09 · UX checklist ข้อ20 "ทาง A"): ใบที่มี "กั้นห้องกระจก" (เช่น quote-05)
//   ใบอ้างอิงสร้างด้วยราคาเหมา (lumpsum) แบบเก่า — ตั้งใจคงไว้ (ไม่ migrate เป็นระบบบาน เพราะไม่มีขนาดบานเดิม)
//   → row กั้นห้องกระจกจะขึ้น FAIL เป็นเรื่องปกติ ไม่ใช่บั๊ก engine (engine คำนวณถูก 100% — ดู TEST-REPORT)
//   ไฟล์นี้เป็น dev test (prefix _ = ไม่อยู่ใน gate มาตรฐาน 8 ไฟล์)

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

// ปิด svc-protect ก่อน (เหมือน gen-quotes.mjs)
{ const sp = doc.getElementById("svc-protect"); if (sp && sp.checked) { sp.checked = false; fire(sp, "change"); } }

function setF(ch, sel, v) {
  const el = ch.querySelector(sel);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
}
function setF2(id, v) {
  const el = doc.getElementById(id);
  if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); }
}
function clearItems() { doc.getElementById("items").innerHTML = ""; }

function pickSecond(ch, sel) {
  const el = ch.querySelector(sel);
  if (el && el.options && el.options.length > 1) { el.value = el.options[1].value; fire(el, "change"); }
}

function addItem(it) {
  w.addItem(doc.getElementById("items"));
  const chs = doc.querySelectorAll("#items .ch");
  const ch = chs[chs.length - 1];
  setF(ch, ".i-group", it.g);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + it.prod + '"]')) ps.innerHTML = w.prodOptionsG6(String(it.g));
  ps.value = it.prod; fire(ps, "change");
  if (it.w != null) setF(ch, ".i-w", it.w);
  if (it.h != null) setF(ch, ".i-h", it.h);
  if (it.panels != null) setF(ch, ".i-panels", it.panels);
  if (it.qty != null) setF(ch, ".i-qty", it.qty);
  if (it.color) { const c = ch.querySelector(".i-color"); if (c) { c.value = String(it.color); fire(c, "change"); } }
  else if (it.glassProduct) pickSecond(ch, ".i-color");
  if (it.glass) { const g = ch.querySelector(".i-glass"); if (g) { g.value = String(it.glass); fire(g, "change"); } }
  if (it.pos) setF(ch, ".i-position", it.pos);
  if (it.note) setF(ch, ".i-note", it.note);
  for (const [s, v] of Object.entries(it.opts || {})) setF(ch, s, v);
  return ch;
}

// อ่านผลจาก quoteContent table
function readQuoteResult() {
  w.calcQuote();
  w.genQuote();
  const qc = doc.getElementById("quoteContent");

  // ดึงแถวรายการ
  const rows = [...qc.querySelectorAll("table.qt tbody tr")];
  const lineItems = rows.map((row) => {
    const tds = [...row.querySelectorAll("td")];
    const no = tds[0] ? tds[0].textContent.trim() : "";
    const detail = tds[1] ? tds[1].textContent.replace(/\s+/g, " ").trim() : "";
    const qty = tds[2] ? tds[2].textContent.replace(/\s+/g, " ").trim() : "";
    const unitPrice = tds[3] ? tds[3].textContent.replace(/\s+/g, " ").trim() : "";
    const total = tds[4] ? tds[4].textContent.replace(/\s+/g, " ").trim() : "";
    return { no, detail, qty, unitPrice, total };
  }).filter(r => r.no.length > 0);

  // ดึงยอดสรุป
  const allTd = [...qc.querySelectorAll("td, span, div, p")];
  let subtotal = 0, vat = 0, grandTotal = 0, discount = 0;

  allTd.forEach(el => {
    const t = el.textContent.replace(/\s+/g, " ").trim();
    // หา pattern "รวมเป็นเงิน X บาท ภาษีมูลค่าเพิ่ม 7% Y บาท จำนวนเงินรวมทั้งสิ้น Z บาท"
    const m = t.match(/รวมเป็นเงิน([\d,]+\.\d+)\s*บาท.*?ภาษีมูลค่าเพิ่ม.*?([\d,]+\.\d+)\s*บาท.*?จำนวนเงินรวมทั้งสิ้น([\d,]+\.\d+)\s*บาท/);
    if (m) {
      subtotal = parseFloat(m[1].replace(/,/g, ""));
      vat = parseFloat(m[2].replace(/,/g, ""));
      grandTotal = parseFloat(m[3].replace(/,/g, ""));
    }
    const ds = t.match(/ส่วนลด.*?([\d,]+\.\d+)\s*บาท/);
    if (ds) discount = parseFloat(ds[1].replace(/,/g, ""));
  });

  return { lineItems, subtotal, vat, grandTotal, discount };
}

// ============================================================
// GH helper (เหมือน gen-quotes.mjs)
// ============================================================
const GH = (room, price) => ({
  ".o-ghroom": room, ".o-ghcolor": "sahara", ".o-ghglass": "กระจกเขียว/ใส หนา 6 มม.",
  ".o-ghgutter": "รางน้ำอลูมิเนียม + ตะแกรงพลาสติกกันใบไม้", ".o-ghmosq": "มุ้งเฟรมเล็ก (ด้าน B, E)",
  ".o-ghlock": "ชุดล็อคพร้อมกุญแจ (ประตูด้าน C)",
  ".o-ghside-A": "ติดตายเต็มผนัง", ".o-ghside-B": "ประตูบานเปิดคู่ + ติดตายข้าง", ".o-ghside-C": "บานเลื่อน 2 ราง",
  ".o-ghside-D": "ติดตาย + ช่องแสงบน", ".o-ghside-E": "ประตูบานเปิดเดี่ยว", ".o-ghside-F": "ติดตายเต็มผนัง",
  ".o-ghroof": "หลังคาไวนิล (แปคู่) โครงอลูมิเนียม + รางน้ำอลู + ตะแกรงกันใบไม้",
  ".o-ghprice": String(price),
  ".o-ghnote-inc": "รวมงานรื้อหลังคาเดิม / ทำสีปิด / ตัดท่อแอร์ 1 จุด",
  ".o-ghnote-exc": "ไม่รวม รื้อพื้น / ลงเข็ม / ทำคาน / ปูกระเบื้อง / เดินไฟ",
});
const ZIP = (grp, model, fab, ctrl) => ({ ".o-zgrp": grp, ".o-zmodel": model, ".o-zfab": fab, ".o-zctrl": ctrl });

// ============================================================
// ยอดอ้างอิง (จากใบ HTML)
// ============================================================
const EXPECTED = [
  { // quote-01
    lineItems: [
      { no: "1", unitPrice: 47000, total: 47000 },
      // row 2 = casement_euro 1.6×2.2 panels=2 → re-baseline 2026-06-13 convention B (กว้างรวม÷บาน): หน้าต่าง 1.6ม. 2บาน = 0.8/บาน → 1.76 ตร.ม./บาน → 17,400/บาน × 2 = 34,800 (เดิม 49,400 ตีความผิดว่า 1.6/บาน) · qty 2 = 69,600
      { no: "2", unitPrice: 34800, total: 69600 },
      { no: "3", unitPrice: 30000, total: 30000 },
      { no: "4", unitPrice: 15000, total: 60000 },
      { no: "5", unitPrice: 90000, total: 90000 },
      { no: "6", unitPrice: 54000, total: 54000 },
    ],
    // convention B: row2 = 69,600 (เดิม 98,800 ลด 29,200) → subtotal 350,600 · VAT 7% = 24,542 · grand 375,142
    subtotal: 350600, vat: 24542, grandTotal: 375142,
  },
  { // quote-02
    lineItems: [
      { no: "1", unitPrice: 36000, total: 108000 },
      { no: "2", unitPrice: 36000, total: 216000 },
      { no: "3", unitPrice: 24000, total: 192000 },
      { no: "4", unitPrice: 132000, total: 132000 },
      { no: "5", unitPrice: 117000, total: 117000 },
    ],
    subtotal: 765000, vat: 53550, grandTotal: 818550,
  },
  { // quote-03
    lineItems: [
      { no: "1", unitPrice: 32000, total: 96000 },
      { no: "2", unitPrice: 23000, total: 46000 },
      { no: "3", unitPrice: 21000, total: 42000 },
      { no: "4", unitPrice: 10000, total: 40000 },
      { no: "5", unitPrice: 14000, total: 14000 },
    ],
    subtotal: 238000, vat: 16660, grandTotal: 254660,
  },
  { // quote-04
    lineItems: [
      { no: "1", unitPrice: 23000, total: 23000 },
      { no: "2", unitPrice: 19400, total: 19400 },
      { no: "3", unitPrice: 32000, total: 32000 },
      { no: "4", unitPrice: 21000, total: 21000 },
      { no: "5", unitPrice: 18000, total: 18000 },
    ],
    subtotal: 113400, vat: 7938, grandTotal: 121338,
  },
  { // quote-05
    lineItems: [
      { no: "1", unitPrice: 506000, total: 506000 },
      { no: "2", unitPrice: 33500, total: 33500 },
      { no: "3", unitPrice: 32000, total: 32000 },
      { no: "4", unitPrice: 21000, total: 21000 },
      { no: "5", unitPrice: 39000, total: 39000 },
    ],
    subtotal: 631500, vat: 44205, grandTotal: 675705,
  },
];

// ============================================================
// ฟังก์ชัน render quote แต่ละใบ
// ============================================================
function setupQuote(qNo) {
  const JOBS = [
    { cust:"คุณทดสอบ มานะ ใจดี (บ้านเดี่ยว 2 ชั้น)", date:"04-06-69", items:[
      {g:1,prod:"sliding_euro",pos:"โถงหน้าบ้าน",w:3.6,h:2.4,panels:4,qty:1,glassProduct:1,glass:1,note:"OPTION : หากลูกค้าต้องการเปลี่ยนเป็น กระจกเทมเปอร์ใส 6 มม. ราคาเพิ่ม 6,000 บาท\nหมายเหตุ : ราคารวมงานรื้อบานเดิม (ไม่รวมวัสดุ)"},
      {g:1,prod:"casement_euro",pos:"ห้องนอนใหญ่",w:1.6,h:2.2,panels:2,qty:2,glassProduct:1,glass:1},
      {g:1,prod:"fixed_glass",pos:"โถงบันได",w:2.0,h:3.0,qty:1,glassProduct:1,glass:1},
      {g:1,prod:"awning_euro",pos:"ห้องน้ำ",w:0.8,h:1.0,qty:4,glassProduct:1},
      {g:1,prod:"folding",pos:"ออกสวนหลัง",w:3.6,h:2.4,panels:6,qty:1,glassProduct:1,glass:1},
      {g:2,prod:"imp3",pos:"บันไดเฉียง",w:6.0,qty:1},
    ]},
    { cust:"บจก. ทดสอบ ก่อสร้างไทย (สำนักงาน 3 ชั้น)", date:"04-06-69", items:[
      {g:1,prod:"sliding_sms",pos:"หน้าออฟฟิศ",w:3.0,h:2.4,panels:4,qty:3,glassProduct:1,glass:1},
      {g:1,prod:"fixed_glass",pos:"Façade ชั้น 1",w:2.4,h:3.0,qty:6,glassProduct:1,glass:1},
      {g:1,prod:"casement_dseries",pos:"ห้องทำงานชั้นบน",w:1.2,h:1.5,panels:1,qty:8,glassProduct:1,glass:1},
      {g:3,prod:"roof_vinyl",pos:"ทางเดินเชื่อมอาคาร",w:4.0,h:6.0,qty:1},
      {g:2,prod:"imp1",pos:"ระเบียงทุกชั้น",w:12.0,qty:1},
    ]},
    { cust:"คุณทดสอบ สุดา รักงาน (ร้านกาแฟ)", date:"04-06-69", items:[
      {g:1,prod:"frameless_fixed",pos:"หน้าร้าน",w:2.0,h:2.8,qty:3,glassProduct:1,glass:1},
      {g:1,prod:"frameless_door",pos:"ทางเข้า",w:0.9,h:2.4,qty:2,glassProduct:1,glass:1},
      {g:1,prod:"fixed_glass",pos:"ด้านข้าง",w:1.5,h:2.8,qty:2,glassProduct:1,glass:1},
      {g:1,prod:"awning_aluinch",pos:"ระบายอากาศ",w:0.6,h:0.8,qty:4,glassProduct:1},
      {g:5,prod:"imp23",pos:"ประตูหลังร้าน",w:1.8,h:2.1,qty:1},
    ]},
    { cust:"คุณทดสอบ วิชัย มั่งมี (คอนโด-ระเบียง)", date:"04-06-69", items:[
      {g:7,prod:"zipscreen",pos:"ระเบียงหน้า",w:3.0,h:2.8,qty:1,opts:ZIP("retail","auto","5","aok220")},
      {g:7,prod:"zipscreen",pos:"ระเบียงข้าง",w:2.4,h:2.6,qty:1,opts:ZIP("retail","Z120","10","dooya")},
      {g:1,prod:"sliding_euro",pos:"ออกระเบียง",w:2.4,h:2.4,panels:2,qty:1,glassProduct:1,glass:1},
      {g:5,prod:"imp23",pos:"ประตูระเบียง",w:2.4,h:2.4,qty:1},
      {g:1,prod:"fixed_glass",pos:"ราวกันตกระเบียง",w:3.0,h:1.1,qty:1,glassProduct:1,glass:1},
    ]},
    { cust:"คุณทดสอบ ประไพ สวยงาม (ต่อเติมกั้นห้องกระจก)", date:"04-06-69", items:[
      {g:6,prod:"glasshouse",pos:"ห้องอเนกประสงค์",opts:GH("ห้องอเนกประสงค์+ซักล้าง",506000)},
      {g:7,prod:"zipscreen",pos:"ด้านแดดบ่าย",w:4.0,h:3.0,qty:1,opts:ZIP("retail","Z120","5","aok220")},
      {g:1,prod:"sliding_euro",pos:"เข้า-ออกห้องกระจก",w:2.4,h:2.4,panels:2,qty:1,glassProduct:1,glass:1},
      {g:5,prod:"imp23",pos:"ประตูห้องกระจก",w:2.4,h:2.4,qty:1},
      {g:2,prod:"imp4",pos:"บันไดตรง",w:4.0,qty:1},
    ]},
  ];

  const job = JOBS[qNo - 1];
  clearItems();
  setF2("custName", job.cust);
  setF2("qdate", job.date);
  setF2("sellerName", "Sales Admin (ทดสอบ)");
  setF2("custContact", job.cust + " (Line)");
  setF2("custPhone", "08X-XXX-XXXX");
  setF2("custAddress", "เลขที่ — หมู่ — ต.— อ.— จ.— 00000 (ที่อยู่ทดสอบระบบ)");
  setF2("discFlat", 0);
  setF2("discPct", 0);
  job.items.forEach(addItem);
}

// ============================================================
// รัน cross-check
// ============================================================
const fmt = (n) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parsePrice = (s) => {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^\d.]/g, "")) || 0;
};

let totalTests = 0, totalPass = 0, totalFail = 0;
const quoteResults = [];

for (let qNo = 1; qNo <= 5; qNo++) {
  setupQuote(qNo);
  const result = readQuoteResult();
  const expected = EXPECTED[qNo - 1];

  const rows = [];
  let qPass = true;

  // เทียบรายการ
  for (let i = 0; i < expected.lineItems.length; i++) {
    const exp = expected.lineItems[i];
    const got = result.lineItems[i];
    const gotUnitPrice = got ? parsePrice(got.unitPrice) : 0;
    const gotTotal = got ? parsePrice(got.total) : 0;

    const unitMatch = Math.abs(gotUnitPrice - exp.unitPrice) < 0.01;
    const totalMatch = Math.abs(gotTotal - exp.total) < 0.01;
    const rowPass = unitMatch && totalMatch;
    if (!rowPass) qPass = false;

    rows.push({
      label: "รายการ " + (i + 1),
      expUnitPrice: exp.unitPrice,
      gotUnitPrice,
      expTotal: exp.total,
      gotTotal,
      unitMatch,
      totalMatch,
      pass: rowPass,
    });
    totalTests++;
    if (rowPass) totalPass++; else totalFail++;
  }

  // เทียบยอดรวม/VAT/ทั้งสิ้น
  const subMatch = Math.abs(result.subtotal - expected.subtotal) < 0.01;
  const vatMatch = Math.abs(result.vat - expected.vat) < 0.01;
  const gtMatch = Math.abs(result.grandTotal - expected.grandTotal) < 0.01;
  if (!subMatch || !vatMatch || !gtMatch) qPass = false;

  for (const [label, exp, got, match] of [
    ["ยอดรวม (subtotal)", expected.subtotal, result.subtotal, subMatch],
    ["VAT 7%", expected.vat, result.vat, vatMatch],
    ["รวมทั้งสิ้น", expected.grandTotal, result.grandTotal, gtMatch],
  ]) {
    rows.push({ label, expTotal: exp, gotTotal: got, pass: match, isSummary: true });
    totalTests++;
    if (match) totalPass++; else totalFail++;
  }

  quoteResults.push({ qNo, qPass, rows, result, expected });
}

// ============================================================
// พิมพ์ผล
// ============================================================
console.log("\n=== QA TESTER #2 — CROSS-CHECK quote-01..05 (ยอดจริง vs ใบอ้างอิง) ===\n");

for (const { qNo, qPass, rows, result, expected } of quoteResults) {
  console.log("─".repeat(90));
  console.log(`QUOTE-0${qNo}  ${qPass ? "PASS" : "FAIL"}`);
  console.log("─".repeat(90));
  const colW = [14, 16, 16, 16, 16, 8];
  const hdr = [
    "รายการ".padEnd(colW[0]),
    "คาดหวัง(ราคา/ชุด)".padEnd(colW[1]),
    "ได้จริง(ราคา/ชุด)".padEnd(colW[2]),
    "คาดหวัง(ยอดรวม)".padEnd(colW[3]),
    "ได้จริง(ยอดรวม)".padEnd(colW[4]),
    "ผล".padEnd(colW[5]),
  ].join(" | ");
  console.log(hdr);
  console.log("-".repeat(hdr.length));

  for (const r of rows) {
    if (r.isSummary) {
      const diff = r.gotTotal - r.expTotal;
      const diffStr = diff !== 0 ? ` (diff ${diff > 0 ? "+" : ""}${fmt(diff)})` : "";
      console.log(
        r.label.padEnd(colW[0]) + " | " +
        "".padEnd(colW[1]) + " | " +
        "".padEnd(colW[2]) + " | " +
        fmt(r.expTotal).padEnd(colW[3]) + " | " +
        (fmt(r.gotTotal) + diffStr).padEnd(colW[4]) + " | " +
        (r.pass ? "PASS" : "FAIL")
      );
    } else {
      const udiff = r.gotUnitPrice - r.expUnitPrice;
      const tdiff = r.gotTotal - r.expTotal;
      const uStr = fmt(r.gotUnitPrice) + (udiff !== 0 ? ` (${udiff > 0 ? "+" : ""}${fmt(udiff)})` : "");
      const tStr = fmt(r.gotTotal) + (tdiff !== 0 ? ` (${tdiff > 0 ? "+" : ""}${fmt(tdiff)})` : "");
      console.log(
        r.label.padEnd(colW[0]) + " | " +
        fmt(r.expUnitPrice).padEnd(colW[1]) + " | " +
        uStr.padEnd(colW[2]) + " | " +
        fmt(r.expTotal).padEnd(colW[3]) + " | " +
        tStr.padEnd(colW[4]) + " | " +
        (r.pass ? "PASS" : "FAIL")
      );
    }
  }
  console.log("");
}

console.log("=".repeat(90));
console.log(`สรุปรวม: ทดสอบ ${totalTests} case | PASS ${totalPass} | FAIL ${totalFail}`);
console.log(`ผลต่อใบ: ${quoteResults.map(r => "Q0" + r.qNo + "=" + (r.qPass ? "PASS" : "FAIL")).join("  ")}`);
console.log("=".repeat(90));

if (jsErrors.length) {
  console.log("\nJS Errors:");
  jsErrors.forEach((e) => console.log("  " + e));
}

process.exit(totalFail === 0 ? 0 : 1);
