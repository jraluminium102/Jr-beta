// สร้าง Word คู่มือฟีเจอร์ใหม่ เครื่องคิดราคา JR
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageBreak, LevelFormat
} = require("C:/Users/Nut/AppData/Roaming/npm/node_modules/docx/dist/index.umd.cjs");
import { writeFileSync } from "node:fs";

const FONT = "Tahoma";
const RED = "B3151D", GREY = "6B7280", DARK = "1F2937", GREEN = "1A7F37", LINE = "D0D0D0";
const CW = 9026; // A4 content width (1" margins)

const border = { style: BorderStyle.SINGLE, size: 1, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };
const cellM = { top: 70, bottom: 70, left: 120, right: 120 };

function run(text, o={}){ return new TextRun({ text, font:FONT, size:o.size||21, bold:o.bold||false, italics:o.it||false, color:o.color||DARK }); }
function P(children, o={}){ return new Paragraph({ alignment:o.align, spacing:{before:o.before||0, after:o.after==null?80:o.after}, children: Array.isArray(children)?children:[children] }); }
function H1(t){ return new Paragraph({ heading:HeadingLevel.HEADING_1, spacing:{before:240,after:120}, children:[new TextRun({text:t,font:FONT,size:30,bold:true,color:RED})] }); }
function H2(t){ return new Paragraph({ heading:HeadingLevel.HEADING_2, spacing:{before:200,after:90}, children:[new TextRun({text:t,font:FONT,size:25,bold:true,color:"7d0e14"})] }); }
function bullet(text,o={}){ return new Paragraph({ numbering:{reference:"b",level:0}, spacing:{after:40}, children:[run(text,o)] }); }
function numItem(text,o={}){ return new Paragraph({ numbering:{reference:"n",level:0}, spacing:{after:40}, children:[run(text,o)] }); }

function cell(content, o={}){
  const kids = Array.isArray(content)?content:[content];
  return new TableCell({ borders, width:{size:o.w, type:WidthType.DXA}, margins:cellM,
    shading: o.fill?{fill:o.fill, type:ShadingType.CLEAR}:undefined,
    children: kids.map(c=> typeof c==="string"? P(run(c,{size:o.size||20, bold:o.bold, color:o.color}),{after:0}) : c) });
}
// ตาราง 2 คอลัมน์: ที่ไหน | ทำอะไร
function table2(rows, w1, headFill="B3151D"){
  const w2 = CW - w1;
  const head = new TableRow({ tableHeader:true, children:[
    cell([P(run("จุด / คลิกที่",{bold:true,color:"FFFFFF",size:20}),{after:0})],{w:w1,fill:headFill}),
    cell([P(run("รายละเอียด / ของใหม่ 🆕",{bold:true,color:"FFFFFF",size:20}),{after:0})],{w:w2,fill:headFill}),
  ]});
  const body = rows.map((r,i)=> new TableRow({ children:[
    cell(r[0],{w:w1, fill:i%2?"FAFAFA":"FFFFFF", bold:true, size:20}),
    cell(r[1],{w:w2, fill:i%2?"FAFAFA":"FFFFFF", size:20}),
  ]}));
  return new Table({ width:{size:CW,type:WidthType.DXA}, columnWidths:[w1,w2], rows:[head,...body] });
}
// กล่อง "วาดหน้าจอ" — ตารางแถวเดียวพื้นเทาอ่อน
function screenBox(lines, title){
  const kids=[];
  if(title) kids.push(P(run(title,{bold:true,color:RED,size:20}),{after:60}));
  lines.forEach(l=> kids.push(new Paragraph({ spacing:{after:20}, children:[new TextRun({text:l,font:"Consolas",size:18,color:DARK})] })));
  return new Table({ width:{size:CW,type:WidthType.DXA}, columnWidths:[CW], rows:[
    new TableRow({ children:[ new TableCell({ borders:{top:{style:BorderStyle.SINGLE,size:6,color:RED},bottom:{style:BorderStyle.SINGLE,size:6,color:RED},left:{style:BorderStyle.SINGLE,size:6,color:RED},right:{style:BorderStyle.SINGLE,size:6,color:RED}}, width:{size:CW,type:WidthType.DXA}, margins:{top:120,bottom:120,left:160,right:160}, shading:{fill:"FFF8F8",type:ShadingType.CLEAR}, children:kids }) ]})
  ]});
}

const kids = [];

// ===== หัวเรื่อง =====
kids.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:60}, children:[new TextRun({text:"คู่มือฟีเจอร์ใหม่ — เครื่องคิดราคา JR",font:FONT,size:40,bold:true,color:RED})] }));
kids.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:40}, children:[new TextRun({text:"รอบอัปเดต มิถุนายน 2026 · งานมุ้ง + ออปชั่นราคา + UX (F-series)",font:FONT,size:22,color:GREY})] }));
kids.push(new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:200}, children:[new TextRun({text:"branch: feat/quote-phase5-ux · ทดสอบทุก commit ผ่าน (baseline FULL-A 753,280 / FULL-B 8,224,341)",font:FONT,size:18,color:GREY,italics:true})] }));

// ===== 1. ภาพรวมหน้าจอ =====
kids.push(H1("1. ภาพรวมหน้าจอ (โหมดใบเสนอราคา)"));
kids.push(P(run("แต่ละ \"จุด\" (รายการสินค้า) มีหน้าตาแบบนี้ — ของใหม่อยู่ใน 2 ที่หลัก: แถบ OPTION ทางเลือกลูกค้า และ ⚙ ตัวเลือกเพิ่มเติม",{size:20})));
kids.push(screenBox([
  "┌─ กล่อง 1 จุด ───────────────────────────────────┐",
  "│ กลุ่มงาน[▾] สินค้า[▾] ประตู/หน้าต่าง[▾]          │",
  "│ กว้าง[ ] สูง[ ] จำนวนบาน[ ] จำนวน[ ]            │",
  "│ สี[▾]   กระจก[▾]                                 │",
  "│ ▶ ＋ OPTION ทางเลือกลูกค้า   ◀── 🆕 F2 (พับอยู่) │",
  "│   หมายเหตุ/สเปกพิเศษ [                   ]       │",
  "│ ▶ ⚙ ตัวเลือกเพิ่มเติม (มือจับ/มุ้ง/...)  ◀ กดเปิด│",
  "└─────────────────────────────────────────────────┘",
  "        [ ส่งเข้าระบบ JR → ออกใบ ]  [ พรีวิว ]",
]));

// ===== 2. ตารางสรุป =====
kids.push(H1("2. สรุปเร็ว — ของใหม่อยู่ตรงไหน"));
kids.push(table2([
  ["⚙ ตัวเลือกเพิ่มเติม → มุ้ง","มุ้งเฟรมเล็ก / เฟรมเล็กติดตาย / เฟรมใหญ่ (เพิ่มในดรอปดาวน์ \"มุ้ง\") + แก้บั๊กมุ้งต่อบานที่เคย \"ไม่เข้ายอด\" → ตอนนี้บิลจริงทุกชนิด"],
  ["⚙ → มือจับ","Cmech (เฉพาะบานเลื่อน) · Cmech หลบมุ้ง (เฉพาะบานกระทุ้ง) · X-J/XO/XT ฟรี (เฉพาะ SlimLux/X-series)"],
  ["⚙ → แผ่นทึบล่าง","ลูกฟูก/คอมโพสิทล่าง — เพิ่มช่อง กว้าง×สูง + สี → คิดราคาให้ (เลิก \"รอราคา\")"],
  ["⚙ → ครอบวงกบอลู","เลือก 3 / 4 ด้าน → คำนวณความยาวจากขนาดบานให้อัตโนมัติ"],
  ["แถบ ＋ OPTION ทางเลือกลูกค้า","🆕 ใหญ่สุด — เลือกหมวด→รายการ→±บาทคิดให้อัตโนมัติ (เปลี่ยนกระจก/มุ้ง/สี/มือจับ/หลังคา)"],
  ["สินค้า → ราวกันตก","default กระจก = เทมเปอร์ใส 10 มม. (เดิม ใส 6) · เลือก 12 มม. ได้"],
  ["⚙ (หลังคา)","default แปคู่ · เพิ่ม ☑ เสริมเพลทเหล็กล่าง / ☑ เหล็กดึงด้านบน (ฟรี) · ปลาย \"ปล่อย\" = ไม่มีรางน้ำ"],
  ["ในใบที่ออก","ระบุชนิดหลังคา (หลังคาไวนิล สีขาว) · ชุดใส่ราคาต่อหน่วย (เลิกขีด —) · หัวข้อมุ้งตรงชนิด"],
], 2900));

kids.push(new Paragraph({ children:[new PageBreak()] }));

// ===== 3.1 ตัวเลือกเพิ่มเติม =====
kids.push(H1("3. รายละเอียดแต่ละจุด"));
kids.push(H2("3.1  ⚙ ตัวเลือกเพิ่มเติม (กดขยาย จะเจอของใหม่)"));
kids.push(screenBox([
  "🪟 เพิ่มมุ้งในบานนี้",
  "   มุ้ง [ ไม่ใส่ ▾]  → มี: มุ้งจีบ(เดิม) + เฟรมเล็ก 🆕 / เฟรมเล็กติดตาย 🆕 / เฟรมใหญ่ 🆕",
  "   ผ้ามุ้ง [ ไฟเบอร์เทา ▾ ]",
  "",
  "[Up1] มือจับ Cmech [ฝัง▾][สีธรรมดา▾]   ← เฉพาะบานเลื่อน",
  "มือจับ Cmech หลบมุ้ง [ไม่ใส่▾]          ← เฉพาะบานกระทุ้ง (+600/+840)",
  "มือจับ X-series [ไม่ใส่▾]               ← เฉพาะ SlimLux/X-series (ฟรี)",
  "",
  "☑ กระจกอินซูเลท   แผ่นทึบล่าง [อลูลูกฟูก (3,500/ตร.ม.)▾]",
  "   └ กว้าง[ ] สูง[ ] สีลูกฟูก[▾]   → คิดราคาให้ 🆕",
  "ครอบวงกบอลู [3 ด้าน▾] หรือระบุ(ม.)[ ]  → auto จากขนาดบาน 🆕",
],"หน้าตาเมื่อกดขยาย ⚙ :"));
kids.push(P([run("มุ้งเฟรม: ",{bold:true}), run("ราคา = เรตตามขนาด + ขั้นต่ำตาม ประตู/หน้าต่าง × จำนวนบาน · บนบานเลื่อนคิดตามช่องเปิด (ไม่นับบานติดตาย)",{size:20})]));
kids.push(P([run("Cmech: ",{bold:true}), run("ราคาตามตาราง — ฝัง: ประตู 1,050/1,470 หน้าต่าง 350/490 · เมโทร: ประตู 1,000/1,400 หน้าต่าง 600/840 (ธรรมดา/พิเศษชุบ)",{size:20})]));
kids.push(P([run("ลูกฟูก/คอม: ",{bold:true}), run("ลูกฟูก 3,500/ตร.ม. (+สี 400/1,500/1,600/2,200) · คอมโพสิท 3,300/ตร.ม. · ราคา = พื้นที่×เรต + สี",{size:20})]));
kids.push(P([run("ครอบวงกบ: ",{bold:true}), run("3 ด้าน = (กว้าง+2×สูง) · 4 ด้าน = 2×(กว้าง+สูง) × เรตตามสี (700/800/1,200/1,300)",{size:20})]));

// ===== 3.2 OPTION F2 =====
kids.push(H2("3.2  ＋ OPTION ทางเลือกลูกค้า  (ฟีเจอร์ใหม่ใหญ่สุด)"));
kids.push(screenBox([
  "กดแถบ \"＋ OPTION ทางเลือกลูกค้า\" ให้กางออก แล้วกด [＋ เพิ่ม OPTION] :",
  "",
  "┌─ แถว OPTION ───────────────────────────────────────────┐",
  "│ [เปลี่ยนกระจก▾] [เทมเปอร์ใส 12มม.▾] [±9,600] [✕]       │",
  "│   หมวด(6)          รายการ(ลิสต์จริง)   auto    ลบแถว    │",
  "│ ข้อความ:[เปลี่ยนเป็นเทมเปอร์ใส 12 มม.]  ← auto · แก้ได้ │",
  "└────────────────────────────────────────────────────────┘",
  "        [ ＋ เพิ่ม OPTION ]   ← ใส่ได้หลายอัน",
]));
kids.push(P(run("วิธีกด:",{bold:true,color:RED}),{after:40}));
kids.push(numItem("กดแถบ \"＋ OPTION ทางเลือกลูกค้า\" → กดปุ่ม \"＋ เพิ่ม OPTION\""));
kids.push(numItem("เลือก หมวด (6 หมวด): เปลี่ยนกระจก / เปลี่ยนผ้ามุ้ง / เปลี่ยนสีอลู / เปลี่ยนมือจับ / เปลี่ยนหลังคา / อื่นๆ"));
kids.push(numItem("เลือก รายการ (ลิสต์จริงในระบบ จัดกลุ่มให้) → ช่อง ±บาท กับ ข้อความ ขึ้นเอง"));
kids.push(numItem("แก้ตัวเลข/ข้อความเองได้ · เพิ่มได้หลาย OPTION ต่อบาน"));
kids.push(P([run("ราคาคิดให้: ",{bold:true,color:GREEN}), run("กระจก/มุ้ง/สี/หลังคา = (เรตใหม่ − เรตเดิม) × พื้นที่บาน · มือจับ = เหมาตามตาราง",{size:20})]));
kids.push(P([run("ในใบออก: ",{bold:true}), run("\"OPTION : เปลี่ยนเป็นเทมเปอร์ใส 12 มม. (ราคา+9,600 บาท)\" — ระบบเติม \"OPTION :\" ให้เอง ไม่ต้องพิมพ์",{size:20,color:RED})]));

// ===== 3.3 ราวกันตก =====
kids.push(H2("3.3  ราวกันตก (กลุ่มงาน 2)"));
kids.push(bullet("เลือกสินค้าราวกันตก → ช่อง กระจก default เป็น เทมเปอร์เขียว/ใส 10 มม. (เดิมเป็น ใส 6 มม.)"));
kids.push(bullet("เลือก 12 มม. ได้จากดรอปดาวน์กระจก (งานสระว่ายน้ำ)"));

// ===== 3.4 หลังคา =====
kids.push(H2("3.4  หลังคา (กลุ่มงาน 3)"));
kids.push(screenBox([
  "แป [แปคู่ ▾]                       ← 🆕 default เปลี่ยนเป็นแปคู่",
  "ปลายหลังคา [ปล่อย ▾]              ← ปล่อย = ไม่มีรางน้ำในใบ (แก้บั๊ก)",
  "ของเสริมหลังคา:",
  "   ☑ เสริมเพลทเหล็กล่าง (รับล่าง)  🆕 ฟรี",
  "   ☑ เหล็กดึงด้านบน               🆕 ฟรี",
]));

// ===== 3.5 ใบที่ออก =====
kids.push(H2("3.5  สิ่งที่เปลี่ยนในใบที่ออก (กดส่งเข้าระบบ JR)"));
kids.push(table2([
  ["หัวข้อมุ้ง","ตรงชนิดจริง: \"พร้อมมุ้งเฟรมเล็ก / เฟรมใหญ่ / มุ้งจีบนิรภัย\" (เดิม hard-code \"พร้อมมุ้งจีบ\" เสมอ)"],
  ["รายละเอียดหลังคา","ระบุชนิด+สี เช่น \"หลังคาไวนิล สีขาว\" (เดิมไม่ระบุชนิด) · ปลายปล่อยไม่ขึ้นรางน้ำ"],
  ["ราคาต่อหน่วยของชุด","ใส่เลขจริง = ยอดรวม ÷ จำนวนชุด (เดิมขีด \"—\")"],
  ["(รอราคา)","ไม่หลุดลงใบลูกค้าอีก — ถ้ายังไม่กรอกราคา ซ่อนบรรทัดแทน"],
], 2600));

kids.push(new Paragraph({ children:[new PageBreak()] }));

// ===== 4. หมายเหตุ =====
kids.push(H1("4. หมายเหตุ"));
kids.push(bullet("ยังไม่ทำ (รอราคาพี่นัท): กระจกอินซูเลท 5+8+5 · งานพื้น (ไม้เทียม/สมาร์ทบอร์ด)"));
kids.push(bullet("งานทั้งหมด push บน branch feat/quote-phase5-ux → เปิดดูที่ Vercel preview (ยังไม่ขึ้นเวปจริง/main)"));
kids.push(bullet("ทดสอบผ่านครบ: คิดราคา 14/14 · มุ้งเฟรม 18/18 · OPTION cascade 9/9 · กั้นห้อง 19/19"));
kids.push(P(run("เปิดลองเล่นในเครื่อง: ดับเบิลคลิก public/calculator/index.html",{size:20,it:true,color:GREY}),{before:120}));

const doc = new Document({
  styles:{ default:{ document:{ run:{ font:FONT, size:21 } } } },
  numbering:{ config:[
    { reference:"b", levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:520,hanging:260}}}}] },
    { reference:"n", levels:[{level:0,format:LevelFormat.DECIMAL,text:"%1.",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:520,hanging:260}}}}] },
  ]},
  sections:[{ properties:{ page:{ size:{width:11906,height:16838}, margin:{top:1440,right:1440,bottom:1440,left:1440} } }, children: kids }]
});

const out = "C:/Users/Nut/Documents/Claude/Projects/Jr-beta/docs/คู่มือฟีเจอร์ใหม่_เครื่องคิดราคาJR.docx";
const buf = await Packer.toBuffer(doc);
writeFileSync(out, buf);
console.log("เขียนแล้ว:", out, "("+buf.length+" bytes)");
