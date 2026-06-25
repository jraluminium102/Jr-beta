// audit-g1-color-l1l2l3-v2.mjs — ตรวจกล่องสี L1/L2/L3 G1 Full mode เทียบดราฟ
// ปรับ: series filter ถูกต้อง, ตรวจ L3 visibility + mode switch + codebox toggle
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");

const vc = new VirtualConsole();
vc.on("jsdomError", e => { if(!/scrollTo|Not implemented/i.test(e.message)) {} });

const dom = new JSDOM(html, {
  runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc,
  url:"http://localhost/calculator/index.html"
});

await new Promise(r=>{
  if(dom.window.document.readyState==="complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 3000);
});

const w = dom.window, doc = w.document;
const fire = (el,t) => el.dispatchEvent(new w.Event(t,{bubbles:true}));

function renderG1(prodId) {
  doc.getElementById("items").innerHTML = "";
  w.addItem(doc.getElementById("items"));
  const ch = doc.querySelector("#items .ch");
  if (!ch) return null;
  const gs = ch.querySelector(".i-group");
  if (gs) { gs.value = "1"; fire(gs,"change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps) return null;
  if (prodId && ps.querySelector(`option[value="${prodId}"]`)) {
    ps.value = prodId; fire(ps,"change");
  }
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value="1.2"; fire(wi,"input"); fire(wi,"change"); }
  if (hi) { hi.value="2.2"; fire(hi,"input"); fire(hi,"change"); }
  return ch;
}

function unlockL1(ch) {
  const l1cb = ch.querySelector(".g1co-l1cb");
  if (!l1cb) return false;
  l1cb.checked = false;
  fire(l1cb,"change");
  try { w.g1L1Change(l1cb); } catch(e) {}
  return true;
}

function switchMode(ch, mode) {
  // mode = "opt" หรือ "1"
  const radios = ch.querySelectorAll(".g1co-l2mode");
  let found = false;
  radios.forEach(r => {
    if (r.value === mode) { r.checked = true; fire(r,"change"); found = true; try{w.g1L2ModeChange(r);}catch(e){} }
    else r.checked = false;
  });
  return found;
}

function isVisible(el) {
  if (!el) return false;
  return el.style.display !== "none" && el.style.display !== "";
}

function auditItem(prodId, label) {
  const ch = renderG1(prodId);
  if (!ch) return { label, issues:["ERROR: ไม่สามารถ render item"], ok:[] };

  const issues = [], ok = [];

  // === ตรวจ g1-rare-section มีอยู่ไหม ===
  const rareS = ch.querySelector(".g1-rare-section");
  if (!rareS) { issues.push("🔴 ไม่พบ .g1-rare-section"); return {label,issues,ok}; }
  ok.push("✅ .g1-rare-section พบ");

  // === L1 checkbox ===
  const l1cb = rareS.querySelector(".g1co-l1cb");
  if (!l1cb) issues.push("🔴 L1: ไม่พบ .g1co-l1cb (checkbox)");
  else if (!l1cb.checked) issues.push("🔴 L1: checkbox ไม่ได้ checked default (ดราฟ: ต้อง checked)");
  else ok.push("✅ L1 checkbox checked default");

  if (!rareS.textContent.includes("สีตามทั้งใบ")) issues.push("🔴 L1: ไม่พบ label 'สีตามทั้งใบ'");
  else ok.push("✅ L1 label 'สีตามทั้งใบ'");

  const l1c = rareS.querySelector(".g1co-l1c");
  const l1g = rareS.querySelector(".g1co-l1g");
  if (!l1c) issues.push("🔴 L1: ไม่พบ .g1co-l1c (span ชื่อสีหัวใบ)");
  else ok.push("✅ L1 .g1co-l1c span");
  if (!l1g) issues.push("🔴 L1: ไม่พบ .g1co-l1g (span ชื่อกระจกหัวใบ)");
  else ok.push("✅ L1 .g1co-l1g span");

  const rareBody = rareS.querySelector(".g1-rare-body");
  if (!rareBody) { issues.push("🔴 ไม่พบ .g1-rare-body"); return {label,issues,ok}; }
  if (isVisible(rareBody)) issues.push("🔴 L1 ติ๊กแล้ว .g1-rare-body ยังโชว์ (ดราฟ: ต้องซ่อน)");
  else ok.push("✅ L1 ติ๊ก → .g1-rare-body ซ่อน");

  // === ปลด L1 → ตรวจ L2/L3 ===
  unlockL1(ch);

  if (!isVisible(rareBody)) issues.push("🔴 ปลด L1 → .g1-rare-body ยังซ่อน (ดราฟ: ต้องโชว์)");
  else ok.push("✅ ปลด L1 → .g1-rare-body โชว์");

  // === L2 mode radio ===
  const radios = rareS.querySelectorAll(".g1co-l2mode");
  if (radios.length < 2) issues.push(`🔴 L2: mode radio มี ${radios.length} ปุ่ม (ดราฟ: ต้อง 2)`);
  else {
    ok.push(`✅ L2 mode radio 2 ปุ่ม`);
    const realRadio = [...radios].find(r=>r.value==="1");
    const optRadio = [...radios].find(r=>r.value==="opt");
    if (!realRadio) issues.push("🔴 L2: ไม่พบ radio value=1 (🟢ใช้จริง)");
    else if (!realRadio.checked) issues.push("🔴 L2: radio 🟢ใช้จริง ไม่ได้ checked default");
    else ok.push("✅ L2 default = 🟢ใช้จริง (value=1 checked)");
    if (!optRadio) issues.push("🔴 L2: ไม่พบ radio value=opt (🔵ออปชั่น)");
    else ok.push("✅ L2 🔵ออปชั่น radio พบ");
  }

  // === L2 สีอลู dropdown (i-color) ===
  const l2color = rareBody.querySelector(".i-color");
  if (!l2color) issues.push("🔴 L2: ไม่พบ .i-color dropdown ใน .g1-rare-body");
  else {
    ok.push(`✅ L2 .i-color dropdown พบ (${l2color.options.length} options)`);
    // ตรวจว่ามี ≥10 options (ยอมรับ series filter)
    if (l2color.options.length < 10) issues.push(`🔴 L2 สีอลู: options=${l2color.options.length} น้อยผิดปกติ`);
    else ok.push(`✅ L2 สีอลู ${l2color.options.length} options (series filter OK)`);
    // ตรวจว่าไม่ถูก hide เป็น select สิ้นหวัง
    if (l2color.style.display === "none") issues.push("🔴 L2 สีอลู dropdown ถูก display:none (อาจกลายเป็น chip drill)");
    else ok.push("✅ L2 สีอลู dropdown โชว์ (ไม่ใช่ chip)");
  }

  // ตรวจ chip drill ต้องไม่มีใน G1
  const colorDrill = rareBody.querySelector(".color-drill");
  if (colorDrill && colorDrill.innerHTML.trim()) {
    issues.push("🟠 L2: พบ .color-drill มีเนื้อหา ใน .g1-rare-body — ดราฟ G1 L2 ใช้ dropdown");
  } else ok.push("✅ ไม่มี chip-drill ใน L2 body");

  // === L2 codebox (i-colorcode-wrap) ===
  const l2code = rareBody.querySelector(".i-colorcode-wrap");
  if (!l2code) issues.push("🔴 L2: ไม่พบ .i-colorcode-wrap (codebox สีพิเศษ)");
  else {
    ok.push("✅ L2 .i-colorcode-wrap พบ");
    // ตรวจว่าซ่อนอยู่ตอน default (สีอบขาว)
    if (isVisible(l2code)) issues.push("🟡 L2 codebox โชว์อยู่ตอน default (สีอบขาว ไม่ต้องกรอกรหัส)");
    else ok.push("✅ L2 codebox ซ่อน default");
  }

  // === L2 กระจก dropdown (i-glass) ===
  const l2glass = rareBody.querySelector(".i-glass");
  if (!l2glass) issues.push("🔴 L2: ไม่พบ .i-glass dropdown ใน .g1-rare-body");
  else {
    ok.push(`✅ L2 .i-glass dropdown พบ (${l2glass.options.length} options)`);
    if (l2glass.options.length < 60) issues.push(`🔴 L2 กระจก: options=${l2glass.options.length} น้อยเกินไป (ดราฟ: ≥66)`);
    else ok.push(`✅ L2 กระจก ${l2glass.options.length} options (ดราฟ 66)`);
    if (l2glass.style.display === "none") issues.push("🔴 L2 กระจก dropdown ถูก hide");
    else ok.push("✅ L2 กระจก dropdown โชว์");
  }

  // === ลำดับ DOM ใน .g1-rare-body ===
  const children = [...rareBody.children];
  const posMode  = children.findIndex(el => el.querySelector && el.querySelector(".g1co-l2mode"));
  const posColor = children.findIndex(el =>
    (el.classList && el.classList.contains("i-color-wrap")) ||
    (el === (l2color && l2color.closest(".i-color-wrap"))) ||
    el.contains(l2color)
  );
  const posL3    = children.findIndex(el => el.classList && el.classList.contains("g1co-l3-wrap"));
  const posGlass = children.findIndex(el =>
    (el.classList && el.classList.contains("i-glass-wrap")) ||
    el.contains(l2glass)
  );

  ok.push(`ลำดับ: mode=${posMode} color=${posColor} l3=${posL3} glass=${posGlass}`);

  if (posMode !== -1 && posColor !== -1 && posMode > posColor)
    issues.push(`🔴 ลำดับ: mode radio (pos${posMode}) อยู่หลัง สีอลู (pos${posColor}) — ดราฟ: mode→สี→กระจก→L3`);
  else if (posMode !== -1 && posColor !== -1) ok.push("✅ ลำดับ mode < สีอลู OK");

  if (posColor !== -1 && posL3 !== -1 && posColor > posL3)
    issues.push(`🔴 ลำดับ: L2 สีอลู (pos${posColor}) อยู่หลัง L3 wrap (pos${posL3}) — ดราฟ: L2→L3`);
  else if (posColor !== -1 && posL3 !== -1) ok.push("✅ ลำดับ สีอลู < L3 OK");

  if (posGlass !== -1 && posL3 !== -1 && posGlass > posL3)
    issues.push(`🔴 ลำดับ: L2 กระจก (pos${posGlass}) อยู่หลัง L3 wrap (pos${posL3}) — ดราฟ: L2 กระจก→L3`);
  else if (posGlass !== -1 && posL3 !== -1) ok.push("✅ ลำดับ กระจก < L3 OK");

  // === L3 wrap visibility: หลังปลด L1 (mode=🟢) ===
  const l3wrap = rareS.querySelector(".g1co-l3-wrap");
  if (!l3wrap) issues.push("🔴 L3: ไม่พบ .g1co-l3-wrap");
  else {
    // ดราฟ: L3 โชว์เมื่อ L2 เปิด (ตาม code L1244: l3w.style.display='flex')
    if (!isVisible(l3wrap)) issues.push("🔴 L3 wrap ซ่อนหลังปลด L1 (ดราฟ: ควรโชว์เมื่อ L2 mode เปิด)");
    else ok.push("✅ L3 wrap โชว์หลังปลด L1 + mode=🟢");
  }

  // === L3 details ===
  const l3det = rareS.querySelector(".g1co-l3det");
  if (!l3det) issues.push("🔴 L3: ไม่พบ details.g1co-l3det");
  else ok.push("✅ L3 details.g1co-l3det พบ");

  // === L3 select สีอลู (g1co-l3c) ===
  const l3c = rareS.querySelector(".g1co-l3c");
  if (!l3c) issues.push("🔴 L3: ไม่พบ .g1co-l3c (เทียบสีอลู)");
  else {
    const first = l3c.options[0];
    if (!first || !first.textContent.includes("ไม่เทียบ"))
      issues.push("🔴 L3 สีอลู: option แรกไม่ใช่ '— ไม่เทียบ —'");
    else ok.push("✅ L3 สีอลู: option แรก '— ไม่เทียบ —'");
    ok.push(`✅ L3 .g1co-l3c ${l3c.options.length} options`);
  }

  // === L3 select กระจก (g1co-l3g) ===
  const l3g = rareS.querySelector(".g1co-l3g");
  if (!l3g) issues.push("🔴 L3: ไม่พบ .g1co-l3g (เทียบกระจก)");
  else {
    const first = l3g.options[0];
    if (!first || !first.textContent.includes("ไม่เทียบ"))
      issues.push("🔴 L3 กระจก: option แรกไม่ใช่ '— ไม่เทียบ —'");
    else ok.push("✅ L3 กระจก: option แรก '— ไม่เทียบ —'");
    ok.push(`✅ L3 .g1co-l3g ${l3g.options.length} options`);
  }

  // === L3 codebox (g1co-l3code-wrap) ===
  const l3code = rareS.querySelector(".g1co-l3code-wrap");
  if (!l3code) issues.push("🔴 L3: ไม่พบ .g1co-l3code-wrap");
  else ok.push("✅ L3 codebox wrap พบ");

  // === mode switch: เปลี่ยนเป็น 🔵ออปชั่น → ตรวจ L3 ยังอยู่ ===
  const switched = switchMode(ch, "opt");
  if (!switched) issues.push("🟡 switch mode=opt ไม่ได้ (กัน false positive เท่านั้น)");
  else {
    const l3AfterOpt = rareS.querySelector(".g1co-l3-wrap");
    if (l3AfterOpt && !isVisible(l3AfterOpt))
      issues.push("🟡 หลัง switch 🔵ออปชั่น: L3 wrap ซ่อน (ดราฟ: L3 ควรยังเห็น)");
    else ok.push("✅ mode=🔵 → L3 wrap ยังโชว์");
    ok.push("✅ mode switch 🟢→🔵 ทำงาน");
  }

  // === cg-row ต้องไม่โชว์ใน G1 ===
  const cgr = ch.querySelector(".cg-row");
  if (cgr && isVisible(cgr)) issues.push("🟠 .cg-row ยังโชว์ใน G1 (ดราฟ: ซ่อน → ใช้ g1-rare-section แทน)");
  else ok.push("✅ .cg-row ซ่อน");

  return { label, issues, ok };
}

// ===== รัน 5 ชนิดบาน =====
const testCases = [
  { id:"sliding_sms",    label:"บานเลื่อนเซมิยูโร (sliding_sms)" },
  { id:"casement_euro",  label:"บานเปิด (casement_euro)" },
  { id:"frameless_door", label:"บานเปลือย frameless (frameless_door)" },
  { id:"folding_euro",   label:"บานเฟี้ยม (folding_euro)" },
  { id:"fixed_glass",    label:"ติดตาย (fixed_glass)" },
];

const summaryRows = [];

console.log("=== AUDIT G1 L1/L2/L3 Color Box — เทียบ DRAFT-G1G4-L1L2L3-redesign-2026-06-23 ===\n");
console.log("โหมด: Full (.i-*/.o-*) เท่านั้น · ไม่แตะ .qi-*\n");

const allResults = [];
for (const tc of testCases) {
  const res = auditItem(tc.id, tc.label);
  allResults.push(res);
  const redN = res.issues.filter(i=>i.startsWith("🔴")).length;
  const orgN = res.issues.filter(i=>i.startsWith("🟠")).length;
  const yelN = res.issues.filter(i=>i.startsWith("🟡")).length;
  const status = redN>0?"🔴":orgN>0?"🟠":yelN>0?"🟡":"✅";
  console.log(`${status} ${tc.label}  [🔴${redN} 🟠${orgN} 🟡${yelN} ✅${res.ok.length}]`);
  res.issues.forEach(i=>console.log(`   ${i}`));
  if(res.issues.length===0) console.log("   (ไม่มีจุดผิด)");
  console.log("");
  summaryRows.push({label:tc.label, status, redN, orgN, yelN, okN:res.ok.length, issues:res.issues});
}

const totalRed = summaryRows.reduce((a,r)=>a+r.redN,0);
const totalOrg = summaryRows.reduce((a,r)=>a+r.orgN,0);
const totalYel = summaryRows.reduce((a,r)=>a+r.yelN,0);
console.log(`=== สรุป: 🔴${totalRed} 🟠${totalOrg} 🟡${totalYel} ===`);
