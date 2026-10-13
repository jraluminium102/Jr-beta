#!/usr/bin/env node
/**
 * audit-options — ออปชั่นทุกรุ่นที่ "ใช้วัสดุเพิ่ม" คิดราคาจากอะไร (BOM จริง · เหมา R3.9 · กรอกเอง) และสีมีผลไหม
 *   node --experimental-strip-types scripts/audit-options.mjs [--json out.json]
 *
 * เจ้าของถาม 13 ต.ค.69: "option เช่น คาดตาราง ทึบล่าง ตอนนี้เอาอลูจริงไปคิดราคาหรือเปล่า สีถูกไหม หรือแค่+ราคา"
 * วิธี: ตั้งค่าตั้งต้นรุ่น → เปิดออปชั่นทีละตัว (ทั้ง specOpts ที่มีราคา และ addons) → ดูบรรทัดที่เพิ่ม/เปลี่ยน
 *   cat alu + รหัส + เรตแบรนด์  = BOM จริง (น้ำหนัก × เรตแบรนด์ × สี)
 *   cat hardware/consum/glass    = BOM ราคาสโตร์/ไฟล์
 *   cat addon                    = ราคาเหมา (ขาย) · ทุนในระบบ = ขาย ÷ (1+กำไร%) · "(R3.9)" = เรตเก่า
 *   เทียบสีขาว vs สีอบพิเศษ ว่าราคาออปชั่นขยับไหม
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { withSpecDefaults } from "./color-compare-config.mjs";
import { applyBootstrap } from "../src/lib/calculator40/bootstrap.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
// ⚠ ต้อง bootstrap เหมือนหน้าเว็บ — รายการ addons ของรุ่นส่วนใหญ่ (คาดตาราง/ทึบล่าง/ครอบวงกบ ฯลฯ) ถูกเติมตรงนี้ ไม่ได้อยู่ใน products.mjs
applyBootstrap(PRODUCTS, JSON.parse(fs.readFileSync("src/lib/calculator40/r39-data.json", "utf8")));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
// ค่าที่หน้าเว็บส่งให้แต่ละ addon (จาก AddonsSection.tsx) — ตัวที่ใช้วัสดุ/มีราคา
const ADDON_SEL = {
  frame_wrap: "3", handrail_grip: "u5", closer: "arm", thresh: "turtle", grid: { nh: 2, nv: 1, rate: 200 },
  solid_panel: { type: "comp", h: 60 }, solid_panel_z: { type: "z1", h: 60 }, awn_brace: "yes", awn_tt: "yes",
  hide_track: "yes", inner_track: "yes", gutter: { rate: 1000, len: 0 }, gutter_cover: { gw: 10, gh: 10, gll: 4 },
  hide_slope: { type: "comp", h: 0.3, l: 4, n: 1 }, beam_cover: { on: true, bcw: 0.3, bcl: 4 }, roof_eave: { on: true, len: 0 },
  louver_door: "บานเลื่อน", mosquito: "small", cmech: "1", stainless: "1", digihandle: "4500", shower_corner: "yes", shower_hw: "black",
  soft_close: "yes", sling: "1", u_track: "4", beam_support: "4", hide_beam: "4", chain_drain: "2", pipe_cover: "3", roof_pole: "panel",
  truss_beam: { type: "1", len: 4 }, roof_sealer: "yes", roof_film: "300", roof_2nd: { len: 1, mat: "ไวนิล" }, ceil_under: "yes",
  gate_curve: "yes", screen_demo: "yes", rain_sensor: "yes", pullrod: "1", zip_smart: "yes", zip_remote: "1", ms_color: "ดำ",
};
const SKIP_ADDONS = new Set(["demolish", "drop_floor", "screen_existing", "gate_wire", "elec", "roof_zip", "door_zip",
  "motor", "slide_motor", "banklet_motor", "velora_motor", "awn_auto", "slide_auto", "gate_motor", "zip_motor", "zip_noremote"]);   // กรอกเอง/มอเตอร์ — ไม่ใช่วัสดุที่ถาม
const BRAND_OF = PB.ALU_BRAND_OF || {};
const keyOf = (l) => `${l.cat}|${l.name}|${l.code ?? l.sku ?? ""}`;
const R = (v) => Math.round(Number(v) || 0);

function run(p, extra, color = "white") {
  const base = withSpecDefaults(p, { w: p.defaults?.w ?? 200, h: p.defaults?.h ?? 220, p: p.defaults?.p ?? 1, form: p.defForm, material: p.defMaterial, glassType: p.defGlass, addons: {}, color: color === "white" ? "white" : "special", colorKey: color });
  const o = { ...base, ...extra, spec: { ...base.spec, ...(extra.spec || {}) }, addons: { ...(extra.addons || {}) } };
  try { return computeCost(PB, p, o); } catch (e) { return { err: e.message }; }
}
function diff(a, b) {
  const A = new Map((a.lines || []).map((l) => [keyOf(l), l])), out = [];
  for (const l of b.lines || []) { const x = A.get(keyOf(l)); if (!x || Math.abs((x.amount || 0) - (l.amount || 0)) > 0.5 || Math.abs((x.qty || 0) - (l.qty || 0)) > 0.001) out.push({ ...l, was: x ? R(x.amount) : null }); }
  for (const [k, x] of A) if (!(b.lines || []).some((l) => keyOf(l) === k)) out.push({ ...x, amount: 0, was: R(x.amount), removed: true });
  return out;
}
function classify(lines) {
  const kinds = new Set();
  for (const l of lines) {
    if (l.removed) continue;
    if (l.cat === "alu") kinds.add(l.code && BRAND_OF[l.code] ? "BOM อลูจริง (กก.×เรตแบรนด์×สี)" : l.code ? "BOM อลู ราคาเส้นไฟล์/สโตร์" : "BOM อลู (ไม่มีรหัส)");
    else if (l.cat === "bake") kinds.add("ค่าอบตามน้ำหนัก");
    else if (["hardware", "consum", "glass"].includes(l.cat)) kinds.add("BOM " + (l.cat === "glass" ? "กระจก" : "อุปกรณ์") + " ราคาสโตร์/ไฟล์");
    else if (l.cat === "addon") kinds.add(/R3\.9/.test(l.name) ? "เหมา R3.9 (ขาย ทุน=ขาย÷2)" : (l.cost != null ? "เหมา มีทุนจริง" : "เหมา (ขาย ทุน=ขาย÷2)"));
    else if (l.cat === "labor") kinds.add("ค่าแรง");
    else if (l.cat === "warn") kinds.add("เตือน");
    else kinds.add(l.cat);
  }
  return [...kinds];
}
const out = [];
for (const [id, p] of Object.entries(PRODUCTS)) {
  if (p.composite || p.sellDirect || p.sellZip) continue;
  const w0 = run(p, {}), s0 = run(p, {}, "special");
  if (w0.err) continue;
  const push = (kind, key, label, w1, s1) => {
    if (w1.err) { out.push({ id, name: p.name, kind, key, label, err: w1.err.slice(0, 60) }); return; }
    const dl = diff(w0, w1).filter((l) => l.cat !== "labor" || Math.abs(l.amount - (l.was || 0)) > 0.5);
    const dCost = R(w1.cost.total - w0.cost.total), dSell = R(w1.sell.withInstall - w0.sell.withInstall);
    const dCostS = s1.err ? null : R(s1.cost.total - s0.cost.total), dSellS = s1.err ? null : R(s1.sell.withInstall - s0.sell.withInstall);
    const lab = R((w1.labor?.prod || 0) + (w1.labor?.install || 0) - (w0.labor?.prod || 0) - (w0.labor?.install || 0));
    if (!dl.length && dCost === 0 && dSell === 0) return;
    out.push({ id, name: p.name, kind, key, label, dCost, dSell, dCostSpecial: dCostS, dSellSpecial: dSellS, dLabor: lab,
      colorMatters: dCostS != null && (Math.abs(dCostS - dCost) > 0.5 || Math.abs(dSellS - dSell) > 0.5),
      how: classify(dl), lines: dl.slice(0, 8).map((l) => ({ cat: l.cat, name: l.name.slice(0, 48), code: l.code ?? l.sku ?? "", qty: Math.round((l.qty || 0) * 100) / 100, unit: l.unit || "", price: R(l.unitPrice), amount: R(l.amount), was: l.was, removed: !!l.removed })) });
  };
  for (const o of p.specOpts || []) {
    if (!o.opts || !o.priced && !/โครง|ธรณี|ช่องแสง|มุ้ง|เสริม|คาน|แบ่ง|ราง|บังใบ|ชั้น/.test(o.label || "")) continue;
    for (const v of o.opts) { if (v === o.def) continue; push("spec", o.key, `${o.label}: ${v}`, run(p, { spec: { [o.key]: v } }), run(p, { spec: { [o.key]: v } }, "special")); }
  }
  for (const o of p.specOpts || []) if (o.type === "number" && /ช่องแสง|ข้าง|ล่าง|บน|มุ้ง/.test(o.label || "") && String(o.def) === "0")
    push("spec", o.key, `${o.label}: 40`, run(p, { spec: { [o.key]: "40" } }), run(p, { spec: { [o.key]: "40" } }, "special"));
  for (const ad of p.addons || []) {
    if (SKIP_ADDONS.has(ad)) continue;
    const sel = ADDON_SEL[ad]; if (sel == null) { out.push({ id, name: p.name, kind: "addon", key: ad, label: ad, err: "ไม่มีตัวอย่างค่าให้ลอง" }); continue; }
    push("addon", ad, `${ad}: ${JSON.stringify(sel)}`, run(p, { addons: { [ad]: sel } }), run(p, { addons: { [ad]: sel } }, "special"));
    if (ad === "solid_panel") push("addon", ad, `${ad}: เกล็ด Z 1"`, run(p, { addons: { [ad]: ADDON_SEL.solid_panel_z } }), run(p, { addons: { [ad]: ADDON_SEL.solid_panel_z } }, "special"));
  }
  for (const g of ["แผ่นคอมโพสิต", "แผ่นลูกฟูก", 'เกล็ด Z 1"']) if (p.defGlass && p.defGlass !== g) push("glass", "glassType", `กระจก→${g}`, run(p, { glassType: g }), run(p, { glassType: g }, "special"));
}
if (arg("--json")) fs.writeFileSync(arg("--json"), JSON.stringify(out, null, 1));
for (const r of out) {
  if (r.err) { console.log(`⚠ ${r.id} ${r.label}: ${r.err}`); continue; }
  console.log(`${r.id} | ${r.kind} ${r.label} | ทุน +${r.dCost} ขาย +${r.dSell}${r.colorMatters ? ` (สีพิเศษ: ทุน +${r.dCostSpecial} ขาย +${r.dSellSpecial})` : " (สีไม่มีผล)"} | ${r.how.join(" · ")}`);
}
console.log("รวม", out.length);
