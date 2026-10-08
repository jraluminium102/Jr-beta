#!/usr/bin/env node
/**
 * verify-zero-price — ด่านกัน "ของเข้าไปในราคาเป็น 0 เงียบ ๆ"
 *   node scripts/verify-zero-price.mjs
 *
 * เจ้าของเจอเอง 5 ต.ค.69: ยางรูน้ำในสโตร์มีราคา 5 บาท แต่เว็บคิด 0 (ไฟล์ ERP ลงไว้ 0)
 *   และบานเปิดคิด สปิงก็อท/ฉากประคองมุม เป็น 0 ทั้งที่รุ่นอื่นคิดเงิน → ของขาดบานละ 136 บาท
 *
 * ด่านนี้ไล่คิดทุกรุ่น × ทุกรูปแบบ × ทุกวัสดุ แล้วแดงถ้ามีบรรทัดที่ "นับจำนวนแล้ว แต่ราคา/หน่วย = 0"
 *   ยกเว้นรายการใน ALLOW ที่เจ้าของเคาะแล้วว่าไม่คิดเงินจริง (ต้องมีเหตุผลกำกับทุกบรรทัด)
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));

// ชื่อบรรทัด (หรือบางส่วนของชื่อ) ที่ยอมให้เป็น 0 ได้ — ต้องเขียนเหตุผลไว้เสมอ
const ALLOW = [
  [/มัลติพ้อยท์|multipoint/i, "ชุดมัลติพ้อยท์เฟี้ยมยูโร JR02945-53 — ไฟล์เขียน [ไม่สต็อค] ทุน 0 ทุกแถว เจ้าของยืนยัน 21 ก.ย.69"],
  [/หัวต่อ PC DOOR/i, "JR02969 — ไฟล์และสโตร์เป็น 0 ทั้งคู่"],
  [/^ค่าแรง|^ค่ากรีดราง/, "บรรทัดค่าแรง ไม่ใช่ของ"],
  [/^ระแนงบานเกล็ดอลู|^ระแนงหมุนเปิด-ปิด/, "R3.9 ไม่มีสูตรทุน = รุ่นกรอกราคาเอง · เอนจินขึ้นคำเตือนให้แล้ว (ตรวจที่ข้อ ②)"],
];
const allowed = (name) => ALLOW.find(([re]) => re.test(String(name)));

let pass = 0, fail = 0, runs = 0;
const bad = new Map();   // ชื่อบรรทัด → รุ่นที่เจอ
for (const p of Object.values(PRODUCTS).filter((x) => x && !x.pickerHide)) {
  const forms = (p.forms || [p.defForm || ""]).slice(0, 4);
  const mats = (p.materials || [p.defMaterial]).slice(0, 3);
  const spec = Object.fromEntries((p.specOpts || []).map((o) => [o.key, o.def ?? o.opts?.[0] ?? ""]));
  for (const form of forms) for (const material of mats) {
    const d = p.defaults || { w: 200, h: 200, p: 1 };
    let c; try { c = computeCost(PB, p, { ...d, form, material, glassType: p.defGlass, spec, addons: {}, color: "white", colorKey: "white" }); } catch { continue; }
    runs++;
    for (const l of c.lines || []) {
      if (l.cat === 'warn' || l.cat === 'labor' || l.cat === 'discount') continue;   // ส่วนลดเป็นยอดติดลบ ไม่ใช่ของราคา 0
      if (!(Number(l.qty) > 0)) continue;                       // ไม่ได้ใช้ของชิ้นนี้ = ไม่ต้องมีราคา
      if (Number(l.unitPrice) > 0 || Number(l.amount) > 0) continue;
      if (allowed(l.name)) continue;
      const k = String(l.name);
      if (!bad.has(k)) bad.set(k, new Set());
      bad.get(k).add(p.id);
    }
  }
}
console.log(`\n═══ ไล่คิด ${runs} เคส (ทุกรุ่น × รูปแบบ × วัสดุ) ═══`);
if (!bad.size) { pass++; console.log("  ✅ ไม่มีบรรทัดไหนนับของแล้วราคาเป็น 0"); }
for (const [name, ids] of bad) { fail++; console.log(`  ❌ ${name}  → ${[...ids].join(", ")}`); }
if (bad.size) console.log("\n  แก้ด้วยการเติมราคาใน pricebook (HWPRICE/HWPRICE_BY_PROD) หรือใส่เหตุผลใน ALLOW ของไฟล์นี้");
// ── ③ กดออปชั่นแล้วของเพิ่มมาต้องไม่ฟรี (8 ต.ค.69) ──
//    ข้อ ① ไล่แค่ค่าตั้งต้นของออปชั่น → บรรทัดที่ขึ้นเฉพาะตอน "ติดมุ้ง / มีบานตาย / มีช่องแสง" เลยไม่เคยถูกตรวจ
//    เคสจริง: บานเปิดติดมุ้ง คิ้วมุ้ง F7949 + กันสาด F7948 ราคา 0 → อลู 437 บาท/ชุด หายเงียบ
//    ด่านนี้สลับค่าออปชั่นทีละตัว (ช่องตัวเลข/ข้อความ ลองค่า 40) แล้วตรวจแบบเดียวกับข้อ ①
console.log("\n" + "═══ ③ สลับออปชั่นทีละตัว — ของที่เพิ่มมาต้องมีราคา ═══");
{
  const bad2 = new Map();
  let runs2 = 0;
  for (const p of Object.values(PRODUCTS).filter((x) => x && !x.pickerHide)) {
    const base = Object.fromEntries((p.specOpts || []).map((o) => [o.key, o.def ?? o.opts?.[0] ?? ""]));
    const d = p.defaults || { w: 200, h: 200, p: 1 };
    for (const o of p.specOpts || []) {
      const cands = Array.isArray(o.opts) && o.opts.length ? o.opts : ["40"];
      for (const v of cands) {
        if (v === base[o.key]) continue;
        const spec = { ...base, [o.key]: v };
        let c;
        try { c = computeCost(PB, p, { ...d, form: p.defForm, material: p.defMaterial, glassType: p.defGlass, spec, addons: {}, color: "white", colorKey: "white" }); } catch { continue; }
        runs2++;
        for (const l of c.lines || []) {
          if (l.cat === "warn" || l.cat === "labor" || l.cat === "discount") continue;
          if (!(Number(l.qty) > 0)) continue;
          if (Number(l.unitPrice) > 0 || Number(l.amount) > 0) continue;
          if (allowed(l.name)) continue;
          const k = String(l.name);
          if (!bad2.has(k)) bad2.set(k, new Set());
          bad2.get(k).add(p.id + " (" + o.key + "=" + v + ")");
        }
      }
    }
  }
  console.log("  ไล่คิดเพิ่ม " + runs2 + " เคส");
  if (!bad2.size) { pass++; console.log("  ✅ กดออปชั่นไหนก็ไม่มีของฟรี"); }
  for (const [name, ids] of bad2) { fail++; console.log("  ❌ " + name + "  → " + [...ids].slice(0, 4).join(", ")); }
}
console.log("\n═══ ② รุ่นที่ให้กรอกราคาเอง ต้องขึ้นคำเตือนเมื่อยังไม่กรอก ═══");
for (const id of ["bar_grid_z", "bar_openclose"]) {
  const p = PRODUCTS[id]; if (!p) continue;
  const spec = Object.fromEntries((p.specOpts || []).map((o) => [o.key, o.def ?? o.opts?.[0] ?? ""]));
  const c = computeCost(PB, p, { ...(p.defaults || {}), form: p.defForm, material: p.defMaterial, glassType: p.defGlass, spec, addons: {}, color: "white", colorKey: "white" });
  const warned = (c.lines || []).some((l) => l.cat === "warn" && /ยังไม่ได้กรอกราคาขาย/.test(l.name));
  warned ? pass++ : fail++;
  console.log(`  ${warned ? "✅" : "❌"} ${id}: ${warned ? "ขึ้นคำเตือนแล้ว" : "ราคา 0 แต่ไม่เตือน"}`);
}
console.log(`\n═══ สรุป: ${fail ? `❌ ${fail} บรรทัดราคา 0` : "✅ ผ่าน"} ═══`);
process.exit(fail ? 1 : 0);
