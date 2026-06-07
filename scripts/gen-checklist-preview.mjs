// สร้าง HTML ตัวอย่างหน้า "เช็คลิสต์" (หลังสางเหลือ tick-list ล้วน)
// ใช้ชุดเช็คจริง 3 ชุดจาก seed 0012 — รัน: node scripts/gen-checklist-preview.mjs
import { writeFileSync, mkdirSync } from "node:fs";

// ชุดเช็ค 3 ชุด (ตรงกับ seed ใน 0012_checklists.sql หลังสาง)
// each item: [seq, text, requiresSign]  · demo: checked/note สำหรับโชว์ state
const TEMPLATES = [
  {
    name: "ช่างวัดหน้างาน",
    roles: ["แอดมิน", "ฝ่ายผลิต", "ช่างติดตั้ง"],
    items: [
      [10, "วัดช่องเปิดจริง (กว้าง × สูง ทุกช่อง)", false, true, "ด้าน A 2.40×2.10 / ด้าน B 3.00×2.10"],
      [20, "ชนิดผนัง (ปูน / เบา / เหล็ก / อื่น ๆ)", false, true, "ผนังปูน"],
      [30, "ระดับพื้น / ผนังตรง (ระบุผลต่างถ้ามี)", false, false, ""],
      [40, "ทิศบาน (สำหรับงานบานเปิด/บานเลื่อน)", false, false, ""],
      [50, "สภาพผนังรอบช่อง (แตกร้าว/ชื้น/ฉาบใหม่)", false, false, ""],
      [60, "ลายเซ็นผู้วัดหน้างาน", true, false, ""],
    ],
  },
  {
    name: "เซลล์ปิดงาน",
    roles: ["แอดมิน", "เซลล์"],
    items: [
      [10, "ยืนยันสีอลูมิเนียม (รหัสสี/ชื่อสี)", false, true, "สีอบขาว"],
      [20, "ยืนยันชนิดกระจก (ใส/เขียว/เทมเปอร์/ลามิเนต)", false, true, "เขียว 6 มม."],
      [30, "ยืนยันทิศเปิด-ปิดบาน", false, false, ""],
      [40, "ระบุกำหนดส่ง: ผลิต / ติดตั้ง", false, false, ""],
      [50, "เงื่อนไขมัดจำ/ชำระเงิน", false, false, ""],
      [60, "ลายเซ็นลูกค้ายืนยันรายการ", true, false, ""],
    ],
  },
  {
    name: "ฝ่ายผลิต",
    roles: ["แอดมิน", "ฝ่ายผลิต"],
    items: [
      [10, "ตรวจจำนวนรายการครบ (ตามใบสั่งผลิต)", false, false, ""],
      [20, "ตรวจสีอลูมิเนียมครบ / แยกล็อตสีถ้ามีหลายสี", false, false, ""],
      [30, "กระจกพิเศษ (เทมเปอร์/ลามิเนต) — สั่งล่วงหน้าแล้ว?", false, false, ""],
      [40, "งานเร่ง — ยืนยันกำหนดส่ง + แจ้งทีม", false, false, ""],
      [50, "วัดหน้างานแล้วก่อนผลิต", false, false, ""],
      [60, "QC ก่อนส่ง + ลายเซ็นผู้ตรวจ", true, false, ""],
    ],
  },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function item([seq, text, sign, checked, note]) {
  return `
    <div class="item ${checked ? "checked" : ""}">
      <span class="box">${checked ? "✓" : ""}</span>
      <div class="body">
        <div class="txt">${seq}. ${esc(text)}${sign ? ' <span class="sign">ต้องเซ็น</span>' : ""}</div>
        ${checked && note ? `<div class="note">หมายเหตุ: ${esc(note)}</div>` : `<div class="noteph">หมายเหตุ (ถ้ามี)</div>`}
      </div>
    </div>`;
}

function card(t) {
  const done = t.items.filter((i) => i[3]).length;
  return `
  <div class="card">
    <div class="chead">
      <div>
        <div class="cname">${esc(t.name)}</div>
        <div class="roles">${t.roles.map((r) => `<span class="role">${esc(r)}</span>`).join("")}</div>
        <div class="count">${done}/${t.items.length} รายการ</div>
      </div>
      <button class="save">บันทึก</button>
    </div>
    ${t.items.map(item).join("")}
  </div>`;
}

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ตัวอย่างเช็คลิสต์ (Draft)</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
*{box-sizing:border-box}
body{font-family:'Sarabun',sans-serif;background:#eceef1;color:#1a1a1a;margin:0;padding:22px 12px;font-size:14px}
.wrap{max-width:680px;margin:0 auto}
h1{font-size:18px;color:#7d0f15;margin:0 0 6px}
.sub{color:#667;font-size:13px;margin-bottom:14px}
.note{background:#fff8e1;border:1px solid #f1d98a;border-radius:10px;padding:12px 16px;font-size:13px;color:#6b5800;margin-bottom:18px}
.card{background:#fff;border-radius:16px;padding:18px;margin-bottom:16px;box-shadow:0 2px 10px rgba(0,0,0,.07)}
.chead{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
.cname{font-weight:700;color:#7d0f15;font-size:15px}
.roles{margin-top:4px}
.role{display:inline-block;background:#f5e6e6;color:#7d0f15;font-size:11px;border-radius:5px;padding:2px 7px;margin-right:4px}
.count{font-size:12px;color:#889;margin-top:5px}
.save{background:#b3151d;color:#fff;border:none;border-radius:11px;padding:9px 18px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;height:fit-content}
.item{display:flex;gap:11px;align-items:flex-start;border:1px solid #e5e7eb;border-radius:12px;padding:11px 13px;margin-bottom:8px;background:#fff}
.item.checked{background:#f0fdf4;border-color:#bbf7d0}
.box{width:18px;height:18px;border:1.5px solid #9aa;border-radius:4px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:12px;margin-top:1px}
.item.checked .box{background:#22c55e;border-color:#22c55e}
.body{flex:1;min-width:0}
.txt{font-size:14px}
.item.checked .txt{text-decoration:line-through;color:#8a9}
.sign{display:inline-block;background:#dbeafe;color:#1e60c0;font-size:11px;border-radius:5px;padding:1px 7px;margin-left:6px;vertical-align:middle}
.item.checked .sign{text-decoration:none}
.note{font-size:12px;color:#555;margin-top:5px}
.noteph{font-size:12px;color:#bbc;margin-top:6px;border:1px dashed #dde;border-radius:8px;padding:5px 9px}
</style></head><body>
<div class="wrap">
<h1>ตัวอย่างเช็คลิสต์ (Draft)</h1>
<div class="sub">หน้าจอเช็คลิสต์ในระบบ (หลังสางเหลือ tick-list ล้วน)</div>
<div class="note"><b>เช็คลิสต์ = เตือนให้คุยลูกค้า/เตรียมงานครบ</b> — ติ๊ก + ใส่หมายเหตุ + กดบันทึก<br>
• <b>สางแล้ว</b>: เอาแถบสีเตือนอัตโนมัติ (ของเก่า) ออกหมด — ของพวกนั้นย้ายไปอยู่ "ใบปะหน้า" แล้ว<br>
• <b>เก็บไว้</b>: ป้าย "ต้องเซ็น" (สำหรับข้อที่ต้องมีลายเซ็นยืนยัน)<br>
• แต่ละคนเห็น<b>เฉพาะชุดของบทบาทตัวเอง</b> (ป้ายสีชมพูบอกว่าใครเห็นชุดนั้น) — ตัวอย่างนี้โชว์ทั้ง 3 ชุด</div>
${TEMPLATES.map(card).join("")}
</div>
</body></html>`;

mkdirSync("ใบเสนอราคาทดสอบ", { recursive: true });
writeFileSync("ใบเสนอราคาทดสอบ/checklist-preview.html", html, "utf8");
console.log("✅ สร้างแล้ว: ใบเสนอราคาทดสอบ/checklist-preview.html");
