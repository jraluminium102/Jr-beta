/**
 * verify-weight-backfill — ตัวตรวจ "เติมน้ำหนักเส้นอลูเข้าสโตร์"
 * รัน: node --experimental-strip-types scripts/verify-weight-backfill.mjs
 *
 * เจ้าของสั่ง 19 ส.ค.69 — เส้นที่ไม่มีน้ำหนักในสโตร์ กดเปลี่ยนเรตต่อโลแล้วราคาไม่ขยับ
 * สิ่งที่ต้องล็อกไว้:
 *   ① น้ำหนักต้องมาจากชีต "น้ำหนักโปรไฟล์" (ชั่งจริง) เท่านั้น
 *   ② ⚠ รหัสที่น้ำหนักยังไม่ชัวร์ ห้ามเติมเด็ดขาด (จะทำให้ราคาเพี้ยนหนักกว่าเดิม)
 *   ③ ของที่ตั้งน้ำหนักไว้แล้ว ห้ามทับเงียบ ๆ — ต้องกดเลือกเอง
 *   ④ API เขียนแค่ weight_per_unit ห้ามแตะราคา (ราคาต้องผ่านหน้าเรตต่อโลที่ลงประวัติ)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchWeights, summarize, usableWeights, WEIGHT_STATUS_LABEL } from "../src/lib/calculator40/weight-backfill.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/calculator40/pricebook.json"), "utf8"));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  " + extra}`); };

console.log("\n═══ ① น้ำหนักที่เอาไปเติม — ต้องมาจากตารางกลาง ไม่ใช่ตัวเลขลอย ═══");
{
  const W = usableWeights();
  ok("มีน้ำหนักให้เติม (ตัดตัวที่ยังไม่ชัวร์ออกแล้ว)",
    Object.keys(W).length === Object.keys(PB.ALUWEIGHT).length - (PB.ALUWEIGHT_SUSPECT ?? []).length,
    `${Object.keys(W).length} จาก ${Object.keys(PB.ALUWEIGHT).length}`);
  ok("ทุกค่า > 0 (ไม่มีน้ำหนักศูนย์หลุดเข้าไป)", Object.values(W).every((v) => v > 0), "");
  ok("B20001 = 6.25 กก. (ชั่งจริง ไม่ใช่ 6.016 ที่เป็นราคา÷187)", W.B20001 === 6.25, String(W.B20001));
  ok("F7935 = 2.424 กก. (ถอดจากราคาลายไม้จริงที่เจ้าของแจ้ง)", W.F7935 === 2.424, String(W.F7935));
}

console.log("\n═══ ② ⚠ รหัสที่น้ำหนักยังไม่ชัวร์ — ห้ามเติม ═══");
{
  const SUS = PB.ALUWEIGHT_SUSPECT ?? [];
  ok("มีรายชื่อรหัสที่ยังไม่ชัวร์เก็บไว้", SUS.length === 4, JSON.stringify(SUS));
  for (const c of ["B20024", "F7855", "F7993", "F7971"]) ok(`${c} อยู่ในรายการห้ามเติม`, SUS.includes(c), "");
  const W = usableWeights();
  ok("ไม่มีตัวไหนหลุดเข้าไปในชุดที่เอาไปเติม", SUS.every((c) => !(c in W)), "");
  // ต่อให้ client ส่ง id ของตัวที่ห้ามเติมมา ก็ต้องไม่มีน้ำหนักให้เขียน
  const rows = matchWeights(SUS.map((sku, i) => ({ id: i + 1, sku, name: sku, weight_per_unit: 0 })));
  ok("โชว์บนหน้าจอได้ แต่สถานะเป็น 'ยังไม่ชัวร์'", rows.length === 4 && rows.every((r) => r.status === "suspect"), "");
  ok("สถานะนี้เลือกไม่ได้ (ไม่ใช่ fill/differ)", !rows.some((r) => ["fill", "differ"].includes(r.status)), "");
}

console.log("\n═══ ③ จัดสถานะถูกไหม (เติม / ต่าง / ตรงแล้ว) ═══");
{
  const rows = matchWeights([
    { id: 1, sku: "B20001", name: "เฟรมบน", color: "อบขาว", weight_per_unit: 0 },        // ยังไม่มี
    { id: 2, sku: "B20001", name: "เฟรมบน", color: "ดำ", weight_per_unit: 6.25 },        // ตรงแล้ว
    { id: 3, sku: "B20003", name: "เฟรมข้าง", color: "อบขาว", weight_per_unit: 9.9 },     // ต่าง
    { id: 4, sku: "JR00576", name: "ล้อ", weight_per_unit: 0 },                           // ไม่ใช่เส้นอลู
    { id: 5, sku: "", name: "ไม่มีรหัส", weight_per_unit: 0 },                            // ไม่มีรหัส
  ]);
  ok("เอาเฉพาะรหัสที่มีน้ำหนักในไฟล์ (ตัวอื่นไม่โผล่)", rows.length === 3, String(rows.length));
  const by = Object.fromEntries(rows.map((r) => [r.id, r.status]));
  ok("ยังไม่มีน้ำหนัก → 'เติมได้'", by[1] === "fill", by[1]);
  ok("ตรงกับไฟล์แล้ว → 'ตรงแล้ว'", by[2] === "same", by[2]);
  ok("มีแล้วแต่ไม่ตรง → 'ไม่ตรงไฟล์'", by[3] === "differ", by[3]);
  ok("เรียงตัวที่ต้องทำขึ้นก่อน", rows[0].status === "fill", rows[0].status);
  ok("บอกน้ำหนักทั้งของเดิมและของไฟล์ให้เทียบได้",
    rows.every((r) => r.fromFile > 0) && rows.find((r) => r.id === 3)?.current === 9.9, "");
  const c = summarize(rows);
  ok("นับสรุปถูก", c.fill === 1 && c.same === 1 && c.differ === 1, JSON.stringify(c));
  ok("ป้ายสถานะครบทุกแบบ", Object.keys(WEIGHT_STATUS_LABEL).length === 4, "");
}

console.log("\n═══ ④ API — เขียนแค่น้ำหนัก ห้ามแตะราคา ═══");
{
  const src = fs.readFileSync(path.join(ROOT, "src/app/api/stock/weights/route.ts"), "utf8");
  ok("ต้องเป็น ADMIN/ACCOUNTING", src.includes('["ADMIN", "ACCOUNTING"]') && src.includes("FORBIDDEN()"), "");
  ok("อัปเดตเฉพาะ weight_per_unit", /update\(\{ weight_per_unit: kg \}\)/.test(src), "");
  // ตัดคอมเมนต์ออกก่อน แล้วค่อยเช็คว่าโค้ดจริงไม่ได้แตะตารางราคา
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  ok("⚠ ห้ามเขียน unit_cost / price_per_kg / stock_prices",
    !code.includes("unit_cost:") && !code.includes("price_per_kg:") && !code.includes("stock_prices"), "");
  ok("ไม่ได้แตะตารางอื่นนอกจาก stock_items",
    [...code.matchAll(/\.from\("([^"]+)"\)/g)].every((m) => m[1] === "stock_items"), "");
  ok("น้ำหนักดึงจากตารางกลาง ไม่รับตัวเลขจาก client", src.includes("usableWeights()") && !/body\?\.(kg|weight)/.test(src), "");
  ok("จำกัดจำนวนต่อครั้ง (กันยิงทั้งสโตร์พลาด)", src.includes("ids.length > 1000"), "");
  ok("บอกต่อว่าต้องไปตั้งเรตต่อโลราคาถึงขยับ", src.includes("ตั้งเรตต่อโล"), "");
}

console.log("\n═══ ⑤ หน้าจอต่อสายครบไหม ═══");
{
  const page = fs.readFileSync(path.join(ROOT, "src/app/(app)/stock/weight-backfill/page.tsx"), "utf8");
  const cli = fs.readFileSync(path.join(ROOT, "src/app/(app)/stock/weight-backfill/WeightBackfillClient.tsx"), "utf8");
  ok("ต้องมีสิทธิ์ราคาถึงเข้าได้", page.includes('["ADMIN", "ACCOUNTING"]'), "");
  ok("ดึงสต็อกแบบแบ่งหน้า (กัน cap 1,000 แถว)", page.includes("fetchAllPaged"), "");
  ok("ค่าตั้งต้นติ๊กเฉพาะ 'ยังไม่มีน้ำหนัก' (ไม่ทับของเดิมเงียบ ๆ)",
    cli.includes('r.status === "fill").map'), "");
  ok("ตัวที่ตรงแล้ว/ยังไม่ชัวร์ ติ๊กไม่ได้", cli.includes('r.status === "fill" || r.status === "differ"'), "");
  ok("โชว์น้ำหนักเดิม vs จากไฟล์", cli.includes("น้ำหนักในสโตร์") && cli.includes("จากไฟล์"), "");
  ok("บอกว่าไม่แตะราคา", cli.includes("ไม่แตะราคา"), "");
  ok("มีทางเข้าจากหน้าสโตร์",
    fs.readFileSync(path.join(ROOT, "src/app/(app)/stock/StockClient.tsx"), "utf8").includes("/stock/weight-backfill"), "");
  ok("มีทางเข้าจากหน้าตรวจผูกสโตร์",
    fs.readFileSync(path.join(ROOT, "src/app/(app)/calculator40/stock-audit/AuditClient.tsx"), "utf8").includes("/stock/weight-backfill"), "");
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
