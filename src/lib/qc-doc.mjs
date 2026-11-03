/**
 * เอกสารควบคุมคุณภาพงาน (QC) — เติมข้อมูลลูกค้าหน้างานลงหน้าแรกของแบบฟอร์มต้นฉบับ (เจ้าของ 3 พ.ย.69)
 *   ต้นฉบับ = src/assets/qc-template.pdf (Canva · 18 หน้า) — เติมเฉพาะหน้า 1 ช่อง "ข้อมูลลูกค้า"
 *   ไม่เก็บไฟล์ที่สร้างลง DB/storage (เจ้าของ: "เอกสารไม่จำเป็นต้องเก็บ คนเก็บไม่ใช่เว็บเรา") → สร้างสดทุกครั้งที่กดโหลด
 *   พิกัด = จุด PDF (0,0 มุมล่างซ้าย · หน้า A4 595×842) วัดจากตัวอย่างที่เจ้าของเติมไว้ในไฟล์ต้นฉบับ
 *   ฟอนต์ Sarabun (OFL) จาก @fontsource — ไฟล์แยก thai/latin → วาดเป็นช่วง ๆ สลับฟอนต์ตามตัวอักษร (ฟอนต์ย่อยไม่มีกลิฟข้ามชุด)
 */
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const ROOT = process.cwd();
const TEMPLATE = path.join(ROOT, "src", "assets", "qc-template.pdf");
const FONT_TH = path.join(ROOT, "node_modules", "@fontsource", "sarabun", "files", "sarabun-thai-400-normal.woff");
const FONT_LA = path.join(ROOT, "node_modules", "@fontsource", "sarabun", "files", "sarabun-latin-400-normal.woff");

/** ตำแหน่งช่องบนหน้า 1 (x = จุดเริ่มเขียน · y = เส้นฐานตัวอักษร) */
export const QC_FIELDS = {
  sales:    { x: 465, y: 768, size: 10, maxW: 110 },   // พนักงานขาย ……
  date:     { x: 463, y: 747, size: 10, maxW: 110 },   // วันที่เข้าประเมิน ……
  name:     { x: 104, y: 704, size: 10, maxW: 300 },   // ชื่อ - สกุล
  phone:    { x: 455, y: 703, size: 10, maxW: 120 },   // เบอร์โทรศัพท์
  address:  { x: 112, y: 683, size: 9.5, maxW: 440, lineH: 17, lines: 2 },   // ที่อยู่หน้างาน (2 บรรทัด)
  // ออกเอกสารตาม… (กล่องติ๊ก 3 กล่อง)
  // กล่องติ๊ก "ออกเอกสารตาม…" (ตำแหน่งกล่อง: มุมล่างซ้าย + ขนาด) — วาดเครื่องหมายถูกเป็นเส้น (ฟอนต์ย่อยไม่มีกลิฟ ✓)
  tickSite:    { x: 43,  y: 634, w: 12, h: 12 },
  tickHouse:   { x: 219, y: 634, w: 12, h: 12 },
  tickCompany: { x: 398, y: 634, w: 12, h: 12 },
  company:  { x: 112, y: 615, size: 10, maxW: 280 },   // ชื่อบริษัท
  taxId:    { x: 458, y: 615, size: 10, maxW: 115 },   // เลขประจำตัวผู้เสียภาษี
  billAddr: { x: 86,  y: 596, size: 9.5, maxW: 470, lineH: 15, lines: 2 },   // ที่อยู่ (ออกเอกสาร)
  fee:      { x: 150, y: 553, size: 10, maxW: 200 },   // ค่าประเมินหน้างาน
};

const isThai = (ch) => /[฀-๿]/.test(ch);

/** วาดข้อความผสมไทย/อังกฤษ — แยกช่วงตามฟอนต์ที่มีกลิฟ · คืนความกว้างที่ใช้ */
function drawMixed(page, fonts, text, x, y, size) {
  let cx = x;
  for (const run of text.match(/[฀-๿]+|[^฀-๿]+/g) ?? []) {
    const font = isThai(run[0]) ? fonts.th : fonts.la;
    let safe = run;
    try { font.encodeText(safe); } catch { safe = run.replace(/[^\x20-\x7E฀-๿]/g, "?"); }
    page.drawText(safe, { x: cx, y, size, font, color: rgb(0.1, 0.1, 0.1) });
    cx += font.widthOfTextAtSize(safe, size);
  }
  return cx - x;
}
function widthMixed(fonts, text, size) {
  let w = 0;
  for (const run of text.match(/[฀-๿]+|[^฀-๿]+/g) ?? []) {
    const font = isThai(run[0]) ? fonts.th : fonts.la;
    try { w += font.widthOfTextAtSize(run, size); } catch { w += run.length * size * 0.5; }
  }
  return w;
}
/** ตัดบรรทัดตามความกว้าง — ตัดที่ช่องว่างก่อน ถ้าคำยาวเกินค่อยหั่นตัวอักษร · เกินจำนวนบรรทัด = ตัดทิ้งด้วย "…" */
function wrap(fonts, text, size, maxW, maxLines) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let cur = "";
  const push = () => { if (cur) lines.push(cur); cur = ""; };
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (widthMixed(fonts, cand, size) <= maxW) { cur = cand; continue; }
    push();
    if (widthMixed(fonts, w, size) <= maxW) { cur = w; continue; }
    let piece = "";
    for (const ch of w) {
      if (widthMixed(fonts, piece + ch, size) > maxW) { lines.push(piece); piece = ch; } else piece += ch;
    }
    cur = piece;
  }
  push();
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last && widthMixed(fonts, last + "…", size) > maxW) last = last.slice(0, -1);
    keep[maxLines - 1] = last + "…";
    return keep;
  }
  return lines;
}
/** ย่อขนาดอักษรให้พอดีช่องบรรทัดเดียว (ไม่ต่ำกว่า 7) */
function fitSize(fonts, text, size, maxW) {
  let s = size;
  while (s > 7 && widthMixed(fonts, text, s) > maxW) s -= 0.5;
  return s;
}

/**
 * ลบ "ข้อความ" ทั้งหมดออกจากหน้า — ต้นฉบับ Canva ฝังข้อมูลตัวอย่าง (คุณวริศ/เบอร์/ที่อยู่) เป็นตัวอักษรจริง
 * ส่วนหัวข้อ/เส้น/กล่องติ๊กเป็นรูป (ไม่โดน) · ข้อความในหน้า 1 มีแต่ตัวอย่าง + ป้าย "ที่อยู่หน้างาน :" / "ที่อยู่ :" ที่วาดคืนเอง
 */
function stripPageText(pdf, page) {
  const STRIP_KEYS = new Set(["Length", "Filter", "DecodeParms"]);
  const stripText = (latin) => latin.replace(/\bBT\b[\s\S]*?\bET\b/g, "");
  // Canva วางเนื้อหาทั้งหน้าไว้ใน Form XObject (หน้าเรียก Do เดียว) → ต้องไล่ลบในชั้นย่อยด้วย (ซ้อนกี่ชั้นก็ตาม)
  const seen = new Set();
  const cleanResources = (res) => {
    const xo = res && res.lookup(PDFName.of("XObject"));
    if (!xo) return;
    for (const [key, ref] of xo.entries()) {
      const s = pdf.context.lookup(ref);
      if (!(s instanceof PDFRawStream)) continue;
      const sub = s.dict.get(PDFName.of("Subtype"));
      if (!sub || sub.toString() !== "/Form") continue;
      if (seen.has(ref.toString())) continue;
      seen.add(ref.toString());
      let latin = Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");
      latin = stripText(latin);
      // รูปสติ๊กเกอร์ตัวอย่าง (อุ้งแมวติ๊กกล่องแรก) ฝังเป็นรูปแยก — เก็บไว้แค่รูปใหญ่สุด (= พื้นหลังฟอร์มทั้งหน้า) รูปอื่นลบ
      const innerRes = s.dict.lookup(PDFName.of("Resources"));
      const innerXo = innerRes && innerRes.lookup(PDFName.of("XObject"));
      if (innerXo) {
        const imgs = [];
        for (const [k2, r2] of innerXo.entries()) {
          const s2 = pdf.context.lookup(r2);
          const st = s2 && s2.dict && s2.dict.get(PDFName.of("Subtype"));
          if (st && st.toString() === "/Image") {
            const w = Number(String(s2.dict.get(PDFName.of("Width")))) || 0;
            const h = Number(String(s2.dict.get(PDFName.of("Height")))) || 0;
            imgs.push({ name: k2.decodeText(), area: w * h });
          }
        }
        const keep = imgs.sort((a, b) => b.area - a.area)[0]?.name;
        for (const im of imgs) if (im.name !== keep) latin = latin.replace(new RegExp(`/${im.name}\\s+Do`, "g"), "");
      }
      const dictEntries = {};
      for (const [k, v] of s.dict.entries()) if (!STRIP_KEYS.has(k.decodeText())) dictEntries[k.decodeText()] = v;
      const ns = pdf.context.flateStream(Buffer.from(latin, "latin1"), dictEntries);
      xo.set(key, pdf.context.register(ns));
      cleanResources(ns.dict.lookup(PDFName.of("Resources")));
    }
  };
  const contents = page.node.Contents();
  if (contents) {
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const chunks = [];
    for (const r of refs) {
      const s = pdf.context.lookup(r);
      if (s instanceof PDFRawStream) chunks.push(Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"));
    }
    const stream = pdf.context.flateStream(Buffer.from(stripText(chunks.join("\n")), "latin1"));
    page.node.set(PDFName.of("Contents"), pdf.context.register(stream));
  }
  cleanResources(page.node.Resources());
}

const BE = (iso) => {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}/${Number(m[2])}/${Number(m[1]) + 543}` : "";
};

/**
 * @param {object} e  queue entry (+ sales/assistant join)
 * @returns {Promise<Uint8Array>} PDF ทั้งเล่ม (18 หน้า) หน้า 1 เติมแล้ว
 */
export async function buildQcDoc(e) {
  const pdf = await PDFDocument.load(fs.readFileSync(TEMPLATE));
  pdf.registerFontkit(fontkit);
  const fonts = {
    th: await pdf.embedFont(fs.readFileSync(FONT_TH), { subset: true }),
    la: await pdf.embedFont(fs.readFileSync(FONT_LA), { subset: true }),
  };
  const page = pdf.getPage(0);
  stripPageText(pdf, page);
  // ป้ายที่เป็นตัวอักษรในต้นฉบับ (โดนลบไปพร้อมข้อความตัวอย่าง) — วาดคืนที่เดิม
  drawMixed(page, fonts, "ที่อยู่หน้างาน :", 52, 681, 10);
  drawMixed(page, fonts, "ที่อยู่ :", 52, 595, 10);
  const F = QC_FIELDS;
  const one = (f, text) => {
    const t = String(text ?? "").trim();
    if (!t) return;
    drawMixed(page, fonts, t, f.x, f.y, fitSize(fonts, t, f.size, f.maxW));
  };
  const multi = (f, text) => {
    const t = String(text ?? "").trim();
    if (!t) return;
    wrap(fonts, t, f.size, f.maxW, f.lines).forEach((ln, i) => drawMixed(page, fonts, ln, f.x, f.y - i * f.lineH, f.size));
  };
  const tick = (f) => {
    const c = rgb(0.05, 0.05, 0.05);
    const p1 = { x: f.x + f.w * 0.18, y: f.y + f.h * 0.5 };
    const p2 = { x: f.x + f.w * 0.42, y: f.y + f.h * 0.2 };
    const p3 = { x: f.x + f.w * 0.88, y: f.y + f.h * 0.88 };
    page.drawLine({ start: p1, end: p2, thickness: 1.4, color: c });
    page.drawLine({ start: p2, end: p3, thickness: 1.4, color: c });
  };

  const salesName = [e.sales?.name, e.assistant?.name].filter(Boolean).join("+");
  one(F.sales, salesName);
  one(F.date, BE(e.queue_date));
  one(F.name, e.customer_name);
  one(F.phone, e.tel);
  multi(F.address, e.address);

  const choice = String(e.bill_choice ?? "SITE");
  const isCompany = choice === "COMPANY" || String(e.bill_kind ?? "") === "COMPANY";
  if (isCompany) tick(F.tickCompany);
  else if (choice === "OTHER_ADDR") tick(F.tickHouse);
  else tick(F.tickSite);
  if (choice !== "SITE") {
    one(isCompany ? F.company : F.company, e.bill_name);
    if (isCompany) one(F.taxId, e.bill_tax_id);
    const addr = [e.bill_address, e.bill_postal].filter((s) => String(s ?? "").trim()).join(" ");
    multi(F.billAddr, addr);
  }
  if (e.assess_fee != null && e.assess_fee !== "") {
    const n = Number(e.assess_fee);
    one(F.fee, Number.isFinite(n) ? `${n.toLocaleString("th-TH")} บาท` : String(e.assess_fee));
  }
  return pdf.save();
}
