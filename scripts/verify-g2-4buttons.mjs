// verify-g2-4buttons.mjs — ตรวจว่า G2GROUPS 4 ปุ่มทำงานถูกต้อง (หลังแก้ famSelectorHTML)
// ตรวจ 3 ข้อ:
//   a. famSelectorHTML(grp='2') render 4 ปุ่มหลัก (ประตูรั้ว/ระแนง/ราวกันตก/ระแนงพิเศษ)
//   b. ทุก product ยังเข้าถึงได้ + ราคาออก (grand ไม่ NaN/0): rn2, rn38, rn84, imp1-6, fence_gate, bar_slide, bar_grid_z, bar_openclose
//   c. คิดเร็ว (qiRenderG2 → .qi-cats): grp='2' ได้ 4 ปุ่ม
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, "..", "public", "calculator", "index.html");
const html = readFileSync(HTML_PATH, "utf8");

const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", e => { if (!/scrollTo|Not implemented/i.test(e.message)) jsErrors.push(e.message); });

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

let pass = 0, fail = 0;
function ok(msg) { console.log("  PASS:", msg); pass++; }
function err(msg) { console.log("  FAIL:", msg); fail++; }

// --- helper: render item กลุ่ม 2, set product, return ch ---
function renderProd(id) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch(e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = "2"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod"); if (!ps) return null;
  const opt = ps.querySelector(`option[value="${id}"]`); if (!opt) return { ch, ok: false };
  ps.value = id; fire(ps, "change");
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = "3"; fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = "2"; fire(hi, "input"); fire(hi, "change"); }
  return { ch, ok: true };
}
function noSvc() { ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id=>{ const e=doc.getElementById(id); if(e&&e.checked){e.checked=false;fire(e,"change");} }); }
function grand() {
  noSvc();
  try { w.calcQuote && w.calcQuote(); w.genQuote && w.genQuote(); } catch(e) { return NaN; }
  const g = doc.querySelector("#quoteContent .qtot .g");
  return g ? parseInt((g.textContent||"").replace(/\.\d+/g,"").replace(/[^\d]/g,""), 10) : NaN;
}

// ============================================================
// A. famSelectorHTML grp='2' ต้องมี 4 ปุ่ม G2GROUPS
// ============================================================
console.log("\n=== A. famSelectorHTML grp='2' → 4 ปุ่ม ===");
{
  const r = renderProd("fence_gate"); // default product กลุ่ม 2
  if (!r || !r.ok) { err("render fence_gate ไม่ได้"); }
  else {
    // หา .fam-prodsel ใน .ch
    const famSel = r.ch.querySelector(".fam-prodsel");
    if (!famSel) { err("ไม่พบ .fam-prodsel ใน ch"); }
    else {
      // นับปุ่มที่มี data-g2grp (ปุ่มหลัก G2GROUPS)
      const g2Btns = famSel.querySelectorAll("button[data-g2grp]");
      if (g2Btns.length === 4) { ok(`พบ 4 ปุ่ม data-g2grp: ${[...g2Btns].map(b=>b.dataset.g2grp).join(", ")}`); }
      else { err(`พบ ${g2Btns.length} ปุ่ม data-g2grp (คาด 4): ${[...g2Btns].map(b=>b.dataset.g2grp+":"+b.textContent.trim()).join(" | ")}`); }

      // ตรวจว่า ไม่มี data-cat ปุ่มหลัก 6 ปุ่มเก่า (ระแนง-บังตา/ผนัง/เกล็ด/ราวบันได ฯลฯ เป็น primary)
      const catBtnsMain = famSel.querySelectorAll(".chip-grid:first-of-type button[data-cat]");
      if (catBtnsMain.length === 0) { ok("ปุ่มหลักไม่มี data-cat แล้ว (ไม่ใช่ 6 ปุ่มเก่า)"); }
      else { err(`ยังมี data-cat ปุ่มหลัก ${catBtnsMain.length} ปุ่ม = 6-btn mode ยังอยู่`); }

      // ตรวจว่า ปุ่ม "gate" active เมื่อ product=fence_gate
      const gateBtn = famSel.querySelector('button[data-g2grp="gate"]');
      if (gateBtn && gateBtn.classList.contains("on")) { ok("ปุ่ม 'gate' active ถูกต้องเมื่อ product=fence_gate"); }
      else { err("ปุ่ม 'gate' ไม่ active เมื่อ product=fence_gate"); }
    }
  }
}

// ตรวจ active-state ปุ่มย่อย ระแนง: กล่อง/เกล็ด Z/เลื่อน
{
  const r = renderProd("rn2");
  if (r && r.ok) {
    const famSel = r.ch.querySelector(".fam-prodsel");
    if (famSel) {
      const ranaeBtn = famSel.querySelector('button[data-g2grp="ranae"]');
      if (ranaeBtn && ranaeBtn.classList.contains("on")) { ok("ปุ่ม 'ranae' active เมื่อ product=rn2 (ระแนงบังตา)"); }
      else { err("ปุ่ม 'ranae' ไม่ active เมื่อ product=rn2"); }
      // ปุ่มย่อย ชนิดระแนง
      const subBtns = famSel.querySelectorAll("button[onclick*='famPickG2RanaeSub']");
      if (subBtns.length === 3) { ok(`พบ 3 ปุ่มย่อยระแนง: ${[...subBtns].map(b=>b.textContent.trim()).join(", ")}`); }
      else { err(`ปุ่มย่อยระแนง = ${subBtns.length} (คาด 3: กล่อง/เกล็ด Z/เลื่อน)`); }
      // ปุ่ม "กล่อง" active เมื่อ rn2
      const boxBtn = [...subBtns].find(b=>b.textContent.includes("กล่อง"));
      if (boxBtn && boxBtn.classList.contains("on")) { ok("ปุ่มย่อย 'กล่อง' active เมื่อ product=rn2"); }
      else { err("ปุ่มย่อย 'กล่อง' ไม่ active เมื่อ product=rn2"); }
    }
  } else { err("render rn2 ไม่ได้"); }
}

{
  const r = renderProd("rn84");
  if (r && r.ok) {
    const famSel = r.ch.querySelector(".fam-prodsel");
    if (famSel) {
      const subBtns = famSel.querySelectorAll("button[onclick*='famPickG2RanaeSub']");
      const gleedBtn = [...subBtns].find(b=>b.textContent.includes("เกล็ด"));
      if (gleedBtn && gleedBtn.classList.contains("on")) { ok("ปุ่มย่อย 'เกล็ด Z' active เมื่อ product=rn84"); }
      else { err("ปุ่มย่อย 'เกล็ด Z' ไม่ active เมื่อ product=rn84"); }
    }
  } else { err("render rn84 ไม่ได้"); }
}

{
  const r = renderProd("bar_slide");
  if (r && r.ok) {
    const famSel = r.ch.querySelector(".fam-prodsel");
    if (famSel) {
      const ranaeBtn = famSel.querySelector('button[data-g2grp="ranae"]');
      if (ranaeBtn && ranaeBtn.classList.contains("on")) { ok("ปุ่ม 'ranae' active เมื่อ product=bar_slide"); }
      else { err("ปุ่ม 'ranae' ไม่ active เมื่อ bar_slide"); }
      const subBtns = famSel.querySelectorAll("button[onclick*='famPickG2RanaeSub']");
      const slideBtn = [...subBtns].find(b=>b.textContent.includes("เลื่อน"));
      if (slideBtn && slideBtn.classList.contains("on")) { ok("ปุ่มย่อย 'เลื่อน' active เมื่อ product=bar_slide"); }
      else { err("ปุ่มย่อย 'เลื่อน' ไม่ active เมื่อ bar_slide"); }
    }
  } else { err("render bar_slide ไม่ได้"); }
}

{
  const r = renderProd("bar_grid_z");
  if (r && r.ok) {
    const famSel = r.ch.querySelector(".fam-prodsel");
    if (famSel) {
      const spBtn = famSel.querySelector('button[data-g2grp="special"]');
      if (spBtn && spBtn.classList.contains("on")) { ok("ปุ่ม 'special' active เมื่อ product=bar_grid_z"); }
      else { err("ปุ่ม 'special' ไม่ active เมื่อ bar_grid_z"); }
    }
  } else { err("render bar_grid_z ไม่ได้"); }
}

{
  const r = renderProd("bar_openclose");
  if (r && r.ok) {
    const famSel = r.ch.querySelector(".fam-prodsel");
    if (famSel) {
      const spBtn = famSel.querySelector('button[data-g2grp="special"]');
      if (spBtn && spBtn.classList.contains("on")) { ok("ปุ่ม 'special' active เมื่อ product=bar_openclose"); }
      else { err("ปุ่ม 'special' ไม่ active เมื่อ bar_openclose"); }
    }
  } else { err("render bar_openclose ไม่ได้"); }
}

{
  const r = renderProd("imp1");
  if (r && r.ok) {
    const famSel = r.ch.querySelector(".fam-prodsel");
    if (famSel) {
      const railBtn = famSel.querySelector('button[data-g2grp="rail"]');
      if (railBtn && railBtn.classList.contains("on")) { ok("ปุ่ม 'rail' active เมื่อ product=imp1"); }
      else { err("ปุ่ม 'rail' ไม่ active เมื่อ imp1"); }
    }
  } else { err("render imp1 ไม่ได้"); }
}

// ============================================================
// B. ทุก product เข้าถึงได้ + grand ไม่ NaN/0
// ============================================================
console.log("\n=== B. Product เข้าถึงได้ + ราคาออก ===");
const PROD_LIST = [
  // ระแนงกล่อง (บังตา+ผนัง)
  { id: "rn2", label: "ระแนงบังตา 1x5 รวมโครง" },
  { id: "rn38", label: "ระแนงผนัง รวมโครง" },
  // ระแนงเกล็ด
  { id: "rn84", label: "เกล็ด Z ไม่โครง" },
  // ราวกันตก
  { id: "imp1", label: "ราวกันตก imp1 (หมุด/เฉียง)" },
  { id: "imp2", label: "ราวกันตก imp2 (ยู/เฉียง/อลู)" },
  { id: "imp3", label: "ราวกันตก imp3 (เสา/เฉียง/อลู)" },
  { id: "imp4", label: "ราวกันตก imp4 (หมุด/ตรง)" },
  { id: "imp5", label: "ราวกันตก imp5 (ยู/ตรง/อลู)" },
  { id: "imp6", label: "ราวกันตก imp6 (เสา/ตรง/อลู)" },
  // ประตูรั้ว
  { id: "fence_gate", label: "ประตูรั้ว" },
  // ระแนง (bar_*)
  { id: "bar_slide", label: "ระแนงเลื่อน (bar_slide)" },
  { id: "bar_grid_z", label: "บานเกล็ดอลู (bar_grid_z)" },
  { id: "bar_openclose", label: "ระแนงเปิด-ปิด (bar_openclose)" },
];

for (const { id, label } of PROD_LIST) {
  const r = renderProd(id);
  if (!r || !r.ok) { err(`${label} [${id}]: เลือกในกลุ่ม 2 ไม่ได้`); continue; }
  const g = grand();
  if (!Number.isFinite(g) || g === 0) { err(`${label} [${id}]: grand = ${g} (NaN/0 = ราคาพัง)`); }
  else { ok(`${label} [${id}]: grand = ${g.toLocaleString()} บาท`); }
}

// ============================================================
// C. คิดเร็ว (.qi-cats) grp='2' → 4 ปุ่ม
// ============================================================
console.log("\n=== C. คิดเร็ว qiRenderG2 → 4 ปุ่ม (.qi-cats) ===");
{
  // addQuickItem แล้วตั้งกลุ่ม 2 (Quick mode ใช้ #q-items)
  const qItems = doc.getElementById("q-items");
  if (!qItems) { err("ไม่พบ #q-items"); }
  else {
    qItems.innerHTML = "";
    try { w.addQuickItem && w.addQuickItem(); } catch(e) {}
    const ch = qItems.querySelector(".ch");
    if (!ch) { err("ไม่พบ .ch ใน #q-items"); }
    else {
      const gSel = ch.querySelector(".qi-group");
      if (gSel) { gSel.value = "2"; fire(gSel, "change"); }
      try { w.qiDispatch && w.qiDispatch(ch); } catch(e) {}
      // .qi-cats = แถวหมวด 4 ปุ่ม (gate/ranae/rail/special)
      const qiCats = ch.querySelector(".qi-cats");
      if (!qiCats) { err("ไม่พบ .qi-cats ใน ch (qiRenderG2 ต้อง render .qi-cats)"); }
      else {
        const catBtns = qiCats.querySelectorAll("button");
        if (catBtns.length === 4) {
          ok(`คิดเร็ว: พบ 4 ปุ่มใน .qi-cats: ${[...catBtns].map(b=>b.textContent.trim()).join(", ")}`);
        } else {
          err(`คิดเร็ว: .qi-cats มี ${catBtns.length} ปุ่ม (คาด 4): ${[...catBtns].map(b=>b.textContent.trim()).join(", ")}`);
        }
      }
    }
  }
}

// ============================================================
// สรุป
// ============================================================
console.log("\n=== สรุป ===");
console.log(`PASS: ${pass}  FAIL: ${fail}`);
if (jsErrors.length) { console.log("\nJS Errors ระหว่าง boot:"); jsErrors.forEach(e=>console.log(" -", e)); }
if (fail > 0) { console.log("\n🔴 ยังมี FAIL — ต้องแก้ก่อน"); process.exit(1); }
else { console.log("\n✅ ผ่านทุกข้อ"); }
