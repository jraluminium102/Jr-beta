// audit-g1-color-l1l2l3.mjs — ตรวจกล่องสี L1/L2/L3 G1 Full mode เทียบดราฟ DRAFT-G1G4-L1L2L3-redesign-2026-06-23.html
// READ-ONLY ไม่แก้ index.html
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");

const vc = new VirtualConsole();
vc.on("jsdomError", e => { if(!/scrollTo|Not implemented/i.test(e.message)) console.error("[jsdomError]",e.message); });

const dom = new JSDOM(html, {
  runScripts:"dangerously",
  pretendToBeVisual:true,
  virtualConsole:vc,
  url:"http://localhost/calculator/index.html"
});

await new Promise(r=>{
  if(dom.window.document.readyState==="complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 3000);
});

const w = dom.window, doc = w.document;
const fire = (el,t) => el.dispatchEvent(new w.Event(t,{bubbles:true}));

// ===== helper: render G1 item =====
function renderG1(prodId) {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  if (!ch) return null;
  const gs = ch.querySelector(".i-group");
  if (gs) { gs.value = "1"; fire(gs,"change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps) return null;
  // ถ้ามีสินค้า id นั้น ตั้งค่า
  if (prodId && ps.querySelector(`option[value="${prodId}"]`)) {
    ps.value = prodId; fire(ps,"change");
  }
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value="1.2"; fire(wi,"input"); fire(wi,"change"); }
  if (hi) { hi.value="2.2"; fire(hi,"input"); fire(hi,"change"); }
  return ch;
}

// ===== helper: uncheck L1 (ปลด "สีตามทั้งใบ") เพื่อให้ L2/L3 โผล่ =====
function unlockL1(ch) {
  const l1cb = ch.querySelector(".g1co-l1cb");
  if (!l1cb) return false;
  l1cb.checked = false;
  fire(l1cb,"change");
  // เรียก handler โดยตรงด้วย (กัน jsdom ไม่ fire)
  try { w.g1L1Change(l1cb); } catch(e) {}
  return true;
}

// ===== ตรวจ 1 item =====
function auditItem(prodId, label) {
  const ch = renderG1(prodId);
  if (!ch) return { label, issues: ["ERROR: ไม่สามารถ render item"] };

  const issues = [];
  const ok = [];

  // --- L1: checkbox สีตามทั้งใบ ---
  const rareS = ch.querySelector(".g1-rare-section");
  if (!rareS) { issues.push("🔴 ไม่พบ .g1-rare-section — กล่องสีไม่แสดงเลย"); return {label, issues, ok}; }

  const l1cb = rareS.querySelector(".g1co-l1cb");
  if (!l1cb) issues.push("🔴 L1: ไม่พบ checkbox .g1co-l1cb");
  else if (!l1cb.checked) issues.push("🔴 L1: checkbox ค่า default ไม่ได้ติ๊ก (ดราฟ: ต้อง checked)");
  else ok.push("✅ L1 checkbox ติ๊ก default");

  // ตรวจ label สีตามทั้งใบ
  const l1Text = rareS.textContent;
  if (!l1Text.includes("สีตามทั้งใบ")) issues.push("🔴 L1: ไม่พบข้อความ 'สีตามทั้งใบ'");
  else ok.push("✅ L1 label 'สีตามทั้งใบ'");

  // span แสดงสี/กระจกหัวใบ
  const l1c = rareS.querySelector(".g1co-l1c");
  const l1g = rareS.querySelector(".g1co-l1g");
  if (!l1c) issues.push("🔴 L1: ไม่พบ .g1co-l1c (span ชื่อสีหัวใบ)");
  else ok.push("✅ L1 span ชื่อสี (.g1co-l1c)");
  if (!l1g) issues.push("🔴 L1: ไม่พบ .g1co-l1g (span ชื่อกระจกหัวใบ)");
  else ok.push("✅ L1 span ชื่อกระจก (.g1co-l1g)");

  // ตรวจ g1-rare-body ซ่อนอยู่ตอน L1 ติ๊ก
  const rareBody = rareS.querySelector(".g1-rare-body");
  if (!rareBody) issues.push("🔴 ไม่พบ .g1-rare-body (ที่โชว์ L2/L3)");
  else {
    const bodyVisible = rareBody.style.display !== "none" && rareBody.style.display !== "";
    if (bodyVisible) issues.push("🟠 .g1-rare-body โชว์อยู่ทั้งที่ L1 ติ๊ก (ดราฟ: ต้องซ่อน)");
    else ok.push("✅ L1 ติ๊ก → g1-rare-body ซ่อน");
  }

  // --- ปลด L1 เพื่อตรวจ L2/L3 ---
  const unlocked = unlockL1(ch);
  if (!unlocked) { issues.push("🔴 ปลด L1 checkbox ไม่ได้"); return {label, issues, ok}; }

  const rareBodyAfter = rareS.querySelector(".g1-rare-body");
  if (!rareBodyAfter) { issues.push("🔴 หลังปลด L1: ไม่พบ .g1-rare-body"); return {label, issues, ok}; }
  const bodyVisAfter = rareBodyAfter.style.display === "flex" || rareBodyAfter.style.display === "block" || (rareBodyAfter.style.display !== "none");
  if (!bodyVisAfter) issues.push("🔴 หลังปลด L1: .g1-rare-body ยังซ่อนอยู่ (ดราฟ: ต้องโชว์)");
  else ok.push("✅ ปลด L1 → g1-rare-body โชว์");

  // --- L2 mode radio ---
  const radios = rareS.querySelectorAll(".g1co-l2mode");
  if (radios.length < 2) issues.push(`🔴 L2: mode radio มี ${radios.length} ปุ่ม (ดราฟ: ต้องมี 2 = 🟢ใช้จริง/🔵ออปชั่น)`);
  else {
    ok.push(`✅ L2 mode radio 2 ปุ่ม`);
    let hasReal=false, hasOpt=false, realChecked=false;
    radios.forEach(r => {
      if (r.value==="1"||r.value==="real") hasReal=true;
      if (r.value==="opt") hasOpt=true;
      if ((r.value==="1"||r.value==="real") && r.checked) realChecked=true;
    });
    if (!hasReal) issues.push("🔴 L2: ไม่พบ radio 🟢ใช้จริง (value=1)");
    else ok.push("✅ L2 radio 🟢ใช้จริง พบ");
    if (!hasOpt) issues.push("🔴 L2: ไม่พบ radio 🔵ออปชั่น (value=opt)");
    else ok.push("✅ L2 radio 🔵ออปชั่น พบ");
    if (!realChecked) issues.push("🔴 L2: default radio ไม่ได้เป็น 🟢ใช้จริง (ดราฟ: checked default)");
    else ok.push("✅ L2 default = 🟢ใช้จริง");
  }

  // --- L2 สีอลู dropdown (i-color อยู่ใน g1-rare-body) ---
  const l2color = rareBodyAfter.querySelector(".i-color");
  if (!l2color) issues.push("🔴 L2: ไม่พบ .i-color (dropdown สีอลู) ใน .g1-rare-body");
  else {
    const optCount = l2color.options.length;
    ok.push(`✅ L2 สีอลู dropdown (.i-color) พบ, options=${optCount}`);
    // ดราฟ: 13 สี (COLORS 0-12)
    if (optCount < 13) issues.push(`🔴 L2 สีอลู: options=${optCount} น้อยกว่า 13 (ดราฟ: ต้องครบ 13)`);
    else if (optCount > 13) issues.push(`🟠 L2 สีอลู: options=${optCount} มากกว่า 13 ที่ดราฟระบุ`);
    else ok.push("✅ L2 สีอลู 13 ตัวเลือก ตรงดราฟ");
  }

  // --- L2 codebox (i-colorcode-wrap อยู่ใน g1-rare-body) ---
  const l2code = rareBodyAfter.querySelector(".i-colorcode-wrap");
  if (!l2code) issues.push("🔴 L2: ไม่พบ .i-colorcode-wrap (codebox สีพิเศษ) ใน .g1-rare-body");
  else ok.push("✅ L2 codebox (.i-colorcode-wrap) พบ");

  // --- L2 กระจก dropdown (i-glass อยู่ใน g1-rare-body) ---
  const l2glass = rareBodyAfter.querySelector(".i-glass");
  if (!l2glass) issues.push("🔴 L2: ไม่พบ .i-glass (dropdown กระจก) ใน .g1-rare-body");
  else {
    const gOptCount = l2glass.options.length;
    ok.push(`✅ L2 กระจก dropdown (.i-glass) พบ, options=${gOptCount}`);
    // ดราฟ: 66 รุ่น (GLASS array)
    if (gOptCount < 60) issues.push(`🔴 L2 กระจก: options=${gOptCount} น้อยเกินไป (ดราฟ: ต้องครบ ≥66)`);
    else if (gOptCount < 66) issues.push(`🟡 L2 กระจก: options=${gOptCount} (ดราฟระบุ 66 รุ่น)`);
    else ok.push(`✅ L2 กระจก ${gOptCount} รุ่น (≥66)`);
  }

  // --- ลำดับ: L2 สีอลู ต้องอยู่ก่อน L3 wrap ---
  if (l2color && rareBodyAfter) {
    const children = [...rareBodyAfter.children];
    const posL2Color = children.findIndex(el => el === l2color.closest(".i-color-wrap") || el === l2color || el.contains(l2color));
    const posL3Wrap = children.findIndex(el => el.classList && el.classList.contains("g1co-l3-wrap"));
    if (posL2Color !== -1 && posL3Wrap !== -1) {
      if (posL2Color < posL3Wrap) ok.push("✅ ลำดับ: L2 สีอลู อยู่ก่อน L3 wrap");
      else issues.push(`🔴 ลำดับ: L2 สีอลู (pos=${posL2Color}) อยู่หลัง L3 wrap (pos=${posL3Wrap}) — ดราฟ: L2→L3`);
    }
    // ตรวจลำดับ: mode radio ก่อน สีอลู
    const posMode = children.findIndex(el => el.querySelector && el.querySelector(".g1co-l2mode"));
    if (posMode !== -1 && posL2Color !== -1) {
      if (posMode < posL2Color) ok.push("✅ ลำดับ: mode radio อยู่ก่อน สีอลู");
      else issues.push(`🔴 ลำดับ: mode radio (pos=${posMode}) อยู่หลัง สีอลู (pos=${posL2Color}) — ดราฟ: mode→สี→กระจก→L3`);
    }
  }

  // --- L3 wrap (g1co-l3-wrap) ---
  const l3wrap = rareS.querySelector(".g1co-l3-wrap");
  if (!l3wrap) issues.push("🔴 L3: ไม่พบ .g1co-l3-wrap");
  else {
    ok.push("✅ L3 wrap (.g1co-l3-wrap) พบ");
    // ตรวจ display ของ l3wrap หลังปลด L1 (ดราฟ: L3 โชว์เมื่อ L2 เปิดอยู่)
    const l3Vis = l3wrap.style.display !== "none" && l3wrap.style.display !== "";
    // ตาม code: g1L2ModeSync sets l3wrap display=flex
    // หลังปลด L1 (mode=🟢 default) → l3wrap ควรโชว์
    if (!l3Vis) issues.push("🟡 L3 wrap: display=none หลังปลด L1 (ดราฟ: L3 ควรโชว์เมื่อ L2 เปิด)");
    else ok.push("✅ L3 wrap โชว์หลังปลด L1");
  }

  // --- L3 details (g1co-l3det) ---
  const l3det = rareS.querySelector(".g1co-l3det");
  if (!l3det) issues.push("🔴 L3: ไม่พบ details.g1co-l3det");
  else ok.push("✅ L3 details พับ (.g1co-l3det)");

  // --- L3 select สีอลู (g1co-l3c) ---
  const l3c = rareS.querySelector(".g1co-l3c");
  if (!l3c) issues.push("🔴 L3: ไม่พบ select .g1co-l3c (เทียบสีอลู)");
  else {
    // ตัวแรกต้องเป็น "— ไม่เทียบ —"
    const firstOpt = l3c.options[0];
    if (!firstOpt || !firstOpt.textContent.includes("ไม่เทียบ"))
      issues.push("🔴 L3 สีอลู: ตัวเลือกแรกไม่ใช่ '— ไม่เทียบ —' (ดราฟ: ต้องมี)");
    else ok.push("✅ L3 สีอลู: ตัวแรก '— ไม่เทียบ —'");
    ok.push(`✅ L3 สีอลู select (g1co-l3c) พบ, options=${l3c.options.length}`);
  }

  // --- L3 select กระจก (g1co-l3g) ---
  const l3g = rareS.querySelector(".g1co-l3g");
  if (!l3g) issues.push("🔴 L3: ไม่พบ select .g1co-l3g (เทียบกระจก)");
  else {
    const firstOpt = l3g.options[0];
    if (!firstOpt || !firstOpt.textContent.includes("ไม่เทียบ"))
      issues.push("🔴 L3 กระจก: ตัวเลือกแรกไม่ใช่ '— ไม่เทียบ —' (ดราฟ: ต้องมี)");
    else ok.push("✅ L3 กระจก: ตัวแรก '— ไม่เทียบ —'");
    ok.push(`✅ L3 กระจก select (g1co-l3g) พบ, options=${l3g.options.length}`);
  }

  // --- L3 codebox (g1co-l3code-wrap) ---
  const l3code = rareS.querySelector(".g1co-l3code-wrap");
  if (!l3code) issues.push("🔴 L3: ไม่พบ .g1co-l3code-wrap (รหัสสีพิเศษ L3)");
  else ok.push("✅ L3 codebox (g1co-l3code-wrap) พบ");

  // --- ตรวจ L2 กระจก อยู่ใน g1-rare-body (ไม่ใช่ cg-row หรือที่อื่น) ---
  if (l2glass) {
    const inBody = rareBodyAfter.contains(l2glass);
    if (!inBody) issues.push("🔴 L2 กระจก (.i-glass) ไม่ได้อยู่ใน .g1-rare-body (อาจอยู่ .cg-row หรือที่อื่น)");
    else ok.push("✅ L2 กระจก อยู่ใน .g1-rare-body");
  }

  // --- ตรวจ L2 สีอลู อยู่ใน g1-rare-body ---
  if (l2color) {
    const inBody = rareBodyAfter.contains(l2color);
    if (!inBody) issues.push("🔴 L2 สีอลู (.i-color) ไม่ได้อยู่ใน .g1-rare-body");
    else ok.push("✅ L2 สีอลู อยู่ใน .g1-rare-body");
  }

  // --- ตรวจ drill chip ต้องไม่โผล่ (G1 L2 ใช้ dropdown ไม่ใช่ chip drill) ---
  const colorDrill = rareBodyAfter.querySelector(".color-drill");
  if (colorDrill) issues.push("🟠 L2: พบ .color-drill (ชิปสี) ใน g1-rare-body — ดราฟ: G1 L2 ใช้ dropdown ไม่ใช่ chip drill");
  else ok.push("✅ ไม่มี .color-drill ใน g1-rare-body (ดราฟ: G1 L2 ใช้ dropdown)");

  // --- ตรวจ cg-row ต้องไม่โชว์สำหรับ G1 ---
  const cgr = ch.querySelector(".cg-row");
  if (cgr && cgr.style.display !== "none") issues.push("🟠 .cg-row ยังโชว์อยู่ (ดราฟ G1: ซ่อน cg-row ใช้ g1-rare-section แทน)");
  else ok.push("✅ .cg-row ซ่อน (G1 ใช้ g1-rare-section)");

  return { label, issues, ok };
}

// ===== รัน ตรวจ 5 ชนิดบาน =====
const testCases = [
  { id: "sliding_sms", label: "บานเลื่อน (sliding_sms)" },
  { id: "casement_euro", label: "บานเปิด (casement_euro)" },
  { id: "frameless_door", label: "บานเปลือย/ติดตาย (frameless_door)" },
  { id: "folding_euro", label: "บานเฟี้ยม (folding_euro)" },
  { id: "fixed_glass", label: "ติดตาย (fixed_glass)" },
];

console.log("=== AUDIT G1 L1/L2/L3 Color Box vs DRAFT-G1G4-L1L2L3-redesign-2026-06-23 ===\n");

const results = [];
for (const tc of testCases) {
  const res = auditItem(tc.id, tc.label);
  results.push(res);
  const redCount = res.issues.filter(i=>i.startsWith("🔴")).length;
  const orgCount = res.issues.filter(i=>i.startsWith("🟠")).length;
  const yelCount = res.issues.filter(i=>i.startsWith("🟡")).length;
  const status = redCount>0 ? "🔴" : orgCount>0 ? "🟠" : yelCount>0 ? "🟡" : "✅";
  console.log(`${status} ${tc.label}  [🔴${redCount} 🟠${orgCount} 🟡${yelCount} ✅${res.ok.length}]`);
  res.issues.forEach(i => console.log(`   ${i}`));
  if (res.issues.length===0) console.log("   (ไม่มีจุดผิด)");
  console.log("");
}

// สรุปรวม
const allIssues = results.flatMap(r=>r.issues);
const totalRed = allIssues.filter(i=>i.startsWith("🔴")).length;
const totalOrg = allIssues.filter(i=>i.startsWith("🟠")).length;
const totalYel = allIssues.filter(i=>i.startsWith("🟡")).length;
console.log(`=== สรุป: 🔴${totalRed} 🟠${totalOrg} 🟡${totalYel} ===`);
