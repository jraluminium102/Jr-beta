/**
 * verify-stock-audit — ตัวตรวจ "ราคาคิดราคา 4.0 ผูกสโตร์ครบไหม"
 * รัน: node --experimental-strip-types scripts/verify-stock-audit.mjs
 *
 * เจ้าของกังวล 3 เรื่อง (8 ส.ค.69): ผูกผิดตัว · ผิดสี · ไม่ครบ
 *   และ "กลัวเพิ่มราคากิโลแล้วราคาไม่เด้งตาม"
 * ตัวตรวจนี้เทสว่าเครื่องมือรายงานถูก — ไม่ได้เทสว่าข้อมูลในสโตร์ถูก (อันนั้นเจ้าของไล่เอง)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditStockLink, auditByProduct, bumpTest, STATUS_LABEL } from "../src/lib/calculator40/stock-audit.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  " + extra}`); };
const find = (rows, f) => rows.find(f);

console.log("\n═══ ① สโตร์ว่าง → ทุกอย่างต้องขึ้น 'ไม่เจอ/ผูกไม่ได้' ไม่มีตัวไหนโชว์ว่าผูกแล้ว ═══");
{
  const rows = auditStockLink([], PB);
  ok("มีรายการออกมา (ครอบทุกหมวด)", rows.length > 500, String(rows.length));
  ok("ไม่มีแถวไหนบอกว่า 'ผูกแล้ว' ทั้งที่สโตร์ว่าง", !rows.some((r) => r.status === "linked"), "");
  const secs = new Set(rows.map((r) => r.section));
  for (const s of ["อลูรายเส้น", "อุปกรณ์/สิ้นเปลือง", "กระจก", "หลังคา/ผนัง", "มอเตอร์/ออโต้", "เหล็ก", "งานเสริม", "อลู เรต/กก."])
    ok(`ครอบหมวด ${s}`, secs.has(s), "");
}

console.log("\n═══ ② จับคู่ด้วยรหัส (sku) — อลูรายเส้น ═══");
{
  const stock = [{ id: 1, name: "เฟรมบน B22001 อบขาว", sku: "B22001", color: "อบขาว", unit_cost: 1235 }];
  const rows = auditStockLink(stock, PB);
  const r = find(rows, (x) => x.section === "อลูรายเส้น" && x.key === "B22001");
  ok("เจอรหัสในสโตร์ → ผูกแล้ว", r?.status === "linked", `${r?.status} ${r?.note}`);
  ok("รายงานราคาสโตร์กลับมาด้วย", r?.stockPrice === 1235, String(r?.stockPrice));
  // ถ้ามีวันไหนต้องใส่ตัวแปลงรหัสอีก (สูตรเขียนรหัสหนึ่ง แต่ระบบใช้อีกรหัส) ต้องเตือนให้เห็น
  // ตอนนี้ ALUCODE_ALIAS ว่าง (เจ้าของยืนยัน 8 ส.ค.69 ว่าสูตรถูกแล้ว) → ยิงด้วย PB จำลอง
  const PB2 = { ...PB, ALUCODE_ALIAS: { B20001: "B22001" } };
  ok("ตัวแปลงรหัสว่างอยู่ (สูตรใช้รหัสตรงแล้ว)", Object.keys(PB.ALUCODE_ALIAS ?? {}).length === 0, JSON.stringify(PB.ALUCODE_ALIAS));
  ok("ถ้ามีตัวแปลงรหัส ต้องเตือนในหมายเหตุ",
    auditStockLink(stock, PB2).some((x) => /สูตรเขียนรหัส B20001 แต่ระบบชี้ไป B22001/.test(x.note)), "");
}

console.log("\n═══ ③ ราคาไม่ตรง / ราคา 0 / หลายสี ═══");
{
  const diff = auditStockLink([{ name: "x", sku: "B22001", color: "อบขาว", unit_cost: 9999 }], PB);
  ok("ราคาสโตร์ ≠ ราคาสูตร → 'ผูกแล้ว แต่ราคาไม่ตรง'",
    find(diff, (x) => x.key === "B22001")?.status === "price_diff", "");
  const zero = auditStockLink([{ name: "x", sku: "B22001", color: "อบขาว", unit_cost: 0 }], PB);
  ok("ราคาในสโตร์เป็น 0 → เตือน (ไม่ใช่บอกว่าผูกแล้ว)",
    ["zero", "missing"].includes(find(zero, (x) => x.key === "B22001")?.status), "");
  // หลายสี ไม่มีอบขาว → ระบบหยิบต่ำสุด ต้องเตือน
  const multi = auditStockLink([
    { name: "เฟรมบน B22001 ดำ", sku: "B22001", color: "ดำ", unit_cost: 1235 },
    { name: "เฟรมบน B22001 เทาซาฮาร่า", sku: "B22001", color: "เทาซาฮาร่า", unit_cost: 1345 },
  ], PB);
  const m = find(multi, (x) => x.key === "B22001");
  ok("หลายสีแต่ไม่มีแถวอบขาว → เตือนว่าหยิบราคาต่ำสุด", /ไม่มีแถวสีอบขาว/.test(m?.note ?? ""), m?.note ?? "");
  ok("หลายสี → บอกจำนวนแถวที่เจอ", m?.matches === 2, String(m?.matches));
  // มีอบขาว → ต้องใช้ราคาอบขาว ไม่ใช่ต่ำสุด (ตรรกะเดียวกับ buildPriceOverride)
  const w = auditStockLink([
    { name: "เฟรมบน B22001 อบขาว", sku: "B22001", color: "อบขาว", unit_cost: 1235 },
    { name: "เฟรมบน B22001 ดำ", sku: "B22001", color: "ดำ", unit_cost: 900 },
  ], PB);
  ok("มีแถวอบขาว → ใช้ราคาอบขาว (ไม่ใช่ต่ำสุด)", find(w, (x) => x.key === "B22001")?.stockPrice === 1235, "");
}

console.log("\n═══ ④ เรตอลูต่อกิโล (ตัวที่ทำให้ราคาเด้ง) ═══");
{
  const none = auditStockLink([], PB).filter((r) => r.section === "อลู เรต/กก.");
  ok("ไม่มีวัสดุคิดตามน้ำหนัก → เตือนว่าเรตกิโลไม่มีผล", none.every((r) => /ไม่มีผล/.test(r.note)), "");
  const two = auditStockLink([
    { name: "a", sku: "A1", supplier: "SMS", is_weight_based: true, price_per_kg: 187 },
    { name: "b", sku: "A2", supplier: "SMS", is_weight_based: true, price_per_kg: 200 },
  ], PB).filter((r) => r.item === "แบรนด์ SMS");
  ok("เรตกิโลในแบรนด์เดียวไม่เท่ากัน → เตือน", /ไม่เท่ากัน/.test(two[0]?.note ?? ""), two[0]?.note ?? "");
  ok("รายงานว่าระบบใช้ค่าสูงสุด", two[0]?.stockPrice === 200, String(two[0]?.stockPrice));
}

console.log("\n═══ ⑤ ทดสอบเด้ง — ขึ้นเรตอลู +10% ═══");
{
  const b = bumpTest(PB, 10);
  ok("มีผลทุกรุ่นที่คิดราคาออก", b.length > 30, String(b.length));
  ok("รุ่นที่ผูกเรตอลูจริงต้องขยับ", b.find((x) => x.id === "sms_slide")?.moved === true, "");
  ok("ราคาต้องขยับขึ้น ไม่ใช่ลง", b.filter((x) => x.moved).every((x) => x.after > x.before), "");
  ok("รุ่นที่ราคาฝังตายตัวต้องรายงานว่าไม่ขยับ", b.some((x) => !x.moved), "");
  // เรตเท่าเดิม = ห้ามมีรุ่นไหนขยับ (กันตัวทดสอบรายงานมั่ว)
  ok("ขึ้น 0% แล้วต้องไม่มีรุ่นไหนขยับเลย", bumpTest(PB, 0).every((x) => !x.moved), "");
}

console.log("\n═══ ⑤b สรุปรายรุ่น — มุมหลักที่เจ้าของใช้ (ไม่ใช่มุมหมวดวัสดุ) ═══");
{
  const prods = auditByProduct(auditStockLink([], PB), bumpTest(PB, 10));
  ok("ออกครบทุกรุ่นในเครื่องคิดราคา", prods.length > 40, String(prods.length));
  ok("เรียงรุ่นที่ต้องแก้ก่อนขึ้นบนสุด", prods[0]?.status === "ไม่ผูกเลย", prods[0]?.status ?? "");
  const pc = prods.find((p) => p.id === "pcdoor");
  ok("PC Door: อลูไม่มีรหัสทั้ง 7 บรรทัด → รายงาน 0/7", pc?.aluLinked === 0 && pc?.aluTotal === 7, JSON.stringify(pc));
  ok("PC Door: บอกชื่อบรรทัดที่ไม่มีรหัสมาด้วย", (pc?.aluNoCode?.length ?? 0) === 7, String(pc?.aluNoCode?.length));
  const solid = prods.find((p) => p.id === "bansolid");
  ok("บานโซลิด: อลูมีรหัสครบ (ไม่มีบรรทัดตกหล่น)", solid?.aluTotal === 7 && solid?.aluNoCode.length === 0, JSON.stringify(solid));
  ok("รุ่นที่ไม่มีรายการวัสดุเลย แยกสถานะไว้ต่างหาก", prods.some((p) => p.status === "ไม่มีรายการวัสดุ"), "");
  ok("ติดผลทดสอบเด้งมาให้ทุกรุ่นที่คิดราคาออก", prods.filter((p) => p.moved !== null).length > 30, "");
  ok("นับเฉพาะบรรทัดของรุ่นนั้น ไม่ปนรุ่นอื่น",
    prods.every((p) => p.aluLinked <= p.aluTotal && p.hwLinked <= p.hwTotal), "");
}

console.log("\n═══ ⑥ หน้าจอต่อสายครบไหม ═══");
{
  const p = fs.readFileSync(path.join(ROOT, "src/app/(app)/calculator40/stock-audit/page.tsx"), "utf8");
  ok("ต้องมีสิทธิ์เขียนถึงเข้าได้", /canWrite\(profile\?\.role\)/.test(p), "");
  ok("ดึงสต็อกแบบแบ่งหน้า (กัน cap 1,000 แถว)", /fetchAllPaged/.test(p), "");
  ok("ตรวจกับ pricebook ที่ทับราคาสโตร์แล้ว (ชุดที่ใช้จริง)", /applyPriceOverride/.test(p) && /buildPriceOverride/.test(p), "");
  const c = fs.readFileSync(path.join(ROOT, "src/app/(app)/calculator40/stock-audit/AuditClient.tsx"), "utf8");
  ok("มีปุ่มโหลด CSV (สร้างฝั่งเบราว์เซอร์)", /download = /.test(c) && /text\/csv/.test(c), "");
  ok("CSV ใส่ BOM ให้ Excel อ่านไทยออก", /"\\ufeff"|﻿/.test(c) || c.includes("BOM"), "");
  ok("เรียงตัวที่ต้องแก้ก่อนขึ้นบนสุด", /ORDER: AuditStatus\[\] = \["no_key", "missing"/.test(c), "");
  const cc = fs.readFileSync(path.join(ROOT, "src/components/Calculator40Client.tsx"), "utf8");
  ok("มีทางเข้าจากหน้าคิดราคา", /calculator40\/stock-audit/.test(cc), "");
  ok("ป้ายสถานะครบทุกแบบ", Object.keys(STATUS_LABEL).length === 6, "");
  ok("ค่าตั้งต้นของหน้าคือมุม 'รายรุ่น'", c.includes('useState<"product" | "item">("product")'), "");
  ok("มีตารางรายรุ่นจริง", c.includes("รายรุ่น — รุ่นไหนผูกสโตร์ครบ"), "");
  ok("โชว์บรรทัดอลูที่ไม่มีรหัสในตารางรายรุ่น", c.includes("p.aluNoCode.join"), "");
  ok("สลับไปดูรายวัสดุทีละบรรทัดได้", c.includes("ดูรายวัสดุทีละบรรทัด"), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
