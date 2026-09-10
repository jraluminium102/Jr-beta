#!/usr/bin/env node
/**
 * gen-r41-table — ดึง ★ ตารางราคาขาย R4.1 (PDF) เข้าระบบ
 *   node scripts/gen-r41-table.mjs ["★ ตารางราคาขาย R4.1.pdf"]
 *
 * เจ้าของเคาะ 10 ก.ย.69: "ค่าแรงทั้งหมด ติดตั้ง ผลิต ควรราคาเท่าในไฟล์ 4.1 เป๊ะ ๆ"
 *   ช่อง "ขาย" ของค่าแรงใน PDF ไม่ได้มาจากสูตรค่าแรงล้วน — ท้าย PDF เขียนว่า
 *   "ขาย = แบ่งจากราคารวมตามสัดส่วนกำไรของสินค้านั้น" (มีเศษปัดร้อยของค่าของติดมา)
 *   → ไม่มีสูตรไหนคิดย้อนได้ตรงทุกช่อง · เจ้าของเลือกให้ "เอาตัวเลขในตารางมาใช้ตรง ๆ"
 *
 * เขียนออก 2 ที่
 *   ① pricebook.json → R41.labor[รุ่น] = จุดอ้างอิงค่าแรง (ทุน/ขาย ต่อขนาด) ที่เอนจินใช้จริง
 *      (R41.matPct = % ค่าของตั้งต้น — ไม่แตะถ้ามีอยู่แล้ว · จูนด้วย scripts/audit-r41-pdf.mjs --fit)
 *   ② scripts/fixtures/r41-rows.json → ทุกแถวในตาราง + อินพุตเว็บ (ด่านตรวจใช้ ไม่ต้องมี PDF)
 *
 * ⚠ ฟอนต์ไทยใน PDF ถอดสระบางตัวเป็นอักษรพิเศษ (บานเปิด → "บานเปด")
 *   → จับคู่ด้วยชื่อที่ตัดอักษรนอกช่วงไทย/อังกฤษทิ้งแล้ว
 */
import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const PDF = process.argv[2] || "★ ตารางราคาขาย R4.1.pdf";
const PB_PATH = "src/lib/calculator40/pricebook.json";
const OUT = "scripts/fixtures/r41-rows.json";
if (!fs.existsSync(PDF)) { console.log("ไม่เจอไฟล์ " + PDF); process.exit(1); }

// ── ① อ่านข้อความพร้อมพิกัด → จัดเป็นบรรทัด ──
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(PDF)), disableFontFace: true }).promise;
const lines = [];
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5] }));
  const ls = [];
  for (const it of items) {
    const L = ls.find((l) => Math.abs(l.y - it.y) < 2.5);
    if (L) L.items.push(it); else ls.push({ y: it.y, items: [it] });
  }
  ls.sort((a, b) => b.y - a.y);
  for (const l of ls) { l.items.sort((a, b) => a.x - b.x); lines.push({ p, y: l.y, cells: l.items.map((i) => [i.x, i.s]) }); }
}

// ── ② แยกแถวตาราง ──
const norm = (s) => s.replace(/[^฀-๿A-Za-z0-9+×."()]/g, "");
const isNum = (s) => /^-?[\d,]+$/.test(s) || s === "—";
const num = (s) => (s === "—" ? 0 : Number(s.replace(/,/g, "")));
// บรรทัดคำอธิบายในคอลัมน์ซ้าย ที่ไม่ใช่ชื่อรุ่น (กำไรสุทธิ / สัดส่วน / หมายเหตุหลังคาเลื่อน)
const SKIP_LEFT = /^(ตัง|ตั้ง|ขายราคา|\(ชุด|กําไร|กำไร|ทุน|JR|กลุ่ม)/;
const rows = [];
let head = "", headOpen = false, target = null, size = null;
for (const l of lines) {
  if (l.p === 1 || l.y >= 527) continue;                                  // หน้าสรุป + หัวตารางทุกหน้า
  const leftRaw = l.cells.filter(([x]) => x < 120).map((c) => c[1]).join("").trim();
  const left = norm(leftRaw);
  if (/ขนาด|R3\.9ต่าง/.test(norm(l.cells.map((c) => c[1]).join("")))) continue;
  const sizeTxt = l.cells.filter(([x]) => x >= 120 && x < 190).map((c) => c[1]).join(" ");
  const toks = l.cells.filter(([x]) => x >= 190).map((c) => c[1].trim()).join(" ").split(/\s+/).filter(Boolean);
  // ⚠ ต้องจับจากข้อความดิบ — norm() ตัด % ทิ้ง ถ้าจับจาก norm บรรทัดนี้จะไปต่อท้ายชื่อรุ่นแทน
  const tm = /สุทธิ\s*([\d.]+)\s*%/.exec(leftRaw);
  if (tm) { target = Number(tm[1]); headOpen = false; }
  else if (left && !SKIP_LEFT.test(left) && !/^[▶*⚠]/.test(leftRaw)) {
    if (headOpen) head += left; else { head = left; headOpen = true; target = null; }
  }
  const sm = /([\d.]+)\s*x\s*([\d.]+)/.exec(sizeTxt);
  if (sm) size = [Number(sm[1]), Number(sm[2])];
  if (toks.length >= 11) {
    const x = toks.slice(-11);
    if (x.slice(0, 9).every(isNum) && /%$|^—$/.test(x[10])) {
      const [cM, sM, cP, sP, cI, sI, cT, , sT] = x.slice(0, 9).map(num);
      const pTok = toks.length > 11 ? toks[toks.length - 12] : "";
      if (sT > 0 && size) rows.push({ head, target, size: [...size], panels: /^\d+$/.test(pTok) ? Number(pTok) : null, pdf: { cM, sM, cP, sP, cI, sI, cT, sT } });
      headOpen = false;
    }
  }
}

// ── ③ จับคู่หัวข้อในตาราง → รุ่นในเว็บ + อินพุต ──
const ROOFMAT = [["EPS1นิวPVC", "เมทัลชีท EPS 1 นิ้ว PVC"], ["EPS2นิวPVC", "เมทัลชีท EPS 2 นิ้ว PVC"], ["EPS2นิวเหล็ก", "เมทัลชีท EPS 2 นิ้ว เหล็ก"],
  ["ไวนิล", "ไวนิล"], ["ดีไลท์", "ดีไลท์"], ["โพลีตัน", "โพลีตัน"], ["Shade", "ชินโคร์ Shade 4มม"], ["Sup", "ชินโคร์ Sup"], ["HC", "ชินโคร์ HC"],
  ["Prime", "ชินโคร์ Prime 10มม"], ["กระจก4+4", "กระจก 4+4"], ["กระจก5+5", "กระจก 5+5"]];
const RIDGE = { "200x120": 100, "400x200": 150, "600x250": 250 };
// หลังคาเลื่อน: ตารางให้ขนาดรวม · ข้อความใต้ขนาด = ส่วนเลื่อน 2 บาน + ส่วนติดตาย
const SLIDE = { "400x200": [270, 130, 200], "600x300": [400, 200, 300], "1000x400": [670, 330, 400] };
const RANAE = (box, face) => ({ form: "ตั้ง", spec: { rnBox: box, rnFace: face, rnGap: "2", rnFrame: "รวมโครง" } });
const SLIP = { boxA: "1x4", showA: "10.16", cntA: "3", boxB: "1.6x1.6", showB: "4.06", cntB: "5", rnGap: "2" };
const HEAD = {
  "บานเลือนSMS": ["sms_slide"], "บานเลือนยูโร": ["euro_slide"], "บานเลือนEseries": ["eseries"], "บานเลือนรางบน": ["topslide"],
  "บานเลือนSlimLux": ["slimlux"], "บานระแนงเลือน(ลูกฟูกเรียบ2ทางแนวตัง)": ["bar_slide", "", { material: "อิสระ" }],
  "บานเปด": ["open_door"], "บานหมุน": ["pivot"], "PCDoor": ["pcdoor"], "Velora": ["velora"],
  "บานเปลือยบานเลือน": ["frameless_door", "เลื่อน", { material: "เลื่อน" }],
  "บานเปลือยบานเปด": ["frameless_door", "สวิง (ประตู)", { material: "สวิง (ประตู)" }],
  "บานโซลิด2": ["bansolid", "โซลิด 2 ชั้น", { spec: { solidLayer: "โซลิด 2 ชั้น" } }],
  "บานโซลิด1": ["bansolid", "โซลิด 1 ชั้น", { spec: { solidLayer: "โซลิด 1 ชั้น" } }],
  "บานกระทุ้ง": ["awning"], "บานยก": ["banyok"], "บานเกล็ด": ["banklet"],
  "เฟยม": ["folding"], "เฟยมยูโร": ["fold_euro"], "เฟยมยก": ["fold_lift"],
  "ติดตาย": ["fixed"], "ตายดัดโค้ง": ["curve_fixed"], "เปดดัดโค้ง": ["curve_open"],
  "ระแนง1×5ซม.โชว์5": ["louver", "1x5", RANAE("1x5", "5")],
  "ระแนง1\"×4\"โชว์4\"": ["louver", "1x4", RANAE("1x4", "10.16")],
  "ระแนง1\"×1.6\"โชว์1.6\"": ["louver", "1x1.6", RANAE("1x1.6", "4.06")],
  "ประตูรัวบานเลือน": ["gate", "ระแนง", { material: "1.6x4", spec: { gslat: "ระแนง", rnFace: "10.16", rnGap: "2" } }],
  "ประตูรัวระแนงสลับ": ["gate", "ระแนงสลับ", { material: "1x4", spec: { gslat: "ระแนงสลับ", rnFace: "10.16", rnGap: "2", gboxB: "1.6x1.6", gfaceB: "4.06", gaRun: "3", gbRun: "5" } }],
  "ระแนงสลับ": ["louver_slip", "", { spec: { ...SLIP, rnFrame: "รวมโครง" } }],
  "ระแนงหมุน": ["louver_rotate", "", { spec: { rnMotor: "เอา" } }],
  "บานตู้Futuretech": ["cabinet_face"], "ราวกันตก": ["handrail"],
  "ชุดShower": ["shower", "บานตาย", { form: "บานตาย" }],
  "ชุดShower+บานเปด": ["shower", "บานตาย+บานเปิด", { form: "บานตาย+บานเปิด" }],
  "ชุดShower+บานเลือน": ["shower", "บานตาย+บานเลื่อน", { form: "บานตาย+บานเลื่อน" }],
};
const NOWEB = "ค่าแรงบนเว็บยังรวมอยู่ในค่าวัสดุ (เหมารวม) — ยังแยก 3 ก้อนเทียบตารางไม่ได้";
const PB = JSON.parse(fs.readFileSync(PB_PATH, "utf8"));
const { PRODUCTS } = await import("../src/lib/calculator40/products.mjs");

const out = [];
for (const r of rows) {
  const h = r.head;
  const [W, H] = r.size;
  let id = null, vk = "", inputs = null, note = "";
  const roof = /^หลังคา(เพิง|จัว|เลือน)(.*)$/.exec(h);
  if (roof) {
    id = roof[1] === "เพิง" ? "roof" : roof[1] === "จัว" ? "roof_gable" : "roof_slide";
    const m = ROOFMAT.find(([k]) => roof[2].includes(k));
    vk = m ? m[1] : "";
    const key = W + "x" + H;
    if (!m) note = "จับวัสดุหลังคาไม่ได้";
    else if (id === "roof_slide") {
      const s = SLIDE[key];
      if (s) inputs = { w: s[1], h: s[2], p: 2, material: vk, spec: { slidew: s[0] / 2, slideh: s[2] }, addons: { slide_motor: { kw: "80" } } };
      else note = "ไม่รู้สัดส่วนเลื่อน/ติดตาย ของขนาดนี้";
    } else inputs = { w: W, h: H, p: 1, material: vk, spec: id === "roof_gable" ? { ridge: RIDGE[key], roofend: "รางน้ำ" } : {} };
  } else if (HEAD[h]) {
    const [hid, hvk, extra, hnote] = HEAD[h];
    id = hid; vk = hvk || ""; note = hnote || "";
    if (id) {
      const prod = PRODUCTS[id];
      const p = Math.max(1, r.panels || 1);
      inputs = { w: W, h: H, p, form: prod.defForm ?? (prod.forms || [])[0] ?? "", ...(extra || {}) };
      if (id === "folding" || id === "fold_euro") {
        const fm = (prod.forms || []).find((f) => f.startsWith(p + "บาน"));
        if (fm) inputs.form = fm; else { inputs = null; note = "เว็บเลือกได้ไม่เกิน 6 บาน (ตารางมี " + p + " บาน)"; }
      }
    }
  } else if (/^(ฝา|ผนัง|พืน|งานไฟ)/.test(h)) note = NOWEB;
  else note = "ยังไม่ได้จับคู่รุ่นในเว็บ";
  if (inputs) Object.assign(inputs, { color: "white", colorKey: "white" });
  const SM = id && PB.SELL && PB.SELL.products && PB.SELL.products[id];
  const small = !!(SM && SM.small && (W * H) / 10000 < SM.small.maxArea);
  out.push({ head: h, id, vk, w: W, h: H, p: r.panels, small, target: r.target, note, inputs, pdf: r.pdf });
}

// ── ④ เขียนออก ──
fs.mkdirSync("scripts/fixtures", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ source: PDF, generatedBy: "scripts/gen-r41-table.mjs", rows: out }, null, 1) + "\n");
const labor = {};
for (const x of out) {
  if (!x.id) continue;
  (labor[x.id] = labor[x.id] || []).push({ vk: x.vk, w: x.w, h: x.h, p: x.p, small: x.small, cP: x.pdf.cP, sP: x.pdf.sP, cI: x.pdf.cI, sI: x.pdf.sI });
}
PB.R41 = {
  _meta: {
    source: "★ ตารางราคาขาย R4.1.pdf", generatedBy: "scripts/gen-r41-table.mjs",
    rule: "ค่าผลิต/ติดตั้ง (ขาย) = ช่องขายในตาราง R4.1 · ขนาดที่ไม่มี = ตัวคูณขนาดใกล้สุด · ค่าของ = ทุน × (1+matPct%)",
  },
  labor,
  matPct: (PB.R41 && PB.R41.matPct) || {},
};
fs.writeFileSync(PB_PATH, JSON.stringify(PB, null, 2) + "\n");
const byNote = {};
for (const x of out) if (!x.id || !x.inputs) { const k = x.head + " — " + (x.note || "ไม่มีอินพุต"); byNote[k] = (byNote[k] || 0) + 1; }
console.log("แถวในตาราง " + out.length + " · ผูกรุ่นได้ " + out.filter((x) => x.id).length + " · มีอินพุตให้เว็บคิด " + out.filter((x) => x.inputs).length);
console.log("รุ่นที่มีจุดอ้างอิงค่าแรง " + Object.keys(labor).length + ": " + Object.keys(labor).join(", "));
for (const [k, n] of Object.entries(byNote)) console.log("  ⚪ " + k + " (" + n + ")");
