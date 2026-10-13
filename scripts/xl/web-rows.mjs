// web-rows.mjs — ทุนค่าของเว็บ ของทุกแถวตาราง R4.1 ของรุ่นหนึ่ง (เรตแบรนด์ เปิด/ปิด) + บรรทัดทุน
//   node --experimental-strip-types scripts/xl/web-rows.mjs <id> [vk] [--lines]   (รันจาก root ของ repo)
//   คู่กับ scripts/xl/xlcalc.ps1 (Excel จริง) — ผลตรวจ 13 ต.ค.69 อยู่ที่ scripts/fixtures/excel-verify/
//   ปิดเรตแบรนด์ = ราคาเส้นตามไฟล์ v1 (ใช้เทียบกับ Excel ไฟล์ v1 ให้ "ต้องเท่ากัน") · เปิด = ที่ลูกค้าเห็นจริง (เรตแบรนด์ 8 ต.ค.69)
import fs from "node:fs";
const ROOT = new URL("../../", import.meta.url).href;   // root ของ repo
const { computeCost } = await import(ROOT + "src/lib/calculator40/engine.mjs");
const { PRODUCTS } = await import(ROOT + "src/lib/calculator40/products.mjs");
const { applyBootstrap } = await import(ROOT + "src/lib/calculator40/bootstrap.mjs");
const { withSpecDefaults } = await import(ROOT + "scripts/color-compare-config.mjs");
applyBootstrap(PRODUCTS, JSON.parse(fs.readFileSync("src/lib/calculator40/r39-data.json", "utf8")));
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [id, vk = ""] = args;
const p = PRODUCTS[id];
const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8")).rows.filter((r) => r.id === id && (r.vk || "") === vk && r.inputs);
const R = (v) => Math.round(v * 100) / 100;
const out = [];
for (const r of FX) {
  const inp = withSpecDefaults(p, r.inputs);
  PB.ALU_BRAND_ON = true; const on = computeCost(PB, p, inp);
  PB.ALU_BRAND_ON = false; const off = computeCost(PB, p, inp);
  PB.ALU_BRAND_ON = true;
  const o = { size: `${r.w}x${r.h}/${r.p}`, inputs: inp, table_cM: r.pdf?.cM, web_on: R(on.cost.total), web_off: R(off.cost.total) };
  if (process.argv.includes("--lines")) o.lines = off.lines.filter((l) => !["labor", "warn"].includes(l.cat)).map((l) => `${l.cat}|${l.name}|${l.code ?? l.sku ?? ""}|${R(l.qty)}×${R(l.unitPrice)}=${R(l.amount)}`);
  out.push(o);
}
console.log(JSON.stringify(out, null, 1));
