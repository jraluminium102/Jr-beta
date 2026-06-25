// audit-g1-vs-draft.mjs — ตรวจ G1 เว็บสด vs ดราฟเกณฑ์ 22 มิ.ย. ทีละชนิด 4 มิติ
// READ-ONLY: ไม่แก้ index.html · เขียนได้แค่รายงาน
// ใช้: node scripts/audit-g1-vs-draft.mjs

import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const html = readFileSync(join(ROOT,"public/calculator/index.html"),"utf8");
const vc = new VirtualConsole();
vc.on("jsdomError", () => {});

const dom = new JSDOM(html,{
  runScripts:"dangerously",
  pretendToBeVisual:true,
  virtualConsole:vc,
  url:"http://localhost/calculator/index.html"
});
await new Promise(r=>{ if(dom.window.document.readyState==="complete")r(); else dom.window.addEventListener("load",r); setTimeout(r,3000); });
const w = dom.window, doc = w.document;
const fire = (el,t) => el.dispatchEvent(new w.Event(t,{bubbles:true}));

// boot: สร้าง item fresh แล้ว set prod
function freshItem(prodId) {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch(e) { return null; }
  const ch = doc.querySelector("#items .ch");
  if (!ch) return null;
  const gs = ch.querySelector(".i-group");
  if (gs) { gs.value = "1"; fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps) return null;
  const opt = ps.querySelector(`option[value="${prodId}"]`);
  if (!opt) return { ch, found: false };
  ps.value = prodId; fire(ps, "change");
  return { ch, found: true };
}

// ดึง text ทั้งหมดใน ch
function chText(ch) { return ch ? (ch.textContent || ch.innerText || "") : ""; }

// ตรวจว่ามี element ที่ตรง selector ไหม
function has(ch, sel) { return !!ch.querySelector(sel); }

// ตรวจ chip/button ที่มีข้อความ
function hasChipText(ch, text) {
  const btns = ch.querySelectorAll("button.chip, .chip-group button, .chip-grid button");
  for (const b of btns) {
    if ((b.textContent||"").trim().includes(text)) return true;
  }
  return false;
}
function hasChipVal(ch, val) {
  const sels = ch.querySelectorAll("select");
  for (const s of sels) {
    for (const o of s.options) { if (o.value === val) return true; }
  }
  return false;
}
function chipDefault(ch, cls, expected) {
  // หา chip.on ใน chip-group ที่ sync กับ select cls
  const sel = ch.querySelector(cls);
  if (!sel) return null;
  // หา chip ที่มี class on ใกล้กัน
  const wrap = sel.closest("label") || sel.parentElement;
  if (!wrap) return null;
  const on = wrap.querySelector(".chip.on");
  if (on) return (on.textContent||"").trim();
  // fallback: selected option
  return (sel.options[sel.selectedIndex]||{}).text || null;
}

// ===== เกณฑ์ดราฟ 22 มิ.ย. ทีละชนิด =====

const RESULTS = []; // { type, dim, status, detail }
function add(type, dim, status, detail) {
  RESULTS.push({ type, dim, status, detail });
}

// ---- ตรวจซ้ำ helper ----
function checkLock(ch, type) {
  // ชุดล็อค = .o-lock (บานเปิด/กระทุ้ง) หรือ .o-slidelock (เลื่อน)
  const sel = ch.querySelector(".o-lock, .o-slidelock");
  if (!sel) { add(type, "ปุ่ม", "MISS", "ชุดล็อค: ไม่มี select .o-lock หรือ .o-slidelock"); return; }
  // ตรวจ option ครบ 3 ค่า
  const opts = Array.from(sel.options).map(o=>o.value);
  const hasNone = opts.some(v => /ไม่มี/.test(v)||v==="ไม่มี");
  const hasLock = opts.some(v => /ไม่มีกุญแจ|มีล็อค$|^มีชุดล็อก$/.test(v)||v.includes("ล็อค")&&!v.includes("กุญแจ")||v==="มีล็อค");
  const hasKey  = opts.some(v => /กุญแจ/.test(v));
  if (!hasNone||!hasLock||!hasKey) {
    add(type, "ปุ่ม", "MISS", `ชุดล็อค: option ไม่ครบ (none=${hasNone} lock=${hasLock} key=${hasKey})`);
  } else {
    add(type, "ปุ่ม", "OK", "ชุดล็อค: 3 ตัวเลือกครบ");
  }
}
function checkMosq(ch, type) {
  const m = ch.querySelector(".o-mosq");
  if (!m) { add(type, "ปุ่ม", "MISS", "มุ้ง: ไม่มี .o-mosq"); return; }
  const vals = Array.from(m.options).map(o=>o.value).filter(Boolean);
  if (vals.length < 4) add(type, "ปุ่ม", "MISS", `มุ้ง: มีแค่ ${vals.length} ตัวเลือก (ควร ≥ 5 ตามดราฟ: ไม่ใส่/เฟรม/จีบ/ม้วน/อื่นๆ)`);
  else add(type, "ปุ่ม", "OK", `มุ้ง: ${vals.length} ตัวเลือก`);
}
function checkGridmark(ch, type) {
  const gm = ch.querySelector(".o-gridmark");
  if (!gm) add(type, "ปุ่ม", "MISS", "คาดตาราง: ไม่มี .o-gridmark");
  else add(type, "ปุ่ม", "OK", "คาดตาราง: มี .o-gridmark ✓");
}
function checkSolidLower(ch, type) {
  const sl = ch.querySelector(".o-solidlower");
  if (sl) add(type, "ปุ่ม", "EXTRA", "แผ่นทึบล่าง: ยังมี .o-solidlower (เกณฑ์เป็นชิป 3 ตัว ไม่ใช่ select)");
  else {
    // ดราฟมีปุ่มแผ่นทึบ — เช็คว่ามีข้อความ
    const txt = chText(ch);
    if (/อลูลูกฟูก|คอมโพสิท/.test(txt)) add(type, "ปุ่ม", "OK", "แผ่นทึบล่าง: มีปุ่ม (ไม่เป็น select)");
    else add(type, "ปุ่ม", "MISS", "แผ่นทึบล่าง: ไม่มีทั้ง .o-solidlower และข้อความอลูลูกฟูก/คอมโพสิท");
  }
}
function checkFcsides(ch, type) {
  const fc = ch.querySelector(".o-fcsides");
  if (!fc) add(type, "ปุ่ม", "MISS", "ครอบวงกบ: ไม่มี .o-fcsides");
  else add(type, "ปุ่ม", "OK", "ครอบวงกบ: มี .o-fcsides ✓");
}
function checkDfm(ch, type) {
  const df = ch.querySelector(".o-dfm");
  if (!df) add(type, "ปุ่ม", "MISS", "ดรอปพื้น: ไม่มี .o-dfm");
  else add(type, "ปุ่ม", "OK", "ดรอปพื้น: มี .o-dfm ✓");
}
function checkColorBox(ch, type) {
  // กล่องสี L1-L3 — มี checkbox "สีตามทั้งใบ" หรือ .o-liftmode หรือ rf-colorbox
  // สำหรับ G1: คาดว่าจะมี .i-color (select สี) ซึ่งเป็น L2 จริง
  const ic = ch.querySelector(".i-color");
  if (!ic) add(type, "ปุ่ม", "MISS", "สี/กระจก: ไม่มี .i-color");
  else {
    const vals = Array.from(ic.options).map(o=>o.value).filter(Boolean);
    add(type, "ปุ่ม", "OK", `สี/กระจก: .i-color มี ${vals.length} ตัวเลือก`);
  }
}
function checkSubpanel(ch, type) {
  // ผสมบาน = .sub-addbtn หรือปุ่มข้อความ "ผสมบาน"
  const sp = ch.querySelector(".sub-addbtn");
  const txt = chText(ch);
  if (!sp && !/ผสมบาน/.test(txt)) add(type, "ปุ่ม", "MISS", "ผสมบาน: ไม่มี .sub-addbtn และไม่พบข้อความ 'ผสมบาน'");
  else add(type, "ปุ่ม", "OK", "ผสมบาน: มี ✓");
}
function checkRemark(ch, type) {
  const txt = chText(ch);
  if (!/หมายเหตุ|remark/i.test(txt)) add(type, "ปุ่ม", "MISS", "หมายเหตุ: ไม่พบข้อความ 'หมายเหตุ'");
  else add(type, "ปุ่ม", "OK", "หมายเหตุ: มี ✓");
}
function checkExtrawork(ch, type) {
  const ew = ch.querySelector(".o-extrawork");
  if (!ew) add(type, "ปุ่ม", "MISS", "งานเสริม: ไม่มี .o-extrawork");
  else add(type, "ปุ่ม", "OK", "งานเสริม: มี .o-extrawork ✓");
}
function checkRemove(ch, type) {
  const txt = chText(ch);
  if (!/รื้อ/.test(txt)) add(type, "ปุ่ม", "MISS", "รื้อ: ไม่พบข้อความ 'รื้อ'");
  else add(type, "ปุ่ม", "OK", "รื้อ: มี ✓");
}

// ========== #1 บานเลื่อน ==========
{
  const type = "#1 บานเลื่อน";
  // ตรวจรุ่นครบ: เซมิยูโร(sliding_sms), ยูโร(sliding_euro), E-series(sliding_eseries)
  for (const [id, label] of [["sliding_sms","เซมิยูโร"], ["sliding_euro","ยูโร"], ["sliding_eseries","E-series"]]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  // ตรวจ controls หลักบน sliding_sms (default)
  const r = freshItem("sliding_sms");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // ประเภท (ประตู/หน้าต่าง)
    if (!/ประตู.*หน้าต่าง|หน้าต่าง/.test(txt) || !ch.querySelector(".i-type,.itype-seg")) {
      add(type, "ปุ่ม", "MISS", "ประเภท: ไม่มีชิปประตู/หน้าต่าง");
    } else add(type, "ปุ่ม", "OK", "ประเภท: ชิปประตู/หน้าต่าง ✓");
    // ชนิดการเปิด (o-opentype) — 4 ค่า
    const ot = ch.querySelector(".o-opentype");
    if (!ot) add(type, "ปุ่ม", "MISS", "ชนิดการเปิด: ไม่มี .o-opentype");
    else {
      const otOpts = Array.from(ot.options).map(o=>o.value).filter(Boolean);
      if (otOpts.length < 4) add(type, "ปุ่ม", "MISS", `ชนิดการเปิด: มีแค่ ${otOpts.length} ตัวเลือก (ควร 4)`);
      else add(type, "ปุ่ม", "OK", `ชนิดการเปิด: ${otOpts.length} ตัวเลือก ✓`);
      // default = เลื่อน (ระบุติดตาย)
      const def = chipDefault(ch, ".o-opentype", "บานเลื่อน");
      if (!def || !/เลื่อน|ระบุติดตาย/.test(def)) add(type, "default", "MISS", `ชนิดการเปิด default: "${def}" (ควรเป็น "เลื่อน/ระบุติดตาย")`);
      else add(type, "default", "OK", `ชนิดการเปิด default: "${def}" ✓`);
    }
    // ราง (ล่าง) .o-bottomrail
    const br = ch.querySelector(".o-bottomrail");
    if (!br) add(type, "ปุ่ม", "MISS", "ราง (ล่าง): ไม่มี .o-bottomrail");
    else {
      const brOpts = Array.from(br.options).map(o=>o.value);
      const hasGn = brOpts.some(v=>/กันน้ำ/.test(v));
      const hasTi = brOpts.some(v=>/เตี้ย/.test(v));
      if (!hasGn || !hasTi) add(type, "ปุ่ม", "MISS", `ราง (ล่าง): ขาด (กันน้ำ=${hasGn} เตี้ย=${hasTi})`);
      else add(type, "ปุ่ม", "OK", "ราง (ล่าง): 2 ตัวเลือก ✓");
      // default = กันน้ำ
      const brd = chipDefault(ch, ".o-bottomrail", "กันน้ำ");
      if (!brd || !/กันน้ำ/.test(brd)) add(type, "default", "MISS", `ราง default: "${brd}" (ควร "กันน้ำ")`);
      else add(type, "default", "OK", `ราง default: "${brd}" ✓`);
    }
    // ชุดล็อค (o-slidelock)
    checkLock(ch, type);
    // default ชุดล็อค = มีชุดล็อก + กุญแจ
    const sl = ch.querySelector(".o-slidelock");
    if (sl) {
      const slDef = chipDefault(ch, ".o-slidelock", "");
      if (!slDef || !/กุญแจ/.test(slDef)) add(type, "default", "MISS", `ชุดล็อค default: "${slDef}" (ควร "มีชุดล็อก + กุญแจ")`);
      else add(type, "default", "OK", `ชุดล็อค default: "${slDef}" ✓`);
    }
    // มือจับ (ชิปติ๊กได้หลายแบรนด์: Cmech/ดิจิตอล/สแตนอร่าม/รุ่นอื่น)
    if (!/Cmech|ดิจิตอล|สแตนอร่าม/.test(txt)) add(type, "ปุ่ม", "MISS", "มือจับ: ไม่พบข้อความ Cmech/ดิจิตอล/สแตนอร่าม");
    else add(type, "ปุ่ม", "OK", "มือจับ: พบข้อความ ✓");
    // z2: มุ้ง / คาดตาราง / แผ่นทึบล่าง
    checkMosq(ch, type);
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    // z3: สี/กระจก / อื่นๆ
    checkColorBox(ch, type);
    checkFcsides(ch, type);
    checkDfm(ch, type);
    checkRemove(ch, type);
    checkExtrawork(ch, type);
    checkRemark(ch, type);
    checkSubpanel(ch, type);
  }
}

// ========== #2 เลื่อนภายใน ==========
{
  const type = "#2 เลื่อนภายใน";
  for (const [id, label] of [["inner_top_stack","รางบนซ้อน"], ["inner_top_slimlux","SlimLux"]]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  // ตรวจ X-series — ดราฟมี
  const rx = freshItem("inner_top_xseries");
  if (!rx || !rx.found) add(type, "ปุ่ม", "MISS", "รุ่น X-series (inner_top_xseries): เลือกไม่ได้ — ดราฟมี 3 รุ่น");
  else add(type, "ปุ่ม", "OK", "รุ่น X-series: เลือกได้ ✓");

  const r = freshItem("inner_top_stack");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // ชนิดการเปิด
    const ot = ch.querySelector(".o-opentype");
    if (!ot) add(type, "ปุ่ม", "MISS", "ชนิดการเปิด: ไม่มี .o-opentype");
    else add(type, "ปุ่ม", "OK", `ชนิดการเปิด: ${Array.from(ot.options).length-1} ตัวเลือก ✓`);
    // ราง (บน) .o-track
    const ot2 = ch.querySelector(".o-track");
    if (!ot2) add(type, "ปุ่ม", "MISS", "ราง (บน): ไม่มี .o-track (โชว์/ซ่อน)");
    else {
      const trOpts = Array.from(ot2.options).map(o=>o.value);
      if (!trOpts.some(v=>/โชว์/.test(v)) || !trOpts.some(v=>/ซ่อน/.test(v)))
        add(type, "ปุ่ม", "MISS", "ราง (บน): ไม่มีตัวเลือก โชว์ราง/ซ่อนราง");
      else {
        add(type, "ปุ่ม", "OK", "ราง (บน): โชว์ราง/ซ่อนราง ✓");
        const trDef = chipDefault(ch, ".o-track", "");
        if (!trDef || !/โชว์/.test(trDef)) add(type, "default", "MISS", `ราง (บน) default: "${trDef}" (ควร "โชว์ราง")`);
        else add(type, "default", "OK", `ราง (บน) default: "${trDef}" ✓`);
      }
    }
    // ชุดล็อค — default ไม่มี
    checkLock(ch, type);
    const sl = ch.querySelector(".o-slidelock");
    if (sl) {
      const slDef = chipDefault(ch, ".o-slidelock", "");
      if (!slDef || !/ไม่มี/.test(slDef)) add(type, "default", "MISS", `ชุดล็อค default: "${slDef}" (ดราฟ default "ไม่มีชุดล็อก")`);
      else add(type, "default", "OK", `ชุดล็อค default: "${slDef}" ✓`);
    }
    // มือจับ (เลื่อนใน: สแตนอร่าม/ดิจิตอล)
    if (!/สแตนอร่าม|ดิจิตอล/.test(txt)) add(type, "ปุ่ม", "MISS", "มือจับ: ไม่พบ สแตนอร่าม/ดิจิตอล");
    else add(type, "ปุ่ม", "OK", "มือจับ: พบ ✓");
    // z2: คาดตาราง (มุ้งถูกตัดตามดราฟ)
    const mosq = ch.querySelector(".o-mosq");
    if (mosq) add(type, "ปุ่ม", "EXTRA", "มุ้ง: ยังมี .o-mosq (ดราฟเขียน 'ตัด มุ้ง' สำหรับเลื่อนภายใน)");
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    // z3: โครงสร้าง/ราง checkboxes
    if (!/Soft Close|สลิง|ซ่อนคาน|ฝังรางยู|เสริมคาน/.test(txt))
      add(type, "ปุ่ม", "MISS", "z3 โครงสร้างราง: ไม่พบ Soft Close/สลิง/ซ่อนคาน/ฝังรางยู/เสริมคาน");
    else add(type, "ปุ่ม", "OK", "z3 โครงสร้างราง: พบ ✓");
    checkColorBox(ch, type);
    checkFcsides(ch, type);
    checkRemove(ch, type);
    checkExtrawork(ch, type);
    checkSubpanel(ch, type);
  }
}

// ========== #3 บานเปิด ==========
{
  const type = "#3 บานเปิด";
  for (const [id, label] of [
    ["casement_euro","ยูโร"], ["casement_xseries","X-series"],
    ["casement_velora","Velora"], ["casement_flush_solid","โซลิด ทู"],
    ["casement_inset_solid","โซลิด วัน"]
  ]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  const r = freshItem("casement_euro");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // ธรณี (.o-closer หรือ dropdown/chip ธรณี)
    const cl = ch.querySelector(".o-closer");
    if (!cl) add(type, "ปุ่ม", "MISS", "ธรณี: ไม่มี .o-closer");
    else {
      const clOpts = Array.from(cl.options).map(o=>o.value);
      if (clOpts.length < 3) add(type, "ปุ่ม", "MISS", `ธรณี: ${clOpts.length} ตัวเลือก (ควร ≥ 4 ตามดราฟ)`);
      else add(type, "ปุ่ม", "OK", `ธรณี: ${clOpts.length} ตัวเลือก ✓`);
      // default = กันน้ำ (มาตรฐาน)
      const clDef = chipDefault(ch, ".o-closer", "");
      if (!clDef || !/กันน้ำ|มาตรฐาน/.test(clDef)) add(type, "default", "MISS", `ธรณี default: "${clDef}" (ควร กันน้ำ/มาตรฐาน)`);
      else add(type, "default", "OK", `ธรณี default: "${clDef}" ✓`);
    }
    // โช้คอัพประตู — ดราฟมี 4 ตัวเลือก (ไม่มี/แขนยื่น/รางเลื่อน/บานพับ)
    if (!/โช้คอัพ|แขนยื่น|รางเลื่อน/.test(txt)) add(type, "ปุ่ม", "MISS", "โช้คอัพประตู: ไม่พบข้อความ");
    else add(type, "ปุ่ม", "OK", "โช้คอัพประตู: พบ ✓");
    // ชุดล็อค + default
    checkLock(ch, type);
    const lk = ch.querySelector(".o-lock");
    if (lk) {
      const lkDef = chipDefault(ch, ".o-lock", "");
      if (!lkDef || !/กุญแจ/.test(lkDef)) add(type, "default", "MISS", `ชุดล็อค default: "${lkDef}" (ควร มีชุดล็อก + กุญแจ)`);
      else add(type, "default", "OK", `ชุดล็อค default: "${lkDef}" ✓`);
    }
    // มือจับ
    if (!/Cmech|ดิจิตอล|สแตนอร่าม/.test(txt)) add(type, "ปุ่ม", "MISS", "มือจับ: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "มือจับ: พบ ✓");
    // z2
    checkMosq(ch, type);
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    // โซลิด-only: ช่องแสง + ตารางเต็มบาน
    if (!/ช่องแสง|solidlight|o-solidlight/.test(ch.innerHTML)) {
      // เช็คด้วยรุ่นโซลิด
      const rs = freshItem("casement_flush_solid");
      if (rs && rs.found) {
        const sl2 = rs.ch.querySelector(".o-solidlight");
        if (!sl2) add(type, "ปุ่ม", "MISS", "โซลิด: ไม่มี .o-solidlight (ช่องแสง)");
        else add(type, "ปุ่ม", "OK", "โซลิด: มี .o-solidlight ✓");
        const fg = chText(rs.ch);
        if (!/ตารางเต็มบาน|full_grid/.test(fg)) add(type, "ปุ่ม", "MISS", "โซลิด: ไม่พบ ตารางเต็มบาน");
        else add(type, "ปุ่ม", "OK", "โซลิด: ตารางเต็มบาน ✓");
      }
    }
    // z3
    checkColorBox(ch, type);
    checkFcsides(ch, type);
    checkDfm(ch, type);
    checkRemove(ch, type);
    checkExtrawork(ch, type);
    checkRemark(ch, type);
    checkSubpanel(ch, type);
  }
}

// ========== #4 บานกระทุ้ง ==========
{
  const type = "#4 บานกระทุ้ง";
  const r = freshItem("awning_euro");
  if (!r || !r.found) { add(type, "ปุ่ม", "MISS", "awning_euro: เลือกไม่ได้"); }
  else {
    const ch = r.ch;
    const txt = chText(ch);
    add(type, "ปุ่ม", "OK", "รุ่น ยูโร (awning_euro): เลือกได้ ✓");
    // ประเภท ประตู/หน้าต่าง — default หน้าต่าง
    const it = ch.querySelector(".i-type, select[class*='i-type'],.itype-seg select");
    if (!it) add(type, "ปุ่ม", "MISS", "ประเภท: ไม่มี .i-type");
    else {
      const itDef = (it.options[it.selectedIndex]||{}).value;
      if (itDef !== "window") add(type, "default", "MISS", `ประเภท default: "${itDef}" (ดราฟ default หน้าต่าง)`);
      else add(type, "default", "OK", "ประเภท default: หน้าต่าง ✓");
    }
    // แบบเปิด (awn_mode): เปิดล่าง/เปิดข้าง/tilt&turn
    const aw = ch.querySelector(".o-awn_mode");
    if (!aw) add(type, "ปุ่ม", "MISS", "แบบเปิด: ไม่มี .o-awn_mode");
    else {
      const awOpts = Array.from(aw.options).map(o=>o.text);
      if (awOpts.length < 3) add(type, "ปุ่ม", "MISS", `แบบเปิด: ${awOpts.length} ตัวเลือก (ควร 3)`);
      else add(type, "ปุ่ม", "OK", `แบบเปิด: ${awOpts.length} ตัวเลือก ✓`);
      // default เปิดล่าง
      const awDef = (aw.options[aw.selectedIndex]||{}).text || "";
      if (!/เปิดล่าง/.test(awDef)) add(type, "default", "MISS", `แบบเปิด default: "${awDef}" (ควร เปิดล่าง)`);
      else add(type, "default", "OK", `แบบเปิด default: "${awDef}" ✓`);
    }
    // ชุดล็อค + default กุญแจ
    checkLock(ch, type);
    // เสริมแขนค้ำ
    if (!/เสริมแขนค้ำ|awning_brace/.test(txt)) add(type, "ปุ่ม", "MISS", "เสริมแขนค้ำ: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "เสริมแขนค้ำ: พบ ✓");
    // มือจับ (Cmech หลบมุ้ง)
    if (!/Cmech|มือจับ/.test(txt)) add(type, "ปุ่ม", "MISS", "มือจับ: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "มือจับ: พบ ✓");
    // z2/z3
    checkMosq(ch, type);
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    checkColorBox(ch, type);
    checkFcsides(ch, type);
    checkDfm(ch, type);
    checkRemove(ch, type);
    checkExtrawork(ch, type);
    checkSubpanel(ch, type);
  }
}

// ========== #5 บานหมุน ==========
{
  const type = "#5 บานหมุน";
  const r = freshItem("pivot");
  if (!r || !r.found) { add(type, "ปุ่ม", "MISS", "pivot: เลือกไม่ได้"); }
  else {
    const ch = r.ch;
    const txt = chText(ch);
    add(type, "ปุ่ม", "OK", "รุ่น เมืองทอง (pivot): เลือกได้ ✓");
    // ชุดล็อค 3 แบบ
    checkLock(ch, type);
    // มือจับ: ดิจิตอล/สแตนอร่าม (ไม่มี Cmech)
    if (!/ดิจิตอล|สแตนอร่าม/.test(txt)) add(type, "ปุ่ม", "MISS", "มือจับ: ไม่พบ ดิจิตอล/สแตนอร่าม");
    else add(type, "ปุ่ม", "OK", "มือจับ: พบ ✓");
    if (/Cmech/.test(txt)) add(type, "ปุ่ม", "EXTRA", "มือจับ: พบ Cmech (ดราฟตัดออก 'ไม่มี Cmech')");
    // มุ้ง — ดราฟตัด
    const mosq = ch.querySelector(".o-mosq");
    if (mosq) add(type, "ปุ่ม", "EXTRA", "มุ้ง: ยังมี .o-mosq (ดราฟ 'ตัด มุ้ง' สำหรับหมุน)");
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    checkColorBox(ch, type);
    checkFcsides(ch, type);
    checkRemove(ch, type);
    checkExtrawork(ch, type);
    checkSubpanel(ch, type);
  }
}

// ========== #6 บานเฟี้ยม ==========
{
  const type = "#6 บานเฟี้ยม";
  for (const [id, label] of [["folding","เซมิยูโร"], ["folding_euro","ยูโร"], ["folding_xseries","X-series"]]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  const r = freshItem("folding");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // ทิศเปิด
    if (!/เปิดซ้าย|เปิดขวา|แยกกลาง/.test(txt)) add(type, "ปุ่ม", "MISS", "ทิศเปิด: ไม่พบ เปิดซ้าย/เปิดขวา/แยกกลาง");
    else add(type, "ปุ่ม", "OK", "ทิศเปิด: พบ ✓");
    // ธรณีเฟี้ยม
    if (!/กันน้ำ|หลังเต่า|ธรณี/.test(txt)) add(type, "ปุ่ม", "MISS", "ธรณีเฟี้ยม: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "ธรณีเฟี้ยม: พบ ✓");
    // ชุดล็อค + default กุญแจ
    checkLock(ch, type);
    // z2: มุ้ง (X-series ตัด) / คาดตาราง / แผ่นทึบ
    checkMosq(ch, type);
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    // z3: สี / ครอบวงกบ / ซ่อนคาน / ซ่อนราง / ฝังรางยู / เสริมคาน / ดรอปพื้น / ผสมบาน
    checkColorBox(ch, type);
    checkFcsides(ch, type);
    if (!/ซ่อนคาน/.test(txt)) add(type, "ปุ่ม", "MISS", "ซ่อนคาน: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "ซ่อนคาน: พบ ✓");
    if (!/ซ่อนราง/.test(txt)) add(type, "ปุ่ม", "MISS", "ซ่อนราง: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "ซ่อนราง: พบ ✓");
    if (!/ฝังรางยู/.test(txt)) add(type, "ปุ่ม", "MISS", "ฝังรางยู: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "ฝังรางยู: พบ ✓");
    if (!/เสริมคาน/.test(txt)) add(type, "ปุ่ม", "MISS", "เสริมคาน: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "เสริมคาน: พบ ✓");
    checkDfm(ch, type);
    checkSubpanel(ch, type);
  }
}

// ========== #7 กระจกติดตาย ==========
{
  const type = "#7 กระจกติดตาย";
  const r = freshItem("fixed_glass");
  if (!r || !r.found) { add(type, "ปุ่ม", "MISS", "fixed_glass: เลือกไม่ได้"); }
  else {
    const ch = r.ch;
    const txt = chText(ch);
    add(type, "ปุ่ม", "OK", "รุ่นเดียว (fixed_glass): เลือกได้ ✓");
    // ดราฟ: ตัด ชนิดเปิด/ราง/ชุดล็อค/มือจับ/มุ้ง
    if (ch.querySelector(".o-mosq")) add(type, "ปุ่ม", "EXTRA", "มุ้ง: ยังมี .o-mosq (ดราฟตัดออก)");
    if (ch.querySelector(".o-opentype")) add(type, "ปุ่ม", "EXTRA", "ชนิดเปิด: ยังมี .o-opentype (ดราฟตัดออก)");
    if (ch.querySelector(".o-lock,.o-slidelock")) add(type, "ปุ่ม", "EXTRA", "ชุดล็อค: ยังมี (ดราฟตัดออก)");
    // z2: คาดตาราง / แผ่นทึบ
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    // z3: สี/กระจก / ครอบวงกบ / รื้อ / งานเสริม
    checkColorBox(ch, type);
    checkFcsides(ch, type);
    checkRemove(ch, type);
    checkExtrawork(ch, type);
    // ดราฟ: ไม่มีผสมบาน
    if (ch.querySelector(".sub-addbtn")) add(type, "ปุ่ม", "EXTRA", "ผสมบาน: ยังมี .sub-addbtn (ดราฟไม่มี)");
  }
}

// ========== #8 บานเปลือย ==========
{
  const type = "#8 บานเปลือย";
  // ดราฟ: รวม frameless_fixed + frameless_door เป็น 1 ชนิด (เฟส 1)
  // ตรวจว่ายังแยก 2 หรือรวมแล้ว
  const rf = freshItem("frameless_fixed");
  const rd = freshItem("frameless_door");
  if (!rf || !rf.found) add(type, "ปุ่ม", "MISS", "frameless_fixed: เลือกไม่ได้");
  else add(type, "ปุ่ม", "OK", "frameless_fixed: เลือกได้ ✓");
  if (!rd || !rd.found) add(type, "ปุ่ม", "MISS", "frameless_door: เลือกไม่ได้");
  else add(type, "ปุ่ม", "OK", "frameless_door: เลือกได้ ✓");
  // ตรวจ frameless_fixed controls
  if (rf && rf.found) {
    const ch = rf.ch;
    const txt = chText(ch);
    // ดราฟ: ไม่มีครอบวงกบ
    if (ch.querySelector(".o-fcsides")) add(type, "ปุ่ม", "EXTRA", "ครอบวงกบ: ยังมี .o-fcsides (frameless ดราฟไม่มี)");
    // คาดตาราง
    checkGridmark(ch, type);
    // สี/กระจก
    checkColorBox(ch, type);
    checkRemove(ch, type);
  }
  // ตรวจ frameless_door controls
  if (rd && rd.found) {
    const ch = rd.ch;
    const txt = chText(ch);
    // ดราฟ: มือจับสแตนเลส 6 ขนาด (เฟส 4 ยังไม่ทำ)
    if (!/สแตนเลส|stainless/i.test(txt)) add(type, "ปุ่ม", "MISS", "มือจับสแตนเลส: ไม่พบ (เฟส 4 ยังไม่ทำ — รายงานไว้)");
    // ชุดล็อค
    checkLock(ch, type);
  }
}

// ========== #9 ผนัง (ทึบ/ฉนวน) ==========
{
  const type = "#9 ผนัง";
  for (const [id, label] of [["wall_ext","ผนังนอก"], ["wall_int","ผนังใน"], ["isowall","ISOWALL"]]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  const r = freshItem("wall_ext");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // โครง (เหล็กชุบซิงค์/อลูมิเนียม)
    if (!/เหล็กชุบซิงค์|อลูมิเนียม/.test(txt)) add(type, "ปุ่ม", "MISS", "โครง: ไม่พบ เหล็กชุบซิงค์/อลูมิเนียม");
    else add(type, "ปุ่ม", "OK", "โครง: พบ ✓");
    // ความหนา
    if (!/สมาร์ทบอร์ด|ISOWALL/.test(txt)) add(type, "ปุ่ม", "MISS", "ความหนา: ไม่พบ สมาร์ทบอร์ด/ISOWALL");
    else add(type, "ปุ่ม", "OK", "ความหนา: พบ ✓");
    // ทาสี / ฉนวน
    if (!/ทาขาว|รองพื้น|ไม่ทา/.test(txt)) add(type, "ปุ่ม", "MISS", "ทาสี: ไม่พบ ทาขาว/รองพื้น/ไม่ทา");
    else add(type, "ปุ่ม", "OK", "ทาสี: พบ ✓");
    if (!/ฉนวน/.test(txt)) add(type, "ปุ่ม", "MISS", "ฉนวน: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "ฉนวน: พบ ✓");
    // ดราฟ: ไม่มีสี/กระจก / มุ้ง / คาดตาราง / แผ่นทึบ / ผสมบาน
    if (ch.querySelector(".i-color")) add(type, "ปุ่ม", "EXTRA", "สี/กระจก: ยังมี .i-color (ดราฟตัดออก — ผนังไม่มีกระจก)");
    if (ch.querySelector(".o-mosq")) add(type, "ปุ่ม", "EXTRA", "มุ้ง: ยังมี .o-mosq (ดราฟตัดออก)");
    // z3: รื้อ / หมายเหตุ
    checkRemove(ch, type);
    checkRemark(ch, type);
  }
}

// ========== #10 ดัดโค้ง ==========
{
  const type = "#10 ดัดโค้ง";
  for (const [id, label] of [
    ["curved_double","บานคู่"], ["curved_single","บานเดี่ยว"],
    ["curved_fixed","ติดตายโค้ง"], ["curved_slim","สลิม"]
  ]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  const r = freshItem("curved_double");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // ประเภท ประตู/หน้าต่าง — default ประตู
    const it = ch.querySelector(".i-type, .itype-seg select");
    if (!it) add(type, "ปุ่ม", "MISS", "ประเภท: ไม่มี");
    else add(type, "ปุ่ม", "OK", "ประเภท: มี ✓");
    // ชุดล็อค + มือจับ (ดิจิตอล/สแตน · ติดตายโค้ง=ไม่มี)
    checkLock(ch, type);
    if (!/ดิจิตอล|สแตนอร่าม/.test(txt)) add(type, "ปุ่ม", "MISS", "มือจับ: ไม่พบ ดิจิตอล/สแตน");
    else add(type, "ปุ่ม", "OK", "มือจับ: พบ ✓");
    // z2/z3
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    checkColorBox(ch, type);
  }
}

// ========== #11 PC Door ==========
{
  const type = "#11 PC Door";
  for (const [id, label] of [["pc_door_2","2 บาน"], ["pc_door_4","4 บาน"]]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  const r = freshItem("pc_door_2");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // ชุดล็อค 3 แบบ
    checkLock(ch, type);
    // มือจับ ดิจิตอล/สแตน (ไม่มี Cmech)
    if (!/ดิจิตอล|สแตนอร่าม/.test(txt)) add(type, "ปุ่ม", "MISS", "มือจับ: ไม่พบ ดิจิตอล/สแตน");
    else add(type, "ปุ่ม", "OK", "มือจับ: พบ ✓");
    if (/Cmech/.test(txt)) add(type, "ปุ่ม", "EXTRA", "Cmech: พบ (ดราฟ 'ไม่มี Cmech' สำหรับ PC Door)");
    // z2
    checkMosq(ch, type);
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    // z3: สี / ครอบวงกบ / ดรอปพื้น (ดราฟตัด ฝังรางยู)
    checkColorBox(ch, type);
    checkFcsides(ch, type);
    checkDfm(ch, type);
    const bt = ch.querySelector(".o-beam,.o-beamm");
    if (bt) add(type, "ปุ่ม", "EXTRA", "ฝังรางยู/เสริมคาน: ยังมี (ดราฟตัดออก)");
  }
}

// ========== #12 YKK ==========
{
  const type = "#12 YKK";
  for (const [id, label] of [["ykk_vent","Ventilation"], ["ykk_exhido","Exhido"], ["tostem_a01","Tostem A01"]]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  const r = freshItem("ykk_vent");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // โช้คอัพ (ไม่มี/มี +5,000)
    if (ch.querySelector(".o-closer")) add(type, "ปุ่ม", "OK", "โช้คอัพ: มี .o-closer ✓");
    // ดราฟ: ตัด สี/กระจก / ล็อค / มุ้ง / คาดตาราง / ทึบ / ผสมบาน
    if (ch.querySelector(".i-color")) add(type, "ปุ่ม", "EXTRA", "สี/กระจก: ยังมี .i-color (ดราฟตัดออก — YKK ไม่มี L1-L3)");
    if (ch.querySelector(".o-mosq")) add(type, "ปุ่ม", "EXTRA", "มุ้ง: ยังมี .o-mosq (ดราฟตัดออก)");
    if (ch.querySelector(".o-lock,.o-slidelock")) add(type, "ปุ่ม", "EXTRA", "ชุดล็อค: ยังมี (ดราฟตัดออก)");
    // z3: ครอบวงกบ / ดรอปพื้น / รื้อ
    checkFcsides(ch, type);
    checkDfm(ch, type);
    checkRemove(ch, type);
  }
}

// ========== #13 บานยก ==========
{
  const type = "#13 บานยก";
  for (const [id, label] of [["lift_sms","SMS สลิม"], ["lift_aluinch","เซมิยูโร"]]) {
    const r = freshItem(id);
    if (!r || !r.found) add(type, "ปุ่ม", "MISS", `รุ่น ${label} (${id}): เลือกไม่ได้`);
    else add(type, "ปุ่ม", "OK", `รุ่น ${label} (${id}): เลือกได้ ✓`);
  }
  const r = freshItem("lift_sms");
  if (r && r.found) {
    const ch = r.ch;
    const txt = chText(ch);
    // ลักษณะการยก (.o-liftmode)
    const lm = ch.querySelector(".o-liftmode");
    if (!lm) add(type, "ปุ่ม", "MISS", "ลักษณะการยก: ไม่มี .o-liftmode");
    else {
      const lmOpts = Array.from(lm.options).map(o=>o.text);
      if (!lmOpts.some(t=>/ยกบานบน$/.test(t)) || !lmOpts.some(t=>/สลับ/.test(t)))
        add(type, "ปุ่ม", "MISS", `ลักษณะการยก: ตัวเลือกไม่ตรง (${lmOpts.join("/")})`);
      else add(type, "ปุ่ม", "OK", "ลักษณะการยก: 2 ตัวเลือก ✓");
      // default = ยกบานบน
      const lmDef = (lm.options[lm.selectedIndex]||{}).value || "";
      if (lmDef !== "top") add(type, "default", "MISS", `ลักษณะการยก default: "${lmDef}" (ควร top/ยกบานบน)`);
      else add(type, "default", "OK", "ลักษณะการยก default: top (ยกบานบน) ✓");
    }
    // มอเตอร์ (.o-motor)
    const mo = ch.querySelector(".o-motor");
    if (!mo) add(type, "ปุ่ม", "MISS", "มอเตอร์: ไม่มี .o-motor");
    else {
      const moOpts = Array.from(mo.options).map(o=>o.value);
      if (!moOpts.includes("0") || !moOpts.includes("80") || !moOpts.includes("300"))
        add(type, "ปุ่ม", "MISS", "มอเตอร์: ตัวเลือกไม่ครบ (0/80/300)");
      else add(type, "ปุ่ม", "OK", "มอเตอร์: 3 ตัวเลือก ✓");
    }
    // ชุดล็อค
    checkLock(ch, type);
    // มุ้ง / คาดตาราง / แผ่นทึบ
    checkMosq(ch, type);
    checkGridmark(ch, type);
    checkSolidLower(ch, type);
    // สี/กระจก
    checkColorBox(ch, type);
    // ดราฟตัด ฝังรางยู
    if (/ฝังรางยู/.test(txt)) add(type, "ปุ่ม", "EXTRA", "ฝังรางยู: ยังมี (ดราฟตัดออก)");
  }
}

// ========== #14 shower ==========
{
  const type = "#14 shower";
  const r = freshItem("shower");
  if (!r || !r.found) { add(type, "ปุ่ม", "MISS", "shower: เลือกไม่ได้"); }
  else {
    const ch = r.ch;
    const txt = chText(ch);
    add(type, "ปุ่ม", "OK", "shower: เลือกได้ ✓");
    // รูปแบบ shower (ประตู+ติดตาย/ติดตายอย่างเดียว/ประตูอย่างเดียว)
    // จริงๆ ดราฟใหม่ใช้ชิป — ตรวจข้อความ
    if (!/ประตู.*ติดตาย|ติดตายอย่างเดียว/.test(txt)) add(type, "ปุ่ม", "MISS", "รูปแบบ shower: ไม่พบ (ประตู+ติดตาย/ติดตายอย่างเดียว)");
    else add(type, "ปุ่ม", "OK", "รูปแบบ shower: พบ ✓");
    // ประเภทประตู (บานเปิด/บานเลื่อน)
    if (!/บานเปิด.*บานเลื่อน|บานเลื่อน/.test(txt)) add(type, "ปุ่ม", "MISS", "ประเภทประตู: ไม่พบ บานเปิด/บานเลื่อน");
    else add(type, "ปุ่ม", "OK", "ประเภทประตู: พบ ✓");
    // อุปกรณ์สี (.o-showerhw) — เงิน/ดำ/ทอง
    const shw = ch.querySelector(".o-showerhw");
    if (!shw) add(type, "ปุ่ม", "MISS", "อุปกรณ์สี: ไม่มี .o-showerhw");
    else {
      const shOpts = Array.from(shw.options).map(o=>o.text);
      const hasGold = shOpts.some(t=>/ทอง/.test(t));
      const hasBlack = shOpts.some(t=>/ดำ/.test(t));
      if (!hasGold || !hasBlack) add(type, "ปุ่ม", "MISS", `อุปกรณ์สี: ตัวเลือกไม่ครบ (ดำ=${hasBlack} ทอง=${hasGold})`);
      else add(type, "ปุ่ม", "OK", "อุปกรณ์สี: เงิน/ดำ/ทอง ✓");
      // default เงิน
      const shDef = (shw.options[shw.selectedIndex]||{}).text||"";
      if (!/เงิน/.test(shDef)) add(type, "default", "MISS", `อุปกรณ์สี default: "${shDef}" (ควร เงิน)`);
      else add(type, "default", "OK", `อุปกรณ์สี default: "${shDef}" ✓`);
    }
    // เข้ามุม (.o-corner หรือ checkbox)
    if (!ch.querySelector(".o-corner") && !/เข้ามุม/.test(txt)) add(type, "ปุ่ม", "MISS", "เข้ามุม: ไม่พบ");
    else add(type, "ปุ่ม", "OK", "เข้ามุม: พบ ✓");
    // z3: สี/กระจก / รื้อ
    checkColorBox(ch, type);
    checkRemove(ch, type);
    // ดราฟตัด: ประเภท(ซ้ำ) / มุ้ง / คาด / ทึบ / ผสมบาน
    if (ch.querySelector(".o-mosq")) add(type, "ปุ่ม", "EXTRA", "มุ้ง: ยังมี .o-mosq (ดราฟตัดออก)");
    if (ch.querySelector(".sub-addbtn")) add(type, "ปุ่ม", "EXTRA", "ผสมบาน: ยังมี (ดราฟตัดออก)");
  }
}

// ===== สรุป =====
const miss  = RESULTS.filter(r=>r.status==="MISS");
const extra = RESULTS.filter(r=>r.status==="EXTRA");
const ok    = RESULTS.filter(r=>r.status==="OK");

console.log(`\n=== ตรวจ G1 vs ดราฟเกณฑ์ 22 มิ.ย. ===`);
console.log(`MISS(ขาด): ${miss.length}  EXTRA(เกิน): ${extra.length}  OK: ${ok.length}\n`);

if (miss.length) {
  console.log("--- MISS (เกณฑ์มี เว็บไม่มี) ---");
  for (const r of miss) console.log(`  [${r.type}][${r.dim}] ${r.detail}`);
}
if (extra.length) {
  console.log("\n--- EXTRA (เว็บมี เกณฑ์ไม่มี / ดราฟตัด) ---");
  for (const r of extra) console.log(`  [${r.type}][${r.dim}] ${r.detail}`);
}
if (ok.length && process.argv.includes("--verbose")) {
  console.log("\n--- OK ---");
  for (const r of ok) console.log(`  [${r.type}][${r.dim}] ${r.detail}`);
}
console.log(`\n[summary] MISS=${miss.length} EXTRA=${extra.length} OK=${ok.length}`);
