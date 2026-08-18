/**
 * dump-one — กางรายการวัสดุ "รุ่นเดียว" ทั้งสองระบบมาเทียบทีละบรรทัด
 * รัน: node --experimental-strip-types scripts/dump-one.mjs <calcId> <cutId> <W> <H> <N> [form]
 * ตัวอย่าง: node --experimental-strip-types scripts/dump-one.mjs sms_slide sms_slide_free 300 220 3 อิสระ
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPECS } from "../src/lib/cutlist/products.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
const [calcId, cutId, W, H, N, form] = process.argv.slice(2);
const w = +W, h = +H, n = +N;

const prod = PRODUCTS[calcId];
const spec = (CUT_SPECS ?? []).find((s) => s.id === cutId);
const pad = (s, n2) => String(s ?? "").slice(0, n2).padEnd(n2);
const rp = (s, n2) => String(s ?? "").padStart(n2);
const b = (x) => Math.round(Number(x) || 0).toLocaleString("th-TH");

console.log("═".repeat(112));
console.log(`${prod?.name ?? calcId}  ${w}×${h} ซม. · ${n} บาน${form ? " · " + form : ""}`);
console.log("═".repeat(112));

const r = computeCost(PB, prod, { w, h, p: n, form: form || prod.defForm });

console.log("\n┏━ ① เครื่องคิดราคา 4.0 — เส้นอลู ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  รหัส      ชื่อบรรทัด                       ยาว/ท่อน  จำนวนท่อน  เส้น   น้ำหนัก/เส้น  ราคา/เส้น      รวม");
console.log("  " + "-".repeat(108));
const ev = (x, scope) => (typeof x === "number" ? x : null);
let aluSum = 0;
for (const l of (r.lines || []).filter((x) => x.cat === "alu")) {
  const it = (prod.alu || []).find((a) => l.name.startsWith(a.name));
  aluSum += l.amount;
  console.log("  " + pad(it?.code ?? "— ไม่มีรหัส", 10) + pad(l.name, 32) +
    rp(typeof it?.seg === "number" ? it.seg : String(it?.seg ?? "-"), 9) +
    rp(String(it?.count ?? "-"), 11) + rp(l.qty, 6) +
    rp(it?.kg ?? "-", 13) + rp(b(l.unitPrice), 11) + rp(b(l.amount), 9));
}
console.log("  " + " ".repeat(96) + "รวมอลู " + rp(b(aluSum), 9));

console.log("\n┏━ ① เครื่องคิดราคา 4.0 — อุปกรณ์ / สิ้นเปลือง ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  ชื่อรายการ                              จำนวน  หน่วย     ราคา/หน่วย       รวม   ผูกสโตร์ได้ไหม");
console.log("  " + "-".repeat(108));
let hwSum = 0;
for (const l of (r.lines || []).filter((x) => x.cat === "hardware" || x.cat === "consum")) {
  hwSum += l.amount;
  const linkable = prod.partsLinked && PB.PARTS && l.name in PB.PARTS;
  console.log("  " + pad(l.name, 40) + rp(l.qty, 6) + "  " + pad(l.unit ?? "", 8) +
    rp(b(l.unitPrice), 11) + rp(b(l.amount), 10) + "   " + (linkable ? "ผูกได้" : "❌ ไม่ผูก"));
}
console.log("  " + " ".repeat(56) + "รวมอุปกรณ์/สิ้นเปลือง " + rp(b(hwSum), 9));
console.log(`\n  กระจก ${b(r.cost.glass)} · ค่าอบสี ${b(r.cost.bake)} · ทุนรวม ${b(r.cost.total)} · อลูรวม ${r.aluKg} กก.`);

if (!spec) { console.log("\n(ไม่พบสเปกใบตัด " + cutId + ")"); process.exit(0); }
const cut = computeCutList(spec, { W: w, H: h, N: n }, 1);

console.log("\n┏━ ② ใบตัด / BOQ — เส้นอลู ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  รหัส        ชื่อบรรทัด                          ยาว/ท่อน(ซม.)  จำนวนท่อน   เส้น  เส้นสต็อก  หมายเหตุ");
console.log("  " + "-".repeat(108));
for (const row of cut.rows) {
  console.log("  " + pad(row.code || "— ไม่มีรหัส", 12) + pad(row.name, 36) +
    rp(row.len, 13) + rp(row.qty, 11) + rp(row.bars, 6) + rp(row.stockLen, 10) + "  " + (row.note ?? ""));
}
console.log("\n  สรุปเส้นต่อรหัส (BOQ ตัวจริง):");
for (const bc of cut.barsByCode) console.log("    " + pad(bc.code, 12) + rp(bc.bars, 4) + " เส้น  (ยาวรวม " + bc.totalLenCm + " ซม. · เส้น " + bc.stockLen + " ซม.)");
console.log("    รวมทั้งหมด " + cut.totalBars + " เส้น");

console.log("\n┏━ ② ใบตัด / BOQ — อุปกรณ์ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  ชื่อรายการ                              จำนวน  หน่วย   รหัสสโตร์      หมายเหตุ");
console.log("  " + "-".repeat(108));
for (const hwr of cut.hardware) {
  console.log("  " + pad(hwr.name, 40) + rp(hwr.qty, 6) + "  " + pad(hwr.unit, 7) + pad(hwr.sku || "— ไม่มี", 14) +
    (hwr.noStock ? "ไม่ตัดสต็อก " : "") + (hwr.note ?? ""));
}
