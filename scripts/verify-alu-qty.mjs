/**
 * verify-alu-qty — จำนวนเส้นอลูในเว็บ ต้องตรงกับชีต "คิดทุน ___" ในไฟล์ถอดทุน
 * ─────────────────────────────────────────────────────────────────────────────
 * ทำไมต้องมี (20 ส.ค.69): เดิมเว็บนับเส้นแบบ "ซื้อเต็มเส้น" (ปัดขึ้น) ส่วนไฟล์คิดแบบ
 *   "ใช้กี่เมตร ÷ 6.4 + เศษ 30%" — ตัวเลขจึงไม่มีทางตรงกัน และ "การปัดขึ้น" ยัง
 *   กลบบั๊กจำนวนชิ้นไว้ด้วย (เจอจริง: เฟรมข้าง SMS นับ 1 ด้าน ทั้งที่ต้อง 2 ด้าน)
 *   พอเปลี่ยนมาใช้วิธีเดียวกับไฟล์แล้ว จำนวนต้องตรงกันเป๊ะ → ล็อกไว้ที่นี่
 *
 * เทียบ "จำนวนเส้น" อย่างเดียว ไม่เทียบราคา (ราคาในไฟล์เก่ากว่าสโตร์ — คนละที่มา)
 *
 *   node scripts/verify-alu-qty.mjs
 */
import { openXlsx } from "./dumpxlsx.mjs";
import { createRequire } from "node:module";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";

const require = createRequire(import.meta.url);
const PB = require("../src/lib/calculator40/pricebook.json");
const XLSX = "C:/Users/jralu/JR-beta/ถอดทุน_รวมทั้งหมด v9.xlsx";

// ชีต → รุ่นในเว็บ + ชื่อบรรทัดที่เขียนต่างกันระหว่างไฟล์กับเว็บ (alias)
// ⚠ ใส่เฉพาะรุ่นที่ชีตกรอกขนาด/รูปแบบตรงกับที่เว็บรับได้ · รุ่นที่ชีตเขียน "สูตร live ประมาณ" ไม่ใส่
const CASES = [
  { sheet: "คิดทุน SMS", id: "sms_slide", form: "อิสระ" },
  { sheet: "คิดทุน ยูโร", id: "euro_slide", form: "อิสระ", alias: { "เฟรมล่าง": "เฟรมบน", "เสารับแรง": "โหนกเกี่ยว" } },   // ชีตตัดรวมเฟรมบน+ล่าง · ชีตเรียกเสารับแรงว่า "โหนกเกี่ยว"
  { sheet: "คิดทุน บานเปิด", id: "open_door", form: "มีธรณี" },
  { sheet: "คิดทุน กระทุ้ง", id: "awning", form: "อิสระ" },
  { sheet: "คิดทุน E-series", id: "eseries", form: "อิสระ" },
  { sheet: "คิดทุน PC Door", id: "pcdoor", form: "แบ่ง 2" },
];

const num = (v) => (v == null || v === "" ? null : Number(String(v).replace(/,/g, "")));
const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase();

function sheetRows(book, name) {
  const s = book.sheets.find((x) => x.name === name);
  if (!s) return null;
  return book.read(s.path);
}

/** อ่านขนาด/จำนวนบานที่กรอกไว้บนหัวชีต — แถวก่อน "สูง (ซม.) →" คือกว้าง */
function readInputs(rows) {
  let w = null, h = null, p = null;
  for (const { row, cells } of rows) {
    const a = String(cells.A || "");
    if (a.startsWith("สูง")) {
      h = num(cells.B);
      const prev = rows.find((r) => r.row === row - 1);
      w = num(prev?.cells?.B);
    }
    if (a.startsWith("จำนวนบาน") || a.startsWith("จำนวนช่อง")) p = num(cells.B);
  }
  return { w, h, p: p ?? 1 };
}

/** บรรทัดวัสดุในชีต: อยู่ระหว่างหัวตาราง (B="จำนวน") กับแถว "ทุนรวม" */
function readQty(rows) {
  const start = rows.find((r) => String(r.cells.B || "") === "จำนวน")?.row ?? 0;
  const end = rows.find((r) => String(r.cells.A || "").startsWith("ทุนรวม"))?.row ?? 1e9;
  const out = [];
  for (const { row, cells } of rows) {
    if (row <= start || row >= end) continue;
    const name = String(cells.A || "").trim();
    const q = num(cells.B);
    if (!name || q == null || !Number.isFinite(q)) continue;
    out.push({ name, qty: q });
  }
  return out;
}

const book = openXlsx(XLSX);
let pass = 0, fail = 0;

console.log('═══ จำนวนเส้นอลู: เว็บ ↔ ชีต "คิดทุน ___" ═══\n');

for (const c of CASES) {
  const rows = sheetRows(book, c.sheet);
  if (!rows) { console.log(`❌ ไม่พบชีต ${c.sheet}`); fail++; continue; }
  const inp = readInputs(rows);
  const prod = PRODUCTS[c.id];
  if (!prod || !(inp.w > 0) || !(inp.h > 0)) { console.log(`❌ ${c.sheet}: อ่านขนาดจากหัวชีตไม่ได้`); fail++; continue; }

  const r = computeCost(PB, prod, { w: inp.w, h: inp.h, p: inp.p, form: c.form, color: "white" });
  const web = r.lines.filter((l) => l.cat === "alu");
  const file = readQty(rows);

  console.log(`▶ ${prod.name} (${inp.w}×${inp.h} ${inp.p} บาน) — ชีต "${c.sheet}"`);
  // ชีตบางบรรทัด "ตัดรวม" หลายเส้นของเว็บไว้แถวเดียว (เช่น ยูโร เฟรมบน+ล่างนอก) → จับกลุ่มแล้วเทียบผลรวม
  const group = new Map();   // ชื่อบรรทัดในชีต → { qty, web: [] }
  for (const wl of web) {
    const raw = wl.name.split("(")[0].trim();
    const base = norm((c.alias && c.alias[raw]) || raw);
    const hit = file.find((f) => { const fn = norm(f.name); return fn.startsWith(base) || base.startsWith(fn); });
    if (!hit) { console.log(`  ⚠ ${wl.name}: ไม่มีบรรทัดนี้ในชีต (ข้าม)`); continue; }
    if (!group.has(hit.name)) group.set(hit.name, { qty: hit.qty, web: [] });
    group.get(hit.name).web.push(wl);
  }
  for (const [fname, g] of group) {
    const sum = g.web.reduce((a, x) => a + x.qty, 0);
    const label = g.web.length > 1 ? `${fname} (เว็บแยก ${g.web.length} บรรทัด)` : fname;
    if (Math.abs(g.qty - sum) < 0.005) { console.log(`  ✅ ${label}: ${Math.round(sum * 1e5) / 1e5} เส้น`); pass++; }
    else { console.log(`  ❌ ${label}: เว็บ ${Math.round(sum * 1e5) / 1e5} เส้น · ไฟล์ ${g.qty} เส้น  <-- ไม่ตรง`); fail++; }
  }
  console.log("");
}

console.log(`═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
