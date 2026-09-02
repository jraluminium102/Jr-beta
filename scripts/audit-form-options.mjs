/**
 * audit-form-options — ตรวจ "ตัวเลือกรูปแบบ" ของทุกบาน ตามกฎ 3 ข้อของเจ้าของ (2 ก.ย.69)
 *
 *   ① มีในไฟล์ตัดประกอบ · ไม่มีในไฟล์คิดราคา  → ดึงของจากใบตัดมาใส่คิดราคา
 *   ② ไม่มีในไฟล์ตัดประกอบ · มีในไฟล์คิดราคา  → ใช้ได้ ไม่ต้องไปกรอกอะไรในใบตัด
 *   ③ ไม่มีทั้งคู่                              → ไม่ต้องสะเออะให้เลือก (เอา dropdown ออก)
 *
 * วิธีตรวจ: ค้นข้อความของตัวเลือกนั้นในไฟล์จริงทั้ง 2 ฝั่ง (ไม่เดาจากความจำ)
 *   ฝั่งใบตัด    = ทุกไฟล์ใน "ตัดประกอบ อัพเดท 30-7-2026"
 *   ฝั่งคิดราคา  = ทุกชีตใน "ถอดทุน_รวมทั้งหมด v20.xlsx"
 *   ฝั่งเว็บ     = ลองคิดราคาจริงทีละตัวเลือก ถ้าผลเท่ากันเป๊ะทุกตัวเลือก = เว็บไม่ได้ใช้ค่านี้
 *
 * รัน: node scripts/audit-form-options.mjs [--csv]
 */
import fs from "node:fs";
import path from "node:path";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import PRICEBOOK from "../src/lib/calculator40/pricebook.json" with { type: "json" };
import { openXlsx, readFormulas } from "./dumpxlsx.mjs";

const ROOT = path.resolve(process.cwd());
const CUT_DIR = path.join(ROOT, "ตัดประกอบ อัพเดท 30-7-2026");
const COST_XLSX = path.join(ROOT, "ถอดทุน_รวมทั้งหมด v20.xlsx");

// ── รวมข้อความทั้งไฟล์เป็นก้อนเดียว (ค้นแบบ substring เร็วกว่าไล่เซลล์ทีละตัว) ──
const blobOf = (file) => {
  const x = openXlsx(file);
  const parts = [];
  for (const s of x.sheets) {
    parts.push("" + s.name + "");
    for (const r of x.read(s.path)) parts.push(Object.values(r.cells).join(""));
    // ⚠ ต้องเก็บ "ตัวสูตร" ด้วย — ตัวเลือกหลายอันโผล่แค่ข้างใน IF(...) ไม่ได้เป็นค่าในเซลล์ไหนเลย
    //   (หลังคาเลื่อน "เลื่อนเปิดกลาง" อยู่ใน =IF(B3="เลื่อนเปิดกลาง",…) อย่างเดียว)
    //   ถ้าอ่านแต่ค่า จะสรุปผิดว่า "ไม่มีในไฟล์" แล้วไปลบของที่มีจริงทิ้ง
    for (const r of readFormulas(x.zip, s.path)) parts.push(Object.values(r.cells).join(" "));
  }
  return parts.join("\n");
};

console.log("อ่านไฟล์ใบตัด...");
const CUT_BLOBS = fs.existsSync(CUT_DIR)
  ? fs.readdirSync(CUT_DIR).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$"))
      .map((f) => ({ name: f, text: blobOf(path.join(CUT_DIR, f)) }))
  : [];
console.log(`  ${CUT_BLOBS.length} ไฟล์`);
console.log("อ่านไฟล์คิดราคา (ถอดทุน)...");
const COST_BLOB = fs.existsSync(COST_XLSX) ? blobOf(COST_XLSX) : "";
console.log("  เสร็จ\n");

// เทียบแบบ "ตัดช่องว่างทิ้ง" — ไฟล์คนพิมพ์เว้นวรรคไม่เหมือนกัน
const squash = (s) => String(s).replace(/\s+/g, "");
const CUT_SQ = CUT_BLOBS.map((b) => ({ name: b.name, text: squash(b.text) }));
const COST_SQ = squash(COST_BLOB);

const inCut = (word) => CUT_SQ.filter((b) => b.text.includes(squash(word))).map((b) => b.name);
const inCost = (word) => COST_SQ.includes(squash(word));

/** เว็บอ่านค่า form ตัวนี้จริงไหม
 *  ต้องเช็ค 2 ทาง — ทางเดียวไม่พอ:
 *   ก) ลองคิดราคาทุกตัวเลือกแล้วเทียบผล
 *      ⚠ ไม่พอเดี่ยว ๆ: หลังคาเลื่อนอ่าน form จริง (railLen) แต่ค่าตั้งต้น ส่วนเลื่อน กว้าง=ยื่น=150
 *        ทำให้ 2 ตัวเลือกได้เลขเท่ากันพอดี → ถ้าดูแค่ผลลัพธ์จะฟ้องผิดว่า "ปุ่มหลอกตา"
 *   ข) ค้นคำว่า form ในตัวสูตรของรุ่นนั้นตรง ๆ
 *  และข้าม sellDirect (รุ่นกรอกราคา/ตร.ม. เอง) — ไม่มีสูตรทุนให้เปลี่ยนอยู่แล้ว ไม่ใช่บั๊ก */
function webUsesForm(p) {
  if (p.sellDirect) return true;
  const src = JSON.stringify([p.vars, p.alu, p.hardware, p.consum, p.glass, p.addons, p.areaExpr, p.sellRate, p.sellInstallRate]);
  if (/\bform\b/.test(src)) return true;
  const d = p.defaults || { w: 150, h: 150, p: 1 };
  const sig = new Set();
  for (const f of p.forms) {
    try {
      const r = computeCost(PRICEBOOK, p, { w: d.w, h: d.h, p: d.p || 1, form: f, color: "white", colorKey: "white" });
      sig.add(`${r.cost}|` + (r.lines || []).map((l) => `${l.name}:${l.qty}`).join(","));
    } catch { sig.add("ERR"); }
  }
  return sig.size > 1;
}

const rows = [];
for (const p of Object.values(PRODUCTS)) {
  const forms = p.forms || [];
  if (forms.length < 2) continue;           // ไม่มี dropdown ให้เลือก = ไม่ต้องตรวจ
  // ⚠ ถ้าเว็บ "ใช้ค่านี้อยู่แล้ว" (กดแล้วเลขเปลี่ยน) แปลว่าเคยพอร์ตมาจากไฟล์ไหนสักไฟล์แล้ว = จบ ไม่ต้องตรวจซ้ำ
  //   ค้นข้อความตรง ๆ ไม่พอตัดสิน เพราะป้ายบน dropdown ไม่ได้เขียนเหมือนในไฟล์เป๊ะ ๆ
  //   (เช่น เฟี้ยม "2บาน: รวบเปิดซ้าย (2-0)" ในใบตัดเขียน "2L0R" · ซิปสกรีน Z100 อยู่ในตารางราคาออโต้)
  //   จึงตรวจเฉพาะตัวที่เว็บ "ไม่ได้ใช้" — พวกนี้แหละที่เป็นปุ่มหลอกตา
  const used = webUsesForm(p);
  for (const f of forms) {
    const cut = used ? [] : inCut(f), cost = used ? false : inCost(f);
    // กฎ 3 ข้อ (ใช้เฉพาะตัวที่เว็บยังไม่ได้ใช้ค่า)
    const rule = cut.length && !cost ? "① ดึงจากใบตัดมาใส่คิดราคา"
      : !cut.length && cost ? "② มีในไฟล์คิดราคา → ทำในเว็บ ไม่ต้องกรอกในใบตัด"
      : cut.length && cost ? "มีทั้ง 2 ไฟล์ → ทำในเว็บ"
      : "③ ไม่มีทั้งคู่ → เอาตัวเลือกออก";
    const todo = used ? "— (เว็บใช้ค่านี้อยู่แล้ว)" : rule;
    rows.push({ id: p.id, name: p.name, form: f, cut: cut.length ? cut.join(" · ") : "", cost: cost ? "มี" : "", used: used ? "ใช้" : "ไม่ใช้", todo });
  }
}

// ── รายงาน ──
const TODO = rows.filter((r) => !r.todo.startsWith("—"));
console.log(`ตรวจ ${new Set(rows.map((r) => r.id)).size} รุ่น · ${rows.length} ตัวเลือก · ต้องจัดการ ${TODO.length}\n`);

const byRule = new Map();
for (const r of TODO) {
  const k = r.todo;
  if (!byRule.has(k)) byRule.set(k, []);
  byRule.get(k).push(r);
}
for (const [k, list] of [...byRule.entries()].sort()) {
  console.log(`\n═══ ${k} — ${list.length} ตัวเลือก ═══`);
  for (const r of list) console.log(`  ${r.id.padEnd(18)} ${r.form.padEnd(28)} ${r.cut ? "ใบตัด: " + r.cut : "ไม่อยู่ในใบตัดเลย"}`);
}

if (process.argv.includes("--csv")) {
  const out = ["รุ่น\tชื่อรุ่น\tตัวเลือก\tอยู่ในไฟล์ใบตัด\tอยู่ในไฟล์คิดราคา\tเว็บใช้ค่านี้\tต้องทำ",
    ...rows.map((r) => [r.id, r.name, r.form, r.cut, r.cost, r.used, r.todo].join("\t"))].join("\n");
  fs.writeFileSync("audit-form-options.tsv", "﻿" + out, "utf8");
  console.log("\nเขียนไฟล์ audit-form-options.tsv แล้ว");
}
