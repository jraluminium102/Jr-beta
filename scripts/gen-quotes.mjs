// gen-quotes.mjs — สร้างใบเสนอราคาทดสอบ 10 ราย (งานใหญ่ 5-6 รายการ/ใบ)
// คิดราคาจริงผ่าน engine เครื่องคิดราคา (jsdom) → render ใบ JR → เซฟ HTML
// (แปลงเป็น PDF ด้วย Edge headless ในขั้นถัดไป)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "ใบเสนอราคาทดสอบ");
mkdirSync(OUT, { recursive: true });

const html = readFileSync(join(ROOT, "public/calculator/index.html"), "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: "http://localhost/" });
await new Promise((r) => { dom.window.addEventListener("load", r); setTimeout(r, 1500); });
const w = dom.window, doc = w.document;
const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
function setField(ch, sel, v) { const el = ch.querySelector(sel); if (el) { el.value = String(v); fire(el, "input"); fire(el, "change"); } }
function addItem() { w.addItem(doc.getElementById("items")); const chs = doc.querySelectorAll("#items .ch"); return chs[chs.length - 1]; }
function clearItems() { doc.getElementById("items").innerHTML = ""; }

// คิดราคา 1 รายการ → คืน {prodName, area, unit, msg}
function price(it) {
  clearItems();
  const ch = addItem();
  setField(ch, ".i-group", it.g);
  const ps = ch.querySelector(".i-prod");
  if (!ps.querySelector('option[value="' + it.prod + '"]')) ps.innerHTML = w.prodOptionsG6(String(it.g));
  ps.value = it.prod; fire(ps, "change");
  const prodName = ps.selectedOptions[0]?.textContent || it.prod;
  if (it.w != null) setField(ch, ".i-w", it.w);
  if (it.h != null) setField(ch, ".i-h", it.h);
  if (it.panels != null) setField(ch, ".i-panels", it.panels);
  if (it.qty != null) setField(ch, ".i-qty", it.qty);
  for (const [sel, val] of Object.entries(it.opts || {})) setField(ch, sel, val);
  const r = w.readItem(ch).r;
  return { prodName, area: r.a, unit: r.sell, msg: (r.msgs || [])[0] || "" };
}

const baht = (n) => Math.round(n).toLocaleString("th-TH");
const TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

// ---- 10 งานทดสอบ (ลูกค้า + 5-6 รายการ งานใหญ่ ต่างกันทุกใบ) ----
const JOBS = [
  { cust:"คุณทดสอบ มานะ (บ้านเดี่ยว 2 ชั้น)", area:"ลาดพร้าว กทม.", tel:"081-000-0001", items:[
    {g:1,prod:"sliding_euro",desc:"ประตูบานเลื่อน 4 บาน ยูโร (โถงหน้าบ้าน)",w:3.6,h:2.4,panels:4,qty:1},
    {g:1,prod:"casement_euro",desc:"ประตูบานเปิดคู่ ยูโร (ห้องนอนใหญ่)",w:1.6,h:2.2,panels:2,qty:2},
    {g:1,prod:"fixed_glass",desc:"กระจกติดตาย ช่องแสงโถงบันได",w:2.0,h:3.0,qty:1},
    {g:1,prod:"awning_euro",desc:"หน้าต่างบานกระทุ้ง ยูโร (ห้องน้ำ)",w:0.8,h:1.0,qty:4},
    {g:1,prod:"folding",desc:"ประตูบานเฟี้ยม 6 บาน (ออกสวนหลัง)",w:3.6,h:2.4,panels:6,qty:1},
    {g:2,prod:"imp3",desc:"ราวกันตกบันได เสาอลู (บันไดเฉียง)",w:6.0,qty:1,opts:{".o-zgrp":""}},
  ]},
  { cust:"บจก. ทดสอบ ก่อสร้าง (สำนักงาน 3 ชั้น)", area:"รัชดา กทม.", tel:"02-000-0002", items:[
    {g:1,prod:"sliding_sms",desc:"ประตูบานเลื่อน SMS หน้าออฟฟิศ",w:3.0,h:2.4,panels:4,qty:3},
    {g:1,prod:"fixed_glass",desc:"ผนังกระจกติดตาย Façade",w:2.4,h:3.0,qty:6},
    {g:1,prod:"casement_dseries",desc:"หน้าต่างบานเปิด D-Series",w:1.2,h:1.5,panels:1,qty:8},
    {g:3,prod:"roof_vinyl",desc:"หลังคาไวนิล ทางเดินเชื่อมอาคาร",w:4.0,h:6.0,qty:1},
    {g:2,prod:"imp1",desc:"ราวกันตกระเบียง หมุดแปะปูน",w:12.0,qty:1},
  ]},
  { cust:"คุณทดสอบ สุดา (ร้านกาแฟ)", area:"ทองหล่อ กทม.", tel:"089-000-0003", items:[
    {g:1,prod:"frameless_fixed",desc:"กระจกเปลือยติดตาย หน้าร้าน",w:2.0,h:2.8,qty:3},
    {g:1,prod:"frameless_door",desc:"ประตูกระจกเปลือย บานสวิง",w:0.9,h:2.4,qty:2},
    {g:1,prod:"fixed_glass",desc:"กระจกติดตาย ช่องแสงด้านข้าง",w:1.5,h:2.8,qty:2},
    {g:1,prod:"awning_aluinch",desc:"บานกระทุ้งอลูนิ้ว (ระบายอากาศ)",w:0.6,h:0.8,qty:4},
    {g:5,prod:"imp23",desc:"มุ้งเฟรมใหญ่ ประตูหลังร้าน",w:1.8,h:2.1,qty:1},
  ]},
  { cust:"คุณทดสอบ วิชัย (คอนโด-ระเบียง)", area:"พระราม 9 กทม.", tel:"062-000-0004", items:[
    {g:7,prod:"zipscreen",desc:"ม่านซิป ระเบียงหน้า (กันแดด-ฝน)",w:3.0,h:2.8,qty:1,opts:{".o-zgrp":"retail",".o-zmodel":"auto",".o-zfab":"5",".o-zctrl":"aok220"}},
    {g:7,prod:"zipscreen",desc:"ม่านซิป ระเบียงข้าง (โปร่ง 10%)",w:2.4,h:2.6,qty:1,opts:{".o-zgrp":"retail",".o-zmodel":"Z120",".o-zfab":"10",".o-zctrl":"dooya"}},
    {g:1,prod:"sliding_euro",desc:"ประตูบานเลื่อน ยูโร ออกระเบียง",w:2.4,h:2.4,panels:2,qty:1},
    {g:5,prod:"imp23",desc:"มุ้งเฟรมใหญ่ ประตูระเบียง",w:2.4,h:2.4,qty:1},
    {g:1,prod:"fixed_glass",desc:"กระจกติดตาย ราวกันตกระเบียง",w:3.0,h:1.1,qty:1},
  ]},
  { cust:"คุณทดสอบ ประไพ (ต่อเติมกั้นห้องกระจก)", area:"นนทบุรี", tel:"081-000-0005", items:[
    {g:6,prod:"glasshouse",desc:"กั้นห้องกระจกพร้อมหลังคา (8 ด้าน)",opts:{".o-ghprice":"506000",".o-ghroom":"ห้องอเนกประสงค์+ซักล้าง"}},
    {g:7,prod:"zipscreen",desc:"ม่านซิป ด้านที่โดนแดดบ่าย",w:4.0,h:3.0,qty:1,opts:{".o-zgrp":"retail",".o-zmodel":"Z120",".o-zfab":"5",".o-zctrl":"aok220"}},
    {g:1,prod:"sliding_euro",desc:"ประตูบานเลื่อน เข้า-ออกห้องกระจก",w:2.4,h:2.4,panels:2,qty:1},
    {g:5,prod:"imp23",desc:"มุ้งเฟรมใหญ่ ประตูห้องกระจก",w:2.4,h:2.4,qty:1},
    {g:2,prod:"imp4",desc:"ราวกันตก บันไดตรง หมุดแปะปูน",w:4.0,qty:1},
  ]},
  { cust:"บจก. ทดสอบ อุตสาหกรรม (โรงงาน)", area:"สมุทรปราการ", tel:"02-000-0006", items:[
    {g:3,prod:"roof_vinyl",desc:"หลังคาไวนิล คลุมลานจอด",w:8.0,h:12.0,qty:1},
    {g:3,prod:"roof_polyton",desc:"หลังคาโพลีตัน ทางเดินเชื่อม",w:3.0,h:10.0,qty:1},
    {g:3,prod:"isowall",desc:"ผนัง Isowall กั้นห้องเครื่อง",w:4.0,h:3.0,qty:2},
    {g:1,prod:"sliding_sms",desc:"ประตูบานเลื่อน SMS หน้าโรงงาน",w:4.0,h:2.6,panels:4,qty:2},
    {g:1,prod:"fixed_glass",desc:"กระจกติดตาย ห้องควบคุม",w:2.0,h:2.0,qty:4},
    {g:2,prod:"fence_gate",desc:"ประตูรั้วอลูมิเนียม",w:4.0,h:1.8,qty:1},
  ]},
  { cust:"คุณทดสอบ ธนกร (บ้านหรู)", area:"เอกมัย กทม.", tel:"089-000-0007", items:[
    {g:1,prod:"casement_xseries",desc:"ประตูบานเปิด X-Series (ตัวบ้านหลัก)",w:1.8,h:2.6,panels:2,qty:3},
    {g:1,prod:"sliding_eseries",desc:"ประตูบานเลื่อน E-Series (ห้องรับแขก)",w:4.0,h:2.6,panels:4,qty:1},
    {g:1,prod:"fixed_glass",desc:"กระจกติดตาย ช่องแสงสูง (Double height)",w:3.0,h:4.0,qty:1},
    {g:1,prod:"pivot",desc:"ประตูบานหมุน ทางเข้าหลัก",w:1.2,h:2.6,qty:1},
    {g:1,prod:"curved_fixed",desc:"กระจกดัดโค้งติดตาย โถงบันได",w:2.5,h:2.6,qty:1},
    {g:2,prod:"imp1",desc:"ราวกันตก บันไดเฉียง หมุดแปะปูน",w:5.0,qty:1},
  ]},
  { cust:"คุณทดสอบ กนกพร (ทาวน์โฮม 3 ชั้น)", area:"บางนา กทม.", tel:"062-000-0008", items:[
    {g:1,prod:"sliding_sms",desc:"ประตูบานเลื่อน SMS หน้าบ้าน",w:3.0,h:2.4,panels:4,qty:1},
    {g:1,prod:"casement_euro",desc:"หน้าต่างบานเปิด ยูโร (ทุกชั้น)",w:1.2,h:1.4,panels:1,qty:9},
    {g:1,prod:"awning_euro",desc:"บานกระทุ้ง ยูโร (ห้องน้ำ)",w:0.6,h:0.8,qty:3},
    {g:1,prod:"fixed_glass",desc:"กระจกติดตาย ช่องบันได",w:1.2,h:2.8,qty:2},
    {g:7,prod:"zipscreen",desc:"ม่านซิป ระเบียงชั้นดาดฟ้า",w:3.5,h:2.5,qty:1,opts:{".o-zgrp":"retail",".o-zmodel":"auto",".o-zfab":"5",".o-zctrl":"aok220"}},
  ]},
  { cust:"บจก. ทดสอบ รีสอร์ท (วิลล่าริมน้ำ)", area:"ภูเก็ต", tel:"076-000-0009", items:[
    {g:6,prod:"glasshouse",desc:"กั้นห้องกระจก Sala ริมสระ",opts:{".o-ghprice":"680000",".o-ghroom":"Pool Sala"}},
    {g:7,prod:"zipscreen",desc:"ม่านซิป Sala ด้านทะเล (PET ใส)",w:5.0,h:3.0,qty:2,opts:{".o-zgrp":"project",".o-zmodel":"Z120W",".o-zfab":"PET",".o-zctrl":"aok50n"}},
    {g:1,prod:"sliding_euro",desc:"ประตูบานเลื่อน ยูโร ห้องพัก",w:3.0,h:2.6,panels:3,qty:6},
    {g:1,prod:"frameless_door",desc:"ประตูกระจกเปลือย ห้องอาบน้ำ",w:0.9,h:2.2,qty:6},
    {g:3,prod:"roof_laminate",desc:"หลังคากระจกลามิเนต ทางเดิน",w:3.0,h:8.0,qty:1},
  ]},
  { cust:"คุณทดสอบ อนุชา (อาคารพาณิชย์ 4 ชั้น)", area:"อุดรธานี", tel:"081-000-0010", items:[
    {g:1,prod:"sliding_eseries",desc:"ประตูบานเลื่อน E-Series หน้าร้าน",w:4.0,h:3.0,panels:4,qty:1},
    {g:1,prod:"fixed_glass",desc:"ผนังกระจกติดตาย Façade ชั้น 1",w:2.0,h:3.0,qty:8},
    {g:1,prod:"casement_dseries",desc:"หน้าต่างบานเปิด D-Series ชั้นบน",w:1.2,h:1.5,panels:1,qty:12},
    {g:3,prod:"roof_vinyl",desc:"หลังคาไวนิล ดาดฟ้า",w:6.0,h:8.0,qty:1},
    {g:2,prod:"imp3",desc:"ราวกันตก ระเบียงทุกชั้น เสาอลู",w:16.0,qty:1},
    {g:2,prod:"bar_grid_z",desc:"ระแนงบังตา หน้าอาคาร",w:4.0,h:3.0,qty:1},
  ]},
];

function quoteHTML(job, idx) {
  const now = new Date(2026, 5, 4); // 4 มิ.ย. 2569 (ค่าคงที่กันสุ่ม)
  const beYear = 2569, seq = String(idx + 1).padStart(3, "0");
  const code = "JR2026-" + seq;
  const dateTH = now.getDate() + " " + TH[5] + " พ.ศ. " + beYear;
  let subtotal = 0;
  const rows = job.items.map((it, i) => {
    const p = price(it);
    const line = Math.round(p.unit) * (it.qty || 1);
    subtotal += line;
    const size = it.w != null ? (it.h != null ? `${it.w}×${it.h} ม.` : `ยาว ${it.w} ม.`) : "เหมาทั้งชุด";
    return `<tr>
      <td class="c">${i + 1}</td>
      <td><div class="nm">${it.desc}</div><div class="dt">${p.prodName}${p.msg ? " · " + p.msg : ""}</div></td>
      <td class="c">${size}</td>
      <td class="c">${it.qty || 1}</td>
      <td class="r">${baht(p.unit)}</td>
      <td class="r">${baht(line)}</td></tr>`;
  }).join("");
  const vat = Math.round(subtotal * 0.07);
  const grand = subtotal + vat;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<style>
@page{size:A4;margin:14mm 12mm;}
*{box-sizing:border-box;font-family:"Sarabun","Leelawadee UI","Noto Sans Thai","Segoe UI",Tahoma,sans-serif;}
body{margin:0;color:#1F2937;font-size:13px;}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #B3151D;padding-bottom:12px;}
.logo{font-size:30px;font-weight:800;color:#E61E28;font-style:italic;letter-spacing:-1px;}
.logo small{display:block;font-size:11px;color:#6B7280;font-style:normal;font-weight:600;letter-spacing:0;}
.qt{text-align:right;}
.qt h1{margin:0;color:#B3151D;font-size:22px;}
.qt .sub{font-size:12px;color:#6B7280;}
.meta{display:flex;justify-content:space-between;margin:14px 0;font-size:13px;}
.meta b{color:#B3151D;}
table{width:100%;border-collapse:collapse;margin-top:6px;}
th{background:#B3151D;color:#fff;padding:8px 6px;text-align:left;font-size:12px;}
th.c,td.c{text-align:center;} th.r,td.r{text-align:right;}
td{padding:7px 6px;border-bottom:1px solid #E5E7EB;vertical-align:top;}
.nm{font-weight:600;} .dt{font-size:11px;color:#6B7280;margin-top:2px;}
.tot{margin-top:12px;margin-left:auto;width:46%;font-size:13px;}
.tot .l{display:flex;justify-content:space-between;padding:4px 0;}
.tot .g{display:flex;justify-content:space-between;border-top:2px solid #B3151D;margin-top:4px;padding-top:8px;font-weight:800;font-size:16px;color:#B3151D;}
.note{font-size:11px;color:#6B7280;margin-top:20px;border-top:1px solid #E5E7EB;padding-top:10px;line-height:1.7;}
.sign{display:flex;justify-content:space-between;margin-top:28px;font-size:12px;text-align:center;}
.sign div{width:40%;} .sign .ln{border-top:1px dotted #9CA3AF;margin-top:40px;padding-top:6px;}
</style></head><body>
<div class="head">
  <div class="logo">JR<small>Aluminium &amp; Glass</small></div>
  <div class="qt"><h1>ใบเสนอราคา</h1><div class="sub">เลขที่ ${code}</div><div class="sub">วันที่ ${dateTH}</div></div>
</div>
<div class="meta">
  <div><b>ลูกค้า:</b> ${job.cust}<br><b>โทร:</b> ${job.tel}</div>
  <div style="text-align:right;"><b>สถานที่:</b> ${job.area}<br><b>ยืนราคา:</b> 15 วัน</div>
</div>
<table>
  <thead><tr><th class="c" style="width:32px;">#</th><th>รายการ</th><th class="c" style="width:90px;">ขนาด</th><th class="c" style="width:44px;">จำนวน</th><th class="r" style="width:90px;">ราคา/หน่วย</th><th class="r" style="width:100px;">จำนวนเงิน</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="tot">
  <div class="l"><span>รวมเป็นเงิน</span><span>${baht(subtotal)}.00 บาท</span></div>
  <div class="l"><span>ภาษีมูลค่าเพิ่ม 7%</span><span>${baht(vat)}.00 บาท</span></div>
  <div class="g"><span>จำนวนเงินรวมทั้งสิ้น</span><span>${baht(grand)}.00 บาท</span></div>
</div>
<div class="note">• ราคานี้รวมค่าติดตั้งแล้ว (ยกเว้นระบุเป็นอื่น) · รวมภาษีมูลค่าเพิ่ม 7%<br>
• ผลิตประมาณ 30-45 วันหลังยืนยันแบบและรับมัดจำ · รับประกันงานติดตั้ง 1 ปี<br>
• ค่านั่งร้าน/งานสูงพิเศษ คิดตามหน้างานจริง · ใบเสนอราคานี้เป็นการทดสอบระบบ</div>
<div class="sign"><div><div class="ln">ผู้เสนอราคา (JR Aluminium &amp; Glass)</div></div><div><div class="ln">ผู้อนุมัติสั่งซื้อ / ลูกค้า</div></div></div>
</body></html>`;
}

const index = [];
JOBS.forEach((job, i) => {
  const fn = `quote-${String(i + 1).padStart(2, "0")}.html`;
  writeFileSync(join(OUT, fn), quoteHTML(job, i), "utf8");
  index.push(fn);
});
writeFileSync(join(OUT, "_list.txt"), index.join("\n"), "utf8");
console.log("สร้าง HTML " + JOBS.length + " ใบ ที่ " + OUT);
