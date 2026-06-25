// check-g3.mjs — ตรวจฟอร์ม G3 หลังคา (index.html) "เหมือนดราฟ DRAFT-G3-ภาพรวมครบ-2026-06-24 ไหม"
// เกณฑ์: ดราฟ G3 (24มิ.ย.) — ไม่ใช่ index ปัจจุบัน · เทียบ 52 ข้อ (7 หมวด): โครงกล่อง/สีหัวกล่อง/L1สีโครง/ชิป/ออปชั่นครบ/ลำดับ/อยู่กล่องถูก
// READ-ONLY index.html: render สดด้วย jsdom + เรียก groupGHOpts(ch) ก่อนตรวจ (g4-box สร้าง dynamic)
// ใช้:  node scripts/check-g3.mjs        → ออกรายงาน HTML + สรุปใน terminal
//       เปิด docs/กลุ่ม3-หลังคากันสาดฝ้า/CHECK-G3-vs-draft-<วันนี้>.html
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTDIR = join(ROOT, "docs", "กลุ่ม3-หลังคากันสาดฝ้า");
const DATE = process.argv[2] || "2026-06-24";
const OUT = join(OUTDIR, `CHECK-G3-vs-draft-${DATE}.html`);

// ===== boot =====
const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const vc = new VirtualConsole(); const jsErr = [];
vc.on("jsdomError", e => { if (!/scrollTo|Not implemented/i.test(e.message)) jsErr.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise(r => { if (dom.window.document.readyState === "complete") r(); else dom.window.addEventListener("load", r); setTimeout(r, 2000); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

// ===== render หลังคา + เรียก groupGHOpts(ch) ก่อนตรวจ =====
// G3 = group 3 · roof_vinyl (และเทสรุ่นอื่นได้ผ่าน arg id)
function renderRoof(id) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch (e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = "3"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod"); if (!ps) return { ch, ok: false };
  const opt = ps.querySelector('option[value="' + id + '"]');
  if (!opt) return { ch, ok: false, notInG: true };
  ps.value = id; fire(ps, "change");
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = "4"; fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = "3"; fire(hi, "input"); fire(hi, "change"); }
  // *** สำคัญ: g4-box สร้าง dynamic ใน groupGHOpts → ต้องเรียกหลัง render ***
  try { w.groupGHOpts(ch); } catch (e) { /* บางครั้ง addItem เรียกให้แล้ว */ }
  return { ch, ok: true, ps };
}

const rows = []; // {id,desc,cat,pass(bool|null),note}
let _n = 0;
function chk(cat, desc, pass, note) { rows.push({ id: ++_n, cat, desc, pass: pass === null ? null : !!pass, note: note || "" }); }
// helper: element มีไหม / select ซ่อนไหม / chip-group ติดไหม
function vis(el) { return el && (el.style.display !== "none"); }
function hiddenSel(ch, cls) { const el = ch.querySelector(cls); return el && el.tagName === "SELECT" && el.style.display === "none"; }
function chipCount(ch, cls) {
  // ชิปของ select cls = ปุ่ม chip ที่ onclick อ้าง cls (chSetChip(this,'cls') หรือ chip-group ใกล้ select)
  const sel = ch.querySelector(cls); if (!sel) return 0;
  const lbl = sel.closest("label,.opt,div"); if (!lbl) return 0;
  // นับ chip ใน wrapper เดียวกับ select (rfChips render chip-group ติดกับ select)
  let host = sel.parentElement;
  let chips = host ? host.querySelectorAll(".chip-group .chip") : [];
  if (!chips.length && lbl) chips = lbl.querySelectorAll(".chip-group .chip");
  return chips.length;
}
function selOpts(ch, cls) { const el = ch.querySelector(cls); return el ? Array.from(el.options || []).map(o => o.value) : null; }
// document position: a มาก่อน b ไหม
function before(a, b) { if (!a || !b) return null; return !!(a.compareDocumentPosition(b) & w.Node.DOCUMENT_POSITION_FOLLOWING); }

// ════════════════════════════════════════════════
// render หลัก = roof_vinyl
// ════════════════════════════════════════════════
const R = renderRoof("roof_vinyl");
const ch = R && R.ch;
const ok = R && R.ok;
if (!ok) { chk("boot", "render roof_vinyl ในกลุ่ม 3", false, "เลือก roof_vinyl ไม่ได้ — ตรวจที่เหลือข้ามหมด"); }
const styleText = Array.from(doc.querySelectorAll("style")).map(s => s.textContent).join("\n");

// ════════════════════════════════════════════════
// หมวด 1 · โครงกล่อง (8 ข้อ)
// ════════════════════════════════════════════════
{
  const boxes = ok ? ch.querySelectorAll(".i-opts .g4-box") : [];
  chk("1·โครงกล่อง", ".i-opts .g4-box มี 3 กล่อง", boxes.length === 3, "พบ " + boxes.length + " กล่อง (ดราฟ: ①สเปกหลัก ②ออปชั่นหลัก ③เสริม)");
  const b1 = ok ? ch.querySelector(".g4-b1") : null;
  const b2 = ok ? ch.querySelector(".g4-b2") : null;
  const b3 = ok ? ch.querySelector(".g4-b3") : null;
  chk("1·โครงกล่อง", ".g4-b1 = DIV (กล่องเปิดเสมอ)", b1 && b1.tagName === "DIV", b1 ? ("tag=" + b1.tagName) : "ไม่พบ .g4-b1");
  chk("1·โครงกล่อง", ".g4-b2 = DIV (กล่องเปิดเสมอ)", b2 && b2.tagName === "DIV", b2 ? ("tag=" + b2.tagName) : "ไม่พบ .g4-b2");
  chk("1·โครงกล่อง", ".g4-b3 = DETAILS (กล่องพับ)", b3 && b3.tagName === "DETAILS", b3 ? ("tag=" + b3.tagName) : "ไม่พบ .g4-b3");
  chk("1·โครงกล่อง", "ไม่มี .gh-opt-cat-det (accordion เทาเดิม)", ok ? !ch.querySelector(".gh-opt-cat-det") : null, ok ? (ch.querySelector(".gh-opt-cat-det") ? "ยังพบ accordion เทา → roof ตกลงไป path generic" : "ใช้ g4-box แทน accordion เทาแล้ว") : "(ข้าม)");
  const prebox = ok ? ch.querySelector(".i-opts .g4-prebox") : null;
  chk("1·โครงกล่อง", "กล่อง wrap ใน .g4-prebox", !!prebox, prebox ? "พบ .g4-prebox" : "ไม่พบ .g4-prebox");
  const allInPrebox = prebox && Array.from(boxes).every(bx => prebox.contains(bx));
  chk("1·โครงกล่อง", "ทั้ง 3 กล่องอยู่ใน .g4-prebox", boxes.length ? allInPrebox : null, allInPrebox ? "ครบ" : "บางกล่องอยู่นอก prebox");
}

// ════════════════════════════════════════════════
// หมวด 2 · สีหัวกล่อง (6 ข้อ)
// ════════════════════════════════════════════════
{
  const cssHas = (re) => re.test(styleText);
  chk("2·สีหัวกล่อง", "CSS .g4-b1>.g4-bh background #FEF3F2 (แดงอ่อน)", cssHas(/\.g4-b1>\.g4-bh\{[^}]*background:#FEF3F2/i), "หัวกล่อง① สีแดงอ่อน");
  chk("2·สีหัวกล่อง", "CSS .g4-b2>.g4-bh background #EFF6FF (ฟ้าอ่อน)", cssHas(/\.g4-b2>\.g4-bh\{[^}]*background:#EFF6FF/i), "หัวกล่อง② สีฟ้าอ่อน");
  chk("2·สีหัวกล่อง", "CSS .g4-b3>.g4-bh background #F9FAFB (เทาอ่อน)", cssHas(/\.g4-b3>\.g4-bh\{[^}]*background:#F9FAFB/i), "หัวกล่อง③ สีเทาอ่อน");
  const bh = (sel) => { const b = ok ? ch.querySelector(sel) : null; const h = b ? b.querySelector(".g4-bh") : null; return h ? (h.textContent || "") : ""; };
  const t1 = bh(".g4-b1"), t2 = bh(".g4-b2"), t3 = bh(".g4-b3");
  chk("2·สีหัวกล่อง", "หัวกล่อง① มีคำ 'สเปกหลัก'", t1.includes("สเปกหลัก"), "หัว① = " + (t1.trim() || "(ว่าง)"));
  chk("2·สีหัวกล่อง", "หัวกล่อง② มีคำ 'ออปชั่นหลัก'", t2.includes("ออปชั่นหลัก"), "หัว② = " + (t2.trim() || "(ว่าง)"));
  chk("2·สีหัวกล่อง", "หัวกล่อง③ มีคำ 'ออปชั่นเสริม'", t3.includes("ออปชั่นเสริม"), "หัว③ = " + (t3.trim() || "(ว่าง)"));
}

// ════════════════════════════════════════════════
// หมวด 3 · L1 สีโครง (11 ข้อ)
// ════════════════════════════════════════════════
{
  const l1rows = ok ? ch.querySelectorAll(".rf-l1row") : [];
  chk("3·L1สีโครง", ".rf-l1row มี 1 แถว", l1rows.length === 1, "พบ " + l1rows.length + " แถว (L1 ทั้งใบ บรรทัดเดียว)");
  const cycBtn = ok ? ch.querySelector('[onclick*="rfCycleL1"]') : null;
  chk("3·L1สีโครง", "มีปุ่ม ⟳ เปลี่ยนสีทั้งใบ [onclick*=rfCycleL1]", !!cycBtn, cycBtn ? "พบปุ่ม cycle" : "ไม่พบปุ่ม rfCycleL1");
  const l1name = ok ? ch.querySelector(".rf-l1name") : null;
  chk("3·L1สีโครง", ".rf-l1name ไม่ว่าง (โชว์ชื่อสี)", l1name && (l1name.textContent || "").trim().length > 0, l1name ? ("ชื่อสี = '" + (l1name.textContent || "").trim() + "'") : "ไม่พบ .rf-l1name");
  const l2cb = ok ? ch.querySelector("input.rf-l2-cb") : null;
  chk("3·L1สีโครง", "input.rf-l2-cb เป็น checkbox", l2cb && l2cb.type === "checkbox", l2cb ? ("type=" + l2cb.type) : "ไม่พบ .rf-l2-cb");
  const l3cb = ok ? ch.querySelector("input.rf-l3-cb") : null;
  chk("3·L1สีโครง", "input.rf-l3-cb เป็น checkbox", l3cb && l3cb.type === "checkbox", l3cb ? ("type=" + l3cb.type) : "ไม่พบ .rf-l3-cb");
  const l2host = ok ? ch.querySelector(".rf-l2-host") : null;
  chk("3·L1สีโครง", ".rf-l2-host default ซ่อน (display:none)", l2host && l2host.style.display === "none", l2host ? ("display=" + (l2host.style.display || "(ว่าง)")) : "ไม่พบ .rf-l2-host");
  const l3host = ok ? ch.querySelector(".rf-l3-host") : null;
  chk("3·L1สีโครง", ".rf-l3-host default ซ่อน (display:none)", l3host && l3host.style.display === "none", l3host ? ("display=" + (l3host.style.display || "(ว่าง)")) : "ไม่พบ .rf-l3-host");
  chk("3·L1สีโครง", "L3 host มี .o-rfcoopt (เทียบสีโครง)", l3host && !!l3host.querySelector(".o-rfcoopt"), (l3host && l3host.querySelector(".o-rfcoopt")) ? "พบ" : "ไม่พบ .o-rfcoopt ใน L3 host");
  chk("3·L1สีโครง", "L3 host มี .o-rfmatopt (เทียบวัสดุมุง)", l3host && !!l3host.querySelector(".o-rfmatopt"), (l3host && l3host.querySelector(".o-rfmatopt")) ? "พบ" : "ไม่พบ .o-rfmatopt ใน L3 host");
  chk("3·L1สีโครง", "L3 host มี .o-rfcocode (รหัสสีพิเศษ)", l3host && !!l3host.querySelector(".o-rfcocode"), (l3host && l3host.querySelector(".o-rfcocode")) ? "พบ" : "ไม่พบ .o-rfcocode ใน L3 host");
  // ✅ จำนวนสี rfCycleL1 — มติพี่นัท 24มิ.ย.: "6 สี คงไว้ตาม index" (ดราฟเก่าเขียน 4 สี = ดราฟผิด · index ถูก)
  const cyc = (() => { try { return w.eval("_rfL1Cycle") || []; } catch (e) { return []; } })();
  const EXP = [0, 1, 2, 3, 4, 5]; // มติ 24มิ.ย. 6 สี (อบขาว/ดำ/เทาซาฮาร่า/เมทัล/Aztec/ชินโค)
  const same = Array.isArray(cyc) && cyc.length === EXP.length && cyc.every((v, i) => v === EXP[i]);
  chk("3·L1สีโครง", "rfCycleL1 วน 6 สี (มติพี่นัท 24มิ.ย. คงตาม index)", same, "index _rfL1Cycle=[" + cyc.join(",") + "] · ที่ต้องการ=[" + EXP.join(",") + "] " + (same ? "✓ ตรงมติ" : "→ index วน " + cyc.length + " สี ที่ต้องการ 6 สี"));
}

// ════════════════════════════════════════════════
// D4 · การ์ดราคามุมขวาบน (พี่นัท 24มิ.ย.) — G3 ต้องมีเหมือน G1/G2/G4
// ════════════════════════════════════════════════
{
  const aside = ok ? ch.querySelector(".ch-aside") : null;
  const hasPcard = ok ? ch.classList.contains("ch-pcard") : null;
  chk("D4·การ์ดราคา", "G3 มีการ์ดราคามุมขวาบน (.ch-aside)", ok ? !!aside : null,
    aside ? "พบ .ch-aside ✓" : "ไม่พบ .ch-aside → index L6143 เงื่อนไขยังไม่รวม G3 (_isG3) → dev เพิ่ม");
  chk("D4·การ์ดราคา", "G3 ติด class .ch-pcard บน .ch", ok ? !!hasPcard : null,
    hasPcard ? "ติด ch-pcard ✓" : "ไม่ติด ch-pcard → L6141-6143 เพิ่ม _isG3");
}

// ════════════════════════════════════════════════
// D5 · กล่องสีโครง L2/L3 ชิป (ไม่ใช่ select ดิบ) — ตรงดราฟ 06-24 (พี่นัท "ชิปเละ")
// ════════════════════════════════════════════════
{
  // เปิด L2+L3 ก่อนตรวจ (ชิปอยู่ใน host ที่ default ซ่อน)
  if (ok) { const l2 = ch.querySelector(".rf-l2-cb"), l3 = ch.querySelector(".rf-l3-cb");
    try { if (l2) { l2.checked = true; l2.dispatchEvent(new w.Event("change", { bubbles: true })); } } catch (e) {}
    try { if (l3) { l3.checked = true; l3.dispatchEvent(new w.Event("change", { bubbles: true })); } } catch (e) {} }
  const l3host = ok ? ch.querySelector(".rf-l3-host") : null;
  const coRaw = l3host ? l3host.querySelector(".o-rfcoopt") : null;   // select เปลี่ยนสีโครง
  const matRaw = l3host ? l3host.querySelector(".o-rfmatopt") : null;  // select เปลี่ยนวัสดุมุง
  const coHidden = coRaw ? (w.getComputedStyle(coRaw).display === "none") : false;   // chipify = ซ่อน select
  const matHidden = matRaw ? (w.getComputedStyle(matRaw).display === "none") : false;
  const l3chips = l3host ? l3host.querySelectorAll(".chip-group .chip, .chips .chip").length : 0;
  chk("D5·สีโครงชิป", "L3 'เปลี่ยนสีโครง' เป็นชิป (select o-rfcoopt ซ่อน)", ok ? coHidden : null,
    coRaw ? ("o-rfcoopt display=" + w.getComputedStyle(coRaw).display + (coHidden ? " ✓ชิป" : " → ยัง dropdown ดิบ 12 ตัว ทำเป็นชิป+จุดสี (ดราฟ 06-24 l3colChips)")) : "ไม่พบ o-rfcoopt");
  chk("D5·สีโครงชิป", "L3 'เปลี่ยนวัสดุมุง' เป็นชิป (select o-rfmatopt ซ่อน)", ok ? matHidden : null,
    matRaw ? ("o-rfmatopt display=" + w.getComputedStyle(matRaw).display + (matHidden ? " ✓ชิป" : " → ยัง dropdown ดิบ 18 ตัว ทำเป็นชิป (ดราฟ 06-24)")) : "ไม่พบ o-rfmatopt");
  chk("D5·สีโครงชิป", "L3 host มีชิป (l3catChips/l3colChips)", ok ? (l3chips > 0) : null,
    "พบชิปใน rf-l3-host = " + l3chips + (l3chips > 0 ? " ✓" : " → ยังไม่มีชิป"));
}

// ════════════════════════════════════════════════
// หมวด 4 · ชิป (9 ข้อ) — select ซ่อน + มี chip-group
// ════════════════════════════════════════════════
{
  const chipChecks = [
    [".o-roofcolor", "สีวัสดุมุง", null],
    [".o-roofbatten", "แป", null],
    [".o-roofframe", "โครงสร้าง", null],
    [".o-roofend", "ปลายหลังคา", 3],
    [".o-rfgut", "ชนิดราง รางน้ำ", 3],
    [".o-guttersys", "ระบบระบาย", null],
    [".o-rfbeam", "คานเหล็กถัก", 4],
    [".o-rfhs", "ซ่อนสโลป", 3],
    [".o-gutter-pipecolor", "สีท่อ PVC (รางน้ำ)", null],
  ];
  // o-roofend/o-rfgut/o-rfbeam/o-rfhs อยู่ในกล่องที่อาจซ่อน (รางน้ำ) — ต้องเปิดก่อนนับชิป
  // เปิดรางน้ำ: ตั้ง o-roofend=รางน้ำ
  if (ok) {
    const re = ch.querySelector(".o-roofend"); if (re) { re.value = "รางน้ำ"; fire(re, "change"); }
    const chipEnd = ch.querySelector('[data-val="รางน้ำ"]'); // chip
  }
  for (const [cls, label, wantChips] of chipChecks) {
    const isHidden = ok ? hiddenSel(ch, cls) : null;
    const nChips = ok ? chipCount(ch, cls) : 0;
    let pass = isHidden && nChips > 0;
    let note = "select " + (isHidden ? "ซ่อน✓" : "ไม่ซ่อน/ไม่พบ") + " · ชิป " + nChips + " ตัว";
    if (wantChips != null) {
      const exact = nChips === wantChips;
      pass = isHidden && exact;
      note += " (ดราฟต้อง " + wantChips + ")";
    }
    chk("4·ชิป", "ชิป " + cls + " (" + label + ")", pass, note);
  }
}

// ════════════════════════════════════════════════
// หมวด 5 · ออปชั่นครบ (9 ข้อ)
// ════════════════════════════════════════════════
{
  // o-rfgut มี สแตนเลส 3000
  const gut = ok ? selOpts(ch, ".o-rfgut") : null;
  chk("5·ออปชั่นครบ", "o-rfgut มีสแตนเลส (val 3000)", gut && gut.includes("3000"), gut ? ("vals=" + gut.join(",")) : "ไม่พบ o-rfgut");
  // o-gutter-pipecolor มี ดำ+เทา+ขาว (⚠ flag: index อาจขาดเทา)
  const pipe = ok ? selOpts(ch, ".o-gutter-pipecolor") : null;
  const pipeOk = pipe && ["ดำ", "เทา", "ขาว"].every(c => pipe.includes(c));
  chk("5·ออปชั่นครบ", "o-gutter-pipecolor มี ดำ+เทา+ขาว (เช็คซ้ำ)", pipeOk, pipe ? ("vals=" + pipe.join(",") + (pipeOk ? "" : " → ขาด: " + ["ดำ", "เทา", "ขาว"].filter(c => !pipe.includes(c)).join(","))) : "ไม่พบ o-gutter-pipecolor");
  // o-gutter-chainpat มี ทิวลิป+โลตัส
  const chain = ok ? selOpts(ch, ".o-gutter-chainpat") : null;
  const chainOk = chain && ["ทิวลิป", "โลตัส"].every(c => chain.includes(c));
  chk("5·ออปชั่นครบ", "o-gutter-chainpat มี ทิวลิป+โลตัส", chainOk, chain ? ("vals=" + chain.join(",")) : "ไม่พบ o-gutter-chainpat");
  // o-rfpole15 (เสากลม 1,500)
  chk("5·ออปชั่นครบ", "o-rfpole15 (ตั้งเสา 4\" กลม 1,500/ต้น)", ok ? !!ch.querySelector(".o-rfpole15") : null, ok ? (ch.querySelector(".o-rfpole15") ? "พบ" : "ไม่พบ → เสากลม 1,500 หาย") : "(ข้าม)");
  // o-rfbeam val 4400 (คานรุ่น3)
  const beam = ok ? selOpts(ch, ".o-rfbeam") : null;
  chk("5·ออปชั่นครบ", "o-rfbeam มีคานรุ่น3 (val 4400)", beam && beam.includes("4400"), beam ? ("vals=" + beam.join(",")) : "ไม่พบ o-rfbeam");
  // o-rfhs val smart (สมาร์ทบอร์ด)
  const hs = ok ? selOpts(ch, ".o-rfhs") : null;
  chk("5·ออปชั่นครบ", "o-rfhs มีสมาร์ทบอร์ด (val smart)", hs && hs.includes("smart"), hs ? ("vals=" + hs.join(",")) : "ไม่พบ o-rfhs");
  // o-rfsealer + สี (o-rfsealercolor)
  chk("5·ออปชั่นครบ", "o-rfsealer (วัสดุปิดรอยต่อ) + มีสี o-rfsealercolor", ok ? (!!ch.querySelector(".o-rfsealer") && !!ch.querySelector(".o-rfsealercolor")) : null, ok ? ("sealer=" + (ch.querySelector(".o-rfsealer") ? "✓" : "✗") + " color=" + (ch.querySelector(".o-rfsealercolor") ? "✓" : "✗")) : "(ข้าม)");
  // o-rfdrain (ท่อน้ำทิ้ง PVC 2.5" — สเปกพ่วงรางน้ำ · สี ดำ/ขาว/เทา)
  const drain = ok ? selOpts(ch, ".o-rfdrain") : null;
  chk("5·ออปชั่นครบ", "o-rfdrain (ท่อน้ำทิ้ง PVC พ่วงรางน้ำ)", drain && drain.length >= 2, drain ? ("vals=" + drain.join(",")) : "ไม่พบ o-rfdrain");
  // i-rfsampleconfirm checkbox
  const samp = ok ? ch.querySelector(".i-rfsampleconfirm") : null;
  chk("5·ออปชั่นครบ", "i-rfsampleconfirm เป็น checkbox (ยืนยันตัวอย่าง)", samp && samp.type === "checkbox", samp ? ("type=" + samp.type) : "ไม่พบ .i-rfsampleconfirm");
}

// ════════════════════════════════════════════════
// หมวด 6 · ลำดับ (3 ข้อ) — compareDocumentPosition
// ════════════════════════════════════════════════
{
  const matWrap = ok ? ch.querySelector(".rf-matcolor-wrap") : null;
  const colBox = ok ? ch.querySelector(".rf-colorbox") : null;
  const ord1 = before(matWrap, colBox);
  chk("6·ลำดับ", "สีวัสดุมุง (rf-matcolor-wrap) ขึ้นก่อน สีโครง (rf-colorbox)", ord1, ord1 === null ? "หา element ไม่ครบ" : (ord1 ? "matColor → colorBox ✓" : "สีโครงขึ้นก่อนสีวัสดุมุง (ผิดดราฟ)"));
  // แป (o-roofbatten) ก่อน ต่อปลายวัสดุที่ 2 (o-roof2)
  const batten = ok ? ch.querySelector(".o-roofbatten") : null;
  const roof2 = ok ? ch.querySelector(".o-roof2") : null;
  const ord2 = before(batten, roof2);
  chk("6·ลำดับ", "แป (o-roofbatten) ก่อน ต่อปลายวัสดุที่ 2 (o-roof2)", ord2, ord2 === null ? "หา element ไม่ครบ" : (ord2 ? "แป → วัสดุ2 ✓" : "วัสดุ2 ขึ้นก่อนแป (ผิดดราฟ)"));
  // L1row ก่อน L2(rf-l2-cb) ก่อน L3(rf-l3-cb)
  const l1r = ok ? ch.querySelector(".rf-l1row") : null;
  const l2c = ok ? ch.querySelector(".rf-l2-cb") : null;
  const l3c = ok ? ch.querySelector(".rf-l3-cb") : null;
  const ord3 = before(l1r, l2c) && before(l2c, l3c);
  chk("6·ลำดับ", "L1row → L2 → L3 (เรียงบนลงล่าง)", (l1r && l2c && l3c) ? ord3 : null, (l1r && l2c && l3c) ? (ord3 ? "L1→L2→L3 ✓" : "ลำดับ L1/L2/L3 สลับ") : "หา L1/L2/L3 ไม่ครบ");
}

// ════════════════════════════════════════════════
// หมวด 7 · ออปชั่นอยู่กล่องถูก (6 ข้อ)
// ════════════════════════════════════════════════
{
  const b1 = ok ? ch.querySelector(".g4-b1") : null;
  const b2 = ok ? ch.querySelector(".g4-b2") : null;
  const b3 = ok ? ch.querySelector(".g4-b3") : null;
  const inB = (box, cls) => box && !!box.querySelector(cls);
  // ① สเปกหลัก: o-roofbatten/o-roofframe/o-roofend/rf-colorbox/o-rfgut
  chk("7·อยู่กล่องถูก", "① มี o-roofbatten + o-roofframe + o-roofend", b1 && inB(b1, ".o-roofbatten") && inB(b1, ".o-roofframe") && inB(b1, ".o-roofend"), b1 ? ("batten=" + (inB(b1, ".o-roofbatten") ? "✓" : "✗") + " frame=" + (inB(b1, ".o-roofframe") ? "✓" : "✗") + " end=" + (inB(b1, ".o-roofend") ? "✓" : "✗")) : "ไม่พบ①");
  chk("7·อยู่กล่องถูก", "① มี rf-colorbox (สีโครง) + o-rfgut (รางน้ำ)", b1 && inB(b1, ".rf-colorbox") && inB(b1, ".o-rfgut"), b1 ? ("colorbox=" + (inB(b1, ".rf-colorbox") ? "✓" : "✗") + " rfgut=" + (inB(b1, ".o-rfgut") ? "✓" : "✗")) : "ไม่พบ①");
  // ② ออปชั่นหลัก: o-roof2 + o-ceilmode
  chk("7·อยู่กล่องถูก", "② มี o-roof2 (ต่อปลายวัสดุ2) + o-ceilmode (ฝ้า)", b2 && inB(b2, ".o-roof2") && inB(b2, ".o-ceilmode"), b2 ? ("roof2=" + (inB(b2, ".o-roof2") ? "✓" : "✗") + " ceilmode=" + (inB(b2, ".o-ceilmode") ? "✓" : "✗")) : "ไม่พบ②");
  // ② มี sub-details "โครงเหล็กเสริม" (o-rfbeam/o-rfhs/o-rfsealer)
  const subDet = b2 ? Array.from(b2.querySelectorAll("details summary")).map(s => s.textContent || "") : [];
  const hasSub = subDet.some(t => /โครงเหล็ก|ของเสริม/.test(t));
  chk("7·อยู่กล่องถูก", "② มี sub-details 'โครงเหล็กเสริม/ของเสริม'", b2 ? hasSub : null, b2 ? ("sub-summaries: " + (subDet.map(t => t.trim()).filter(Boolean).join(" | ") || "(ไม่มี)")) : "ไม่พบ②");
  chk("7·อยู่กล่องถูก", "② โครงเหล็กเสริม มี o-rfbeam + o-rfhs + o-rfsealer", b2 && inB(b2, ".o-rfbeam") && inB(b2, ".o-rfhs") && inB(b2, ".o-rfsealer"), b2 ? ("rfbeam=" + (inB(b2, ".o-rfbeam") ? "✓" : "✗") + " rfhs=" + (inB(b2, ".o-rfhs") ? "✓" : "✗") + " rfsealer=" + (inB(b2, ".o-rfsealer") ? "✓" : "✗")) : "ไม่พบ②");
  // ③ ไม่มี o-roofcolor/o-rfbeam หล่นมา (สเปกหลัก/โครงเหล็ก ต้องอยู่ ①②)
  const b3Leak = b3 && (inB(b3, ".o-roofcolor") || inB(b3, ".o-rfbeam"));
  chk("7·อยู่กล่องถูก", "③ ไม่มี o-roofcolor/o-rfbeam หล่นมา", b3 ? !b3Leak : null, b3 ? (b3Leak ? "หล่นมา: " + [inB(b3, ".o-roofcolor") ? "o-roofcolor" : "", inB(b3, ".o-rfbeam") ? "o-rfbeam" : ""].filter(Boolean).join(",") : "ไม่หล่น ✓") : "ไม่พบ③");
}

// ════════════════════════════════════════════════
// เทสรุ่นอื่น: roof_polyton (8 สี) · roof_laminate (film)
// ════════════════════════════════════════════════
const extra = [];
{
  const P = renderRoof("roof_polyton");
  if (P && P.ok) {
    const cols = selOpts(P.ch, ".o-roofcolor");
    const nChip = chipCount(P.ch, ".o-roofcolor");
    extra.push({ id: "roof_polyton", desc: "โพลีตัน 8 สี (ชิป swatch)", pass: cols && cols.length === 8 && nChip === 8, note: "options=" + (cols ? cols.length : 0) + " · chips=" + nChip + " (ดราฟ 8 สี)" });
  } else extra.push({ id: "roof_polyton", desc: "เลือก roof_polyton", pass: false, note: "เลือกไม่ได้ในกลุ่ม 3" });

  const L = renderRoof("roof_laminate");
  if (L && L.ok) {
    const film = selOpts(L.ch, ".o-lamfilm");
    const thick = selOpts(L.ch, ".o-lamthick");
    extra.push({ id: "roof_laminate", desc: "ลามิเนต: ชนิดฟิล์ม (o-lamfilm) + ความหนา (o-lamthick)", pass: !!film && !!thick, note: "film=" + (film ? film.join("/") : "✗") + " · thick=" + (thick ? thick.join("/") : "✗") });
    const filmChip = chipCount(L.ch, ".o-lamfilm");
    extra.push({ id: "roof_laminate", desc: "ฟิล์มเป็นชิป (select ซ่อน)", pass: hiddenSel(L.ch, ".o-lamfilm") && filmChip >= 3, note: "select " + (hiddenSel(L.ch, ".o-lamfilm") ? "ซ่อน✓" : "ไม่ซ่อน") + " · chips=" + filmChip });
  } else extra.push({ id: "roof_laminate", desc: "เลือก roof_laminate", pass: false, note: "เลือกไม่ได้ในกลุ่ม 3" });
}

if (jsErr.length) chk("boot", "JS error ตอน render", false, jsErr.slice(0, 3).join(" | "));

// ════════════════════════════════════════════════
// สรุป + เขียน HTML
// ════════════════════════════════════════════════
const nPass = rows.filter(r => r.pass === true).length;
const nFail = rows.filter(r => r.pass === false).length;
const nNa = rows.filter(r => r.pass === null).length;
const total = rows.length;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ic = p => p === true ? "🟢" : p === false ? "🔴" : "⬜";
const cls = p => p === true ? "ok" : p === false ? "fail" : "na";
const trow = r => `<tr class="${cls(r.pass)}"><td>${r.id}</td><td>${ic(r.pass)}</td><td>${esc(r.cat)}</td><td>${esc(r.desc)}</td><td>${esc(r.note)}</td></tr>`;
const exRow = r => `<tr class="${cls(r.pass)}"><td>${ic(r.pass)}</td><td><code>${esc(r.id)}</code></td><td>${esc(r.desc)}</td><td>${esc(r.note)}</td></tr>`;

const html_out = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>CHECK G3 vs ดราฟ 24มิ.ย.</title><style>
body{font-family:'Sarabun','Leelawadee UI',Tahoma,sans-serif;font-size:13px;color:#1f2937;max-width:1040px;margin:0 auto;padding:16px;background:#f9fafb;}
h1{color:#B3151D;font-size:20px;border-bottom:3px solid #B3151D;padding-bottom:6px;}
.sum{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
.pill{padding:6px 13px;border-radius:20px;font-weight:700;}
.pk{background:#dcfce7;color:#166534;}.pm{background:#fee2e2;color:#991b1b;}.pn{background:#f3f4f6;color:#374151;}.pt{background:#fef9c3;color:#854d0e;}
table{border-collapse:collapse;width:100%;background:#fff;margin:8px 0;font-size:12.5px;}
th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top;}
th{background:#fbe9ea;color:#B3151D;}
tr.fail td{background:#fef2f2;}tr.na td{background:#fafafa;color:#6b7280;}
h2{color:#B3151D;font-size:15px;margin-top:20px;}
code{background:#f3f4f6;padding:0 4px;border-radius:3px;font-size:11.5px;}
.foot{color:#6b7280;margin-top:14px;font-size:11.5px;line-height:1.7;}
</style></head><body>
<h1>🔍 ตรวจฟอร์ม G3 หลังคา — index.html เทียบ ดราฟ 24 มิ.ย.</h1>
<p>เกณฑ์: <code>DRAFT-G3-ภาพรวมครบ-2026-06-24.html</code> · render index.html สดด้วย jsdom + เรียก groupGHOpts(ch) ก่อนตรวจ · READ-ONLY (ไม่แก้ index) · รุ่นหลัก roof_vinyl</p>
<div class="sum">
<span class="pill pk">🟢 ผ่าน ${nPass}/${total}</span>
<span class="pill pm">🔴 ไม่ผ่าน ${nFail}</span>
<span class="pill pn">⬜ ข้าม/ตรวจไม่ได้ ${nNa}</span>
</div>
<h2>ผลตรวจ ${total} ข้อ core + ${extra.length} ข้อรุ่นอื่น = ${total + extra.length} (เรียงตามหมวด)</h2>
<table><tr><th>#</th><th></th><th>หมวด</th><th>รายการตรวจ</th><th>หมายเหตุ</th></tr>
${rows.map(trow).join("\n")}
</table>
<h2>🧪 เทสรุ่นอื่น (polyton 8 สี / laminate film)</h2>
<table><tr><th></th><th>รุ่น</th><th>รายการตรวจ</th><th>หมายเหตุ</th></tr>
${extra.map(exRow).join("\n")}
</table>
<p class="foot">หมายเหตุ: ⬜ = element ไม่พบ/เลือกรุ่นไม่ได้ จึงข้าม · 🔴 ที่ติดป้าย "(เช็คซ้ำ)" = ต่างจากดราฟ ต้องเคาะพี่นัทก่อนแก้ (เช่น จำนวนสี rfCycleL1 · สีท่อ PVC ขาดเทา) · วันที่ตรวจ ${DATE}</p>
</body></html>`;
writeFileSync(OUT, html_out, "utf8");

console.log(`\n🔍 CHECK G3 vs ดราฟ 24มิ.ย. — 🟢${nPass}/${total} ผ่าน · 🔴${nFail} ไม่ผ่าน · ⬜${nNa} ข้าม`);
console.log("\n🔴 ข้อที่ไม่ผ่าน (baseline):");
rows.filter(r => r.pass === false).forEach(r => console.log("  🔴 #" + r.id + " [" + r.cat + "] " + r.desc + " — " + r.note));
const naReal = rows.filter(r => r.pass === null);
if (naReal.length) { console.log("\n⬜ ข้าม/ตรวจไม่ได้:"); naReal.forEach(r => console.log("  ⬜ #" + r.id + " [" + r.cat + "] " + r.desc + " — " + r.note)); }
console.log("\n🧪 เทสรุ่นอื่น:");
extra.forEach(r => console.log("  " + (r.pass ? "🟢" : "🔴") + " " + r.id + " — " + r.desc + " — " + r.note));
console.log("\n📄 รายงาน: " + OUT);
