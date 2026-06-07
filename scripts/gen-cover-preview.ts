// สร้าง HTML ตัวอย่างใบปะหน้า — ใช้ deriveCoverSheet จริง + ข้อมูลใบจริง 3 ใบ
// รัน: node scripts/gen-cover-preview.ts  → ได้ไฟล์ ใบเสนอราคาทดสอบ/cover-preview.html
import { deriveCoverSheet } from "../src/lib/coverSheet.ts";
import { writeFileSync, mkdirSync } from "node:fs";

type Case = {
  customerName: string;
  warningLeft: string;
  warningRight: string;
  detail: string;
};

const CASES: Case[] = [
  {
    customerName: "คุณณัฐวดี (มด)",
    warningLeft: "",
    warningRight: "",
    detail: [
      "- ด้าน A บานกระจกติดตาย",
      "- ด้าน B ประตูบานเลื่อนลากจูงรางล่าง (รุ่นกันน้ำ) แบ่ง 3 บาน (มีมุ้งจีบ)",
      "- ด้าน C หน้าต่างบานเลื่อนสลับ",
      "- อลูมิเนียม สีอบขาว",
      "- กระจกเขียว หนา 6 มม.",
      "- มุ้งจีบ ผ้าไฟเบอร์ดำ",
      "หมายเหตุ — ราคาที่เสนอรวม: งานเสริมกล่องอลูมิเนียม สีอบขาว (ด้าน A) / งานดรอปพื้น (ด้าน B) / งานรื้อระแนงเดิม (ด้าน C)",
      "หมายเหตุ — ไม่รวม: สีทาเก็บงาน (ลูกค้าเตรียมวัสดุ)",
    ].join("\n"),
  },
  {
    customerName: "คุณอ้อ (วังทองหลาง) (จา)",
    warningLeft: "ระวังมุ้งผิด",
    warningRight: "งานพื้นช่างเพยาว์",
    detail: [
      "- ด้าน A หน้าต่างบานเลื่อนสลับ",
      "- ด้าน B ประตูบานเลื่อน",
      "- ด้าน C บานกระจกติดตาย",
      "- หลังคาไวนิล สีขาว",
      "- อลูมิเนียม สีอบขาว",
      "- กระจกเขียว หนา 6 มม.",
      "- มุ้งเฟรมเล็ก ผ้าไฟเบอร์เทา (ด้าน B)",
      "- มุ้งจีบ ผ้าไฟเบอร์เทา (ด้าน A, C)",
      "- รางน้ำ อลูมิเนียม",
      "- ตะแกรงพลาสติกกันใบไม้ สีดำ",
      '- ท่อน้ำทิ้ง PVC 2.5" สีขาว',
      "- สวิตช์ไฟ 1 จุด + ปลั๊กไฟ 9 จุด",
      "หมายเหตุ — ราคาที่เสนอรวม: เดินไฟดาวน์ไลท์ (ท่อลอย) 8 ดวง + สวิตช์ไฟ 1 จุด และปลั๊กไฟ 9 จุด",
    ].join("\n"),
  },
  {
    customerName: "คุณรุ่ง (ไล้)",
    warningLeft: "",
    warningRight: "",
    detail: [
      "- อลูมิเนียม สีเทาซาฮาร่า",
      "- หลังคาไวนิล สีขาว",
      "- หลังคาโพลีตัน 3 มม. สีออสเกรย์ (108S Aus Grey)",
      "- รางน้ำ อลูมิเนียม",
      "- ตะแกรงพลาสติกกันใบไม้ สีดำ",
      "- ท่อน้ำทิ้ง PVC 3 นิ้ว สีดำ",
      '- ระแนงอลูฯลายไม้ สีสักทอง SMS 1"x1.6"',
      "- ไฟเส้น LED 2 เส้น + สวิตช์ไฟ 1 จุด",
      "- เพลทเหล็ก",
      "หมายเหตุ — ราคาที่เสนอรวม: เดินไฟเส้น LED ฝังในระแนง 2 เส้น + สวิตช์ 1 จุด (จั๊มจากไฟเดิม) / ติดตั้งไฟ Solar Cell 2 จุด",
      "หมายเหตุ — ไม่รวม: ไฟ Solar Cell 2 ดวง (ลูกค้าเตรียม)",
    ].join("\n"),
  },
];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function nameMain(name: string) {
  return esc(name.split(/[()（）]/)[0].trim());
}
function nameNick(name: string) {
  const m = name.match(/[（(]([^)）]+)[)）]/);
  return m ? `(${esc(m[1])})` : "";
}

function col(lines: string[], red: boolean) {
  if (!lines.length) return '<span style="color:#bbb">—</span>';
  return lines
    .map((l) => `<div${red ? ' style="color:#c00"' : ""}>- ${esc(l)}</div>`)
    .join("");
}

function sheet(c: Case) {
  const cs = deriveCoverSheet({ items: [{ name: "x", detail: c.detail, qty: 1 }] } as any);
  return `
  <div class="sheet">
    <div class="head">
      <div class="warn">${c.warningLeft ? `*${esc(c.warningLeft)}*` : ""}</div>
      <div class="cust"><span class="lbl">ชื่อลูกค้า</span> ${nameMain(c.customerName)} <span class="nick">${nameNick(c.customerName)}</span></div>
      <div class="warn right">${c.warningRight ? `*${esc(c.warningRight)}*` : ""}</div>
    </div>
    <table>
      <thead><tr>
        <th>รายละเอียด สั่งของเตรียมผลิต</th>
        <th>รายละเอียด แจ้งช่างตอนติดตั้ง</th>
        <th>รายละเอียดแจ้งลูกค้า+เตรียมของติดตั้ง</th>
      </tr></thead>
      <tbody><tr>
        <td>${col(cs.prepare, false)}</td>
        <td>${col(cs.installerPrefill, true)}</td>
        <td>${col(cs.customerPrefill, true)}</td>
      </tr></tbody>
    </table>
    <div class="cap">ระบบเดาให้อัตโนมัติ: คอลัมน์ ① ทั้งหมด + ② ③ ส่วนที่เป็นตัวแดง (จากหมายเหตุในใบเสนอราคา) — ช่อง ②③ เซลล์พิมพ์เพิ่ม/แก้ได้ในระบบจริง</div>
  </div>`;
}

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ตัวอย่างใบปะหน้า (Draft)</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
*{box-sizing:border-box}
body{font-family:'Sarabun',sans-serif;background:#eceef1;color:#111;margin:0;padding:24px 12px;font-size:13px}
.note{max-width:760px;margin:0 auto 18px;background:#fff8e1;border:1px solid #f1d98a;border-radius:10px;padding:12px 16px;font-size:13px;color:#6b5800}
.sheet{max-width:760px;margin:0 auto 28px;background:#fff;border-radius:10px;padding:22px 24px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
.head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-bottom:14px}
.warn{color:#c00;font-weight:700;font-size:13px}
.warn.right{text-align:right}
.cust{text-align:center;font-weight:700;font-size:16px;border-bottom:1px solid #999;padding-bottom:2px;min-width:200px}
.cust .lbl{font-weight:400;font-size:13px;color:#777;margin-right:6px}
.cust .nick{margin-left:4px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{border:1px solid #555;padding:6px 8px;text-decoration:underline;font-weight:700;font-size:12.5px;text-align:center}
td{border:1px solid #555;padding:7px 9px;vertical-align:top;font-size:12.5px;line-height:1.75}
th:nth-child(1),td:nth-child(1){width:33%}
th:nth-child(2),td:nth-child(2){width:33%}
th:nth-child(3),td:nth-child(3){width:34%}
.cap{margin-top:8px;font-size:11px;color:#888}
h1{max-width:760px;margin:0 auto 14px;font-size:18px;color:#7d0f15}
@media print{body{background:#fff;padding:0}.note,h1,.cap{display:none}.sheet{box-shadow:none;margin:0;page-break-after:always;max-width:100%}}
</style></head><body>
<h1>ตัวอย่างใบปะหน้า (Draft) — 3 ใบจากงานจริง</h1>
<div class="note"><b>นี่คือตัวอย่างหน้าตา</b> สร้างจาก logic จริงของระบบ (deriveCoverSheet) + ข้อมูลใบเสนอราคาจริง 3 ใบ<br>
• คอลัมน์ ① ดำ = ระบบดึงมาเองทั้งหมดจากรายการสินค้า<br>
• คอลัมน์ ②③ ตัวแดง = ระบบเดามาให้จากหมายเหตุในใบเสนอราคา (ในระบบจริงเป็นช่องพิมพ์ แก้/เพิ่มได้)<br>
• ในระบบจริงจะมีปุ่ม "บันทึก" และ "พิมพ์/PDF"</div>
${CASES.map(sheet).join("\n")}
</body></html>`;

mkdirSync("ใบเสนอราคาทดสอบ", { recursive: true });
writeFileSync("ใบเสนอราคาทดสอบ/cover-preview.html", html, "utf8");
console.log("✅ สร้างแล้ว: ใบเสนอราคาทดสอบ/cover-preview.html");
