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
  // ธงยังไม่ชัวร์ที่ "ยังไม่ถูกยืนยัน" เท่านั้นที่ถูกตัดออก (ยืนยันแล้วจากตารางล่าง/แคตตาล็อก = เติมได้)
  const stillSus = (PB.ALUWEIGHT_SUSPECT ?? []).filter((c) => !(PB.ALUWEIGHT_CONFIRMED ?? []).includes(c));
  ok("มีน้ำหนักให้เติม (ตัดตัวที่ยังไม่ชัวร์และยังไม่ถูกยืนยันออกแล้ว)",
    Object.keys(W).length === Object.keys(PB.ALUWEIGHT).length - stillSus.length,
    `${Object.keys(W).length} จาก ${Object.keys(PB.ALUWEIGHT).length} · ยังไม่ชัวร์จริง ${stillSus.length}`);
  ok("ทุกค่า > 0 (ไม่มีน้ำหนักศูนย์หลุดเข้าไป)", Object.values(W).every((v) => v > 0), "");
  // น้ำหนักยึดตารางล่างของชีต "น้ำหนักโปรไฟล์" (แถว 291 คิ้ว F7935 = 1.824 · แถว 324 เฟรมบนบานเลื่อน [B20001-15] = 7.104)
  ok("B20001 = 7.104 กก. ตามตารางล่างของชีตน้ำหนักโปรไฟล์ (ไม่ใช่ราคา÷187)", W.B20001 === 7.104, String(W.B20001));
  ok("F7935 = 1.824 กก. ตามชีตน้ำหนักโปรไฟล์", W.F7935 === 1.824, String(W.F7935));
}

console.log("\n═══ ② ⚠ รหัสที่น้ำหนักยังไม่ชัวร์ — ห้ามเติม ═══");
{
  // 9 ต.ค.69: ธง ALUWEIGHT_SUSPECT มาจากกฎเก่า "น้ำหนัก ≈ ราคาขาว ÷ 187" ซึ่งเลิกใช้แล้ว
  //   ตอนนี้ปลดธงให้รหัสที่ไฟล์ยืนยัน (อยู่ตารางล่าง / มีราคากำกับ / แคตตาล็อกผู้ผลิตตรงกัน)
  //   → เทสต้องตรวจ "กลไกกัน" ไม่ใช่ผูกกับรายชื่อรหัส เพราะรายชื่อเปลี่ยนได้เมื่อยืนยันเพิ่ม
  const SUS = PB.ALUWEIGHT_SUSPECT ?? [];
  const CONF = PB.ALUWEIGHT_CONFIRMED ?? [];
  const stillSus = SUS.filter((c) => !CONF.includes(c));
  ok("ยังเก็บรายชื่อรหัสที่เคยน่าสงสัยไว้ (ไม่ได้ลบทิ้ง)", SUS.length > 0, JSON.stringify(SUS));
  ok("มีรายชื่อรหัสที่ไฟล์ยืนยันน้ำหนักแล้ว", CONF.length > 50, String(CONF.length));
  const W = usableWeights();
  ok("รหัสที่ยังไม่ถูกยืนยัน ต้องไม่หลุดเข้าชุดที่เอาไปเติม", stillSus.every((c) => !(c in W)), JSON.stringify(stillSus));
  ok("รหัสที่ไฟล์ยืนยันแล้ว ต้องเติมได้ (ไม่ติดธงค้าง)",
    SUS.filter((c) => CONF.includes(c)).every((c) => W[c] > 0), "");
  // ตัวที่ยังไม่ถูกยืนยัน (ถ้ามี) ต้องโชว์บนหน้าจอได้ แต่ติ๊กไม่ได้
  if (stillSus.length) {
    const rows = matchWeights(stillSus.map((sku, k) => ({ id: k + 1, sku, name: sku, weight_per_unit: 0 })));
    ok("โชว์บนหน้าจอได้ แต่สถานะเป็น 'ยังไม่ชัวร์'", rows.length === stillSus.length && rows.every((r) => r.status === "suspect"), "");
    ok("สถานะนี้เลือกไม่ได้ (ไม่ใช่ fill/differ)", !rows.some((r) => ["fill", "differ"].includes(r.status)), "");
  } else {
    ok("ตอนนี้ไม่มีรหัสค้างธง — ทุกตัวไฟล์ยืนยันแล้ว", true, "");
  }
}
console.log("\n═══ ③ จัดสถานะถูกไหม (เติม / ต่าง / ตรงแล้ว) ═══");
{
  const rows = matchWeights([
    { id: 1, sku: "B20001", name: "เฟรมบน", color: "อบขาว", weight_per_unit: 0 },        // ยังไม่มี
    { id: 2, sku: "B20001", name: "เฟรมบน", color: "ดำ", weight_per_unit: 7.104 },       // ตรงแล้ว (ตารางล่างของไฟล์)
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
  // 21 ก.ย.69: API นี้ "คิดราคา/หน่วยใหม่" ให้เส้นที่ตั้งเรตต่อโลไว้แล้วด้วย (เรต × น้ำหนักที่เพิ่งเติม)
  //   ไม่ใช่การขึ้นราคา — เป็นการคิดสูตรเดิมให้จบ · กติกาที่ยังต้องล็อกไว้:
  //   (ก) ตาราง stock_items เขียนได้แค่ weight_per_unit  (ข) ราคาใหม่ต้องลงประวัติที่ stock_prices เท่านั้น
  //   (ค) แตะได้แค่ 2 ตารางนี้  (ง) ราคาใหม่ = เรตต่อโล × น้ำหนัก และทำเฉพาะตัวที่มีเรตอยู่แล้ว
  ok("stock_items เขียนแค่ weight_per_unit (ไม่ยัดราคาเข้าไปด้วย)",
    !/stock_items"\)\s*\.update\(\{[^}]*(unit_cost|price_per_kg)/.test(code), "");
  ok("ราคาใหม่ลงประวัติ stock_prices (ไม่ใช่ทับ unit_cost เงียบ ๆ)",
    /from\("stock_prices"\)\s*\.insert\(/.test(code) && !/stock_items"\)\s*\.update\(\{[^}]*unit_cost/.test(code), "");
  ok("คิดราคาใหม่เฉพาะตัวที่ตั้งเรตต่อโลไว้แล้ว (เรต × น้ำหนัก)",
    code.includes("is_weight_based") && /rate \* t\.kg/.test(code), "");
  ok("ไม่ได้แตะตารางอื่นนอกจาก stock_items + stock_prices",
    [...code.matchAll(/\.from\("([^"]+)"\)/g)].every((m) => m[1] === "stock_items" || m[1] === "stock_prices"), "");
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
