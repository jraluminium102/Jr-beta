#!/usr/bin/env node
/**
 * verify-labor-file — ค่าแรงบนเว็บ (ทุนผลิต/ติดตั้ง) ต้องเท่าสูตรในไฟล์รวม v1 "เป๊ะ" ทุกรุ่น หลายขนาด
 *   node --experimental-strip-types scripts/verify-labor-file.mjs ["C:/.../ถอดทุน+ตัดผลิต รวม v1.xlsx"]
 *
 * เจ้าของสั่ง 12 ต.ค.69: "สูตรค่าแรงให้คุณลอกมาเป๊ะ 100% แต่มีบางรายการที่ทำค่าแรงไม่ตรง"
 *   → อ่านตาราง "ค่าแรง" (แถว 12+) จากไฟล์ตรง ๆ (ไม่ฝังเลข) แล้วคิดตามสูตรของแต่ละชีต "คิดทุน …"
 *   ทรงสูตร (ดึงจากชีตจริง 12 ต.ค.69):
 *     wh     = ฐาน + เรต × (กว้าง×สูง)                 ส่วนใหญ่ (MAX(0,…) · บางชีต ROUND)
 *     panel  = ROUND(ฐาน × จำนวนบาน)                    เฟี้ยม sms · เฟี้ยมยูโร
 *     ranae  = ฐาน + เรต × (ปัดขนาดตาม LUT แนวเกล็ด)    ระแนง · ระแนงหมุน (H12/H15/H16/H17)
 *     slip   = ฐาน + เรต × (กว้าง × ปัดสูงตาม LUT)      ระแนงสลับ (E2/H4)
 *     gate   = ROUND(ฐาน + เรต × (snap ≤20 ซม.))        ประตูรั้ว (X2/H4/H7)
 *     shower = ROUND(ฐานติดตั้ง + 87.5[มีบานเปิด/เลื่อน] + เรต × ROUND(กระจกรวม,2))
 *   ไม่อยู่ในชุดนี้ (เจ้าของเคาะแยกไว้แล้ว): หลังคาเลื่อน (ใต้บานโล่ง) · งานเหมารวม ฝ้า/ผนัง/พื้น
 */
import fs from "node:fs";
import { openXlsx, sheetList } from "./dumpxlsx.mjs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const FILE = process.argv[2] || "C:/Users/jralu/JR-beta/ถอดทุน+ตัดผลิต รวม v1.xlsx";
if (!fs.existsSync(FILE)) { console.log("⚠ ไม่เจอไฟล์ " + FILE + " — ข้าม"); process.exit(0); }
const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const x = openXlsx(FILE);
const sh = sheetList(x.zip).find((s) => s.name === "ค่าแรง");
const T = {};
for (const r of x.read(sh.path)) {
  const a = r.cells?.A; if (!a || r.row < 12) continue;
  const n = (c) => Number(r.cells?.[c]);
  if ([n("B"), n("C"), n("D"), n("E")].every(Number.isFinite)) T[String(a).trim()] = { pb: n("B"), pr: n("C"), ib: n("D"), ir: n("E"), hr: n("I") };
}
let pass = 0, fail = 0;
const ok = (label, cond, got = "") => { cond ? pass++ : fail++; if (!cond) console.log(`  ❌ ${label}  (${got})`); };

// ตารางในเว็บ = ตารางในไฟล์ (ทุกคีย์ที่เว็บใช้)
console.log("═══ ① ตารางค่าแรงในเว็บ = ชีต ค่าแรง ═══");
const used = new Set(Object.values(PRODUCTS).map((p) => p.laborKey).filter((k) => k && T[k]));
for (const k of used) { const w = PB.LABOR[k], f = T[k];
  ok(`${k}`, w && Math.abs(w.pBase - f.pb) < 0.01 && Math.abs(w.pRate - f.pr) < 0.01 && Math.abs(w.iBase - f.ib) < 0.01 && Math.abs(w.iRate - f.ir) < 0.01, JSON.stringify(w) + " vs " + JSON.stringify(f)); }

const L = [50, 60, 75, 100, 120, 150, 200, 300, 600];
const lo = (v) => { let r = L[0]; for (const q of L) if (q <= v) r = q; return r; };
const up = (v) => { for (const q of L) if (q > v) return q; return 99999; };
const ceilLut = (v) => (v === lo(v) ? v : up(v));
const snap = (v) => { const a = lo(v), b = up(v); return v - a <= 20 ? a : b - v <= 20 ? b : v; };
const SHAPE = {
  sms_slide: ["บานเลื่อน SMS", "wh"], euro_slide: ["บานเลื่อน ยูโร", "wh"], slimlux: ["SlimLux", "wh"], topslide: ["บานเลื่อนรางบน", "wh"],
  open_door: ["บานเปิด (ยูโร)", "wh"], woodjamb: ["บานเปิด (ยูโร)", "wh"], pivot: ["บานหมุน", "wh"], awning: ["บานกระทุ้ง (ยูโร)", "wh"],
  velora: ["Velora", "wh"], eseries: ["บานเลื่อน SMS", "wh"], pcdoor: ["PC Door", "wh"], banyok: ["บานยก (เซมิ)", "wh"],
  bansolid: ["บานโซลิด", "wh"], bar_slide: ["บานระแนงเลื่อน", "wh"], fold_lift: ["บานเฟี้ยมยก", "wh"],
  fixed: ["บานติดตาย", "wh", true], curve_fixed: ["ตายดัดโค้ง", "wh", true], curve_open: ["เปิดดัดโค้ง", "wh", true], banklet: ["บานเกล็ด", "wh", true],
  roof: ["หลังคา", "wh"], glasshouse: ["หลังคา", "wh"], roof_gable: ["หลังคาจั่ว", "wh"],
  handrail: ["ราวกันตก", "wh2", true], frameless_door: ["บานเปลือย", "wh"],
  folding: ["บานเฟี้ยม (sms)", "panel", true], fold_euro: ["บานเฟี้ยมยูโร", "panel", true],
  louver: ["ระแนง", "ranae"], louver_rotate: ["ระแนงหมุน", "ranae"], louver_slip: ["ระแนงสลับ", "slip"], gate: ["ประตูรั้ว", "gate", true],
  shower: ["ชุด Shower", "shower", true],
};
const SIZES = [[90, 240], [200, 200], [350, 180], [400, 240], [175, 230], [120, 90], [300, 300]];
console.log("═══ ② ค่าแรงทุกรุ่น × หลายขนาด × ทุกรูปแบบ = สูตรชีต ═══");
for (const [id, [key, shape, round]] of Object.entries(SHAPE)) {
  const p = PRODUCTS[id], t = T[key];
  if (!p || !t) { ok(`${id}: มีรุ่น + มีแถว ${key}`, false, !p ? "ไม่มีรุ่น" : "ไม่มีแถวในชีต"); continue; }
  const forms = shape === "panel" ? (p.forms || []).filter((f) => /^[2-6]บาน/.test(f)).slice(0, 6) : (p.forms?.length ? p.forms : [p.defForm]);
  for (const form of forms) for (const [w, h] of SIZES) {
    const n = shape === "panel" ? Number(form.match(/^(\d+)บาน/)?.[1] || 2) : (p.defaults?.p ?? 1);
    const spec = shape === "shower" ? { dw: "60", dh: "200", cw: "120", rail: "มี" } : {};
    const c = computeCost(PB, p, { w, h, p: n, form, material: p.defMaterial, glassType: p.defGlass, spec, addons: {}, color: "white", colorKey: "white" });
    let A;
    if (shape === "wh") A = (w / 100) * (h / 100);
    else if (shape === "wh2") A = Math.round((w * h) / 10000 * 100) / 100;
    else if (shape === "ranae") A = (form === "นอน" ? ceilLut(w) : w) * (form === "ตั้ง" ? ceilLut(h) : h) / 10000;
    else if (shape === "slip") A = w * ceilLut(h) / 10000;
    else if (shape === "gate") A = (form === "นอน" ? snap(w) : w) * (form === "ตั้ง" ? snap(h) : h) / 10000;
    else if (shape === "shower") A = Math.round((w * h + 60 * 200) / 10000 * 100) / 100;
    let fp, fi;
    if (shape === "panel") { fp = t.pb * n; fi = t.ib * n; }
    else { fp = Math.max(0, t.pb + t.pr * A); fi = Math.max(0, t.ib + t.ir * A) + (shape === "shower" && form !== "บานตาย" ? t.hr : 0); }
    if (round) { fp = Math.round(fp); fi = Math.round(fi); }
    const wp = c.labor?.prod ?? 0, wi = c.labor?.install ?? 0;
    ok(`${id} ${form} ${w}×${h}: ผลิต ${fp.toFixed(1)} · ติดตั้ง ${fi.toFixed(1)}`, Math.abs(wp - fp) < 1 && Math.abs(wi - fi) < 1, `เว็บ ผลิต ${(+wp).toFixed(1)} · ติดตั้ง ${(+wi).toFixed(1)} · area ${c.laborCalc?.area}`);
  }
}
console.log(`═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
