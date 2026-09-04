/**
 * extract-sell-model — ดึง "สูตรราคาขาย" ออกจากไฟล์ถอดทุน v20.1 → src/lib/calculator40/sell-model.json
 * ─────────────────────────────────────────────────────────────────────────────
 * เจ้าของสั่ง 3 ก.ย.69 "เอาตามไฟล์ · ทำทั้งหมด"
 *
 * แต่ละชีต "คิดทุน <รุ่น>" มีบล็อกท้ายชีตเหมือนกัน
 *   🎯 กำไรสุทธิที่ต้องการ %          → เป้ากำไรสุทธิ (หลังหักค่าดำเนินการ)
 *   สัดส่วนกำไร วัสดุ · ผลิต · ติดตั้ง → ratio 3 ตัว (ล็อก — นโยบาย)
 *   ค่าดำเนินการ %                     → overhead ที่ฝังในราคา (30%)
 *   ราคาขาย/ชุด ถ้าพื้นที่ < N ตร.ม.   → ราคาตายตัวไซซ์เล็ก (บางรุ่น)
 *
 * รันซ้ำได้ · ต้องมีไฟล์ "ถอดทุน_รวมทั้งหมด v20.1.xlsx" อยู่ที่ root (ไฟล์ไม่เข้า git)
 */
import fs from "node:fs";
import { openXlsx } from "./dumpxlsx.mjs";

const XLSX = "ถอดทุน_รวมทั้งหมด v20.1.xlsx";
const OUT = "src/lib/calculator40/pricebook.json";   // เขียนลงคีย์ SELL ในตารางราคากลาง

/** ชีตคิดทุน → รุ่นในเว็บ (รุ่นที่เว็บไม่มี/ชีตไม่มี ปล่อยว่าง) */
const SHEET_TO_ID = {
  "คิดทุน SMS": "sms_slide", "คิดทุน ยูโร": "euro_slide", "คิดทุน SlimLux": "slimlux",
  "คิดทุน E-series": "eseries", "คิดทุน บานเลื่อนรางบน": "topslide", "คิดทุน บานระแนงเลื่อน": "bar_slide",
  "คิดทุน Velora": "velora", "คิดทุน บานเปิด": "open_door", "คิดทุน บานหมุน": "pivot",
  "คิดทุน บานโซลิด": "bansolid", "คิดทุน PC Door": "pcdoor", "คิดทุน กระทุ้ง": "awning",
  "คิดทุน บานยก": "banyok", "คิดทุน บานเกล็ด": "banklet", "คิดทุน เฟี้ยม": "folding",
  "คิดทุน เฟี้ยมยูโร": "fold_euro", "คิดทุน เฟี้ยมยก": "fold_lift", "คิดทุน ติดตาย": "fixed",
  "คิดทุน ตายดัดโค้ง": "curve_fixed", "คิดทุน เปิดดัดโค้ง": "curve_open",
  "คิดทุน ระแนง": "louver", "คิดทุน ระแนงสลับ": "louver_slip", "คิดทุน ระแนงหมุน": "louver_rotate",
  "คิดทุน ประตูรั้ว": "gate", "คิดทุน ชุด Shower": "shower", "คิดทุน ราวกันตก": "handrail",
  "คิดทุน บานตู้ Futuretech": "cabinet_face", "คิดทุน YKK": "ykk",
};

const X = openXlsx(XLSX);
const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; };

const out = { _meta: { source: XLSX, generated: new Date().toISOString().slice(0, 10), note: "สร้างด้วย scripts/extract-sell-model.mjs — ห้ามแก้ด้วยมือ" }, overheadPct: 30, roundTo: 100, products: {} };
const missing = [];

for (const [sheet, id] of Object.entries(SHEET_TO_ID)) {
  const sh = X.sheets.find((s) => s.name === sheet);
  if (!sh) { missing.push(`${sheet} — ไม่มีชีตในไฟล์`); continue; }
  const rows = X.read(sh.path);
  let target = null, ratios = null, oh = null, small = null;
  for (const { cells: c } of rows) {
    const a = String(c.A ?? "");
    if (a.includes("กำไรสุทธิที่ต้องการ")) target = num(c.B) ?? target;
    if (a.startsWith("สัดส่วนกำไร")) { const r = [num(c.B), num(c.C), num(c.D)]; if (r.every((x) => x != null)) ratios = r; }
    if (a.startsWith("ค่าดำเนินการ %")) oh = num(c.B) ?? oh;
    // "ราคาขาย/ชุด — ถ้าพื้นที่ < 2 ตร.ม. (ราคาตายตัว)"
    const m = /ถ้าพื้นที่\s*<\s*([\d.]+)\s*ตร\.?ม/.exec(a);
    if (m) { const price = num(c.B) ?? num(c.D); if (price) small = { maxArea: Number(m[1]), price }; }
  }
  if (target == null || !ratios) { missing.push(`${sheet} (${id}) — ${target == null ? "ไม่เจอเป้ากำไร" : ""}${!ratios ? " ไม่เจอสัดส่วน" : ""}`); continue; }
  out.products[id] = { sheet, target, ratios, overheadPct: oh ?? 30, shape: "bucket", ...(small ? { small } : {}) };
}

// ── หลังคา: เป้ากำไร 6 ค่า + สัดส่วนแยกกระจก · สูตรขายเป็นก้อนเดียว (ไม่ใช่ 3 ก้อนแบบบาน) ──
{
  const sh = X.sheets.find((s) => s.name === "คิดทุน หลังคา (รวม)");
  const rows = new Map(X.read(sh.path).map((r) => [r.row, r.cells]));
  const g = (r, k) => num(rows.get(r)?.[k]);
  const roof = {
    sheet: "คิดทุน หลังคา (รวม)", shape: "single", overheadPct: g(60, "B") ?? 30,
    targets: { lean: g(63, "B"), slide: g(64, "B"), gable: g(65, "B"), glass: g(66, "B"), glassSlide: g(66, "E"), metal: g(67, "B"), metalSlide: g(67, "E") },
    ratios: [g(68, "B"), g(68, "C"), g(68, "D")],
    ratioMaterialGlass: g(68, "E"),
  };
  if (Object.values(roof.targets).some((x) => x == null) || roof.ratios.some((x) => x == null)) missing.push("คิดทุน หลังคา (รวม) — อ่านบล็อกเป้ากำไรไม่ครบ");
  else for (const id of ["roof", "roof_gable", "roof_slide", "roof_multi", "gable_multi", "glasshouse", "glasshouse_multi"]) out.products[id] = { ...roof };
}

// ── ราคาขายมอเตอร์แบบฟิก (ไม่ผ่านกำไร) — ชีตเขียนไว้ตรง ๆ ──
{
  const sl = X.sheets.find((s) => s.name === "คิดทุน หลังคาเลื่อน");
  const r = new Map(X.read(sl.path).map((x) => [x.row, x.cells]));
  const n = (row) => num(r.get(row)?.B);
  out.motorSell = {
    roof_slide: { first: n(49), next: n(50), sensor: n(51) },   // แถว 49-51 "💲ขาย… ไม่ผ่านกำไร"
    gate: { motor: 30000, wire: 2000 },                          // ชีตประตูรั้ว D44 / D45
  };
}

// ⚠ เขียนทับเฉพาะคีย์ SELL — ห้ามเขียนทับทั้งไฟล์ (ตารางราคาอื่นอยู่ในไฟล์เดียวกัน)
const pb = JSON.parse(fs.readFileSync(OUT, "utf8"));
pb.SELL = out;
fs.writeFileSync(OUT, JSON.stringify(pb, null, 2).replace(/\n/g, "\r\n"));
console.log(`เขียน ${OUT} → PB.SELL — ${Object.keys(out.products).length} รุ่น`);
for (const [id, p] of Object.entries(out.products)) console.log(`  ${id.padEnd(18)} เป้า ${String(p.target ?? "หลังคา 6 ค่า").padEnd(12)} ratio ${JSON.stringify(p.ratios)}${p.small ? " · ไซซ์เล็ก " + p.small.price : ""}`);
if (missing.length) { console.log("\n⚠ ยังไม่ได้:"); for (const m of missing) console.log("  " + m); }
console.log("\nมอเตอร์ขายฟิก:", JSON.stringify(out.motorSell));
