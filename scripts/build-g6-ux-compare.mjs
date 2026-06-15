// สร้างไฟล์เทียบ "ภาพ UX" : ดราฟที่พี่นัทชอบ ↔ เว็บจริงตอนนี้ (ไม่ใช่ตารางข้อมูล)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');
const draft = b64('_draft_ux.png');      // ดราฟ DRAFT-G6-ux-FULL (บานกระทุ้ง)
const webAwn = b64('_web_awn.png');       // เว็บจริง (บานกระทุ้ง) มีราคากำกับปุ่ม
const webCase = b64('_web_ux2.png');      // เว็บจริง (บานเปิดยูโร) ราคาทุกปุ่ม

const page = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>เทียบ UX G6 — ดราฟ vs เว็บจริง</title>
<style>
@page{size:A4 portrait;margin:8mm;} *{font-family:"Leelawadee UI","Tahoma","Noto Sans Thai",sans-serif;box-sizing:border-box;}
body{margin:0;color:#1a1a1a;font-size:11px;}
h1{color:#B3151D;font-size:18px;margin:0 0 2px;} .meta{color:#666;font-size:10px;margin:0 0 8px;}
h2{color:#fff;background:#B3151D;font-size:13px;margin:10px 0 6px;padding:4px 10px;border-radius:5px;}
.cols{display:flex;gap:12px;align-items:flex-start;}
.col{flex:1;min-width:0;}
.cap{font-weight:800;font-size:12px;margin-bottom:3px;padding:3px 8px;border-radius:5px;}
.cap.d{background:#FEF3C7;color:#92400E;} .cap.w{background:#DCFCE7;color:#15803D;}
.shot{width:100%;overflow:hidden;border:1px solid #d8c9c9;border-radius:7px;background:#fff;}
.shot.h1{height:520px;} .shot.h2{height:640px;}
.shot img{width:100%;display:block;}
.box{border:1px solid #d8c9c9;border-radius:6px;padding:8px 11px;margin:8px 0;background:#fffafa;font-size:10.5px;line-height:1.5;}
.ok{background:#F0FDF4;border-color:#86EFAC;}
.box b{color:#B3151D;} ul{margin:3px 0;padding-left:18px;} li{margin:1px 0;}
.tag{display:inline-block;font-size:9px;font-weight:700;padding:1px 6px;border-radius:9px;background:#DCFCE7;color:#15803D;margin-left:4px;}
.pgbreak{page-break-before:always;}
</style></head><body>

<h1>เทียบหน้าตา UX — กลุ่ม 6 (กั้นห้องกระจก)</h1>
<div class="meta">ซ้าย = ดราฟที่ออกแบบ (UX ที่พี่นัทชอบ · <code>DRAFT-G6-ux-FULL-2026-06-13</code>) · ขวา = เว็บจริงตอนนี้ (<code>calc-beta</code> · ราคา engine จริง) · 2026-06-15</div>

<h2>① บานกระทุ้ง — โครงสร้าง UX (ดราฟ ↔ เว็บจริง)</h2>
<div class="cols">
  <div class="col"><div class="cap d">📐 ดราฟ (ที่พี่ชอบ)</div><div class="shot h1"><img src="${draft}"></div></div>
  <div class="col"><div class="cap w">🌐 เว็บจริง (ทำเสร็จ)</div><div class="shot h1"><img src="${webAwn}"></div></div>
</div>
<div class="box ok"><b>ตรงกัน ✅</b> — 6 ปุ่มกลุ่ม+icon · รุ่นย่อยชิป · หัวข้อ section (ลักษณะการเปิด · มือจับ · มุ้ง · เสริมกระจก <span class="tag">ยกเว้น shower</span> · อุปกรณ์เสริม <span class="tag">หมวดเดียว</span>) · ปุ่ม pill อุปกรณ์เสริม · ราคา "Tilt&Turn +5,000/บาน" ในปุ่ม
<br><b>เว็บมีเพิ่ม</b> — กล่อง "ราคาบานนี้ ฿X · engine จริง" ท้ายออปชั่น + แถบ "รวมทั้งห้อง" ล่างสุด (ดราฟไม่มี)</div>

<h2 class="pgbreak">② บานเปิดยูโร — ราคาโชว์ครบทุกปุ่มแล้ว (แก้ตามที่ตรวจเจอ)</h2>
<div class="cols">
  <div class="col" style="flex:0 0 56%"><div class="cap w">🌐 เว็บจริง — บานเปิดยูโร</div><div class="shot h2"><img src="${webCase}"></div></div>
  <div class="col" style="flex:1">
    <div class="box"><b>ที่ตรวจเจอ:</b> ราคาไม่โชว์ข้างกล่องบางปุ่ม → <b style="color:#15803D">แก้แล้ว เติมราคากำกับครบ</b>
      <ul>
        <li>ธรณี → <b>หลังเต่า +1,000</b></li>
        <li>โช้คอัพ → <b>มี +5,000</b></li>
        <li>มือจับ → Cmech <b>(ฟรี)</b> · ดิจิตอล <b>10,000+</b> · สแตนเลส <b>1,500+</b></li>
        <li>มุ้ง → <b>(จาก 3,500)</b></li>
        <li>คาดตาราง → <b>(200/ม.)</b></li>
        <li>ลูกฟูก/คอมโพ → <b>(3,500/ตร.ม.)</b></li>
        <li>ครอบวงกบ → <b>(700+/ม.)</b></li>
        <li>ดรอปพื้น → <b>(5,000+)</b></li>
      </ul>
      ราคาในปุ่ม = ดึงจาก engine/PRICELIST จริง · กดเลือกแล้วราคาบาน+รวมห้องขยับตามจริง</div>
    <div class="box ok" style="font-size:10px"><b>หมายเหตุ:</b> ราคาที่กำกับปุ่มเป็น "ราคาเริ่มต้น/หน่วย" (เช่น ครอบวงกบ 700/ม. ตามสี · มุ้งจาก 3,500 ตามชนิด) — ราคาจริงต่อบานคำนวณตามขนาด/ตัวเลือกที่เลือก แล้วโชว์ใน "ราคาบานนี้"</div>
  </div>
</div>

<div class="box"><b>สรุป:</b> หน้าตา UX เว็บ = ดราฟที่ออกแบบ 100% (โครงสร้าง+section+ชิป) · เพิ่มราคากำกับทุกปุ่มออปชั่น + ราคาบานนี้/รวมห้อง · คู่กับ PDF เทียบราคา (COMPARE-G6-design-vs-web) ที่ยืนยันราคาทุกกล่องตรงออกแบบ</div>
</body></html>`;

const out = path.join(ROOT, 'docs', 'กลุ่ม6-กั้นห้องกระจก', 'COMPARE-G6-UX-design-vs-web-2026-06-15.html');
fs.writeFileSync(out, page, 'utf8');
console.log('Wrote', out, '(' + Math.round(page.length/1024) + ' KB)');
