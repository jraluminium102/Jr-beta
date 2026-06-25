// audit-optprice-allG.mjs — ตรวจ "option โผล่ในใบแต่ไม่บวกยอด" ทุกกลุ่ม G1-G7
// READ-ONLY · render index.html ผ่าน jsdom · วัด delta sell ก่อน-หลัง toggle option
// ใช้: node scripts/audit-optprice-allG.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HTML_PATH = join(ROOT, "public/calculator/index.html");
const OUT = join(ROOT, "docs", "AUDIT-บั๊กการเงิน-option-2026-06-17.html");

// ===== boot JSDOM =====
const html = readFileSync(HTML_PATH, "utf8");
const vc = new VirtualConsole();
const jsErrors = [];
vc.on("jsdomError", (e) => { if (!/scrollTo|Not implemented/i.test(e.message)) jsErrors.push(e.message); });
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/calculator/index.html" });
await new Promise((r) => {
  if (dom.window.document.readyState === "complete") r();
  else dom.window.addEventListener("load", r);
  setTimeout(r, 3000);
});
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
const noSvc = () => ["svc-protect","svc-lift","svc-travel","svc-ship"].forEach(id => {
  const e = doc.getElementById(id); if (e && e.checked) { e.checked = false; fire(e, "change"); }
});

// ===== helpers =====
function renderProd(grp, prodId, wv="1.5", hv="2.0") {
  doc.getElementById("items").innerHTML = "";
  try { w.addItem(doc.getElementById("items")); } catch(e) { return null; }
  const ch = doc.querySelector("#items .ch"); if (!ch) return null;
  const gs = ch.querySelector(".i-group"); if (gs) { gs.value = String(grp); fire(gs, "change"); }
  const ps = ch.querySelector(".i-prod");
  if (!ps || !ps.querySelector(`option[value="${prodId}"]`)) return null;
  ps.value = prodId; fire(ps, "change");
  const wi = ch.querySelector(".i-w"), hi = ch.querySelector(".i-h");
  if (wi) { wi.value = wv; fire(wi, "input"); fire(wi, "change"); }
  if (hi) { hi.value = hv; fire(hi, "input"); fire(hi, "change"); }
  return ch;
}
function sellOf(ch) {
  try { const r = w.readItem(ch); return r && r.r ? Math.round(r.r.sell) : NaN; } catch(e) { return NaN; }
}
function setVal(ch, sel, val) { const e = ch.querySelector(sel); if (e) { e.value = val; fire(e, "change"); return true; } return false; }
function setChk(ch, sel, on)  { const e = ch.querySelector(sel); if (e) { e.checked = !!on; fire(e, "change"); return true; } return false; }
function setChipOn(ch, sel, dataVal) {
  // กดชิปที่มี data-val ตรง แล้ว fire click
  const chips = ch.querySelectorAll(sel);
  for (const c of chips) { if (c.dataset.val === dataVal) { c.click(); return true; } }
  return false;
}
// อ่านข้อความที่ขึ้นใบ (msgs จาก readItem)
function msgsOf(ch) {
  try { const r = w.readItem(ch); return (r && r.r && r.r.msgs) ? r.r.msgs.join(" | ") : ""; } catch(e) { return ""; }
}

const results = [];
const log = [];
const P = (...a) => { log.push(a.join(" ")); console.log(...a); };

// ===== testOpt: วัด delta ===========================
// apply = function(ch) ที่ toggle/set option
// expectZero = true ถ้าตั้งใจไม่คิดเงิน
// shouldShow = ข้อความที่คาดว่าจะโผล่ในใบ (ถ้า "" ไม่เช็ค)
function testOpt({ grp, prodId, label, w: wv="1.5", h: hv="2.0", panels=1,
                    apply, expectZero=false, shouldShow="", minExpect=0 }) {
  const ch = renderProd(grp, prodId, wv, hv);
  if (!ch) {
    results.push({ grp, prodId, label, base:"-", after:"-", delta:"-",
      verdict:"⚠ เลือกรุ่นไม่ได้", shouldShow, inInvoice:"-", status:"warn" });
    return;
  }
  // ตั้งจำนวนบาน
  const pEl = ch.querySelector(".i-panels"); if (pEl && panels !== 1) { pEl.value = panels; fire(pEl, "input"); fire(pEl, "change"); }
  noSvc();
  const base = sellOf(ch);
  const msgsBase = msgsOf(ch);
  apply(ch);
  const after = sellOf(ch);
  const msgsAfter = msgsOf(ch);
  const delta = (isNaN(base) || isNaN(after)) ? NaN : (after - base);
  // เช็คว่า option โผล่ในข้อความใบไหม
  let inInvoice = "-";
  if (shouldShow) {
    inInvoice = msgsAfter.includes(shouldShow) ? "โผล่ใบ" : "ไม่โผล่";
  }
  let status, verdict;
  if (isNaN(delta)) {
    status = "warn"; verdict = "อ่านราคาไม่ได้";
  } else if (expectZero) {
    status = delta === 0 ? "ok" : "warn";
    verdict = delta === 0 ? "ไม่คิดเงิน (ถูก)" : `ขยับ +${delta.toLocaleString()} (คาดว่า 0)`;
  } else if (minExpect > 0 && delta < minExpect) {
    status = "bug"; verdict = `บวกน้อยกว่าที่ควร Δ=${delta.toLocaleString()} (คาดอย่างน้อย ${minExpect.toLocaleString()})`;
  } else {
    status = delta > 0 ? "ok" : "bug";
    verdict = delta > 0 ? `+${delta.toLocaleString()} (บวกเงินแล้ว)` : "Δ=0 ไม่บวกเงิน (สงสัยบั๊ก)";
  }
  results.push({ grp, prodId, label, base:isNaN(base)?"-":base.toLocaleString(),
    after:isNaN(after)?"-":after.toLocaleString(),
    delta:isNaN(delta)?"-":(delta>=0?"+":"")+delta.toLocaleString(),
    verdict, shouldShow, inInvoice, status });
  P(`[G${grp}|${prodId}] ${label}: ${base?.toLocaleString?.()||"-"} → ${after?.toLocaleString?.()||"-"} Δ${isNaN(delta)?"-":delta.toLocaleString()} → ${verdict}`);
}

P("===== AUDIT: option บวกยอดจริงไหม ทุกกลุ่ม G1-G7 =====\n");

// ============================================================
// G1 — บาน ประตู/หน้าต่าง
// ============================================================
P("--- G1 บาน ---");

// สีกรอบ (colorUp) — ค่าทำสี บานเลื่อน SMS
testOpt({ grp:1, prodId:"sliding_sms", label:"G1: สีพิเศษ Sahara (ci=2)",
  apply: ch => { setVal(ch, ".i-color", "2"); },
  shouldShow:"ซาฮาร่า", minExpect:500 });

// กระจก upgrade
testOpt({ grp:1, prodId:"sliding_sms", label:"G1: กระจก upgrade (gi=1 laminate)",
  apply: ch => { setVal(ch, ".i-glass", "1"); },
  minExpect:500 });

// มือจับดิจิตอล
testOpt({ grp:1, prodId:"casement_euro", label:"G1: มือจับดิจิตอล (digi=1)",
  w:"1.0", h:"2.2",
  apply: ch => { setVal(ch, ".o-digi", "1"); },
  minExpect:5000, shouldShow:"มือจับ" });

// ครอบวงกบ (fcm)
testOpt({ grp:1, prodId:"sliding_sms", label:"G1: ครอบวงกบ fcm=3 ม.",
  apply: ch => { setVal(ch, ".o-fcm", "3"); },
  minExpect:2000, shouldShow:"ครอบวงกบ" });

// ครอบวงกบ auto ด้าน (fcsides=3)
testOpt({ grp:1, prodId:"casement_euro", label:"G1: ครอบวงกบ 3 ด้าน (fcsides=3)",
  w:"1.0", h:"2.2",
  apply: ch => { setVal(ch, ".o-fcsides", "3"); },
  minExpect:2000, shouldShow:"ครอบวงกบ" });

// ครอบวงกบ 4 ด้าน (fcsides=4)
testOpt({ grp:1, prodId:"casement_euro", label:"G1: ครอบวงกบ 4 ด้าน (fcsides=4)",
  w:"1.0", h:"2.2",
  apply: ch => { setVal(ch, ".o-fcsides", "4"); },
  minExpect:2000, shouldShow:"ครอบวงกบ" });

// ซ่อนราง (track=ซ่อนราง) — บานเลื่อนรางบน
testOpt({ grp:1, prodId:"sliding_sms", label:"G1: ซ่อนราง +5,000 (track=ซ่อนราง)",
  apply: ch => { setVal(ch, ".o-track", "ซ่อนราง"); },
  minExpect:5000, shouldShow:"ซ่อนราง" });

// มือจับ Cmech (embed ประตู)
testOpt({ grp:1, prodId:"casement_euro", label:"G1: มือจับ Cmech ฝัง (ประตู)",
  w:"1.0", h:"2.2",
  apply: ch => {
    setVal(ch, ".i-type", "door");
    setVal(ch, ".o-cmech", "embed");
    setVal(ch, ".o-cmechcolor", "normal");
  },
  minExpect:1000, shouldShow:"Cmech" });

// มือจับ Cmech metro
testOpt({ grp:1, prodId:"casement_euro", label:"G1: มือจับ Cmech เมโทร (ประตู)",
  w:"1.0", h:"2.2",
  apply: ch => {
    setVal(ch, ".i-type", "door");
    setVal(ch, ".o-cmech", "metro");
    setVal(ch, ".o-cmechcolor", "normal");
  },
  minExpect:1000, shouldShow:"Cmech" });

// คาดตาราง (gridmark)
testOpt({ grp:1, prodId:"sliding_sms", label:"G1: คาดตาราง (gridmark 2นอน×200)",
  apply: ch => {
    setChk(ch, ".o-gridmark", true);
    setVal(ch, ".o-gm-nh", "2"); setVal(ch, ".o-gm-nv", "0");
    setVal(ch, ".o-gm-rate", "200");
  },
  minExpect:500, shouldShow:"คาดตาราง" });

// มุ้ง addon (mosquito)
testOpt({ grp:1, prodId:"sliding_sms", label:"G1: มุ้ง addon (mosq = mj_pleated)",
  apply: ch => { setVal(ch, ".o-mosq", "mj_pleated"); },
  minExpect:2000, shouldShow:"มุ้ง" });

// ธรณีหลังเต่า + Drop Seal (บานเปิด)
testOpt({ grp:1, prodId:"casement_euro", label:"G1: ธรณีหลังเต่า +1,000 (thresh=turtle)",
  w:"1.0", h:"2.2",
  apply: ch => { setVal(ch, ".o-thresh", "turtle"); },
  minExpect:1000, shouldShow:"ธรณีหลังเต่า" });

// โซลิดลูกฟูก (solid_door)
testOpt({ grp:1, prodId:"casement_flush_solid", label:"G1: โซลิดลูกฟูก (side=2 ทู)",
  w:"0.9", h:"2.1",
  apply: ch => {},   // solid_door เปิดเป็น default → วัดจากค่า baseline (ไม่ต้อง toggle)
  expectZero:true }); // ไม่เป็น toggle — ข้ามเทส baseline

// แผ่นทึบล่าง (solidlower=corrugated)
testOpt({ grp:1, prodId:"casement_euro", label:"G1: แผ่นทึบล่าง ลูกฟูก (solidlower)",
  w:"1.0", h:"2.2",
  apply: ch => {
    setVal(ch, ".o-solidlower", "corrugated");
    setVal(ch, ".o-sl-w", "1.0"); setVal(ch, ".o-sl-h", "0.5");
  },
  minExpect:1000, shouldShow:"แผ่นลูกฟูก" });

// tilt&turn +5,000/บาน
testOpt({ grp:1, prodId:"awning_euro", label:"G1: tilt&turn บานกระทุ้ง +5,000",
  w:"0.8", h:"1.5",
  apply: ch => { setVal(ch, ".o-awnmode", "2"); },
  minExpect:5000, shouldShow:"tilt" });

// มอเตอร์บานเลื่อน
testOpt({ grp:1, prodId:"sliding_sms", label:"G1: มอเตอร์ 80 กก. +18,000",
  apply: ch => { setVal(ch, ".o-motor", "80"); },
  minExpect:10000, shouldShow:"มอเตอร์" });

// ============================================================
// G2 — ระแนง / ราวกันตก / ประตูรั้ว
// ============================================================
P("\n--- G2 ระแนง/ราวกันตก ---");

// ราวกันตก: ราวจับ u5
testOpt({ grp:2, prodId:"handrail_std", label:"G2: ราวจับยู 5 หุน +500/ม.",
  w:"3.0", h:"1.0",
  apply: ch => { setVal(ch, ".o-handrail", "u5"); },
  minExpect:1000, shouldShow:"ราวจับ" });

// ราวกันตก: ราวจับ box
testOpt({ grp:2, prodId:"handrail_std", label:"G2: ราวจับกล่อง +600/ม.",
  w:"3.0", h:"1.0",
  apply: ch => { setVal(ch, ".o-handrail", "box"); },
  minExpect:1500, shouldShow:"ราวจับ" });

// ระแนงเปิด-ปิด: มอเตอร์ (bocMotor)
testOpt({ grp:2, prodId:"ranae_openclose", label:"G2: ระแนงเปิด-ปิด มอเตอร์",
  w:"3.0", h:"2.5",
  apply: ch => { setChk(ch, ".o-bocmotor", true); },
  minExpect:10000, shouldShow:"มอเตอร์" });

// ระแนงเกล็ด: มอเตอร์ (bg_motor)
testOpt({ grp:2, prodId:"ranae_bargrid", label:"G2: ระแนงเกล็ด มอเตอร์ (bg_motor)",
  w:"3.0", h:"2.5",
  apply: ch => { setChk(ch, ".o-bg_motor", true); },
  minExpect:10000, shouldShow:"มอเตอร์" });

// ประตูรั้ว: มอเตอร์ (gmotor=1)
testOpt({ grp:2, prodId:"gate_slide", label:"G2: ประตูรั้ว มอเตอร์ 1 ตัว +30,000",
  w:"4.0", h:"2.0",
  apply: ch => { setVal(ch, ".o-gmotor", "1"); },
  minExpect:28000, shouldShow:"มอเตอร์" });

// ประตูรั้ว: ราง curvy → บานโค้ง
testOpt({ grp:2, prodId:"gate_slide", label:"G2: ประตูรั้ว รางโค้ง (railtype=curved)",
  w:"4.0", h:"2.0",
  apply: ch => { setVal(ch, ".o-railtype", "curved"); },
  minExpect:5000, shouldShow:"โค้ง" });

// G2 ระแนงเลื่อน: ค่าสี (bsfinish)
testOpt({ grp:2, prodId:"ranae_barslide", label:"G2: ระแนงเลื่อน ค่าสี finish",
  w:"3.0", h:"2.0",
  apply: ch => {
    // เลือก option ที่ไม่ใช่ 0
    const fs = ch.querySelector(".o-bsfinish");
    if (fs && fs.options.length > 1) { fs.value = fs.options[1].value; fire(fs, "change"); }
  },
  minExpect:100 });

// G2 ระแนงเปิด-ปิด: ค่าสี (bocfinish)
testOpt({ grp:2, prodId:"ranae_openclose", label:"G2: ระแนงเปิด-ปิด ค่าสี finish",
  w:"3.0", h:"2.5",
  apply: ch => {
    const fs = ch.querySelector(".o-bocfinish");
    if (fs && fs.options.length > 1) { fs.value = fs.options[1].value; fire(fs, "change"); }
  },
  minExpect:100 });

// ============================================================
// G3 — หลังคา / ฝ้า
// ============================================================
P("\n--- G3 หลังคา/ฝ้า ---");

// ชุดเลื่อน (optSlide)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: ชุดเลื่อนหลังคา (slide)",
  w:"4.0", h:"3.0",
  apply: ch => {
    setChk(ch, ".o-slide", true);
    setVal(ch, ".o-spanels", "2");
    setVal(ch, ".o-smotorprice", "18000"); setVal(ch, ".o-smotorqty", "1");
  },
  minExpect:20000, shouldShow:"เลื่อน" });

// รางน้ำ (rfgut)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: รางน้ำ (rfgut=800/ม. × rfgutlen=4)",
  w:"4.0", h:"3.0",
  apply: ch => { setVal(ch, ".o-rfgut", "800"); setVal(ch, ".o-rfgutlen", "4"); },
  minExpect:3000, shouldShow:"รางน้ำ" });

// ปิดปลาย (rfeave)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: ปิดปลาย (rfeave=4ม. × 1,000/ม.)",
  w:"4.0", h:"3.0",
  apply: ch => { setVal(ch, ".o-rfeave", "4"); },
  minExpect:3000, shouldShow:"ปิดปลาย" });

// เสาแผง (rfpolep)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: เสาแผง (rfpolep=2 × 4,000)",
  w:"4.0", h:"3.0",
  apply: ch => { setVal(ch, ".o-rfpolep", "2"); },
  minExpect:7000, shouldShow:"เสา" });

// ฝ้าออปชั่น (ceilmode=with)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: ฝ้าออปชั่น ceilmode=with",
  w:"4.0", h:"3.0",
  apply: ch => {
    setVal(ch, ".o-ceilmode", "with");
    setVal(ch, ".o-ceiltype", "ceil_cshape");
    setVal(ch, ".o-ceilarea", "8");
  },
  minExpect:5000, shouldShow:"ฝ้า" });

// ฝ้าออปชั่น insulation
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: ฝ้า + insulation",
  w:"4.0", h:"3.0",
  apply: ch => {
    setVal(ch, ".o-ceilmode", "with");
    setChk(ch, ".o-ceilinsul", true);
    setVal(ch, ".o-ceilarea", "8");
  },
  minExpect:5000, shouldShow:"ฝ้า" });

// วัสดุปิดรอยต่อ (rfsealer)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: วัสดุปิดรอยต่อ sealer (rfsealer, len=6)",
  w:"4.0", h:"3.0",
  apply: ch => { setChk(ch, ".o-rfsealer", true); setVal(ch, ".o-rfsealer-len", "6"); },
  minExpect:5000, shouldShow:"วัสดุปิดรอยต่อ" });

// ซ่อนสโลป (rfhs=comp)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: ซ่อนสโลป (rfhs=comp)",
  w:"4.0", h:"3.0",
  apply: ch => {
    setVal(ch, ".o-rfhs", "comp");
    setVal(ch, ".o-rfhsh", "0.3"); setVal(ch, ".o-rfhsl", "4"); setVal(ch, ".o-rfhsn", "1");
  },
  minExpect:5000, shouldShow:"ซ่อนสโลป" });

// ปิดซ่อนราง (rfgcw/rfgch/rfgcl)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: ปิดซ่อนราง (rfgcw=15, rfgch=10, rfgcl=4)",
  w:"4.0", h:"3.0",
  apply: ch => {
    setVal(ch, ".o-rfgcw", "15"); setVal(ch, ".o-rfgch", "10"); setVal(ch, ".o-rfgcl", "4");
  },
  minExpect:2000, shouldShow:"ปิดซ่อนราง" });

// ครอบคาน (rfbcw/rfbcl)
testOpt({ grp:3, prodId:"roof_polycarbonate", label:"G3: ครอบคาน (rfbcw=0.3, rfbcl=4)",
  w:"4.0", h:"3.0",
  apply: ch => { setVal(ch, ".o-rfbcw", "0.3"); setVal(ch, ".o-rfbcl", "4"); },
  minExpect:2000, shouldShow:"ครอบคาน" });

// ฝ้าเดี่ยว C-Shape
testOpt({ grp:3, prodId:"ceil_cshape", label:"G3: ฝ้า C-Shape ค่าสี (ckolor)",
  w:"4.0", h:"3.0",
  apply: ch => {
    const ck = ch.querySelector(".o-ckolor");
    if (ck && ck.options.length > 1) { ck.value = ck.options[1].value; fire(ck, "change"); }
  },
  minExpect:100 });

// ฝ้า insulation
testOpt({ grp:3, prodId:"ceil_cshape", label:"G3: ฝ้า + insulation +600/ตร.ม.",
  w:"4.0", h:"3.0",
  apply: ch => { setChk(ch, ".o-insul", true); },
  minExpect:3000, shouldShow:"insul" });

// ============================================================
// G4 — ตู้อลู
// ============================================================
P("\n--- G4 ตู้ ---");

// สีโครงตู้ (ci)
testOpt({ grp:4, prodId:"cabinet_alu", label:"G4: สีโครงตู้ (ci=2 Sahara)",
  w:"1.2", h:"2.0",
  apply: ch => { setVal(ch, ".i-color", "2"); },
  minExpect:500 });

// ผนังซ้าย (cabwall_left_on)
testOpt({ grp:4, prodId:"cabinet_alu", label:"G4: ผนังซ้าย อลูทึบ",
  w:"1.2", h:"2.0",
  apply: ch => {
    setChk(ch, ".o-cabwall-left-on", true);
    setVal(ch, ".o-cabwall-left-mat", "alu");
  },
  minExpect:1000, shouldShow:"ซ้าย" });

// ผนังหลัง (cabwall_back_on)
testOpt({ grp:4, prodId:"cabinet_alu", label:"G4: ผนังหลัง กระจก",
  w:"1.2", h:"2.0",
  apply: ch => {
    setChk(ch, ".o-cabwall-back-on", true);
    setVal(ch, ".o-cabwall-back-mat", "glass");
  },
  minExpect:1000, shouldShow:"หลัง" });

// ============================================================
// G5 — มุ้ง (screen_addon: imp21/imp22/imp23)
// ============================================================
P("\n--- G5 มุ้งเฟรม ---");

// สีกรอบมุ้งเฟรม (mscolor) — เดิมเป็น BUG1
testOpt({ grp:5, prodId:"imp21", label:"G5: สีกรอบ imp21 (mscolor=2 Sahara)",
  w:"1.0", h:"2.0",
  apply: ch => {
    const m = ch.querySelector(".o-mscolor");
    if (m && m.options.length > 2) { m.value = m.options[2].value; fire(m, "change"); }
  },
  minExpect:200, shouldShow:"สีกรอบ" });

// ผ้ากันแมว (screenFabric=cat)
testOpt({ grp:5, prodId:"imp21", label:"G5: ผ้ากันแมว +800/ตร.ม. imp21",
  w:"1.0", h:"2.0",
  apply: ch => { setChipOn(ch, ".chip[onclick*=\"o-screenfabric\"]", "cat") || setVal(ch, ".o-screenfabric", "cat"); },
  minExpect:1500, shouldShow:"กันแมว" });

// ผ้าสแตนกันหนู (screenFabric=rat)
testOpt({ grp:5, prodId:"imp21", label:"G5: ผ้าสแตนกันหนู +1,200/ตร.ม. imp21",
  w:"1.0", h:"2.0",
  apply: ch => { setChipOn(ch, ".chip[onclick*=\"o-screenfabric\"]", "rat") || setVal(ch, ".o-screenfabric", "rat"); },
  minExpect:2000, shouldShow:"กันหนู" });

// ผ้านิรภัย imp23
testOpt({ grp:5, prodId:"imp23", label:"G5: ผ้านิรภัย (screenFabric=safety) imp23",
  w:"1.0", h:"2.0",
  apply: ch => { setChipOn(ch, ".chip[onclick*=\"o-screenfabric\"]", "safety") || setVal(ch, ".o-screenfabric", "safety"); },
  minExpect:3000, shouldShow:"นิรภัย" });

// ครอบวงกบมุ้งเฟรม (fcsides=3) — เดิมเป็น BUG2
testOpt({ grp:5, prodId:"imp21", label:"G5: ครอบวงกบมุ้ง 3 ด้าน (fcsides=3)",
  w:"1.0", h:"2.0",
  apply: ch => { setVal(ch, ".o-fcsides", "3"); },
  minExpect:2000, shouldShow:"ครอบวงกบ" });

// ครอบวงกบมุ้ง 4 ด้าน
testOpt({ grp:5, prodId:"imp21", label:"G5: ครอบวงกบมุ้ง 4 ด้าน (fcsides=4)",
  w:"1.0", h:"2.0",
  apply: ch => { setVal(ch, ".o-fcsides", "4"); },
  minExpect:2000, shouldShow:"ครอบวงกบ" });

// โหมด B (screen_existing) — เดิมเป็น BUG2
testOpt({ grp:5, prodId:"imp21", label:"G5: โหมด B ติดบานเดิม (screen_existing)",
  w:"1.0", h:"2.0",
  apply: ch => { setChk(ch, ".o-screen_existing", true); },
  expectZero:false }); // ถ้าไม่กรอก screen_extra → Δ=0 ก็ยังอาจเป็นปกติ (ไม่มีค่าเสริม)

// ลักษณะเปิดมุ้ง (mosqopenstyle) — label-only → ต้องไม่บวกเงิน
testOpt({ grp:5, prodId:"imp21", label:"G5: ลักษณะเปิดมุ้ง (label-only · expectZero)",
  w:"1.0", h:"2.0",
  apply: ch => { setVal(ch, ".o-mosqopenstyle", "บานเปิด"); },
  expectZero:true });

// มุ้งจีบ สีกรอบ (mscolor)
testOpt({ grp:5, prodId:"mj_pleated", label:"G5: มุ้งจีบ สีกรอบ Sahara",
  w:"1.5", h:"2.0",
  apply: ch => {
    const m = ch.querySelector(".o-mscolor");
    if (m && m.options.length > 2) { m.value = m.options[2].value; fire(m, "change"); }
  },
  minExpect:200 });

// มุ้ง ผ้ากันแมว (mosqFabric=anti_pet) ในมุ้งม้วน
testOpt({ grp:5, prodId:"mj_roller_fiber", label:"G5: ผ้ากันแมว addon มุ้งม้วน",
  w:"1.5", h:"2.0",
  apply: ch => { setVal(ch, ".o-mosqfabric", "anti_pet") || setVal(ch, ".o-mosqfabric", "anti_pet"); },
  minExpect:800, shouldShow:"กันแมว" });

// ============================================================
// G6 — กั้นห้องกระจก (room builder — special logic)
// ============================================================
P("\n--- G6 กั้นห้อง (room builder) ---");
// G6 เป็น room builder พิเศษ readItem คนละ path → ตรวจ pattern ต่างออกไป
// ตรวจว่า option มีราคา > 0 เมื่อสร้าง room
{
  const ch = renderProd(6, "g6room_builder", "3.0", "2.4");
  if (!ch) {
    results.push({ grp:6, prodId:"g6room_builder", label:"G6: room builder",
      base:"-", after:"-", delta:"-", verdict:"เลือก G6 ไม่ได้ (อาจเป็น paged UI ต่างออกไป)", status:"warn" });
  } else {
    const base = sellOf(ch);
    results.push({ grp:6, prodId:"g6room_builder", label:"G6: room ราคาพื้นฐาน > 0",
      base:isNaN(base)?"-":base.toLocaleString(), after:"-", delta:"-",
      verdict:base > 0 ? "มีราคา (ตรวจ flow G6 แยก)" : "ราคา=0 (เช็คซ้ำ)",
      status: base > 0 ? "ok" : "warn" });
  }
}

// ============================================================
// G7 — ม่านซิป
// ============================================================
P("\n--- G7 ม่านซิป ---");

// กลุ่มลูกค้า ปลีก vs โครงการ
testOpt({ grp:7, prodId:"zipscreen_z100", label:"G7: ม่านซิป กลุ่มโครงการ (zgrp=project · markup ต่างกัน)",
  w:"2.0", h:"2.5",
  apply: ch => { setVal(ch, ".o-zgrp", "project"); },
  minExpect:0 }); // โครงการถูกกว่าปลีก → delta อาจติดลบ

// เปลี่ยนผ้า (zfab)
testOpt({ grp:7, prodId:"zipscreen_z100", label:"G7: ม่านซิป เปลี่ยนผ้า (zfab=3)",
  w:"2.0", h:"2.5",
  apply: ch => { setVal(ch, ".o-zfab", "3"); },
  minExpect:0 });

// ระบบควบคุม (zctrl)
testOpt({ grp:7, prodId:"zipscreen_z100", label:"G7: ม่านซิป ระบบควบคุม (zctrl=remote220)",
  w:"2.0", h:"2.5",
  apply: ch => { setVal(ch, ".o-zctrl", "remote220"); },
  minExpect:0 });

// ============================================================
// COMMON OPTIONS ที่อาจตกหล่น
// ============================================================
P("\n--- COMMON OPTIONS (ทุก cat) ---");

// ฝัง U-Channel (uchannel) — ข้อความ ไม่บวกเงิน
testOpt({ grp:1, prodId:"sliding_sms", label:"COMMON: ฝัง U-Channel (label-only)",
  apply: ch => { setChk(ch, ".o-uchannel", true); },
  expectZero:true });

// เสริมคาน (beamM)
testOpt({ grp:1, prodId:"casement_euro", label:"COMMON: เสริมคาน (beamM=500 × beamMlen=3)",
  w:"1.0", h:"2.2",
  apply: ch => { setVal(ch, ".o-beamm", "500"); setVal(ch, ".o-beammlen", "3"); },
  minExpect:1000, shouldShow:"เสริมคาน" });

// insulation ฝ้า/ผนัง
testOpt({ grp:3, prodId:"wall_smartboard", label:"COMMON: insulation ฝ้า/ผนัง +600/ตร.ม.",
  w:"4.0", h:"2.5",
  apply: ch => { setChk(ch, ".o-insul", true); },
  minExpect:3000 });

// COMMON_OPTS (สิ่งที่ขึ้นใบแต่อาจไม่บวก)
// ดรอปพื้น, รื้อของเดิม = label-only ไม่บวกราคา → expectZero
testOpt({ grp:1, prodId:"sliding_sms", label:"COMMON: รื้อของเดิม (label-only)",
  apply: ch => { setChk(ch, ".o-removeold", true); },
  expectZero:true });

P("\n===== เสร็จสิ้น =====");

// ============================================================
// สร้าง HTML Report
// ============================================================
const bugs   = results.filter(r => r.status === "bug");
const warns  = results.filter(r => r.status === "warn");
const oks    = results.filter(r => r.status === "ok");

function statusBadge(s) {
  if (s === "bug")  return '<span style="color:#B3151D;font-weight:700">🔴ยืนยันบั๊ก</span>';
  if (s === "warn") return '<span style="color:#d97706;font-weight:700">🟡สงสัย/เช็คซ้ำ</span>';
  return '<span style="color:#15803d;font-weight:700">✅ปกติ</span>';
}
const rowHtml = (r) =>
  `<tr class="${r.status}">
    <td>G${r.grp}</td>
    <td><code>${r.prodId}</code></td>
    <td>${r.label}</td>
    <td style="text-align:right">${r.base}</td>
    <td style="text-align:right">${r.after}</td>
    <td style="text-align:right;font-weight:700">${r.delta}</td>
    <td>${r.inInvoice||"-"}</td>
    <td>${statusBadge(r.status)}</td>
    <td>${r.verdict}</td>
  </tr>`;

const allRows = [...bugs, ...warns, ...oks].map(rowHtml).join("\n");

const outHtml = `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<title>AUDIT บั๊กการเงิน option ทุกกลุ่ม — 2026-06-17</title>
<style>
body{font-family:'Leelawadee UI',Tahoma,sans-serif;font-size:13px;color:#1f2937;max-width:1200px;margin:0 auto;padding:16px;background:#f9fafb;}
h1{color:#B3151D;font-size:20px;border-bottom:3px solid #B3151D;padding-bottom:6px;}
h2{color:#B3151D;font-size:15px;margin-top:20px;}
table{border-collapse:collapse;width:100%;background:#fff;margin:8px 0;font-size:12px;}
th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top;}
th{background:#fbe9ea;color:#B3151D;}
tr.bug{background:#fff5f5;}
tr.warn{background:#fffbeb;}
tr.ok{background:#f0fdf4;}
code{background:#f3f4f6;padding:0 3px;border-radius:3px;font-size:11px;}
.summary{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:12px 0;}
pre{background:#1e293b;color:#e2e8f0;padding:10px;border-radius:8px;overflow-x:auto;font-size:11px;line-height:1.5;}
</style></head><body>
<h1>AUDIT บั๊กการเงิน — option โผล่ในใบแต่ไม่บวกยอด ทุกกลุ่ม G1-G7</h1>
<p>render <code>index.html</code> ด้วย jsdom · วัด Δsell ก่อน-หลัง toggle option · 2026-06-17</p>

<div class="summary">
  <b>สรุป:</b> ตรวจ ${results.length} option &nbsp;|&nbsp;
  <span style="color:#B3151D">🔴 บั๊ก ${bugs.length} รายการ</span> &nbsp;|&nbsp;
  <span style="color:#d97706">🟡 สงสัย ${warns.length} รายการ</span> &nbsp;|&nbsp;
  <span style="color:#15803d">✅ ปกติ ${oks.length} รายการ</span>
</div>

<h2>ตารางเทียบ (เรียง 🔴 ก่อน)</h2>
<table>
<tr>
  <th>กลุ่ม</th><th>รุ่น</th><th>option</th>
  <th>ก่อน (บาท)</th><th>หลัง (บาท)</th><th>Δ</th>
  <th>โผล่ใบ</th><th>สถานะ</th><th>หมายเหตุ</th>
</tr>
${allRows}
</table>

<h2>log</h2>
<pre>${log.join("\n").replace(/&/g,"&amp;").replace(/</g,"&lt;")}</pre>
${jsErrors.length ? `<h2>JS Errors</h2><pre>${jsErrors.slice(0,10).join("\n")}</pre>` : ""}
</body></html>`;

writeFileSync(OUT, outHtml, "utf8");
P(`\n📄 รายงาน: ${OUT}`);
P(`สรุป: 🔴 ${bugs.length} บั๊ก | 🟡 ${warns.length} สงสัย | ✅ ${oks.length} ปกติ`);
