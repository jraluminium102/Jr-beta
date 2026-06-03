// gen-quotes.mjs — สร้างใบเสนอราคาทดสอบ 10 ราย โดยใช้ "genQuote ตัวจริง" ของเครื่องคิดราคา
// → ได้รูปแบบใบจริงของบานประตู (หัวบริษัทเต็ม + คอลัมน์ + หมายเหตุครบ) · ใส่ option ครบทุกชุด
// คิดราคาจริงผ่าน engine (jsdom) → ดึง #quoteContent → ห่อด้วย CSS เดิม → HTML (แปลง PDF ด้วย Edge)
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
// ใบจริงไม่บวก Protection อัตโนมัติ → ปิด checkbox svc-protect
{ const sp = doc.getElementById("svc-protect"); if (sp && sp.checked) { sp.checked = false; fire(sp, "change"); } }
function setF(ch, sel, v) { const el = ch.querySelector(sel); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } }
function clearItems() { doc.getElementById("items").innerHTML = ""; }

// ใส่ option ตัวเลือกที่ 2 ของ dropdown (ถ้ามี) เพื่อให้ใบโชว์ สี/กระจก แบบครบ
function pickSecond(ch, sel) {
  const el = ch.querySelector(sel);
  if (el && el.options && el.options.length > 1) { el.value = el.options[1].value; fire(el, "change"); }
}

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
  // ใส่ สี/กระจก แบบครบ (ถ้าช่องโชว์อยู่)
  if (it.color) { const c = ch.querySelector(".i-color"); if (c) { c.value = String(it.color); fire(c, "change"); } } else if (it.glassProduct) pickSecond(ch, ".i-color");
  if (it.glass) { const g = ch.querySelector(".i-glass"); if (g) { g.value = String(it.glass); fire(g, "change"); } }
  // ตำแหน่ง/ด้าน
  if (it.pos) setF(ch, ".i-position", it.pos);
  // option เฉพาะรายการ (.o-*)
  for (const [s, v] of Object.entries(it.opts || {})) setF(ch, s, v);
  return ch;
}

const TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

// glasshouse opts ครบ (โชว์ detail ยาวสวยแบบใบจริง)
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
const ZIP = (grp, model, fab, ctrl) => ({ ".o-zgrp": grp, ".o-zmodel": model, ".o-zfab": fab, ".o-zctrl": ctrl });

const JOBS = [
  { cust:"คุณทดสอบ มานะ ใจดี (บ้านเดี่ยว 2 ชั้น)", date:"04-06-69", items:[
    {g:1,prod:"sliding_euro",pos:"โถงหน้าบ้าน",w:3.6,h:2.4,panels:4,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"casement_euro",pos:"ห้องนอนใหญ่",w:1.6,h:2.2,panels:2,qty:2,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass",pos:"โถงบันได",w:2.0,h:3.0,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"awning_euro",pos:"ห้องน้ำ",w:0.8,h:1.0,qty:4,glassProduct:1},
    {g:1,prod:"folding",pos:"ออกสวนหลัง",w:3.6,h:2.4,panels:6,qty:1,glassProduct:1,glass:1},
    {g:2,prod:"imp3",pos:"บันไดเฉียง",w:6.0,qty:1},
  ]},
  { cust:"บจก. ทดสอบ ก่อสร้างไทย (สำนักงาน 3 ชั้น)", date:"04-06-69", items:[
    {g:1,prod:"sliding_sms",pos:"หน้าออฟฟิศ",w:3.0,h:2.4,panels:4,qty:3,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass",pos:"Façade ชั้น 1",w:2.4,h:3.0,qty:6,glassProduct:1,glass:1},
    {g:1,prod:"casement_dseries",pos:"ห้องทำงานชั้นบน",w:1.2,h:1.5,panels:1,qty:8,glassProduct:1,glass:1},
    {g:3,prod:"roof_vinyl",pos:"ทางเดินเชื่อมอาคาร",w:4.0,h:6.0,qty:1},
    {g:2,prod:"imp1",pos:"ระเบียงทุกชั้น",w:12.0,qty:1},
  ]},
  { cust:"คุณทดสอบ สุดา รักงาน (ร้านกาแฟ)", date:"04-06-69", items:[
    {g:1,prod:"frameless_fixed",pos:"หน้าร้าน",w:2.0,h:2.8,qty:3,glassProduct:1,glass:1},
    {g:1,prod:"frameless_door",pos:"ทางเข้า",w:0.9,h:2.4,qty:2,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass",pos:"ด้านข้าง",w:1.5,h:2.8,qty:2,glassProduct:1,glass:1},
    {g:1,prod:"awning_aluinch",pos:"ระบายอากาศ",w:0.6,h:0.8,qty:4,glassProduct:1},
    {g:5,prod:"imp23",pos:"ประตูหลังร้าน",w:1.8,h:2.1,qty:1},
  ]},
  { cust:"คุณทดสอบ วิชัย มั่งมี (คอนโด-ระเบียง)", date:"04-06-69", items:[
    {g:7,prod:"zipscreen",pos:"ระเบียงหน้า",w:3.0,h:2.8,qty:1,opts:ZIP("retail","auto","5","aok220")},
    {g:7,prod:"zipscreen",pos:"ระเบียงข้าง",w:2.4,h:2.6,qty:1,opts:ZIP("retail","Z120","10","dooya")},
    {g:1,prod:"sliding_euro",pos:"ออกระเบียง",w:2.4,h:2.4,panels:2,qty:1,glassProduct:1,glass:1},
    {g:5,prod:"imp23",pos:"ประตูระเบียง",w:2.4,h:2.4,qty:1},
    {g:1,prod:"fixed_glass",pos:"ราวกันตกระเบียง",w:3.0,h:1.1,qty:1,glassProduct:1,glass:1},
  ]},
  { cust:"คุณทดสอบ ประไพ สวยงาม (ต่อเติมกั้นห้องกระจก)", date:"04-06-69", items:[
    {g:6,prod:"glasshouse",pos:"ห้องอเนกประสงค์",opts:GH("ห้องอเนกประสงค์+ซักล้าง",506000)},
    {g:7,prod:"zipscreen",pos:"ด้านแดดบ่าย",w:4.0,h:3.0,qty:1,opts:ZIP("retail","Z120","5","aok220")},
    {g:1,prod:"sliding_euro",pos:"เข้า-ออกห้องกระจก",w:2.4,h:2.4,panels:2,qty:1,glassProduct:1,glass:1},
    {g:5,prod:"imp23",pos:"ประตูห้องกระจก",w:2.4,h:2.4,qty:1},
    {g:2,prod:"imp4",pos:"บันไดตรง",w:4.0,qty:1},
  ]},
  { cust:"บจก. ทดสอบ อุตสาหกรรมรุ่งเรือง (โรงงาน)", date:"04-06-69", items:[
    {g:3,prod:"roof_vinyl",pos:"คลุมลานจอด",w:8.0,h:12.0,qty:1},
    {g:3,prod:"roof_polyton",pos:"ทางเดินเชื่อม",w:3.0,h:10.0,qty:1},
    {g:3,prod:"isowall",pos:"ห้องเครื่อง",w:4.0,h:3.0,qty:2},
    {g:1,prod:"sliding_sms",pos:"หน้าโรงงาน",w:4.0,h:2.6,panels:4,qty:2,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass",pos:"ห้องควบคุม",w:2.0,h:2.0,qty:4,glassProduct:1,glass:1},
    {g:2,prod:"fence_gate",pos:"ทางเข้าโรงงาน",w:4.0,h:1.8,qty:1},
  ]},
  { cust:"คุณทดสอบ ธนกร เลิศหรู (บ้านหรู)", date:"04-06-69", items:[
    {g:1,prod:"casement_xseries",pos:"ตัวบ้านหลัก",w:1.8,h:2.6,panels:2,qty:3,glassProduct:1,glass:1},
    {g:1,prod:"sliding_eseries",pos:"ห้องรับแขก",w:4.0,h:2.6,panels:4,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass",pos:"ช่องแสงสูง Double-height",w:3.0,h:4.0,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"pivot",pos:"ทางเข้าหลัก",w:1.2,h:2.6,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"curved_fixed",pos:"โถงบันได",w:2.5,h:2.6,qty:1,glassProduct:1,glass:1},
    {g:2,prod:"imp1",pos:"บันไดเฉียง",w:5.0,qty:1},
  ]},
  { cust:"คุณทดสอบ กนกพร ตั้งใจ (ทาวน์โฮม 3 ชั้น)", date:"04-06-69", items:[
    {g:1,prod:"sliding_sms",pos:"หน้าบ้าน",w:3.0,h:2.4,panels:4,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"casement_euro",pos:"ทุกชั้น",w:1.2,h:1.4,panels:1,qty:9,glassProduct:1,glass:1},
    {g:1,prod:"awning_euro",pos:"ห้องน้ำ",w:0.6,h:0.8,qty:3,glassProduct:1},
    {g:1,prod:"fixed_glass",pos:"ช่องบันได",w:1.2,h:2.8,qty:2,glassProduct:1,glass:1},
    {g:7,prod:"zipscreen",pos:"ดาดฟ้า",w:3.5,h:2.5,qty:1,opts:ZIP("retail","auto","5","aok220")},
  ]},
  { cust:"บจก. ทดสอบ รีสอร์ทอันดามัน (วิลล่าริมน้ำ)", date:"04-06-69", items:[
    {g:6,prod:"glasshouse",pos:"Pool Sala",opts:GH("Pool Sala ริมสระ",680000)},
    {g:7,prod:"zipscreen",pos:"Sala ด้านทะเล",w:5.0,h:3.0,qty:2,opts:ZIP("project","Z120W","PET","aok50n")},
    {g:1,prod:"sliding_euro",pos:"ห้องพัก",w:3.0,h:2.6,panels:3,qty:6,glassProduct:1,glass:1},
    {g:1,prod:"frameless_door",pos:"ห้องอาบน้ำ",w:0.9,h:2.2,qty:6,glassProduct:1,glass:1},
    {g:3,prod:"roof_laminate",pos:"ทางเดิน",w:3.0,h:8.0,qty:1},
  ]},
  { cust:"คุณทดสอบ อนุชา ก้าวหน้า (อาคารพาณิชย์ 4 ชั้น)", date:"04-06-69", items:[
    {g:1,prod:"sliding_eseries",pos:"หน้าร้าน",w:4.0,h:3.0,panels:4,qty:1,glassProduct:1,glass:1},
    {g:1,prod:"fixed_glass",pos:"Façade ชั้น 1",w:2.0,h:3.0,qty:8,glassProduct:1,glass:1},
    {g:1,prod:"casement_dseries",pos:"ชั้นบน",w:1.2,h:1.5,panels:1,qty:12,glassProduct:1,glass:1},
    {g:3,prod:"roof_vinyl",pos:"ดาดฟ้า",w:6.0,h:8.0,qty:1},
    {g:2,prod:"imp3",pos:"ระเบียงทุกชั้น",w:16.0,qty:1},
    {g:2,prod:"bar_grid_z",pos:"หน้าอาคาร",w:4.0,h:3.0,qty:1},
  ]},
];

const list = [];
JOBS.forEach((job, i) => {
  clearItems();
  setF2("custName", job.cust);
  setF2("qdate", job.date);
  setF2("sellerName", "Sales Admin (ทดสอบ)");
  setF2("custContact", job.cust + " (Line)");
  setF2("custPhone", job.tel || "08X-XXX-XXXX");
  setF2("custAddress", job.addr || "เลขที่ — หมู่ — ต.— อ.— จ.— 00000 (ที่อยู่ทดสอบระบบ)");
  job.items.forEach(addItem);
  w.calcQuote();
  w.genQuote();
  const inner = doc.getElementById("quoteContent").innerHTML;
  const out = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
${STYLE}
/* ===== override: ใช้แสดงใบเดี่ยวๆ + กัน print CSS เดิมซ่อนเนื้อหา ===== */
@page{size:A4;margin:9mm 9mm 18mm 9mm;}
html,body{background:#fff !important;}
#sheet{max-width:800px;margin:0 auto;background:#fff;}
.quote{box-shadow:none !important;border-radius:0 !important;background:#fff !important;color:#1f2937 !important;max-width:100% !important;}
@media print{
  body *{visibility:visible !important;}
  #sheet,#sheet *{visibility:visible !important;}
}
</style></head><body><div id="sheet"><div class="quote">${inner}</div></div></body></html>`;
  const fn = `quote-${String(i + 1).padStart(2, "0")}.html`;
  writeFileSync(join(OUT, fn), out, "utf8");
  list.push(fn + "  ·  " + job.cust);
});
function setF2(id, v) { const el = doc.getElementById(id); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } }

writeFileSync(join(OUT, "_list.txt"), list.join("\n"), "utf8");
console.log("สร้างใบเสนอราคา (รูปแบบจริง genQuote) " + JOBS.length + " ใบ ที่ " + OUT);
