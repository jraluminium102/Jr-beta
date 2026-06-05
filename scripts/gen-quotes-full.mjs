// gen-quotes-full.mjs — 2 ใบทดสอบครบ: ใบ A = งานบาน/กระจกทุกตัว (G1)+ช่องแสง · ใบ B = ทุกหมวด G2-G7 + กั้นห้องกระจก×3 + ช่องแสง
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

// product ids per group (จาก prodOptionsG6) + label map
function idsOf(g) { return [...w.prodOptionsG6(String(g)).matchAll(/value="([^"]+)">([^<]+)</g)].map(m => ({ id: m[1], name: m[2] })); }
const G1 = idsOf(1);
const SKIP = new Set(["glass_replace", "custom_item"]); // ต้องกรอก option พิเศษ — ข้ามในโหมด auto

function enableAllOpts(ch) {
  // เลือก option ทุก dropdown .o-* (ตัวที่ 2) + ติ๊ก checkbox .o-* ตัวแรกๆ — "ใส่ออฟชั่นครบ"
  ch.querySelectorAll(".i-opts select").forEach((sel) => {
    if (sel.options && sel.options.length > 1 && !sel.multiple) {
      // เลี่ยง option ที่ทำให้ราคาผิดเพี้ยน (เว้น Cmech ราคา/มือจับ JR Prime เฉพาะบาง) — เลือกตัวที่ 2 พอ
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
  if (!ps.querySelector('option[value="' + it.prod + '"]')) ps.innerHTML = w.prodOptionsG6(String(it.g));
  ps.value = it.prod; fire(ps, "change");
  if (it.w != null) setF(ch, ".i-w", it.w);
  if (it.h != null) setF(ch, ".i-h", it.h);
  if (it.panels != null) setF(ch, ".i-panels", it.panels);
  if (it.qty != null) setF(ch, ".i-qty", it.qty);
  if (it.pos) setF(ch, ".i-position", it.pos);
  if (it.auto !== false) enableAllOpts(ch);
  for (const [s, v] of Object.entries(it.opts || {})) setF(ch, s, v);
  if (it.note) setF(ch, ".i-note", it.note);
  return ch;
}

const GH = (room, price) => ({ ".o-ghroom": room, ".o-ghcolor": "sahara", ".o-ghglass": "กระจกเขียว/ใส หนา 6 มม.",
  ".o-ghgutter": "รางน้ำอลูมิเนียม + ตะแกรงพลาสติกกันใบไม้", ".o-ghmosq": "มุ้งเฟรมเล็ก (ด้าน B, E)", ".o-ghlock": "ชุดล็อคพร้อมกุญแจ (ประตูด้าน C)",
  ".o-ghside-A": "ติดตายเต็มผนัง", ".o-ghside-B": "ประตูบานเปิดคู่ + ติดตายข้าง", ".o-ghside-C": "บานเลื่อน 2 ราง",
  ".o-ghside-D": "ติดตาย + ช่องแสงบน", ".o-ghside-E": "ประตูบานเปิดเดี่ยว", ".o-ghroof": "หลังคาไวนิล (แปคู่) โครงอลูมิเนียม + รางน้ำอลู + ตะแกรงกันใบไม้",
  ".o-ghprice": String(price), ".o-ghnote-inc": "รื้อหลังคาเดิม / ทำสีปิด / ตัดท่อแอร์ 1 จุด", ".o-ghnote-exc": "รื้อพื้น / ลงเข็ม / ทำคาน / ปูกระเบื้อง / เดินไฟ" });
const ZIP = (grp, model, fab, ctrl) => ({ ".o-zgrp": grp, ".o-zmodel": model, ".o-zfab": fab, ".o-zctrl": ctrl });

// ===== ใบ A: เหมือนงานจริง (สินค้าผสมแบบลูกค้าจริง ~8 รายการ) =====
const jobA = { cust: "คุณปิยะ มงคล (บ้านเดี่ยว 2 ชั้น)", date: "04-06-69",
  discFlat: 3000, // ทดสอบ pattern ส่วนลด → โชว์บล็อกยอด 5 บรรทัด
  items: [
    { g: 1, prod: "sliding_euro", pos: "ประตู โถงหน้าบ้าน", w: 3.6, h: 2.4, panels: 4, qty: 1 },
    { g: 1, prod: "casement_euro", pos: "หน้าต่าง ห้องนอนใหญ่", w: 1.6, h: 2.2, panels: 2, qty: 2 },
    { g: 1, prod: "awning_euro", pos: "หน้าต่าง ห้องน้ำ", w: 0.8, h: 1.0, qty: 3 },
    { g: 1, prod: "folding", pos: "ประตู เชื่อมระเบียงหลัง", w: 4.0, h: 2.4, panels: 4, qty: 1 },
    { g: 6, prod: "glasshouse", pos: "กั้นห้องกระจก ระเบียงหลังบ้าน", auto: false, opts: GH("ระเบียงหลังบ้าน + ซักล้าง", 318000) },
    { g: 7, prod: "zipscreen", pos: "ม่านซิป ระเบียงชั้น 2", w: 3.0, h: 2.8, qty: 1, auto: false, opts: ZIP("retail", "auto", "5", "aok220") },
    { g: 5, prod: "imp23", pos: "มุ้งเฟรมใหญ่ ประตูระเบียง", w: 1.8, h: 2.1, qty: 1 },
    { g: 1, prod: "fixed_glass", pos: "ช่องแสง เหนือประตูหน้าบ้าน", w: 3.6, h: 0.5, qty: 1,
      note: "OPTION : เปลี่ยนเป็นกระจกลามิเนต 4+4 มม. ราคาเพิ่มตามจริง\nหมายเหตุ : ช่องแสงคู่กับประตูหน้าบ้าน" },
  ] };

// ===== ใบ B: ครบทุกสินค้า ทุกฟังก์ชัน (G1-G7) + เปลี่ยนขนาดวน + ออปชั่นครบ =====
const B_SIZES = [[1.2, 1.2], [1.8, 2.0], [2.4, 2.2], [3.6, 2.4], [0.9, 2.1], [2.0, 1.5]];
const B_SKIP = new Set([...SKIP, "shower", "frameless_door", "fixed_glass"]); // เพิ่มเองด้านล่างพร้อม config
const jobB = { cust: "คุณทดสอบ ครบทุกสินค้า (เทสเต็มระบบ)", date: "04-06-69", discFlat: 2000, items: [
  // G1 ทุกตัว — เปลี่ยนขนาดวน + panels/qty หลากหลาย + ออปชั่นครบ (auto)
  // pos = ชื่อสินค้า ตัดคำรุ่นซ้ำ (เซมิยูโร/ยูโร/สลิม/SMS) เพราะ tag รุ่นจะต่อท้ายในรายละเอียดอยู่แล้ว
  ...G1.filter(p => !B_SKIP.has(p.id)).map((p, i) => {
    const [w, h] = B_SIZES[i % B_SIZES.length];
    const pos = p.name.replace(/\s*(เซมิยูโร|ยูโร|สลิม|SMS)\s*/g, " ").replace(/\s+/g, " ").trim();
    return { g: 1, prod: p.id, pos, w, h, panels: (i % 3) + 1, qty: (i % 2) + 1 };
  }),
  // shower 2 config
  { g: 1, prod: "shower", pos: "shower ห้องน้ำ (ประตู+ติดตาย)", w: 1.2, h: 2.0, qty: 1, auto: false, opts: { ".o-shtype": "door_fixed", ".o-shdoortype": "swing" } },
  { g: 1, prod: "shower", pos: "shower ห้องน้ำ (ติดตายเดี่ยว)", w: 0.9, h: 2.0, qty: 1, auto: false, opts: { ".o-shtype": "fixed_only" } },
  // frameless สวิง + เลื่อน
  { g: 1, prod: "frameless_door", pos: "ประตูบานเปลือยสวิง (สีดำ)", w: 0.9, h: 2.1, qty: 1, auto: false, opts: { ".o-frametype": "swing", ".o-framecolor": "ดำ" } },
  { g: 1, prod: "frameless_door", pos: "ประตูบานเปลือยเลื่อน (สีขาว)", w: 1.6, h: 2.1, qty: 1, auto: false, opts: { ".o-frametype": "sliding", ".o-framecolor": "ขาว" } },
  // กั้นห้องกระจก ×3
  { g: 6, prod: "glasshouse", pos: "กั้นห้องกระจก ชั้น 1 (ห้องนั่งเล่น)", auto: false, opts: GH("ห้องนั่งเล่น ชั้น 1", 420000) },
  { g: 6, prod: "glasshouse", pos: "กั้นห้องกระจก ชั้น 2 (ห้องอเนกประสงค์)", auto: false, opts: GH("ห้องอเนกประสงค์ ชั้น 2", 506000) },
  { g: 6, prod: "glasshouse", pos: "กั้นห้องกระจก ระเบียงหลังบ้าน", auto: false, opts: GH("ระเบียงหลังบ้าน + ซักล้าง", 318000) },
  // G7 ม่านซิป หลายผ้า
  { g: 7, prod: "zipscreen", pos: "ม่านซิป ระเบียงกั้นห้อง (5%)", w: 3.0, h: 2.8, qty: 1, auto: false, opts: ZIP("retail", "auto", "5", "aok220") },
  { g: 7, prod: "zipscreen", pos: "ม่านซิป หน้าต่าง (ทึบ 0%)", w: 2.0, h: 2.4, qty: 1, auto: false, opts: ZIP("retail", "Z100", "0", "manual") },
  // G2 รั้ว/ระแนง/ราว
  { g: 2, prod: "fence_gate", pos: "ประตูรั้วอลูมิเนียม", w: 4.0, h: 1.8, qty: 1 },
  { g: 2, prod: "bar_grid_z", pos: "ระแนงบังตา หน้าบ้าน", w: 3.0, h: 2.4, qty: 1 },
  { g: 2, prod: "imp3", pos: "ราวกันตก บันไดเฉียง เสาอลู", w: 6.0, qty: 1 },
  { g: 2, prod: "rn1", pos: "ระแนงบังตา (ลายตัวแทน)", w: 2.0, h: 2.4, qty: 1 },
  { g: 2, prod: "rn37", pos: "ระแนงผนัง (ลายตัวแทน)", w: 2.0, h: 2.4, qty: 1 },
  { g: 2, prod: "steel_mesh", pos: "เหล็กดัด/ตะแกรงกันขโมย", w: 1.2, h: 1.5, qty: 1 },
  // G3 หลังคา/ฝ้า-ผนัง
  { g: 3, prod: "roof_vinyl", pos: "หลังคาไวนิล คลุมที่จอดรถ", w: 4.0, h: 6.0, qty: 1 },
  { g: 3, prod: "roof_laminate", pos: "หลังคากระจกลามิเนต ทางเดิน", w: 2.0, h: 4.0, qty: 1 },
  { g: 3, prod: "ceiling_smooth", pos: "ฝ้าเรียบใต้ชายคา", w: 2.0, h: 3.0, qty: 1 },
  { g: 3, prod: "isowall", pos: "ผนัง Isowall กั้นห้อง", w: 3.0, h: 2.6, qty: 1 },
  // G4 ตู้
  { g: 4, prod: "cabinet_alu", pos: "ตู้อลูมิเนียม (เก็บของ)", w: 1.2, h: 2.0, qty: 1 },
  // G5 มุ้ง หลายแบบ
  { g: 5, prod: "imp23", pos: "มุ้งเฟรมใหญ่ ประตูระเบียง", w: 1.8, h: 2.1, qty: 1 },
  { g: 5, prod: "imp28", pos: "มุ้งจีบ ตีนตะขาบ หน้าต่าง", w: 1.2, h: 1.2, qty: 1 },
  // ช่องแสง
  { g: 1, prod: "fixed_glass", pos: "ช่องแสงเหนือประตูห้องกระจก (ติดตาย)", w: 2.4, h: 0.5, qty: 1 },
] };

function render(job, code) {
  clearItems();
  setF2("discFlat", job.discFlat || 0); setF2("discPct", 0);
  setF2("custName", job.cust); setF2("qdate", job.date);
  setF2("sellerName", "เซลล์ไล้"); setF2("custContact", job.cust + " (Line)");
  setF2("custPhone", "08X-XXX-XXXX"); setF2("custAddress", "เลขที่ — หมู่ — ต.— อ.— จ.— 00000 (ที่อยู่ทดสอบระบบ)");
  job.items.forEach(addItem);
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
  return job.items.length;
}
const nA = render(jobA, "quote-FULL-A");
const nB = render(jobB, "quote-FULL-B");
console.log("สร้าง quote-FULL-A (" + nA + " รายการ) + quote-FULL-B (" + nB + " รายการ)");
