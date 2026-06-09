// test/_t3_cross-check.mjs — QA Tester #3: cross-check financial totals
// รัน: node test/_t3_cross-check.mjs
// เทียบยอด quote-06..10 + FULL-A/B/C/D กับ engine ปัจจุบัน
// ไม่แก้ index.html — รายงาน PASS/FAIL ต่อใบ
//
// หมายเหตุ (มติ 2026-06-09 · UX checklist ข้อ20 "ทาง A"): FULL-A/C/D สร้างใหม่ด้วยระบบบานแล้ว ·
//   ใบที่มี "กั้นห้องกระจก" (เช่น quote-09) ยังใช้ราคาเหมา (lumpsum) แบบเก่า — ตั้งใจคงไว้ (ไม่มีขนาดบานเดิม)
//   → row กั้นห้องกระจกขึ้น FAIL เป็นเรื่องปกติ ไม่ใช่บั๊ก engine · ไฟล์นี้เป็น dev test (prefix _ ไม่อยู่ใน gate)

import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const calcHtml = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");

// ============================================================
// boot JSDOM (1 instance ใช้ทุก quote)
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
  setTimeout(r, 2000);
});
const w = dom.window;
const doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

// ปิด svc-protect
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

// ============================================================
// helpers
// ============================================================
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
  if (it.pos) setF(ch, ".i-position", it.pos);
  if (it.itype) setF(ch, ".i-type", it.itype);
  if (it.override != null) setF(ch, ".i-override", it.override);
  // color
  if (it.color != null) {
    const c = ch.querySelector(".i-color"); if (c) { c.value = String(it.color); fire(c, "change"); }
  } else if (it.glassProduct || it.autoColor !== false) {
    const c = ch.querySelector(".i-color");
    if (c && c.options.length > 1) { c.value = c.options[1].value; fire(c, "change"); }
  }
  if (it.colorIdx != null) {
    const c = ch.querySelector(".i-color"); if (c) { c.value = String(it.colorIdx); fire(c, "change"); }
  }
  // glass
  if (it.glass != null) {
    const g = ch.querySelector(".i-glass"); if (g) { g.value = String(it.glass); fire(g, "change"); }
  } else if (it.glassProduct) {
    const g = ch.querySelector(".i-glass");
    if (g && g.options.length > 1) { g.value = g.options[1].value; fire(g, "change"); }
  }
  if (it.glassIdx != null) {
    const g = ch.querySelector(".i-glass"); if (g) { g.value = String(it.glassIdx); fire(g, "change"); }
  }
  // opts
  for (const [s, v] of Object.entries(it.opts || {})) {
    if (typeof v === "boolean") {
      const el = ch.querySelector(s); if (el) { el.checked = v; fire(el, "change"); }
    } else {
      setF(ch, s, v);
    }
  }
  // mosquito
  if (it.mosquito) {
    const mq = ch.querySelector(".o-mosq");
    if (mq && mq.options.length > 1) { mq.value = mq.options[1].value; fire(mq, "change"); }
  }
  // slidelock
  if (it.slidelock) {
    const sl = ch.querySelector(".o-slidelock");
    if (sl && sl.options.length > 1) { sl.value = sl.options[1].value; fire(sl, "change"); }
  }
  // note
  if (it.note) setF(ch, ".i-note", it.note);
  // subItems
  if (it.subItems && it.subItems.length) {
    it.subItems.forEach((sub) => {
      w.addSubItem(ch.querySelector(".sub-addbtn"));
      const rows = ch.querySelectorAll(".subitem-list .subitem-row");
      const row = rows[rows.length - 1];
      if (row) {
        const st = row.querySelector(".s-type"); if (st) { st.value = sub.type; fire(st, "change"); }
        const sw = row.querySelector(".s-w"); if (sw) { sw.value = String(sub.w || 1); fire(sw, "input"); }
        const sh = row.querySelector(".s-h"); if (sh) { sh.value = String(sub.h || 0.5); fire(sh, "input"); }
      }
    });
  }
  return ch;
}

function addGlasshouseSet2(cfg) {
  const sb = w.addGlasshouseSet();
  const sn = sb.querySelector(".set-name");
  if (sn) { sn.value = cfg.name || "กั้นห้องกระจก"; fire(sn, "input"); fire(sn, "change"); }
  const parts = sb.querySelector(".set-parts");
  let chs = parts.querySelectorAll(".ch");
  const sides = cfg.sides || [];
  if (sides.length > 0) {
    const s0 = sides[0]; const ch0 = chs[0];
    if (s0.prod) {
      const ps = ch0.querySelector(".i-prod");
      if (ps && !ps.querySelector('option[value="' + s0.prod + '"]')) ps.innerHTML = w.prodOptionsG6("6");
      if (ps) { ps.value = s0.prod; fire(ps, "change"); }
    }
    if (s0.w != null) setF(ch0, ".i-w", s0.w);
    if (s0.h != null) setF(ch0, ".i-h", s0.h);
    const pA = ch0.querySelector(".i-position");
    if (pA) { pA.value = s0.pos || "ด้าน A"; fire(pA, "input"); fire(pA, "change"); }
    if (s0.opts) for (const [sel, v] of Object.entries(s0.opts)) setF(ch0, sel, v);
    // auto color/glass
    const c0 = ch0.querySelector(".i-color"); if (c0 && c0.options.length > 1) { c0.value = c0.options[1].value; fire(c0, "change"); }
    const g0 = ch0.querySelector(".i-glass"); if (g0 && g0.options.length > 1) { g0.value = g0.options[1].value; fire(g0, "change"); }
  }
  for (let i = 1; i < sides.length; i++) {
    const addBtn = sb.querySelector(".set-addpart"); if (addBtn) fire(addBtn, "click");
    chs = parts.querySelectorAll(".ch"); const chN = chs[chs.length - 1]; const sN = sides[i];
    if (sN.prod) {
      const ps = chN.querySelector(".i-prod");
      if (ps && !ps.querySelector('option[value="' + sN.prod + '"]')) ps.innerHTML = w.prodOptionsG6("6");
      if (ps) { ps.value = sN.prod; fire(ps, "change"); }
    }
    if (sN.w != null) setF(chN, ".i-w", sN.w);
    if (sN.h != null) setF(chN, ".i-h", sN.h);
    const pN = chN.querySelector(".i-position");
    if (pN) { pN.value = sN.pos || ("ด้าน " + String.fromCharCode(64 + i + 1)); fire(pN, "input"); fire(pN, "change"); }
    if (sN.opts) for (const [sel, v] of Object.entries(sN.opts)) setF(chN, sel, v);
    const cN = chN.querySelector(".i-color"); if (cN && cN.options.length > 1) { cN.value = cN.options[1].value; fire(cN, "change"); }
    const gN = chN.querySelector(".i-glass"); if (gN && gN.options.length > 1) { gN.value = gN.options[1].value; fire(gN, "change"); }
  }
  if (cfg.roof) {
    const roofBtn = sb.querySelector(".set-addroof"); if (roofBtn) fire(roofBtn, "click");
    chs = parts.querySelectorAll(".ch"); const roofCh = chs[chs.length - 1]; const r = cfg.roof;
    if (r.prod) { const ps = roofCh.querySelector(".i-prod"); if (ps) { ps.value = r.prod; fire(ps, "change"); } }
    if (r.w != null) setF(roofCh, ".i-w", r.w);
    if (r.h != null) setF(roofCh, ".i-h", r.h);
    const rPos = roofCh.querySelector(".i-position");
    if (rPos && !rPos.value.trim()) { rPos.value = "หลังคา"; fire(rPos, "input"); }
    if (r.opts) for (const [sel, v] of Object.entries(r.opts)) setF(roofCh, sel, v);
  }
  return sb;
}

// ============================================================
// readFinancials — อ่านยอดจาก quoteContent DOM จริง
// ============================================================
function readFinancials() {
  const qc = doc.getElementById("quoteContent");
  if (!qc) return { subtotal: 0, disc: 0, afterDisc: 0, vat: 0, grand: 0 };
  const text = (qc.textContent || "").replace(/\s+/g, " ");

  function findNum(re) {
    const m = text.match(re);
    if (!m) return null;
    return parseFloat(m[1].replace(/,/g, "")) || 0;
  }

  const subtotal  = findNum(/รวมเป็นเงิน\s*([\d,]+\.[\d]+)\s*บาท/);
  const disc      = findNum(/ส่วนลด\s*([\d,]+\.[\d]+)\s*บาท/);
  const afterDisc = findNum(/หลังหักส่วนลด\s*([\d,]+\.[\d]+)\s*บาท/);
  const vat       = findNum(/ภาษีมูลค่าเพิ่ม\s*7%\s*([\d,]+\.[\d]+)\s*บาท/);
  const grand     = findNum(/จำนวนเงินรวมทั้งสิ้น\s*([\d,]+\.[\d]+)\s*บาท/);

  return { subtotal, disc, afterDisc, vat, grand };
}

const ZIP = (grp, model, fab, ctrl) => ({ ".o-zgrp": grp, ".o-zmodel": model, ".o-zfab": fab, ".o-zctrl": ctrl });
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

// ============================================================
// render helpers
// ============================================================
function renderJob(job) {
  clearItems();
  setF2("discFlat", job.discFlat || 0);
  setF2("discPct", job.discPct || 0);
  setF2("custName", job.cust || "ทดสอบ");
  setF2("qdate", job.date || "01-01-69");
  setF2("sellerName", "QA-T3");

  if (job.disableCalc) {
    w.eval("window._calcQuoteOrig = calcQuote; calcQuote = function(){};");
  }

  if (job.sets && job.sets.length) {
    const setsByAfter = {};
    for (const s of job.sets) setsByAfter[s.afterItemIdx] = s.cfg;
    (job.items || []).forEach((it, idx) => {
      addItem(it);
      if (setsByAfter[idx] != null) addGlasshouseSet2(setsByAfter[idx]);
    });
  } else {
    (job.items || []).forEach(addItem);
  }

  if (job.ghSets && job.ghSets.length) {
    for (const cfg of job.ghSets) addGlasshouseSet2(cfg);
  }
  if (job.extraItems && job.extraItems.length) {
    job.extraItems.forEach(addItem);
  }
  if (job.ghSets2 && job.ghSets2.length) {
    for (const cfg of job.ghSets2) addGlasshouseSet2(cfg);
  }

  if (job.disableCalc) {
    w.eval("calcQuote = window._calcQuoteOrig;");
  }

  w.calcQuote();
  w.genQuote();
  return readFinancials();
}

// ============================================================
// JOBS definition (เหมือนสคริปต์ gen ทุกอย่าง)
// ============================================================

// quote-06 = JOBS[5] (0-indexed) = โรงงาน
const JOB_06 = {
  cust: "บจก. ทดสอบ อุตสาหกรรมรุ่งเรือง (โรงงาน)", date: "04-06-69",
  items: [
    {g:3,prod:"roof_vinyl",  pos:"คลุมลานจอด",   w:8.0,h:12.0,qty:1},
    {g:3,prod:"roof_polyton",pos:"ทางเดินเชื่อม", w:3.0,h:10.0,qty:1},
    {g:3,prod:"isowall",     pos:"ห้องเครื่อง",   w:4.0,h:3.0, qty:2},
    {g:1,prod:"sliding_sms", pos:"หน้าโรงงาน",    w:4.0,h:2.6, panels:4,qty:2,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass", pos:"ห้องควบคุม",    w:2.0,h:2.0, qty:4, glassProduct:1,glass:1},
    {g:2,prod:"fence_gate",  pos:"ทางเข้าโรงงาน",w:4.0,h:1.8, qty:1},
  ],
};

// quote-07 = JOBS[6] = บ้านหรู
const JOB_07 = {
  cust: "คุณทดสอบ ธนกร เลิศหรู (บ้านหรู)", date: "04-06-69",
  items: [
    {g:1,prod:"casement_xseries",pos:"ตัวบ้านหลัก",        w:1.8,h:2.6,panels:2,qty:3,glassProduct:1,glass:1},
    {g:1,prod:"sliding_eseries", pos:"ห้องรับแขก",          w:4.0,h:2.6,panels:4,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass",     pos:"ช่องแสงสูง Double-height",w:3.0,h:4.0,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"pivot",           pos:"ทางเข้าหลัก",          w:1.2,h:2.6,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"curved_fixed",    pos:"โถงบันได",             w:2.5,h:2.6,qty:1,glassProduct:1,glass:1},
    {g:2,prod:"imp1",            pos:"บันไดเฉียง",           w:5.0,qty:1},
  ],
};

// quote-08 = JOBS[7] = ทาวน์โฮม
const JOB_08 = {
  cust: "คุณทดสอบ กนกพร ตั้งใจ (ทาวน์โฮม 3 ชั้น)", date: "04-06-69",
  items: [
    {g:1,prod:"sliding_sms",pos:"หน้าบ้าน",  w:3.0,h:2.4,panels:4,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"casement_euro",pos:"ทุกชั้น",  w:1.2,h:1.4,panels:1,qty:9,glassProduct:1,glass:1},
    {g:1,prod:"awning_euro",  pos:"ห้องน้ำ",  w:0.6,h:0.8,qty:3,glassProduct:1},
    {g:1,prod:"fixed_glass",  pos:"ช่องบันได",w:1.2,h:2.8,qty:2,glassProduct:1,glass:1},
    {g:7,prod:"zipscreen",    pos:"ดาดฟ้า",   w:3.5,h:2.5,qty:1,opts:ZIP("retail","auto","5","aok220")},
  ],
};

// quote-09 = JOBS[8] = รีสอร์ท
const JOB_09 = {
  cust: "บจก. ทดสอบ รีสอร์ทอันดามัน (วิลล่าริมน้ำ)", date: "04-06-69",
  items: [
    {g:6,prod:"glasshouse",pos:"Pool Sala",         opts:GH("Pool Sala ริมสระ",680000)},
    {g:7,prod:"zipscreen", pos:"Sala ด้านทะเล",     w:5.0,h:3.0,qty:2,opts:ZIP("project","Z120W","PET","aok50n")},
    {g:1,prod:"sliding_euro",pos:"ห้องพัก",         w:3.0,h:2.6,panels:3,qty:6,glassProduct:1,glass:1},
    {g:1,prod:"frameless_door",pos:"ห้องอาบน้ำ",    w:0.9,h:2.2,qty:6,glassProduct:1,glass:1},
    {g:3,prod:"roof_laminate",pos:"ทางเดิน",         w:3.0,h:8.0,qty:1},
  ],
};

// quote-10 = JOBS[9] = อาคารพาณิชย์
const JOB_10 = {
  cust: "คุณทดสอบ อนุชา ก้าวหน้า (อาคารพาณิชย์ 4 ชั้น)", date: "04-06-69",
  items: [
    {g:1,prod:"sliding_eseries",pos:"หน้าร้าน",      w:4.0,h:3.0,panels:4,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass",    pos:"Façade ชั้น 1",w:2.0,h:3.0,qty:8,glassProduct:1,glass:1},
    {g:1,prod:"casement_dseries",pos:"ชั้นบน",       w:1.2,h:1.5,panels:1,qty:12,glassProduct:1,glass:1},
    {g:3,prod:"roof_vinyl",      pos:"ดาดฟ้า",        w:6.0,h:8.0,qty:1},
    {g:2,prod:"imp3",            pos:"ระเบียงทุกชั้น",w:16.0,qty:1},
    {g:2,prod:"bar_grid_z",      pos:"หน้าอาคาร",    w:4.0,h:3.0,qty:1},
  ],
};

// FULL-A
const JOB_FULL_A = {
  cust: "คุณปิยะ มงคล (บ้านเดี่ยว 2 ชั้น)", date: "04-06-69",
  discFlat: 3000,
  disableCalc: true,
  items: [
    { g:1, prod:"sliding_euro", pos:"ประตู โถงหน้าบ้าน", w:3.6, h:2.4, panels:4, qty:1,
      subItems: [{type:"ช่องแสงติดตาย", w:3.6, h:0.5}] },
    { g:1, prod:"casement_euro", pos:"หน้าต่าง ห้องนอนใหญ่", itype:"window", w:1.6, h:2.2, panels:2, qty:2 },
    { g:1, prod:"awning_euro",   pos:"หน้าต่าง ห้องน้ำ",     itype:"window", w:0.8, h:1.0, qty:3 },
    { g:1, prod:"folding",       pos:"ประตู เชื่อมระเบียงหลัง",w:4.0, h:2.4, panels:4, qty:1 },
    { g:7, prod:"zipscreen",     pos:"ม่านซิป ระเบียงชั้น 2", w:3.0, h:2.8, qty:1, autoColor:false,
      opts: ZIP("retail","auto","5","aok220") },
    { g:5, prod:"imp23",         pos:"มุ้งเฟรมใหญ่ ประตูระเบียง",w:1.8, h:2.1, qty:1 },
    { g:1, prod:"fixed_glass",   pos:"ช่องแสง เหนือประตูหน้าบ้าน",w:3.6, h:0.5, qty:1 },
  ],
  sets: [
    { afterItemIdx: 3, cfg: {
      name: "กั้นห้องกระจก ระเบียงหลังบ้าน",
      sides: [
        { prod:"sliding_euro", w:3.6, h:2.4, pos:"ด้าน A" },
        { prod:"fixed_glass",  w:2.4, h:2.4, pos:"ด้าน B" },
        { prod:"casement_euro",w:1.8, h:2.4, pos:"ด้าน C" },
      ],
      roof: { prod:"roof_vinyl", w:9.0, h:3.5 },
    }},
  ],
};

// FULL-B (จำลอง job ด้วย items แบบ auto ทุกตัวยกเว้น manual)
// เราไม่สามารถสร้าง buildJobBItems() ใหม่ได้ใน test นี้ (ต้องการ PRODUCTS)
// → ใช้วิธีอ่าน PRODUCTS จาก window แล้วสร้างเหมือนกัน
w.eval("window.__PRODUCTS__ = PRODUCTS;");
const ALL_PRODUCTS = w.__PRODUCTS__;
const CAT_TO_GROUP = {
  'บานเลื่อน':1,'บานเปิด':1,'ติดตาย':1,'บานเฟี้ยม':1,'บานกระทุ้ง':1,'เลื่อนภายใน':1,
  'PC Door':1,'บานเปลือย':1,'shower':1,'บานยก':1,'YKK':1,'บานหมุน':1,'ดัดโค้ง':1,
  'เส้นคาด':1,'ลูกฟูก+คอมโพสิททึบ':1,
  'ประตูรั้ว':2,'ระแนง':2,'ระแนง-บังตา':2,'ระแนง-ผนัง':2,'ระแนง-เกล็ด':2,'ราวบันได':2,
  'หลังคา':3,'ฝ้า-ผนัง':3,
  'ตู้อลู':4,'ฝาตู้':4,
  'มุ้ง':5,
  'กั้นห้องกระจก':6,
  'ม่านซิป':7,
};
const SKIP = new Set(["glass_replace","custom_item"]);
const MANUAL_IDS = new Set(["shower","frameless_door","zipscreen","fixed_glass"]);
const OVERRIDE_PRICE = {
  casement_flush_solid:35000, casement_inset_solid:35000,
  bar_grid_z:0, bar_slide:0, bar_openclose:0, grid_bars:0,
};
const PRODUCT_OPTS = {
  grid_bars: {".o-nh":"3",".o-nv":"3",".o-gridcolor":"200",".o-nc":"0"},
  ceil_cshape: {".o-ckolor":"ขาว-ดำ"},
  ceil_bsc: {".o-ckolor":"มาตรฐาน(ขาว-ซิลเวอร์)"},
};
const B_SIZES = [[1.2,1.2],[1.8,2.0],[2.4,2.2],[3.6,2.4],[0.9,2.1],[2.0,1.5]];

function enableAllOpts(ch) {
  ch.querySelectorAll(".i-opts select").forEach((sel) => {
    if (sel.classList.contains("o-thresh")) return;
    if (sel.classList.contains("o-fcsides")) return;
    if (sel.options && sel.options.length > 1 && !sel.multiple) {
      sel.value = sel.options[1].value; fire(sel, "change");
    }
  });
  const c = ch.querySelector(".i-color"); if (c && c.options.length > 1) { c.value = c.options[1].value; fire(c, "change"); }
  const g = ch.querySelector(".i-glass"); if (g && g.options.length > 1) { g.value = g.options[1].value; fire(g, "change"); }
}

function addItemFull(it) {
  w.addItem(doc.getElementById("items"));
  const chs = doc.querySelectorAll("#items .ch"); const ch = chs[chs.length - 1];
  setF(ch, ".i-group", it.g);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + it.prod + '"]')) ps.innerHTML = w.prodOptionsG6(String(it.g));
  ps.value = it.prod; fire(ps, "change");
  if (it.w != null) setF(ch, ".i-w", it.w);
  if (it.h != null) setF(ch, ".i-h", it.h);
  if (it.panels != null) setF(ch, ".i-panels", it.panels);
  if (it.qty != null) setF(ch, ".i-qty", it.qty);
  if (it.pos) setF(ch, ".i-position", it.pos);
  if (it.itype) setF(ch, ".i-type", it.itype);
  if (it.override != null) setF(ch, ".i-override", it.override);
  if (it.auto !== false) enableAllOpts(ch);
  for (const [s, v] of Object.entries(it.opts || {})) setF(ch, s, v);
  if (it.note) setF(ch, ".i-note", it.note);
  if (it.subItems && it.subItems.length) {
    it.subItems.forEach((sub) => {
      w.addSubItem(ch.querySelector(".sub-addbtn"));
      const rows = ch.querySelectorAll(".subitem-list .subitem-row");
      const row = rows[rows.length - 1];
      if (row) {
        const st = row.querySelector(".s-type"); if (st) { st.value = sub.type; fire(st, "change"); }
        const sw = row.querySelector(".s-w"); if (sw) { sw.value = String(sub.w||1); fire(sw, "input"); }
        const sh = row.querySelector(".s-h"); if (sh) { sh.value = String(sub.h||0.5); fire(sh, "input"); }
      }
    });
  }
  return ch;
}

function buildJobBItems() {
  const items = [];
  let autoIdx = 0;
  for (const p of ALL_PRODUCTS) {
    if (SKIP.has(p.id)) continue;
    if (MANUAL_IDS.has(p.id)) continue;
    if (p.cat === 'เสริม' && p.g !== 2) continue;
    const g = p.g || CAT_TO_GROUP[p.cat] || 1;
    const [w2, h2] = B_SIZES[autoIdx % B_SIZES.length];
    autoIdx++;
    const pos = p.name
      .replace(/\s*(เซมิยูโร|ยูโร|สลิม|SMS|aluinch|E-series|D-series|X-series|Velora)\s*/g," ")
      .replace(/\s*\([^)]*\)/g," ").replace(/\s+/g," ").trim().slice(0,60);
    const item = { g, prod: p.id, pos, w: w2, h: h2, panels:(autoIdx % 3)+1, qty:1 };
    if (p.handrail) { item.h = null; item.qty = 1; }
    if (OVERRIDE_PRICE[p.id] !== undefined && OVERRIDE_PRICE[p.id] > 0) item.override = OVERRIDE_PRICE[p.id];
    if (PRODUCT_OPTS[p.id]) item.opts = PRODUCT_OPTS[p.id];
    items.push(item);
  }
  items.push({g:1,prod:"shower",pos:"shower กั้นห้องน้ำ (ประตู+ติดตาย)",w:1.2,h:2.0,qty:1,auto:false,opts:{".o-shtype":"door_fixed",".o-shdoortype":"swing"}});
  items.push({g:1,prod:"shower",pos:"shower กั้นห้องน้ำ (ติดตายเดี่ยว)",w:0.9,h:2.0,qty:1,auto:false,opts:{".o-shtype":"fixed_only"}});
  items.push({g:1,prod:"frameless_door",pos:"ประตูบานเปลือยสวิง",w:0.9,h:2.1,qty:1,auto:false,opts:{".o-frametype":"swing",".o-framecolor":"ดำ"}});
  items.push({g:1,prod:"frameless_door",pos:"ประตูบานเปลือยเลื่อน",w:1.6,h:2.1,qty:1,auto:false,opts:{".o-frametype":"sliding",".o-framecolor":"ขาว"}});
  items.push({g:7,prod:"zipscreen",pos:"ม่านซิป 5%",w:3.0,h:2.8,qty:1,auto:false,opts:ZIP("retail","auto","5","aok220")});
  items.push({g:7,prod:"zipscreen",pos:"ม่านซิป 0%",w:2.0,h:2.4,qty:1,auto:false,opts:ZIP("retail","Z100","0","manual")});
  items.push({g:1,prod:"fixed_glass",pos:"ช่องแสง",w:2.4,h:0.5,qty:1});
  return items;
}

const JOB_B_GH_SETS = [
  { name:"กั้นห้องกระจก ชั้น 1",
    sides:[
      {prod:"sliding_euro",w:4.2,h:2.4,pos:"ด้าน A (ประตูเลื่อน)"},
      {prod:"fixed_glass", w:3.0,h:2.4,pos:"ด้าน B (ติดตาย)"},
      {prod:"casement_euro",w:1.8,h:2.4,pos:"ด้าน C (ประตูบานเปิด)"},
      {prod:"fixed_glass", w:3.0,h:2.4,pos:"ด้าน D (ติดตาย)"},
    ],
    roof:{prod:"roof_std",w:12.6,h:4.0},
  },
  { name:"กั้นห้องกระจก ชั้น 2",
    sides:[
      {prod:"folding",    w:3.6,h:2.4,pos:"ด้าน A (บานเฟี้ยม)"},
      {prod:"awning_euro",w:2.4,h:1.2,pos:"ด้าน B (บานกระทุ้ง)"},
      {prod:"fixed_glass",w:2.4,h:2.4,pos:"ด้าน C (ติดตาย)"},
    ],
    roof:{prod:"roof_delight",w:8.4,h:3.0},
  },
  { name:"กั้นห้องกระจก ระเบียงหลัง",
    sides:[
      {prod:"sliding_euro",w:3.0,h:2.2,pos:"ด้าน A"},
      {prod:"fixed_glass", w:2.0,h:2.2,pos:"ด้าน B"},
    ],
    roof:{prod:"roof_std",w:6.0,h:3.0},
  },
];

function renderFullB() {
  clearItems();
  setF2("discFlat", 2000); setF2("discPct", 0);
  setF2("custName", "คุณทดสอบ ครบทุกสินค้า"); setF2("qdate", "04-06-69");
  w.eval("window._calcQuoteOrig = calcQuote; calcQuote = function(){};");
  buildJobBItems().forEach(addItemFull);
  for (const cfg of JOB_B_GH_SETS) addGlasshouseSet2(cfg);
  w.eval("calcQuote = window._calcQuoteOrig;");
  w.calcQuote(); w.genQuote();
  return readFinancials();
}

// FULL-C job
const JOB_FULL_C = {
  cust: "คุณเทสต์ ออปชันผสม (FullC)", date: "08-06-69",
  discFlat: 5000,
  disableCalc: true,
  items: [
    {g:1,prod:"sliding_euro",pos:"ประตูบานเลื่อน ยูโร 4 บาน",w:3.6,h:2.4,panels:4,qty:1,
     opts:{".o-slidelock":"มีกุญแจ",".o-gridmark":true,".o-mosq":"imp23"}},
    {g:1,prod:"casement_euro",pos:"ประตูบานเปิด ยูโร",itype:"door",w:0.9,h:2.1,panels:1,qty:1,
     opts:{".o-thresh":"turtle",".o-gridmark":true,".o-mosq":"imp22"}},
    {g:1,prod:"folding_euro",pos:"บานเฟี้ยม ยูโร",w:3.6,h:2.4,panels:4,qty:1,
     opts:{".o-beam":true,".o-threshf":"outer",".o-mosq":"imp21"}},
    {g:1,prod:"awning_euro",pos:"หน้าต่างบานกระทุ้ง",itype:"window",w:0.8,h:1.0,qty:2,
     opts:{".o-mosq":"imp21",".o-mosqfabric":"anti_pet"}},
    {g:1,prod:"rn89",pos:"ลูกฟูกเรียบ 1 ทาง",w:3.0,h:2.4,qty:1,
     opts:{".o-finish":"2500",".o-hmode":"round"}},
    {g:1,prod:"rn91",pos:"คอมโพสิต 3 มม.",w:2.4,h:1.2,qty:1,
     opts:{".o-hmode":"splice"}},
    {g:1,prod:"rn92",pos:"คอมโพสิต 4 มม.",w:1.8,h:2.0,qty:1,
     opts:{".o-doortype":"sliding_euro"}},
    {g:2,prod:"rn84",pos:"ระแนงเกล็ด Z 1\"",w:4.0,h:1.8,qty:1,
     opts:{".o-finish":"1500"}},
    {g:2,prod:"fence_gate",pos:"ประตูรั้ว",w:4.0,h:2.0,qty:1,
     opts:{".o-gatern":"rn89",".o-gmotor":"1",".o-railtype":"straight",".o-gfin":"สีดำ"}},
    {g:3,prod:"roof_vinyl",pos:"หลังคาไวนิล",w:6.0,h:3.5,qty:1,
     opts:{".o-roofcolor":"สีน้ำตาล",".o-roofbatten":"แปคู่",".o-roofend":"ปิดปลาย",
           ".o-rfeave":"6",".o-rfgut":"1000",".o-rfgutlen":"6",".o-rfpolep":"4"}},
    {g:3,prod:"roof_delight",pos:"หลังคาดีไลท์",w:4.0,h:3.0,qty:1,
     opts:{".o-roofcolor":"DG-4 สีเทาโซล่าร์",".o-roofbatten":"แปคู่",".o-roofend":"รางน้ำ",
           ".o-guttersys":"ท่อ",".o-gutter-pipecolor":"ดำ",".o-rfhs":"comp",
           ".o-rfhsh":"0.3",".o-rfhsl":"4",".o-rfhsn":"1"}},
    {g:3,prod:"roof_polyton",pos:"หลังคาโพลีตัน",w:3.0,h:2.5,qty:1,
     opts:{".o-roofcolor":"Bronze 107 สีชาใส (แสงผ่าน 30%)",".o-roofbatten":"แปคู่",
           ".o-roofend":"รางน้ำ",".o-guttersys":"โซ่",".o-gutter-chainpat":"ทิวลิป",
           ".o-gutter-chaincolor":"น้ำตาล",".o-rfchain":"2",".o-rfeave":"3"}},
    {g:1,prod:"shower",pos:"Shower master",w:1.5,h:2.0,qty:1,
     opts:{".o-shtype":"door_fixed",".o-shdoortype":"swing"}},
    {g:1,prod:"inner_top_slimlux",pos:"เลื่อนภายใน SlimLux",w:3.0,h:2.4,panels:3,qty:1,
     opts:{".o-gridmark":true,".o-beamm":"2400",".o-beammlen":"3"}},
    {g:5,prod:"imp23",pos:"มุ้งเฟรมใหญ่ standalone",w:1.8,h:2.1,qty:2,
     opts:{".o-screen_existing":true,".o-screen_extra":"2000",".o-screenfabric":"cat",".o-mscolor":"3"}},
    {g:7,prod:"zipscreen",pos:"ม่านซิป ระเบียง",w:4.0,h:2.8,qty:1,
     opts:ZIP("retail","auto","5","aok220")},
    {g:2,prod:"rn37",pos:"ระแนงผนัง",w:5.0,h:1.8,qty:1,
     opts:{".o-finish":"1600",".o-doortype":"casement_euro",".o-hmode":"splice"}},
    {g:1,prod:"frameless_door",pos:"บานเปลือยสวิง",w:0.8,h:2.0,qty:1,
     opts:{".o-frametype":"swing",".o-framecolor":"ดำ"}},
    {g:1,prod:"pc_door_4",pos:"PC Door 4 บาน",w:3.6,h:2.4,qty:1,
     opts:{".o-beamm":"3600",".o-beammlen":"3.6",".o-gridmark":true,".o-mosq":"imp31"}},
  ],
  ghSets: [{
    name:"กั้นห้องกระจก (ครัว+ระเบียง) [FullC #18]",
    sides:[
      {prod:"sliding_euro",w:3.0,h:2.4,pos:"ด้าน A (เลื่อน)",opts:{".o-gridmark":true}},
      {prod:"fixed_glass", w:2.0,h:2.4,pos:"ด้าน B (ติดตาย)"},
      {prod:"casement_euro",w:1.2,h:2.4,pos:"ด้าน C (บานเปิด)",opts:{".o-thresh":"turtle"}},
    ],
    roof:{prod:"roof_delight",w:7.2,h:2.5,
      opts:{".o-roofcolor":"DG-2 สีฟ้าคราม",".o-roofbatten":"แปคู่",".o-roofend":"ปิดปลาย",".o-rfeave":"7.2"}},
  }],
};

// FULL-D job (สร้างแบบ D)
const JOB_FULL_D_ITEMS = [
  {g:1,prod:"casement_flush_solid",pos:"ประตูบานเปิดคู่ ลูกฟูกเสมอกรอบ",w:1.8,h:2.4,panels:2,qty:1,override:85000,colorIdx:2,glassIdx:2,opts:{".o-thresh":"std"},subItems:[{type:"ช่องแสงติดตาย",w:0.9,h:0.5}]},
  {g:1,prod:"inner_top_stack",pos:"ประตูบานเลื่อนรางบน",w:3.0,h:2.4,panels:4,qty:1,opts:{".o-opentype":"บานเลื่อนเปิดคู่กลาง",".o-fixed":"2",".o-track":"โชว์ราง",".o-beamm":"2400",".o-beammlen":"3.0"}},
  {g:1,prod:"inner_top_slimlux",pos:"บานเลื่อนไร้ราง",w:2.4,h:2.4,panels:2,qty:1,opts:{".o-opentype":"บานเลื่อน",".o-fixed":"0"}},
  {g:1,prod:"sliding_euro",pos:"ประตูบานเลื่อนลากจูง",w:3.6,h:2.4,panels:3,qty:1,glassIdx:2,opts:{".o-opentype":"บานเลื่อนลากจูง",".o-fixed":"1"}},
  {g:1,prod:"inner_top_slimlux",pos:"บานเลื่อน SlimLux softclose",w:1.8,h:2.4,panels:2,qty:1,opts:{".o-opentype":"บานเลื่อนสลับ",".o-fixed":"0"}},
  {g:1,prod:"sliding_euro",pos:"หน้าต่างเลื่อนสลับ",w:2.4,h:1.4,panels:3,qty:1,itype:"window",glassIdx:2,opts:{".o-opentype":"บานเลื่อนสลับ",".o-fixed":"1"}},
  {g:1,prod:"casement_euro",pos:"ประตูบานเปิดคู่ 4 บาน",w:3.6,h:2.4,panels:4,qty:1,glassIdx:2,opts:{".o-thresh":"std"}},
  {g:1,prod:"sliding_euro",pos:"หน้าต่างเลื่อนสลับ ชุดยูโร",w:1.6,h:1.2,panels:2,qty:2,itype:"window",glassIdx:1,opts:{".o-opentype":"บานเลื่อนสลับ",".o-fixed":"0"}},
  {g:1,prod:"awning_euro",pos:"หน้าต่างบานกระทุ้ง",w:1.2,h:1.2,qty:1,itype:"window",glassIdx:2,subItems:[{type:"ช่องแสงติดตาย",w:1.2,h:0.4}]},
  {g:1,prod:"sliding_euro",pos:"ประตูบานเลื่อนเปิดคู่กลาง",w:4.0,h:2.4,panels:4,qty:1,glassIdx:2,opts:{".o-opentype":"บานเลื่อนเปิดคู่กลาง",".o-fixed":"2"}},
  {g:1,prod:"casement_euro",pos:"ประตูบานเปิด อินซูเลท",w:0.9,h:2.1,panels:1,qty:1,glassIdx:1,opts:{".o-thresh":"std"}},
  {g:1,prod:"folding_euro",pos:"บานเฟี้ยม 3+3 บาน",w:4.2,h:2.4,panels:6,qty:1,glassIdx:2,opts:{".o-beam":true,".o-threshf":"outer"}},
];
const JOB_FULL_D_GH_SETS = [{
  name:"กั้นห้องกระจก (ต่อเติมหลังบ้าน)",
  sides:[
    {prod:"sliding_euro",w:4.0,h:2.4,pos:"ด้าน A",opts:{".o-opentype":"บานเลื่อนเปิดคู่กลาง",".o-fixed":"2"}},
    {prod:"fixed_glass", w:2.4,h:2.4,pos:"ด้าน B"},
    {prod:"casement_euro",w:1.8,h:2.4,pos:"ด้าน C"},
    {prod:"fixed_glass", w:2.4,h:2.4,pos:"ด้าน D"},
    {prod:"fixed_glass", w:1.2,h:2.4,pos:"ด้าน E"},
  ],
  roof:{prod:"roof_vinyl",w:12.0,h:4.5},
}];
const JOB_FULL_D_EXTRA = [
  {g:3,prod:"roof_polyton",pos:"หลังคากันสาด โพลีตัน",w:4.0,h:3.0,qty:1,opts:{".o-roofend":"รางน้ำ",".o-guttersys":"โซ่",".o-gutter-chainpat":"ทิวลิป",".o-gutter-chaincolor":"ขาว"}},
  {g:3,prod:"roof_vinyl",  pos:"หลังคากันสาด ไวนิล", w:3.0,h:2.5,qty:1,opts:{".o-roofend":"ปล่อย"}},
  {g:2,prod:"rn1",          pos:"ระแนงบังตาผนัง",     w:3.0,h:1.8,qty:1},
  {g:2,prod:"imp1",         pos:"ราวกันตก",           w:5.0,qty:1},
  {g:3,prod:"roof_laminate",pos:"หลังคากระจกลามิเนต",w:3.0,h:4.0,qty:1,opts:{".o-roofend":"ปล่อย"}},
  {g:1,prod:"shower",       pos:"shower กั้นห้องน้ำ", w:1.2,h:2.0,qty:1,opts:{".o-shtype":"door_fixed",".o-shdoortype":"swing"}},
  {g:3,prod:"roof_laminate",pos:"skylight ลามิเนต",   w:1.5,h:1.5,qty:1,opts:{".o-roofframe":"โครงอลูมิเนียม",".o-roofbatten":"แปคู่",".o-roofend":"ปิดปลาย"}},
  {g:3,prod:"isowall",      pos:"ผนัง ISOWALL",       w:8.0,h:3.0,qty:1},
  {g:3,prod:"imp7",         pos:"เมทัลชีท",           w:12.0,h:3.0,qty:1},
];
const JOB_FULL_D_GH_SETS2 = [{
  name:"กลาสเฮ้าส์หลายด้าน + หลังคากระจกลามิเนต",
  sides:[
    {prod:"sliding_euro", w:3.6,h:2.4,pos:"ด้าน A"},
    {prod:"fixed_glass",  w:2.4,h:2.4,pos:"ด้าน B"},
    {prod:"casement_euro",w:1.8,h:2.4,pos:"ด้าน C"},
    {prod:"fixed_glass",  w:3.0,h:2.4,pos:"ด้าน D"},
  ],
  roof:{prod:"roof_laminate",w:9.0,h:4.0},
}];

// ============================================================
// helper: render FULL-D (แยก เพราะมี 3 ชุด array)
// ============================================================
function renderFullD() {
  clearItems();
  setF2("discFlat", 0); setF2("discPct", 0);
  setF2("custName", "รวมตัวอย่างใบจริง FullD"); setF2("qdate", "08-06-69");
  w.eval("window._calcQuoteOrig = calcQuote; calcQuote = function(){};");
  JOB_FULL_D_ITEMS.forEach(addItem);
  for (const cfg of JOB_FULL_D_GH_SETS) addGlasshouseSet2(cfg);
  JOB_FULL_D_EXTRA.forEach(addItem);
  for (const cfg of JOB_FULL_D_GH_SETS2) addGlasshouseSet2(cfg);
  w.eval("calcQuote = window._calcQuoteOrig;");
  w.calcQuote(); w.genQuote();
  return readFinancials();
}

// ============================================================
// EXPECTED: ยอดจากไฟล์ HTML อ้างอิง (ดึงมือ)
// ============================================================
const EXPECTED = {
  "quote-06": { subtotal:1033000,  disc:null,  afterDisc:null, vat:72310,   grand:1105310 },
  "quote-07": { subtotal:364000,   disc:null,  afterDisc:null, vat:25480,   grand:389480  },
  "quote-08": { subtotal:287800,   disc:null,  afterDisc:null, vat:20146,   grand:307946  },
  "quote-09": { subtotal:1429600,  disc:null,  afterDisc:null, vat:100072,  grand:1529672 },
  "quote-10": { subtotal:1037000,  disc:null,  afterDisc:null, vat:72590,   grand:1109590 },
  "FULL-A":   { subtotal:714000,   disc:3000,  afterDisc:711000,vat:49770,  grand:760770  },
  "FULL-B":   { subtotal:7853300,  disc:2000,  afterDisc:7851300,vat:549591,grand:8400891 },
  "FULL-C":   { subtotal:1288100,  disc:5000,  afterDisc:1283100,vat:89817, grand:1372917 },
  "FULL-D":   { subtotal:2202000,  disc:null,  afterDisc:null, vat:154140,  grand:2356140 },
};

// ============================================================
// run all renders + compare
// ============================================================
const TESTS = [
  { name:"quote-06", renderFn: () => renderJob(JOB_06) },
  { name:"quote-07", renderFn: () => renderJob(JOB_07) },
  { name:"quote-08", renderFn: () => renderJob(JOB_08) },
  { name:"quote-09", renderFn: () => renderJob(JOB_09) },
  { name:"quote-10", renderFn: () => renderJob(JOB_10) },
  { name:"FULL-A",   renderFn: () => renderJob(JOB_FULL_A) },
  { name:"FULL-B",   renderFn: () => renderFullB() },
  { name:"FULL-C",   renderFn: () => renderJob(JOB_FULL_C) },
  { name:"FULL-D",   renderFn: () => renderFullD() },
];

const fmt = (n) => n == null ? "(null)" : n.toLocaleString("th-TH", {minimumFractionDigits:2,maximumFractionDigits:2});
const fmtI = (n) => n == null ? "(null)" : Math.round(n).toLocaleString("th-TH");

const allResults = [];

for (const t of TESTS) {
  let actual = {};
  try {
    actual = t.renderFn();
  } catch(e) {
    console.error("RENDER ERROR in", t.name, e.message);
    actual = { subtotal:null, disc:null, afterDisc:null, vat:null, grand:null };
  }
  const exp = EXPECTED[t.name];
  allResults.push({ name: t.name, exp, actual });
}

// ============================================================
// print results
// ============================================================
console.log("\n=== QA Tester #3 — Cross-check Financial Totals ===\n");
console.log("วันที่ทดสอบ: 2026-06-09");
console.log("baseline: FULL-A=760,770 · FULL-B=8,229,691 (ก่อนแก้) → อ้างอิงใหม่จากไฟล์\n");

let totalPass = 0, totalFail = 0, totalCase = 0;

for (const r of allResults) {
  const { name, exp, actual } = r;
  console.log("─".repeat(72));
  console.log(`ใบ: ${name}`);
  console.log(`${"หัวข้อ".padEnd(22)} | ${"คาดหวัง".padStart(16)} | ${"คำนวณได้".padStart(16)} | ตรง? | ผลต่าง`);
  console.log(`${"-".repeat(22)} | ${"-".repeat(16)} | ${"-".repeat(16)} | ${"-".repeat(4)} | ${"-".repeat(12)}`);

  const fields = [
    { key:"subtotal",  label:"ราคารวมงาน (ก่อนลด)" },
    { key:"disc",      label:"ส่วนลด" },
    { key:"afterDisc", label:"หลังหักส่วนลด" },
    { key:"vat",       label:"VAT 7%" },
    { key:"grand",     label:"รวมทั้งสิ้น" },
  ];

  let quoteFail = 0;
  for (const f of fields) {
    const ev = exp[f.key];
    const av = actual[f.key];
    if (ev == null && av == null) continue;

    // compare (allow 1 baht rounding)
    let ok = false;
    let diff = null;
    if (ev != null && av != null) {
      diff = Math.round(av) - Math.round(ev);
      ok = Math.abs(diff) <= 1;
    } else if (ev == null) {
      ok = true; // ไม่มี expected → skip check
    } else {
      ok = false; // expected มีแต่ actual null
      diff = null;
    }

    const mark = (ev == null) ? "---" : (ok ? "PASS" : "FAIL");
    if (!ok && ev != null) quoteFail++;

    const diffStr = diff == null ? "-" : (diff === 0 ? "0" : (diff > 0 ? "+" : "") + fmtI(diff));
    const evStr = ev == null ? "(ไม่เช็ค)" : fmtI(ev);
    const avStr = av == null ? "(null)" : fmtI(av);
    console.log(`${f.label.padEnd(22)} | ${evStr.padStart(16)} | ${avStr.padStart(16)} | ${mark.padEnd(4)} | ${diffStr}`);

    totalCase++;
    if (ev != null) { if (ok) totalPass++; else totalFail++; }
  }

  // VAT verification (manual cross-check)
  if (actual.afterDisc != null && actual.vat != null) {
    const base = actual.afterDisc;
    const expectedVat = Math.round(base * 0.07 * 100) / 100;
    const vatOk = Math.abs(expectedVat - actual.vat) <= 1;
    console.log(`${"[verify] VAT=afterDisc×7%".padEnd(22)} | ${fmtI(expectedVat).padStart(16)} | ${fmtI(actual.vat).padStart(16)} | ${vatOk?"PASS":"FAIL"} | ${fmtI(actual.vat - expectedVat)}`);
    if (!vatOk) quoteFail++;
  } else if (actual.subtotal != null && actual.vat != null && actual.disc == null) {
    // no discount case: vat = subtotal × 7%
    const base = actual.subtotal;
    const expectedVat = Math.round(base * 0.07 * 100) / 100;
    const vatOk = Math.abs(expectedVat - actual.vat) <= 1;
    console.log(`${"[verify] VAT=subtotal×7%".padEnd(22)} | ${fmtI(expectedVat).padStart(16)} | ${fmtI(actual.vat).padStart(16)} | ${vatOk?"PASS":"FAIL"} | ${fmtI(actual.vat - expectedVat)}`);
  }

  // Grand total verification: afterDisc + vat = grand (or subtotal + vat)
  const base2 = actual.afterDisc != null ? actual.afterDisc : actual.subtotal;
  if (base2 != null && actual.vat != null && actual.grand != null) {
    const expectedGrand = Math.round((base2 + actual.vat) * 100) / 100;
    const grandOk = Math.abs(expectedGrand - actual.grand) <= 1;
    console.log(`${"[verify] Grand=base+VAT".padEnd(22)} | ${fmtI(expectedGrand).padStart(16)} | ${fmtI(actual.grand).padStart(16)} | ${grandOk?"PASS":"FAIL"} | ${fmtI(actual.grand - expectedGrand)}`);
  }

  const quoteVerdict = quoteFail === 0 ? "PASS" : "FAIL (" + quoteFail + " จุด)";
  console.log(`\n>>> ใบ ${name}: ${quoteVerdict}\n`);
}

console.log("═".repeat(72));
console.log(`สรุปรวม: ตรวจ ${totalCase} จุด → PASS ${totalPass} / FAIL ${totalFail}`);
console.log(`FULL-A grand: ${fmt(allResults.find(r=>r.name==="FULL-A")?.actual?.grand)} (baseline: 760,770.00)`);
console.log(`FULL-B grand: ${fmt(allResults.find(r=>r.name==="FULL-B")?.actual?.grand)} (baseline ก่อนแก้: 8,229,691)`);

if (jsErrors.length) {
  console.log("\nJS errors (" + jsErrors.length + "):");
  jsErrors.slice(0,5).forEach(e => console.log("  " + e));
}

process.exit(totalFail === 0 ? 0 : 1);
