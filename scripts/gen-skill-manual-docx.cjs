// gen-skill-manual-docx.cjs — สร้างคู่มือสกิล JR เป็น .docx (ไทย · Tahoma)
// ใช้: node scripts/gen-skill-manual-docx.cjs
const path = require("path");
const fs = require("fs");
const GLOBAL = path.join(process.env.APPDATA || "", "npm", "node_modules", "docx");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType } = require(GLOBAL);

const FONT = "Tahoma";
const CW = 9026; // content width A4, margin 1"

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, w, opts = {}) {
  const runs = Array.isArray(text) ? text : [text];
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: [new Paragraph({ children: runs.map(r => new TextRun({ text: String(r), bold: !!opts.bold, font: FONT, size: opts.size || 19, color: opts.color })) })],
  });
}
function headRow(cells, widths) {
  return new TableRow({ tableHeader: true, children: cells.map((c, i) => cell(c, widths[i], { bold: true, fill: "EDE9FE", color: "5B21B6" })) });
}
function row(cells, widths, opts = {}) {
  return new TableRow({ children: cells.map((c, i) => cell(c, widths[i], opts)) });
}
function table(widths, headers, data, dataOpts = {}) {
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths,
    rows: [headRow(headers, widths), ...data.map(d => row(d, widths, dataOpts))] });
}
function H1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT, size: 34, bold: true })] }); }
function H2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT, size: 26, bold: true, color: "6D28D9" })] }); }
function P(t, opts = {}) { return new Paragraph({ spacing: { after: 80 }, children: (Array.isArray(t) ? t : [{ text: t }]).map(r => new TextRun({ text: r.text, bold: r.bold || opts.bold, font: FONT, size: opts.size || 21, color: r.color || opts.color, italics: opts.italics })) }); }
function quote(t) { return new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 240 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: "FCD34D", space: 8 } }, children: [new TextRun({ text: t, font: FONT, size: 20, color: "92400E" })] }); }
function bullet(t) { return new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 40 }, children: parse(t) }); }
function num(t) { return new Paragraph({ numbering: { reference: "n", level: 0 }, spacing: { after: 40 }, children: parse(t) }); }
function code(t) { return new Paragraph({ spacing: { before: 60, after: 60 }, shading: { fill: "1E293B", type: ShadingType.CLEAR }, children: [new TextRun({ text: t, font: "Consolas", size: 19, color: "E2E8F0" })] }); }
// แยก **bold** ในข้อความ
function parse(t) {
  const out = []; const parts = String(t).split(/(\*\*[^*]+\*\*)/);
  for (const p of parts) { if (!p) continue; const b = p.startsWith("**") && p.endsWith("**"); out.push(new TextRun({ text: b ? p.slice(2, -2) : p, bold: b, font: FONT, size: 21 })); }
  return out;
}

const skillWidths = [520, 1500, 1250, 3050, 2706];
const skillRows = [
  ["1", "new-product-group", "① ตัวคุมใหญ่", '"ทำกลุ่มใหม่ G2" · "เริ่ม G4 ครบชุด"', "พาทำทั้งกลุ่ม ดึงเรต→ดราฟ→PDF→ใบส่ง dev (ทีละสเตป รอเคาะ)"],
  ["2", "draft-ux-g", "① ทำดราฟ", '"ดราฟ UX G3" · "ทำดราฟฟอร์ม G5"', "ไฟล์ดราฟกดเล่นได้ 1 กลุ่ม (เด้ง preview)"],
  ["3", "form-ux-redesign", "① ปรับฟอร์ม", '"ปรับ UX G2 ให้กรอกง่าย"', "ปรับฟอร์มเดิมให้กรอกง่าย + สเปกส่ง dev"],
  ["4", "product-test-cards", "③ ตรวจราคา", '"ออกการ์ดตรวจราคา G1"', "การ์ด PDF ทุกรุ่น (ราคา+ออปชั่น) ให้เฟิร์น/เซลล์"],
  ["5", "quote-option-audit", "③ เทียบใบจริง", '"ตรวจออปชั่นเทียบใบจริง G1"', "เทียบใบระบบ vs ใบจริงหน้างาน → หาที่ขาด"],
  ["6", "check-dev-vs-draft", "③ ตัวคุมตรวจ", '"ตรวจงาน G1" · "dev แก้เสร็จตรวจที"', "เดินตรวจครบ (กันเพี้ยน→เทียบดราฟ+ออกใบ+เทส→เทียบใบจริง)"],
  ["7", "nut-share", "แชร์", '"แชร์ html ขึ้น github" · "นัทแชร์"', "อัป HTML ขึ้น repo share (เฉพาะไฟล์ไม่มีเรต)"],
];

const w2 = [3200, 5826];
const chatA = [
  ['"เก็บเป็นก้อนก่อน ยังไม่ส่ง"', "แชทจดทุกอย่างที่เคาะลงรายการ (ไม่ใช้ความจำ)"],
  ['"ในก้อนมีอะไรบ้าง"', "โชว์รายการสะสม เช็คว่าครบ"],
  ['"รวมเป็นก้อนเดียว ส่ง Chat B"', "โชว์ checklist ให้เคาะ → ออกใบสั่ง 1 ใบ"],
  ['"ตรวจงาน G__ หน่อย"', "(หลัง dev แก้) เทียบดราฟ+ใบจริง"],
];
const chatB = [
  ['"เช็คว่ามีงานอะไรรอทำ"', "เห็น 🔴 งานที่เตรียมไว้"],
  ['"ทำ [งาน] ตามที่เตรียมไว้"', "แชทเปิดใบสั่งทำเอง (พี่ไม่ต้องเล่าซ้ำ)"],
  ['"เทสกันราคาเพี้ยน แล้วขึ้นเว็บ"', "golden เขียว → push ขึ้นเว็บ"],
  ['"แคปรูปทุกจุดที่แก้มาดู"', "ส่งรูปให้ (พี่ไม่ต้องเข้าเว็บตรวจเอง)"],
];

const children = [
  H1("📘 คู่มือสกิล JR — เครื่องคิดราคา (รวบรวมไว้ใช้)"),
  P([{ text: "2026-06-16 · สกิลทั้งหมดที่ทำไว้ + พิมพ์อะไรสั่ง + ใช้เมื่อไร · ทุกสกิล READ-ONLY (ไม่แก้ index.html เอง · แชท dev แก้)", color: "6B7280" }], { italics: true, size: 19 }),

  H2("🗺️ ภาพรวม — สกิลมี 3 หมวด ตามจังหวะงาน"),
  code("①  ออกแบบ/ทำของ  →  ②  ส่ง dev แก้  →  ③  ตรวจหลัง dev แก้  →  (แชร์)"),
  table(skillWidths, ["#", "สกิล", "หมวด", "พิมพ์สั่งว่า (ตัวอย่าง)", "ได้อะไร"], skillRows),

  H2("🔄 ลำดับงานจริง (เริ่มกลุ่มใหม่ยันปิดงาน)"),
  num("**เริ่มกลุ่มใหม่** → พิมพ์ \"ทำกลุ่ม G_\" → new-product-group พาทำ (เรียก draft-ux-g + product-test-cards ให้เอง) ทีละสเตป รอเคาะ"),
  num("ได้ดราฟ+PDF+ใบส่ง dev → **ส่งแชท dev** แก้ index.html (1 ธง 1 commit)"),
  num("**dev แก้เสร็จ** → พิมพ์ \"ตรวจงาน G_\" → check-dev-vs-draft เดินครบ → รวม 🔴 เป็นใบสั่ง dev รอบเดียว"),
  num("dev แก้ 🔴 → ตรวจซ้ำ จน 🔴 = 0 = จบ"),

  H2("🔁 โฟลหลายแชท A↔B — คำสั่งภาษาคน (พี่นัทไม่เก่งคอม · มติ 16 มิ.ย.)"),
  P([{ text: "หลายแชทช่วยกัน · " }, { text: "แชท A (หลายตัว) = ตรวจ+เตรียมโค้ด", bold: true }, { text: " (READ-ONLY) · " }, { text: "แชท B = ช่างแก้ index.html คนเดียว", bold: true }]),
  quote("⚠️ กฎเดียวที่ต้องรู้: \"ช่างแก้โค้ดมีคนเดียว ณ เวลาหนึ่ง\" — แชท A เตรียมพร้อมกันได้ · แชท B แก้ทีละงาน (อย่าให้ 2 แชทแก้พร้อมกัน ชนพัง)"),
  P([{ text: "🅰️ ในแชท A (เตรียมงาน · รวม 3-4 รอบเป็นก้อนเดียว):", bold: true, color: "6D28D9" }]),
  table(w2, ["พิมพ์", "ได้อะไร"], chatA),
  P([{ text: "🅱️ ในแชท B (ช่างแก้โค้ด):", bold: true, color: "B3151D" }]),
  table(w2, ["พิมพ์", "ได้อะไร"], chatB),
  P([{ text: "ลืมว่าส่ง/เสร็จยัง? พิมพ์ " }, { text: "\"เช็คสถานะงาน dev\"", bold: true, color: "B3151D" }, { text: " กับแชทไหนก็ได้ → dev-status.mjs อ่านของจริง บอก ✅เสร็จ/🔴รอ/⚪ยังไม่เตรียม (ไม่พึ่งความจำ)" }]),
  quote("วงจร: 🅰️ เตรียม+รวมก้อน → ส่ง → 🅱️ แก้+ขึ้นเว็บ+แคปรูป → กลับ 🅰️ ตรวจ → วนลูป · การ์ดโพย: docs/การ์ดโพยคำสั่ง-2026-06-16.html"),

  H2("📌 พิมพ์สั่งแบบไหนก็ได้ (ไม่ต้องจำชื่อสกิลเป๊ะ)"),
  P("สกิลจับจากความหมาย — พิมพ์ภาษาคนได้เลย เช่น:"),
  bullet('"ทำ G4 ให้หน่อย" → new-product-group'),
  bullet('"ดราฟมุ้งใหม่" → draft-ux-g'),
  bullet('"ตรวจงาน G1 ที dev แก้แล้ว" → check-dev-vs-draft (เดินครบ)'),
  bullet('"เทียบกับใบจริง" → quote-option-audit'),
  bullet('"เอา html ขึ้นเว็บ" → nut-share'),

  H2("⭐ หลักร่วม JR — ทุกสกิลยึด (สิ่งที่พี่นัทชอบ)"),
  num("**ห้ามเดาราคา** — ยึดเลขจาก index.html / engine / REF เท่านั้น · ไม่ชัวร์ติดป้าย \"(เช็คซ้ำ)\""),
  num("**verify เบราว์เซอร์จริง** — ห้ามเคลม \"ผ่าน\" จาก jsdom · ต้องเปิด preview กดเองก่อน"),
  num("**อธิบายภาษาคน** — ไม่เอาศัพท์อังกฤษห้วนๆ · ตัวเลขบอกความหมาย (\"ขยับ +4,000 = แพงขึ้น\")"),
  num("**สเปกขัดกัน → เลือกอันใหม่สุดเอง** · ไม่ชัวร์ → ถามพร้อม ref (ไฟล์+บรรทัด/มติวันไหน)"),
  num("**ทีละสเตป รอเคาะ · ทำทีละกลุ่ม** — ไม่ลุยรวด ไม่ข้ามกลุ่ม/ข้ามแชท (งานใครงานมัน)"),
  num("**READ-ONLY index.html** — เจอผิด = ออกใบสั่งให้ dev แก้ · รวม 🔴 เป็นใบสั่งรอบเดียว"),

  H2("🔧 เครื่องมือเบื้องหลัง (สกิลเรียกให้เอง)"),
  bullet("golden-snapshot.mjs — กันราคาทุกกลุ่มเพี้ยน (รันก่อน-หลังแก้)"),
  bullet("check-g{N}.mjs — ตรวจกลุ่ม N เทียบดราฟ (check-g1/check-g5 เป็นแม่แบบ)"),
  bullet("review-link.mjs — ทำลิงก์ localhost กดดูรายงานเต็มจอ"),
  bullet("**dev-status.mjs** — \"เช็คสถานะงาน dev\" บอกอะไรเสร็จ/รอ/ยังไม่เตรียม (อ่าน index.html+docs/ จริง · กันลืมว่าส่งหรือยัง)"),
  bullet("INDEX-ใบเสนอราคาจริง-2026-06-16.md — ดัชนีใบจริง (ตรวจ G ไหนใช้ใบไหน)"),

  H2("⏳ ค้าง / ต้องทำเพิ่ม"),
  bullet("**G7 ม่านซิป ยังไม่เคยขายจริง** → ไม่มีใบจริงเทียบ · ต้องสร้างใบจากระบบทุกแบบทุกรุ่นให้พี่นัทตรวจเอง (งานพิเศษ G7)"),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 34, bold: true }, paragraph: { spacing: { before: 200, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 26, bold: true, color: "6D28D9" }, paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
    ] },
  numbering: { config: [
    { reference: "b", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] },
    { reference: "n", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] },
  ] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
});

Packer.toBuffer(doc).then(buf => {
  const main = "docs/คู่มือสกิล-JR-2026-06-16.docx";
  try { fs.writeFileSync(main, buf); console.log("DOCX_WRITTEN " + main + " (" + buf.length + " bytes)"); }
  catch (e) {
    if (e.code === "EBUSY" || e.code === "EPERM") {
      const alt = "docs/คู่มือสกิล-JR-2026-06-16-อัปเดต.docx";
      fs.writeFileSync(alt, buf); console.log("DOCX_LOCKED → เซฟเป็นไฟล์ใหม่: " + alt + " (" + buf.length + " bytes)");
    } else throw e;
  }
});
