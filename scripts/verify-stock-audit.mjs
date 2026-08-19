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
import { auditStockLink, auditByProduct, auditKgLink, bumpTest, STATUS_LABEL } from "../src/lib/calculator40/stock-audit.ts";
import { buildPriceOverride, applyPriceOverride, stockColorOfCalc } from "../src/lib/calculator40/stock-link.ts";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  " + extra}`); };
const find = (rows, f) => rows.find(f);
// ราคาเส้นที่สูตรใช้จริง (ฐานใหม่ = น้ำหนักจริง × เรต ฿/กก.) — เทสต้องอ้างตัวนี้ ไม่ฝังเลข
const B22001 = PB.ALUCODE.B22001;

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
  const stock = [{ id: 1, name: "เฟรมบน B22001 อบขาว", sku: "B22001", color: "อบขาว", unit_cost: B22001 }];
  const rows = auditStockLink(stock, PB);
  const r = find(rows, (x) => x.section === "อลูรายเส้น" && x.key === "B22001");
  ok("เจอรหัสในสโตร์ → ผูกแล้ว", r?.status === "linked", `${r?.status} ${r?.note}`);
  ok("รายงานราคาสโตร์กลับมาด้วย", r?.stockPrice === B22001, String(r?.stockPrice));
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
    { name: "เฟรมบน B22001 ดำ", sku: "B22001", color: "ดำ", unit_cost: B22001 },
    { name: "เฟรมบน B22001 เทาซาฮาร่า", sku: "B22001", color: "เทาซาฮาร่า", unit_cost: 1345 },
  ], PB);
  const m = find(multi, (x) => x.key === "B22001");
  ok("หลายสีแต่ไม่มีแถวอบขาว → เตือนว่าหยิบราคาต่ำสุด", /ไม่มีแถวสีอบขาว/.test(m?.note ?? ""), m?.note ?? "");
  ok("หลายสี → บอกจำนวนแถวที่เจอ", m?.matches === 2, String(m?.matches));
  // มีอบขาว → ต้องใช้ราคาอบขาว ไม่ใช่ต่ำสุด (ตรรกะเดียวกับ buildPriceOverride)
  const w = auditStockLink([
    { name: "เฟรมบน B22001 อบขาว", sku: "B22001", color: "อบขาว", unit_cost: B22001 },
    { name: "เฟรมบน B22001 ดำ", sku: "B22001", color: "ดำ", unit_cost: 900 },
  ], PB);
  ok("มีแถวอบขาว → ใช้ราคาอบขาว (ไม่ใช่ต่ำสุด)", find(w, (x) => x.key === "B22001")?.stockPrice === B22001, "");
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

console.log("\n═══ ⑤c ราคาเส้นแยกสี ต้องมาจากสโตร์ (เจ้าของสั่ง 8 ส.ค.69) ═══");
{
  // สโตร์ตั้ง "รหัสเดียวกันทุกสี" แล้วแยกด้วยช่อง สี — ต้องอ่านได้ครบทุกสี
  const stock = [];
  for (const [code, px] of [
    ["B20001", { "อบขาว": 1125, "ดำ": 1125, "เทาซาฮาร่า": 1225, "ลายไม้สักทอง": 1825 }],
    ["B20003", { "อบขาว": 870, "ดำ": 900, "เทาซาฮาร่า": 950, "ลายไม้สักทอง": 1395 }],
  ]) for (const [c, v] of Object.entries(px)) stock.push({ name: `เฟรม ${code}`, sku: code, color: c, unit_cost: v });

  const ov = buildPriceOverride(stock, PB);
  ok("เก็บราคาครบทุกสี ไม่ทิ้งสีอื่น", Object.keys(ov.ALUCOLOR_STOCK).length === 4, Object.keys(ov.ALUCOLOR_STOCK).join(","));
  ok("อบขาว/ดำ แยกกันจริง (ตั้งราคาต่างกันได้)",
    ov.ALUCOLOR_STOCK["อบขาว"]?.B20003 === 870 && ov.ALUCOLOR_STOCK["ดำ"]?.B20003 === 900, "");

  const pb2 = applyPriceOverride(JSON.parse(JSON.stringify(PB)), ov);
  const run = (calcKey, bake) => computeCost(pb2, PRODUCTS.sms_slide,
    { w: 300, h: 220, p: 3, form: "อิสระ", color: bake, stockColor: stockColorOfCalc(calcKey) });
  const priceOf = (r, nm) => r.lines.find((l) => l.name.startsWith(nm))?.unitPrice;

  const w = run("white", "white"), bk = run("black", "white"), sh = run("sahara", "sahara"), wd = run("wood_teak", "woodStock");
  ok("สีขาว → ใช้ราคาสโตร์แถวอบขาว", priceOf(w, "เฟรมบน") === 1125 && priceOf(w, "เฟรมข้าง") === 870, "");
  ok("สีดำ → ใช้ราคาสโตร์แถวดำ (แยกจากขาวได้)", priceOf(bk, "เฟรมข้าง") === 900, String(priceOf(bk, "เฟรมข้าง")));
  ok("เทาซาฮาร่า → ใช้ราคาสโตร์แถวเทา", priceOf(sh, "เฟรมบน") === 1225 && priceOf(sh, "เฟรมข้าง") === 950, "");
  ok("ลายไม้ → ใช้ราคาสโตร์แถวลายไม้", priceOf(wd, "เฟรมบน") === 1825, String(priceOf(wd, "เฟรมบน")));
  ok("⚠ ห้ามบวกค่าอบซ้ำ เมื่อราคาสโตร์รวมสีแล้ว", sh.cost.bake === 0 && wd.cost.bake === 0, `${sh.cost.bake}/${wd.cost.bake}`);
  ok("สีที่สโตร์ไม่มี (อบพิเศษ) ยังคิดแบบ ขาว+ค่าอบ ได้เหมือนเดิม",
    computeCost(pb2, PRODUCTS.sms_slide, { w: 300, h: 220, p: 3, form: "อิสระ", color: "special", stockColor: stockColorOfCalc("special") }).cost.bake > 0, "");
  ok("แพงขึ้นตามสี: ขาว < เทา < ลายไม้", w.cost.total < sh.cost.total && sh.cost.total < wd.cost.total, "");
}

console.log("\n═══ ⑤d สายราคา 'ต่อโล → ต่อเส้น' (เจ้าของถาม 19 ส.ค.69) ═══");
{
  const mk = (o) => ({ name: o.n ?? "เฟรม", sku: o.sku, color: o.c ?? "อบขาว", is_weight_based: o.wb ?? true,
    weight_per_unit: o.kg ?? 0, price_per_kg: o.rate ?? 0, unit_cost: o.cost ?? 0 });
  const k = auditKgLink([
    mk({ sku: "B20001", kg: 6.6, rate: 187, cost: 1234.2 }),                 // ถูกต้อง
    mk({ sku: "B20003", kg: 0, rate: 187, cost: 870 }),                      // ไม่มีน้ำหนัก
    mk({ sku: "B20041", kg: 11.5, rate: 187, cost: 1500 }),                  // ราคาไม่ตรงเรต
    mk({ sku: "B20047", kg: 4.58, rate: 0, cost: 825 }),                     // ยังไม่ตั้งเรต
    mk({ sku: "F7994", kg: 0.83, rate: 187, cost: 150, wb: false }),         // ตั้งราคาต่อเส้นตรง
    mk({ sku: "JR99999", kg: 5, rate: 187, cost: 935 }),                     // ไม่ใช่เส้นที่สูตรใช้ → ต้องไม่โผล่
  ]);
  const st = (s) => k.find((r) => r.sku === s)?.status;
  ok("เอาเฉพาะเส้นที่สูตรคิดราคาเรียกใช้จริง", k.length === 5 && !k.some((r) => r.sku === "JR99999"), String(k.length));
  ok("น้ำหนัก × เรต = ราคาเส้น → ผ่าน", st("B20001") === "ok", String(st("B20001")));
  ok("⚠ ไม่มีน้ำหนัก/เส้น → เตือน (กดเปลี่ยนเรตแล้วราคาไม่ขยับ)", st("B20003") === "no_weight", String(st("B20003")));
  ok("⚠ ราคาเส้นไม่ตรง น้ำหนัก×เรต → เตือนว่าเป็นราคาเรตเก่า", st("B20041") === "stale", String(st("B20041")));
  ok("ยังไม่ตั้งเรตต่อโล → แยกสถานะไว้", st("B20047") === "no_rate", String(st("B20047")));
  ok("ไม่ได้ติดธงคิดต่อโล → บอกว่าตั้งราคาต่อเส้นตรง", st("F7994") === "not_kg", String(st("F7994")));
  ok("เรียงตัวที่ต้องแก้ขึ้นบนสุด", k[0].status === "no_weight", k[0].status);
  ok("บอกราคาที่ 'ควรเป็น' ให้เทียบได้", k.find((r) => r.sku === "B20041")?.expected === 2150.5, "");
}

console.log("\n═══ ⑤e ขึ้นเรตต่อโล ต้องเด้ง 'ครั้งเดียว' ไม่คิดซ้ำสองต่อ ═══");
{
  // สโตร์: B20001 หนัก 6.6 กก. · เรต 187 → 1,234.2 ฿/เส้น · supplier=SMS (= แบรนด์ในตาราง ALU)
  const at = (rate) => [{ name: "เฟรมบน", sku: "B20001", color: "อบขาว", supplier: "SMS",
    is_weight_based: true, weight_per_unit: 6.6, price_per_kg: rate, unit_cost: Math.round(6.6 * rate * 100) / 100 }];
  const pbOf = (rate) => applyPriceOverride(JSON.parse(JSON.stringify(PB)), buildPriceOverride(at(rate), PB));
  const lineOf = (pb) => computeCost(pb, PRODUCTS.sms_slide, { w: 300, h: 220, p: 3, form: "อิสระ" })
    .lines.find((l) => l.name.startsWith("เฟรมบน"));

  const a = lineOf(pbOf(187)), b = lineOf(pbOf(200));   // ขึ้นเรต 187 → 200 = +6.95%
  ok("ราคาเส้นก่อนขึ้นเรต = น้ำหนัก × เรต", Math.abs(a.unitPrice - 1234.2) < 0.02, String(a.unitPrice));
  ok("ขึ้นเรตต่อโลแล้วราคาเส้นขยับจริง", b.unitPrice > a.unitPrice, `${a.unitPrice}→${b.unitPrice}`);
  ok("⚠ ขยับเท่าเรตพอดี ไม่คูณซ้ำ (200/187 = +6.95% ไม่ใช่ +14%)",
    Math.abs(b.unitPrice / a.unitPrice - 200 / 187) < 0.001, String(Math.round((b.unitPrice / a.unitPrice - 1) * 1000) / 10 + "%"));
  ok("ราคาเส้นใหม่ = 6.6 × 200 เป๊ะ", Math.abs(b.unitPrice - 1320) < 0.02, String(b.unitPrice));
  // เส้นที่ยังไม่ผูกสโตร์ ต้องยังขยับตาม mult เหมือนเดิม (ไม่งั้นแก้เรตแล้วเงียบ)
  const un = (pb) => computeCost(pb, PRODUCTS.sms_slide, { w: 300, h: 220, p: 3, form: "อิสระ" })
    .lines.find((l) => l.cat === "alu" && !l.name.startsWith("เฟรมบน"));
  ok("เส้นที่ยังไม่ผูกสโตร์ ยังขยับตามเรตแบรนด์เหมือนเดิม", un(pbOf(200)).unitPrice > un(pbOf(187)).unitPrice, "");
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
  ok("ค่าตั้งต้นของหน้าคือมุม 'รายรุ่น'", c.includes('setView] = useState') && c.includes('>("product")'), "");
  ok("มีมุม 'ราคาต่อโล → ราคาต่อเส้น' ให้กด", c.includes("ราคาต่อโล → ราคาต่อเส้น") && c.includes('view === "kg"'), "");
  ok("ขึ้นป้ายจำนวนเส้นที่ต้องแก้บนปุ่ม (ไม่ต้องเข้าไปดูก่อน)", c.includes("kgBad"), "");
  ok("ตารางต่อโลโชว์ 'ควรเป็น' เทียบ 'ราคาจริง'", c.includes("ควรเป็น ฿/เส้น") && c.includes("ราคาจริง ฿/เส้น"), "");
  ok("มีตารางรายรุ่นจริง", c.includes("รายรุ่น — รุ่นไหนผูกสโตร์ครบ"), "");
  ok("โชว์บรรทัดอลูที่ไม่มีรหัสในตารางรายรุ่น", c.includes("p.aluNoCode.join"), "");
  ok("สลับไปดูรายวัสดุทีละบรรทัดได้", c.includes("ดูรายวัสดุทีละบรรทัด"), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
