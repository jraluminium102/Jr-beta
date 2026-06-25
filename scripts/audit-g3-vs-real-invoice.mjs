// audit-g3-vs-real-invoice.mjs — render G3 เคสจริงจาก engine แล้วส่งคืน spec text
// READ-ONLY index.html · ใช้ jsdom เท่านั้น
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync("public/calculator/index.html", "utf8");
const vc = new VirtualConsole();
const errs = [];
vc.on("jsdomError", (e) => errs.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/" });
await new Promise((r) => { dom.window.addEventListener("load", r); setTimeout(r, 2000); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const setF = (ch, s, v) => { const el = ch.querySelector(s); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } };
const chk = (ch, s, b) => { const el = ch.querySelector(s); if (el) { el.checked = b; fire(el, "change"); } };
const chkOff = (s) => { const el = doc.getElementById(s); if (el && el.checked) { el.checked = false; fire(el, "change"); } };

// ปิด svc-protect
chkOff("svc-protect");

function addItem(grp, prod) {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = [...doc.querySelectorAll("#items .ch")].pop();
  setF(ch, ".i-group", grp);
  const ps = ch.querySelector(".i-prod");
  if (ps && !ps.querySelector(`option[value="${prod}"]`)) {
    try { ps.innerHTML = w.prodOptionsG6 ? w.prodOptionsG6(String(grp)) : ps.innerHTML; } catch(e) {}
  }
  if (ps) { ps.value = prod; fire(ps, "change"); }
  return ch;
}

function setColor(ch, colorIdx) {
  const cs = ch.querySelector(".i-color");
  if (cs) { cs.value = String(colorIdx); fire(cs, "change"); }
}

function renderQuote() {
  try { w.genQuote(); } catch(e) {}
  const el = doc.getElementById("quoteContent") || doc.getElementById("quote-content");
  return el ? el.innerText || el.textContent : "(ไม่พบ quoteContent)";
}

function readItemSpec(ch) {
  try {
    const r = w.readItem(ch);
    return r;
  } catch(e) { return null; }
}

const results = [];

// ========== เคส 1: หลังคาโพลีตัน แปเดี่ยว ปล่อยปลาย (ใบนก รายการ2,3,4,6,8) ==========
{
  const ch = addItem(3, "roof_polyton");
  setF(ch, ".i-w", 5); setF(ch, ".i-h", 2);
  // แปเดี่ยว
  const batBtn = ch.querySelector(".o-roofbatten");
  if (batBtn) { batBtn.value = "แปเดี่ยว"; fire(batBtn, "change"); }
  // ลองกด chip แปเดี่ยว
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("แปเดี่ยว")) b.click(); });
  // ปล่อยปลาย (default) — ไม่ต้องเปลี่ยน
  const roofend = ch.querySelector(".o-roofend");
  if (roofend) { roofend.value = "ปล่อย"; fire(roofend, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("ปล่อย")) b.click(); });
  // สีขาว default
  fire(ch, "change");
  const r = readItemSpec(ch);
  const det = r && r.r ? (r.r.det || r.r.msgs || "") : "(อ่านไม่ได้)";
  const work = r && r.r ? (r.r.work || "") : "";
  const sell = r && r.r ? r.r.sell : 0;
  results.push({
    case: "หลังคาโพลีตัน แปเดี่ยว ปล่อยปลาย (คล้ายใบนก ข้างบ้าน)",
    det: String(det), work: String(work), sell: Math.round(sell)
  });
}

// ========== เคส 2: หลังคาโพลีตัน แปเดี่ยว มีรางน้ำ + ตะแกรง + ท่อ PVC สีดำ ==========
{
  const ch = addItem(3, "roof_polyton");
  setF(ch, ".i-w", 6); setF(ch, ".i-h", 3.5);
  // แปเดี่ยว
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("แปเดี่ยว")) b.click(); });
  // รางน้ำ
  const roofend = ch.querySelector(".o-roofend");
  if (roofend) { roofend.value = "รางน้ำ"; fire(roofend, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "รางน้ำ") b.click(); });
  // ท่อ (default)
  const gutsys = ch.querySelector(".o-guttersys");
  if (gutsys) { gutsys.value = "ท่อ"; fire(gutsys, "change"); }
  // สีท่อดำ
  const pipecol = ch.querySelector(".o-gutter-pipecolor");
  if (pipecol) { pipecol.value = "ดำ"; fire(pipecol, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "ดำ") b.click(); });
  // ตะแกรง (default checked)
  const leaf = ch.querySelector(".o-rfleaf");
  if (leaf && !leaf.checked) { leaf.checked = true; fire(leaf, "change"); }
  fire(ch, "change");
  const r = readItemSpec(ch);
  const det = r && r.r ? (r.r.det || "") : "(อ่านไม่ได้)";
  const work = r && r.r ? (r.r.work || "") : "";
  const sell = r && r.r ? r.r.sell : 0;
  results.push({
    case: "หลังคาโพลีตัน แปเดี่ยว รางน้ำอลู + ตะแกรง + ท่อ PVC สีดำ (คล้ายใบนก รายการ3)",
    det: String(det), work: String(work), sell: Math.round(sell)
  });
}

// ========== เคส 3: หลังคาโพลีตัน แปเดี่ยว + รางน้ำ + โซ่ทิวลิป 2 เส้น ==========
{
  const ch = addItem(3, "roof_polyton");
  setF(ch, ".i-w", 6); setF(ch, ".i-h", 4.5);
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("แปเดี่ยว")) b.click(); });
  // รางน้ำ
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "รางน้ำ") b.click(); });
  // โซ่
  const gutsys = ch.querySelector(".o-guttersys");
  if (gutsys) { gutsys.value = "โซ่"; fire(gutsys, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "โซ่") b.click(); });
  // ลายทิวลิป
  const chainpat = ch.querySelector(".o-gutter-chainpat");
  if (chainpat) { chainpat.value = "ทิวลิป"; fire(chainpat, "change"); }
  // สีน้ำตาล
  const chaincol = ch.querySelector(".o-gutter-chaincolor");
  if (chaincol) { chaincol.value = "น้ำตาล"; fire(chaincol, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "น้ำตาล") b.click(); });
  // จำนวนโซ่ 2 เส้น
  const rfchain = ch.querySelector(".o-rfchain");
  if (rfchain) { rfchain.value = "2"; fire(rfchain, "input"); fire(rfchain, "change"); }
  fire(ch, "change");
  const r = readItemSpec(ch);
  results.push({
    case: "หลังคาโพลีตัน + รางน้ำ + โซ่ทิวลิป สีน้ำตาล 2 เส้น (คล้ายใบนก รายการ3)",
    det: String(r && r.r ? (r.r.det||"") : "(อ่านไม่ได้)"),
    work: String(r && r.r ? (r.r.work||"") : ""),
    sell: Math.round(r && r.r ? r.r.sell : 0)
  });
}

// ========== เคส 4: หลังคาไวนิล + รางน้ำ + ตะแกรง + ท่อ PVC สีดำ + ซ่อนสโลป คอมโพสิต (ใบนก รายการ7) ==========
{
  const ch = addItem(3, "roof_vinyl");
  setF(ch, ".i-w", 5); setF(ch, ".i-h", 4.29);
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("แปเดี่ยว")) b.click(); });
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "รางน้ำ") b.click(); });
  // โซ่ทิวลิป
  const gutsys = ch.querySelector(".o-guttersys");
  if (gutsys) { gutsys.value = "โซ่"; fire(gutsys, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "โซ่") b.click(); });
  const chainpat = ch.querySelector(".o-gutter-chainpat");
  if (chainpat) { chainpat.value = "ทิวลิป"; fire(chainpat, "change"); }
  const chaincol = ch.querySelector(".o-gutter-chaincolor");
  if (chaincol) { chaincol.value = "น้ำตาล"; fire(chaincol, "change"); }
  // โซ่ 1 เส้น
  const rfchain = ch.querySelector(".o-rfchain");
  if (rfchain) { rfchain.value = "1"; fire(rfchain, "input"); fire(rfchain, "change"); }
  // ซ่อนสโลป คอมโพสิต
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("คอมโพสิต") || b.textContent.includes("ซ่อนสโลป")) b.click(); });
  const rfhs = ch.querySelector(".o-rfhs");
  if (rfhs) { rfhs.value = "comp"; fire(rfhs, "change"); }
  // สีดำ (คอมโพสิต)
  const rfhscolor = ch.querySelector(".o-rfhscolor");
  if (rfhscolor) { rfhscolor.value = "ดำ"; fire(rfhscolor, "change"); }
  fire(ch, "change");
  const r = readItemSpec(ch);
  results.push({
    case: "หลังคาไวนิล + รางน้ำ + โซ่ทิวลิป 1 เส้น + ซ่อนสโลปคอมโพสิต สีดำ (ใบนก รายการ7)",
    det: String(r && r.r ? (r.r.det||"") : "(อ่านไม่ได้)"),
    work: String(r && r.r ? (r.r.work||"") : ""),
    sell: Math.round(r && r.r ? r.r.sell : 0)
  });
}

// ========== เคส 5: ชินโคไลท์ imp15 สี HC-N828 Modern Grey (ใบเฟริล OPTION) ==========
{
  const ch = addItem(3, "imp15");
  setF(ch, ".i-w", 4); setF(ch, ".i-h", 3);
  // สี HC-N828 Modern Grey
  const rfcol = ch.querySelector(".o-rfcolor");
  if (rfcol) { rfcol.value = "HC-N828 Modern Grey"; fire(rfcol, "change"); }
  ch.querySelectorAll("button").forEach(b => {
    if (b.textContent.includes("HC-N828") || b.textContent.includes("Modern Grey")) b.click();
  });
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "ปล่อย") b.click(); });
  fire(ch, "change");
  const r = readItemSpec(ch);
  results.push({
    case: "ชินโคไลท์ imp15 HeatCut สี HC-N828 Modern Grey ปล่อยปลาย (ใบเฟริล OPTION)",
    det: String(r && r.r ? (r.r.det||"") : "(อ่านไม่ได้)"),
    work: String(r && r.r ? (r.r.work||"") : ""),
    sell: Math.round(r && r.r ? r.r.sell : 0)
  });
}

// ========== เคส 6: หลังคาดีไลท์ DG7 สีเทาโมเดิร์น ==========
{
  const ch = addItem(3, "roof_delight");
  setF(ch, ".i-w", 4); setF(ch, ".i-h", 3);
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "ปล่อย") b.click(); });
  // สี DG7
  const rfcol = ch.querySelector(".o-rfcolor");
  if (rfcol) { rfcol.value = "DG7 สีเทาโมเดิร์น"; fire(rfcol, "change"); }
  ch.querySelectorAll("button").forEach(b => {
    if (b.textContent.includes("DG7") || b.textContent.includes("เทาโมเดิร์น")) b.click();
  });
  fire(ch, "change");
  const r = readItemSpec(ch);
  results.push({
    case: "หลังคาดีไลท์ DG7 สีเทาโมเดิร์น",
    det: String(r && r.r ? (r.r.det||"") : "(อ่านไม่ได้)"),
    work: String(r && r.r ? (r.r.work||"") : ""),
    sell: Math.round(r && r.r ? r.r.sell : 0)
  });
}

// ========== เคส 7: ฝ้าฉาบเรียบ พร้อมทาสีขาว (ใบสุจินต์ ใต้หลังคาไวนิล) ==========
{
  const ch = addItem(3, "ceiling_smooth");
  setF(ch, ".i-w", 4); setF(ch, ".i-h", 3.26);
  const ceilfinish = ch.querySelector(".o-ceilfinish");
  if (ceilfinish) { ceilfinish.value = "ทาสีขาว"; fire(ceilfinish, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("ทาสีขาว")) b.click(); });
  // ฝ้าเฉียง
  const ceilslope = ch.querySelector(".o-ceilslope");
  if (ceilslope) { ceilslope.checked = true; fire(ceilslope, "change"); }
  fire(ch, "change");
  const r = readItemSpec(ch);
  results.push({
    case: "ฝ้าฉาบเรียบ พร้อมทาสีขาว + ฝ้าเฉียงตามหลังคา (ใบสุจินต์ รายการ12)",
    det: String(r && r.r ? (r.r.det||"") : "(อ่านไม่ได้)"),
    work: String(r && r.r ? (r.r.work||"") : ""),
    sell: Math.round(r && r.r ? r.r.sell : 0)
  });
}

// ========== เคส 8: ผนังเบาภายนอก (สมาร์ทบอร์ด 12มม.) โครงเหล็กชุบซิงค์ + ฉนวน 3" (ใบสุจินต์) ==========
{
  const ch = addItem(3, "wall_ext");
  setF(ch, ".i-w", 3); setF(ch, ".i-h", 2.4);
  // เลือกโครงเหล็กชุบ
  const wframe = ch.querySelector(".o-wallframe");
  if (wframe) { wframe.value = "เหล็กชุบ"; fire(wframe, "change"); }
  ch.querySelectorAll("button").forEach(b => {
    if (b.textContent.includes("เหล็กชุบ")) b.click();
  });
  // สมาร์ทบอร์ด 12 มม.
  const smt = ch.querySelector(".o-smartthick");
  if (smt) { smt.value = "12"; fire(smt, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("12 มม")) b.click(); });
  // ทาสีรองพื้นสีขาว — ใส่ราคา 0 (รวมในราคา)
  const wp = ch.querySelector(".o-wallpaint");
  if (wp) { wp.value = "ทาสีรองพื้นสีขาว"; fire(wp, "change"); }
  // ฉนวน 3"
  const insul = ch.querySelector(".o-insul");
  if (insul) { insul.checked = true; fire(insul, "change"); }
  fire(ch, "change");
  const r = readItemSpec(ch);
  results.push({
    case: "ผนังเบาภายนอก สมาร์ทบอร์ด 12มม. โครงเหล็กชุบซิงค์ (ไร้สนิม) + ฉนวน 3\" (ใบสุจินต์)",
    det: String(r && r.r ? (r.r.det||"") : "(อ่านไม่ได้)"),
    work: String(r && r.r ? (r.r.work||"") : ""),
    sell: Math.round(r && r.r ? r.r.sell : 0)
  });
}

// ========== เคส 9: หลังคาไวนิล โครงเหล็กชุบซิงค์ ปล่อยปลาย (ใบสุจินต์ รายการ12) ==========
{
  const ch = addItem(3, "roof_vinyl");
  setF(ch, ".i-w", 5); setF(ch, ".i-h", 3);
  // เหล็กชุบ
  const rfframe = ch.querySelector(".o-roofframe");
  if (rfframe) { rfframe.value = "โครงเหล็กชุบซิงค์"; fire(rfframe, "change"); }
  ch.querySelectorAll("button").forEach(b => {
    if (b.textContent.includes("เหล็กชุบ")) b.click();
  });
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "ปล่อย") b.click(); });
  fire(ch, "change");
  const r = readItemSpec(ch);
  results.push({
    case: "หลังคาไวนิล โครงเหล็กชุบซิงค์ (ไร้สนิม) ปล่อยปลาย (ใบสุจินต์ รายการ12)",
    det: String(r && r.r ? (r.r.det||"") : "(อ่านไม่ได้)"),
    work: String(r && r.r ? (r.r.work||"") : ""),
    sell: Math.round(r && r.r ? r.r.sell : 0)
  });
}

// ========== เคส 10: หลังคาโพลีตัน แปคู่ + รางน้ำ + เหล็กดึง + เพลทเหล็กล่าง + ท่อ PVC สีดำ (ใบเฟริล) ==========
{
  const ch = addItem(3, "roof_polyton");
  setF(ch, ".i-w", 4.5); setF(ch, ".i-h", 3);
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.includes("แปคู่")) b.click(); });
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "รางน้ำ") b.click(); });
  // ท่อ สีดำ
  const pipecol = ch.querySelector(".o-gutter-pipecolor");
  if (pipecol) { pipecol.value = "ดำ"; fire(pipecol, "change"); }
  ch.querySelectorAll("button").forEach(b => { if (b.textContent.trim() === "ดำ") b.click(); });
  // เสริมเพลท + เหล็กดึง
  const rfplate = ch.querySelector(".o-rfplate");
  if (rfplate) { rfplate.checked = true; fire(rfplate, "change"); }
  const rfpull = ch.querySelector(".o-rfpull");
  if (rfpull) { rfpull.checked = true; fire(rfpull, "change"); }
  fire(ch, "change");
  const r = readItemSpec(ch);
  results.push({
    case: "หลังคาโพลีตัน แปคู่ + รางน้ำ + เพลทเหล็กล่าง + เหล็กดึงด้านบน + ท่อ PVC สีดำ (ใบเฟริล รายการ2)",
    det: String(r && r.r ? (r.r.det||"") : "(อ่านไม่ได้)"),
    work: String(r && r.r ? (r.r.work||"") : ""),
    sell: Math.round(r && r.r ? r.r.sell : 0)
  });
}

// Output JSON
const realErrs = errs.filter(e => !/Not implemented:|scrollTo/.test(e));
console.log(JSON.stringify({ results, errs: realErrs }, null, 2));
