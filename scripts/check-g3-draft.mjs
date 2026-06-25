// check-g3-draft.mjs — ตรวจ G3 หลังคา เทียบดราฟ (READ-ONLY · ไม่แก้ index.html)
// ดราฟ: DRAFT-G3-ux-newstyle-2026-06-22.html + DRAFT-G3-สีโครง-L1L2L3-ติ๊กโผล่-2026-06-23.html
// node scripts/check-g3-draft.mjs

import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const vc = new VirtualConsole();
const jsErr = [];
vc.on("jsdomError", e => { if (!/scrollTo|Not implemented/i.test(e.message)) jsErr.push(e.message); });
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "http://localhost/calculator/index.html"
});

await new Promise(r => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 3000);
});

const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

// ── render G3 หลังคา สินค้าตัวหนึ่ง (roof_polyton) ──
function renderG3(prodId) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch");
  if (!ch) return null;
  const gs = ch.querySelector(".i-group");
  if (gs) { gs.value = "3"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps) return null;
  const opt = ps.querySelector(`option[value="${prodId}"]`);
  if (!opt) return { ch, ok: false, notFound: true };
  ps.value = prodId; fire(ps, "change");
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = "4"; fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = "3"; fire(hi, "input"); fire(hi, "change"); }
  return { ch, ok: true };
}

const rows = [];
const add = (status, section, item, draftSays, webSays, note) =>
  rows.push({ status, section, item, draftSays, webSays, note });

// ══════════════════════════════════════════════
// A. โครง 3 กล่อง (CATS ใน groupGHOpts)
// ══════════════════════════════════════════════

const r = renderG3("roof_polyton");
if (!r || !r.ok) {
  console.error("ERROR: ไม่สามารถ render G3 roof_polyton ได้");
  process.exit(1);
}
const ch = r.ch;

// ดู accordion กล่องที่สร้างจาก groupGHOpts
const accDets = [...ch.querySelectorAll(".gh-opt-cat-det")];
const accKeys = accDets.map(d => (d.querySelector("summary") || {}).textContent || "");

console.log("\n=== accordion keys ที่ render จริง ===");
accKeys.forEach((k, i) => console.log(`  [${i}] ${k}`));

// A1: มี 3 กล่องไหม
add(
  accDets.length === 3 ? "🟢" : "🔴",
  "A. 3 กล่อง",
  "จำนวนกล่อง accordion",
  "3 กล่อง (①②③)",
  `${accDets.length} กล่อง (${accKeys.map(k => k.split("(")[0].trim()).join(" / ")})`,
  "ดราฟ newstyle กล่อง: ①สเปกหลัก·รางน้ำ ②ออปชั่นหลัก ③ออปชั่นเสริม·หมายเหตุ"
);

// helper: ข้อความใน summary ของแต่ละกล่อง
function boxText(idx) {
  if (!accDets[idx]) return "";
  return (accDets[idx].textContent || "").toLowerCase();
}
function boxHas(idx, keyword) {
  return boxText(idx).includes(keyword.toLowerCase());
}

// A2: กล่อง ① เปิดตาม default ไหม
const box1Open = accDets[0] && accDets[0].open;
add(
  box1Open ? "🟢" : "🔴",
  "A. 3 กล่อง",
  "กล่อง ① เปิด default",
  "open:true",
  box1Open ? "open" : "closed",
  "ดราฟกำหนด ①สเปกหลัก เปิดอยู่"
);

// A3: กล่อง ② ③ ปิด default
const box2Open = accDets[1] && accDets[1].open;
const box3Open = accDets[2] && accDets[2].open;
add(
  (!box2Open && !box3Open) ? "🟢" : "🟠",
  "A. 3 กล่อง",
  "กล่อง ②③ ปิด default",
  "open:false",
  `② ${box2Open ? "open" : "closed"} · ③ ${box3Open ? "open" : "closed"}`,
  "ดราฟกำหนด ②③ พับอยู่"
);

// ══════════════════════════════════════════════
// A4-A7: element อยู่ในกล่องถูกต้องไหม
// ══════════════════════════════════════════════

// ตรวจว่า element (โดย class หรือ text) อยู่ใน กล่องไหน
function findElemBox(queryFn) {
  // หา element จาก ch ทั้งหมด
  for (let i = 0; i < accDets.length; i++) {
    if (queryFn(accDets[i])) return i; // อยู่ใน details นั้น
  }
  // อาจอยู่นอก accordion (skipEls)
  const inCh = queryFn(ch);
  return inCh ? -1 : null; // -1 = นอก accordion, null = ไม่พบ
}

// A4: สีโครง (rf-colorbox) → กล่อง ①
const rfColorBox = ch.querySelector(".rf-colorbox");
let rfColorBoxInBox = null;
if (rfColorBox) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(rfColorBox)) { rfColorBoxInBox = i; break; }
  }
}
add(
  rfColorBox ? (rfColorBoxInBox === 0 ? "🟢" : "🔴") : "🔴",
  "A. element ใน กล่อง",
  "สีโครงอลู (rf-colorbox)",
  "กล่อง ① สเปกหลัก",
  rfColorBox ? (rfColorBoxInBox !== null ? `กล่อง ${rfColorBoxInBox + 1}` : "นอก accordion") : "ไม่พบ rf-colorbox",
  "สีโครง L1/L2/L3 ต้องอยู่ใน กล่อง ①"
);

// A5: แป (o-roofbatten) → กล่อง ①
const roofBatten = ch.querySelector(".o-roofbatten");
let battenInBox = null;
if (roofBatten) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(roofBatten)) { battenInBox = i; break; }
  }
}
add(
  roofBatten ? (battenInBox === 0 ? "🟢" : "🔴") : "🔴",
  "A. element ใน กล่อง",
  "แป (o-roofbatten)",
  "กล่อง ① สเปกหลัก",
  roofBatten ? (battenInBox !== null ? `กล่อง ${battenInBox + 1}` : "นอก accordion") : "ไม่พบ",
  "แปเดี่ยว/แปคู่ ต้องอยู่ใน กล่อง ①"
);

// A6: โครงสร้าง (o-roofframe) → กล่อง ①
const roofFrame = ch.querySelector(".o-roofframe");
let frameInBox = null;
if (roofFrame) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(roofFrame)) { frameInBox = i; break; }
  }
}
add(
  roofFrame ? (frameInBox === 0 ? "🟢" : "🔴") : "🔴",
  "A. element ใน กล่อง",
  "โครงสร้าง (o-roofframe)",
  "กล่อง ① สเปกหลัก",
  roofFrame ? (frameInBox !== null ? `กล่อง ${frameInBox + 1}` : "นอก accordion") : "ไม่พบ",
  "โครงอลู/โครงเหล็กชุบ ต้องอยู่ใน กล่อง ①"
);

// A7: ปลายหลังคา / รางน้ำ (o-roofend) → กล่อง ①
const roofEnd = ch.querySelector(".o-roofend");
let roofEndInBox = null;
if (roofEnd) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(roofEnd)) { roofEndInBox = i; break; }
  }
}
add(
  roofEnd ? (roofEndInBox === 0 ? "🟢" : "🔴") : "🔴",
  "A. element ใน กล่อง",
  "ปลายหลังคา/รางน้ำ (o-roofend)",
  "กล่อง ① สเปกหลัก",
  roofEnd ? (roofEndInBox !== null ? `กล่อง ${roofEndInBox + 1}` : "นอก accordion") : "ไม่พบ",
  "รางน้ำต้องอยู่ใน กล่อง ① (ดราฟ newstyle รวมรางน้ำกับสเปกหลัก)"
);

// A8: ต่อปลายวัสดุที่ 2 (o-roof2) → กล่อง ② ออปชั่นหลัก
const roof2 = ch.querySelector(".o-roof2");
let roof2InBox = null;
if (roof2) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(roof2)) { roof2InBox = i; break; }
  }
}
add(
  roof2 ? (roof2InBox === 1 ? "🟢" : "🔴") : "🔴",
  "A. element ใน กล่อง",
  "หลังคาผสม/ต่อปลายวัสดุที่ 2 (o-roof2)",
  "กล่อง ② ออปชั่นหลัก",
  roof2 ? (roof2InBox !== null ? `กล่อง ${roof2InBox + 1}` : "นอก accordion") : "ไม่พบ",
  "ดราฟ newstyle: หลังคาผสม=กล่อง② (ออปชั่นหลัก)"
);

// A9: ฝ้า (o-ceilmode) → กล่อง ②
const ceilMode = ch.querySelector(".o-ceilmode");
let ceilInBox = null;
if (ceilMode) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(ceilMode)) { ceilInBox = i; break; }
  }
}
add(
  ceilMode ? (ceilInBox === 1 ? "🟢" : "🔴") : "🔴",
  "A. element ใน กล่อง",
  "ฝ้า (o-ceilmode)",
  "กล่อง ② ออปชั่นหลัก",
  ceilMode ? (ceilInBox !== null ? `กล่อง ${ceilInBox + 1}` : "นอก accordion") : "ไม่พบ",
  "ดราฟ newstyle: ฝ้า=กล่อง②"
);

// A10: โครงเหล็กเสริม (o-rfbeam) → กล่อง ②
const rfBeam = ch.querySelector(".o-rfbeam");
let beamInBox = null;
if (rfBeam) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(rfBeam)) { beamInBox = i; break; }
  }
}
add(
  rfBeam ? (beamInBox === 1 ? "🟢" : "🔴") : "🔴",
  "A. element ใน กล่อง",
  "คานเหล็กถัก / โครงเหล็กเสริม (o-rfbeam)",
  "กล่อง ② (หรือ sub กล่อง 🏗️ ใน②)",
  rfBeam ? (beamInBox !== null ? `กล่อง ${beamInBox + 1}` : "นอก accordion") : "ไม่พบ",
  "ดราฟ: โครงเหล็กเสริมอยู่ใน กล่อง ②"
);

// A11: หมายเหตุ (remarkSelectHTML / rk-block) → กล่อง ③
const rkBlock = ch.querySelector(".rk-block");
let rkInBox = null;
if (rkBlock) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(rkBlock)) { rkInBox = i; break; }
  }
}
add(
  rkBlock ? (rkInBox === 2 ? "🟢" : "🔴") : "🔴",
  "A. element ใน กล่อง",
  "หมายเหตุมาตรฐาน (rk-block)",
  "กล่อง ③ ออปชั่นเสริม",
  rkBlock ? (rkInBox !== null ? `กล่อง ${rkInBox + 1}` : "นอก accordion") : "ไม่พบ rk-block ใน ch",
  "ดราฟ: หมายเหตุมาตรฐานอยู่ใน กล่อง ③ · ติ๊กขึ้นใบ"
);

// ══════════════════════════════════════════════
// B. สีโครง L1/L2/L3
// ══════════════════════════════════════════════

// B1: L1 chips (rf-l1chips)
const l1Chips = ch.querySelector(".rf-l1chips");
add(
  l1Chips ? "🟢" : "🔴",
  "B. สีโครง L1/L2/L3",
  "L1 chips (rf-l1chips)",
  "มี — แสดงสีทั้งใบในบรรทัดเดียว",
  l1Chips ? `มี (${l1Chips.querySelectorAll(".chip").length} ชิป)` : "ไม่พบ rf-l1chips",
  "ดราฟ: L1=บรรทัดเดียว แสดงสีทั้งใบ (ฐาน)"
);

// B2: L2 toggle checkbox (rf-l2-cb)
const l2Cb = ch.querySelector(".rf-l2-cb");
const l2Host = ch.querySelector(".rf-l2-host");
add(
  (l2Cb && l2Host) ? "🟢" : "🔴",
  "B. สีโครง L1/L2/L3",
  "L2 checkbox + host (rf-l2-cb, rf-l2-host)",
  "toggle ติ๊กแล้ว rf-l2-host โผล่",
  `rf-l2-cb: ${l2Cb ? "มี" : "ไม่พบ"} · rf-l2-host: ${l2Host ? "มี" : "ไม่พบ"}`,
  "ดราฟ: L2=checkbox ติ๊กแล้วค่อยโผล่ host (แบบ G2)"
);

// B3: L2 ย้าย .i-color-wrap เข้า rf-l2-host ไหม
const iColorWrap = ch.querySelector(".i-color-wrap");
let iColorInL2Host = false;
if (iColorWrap && l2Host) {
  iColorInL2Host = l2Host.contains(iColorWrap);
}
add(
  iColorWrap ? (iColorInL2Host ? "🟢" : "🟠") : "🟠",
  "B. สีโครง L1/L2/L3",
  ".i-color-wrap ย้ายเข้า rf-l2-host",
  "i-color-wrap ต้องอยู่ใน rf-l2-host (สีจริงรายการนี้)",
  iColorWrap ? (iColorInL2Host ? "อยู่ใน l2-host แล้ว" : "ยังอยู่นอก l2-host") : "ไม่พบ i-color-wrap",
  "buildItemOpts L5784: ย้าย .i-color-wrap เข้า .rf-l2-host"
);

// B4: L2 toggle สีพรีวิว (border-color #b3122a)
// ตรวจ style ของ label ที่ครอบ l2Cb
let l2LabelStyle = "";
if (l2Cb) {
  const lbl = l2Cb.closest("label");
  if (lbl) l2LabelStyle = lbl.getAttribute("style") || "";
}
const l2HasRedBorder = l2LabelStyle.includes("#b3122a") || l2LabelStyle.includes("b3122a");
add(
  l2HasRedBorder ? "🟢" : "🟠",
  "B. สีโครง L1/L2/L3",
  "L2 label styling (สีแดง #b3122a)",
  "border/bg แดง #b3122a เมื่อ on",
  l2HasRedBorder ? "มี #b3122a ใน style" : `style: ${l2LabelStyle.substring(0, 80)}`,
  "ดราฟ: L2 label on = แดง #b3122a (เหมือน G1)"
);

// B5: L3 checkbox + host (rf-l3-cb, rf-l3-host)
const l3Cb = ch.querySelector(".rf-l3-cb");
const l3Host = ch.querySelector(".rf-l3-host");
add(
  (l3Cb && l3Host) ? "🟢" : "🔴",
  "B. สีโครง L1/L2/L3",
  "L3 checkbox + host (rf-l3-cb, rf-l3-host)",
  "toggle ติ๊กแล้ว rf-l3-host โผล่",
  `rf-l3-cb: ${l3Cb ? "มี" : "ไม่พบ"} · rf-l3-host: ${l3Host ? "มี" : "ไม่พบ"}`,
  "ดราฟ: L3=checkbox ซ้อนใน L2 · ติ๊กแล้วโผล่ host"
);

// B6: L3 label สีน้ำเงิน (#1e40af)
let l3LabelStyle = "";
if (l3Cb) {
  const lbl = l3Cb.closest("label");
  if (lbl) l3LabelStyle = lbl.getAttribute("style") || "";
}
const l3HasBlueBorder = l3LabelStyle.includes("#1e40af") || l3LabelStyle.includes("1e40af");
add(
  l3HasBlueBorder ? "🟢" : "🟠",
  "B. สีโครง L1/L2/L3",
  "L3 label styling (น้ำเงิน #1e40af)",
  "border/bg น้ำเงิน #1e40af",
  l3HasBlueBorder ? "มี #1e40af ใน style" : `style: ${l3LabelStyle.substring(0, 80)}`,
  "ดราฟ สีโครง 23มิ.ย.: L3 toggle สีน้ำเงิน"
);

// B7: L3 host ซ้อนใน L2 host หรืออยู่ทุกเวลา (ดราฟ newstyle: L3 ซ้อนใน L2 กล่อง)
// ดราฟ 23มิ.ย. toggle-style: L3 label + host แสดงเสมอ (แต่ host ซ่อน/โผล่ด้วย checkbox)
// ดราฟ newstyle 22มิ.ย.: L3 ซ้อนใน sub2 ของ L2
// เว็บจริง: L3 label อยู่นอก l2Host แต่ host ซ่อน/โผล่ผ่าน rfL3CbToggle
let l3CbInL2Host = false;
if (l3Cb && l2Host) {
  l3CbInL2Host = l2Host.contains(l3Cb);
}
add(
  "⬜",  // ตรวจ info
  "B. สีโครง L1/L2/L3",
  "L3 label ซ้อนอยู่ใน rf-l2-host ไหม",
  "ดราฟ 23มิ.ย.: L3 ซ้อนใน L2 body · แต่แสดงตลอด host ซ่อน/โผล่",
  l3CbInL2Host ? "l3-cb อยู่ใน l2-host" : "l3-cb อยู่นอก l2-host (แต่ host ซ่อน/โผล่แยก)",
  "ข้อนี้เป็น info — ตรวจพฤติกรรมจริงบน browser"
);

// B8: L2 host ซ่อน default (display:none)
let l2HostHidden = false;
if (l2Host) {
  const style = l2Host.getAttribute("style") || "";
  l2HostHidden = style.includes("display:none") || style.includes("display: none");
}
add(
  l2HostHidden ? "🟢" : "🟠",
  "B. สีโครง L1/L2/L3",
  "rf-l2-host ซ่อน default",
  "display:none เมื่อยังไม่ติ๊ก",
  l2Host ? (l2HostHidden ? "ซ่อน (display:none)" : "โผล่อยู่") : "ไม่พบ",
  "default ต้องซ่อน (ยังไม่ติ๊ก L2)"
);

// B9: L3 host ซ่อน default
let l3HostHidden = false;
if (l3Host) {
  const style = l3Host.getAttribute("style") || "";
  l3HostHidden = style.includes("display:none") || style.includes("display: none");
}
add(
  l3HostHidden ? "🟢" : "🟠",
  "B. สีโครง L1/L2/L3",
  "rf-l3-host ซ่อน default",
  "display:none เมื่อยังไม่ติ๊ก",
  l3Host ? (l3HostHidden ? "ซ่อน (display:none)" : "โผล่อยู่") : "ไม่พบ",
  "default ต้องซ่อน (ยังไม่ติ๊ก L3)"
);

// B10: L3 มี dropdown เปลี่ยนสีโครง (o-rfcoopt) + dropdown เปลี่ยนวัสดุมุง (o-rfmatopt)
const rfcoopt = ch.querySelector(".o-rfcoopt");
const rfmatopt = ch.querySelector(".o-rfmatopt");
add(
  (rfcoopt && rfmatopt) ? "🟢" : "🔴",
  "B. สีโครง L1/L2/L3",
  "L3 dropdowns (o-rfcoopt, o-rfmatopt)",
  "มีทั้ง เปลี่ยนสีโครง + เปลี่ยนวัสดุมุง",
  `o-rfcoopt: ${rfcoopt ? "มี" : "ไม่พบ"} · o-rfmatopt: ${rfmatopt ? "มี" : "ไม่พบ"}`,
  "ดราฟ 23มิ.ย.: L3 มี 2 ตัวเลือก = สีโครง และ วัสดุมุง"
);

// B11: L3 dropdown มี l3coderow (ช่องรหัสสีพิเศษ) โผล่เมื่อเลือก hasCode
const l3coderow = ch.querySelector(".l3coderow");
add(
  l3coderow ? "🟢" : "🔴",
  "B. สีโครง L1/L2/L3",
  "L3 ช่องรหัสสีพิเศษ (l3coderow)",
  "มี span.l3coderow (โผล่เมื่อเลือกสี hasCode)",
  l3coderow ? "มี" : "ไม่พบ l3coderow",
  "ดราฟ: สีที่มีรหัส (อบพิเศษ/Fuji/ชุบ) → ช่องรหัสโผล่"
);

// ══════════════════════════════════════════════
// C. หมายเหตุมาตรฐาน
// ══════════════════════════════════════════════

// C1: มี remarkSelectHTML / rk-block ในหน้า (บาน G3)
const rkAll = ch.querySelectorAll(".rk-block");
add(
  rkAll.length > 0 ? "🟢" : "🔴",
  "C. หมายเหตุมาตรฐาน",
  "rk-block มีในรายการ G3",
  "มี (ติ๊กขึ้นใบ)",
  `พบ ${rkAll.length} rk-block`,
  "ดราฟ กล่อง③: หมายเหตุมาตรฐาน ติ๊กได้หลายข้อ ขึ้นใบ"
);

// C2: มี i-note (textarea) ด้วยไหม
const iNote = ch.querySelector(".i-note");
add(
  iNote ? "🟢" : "🔴",
  "C. หมายเหตุมาตรฐาน",
  "i-note textarea",
  "มี (พิมพ์หมายเหตุเองเพิ่มได้)",
  iNote ? "มี" : "ไม่พบ",
  "textarea พิมพ์เพิ่มได้ ไหลลง genQuote"
);

// C3: rk-block อยู่ใน กล่อง ③ ไหม (ตรวจซ้ำชัดขึ้น)
if (rkBlock) {
  const rkInBox3 = accDets[2] && accDets[2].contains(rkBlock);
  add(
    rkInBox3 ? "🟢" : "🔴",
    "C. หมายเหตุมาตรฐาน",
    "rk-block อยู่ใน กล่อง ③",
    "กล่อง ③ ออปชั่นเสริม·หมายเหตุ",
    rkInBox3 ? "อยู่ใน กล่อง ③" : `อยู่ใน กล่อง ${rkInBox !== null ? rkInBox + 1 : "นอก accordion"}`,
    "groupGHOpts catch-all = กล่อง ③"
  );
}

// ══════════════════════════════════════════════
// D. ออปชั่นหลัก ใน กล่อง ② ครบไหม (4 ชนิด)
// ══════════════════════════════════════════════

// D1: หลังคาเลื่อน (o-rfslide หรือ keyword "หลังคาเลื่อน")
let slideEl = ch.querySelector(".o-rfslide") || [...ch.querySelectorAll("label,div,span,select,input")].find(e => (e.textContent || "").includes("หลังคาเลื่อน"));
let slideInBox = null;
if (slideEl) {
  for (let i = 0; i < accDets.length; i++) {
    if (accDets[i].contains(slideEl)) { slideInBox = i; break; }
  }
}
add(
  slideEl ? (slideInBox === 1 ? "🟢" : "🔴") : "🔴",
  "D. ออปชั่นหลัก (กล่อง②)",
  "หลังคาเลื่อน",
  "กล่อง ②",
  slideEl ? (slideInBox !== null ? `กล่อง ${slideInBox + 1}` : "นอก accordion") : "ไม่พบ",
  "ดราฟ newstyle กล่อง②: หลังคาเลื่อน (ชนิด/พื้นที่/มอเตอร์)"
);

// D2: หลังคาผสม ตรวจซ้ำ (พบ o-roof2 แล้วด้านบน — D2 = summary)
add(
  roof2 ? (roof2InBox === 1 ? "🟢" : "🔴") : "🔴",
  "D. ออปชั่นหลัก (กล่อง②)",
  "หลังคาผสม (วัสดุที่ 2)",
  "กล่อง ②",
  roof2 ? (roof2InBox !== null ? `กล่อง ${roof2InBox + 1}` : "นอก accordion") : "ไม่พบ",
  "ดราฟ กล่อง②: หลังคาผสม=ต่อปลายวัสดุที่ 2"
);

// D3: โครงเหล็กเสริม ใน sub กล่อง (พบ o-rfbeam แล้วด้านบน)
add(
  rfBeam ? (beamInBox === 1 ? "🟢" : "🔴") : "🔴",
  "D. ออปชั่นหลัก (กล่อง②)",
  "โครงเหล็กเสริม/คานเหล็ก",
  "กล่อง ② (อยู่ใน sub 🏗️ โครงเหล็กเสริม)",
  rfBeam ? (beamInBox !== null ? `กล่อง ${beamInBox + 1}` : "นอก accordion") : "ไม่พบ",
  "ดราฟ: โครงเสริมอยู่ใน กล่อง ② (card ลากได้)"
);

// D4: ฝ้า อยู่ใน กล่อง ② (พบ o-ceilmode แล้ว)
add(
  ceilMode ? (ceilInBox === 1 ? "🟢" : "🔴") : "🔴",
  "D. ออปชั่นหลัก (กล่อง②)",
  "ฝ้า (o-ceilmode)",
  "กล่อง ②",
  ceilMode ? (ceilInBox !== null ? `กล่อง ${ceilInBox + 1}` : "นอก accordion") : "ไม่พบ",
  "ดราฟ: ฝ้าอยู่ใน กล่อง ②"
);

// ══════════════════════════════════════════════
// E. ลำดับ element ใน กล่อง ① (ดราฟ: สีโครง → แป → โครงสร้าง)
// ══════════════════════════════════════════════
if (accDets[0]) {
  const b1 = accDets[0];
  const els = [...b1.querySelectorAll(".rf-colorbox, .o-roofbatten, .o-roofframe, .o-roofend")];
  const order = els.map(e => {
    if (e.classList.contains("rf-colorbox")) return "สีโครง";
    if (e.classList.contains("o-roofbatten")) return "แป";
    if (e.classList.contains("o-roofframe")) return "โครงสร้าง";
    if (e.classList.contains("o-roofend")) return "ปลายหลังคา";
    return "?";
  });
  const expectedOrder = ["สีโครง", "แป", "โครงสร้าง", "ปลายหลังคา"];
  const orderMatch = JSON.stringify(order) === JSON.stringify(expectedOrder);
  add(
    orderMatch ? "🟢" : "🟠",
    "E. ลำดับใน กล่อง①",
    "ลำดับ element: สีโครง→แป→โครงสร้าง→ปลายหลังคา",
    "สีโครง → แป → โครงสร้าง → ปลายหลังคา",
    order.join(" → ") || "(ไม่พบ element)",
    "ดราฟ: สีโครงขึ้นก่อน แปก่อนโครงสร้าง"
  );
}

// ══════════════════════════════════════════════
// สรุปผล
// ══════════════════════════════════════════════

const OK = rows.filter(r => r.status === "🟢").length;
const MISS = rows.filter(r => r.status === "🔴").length;
const EXTRA = rows.filter(r => r.status === "🟠").length;
const INFO = rows.filter(r => r.status === "⬜").length;

console.log("\n=== ผล G3 vs Draft ===");
console.log(`🟢 ตรง: ${OK}  🔴 ขาด/ไม่ตรง: ${MISS}  🟠 ต่างจากดราฟ: ${EXTRA}  ⬜ info: ${INFO}`);
console.log("\n--- รายละเอียด ---");

// เรียง 🔴 → 🟠 → 🟢 → ⬜
const order = { "🔴": 0, "🟠": 1, "🟢": 2, "⬜": 3 };
rows.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));

rows.forEach(r => {
  console.log(`${r.status} [${r.section}] ${r.item}`);
  console.log(`   ดราฟ: ${r.draftSays}`);
  console.log(`   เว็บ:  ${r.webSays}`);
  if (r.note) console.log(`   note:  ${r.note}`);
  console.log();
});

if (jsErr.length) {
  console.log("=== JS errors ===");
  jsErr.forEach(e => console.log(" ", e));
}
