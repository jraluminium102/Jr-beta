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
import { parseBoxName, normSize, buildBoxPrices } from "../src/lib/calculator40/box-link.ts";
import { auditBoxes, unusedBoxesInStock } from "../src/lib/calculator40/box-audit.ts";
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
  // PC Door แตกกรอบ/คิ้วรายท่อนตามใบตัด 24 ส.ค.69 → 15 บรรทัด
  //   "กรอบบานเลื่อน sms" 2 บรรทัด ตั้งใจไม่มีรหัส — ไฟล์ใบตัดเขียน "—" (โปรไฟล์ sms คนละตัวกับ F7864 · ชีตถอดทุนคิดราคาเดียวกับ F7864 ไปก่อน รอเจ้าของให้รหัส)
  ok("PC Door: อลู 15 บรรทัด", pc?.aluTotal === 15, JSON.stringify(pc));
  ok("PC Door: ไม่มีรหัสแค่ 2 บรรทัด (กรอบเลื่อน sms — ไฟล์ไม่ใส่รหัส)",
    (pc?.aluNoCode?.length ?? 9) === 2 && (pc?.aluNoCode ?? []).every((n) => n.includes("กรอบบานเลื่อน sms")), JSON.stringify(pc?.aluNoCode));
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

console.log("\n═══ ⑤f ผูกแล้วต้องได้ราคาเดียวกับสโตร์จริง ๆ (เจ้าของเจอ 19 ส.ค.69) ═══");
{
  // สโตร์ของจริง: ชื่อไม่มีคำว่าสี · สีอยู่ในช่อง color (รหัสเดียวกันทุกสี)
  //   บั๊กเดิม: buildPriceOverride หาแถวอบขาวจาก "ชื่อ" อย่างเดียว → หาไม่เจอ ตกไปใช้ราคาต่ำสุด
   //  แต่หน้าตรวจอ่านช่องสีด้วย → คนละแถวกัน = ขึ้น "ผูกแล้ว แต่ราคาไม่ตรง" ทั้งที่ผูกอยู่
  const mk = (color, cost) => ({ name: "เฟรมบนบานเลื่อน", sku: "B20001", color, unit_cost: cost });
  const stock = [mk("อบขาว", 1200), mk("ดำ", 950), mk("เทาซาฮาร่า", 1300), mk("ลายไม้สักทอง", 1900)];
  const ov = buildPriceOverride(stock, PB);
  ok("ราคาตัวตั้ง = แถวอบขาว (ไม่ใช่แถวที่ถูกที่สุด)", ov.ALUCODE.B20001 === 1200, String(ov.ALUCODE.B20001));
  const pb2 = applyPriceOverride(JSON.parse(JSON.stringify(PB)), ov);
  const row = auditStockLink(stock, pb2).find((r) => r.section === "อลูรายเส้น" && r.key === "B20001");
  ok("หน้าตรวจต้องขึ้น 'ผูกแล้ว' ไม่ใช่ 'ราคาไม่ตรง'", row?.status === "linked", `${row?.status}`);
  ok("ราคาในสูตร = ราคาในสโตร์ เป๊ะ", row?.formulaPrice === row?.stockPrice, `${row?.formulaPrice} vs ${row?.stockPrice}`);

  // อ่านสีจากท้ายชื่อได้ด้วย (แถวเก่าที่ยังไม่มีช่องสี)
  const byName = buildPriceOverride([
    { name: "เฟรมบนบานเลื่อน-อบขาว", sku: "B20001", unit_cost: 1200 },
    { name: "เฟรมบนบานเลื่อน-ดำ", sku: "B20001", unit_cost: 950 },
  ], PB);
  ok("แถวเก่าที่สีอยู่ท้ายชื่อ ก็ยังหาแถวอบขาวเจอ", byName.ALUCODE.B20001 === 1200, String(byName.ALUCODE.B20001));

  // ไม่มีแถวอบขาวเลย → ยังต้องถอยไปใช้ราคาต่ำสุดเหมือนเดิม (กันบวกค่าอบซ้ำ)
  const noWhite = buildPriceOverride([mk("ดำ", 950), mk("เทาซาฮาร่า", 1300)], PB);
  ok("ไม่มีแถวอบขาว → ใช้ราคาต่ำสุดเหมือนเดิม", noWhite.ALUCODE.B20001 === 950, String(noWhite.ALUCODE.B20001));

  // ทุกรหัสในสโตร์จำลอง ต้องไม่มีตัวไหนขึ้น "ราคาไม่ตรง"
  const many = ["B20001", "B20003", "B20041", "B20051", "B20054"].flatMap((c) => [
    { name: "เส้น " + c, sku: c, color: "อบขาว", unit_cost: PB.ALUCODE[c] },
    { name: "เส้น " + c, sku: c, color: "ดำ", unit_cost: PB.ALUCODE[c] - 50 },
  ]);
  const pb3 = applyPriceOverride(JSON.parse(JSON.stringify(PB)), buildPriceOverride(many, PB));
  const bad = auditStockLink(many, pb3).filter((r) => r.section === "อลูรายเส้น" && r.status === "price_diff");
  ok("ตั้งราคาตรงสูตร → ไม่มีรหัสไหนขึ้น 'ราคาไม่ตรง'", bad.length === 0, bad.map((r) => r.key).join(","));
}

console.log("\n═══ ⑤g อุปกรณ์ผูกรหัสสโตร์ได้ + แยกตามสี (Velora · 19 ส.ค.69) ═══");
{
  const px = { JR02885: 800, JR02886: 750, JR00561: 130, JR00560: 150, JR00355: 520, JR00356: 610 };
  const pb2 = applyPriceOverride(JSON.parse(JSON.stringify(PB)),
    buildPriceOverride(Object.entries(px).map(([sku, c]) => ({ name: sku, sku, unit_cost: c })), PB));
  const run = (hwcolor) => computeCost(pb2, PRODUCTS.velora,
    { w: 220, h: 200, p: 1, form: "เดี่ยว", color: "sahara", colorKey: "sahara", spec: { hwcolor } });
  const w = run("ขาว"), b = run("ดำ");
  const line = (r, nm) => r.lines.find((l) => l.name.startsWith(nm));
  ok("อลู Velora ผูกรหัสแล้ว ราคามาจากสโตร์", line(w, "วงกบบน").unitPrice === 800 && line(w, "กรอบบาน แนวนอน").unitPrice === 750, "");
  ok("บานพับ สีขาว → JR00561 ราคา 130", line(w, "บานพับ").sku === "JR00561" && line(w, "บานพับ").unitPrice === 130, line(w, "บานพับ").sku);
  ok("บานพับ สีดำ → JR00560 ราคา 150", line(b, "บานพับ").sku === "JR00560" && line(b, "บานพับ").unitPrice === 150, line(b, "บานพับ").sku);
  ok("มือจับ สีขาว → JR00355 ราคา 520", line(w, "มือจับ").sku === "JR00355" && line(w, "มือจับ").unitPrice === 520, line(w, "มือจับ").sku);
  ok("มือจับ สีดำ → JR00356 ราคา 610", line(b, "มือจับ").sku === "JR00356" && line(b, "มือจับ").unitPrice === 610, line(b, "มือจับ").sku);
  ok("เลือกสีอุปกรณ์แล้วทุนต่างกันจริง", b.cost.total > w.cost.total, `${w.cost.total} vs ${b.cost.total}`);
  // ⚠ มือจับเคยเขียนเป็น "จำนวน 450 × ราคา 1" — ผูกรหัสแล้วจะคูณผิดมหาศาล ต้องเป็น จำนวนบาน × 450
  ok("มือจับนับเป็นชุด ไม่ใช่ 450 ชุด", line(w, "มือจับ").qty === 1, String(line(w, "มือจับ").qty));
  const two = computeCost(pb2, PRODUCTS.velora,
    { w: 220, h: 200, p: 2, form: "คู่", color: "sahara", colorKey: "sahara", spec: { hwcolor: "ขาว" } });
  ok("บานคู่ → มือจับ 2 ชุด (ชีตบอก คู่=900)", two.lines.find((l) => l.name.startsWith("มือจับ")).qty === 2, "");
  // ไม่มีราคาในสโตร์ → ต้องกลับไปใช้ราคาในสูตร ไม่ใช่ 0
  const noStock = computeCost(PB, PRODUCTS.velora,
    { w: 220, h: 200, p: 1, form: "เดี่ยว", color: "sahara", colorKey: "sahara", spec: { hwcolor: "ขาว" } });
  ok("สโตร์ไม่มีราคา → ใช้ราคาในสูตร (ไม่หล่นเป็น 0)",
    noStock.lines.find((l) => l.name.startsWith("มือจับ")).unitPrice === 450, "");
}

console.log("\n═══ ⑤h กล่อง/ฉาก ผูกด้วยชื่อ+ขนาด+สี (เจ้าของ 19 ส.ค.69) ═══");
{
  // สโตร์ตั้งชื่อลงตัว เช่น `กล่อง 4"x6"-Aztec gray` — ต้องอ่านออกทุกแบบที่เขียนต่างกัน
  const P = (n) => parseBoxName(n);
  ok("อ่าน `กล่อง 4\"x6\"-Aztec gray`", P('กล่อง 4"x6"-Aztec gray')?.size === "4X6" && P('กล่อง 4"x6"-Aztec gray')?.color === "Aztec gray", JSON.stringify(P('กล่อง 4"x6"-Aztec gray')));
  ok("อ่าน `ฉาก 6 หุน-ดำ` (ขนาดแบบหุน)", P("ฉาก 6 หุน-ดำ")?.size === "6หุน" && P("ฉาก 6 หุน-ดำ")?.kind === "ฉาก", JSON.stringify(P("ฉาก 6 หุน-ดำ")));
  ok("เขียนขนาดคนละแบบ ต้องได้คีย์เดียวกัน",
    normSize('1.6"x3"') === normSize("1.6×3") && normSize("1.6×3") === normSize("1.6 X 3"), normSize('1.6"x3"'));
  ok("½ แปลงเป็น .5", normSize("1×1½") === "1X1.5", normSize("1×1½"));
  // ⚠ เศษส่วนต้องแปลงก่อน ไม่งั้น 1/2"x1" อ่านเป็น "2X1" = คนละของกันเลย (เจอตอนเทียบชื่อจริง)
  ok('เศษส่วน 1/2"x1" → 0.5X1 (ไม่ใช่ 2X1)', normSize('กล่อง 1/2"x1"') === "0.5X1", normSize('กล่อง 1/2"x1"'));
  // สโตร์ตั้งชื่อฉากด้วยขนาดเดียว (`ฉาก 1"-อบขาว`) — สูตรเขียน 1"x1" ต้องชี้คีย์เดียวกัน
  ok('สโตร์ `ฉาก 1"-อบขาว` → คีย์ ฉาก|1', P('ฉาก 1"-อบขาว')?.size === "1", JSON.stringify(P('ฉาก 1"-อบขาว')));
  ok("สูตรฉาก 1 นิ้ว ใช้คีย์ ฉาก|1 (ตรงกับชื่อในสโตร์)",
    Object.values(PRODUCTS).some((p) => [...(p.hardware ?? []), ...(p.consum ?? []), ...(p.alu ?? [])].some((it) => it.box === "ฉาก|1")), "");
  ok("ชื่อที่ไม่ใช่กล่อง/ฉาก → ไม่จับ", P("เฟรมบนบานเลื่อน-อบขาว") === null, "");
  ok("กล่องไม่มีขนาด → ไม่จับ (กันจับมั่ว)", P("กล่องเฟรม-อบขาว") === null, "");

  const stock = [
    { name: 'กล่อง 1.6"x3"-อบขาว', color: "อบขาว", unit_cost: 1300 },
    { name: 'กล่อง 1.6"x3"-ดำ', color: "ดำ", unit_cost: 1350 },
    { name: 'กล่อง 1.6"x3"-เทาซาฮาร่า', color: "เทาซาฮาร่า", unit_cost: 1480 },
    { name: 'กล่อง 9"x9"-อบขาว', color: "อบขาว", unit_cost: 5000 },   // สูตรไม่ได้ใช้ขนาดนี้
    { name: 'กล่อง 1.6"x3"-ยังไม่ตั้งราคา', color: "มิว", unit_cost: 0 },
  ];
  const BOX = buildBoxPrices(stock);
  ok("เก็บราคาแยกสีได้ครบ", Object.keys(BOX["กล่อง|1.6X3"] ?? {}).length === 3, JSON.stringify(BOX["กล่อง|1.6X3"]));
  ok("ราคา 0 = ยังไม่ตั้ง ไม่เก็บ", !(BOX["กล่อง|1.6X3"]?.["มิว"] > 0), "");

  const pb2 = applyPriceOverride(JSON.parse(JSON.stringify(PB)), buildPriceOverride(stock, PB));
  const run = (stockColor) => computeCost(pb2, PRODUCTS.fixed,
    { w: 150, h: 200, p: 1, form: "กระจกล้วน", color: "white", colorKey: "white", stockColor });
  // ชื่อบรรทัดเปลี่ยนเป็น "กล่อง 1.6×3 — ตั้ง/นอน" (แยกท่อนตามใบตัด 21 ส.ค.69)
  const px = (r) => r.lines.find((l) => String(l.name).includes("กล่อง 1.6×3"))?.unitPrice;
  ok("สีขาว → ใช้ราคากล่องสีขาวจากสโตร์", px(run("อบขาว")) === 1300, String(px(run("อบขาว"))));
  ok("สีดำ → ใช้ราคากล่องสีดำ", px(run("ดำ")) === 1350, String(px(run("ดำ"))));
  ok("เทาซาฮาร่า → ใช้ราคากล่องสีเทา", px(run("เทาซาฮาร่า")) === 1480, String(px(run("เทาซาฮาร่า"))));
  ok("สีที่สโตร์ยังไม่มี → ถอยไปสีมิว/อบขาว ไม่ใช่ 0", px(run("ไวท์โอ็ค")) === 1300, String(px(run("ไวท์โอ็ค"))));
  ok("เปลี่ยนสีแล้วทุนต่างกันจริง", run("เทาซาฮาร่า").cost.total > run("อบขาว").cost.total, "");
  // สโตร์ไม่มีเลย → ต้องใช้ราคาในสูตร ไม่ใช่ 0
  const noStock = computeCost(PB, PRODUCTS.fixed,
    { w: 150, h: 200, p: 1, form: "กระจกล้วน", color: "white", colorKey: "white", stockColor: "อบขาว" });
  ok("สโตร์ไม่มีกล่อง → ใช้ราคาในสูตร (ไม่หล่นเป็น 0)",
    noStock.lines.find((l) => String(l.name).includes("กล่อง 1.6×3"))?.unitPrice === 1240, "");

  const rows = auditBoxes(BOX);
  ok("รายงานกล่อง/ฉากทุกขนาดที่สูตรใช้", rows.length >= 8, String(rows.length));
  const b163 = rows.find((r) => r.key === "กล่อง|1.6X3");
  ok("บอกว่าเจอสีไหนบ้าง", b163?.colors.length === 3, JSON.stringify(b163?.colors));
  ok("มีไม่ครบ 4 สีหลัก → สถานะ 'มีบางสี'", b163?.status === "มีบางสี", b163?.status);
  ok("ขนาดที่ไม่เจอในสโตร์ → 'ไม่เจอในสโตร์'", rows.some((r) => r.status === "ไม่เจอในสโตร์"), "");
  ok("เรียงตัวที่ต้องแก้ขึ้นก่อน", rows[0].status !== "ครบ", rows[0].status);
  ok("บอกว่าใช้ในรุ่นไหน", (b163?.usedBy?.length ?? 0) > 0, "");
  const extra = unusedBoxesInStock(stock, new Set(rows.map((r) => r.key)));
  ok("บอกด้วยว่าสโตร์มีขนาดที่สูตรไม่ได้ใช้ (เผื่อพิมพ์ขนาดผิด)",
    extra.some((e) => e.key === "กล่อง|9X9"), JSON.stringify(extra));
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
  ok("ป้ายสถานะครบทุกแบบ (+labor 27 ส.ค.69)", Object.keys(STATUS_LABEL).length === 8, String(Object.keys(STATUS_LABEL).length));
  ok("ค่าตั้งต้นของหน้าคือมุม 'รายรุ่น'", c.includes('setView] = useState') && c.includes('>("product")'), "");
  ok("มีมุม 'ราคาต่อโล → ราคาต่อเส้น' ให้กด", c.includes("ราคาต่อโล → ราคาต่อเส้น") && c.includes('view === "kg"'), "");
  ok("ขึ้นป้ายจำนวนเส้นที่ต้องแก้บนปุ่ม (ไม่ต้องเข้าไปดูก่อน)", c.includes("kgBad"), "");
  ok("ตารางต่อโลโชว์ 'ควรเป็น' เทียบ 'ราคาจริง'", c.includes("ควรเป็น ฿/เส้น") && c.includes("ราคาจริง ฿/เส้น"), "");
  ok("มีตารางรายรุ่นจริง", c.includes("รายรุ่น — รุ่นไหนผูกสโตร์ครบ"), "");
  ok("โชว์บรรทัดอลูที่ไม่มีรหัสในตารางรายรุ่น", c.includes("p.aluNoCode.join"), "");
  ok("สลับไปดูรายวัสดุทีละบรรทัดได้", c.includes("ดูรายวัสดุทีละบรรทัด"), "");
}

// ── อุปกรณ์ที่ "มีรหัสสโตร์" ต้องนับว่าผูกแล้ว ไม่ว่าจะติดธง partsLinked หรือไม่ ──
//    เจ้าของท้วง 27 ส.ค.69 "หน้าตรวจแทบไม่มีอะไรผูกเลย" — สาเหตุคือหน้าตรวจเช็คอุปกรณ์ด้วย "ชื่อ"
//    อย่างเดียว บรรทัดที่ใส่ sku ไว้แล้วเลยถูกตีเป็น "ผูกไม่ได้" ทั้งที่เอนจินคิดราคาอ่าน SKUPRICE อยู่จริง
console.log("\n═══ ⑧ อุปกรณ์ที่มีรหัสสโตร์ ต้องนับว่าผูก (ไม่ต้องรอธง partsLinked) ═══");
{
  const rows = auditStockLink([], PB).filter((r) => r.section === "อุปกรณ์/สิ้นเปลือง");
  const checkable = rows.filter((r) => r.status !== "no_key" && r.status !== "order_only" && r.status !== "labor").length;
  ok(`อุปกรณ์ที่มีรหัส/ref/box ให้ตรวจ ≥ 200 บรรทัด (เดิมนับได้แค่ 70)`, checkable >= 200, String(checkable));
  // ref (ตารางราคากลาง) + box (กล่อง/ฉากในสโตร์) ก็คือผูกแล้ว — แอดมินแก้ราคาที่ต้นทางได้
  const viaRef = rows.filter((r) => /ผูกผ่านตารางราคากลาง/.test(r.note)).length;
  const viaBox = rows.filter((r) => /|/.test(r.key)).length;
  ok("นับบรรทัดที่ผูกตารางราคากลาง (ref) ด้วย", viaRef >= 50, String(viaRef));
  ok("นับบรรทัดที่ผูกราคากล่อง/ฉาก (box) ด้วย", viaBox >= 15, String(viaBox));

  // รุ่นที่ไม่ติดธง แต่ใส่ sku ไว้แล้ว ต้องไม่ถูกตีเป็น no_key
  const smsRows = rows.filter((r) => r.usedBy === PRODUCTS.sms_slide.name);
  const withSku = (PRODUCTS.sms_slide.hardware ?? []).filter((h) => h.sku).length;
  ok("บานเลื่อน SMS: บรรทัดที่มี sku ไม่ถูกตีว่าผูกไม่ได้",
    withSku === 0 || smsRows.filter((r) => r.status !== "no_key").length >= withSku,
    `${smsRows.filter((r) => r.status !== "no_key").length} จาก ${withSku}`);

  // sku ที่เป็นสูตร (เลือกรหัสตามเงื่อนไข) ต้องแตกออกมาตรวจทุกตัว ไม่ใช่ทิ้ง
  const cond = (PRODUCTS.open_door.consum ?? []).find((c) => String(c.sku ?? "").includes("?"));
  if (cond) {
    const both = rows.filter((r) => r.usedBy === PRODUCTS.open_door.name && /JR00770|JR00771/.test(r.key));
    ok("sku ที่เป็นสูตร แตกออกมาตรวจครบทุกรหัส", both.length >= 2, String(both.length));
  }
}

// ── ค่าแรง/ค่าบริการ ต้องไม่ไปกองรวมกับ "ผูกไม่ได้" ────────────────────────────
//    ค่าแรงผลิต/ติดตั้ง · ค่ากรีดราง · ค่าเปิดตู้อบ · ค่าดัดโค้ง ไม่ใช่ของที่มีในสโตร์
//    เดิมนับเป็น no_key ทำให้หน้าตรวจดูแย่เกินจริง และกลบของที่ขาดจริง (เจ้าของท้วง 27 ส.ค.69)
console.log("");
console.log("═══ ⑨ ค่าแรง/ค่าบริการ แยกออกจากกอง 'ผูกไม่ได้' ═══");
{
  const rows = auditStockLink([], PB).filter((r) => r.section === "อุปกรณ์/สิ้นเปลือง");
  const lab = rows.filter((r) => r.status === "labor");
  ok("จับค่าแรง/ค่าบริการได้ ≥ 15 บรรทัด", lab.length >= 15, String(lab.length));
  ok("บรรทัดค่าแรงไม่ถูกนับเป็น no_key อีก", !rows.some((r) => r.status === "no_key" && /^(ค่าแรง|ค่ากรีด|ค่าดัด|สีพิเศษ|ปัดขึ้น)/.test(r.item)), "");
  ok("ป้ายค่าแรงบอกชัดว่าไม่ต้องผูก", lab.every((r) => /ไม่ใช่ของในสโตร์/.test(r.note)), "");
  // กันเผลอติดธง labor ให้ "ของจริง" — ชื่อทุกบรรทัดต้องขึ้นต้นด้วยค่าแรง/ค่าบริการเท่านั้น
  ok("ไม่เหมาวัสดุจริงเป็นค่าแรง", lab.every((r) => /^(ค่าแรง|ค่ากรีด|ค่าดัด|สีพิเศษ|ปัดขึ้น)/.test(r.item)), lab.map((r) => r.item).join(" · "));
  const rs = rows.filter((r) => r.usedBy === PRODUCTS.roof_slide.name);
  const beams = rs.filter((r) => /^(จันทัน|แป กล่อง)/.test(r.item));
  ok("หลังคาเลื่อน จันทัน/แป ผูกรหัสกล่องครบ", beams.length >= 6 && beams.every((r) => r.key.includes("|")), String(beams.length));
  // ค่าแรงที่ "มีรหัสในสโตร์" (ค่ากรีดราง JR00202) ต้องขึ้นว่าผูกแล้ว ไม่ใช่ถูกป้ายค่าแรงกลบ
  // สโตร์ขายเป็นแพ็ค (per) — ต้องหารก่อนเทียบ ไม่งั้นขึ้น "ราคาไม่ตรง" ทั้งที่ตรง แล้วกลบตัวที่ต่างจริง
  //   เคสจริง: มือจับ Align SMS ของ PC Door สูตร 198 (2 ตัว) สโตร์ JR00378 = 99/ตัว per=0.5
  {
    const one = auditStockLink([{ name: "x", sku: "JR00378", color: "อบขาว", unit_cost: 99 }], PB)
      .filter((r) => r.key === "JR00378" && r.formulaPrice === 198);
    ok("หารราคาแพ็คก่อนเทียบ (per)", one.length > 0 && one.every((r) => r.status !== "price_diff"),
      one.map((r) => r.status + "/" + r.stockPrice).join(" "));
  }
  // box เป็นสูตร (ระแนง เลือกกล่องได้) → หน้าตรวจต้องกางเป็นทุกขนาด ไม่ใช่โชว์สูตรดิบ
  {
    const rn = rows.filter((r) => r.usedBy === PRODUCTS.louver.name && /ใบระแนง/.test(r.item));
    ok("ระแนง: กางกล่องทุกขนาดที่เลือกได้", rn.length >= 7, String(rn.length));
    ok("ระแนง: คีย์กล่องไม่ใช่สูตรดิบ", rn.every((r) => !/spec.|[?+()]/.test(r.key)), rn.map((r) => r.key).join(" "));
    ok("ระแนง: คีย์อยู่ในรูป ชนิด|ขนาด", rn.every((r) => /^กล่อง|[0-9.X]+$/.test(r.key)), rn.map((r) => r.key).join(" "));
  }
  const grind = rows.find((r) => r.item === "ค่ากรีดราง");
  ok("ค่าแรงที่มีรหัสสโตร์ ต้องนับว่าผูก", !!grind && grind.status !== "labor" && grind.key === "JR00202", grind ? grind.status + "/" + grind.key : "ไม่เจอ");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
