// gen-quotes-full.mjs — 2 ใบทดสอบครบ: ใบ A = งานบาน/กระจกทุกตัว (G1)+ช่องแสง · ใบ B = ทุก product id ใน PRODUCTS (ยกเว้น SKIP พิเศษ)
// ใส่ option ครบทุกรายการอัตโนมัติ (เลือกทุก dropdown .o-* + ติ๊ก checkbox) · คิดราคาจริงผ่าน genQuote
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "ใบเสนอราคาทดสอบ");
mkdirSync(OUT, { recursive: true });
const calcHtml = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const STYLE = (calcHtml.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
const dom = new JSDOM(calcHtml, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: "http://localhost/" });
await new Promise((r) => { dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
{ const sp = doc.getElementById("svc-protect"); if (sp && sp.checked) { sp.checked = false; fire(sp, "change"); } }
function setF(ch, sel, v) { const el = ch.querySelector(sel); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } }
function setF2(id, v) { const el = doc.getElementById(id); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } }
function clearItems() { doc.getElementById("items").innerHTML = ""; }

// ดึง PRODUCTS จาก window — PRODUCTS เป็น block-scoped const ใน HTML จึงต้อง eval expose ก่อน
w.eval("window.__PRODUCTS__ = PRODUCTS;");
const ALL_PRODUCTS = w.__PRODUCTS__;

// map cat → group number (ตาม _GM ใน prodOptionsG6)
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

// product ids ที่ต้อง skip (config พิเศษหรือ free-form)
const SKIP = new Set(["glass_replace", "custom_item"]);
// product ids ที่แยกใส่ manual config ใน jobB ด้านล่าง
const MANUAL_IDS = new Set(["shower", "frameless_door", "zipscreen", "fixed_glass"]);

function enableAllOpts(ch) {
  // เลือก option ทุก dropdown .o-* (ตัวที่ 2) + ติ๊ก checkbox .o-* ตัวแรกๆ — "ใส่ออฟชั่นครบ"
  ch.querySelectorAll(".i-opts select").forEach((sel) => {
    // ธรณี (.o-thresh) option[1]=หลังเต่า+DropSeal เป็น upgrade คิดเงิน +1,000 — test คงค่ามาตรฐาน (std) เพื่อรักษา anchor
    if (sel.classList.contains("o-thresh")) return;
    if (sel.options && sel.options.length > 1 && !sel.multiple) {
      sel.value = sel.options[1].value; fire(sel, "change");
    }
  });
  // สี/กระจก ตัวที่ 2 (โชว์ในรายละเอียดงาน)
  const c = ch.querySelector(".i-color"); if (c && c.options.length > 1) { c.value = c.options[1].value; fire(c, "change"); }
  const g = ch.querySelector(".i-glass"); if (g && g.options.length > 1) { g.value = g.options[1].value; fire(g, "change"); }
}

function addItem(it) {
  w.addItem(doc.getElementById("items"));
  const chs = doc.querySelectorAll("#items .ch"); const ch = chs[chs.length - 1];
  setF(ch, ".i-group", it.g);
  const ps = ch.querySelector(".i-prod");
  // ถ้า option ยังไม่มีตัวที่ต้องการ inject ใหม่
  if (!ps.querySelector('option[value="' + it.prod + '"]')) ps.innerHTML = w.prodOptionsG6(String(it.g));
  ps.value = it.prod; fire(ps, "change");
  if (it.w != null) setF(ch, ".i-w", it.w);
  if (it.h != null) setF(ch, ".i-h", it.h);
  if (it.panels != null) setF(ch, ".i-panels", it.panels);
  if (it.qty != null) setF(ch, ".i-qty", it.qty);
  if (it.pos) setF(ch, ".i-position", it.pos);
  if (it.itype) setF(ch, ".i-type", it.itype); // ประตู(door)/หน้าต่าง(window)
  if (it.override != null) setF(ch, ".i-override", it.override);
  if (it.auto !== false) enableAllOpts(ch);
  for (const [s, v] of Object.entries(it.opts || {})) setF(ch, s, v);
  if (it.note) setF(ch, ".i-note", it.note);
  // #2: inject sub-items (บานย่อย) ผ่าน addSubItem
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

const ZIP = (grp, model, fab, ctrl) => ({ ".o-zgrp": grp, ".o-zmodel": model, ".o-zfab": fab, ".o-zctrl": ctrl });

// ===== addGlasshouseSet2 — สร้างชุดกั้นห้องกระจกด้วย flow ใหม่ (ระบบชุด) =====
// cfg = { name, sides:[{prod,w,h,pos},...], roof:{prod,w,h} }
// ใช้ addGlasshouseSet() + .set-addpart + .set-addroof ตาม flow จริง
function addGlasshouseSet2(cfg) {
  const sb = w.addGlasshouseSet(); // สร้าง setbox + ch แรก group6 pos "ด้าน A"
  // ตั้งชื่อชุด
  const sn = sb.querySelector(".set-name");
  if (sn) { sn.value = cfg.name || "กั้นห้องกระจก"; fire(sn, "input"); fire(sn, "change"); }

  // กำหนด ด้าน A (ch แรกที่มีอยู่แล้ว)
  const parts = sb.querySelector(".set-parts");
  let chs = parts.querySelectorAll(".ch");
  const sides = cfg.sides || [];
  if (sides.length > 0) {
    const s0 = sides[0];
    const ch0 = chs[0];
    if (s0.prod) {
      const ps = ch0.querySelector(".i-prod");
      if (ps && !ps.querySelector('option[value="' + s0.prod + '"]')) ps.innerHTML = w.prodOptionsG6("6");
      if (ps) { ps.value = s0.prod; fire(ps, "change"); }
    }
    if (s0.w != null) setF(ch0, ".i-w", s0.w);
    if (s0.h != null) setF(ch0, ".i-h", s0.h);
    const pA = ch0.querySelector(".i-position");
    if (pA) { pA.value = s0.pos || "ด้าน A"; fire(pA, "input"); fire(pA, "change"); }
  }

  // เพิ่มด้านที่เหลือ (sides[1..]) ด้วยการคลิก .set-addpart (top btn)
  for (let i = 1; i < sides.length; i++) {
    const addBtn = sb.querySelector(".set-addpart");
    if (addBtn) fire(addBtn, "click");
    chs = parts.querySelectorAll(".ch");
    const chN = chs[chs.length - 1];
    const sN = sides[i];
    if (sN.prod) {
      const ps = chN.querySelector(".i-prod");
      if (ps && !ps.querySelector('option[value="' + sN.prod + '"]')) ps.innerHTML = w.prodOptionsG6("6");
      if (ps) { ps.value = sN.prod; fire(ps, "change"); }
    }
    if (sN.w != null) setF(chN, ".i-w", sN.w);
    if (sN.h != null) setF(chN, ".i-h", sN.h);
    const pN = chN.querySelector(".i-position");
    if (pN) { pN.value = sN.pos || ("ด้าน " + String.fromCharCode(64 + i + 1)); fire(pN, "input"); fire(pN, "change"); }
  }

  // เพิ่มหลังคา ด้วยการคลิก .set-addroof
  // หลังคลิก: group=3 ถูก set แล้วโดย click handler → prod options สำหรับ group3 พร้อมแล้ว
  if (cfg.roof) {
    const roofBtn = sb.querySelector(".set-addroof");
    if (roofBtn) fire(roofBtn, "click");
    chs = parts.querySelectorAll(".ch");
    const roofCh = chs[chs.length - 1];
    const r = cfg.roof;
    if (r.prod) {
      const ps = roofCh.querySelector(".i-prod");
      // options ถูก inject โดย group=3 change event แล้ว → set value ตรงได้
      if (ps) { ps.value = r.prod; fire(ps, "change"); }
    }
    if (r.w != null) setF(roofCh, ".i-w", r.w);
    if (r.h != null) setF(roofCh, ".i-h", r.h);
    const rPos = roofCh.querySelector(".i-position");
    if (rPos && !rPos.value.trim()) { rPos.value = "หลังคา"; fire(rPos, "input"); }
  }

  return sb;
}

// ===== ใบ A: เหมือนงานจริง (สินค้าผสมแบบลูกค้าจริง ~8 รายการ) =====
// glasshouse เป็น set → ใช้ sets[] แยกจาก items[] ปกติ
const jobA = { cust: "คุณปิยะ มงคล (บ้านเดี่ยว 2 ชั้น)", date: "04-06-69",
  discFlat: 3000, // ทดสอบ pattern ส่วนลด → โชว์บล็อกยอด 5 บรรทัด
  items: [
    // #2: ทดสอบบานย่อย — ประตูโถงหน้าบ้าน มีช่องแสงติดตายบนเป็นบานย่อย
    { g: 1, prod: "sliding_euro", pos: "ประตู โถงหน้าบ้าน", w: 3.6, h: 2.4, panels: 4, qty: 1,
      subItems: [{type:'ช่องแสงติดตาย', w:3.6, h:0.5}] },
    { g: 1, prod: "casement_euro", pos: "หน้าต่าง ห้องนอนใหญ่", itype: "window", w: 1.6, h: 2.2, panels: 2, qty: 2 },
    { g: 1, prod: "awning_euro", pos: "หน้าต่าง ห้องน้ำ", itype: "window", w: 0.8, h: 1.0, qty: 3 },
    { g: 1, prod: "folding", pos: "ประตู เชื่อมระเบียงหลัง", w: 4.0, h: 2.4, panels: 4, qty: 1 },
    // กั้นห้องกระจก → แทรกด้วย sets[] ด้านล่าง (ลำดับใบ: 4 items ก่อน → set → 3 items หลัง)
    { g: 7, prod: "zipscreen", pos: "ม่านซิป ระเบียงชั้น 2", w: 3.0, h: 2.8, qty: 1, auto: false, opts: ZIP("retail", "auto", "5", "aok220") },
    { g: 5, prod: "imp23", pos: "มุ้งเฟรมใหญ่ ประตูระเบียง", w: 1.8, h: 2.1, qty: 1 },
    { g: 1, prod: "fixed_glass", pos: "ช่องแสง เหนือประตูหน้าบ้าน", w: 3.6, h: 0.5, qty: 1,
      note: "OPTION : เปลี่ยนเป็นกระจกลามิเนต 4+4 มม. ราคาเพิ่มตามจริง\nหมายเหตุ : ช่องแสงคู่กับประตูหน้าบ้าน" },
  ],
  // sets ถูก inject ระหว่าง render (หลัง items[3] = folding)
  sets: [
    { afterItemIdx: 3, cfg: {
      name: "กั้นห้องกระจก ระเบียงหลังบ้าน",
      sides: [
        { prod: "sliding_euro", w: 3.6, h: 2.4, pos: "ด้าน A" },
        { prod: "fixed_glass",  w: 2.4, h: 2.4, pos: "ด้าน B" },
        { prod: "casement_euro", w: 1.8, h: 2.4, pos: "ด้าน C" },
      ],
      roof: { prod: "roof_vinyl", w: 9.0, h: 3.5 },
    }},
  ],
};

// ===== ใบ B: ครบทุก product id ใน PRODUCTS =====
// กำหนดขนาดวนตาม index เพื่อเทสหลายขนาด
const B_SIZES = [[1.2, 1.2], [1.8, 2.0], [2.4, 2.2], [3.6, 2.4], [0.9, 2.1], [2.0, 1.5]];
// products ที่ต้องการ override ราคา (custom_price หรือ min:0 ไม่มีตาราง)
const OVERRIDE_PRICE = {
  casement_flush_solid: 35000,
  casement_inset_solid: 35000,
  bar_grid_z: 0,    // bar_grid คำนวณผ่าน engine เอง (per_sqm × area)
  bar_slide: 0,     // bar_slide คำนวณผ่าน engine
  bar_openclose: 0, // bar_openclose คำนวณผ่าน engine
  grid_bars: 0,     // grid:1 ต้องกรอก nh/nv → ใส่ opts แทน
};
// opts พิเศษต่อ product id
const PRODUCT_OPTS = {
  grid_bars: { ".o-nh": "3", ".o-nv": "3", ".o-gridcolor": "200", ".o-nc": "0" },
  ceil_cshape: { ".o-ckolor": "ขาว-ดำ" },
  ceil_bsc:    { ".o-ckolor": "มาตรฐาน(ขาว-ซิลเวอร์)" },
};

// ========== สร้าง items สำหรับ jobB จาก PRODUCTS ทั้งหมด ==========
function buildJobBItems() {
  const items = [];
  let autoIdx = 0;

  // --- วนทุก product ที่ไม่ใช่ skip / manual / เสริม (ยกเว้น g:2) ---
  for (const p of ALL_PRODUCTS) {
    if (SKIP.has(p.id)) continue;
    if (MANUAL_IDS.has(p.id)) continue;
    // cat:'เสริม' ข้าม ยกเว้น p.g===2 (steel_mesh, imp34 ซึ่งอยู่ใน G2 จริง)
    if (p.cat === 'เสริม' && p.g !== 2) continue;

    // หา group จาก cat หรือ p.g
    const g = p.g || CAT_TO_GROUP[p.cat] || 1;

    const [w, h] = B_SIZES[autoIdx % B_SIZES.length];
    autoIdx++;

    // ตัดคำรุ่นซ้ำในชื่อ pos
    const pos = p.name
      .replace(/\s*(เซมิยูโร|ยูโร|สลิม|SMS|aluinch|E-series|D-series|X-series|Velora)\s*/g, " ")
      .replace(/\s*\([^)]*\)/g, " ")  // ตัดวงเล็บทั้งหมดออกจากหัวข้อ test ให้สะอาด (งานจริงเซลล์พิมพ์ตำแหน่งเอง)
      .replace(/\s+/g, " ").trim()
      .slice(0, 60);

    const item = { g, prod: p.id, pos, w, h, panels: (autoIdx % 3) + 1, qty: 1 };

    // ราวกันตก — ใช้ w เป็นความยาว (ม.) ไม่ใช้ h
    if (p.handrail) { item.h = null; item.qty = 1; }

    // products ที่ต้องการ override ราคา
    if (OVERRIDE_PRICE[p.id] !== undefined && OVERRIDE_PRICE[p.id] > 0) {
      item.override = OVERRIDE_PRICE[p.id];
    }

    // opts พิเศษ
    if (PRODUCT_OPTS[p.id]) { item.opts = PRODUCT_OPTS[p.id]; }

    items.push(item);
  }

  // --- Manual items: ต้องกรอก config พิเศษ ---
  // shower 2 config
  items.push({ g: 1, prod: "shower", pos: "shower กั้นห้องน้ำ (ประตู+ติดตาย)", w: 1.2, h: 2.0, qty: 1, auto: false, opts: { ".o-shtype": "door_fixed", ".o-shdoortype": "swing" } });
  items.push({ g: 1, prod: "shower", pos: "shower กั้นห้องน้ำ (ติดตายเดี่ยว)", w: 0.9, h: 2.0, qty: 1, auto: false, opts: { ".o-shtype": "fixed_only" } });
  // frameless สวิง + เลื่อน
  items.push({ g: 1, prod: "frameless_door", pos: "ประตูบานเปลือยสวิง (สีดำ)", w: 0.9, h: 2.1, qty: 1, auto: false, opts: { ".o-frametype": "swing", ".o-framecolor": "ดำ" } });
  items.push({ g: 1, prod: "frameless_door", pos: "ประตูบานเปลือยเลื่อน (สีขาว)", w: 1.6, h: 2.1, qty: 1, auto: false, opts: { ".o-frametype": "sliding", ".o-framecolor": "ขาว" } });
  // G7 ม่านซิป หลายผ้า
  items.push({ g: 7, prod: "zipscreen", pos: "ม่านซิป ระเบียง (5%)", w: 3.0, h: 2.8, qty: 1, auto: false, opts: ZIP("retail", "auto", "5", "aok220") });
  items.push({ g: 7, prod: "zipscreen", pos: "ม่านซิป หน้าต่าง (ทึบ 0%)", w: 2.0, h: 2.4, qty: 1, auto: false, opts: ZIP("retail", "Z100", "0", "manual") });
  // ช่องแสง
  items.push({ g: 1, prod: "fixed_glass", pos: "ช่องแสงเหนือประตูห้องกระจก (ติดตาย)", w: 2.4, h: 0.5, qty: 1 });

  return items;
}

// กั้นห้องกระจก ×3 ชุด — สร้างด้วย addGlasshouseSet2 หลัง items ปกติ
// เก็บเป็น array แยก เพราะ render ต้องเรียกหลัง items ทั้งหมด (set อยู่ท้ายใบ B)
const JOB_B_GH_SETS = [
  { name: "กั้นห้องกระจก ชั้น 1 (ห้องนั่งเล่น)",
    sides: [
      { prod: "sliding_euro", w: 4.2, h: 2.4, pos: "ด้าน A (ประตูเลื่อน)" },
      { prod: "fixed_glass",  w: 3.0, h: 2.4, pos: "ด้าน B (ติดตาย)" },
      { prod: "casement_euro", w: 1.8, h: 2.4, pos: "ด้าน C (ประตูบานเปิด)" },
      { prod: "fixed_glass",  w: 3.0, h: 2.4, pos: "ด้าน D (ติดตาย)" },
    ],
    roof: { prod: "roof_std", w: 12.6, h: 4.0 },
  },
  { name: "กั้นห้องกระจก ชั้น 2 (ห้องอเนกประสงค์)",
    sides: [
      { prod: "folding", w: 3.6, h: 2.4, pos: "ด้าน A (บานเฟี้ยม)" },
      { prod: "awning_euro", w: 2.4, h: 1.2, pos: "ด้าน B (บานกระทุ้ง)" },
      { prod: "fixed_glass", w: 2.4, h: 2.4, pos: "ด้าน C (ติดตาย)" },
    ],
    roof: { prod: "roof_delight", w: 8.4, h: 3.0 },
  },
  { name: "กั้นห้องกระจก ระเบียงหลังบ้าน",
    sides: [
      { prod: "sliding_euro", w: 3.0, h: 2.2, pos: "ด้าน A" },
      { prod: "fixed_glass",  w: 2.0, h: 2.2, pos: "ด้าน B" },
    ],
    roof: { prod: "roof_std", w: 6.0, h: 3.0 },
  },
];

const jobB = {
  cust: "คุณทดสอบ ครบทุกสินค้า (เทสเต็มระบบ)",
  date: "04-06-69",
  discFlat: 2000,
  items: buildJobBItems(),
  // กั้นห้องกระจก ×3 ชุด ต่อท้ายรายการปกติ
  ghSets: JOB_B_GH_SETS,
};

function render(job, code) {
  clearItems();
  setF2("discFlat", job.discFlat || 0); setF2("discPct", 0);
  setF2("custName", job.cust); setF2("qdate", job.date);
  setF2("sellerName", "เซลล์ไล้"); setF2("custContact", job.cust + " (Line)");
  setF2("custPhone", "08X-XXX-XXXX"); setF2("custAddress", "เลขที่ — หมู่ — ต.— อ.— จ.— 00000 (ที่อยู่ทดสอบระบบ)");
  // ปิด calcQuote ชั่วคราวระหว่าง add items เพื่อประสิทธิภาพ (200+ items)
  w.eval("window._calcQuoteOrig = calcQuote; calcQuote = function(){};");

  // jobA: sets[] ถูก inject ตาม afterItemIdx — render items + sets ตามลำดับ
  if (job.sets && job.sets.length) {
    // แปลง sets → set indexed by afterItemIdx
    const setsByAfter = {};
    for (const s of job.sets) setsByAfter[s.afterItemIdx] = s.cfg;
    job.items.forEach((it, idx) => {
      addItem(it);
      if (setsByAfter[idx] != null) addGlasshouseSet2(setsByAfter[idx]);
    });
  } else {
    job.items.forEach(addItem);
  }

  // ghSets: กั้นห้องกระจกชุดท้ายใบ B
  if (job.ghSets && job.ghSets.length) {
    for (const cfg of job.ghSets) addGlasshouseSet2(cfg);
  }

  w.eval("calcQuote = window._calcQuoteOrig;");
  w.calcQuote(); w.genQuote();
  const inner = doc.getElementById("quoteContent").innerHTML;
  const out = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
${STYLE}
@page{size:A4;margin:9mm 9mm 18mm 9mm;}
html,body{background:#fff !important;}
#sheet{max-width:800px;margin:0 auto;background:#fff;}
.quote{box-shadow:none !important;border-radius:0 !important;background:#fff !important;color:#1f2937 !important;max-width:100% !important;}
@media print{ body *{visibility:visible !important;} #sheet,#sheet *{visibility:visible !important;} }
</style></head><body><div id="sheet"><div class="quote">${inner}</div></div></body></html>`;
  writeFileSync(join(OUT, code + ".html"), out, "utf8");
  // นับรายการ: items ปกติ + จำนวน ch ในทุก setbox
  const totalChs = [...doc.querySelectorAll("#items .ch")].length;
  return totalChs;
}
const nA = render(jobA, "quote-FULL-A");
const nB = render(jobB, "quote-FULL-B");
console.log("สร้าง quote-FULL-A (" + nA + " รายการ) + quote-FULL-B (" + nB + " รายการ)");

// ========== log สรุป product coverage ==========
const allNonSkip = ALL_PRODUCTS.filter(p =>
  !SKIP.has(p.id) &&
  !(p.cat === 'เสริม' && p.g !== 2)
);
const jobBIds = new Set(jobB.items.map(it => it.prod));
// ชุดกั้นห้องกระจก (group6+group3) ไม่ใช่ product แล้ว → นับแยก (+1) ถ้าใบ B มีชุดกั้นห้อง
const hasGHSet = (jobB.ghSets && jobB.ghSets.length > 0) ? 1 : 0;
const missing = allNonSkip.filter(p => !jobBIds.has(p.id));
const coveredCount = allNonSkip.filter(p => jobBIds.has(p.id)).length + hasGHSet;
const totalCount = allNonSkip.length + hasGHSet; // +1 virtual "ชุดกั้นห้องกระจก"
console.log(`\nPRODUCTS ทั้งหมด (ไม่นับ SKIP/เสริม): ${totalCount} ตัว (รวม 1 virtual ชุดกั้นห้องกระจก)`);
console.log(`ใบ B ครอบคลุม: ${coveredCount} ตัว`);
if (missing.length > 0) {
  console.log(`ขาด (${missing.length} ตัว): ${missing.map(p => p.id).join(', ')}`);
} else {
  console.log(`ครอบคลุมทุกตัวแล้ว (coverage=${coveredCount}/${totalCount})`);
}
process.exit(0); // ปิด process ทันที กัน jsdom ค้าง event loop (zombie task)
