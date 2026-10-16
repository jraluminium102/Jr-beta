#!/usr/bin/env node
/**
 * gen-color-compare-html — หน้าเทียบค่าอบสี อ่านง่าย (R3.9 · R4.0 เดิมในไฟล์ · R4.0 เว็บตอนนี้)
 *   node --experimental-strip-types scripts/gen-color-compare-html.mjs --stock stock-live.json --out page.html
 *   ข้อมูลเก่า = ไฟล์ เทียบค่าอบสี.xlsx ของเจ้าของ · ข้อมูลใหม่ = เอนจินคิดราคา 4.0 + ราคาทับจากสโตร์จริง
 *   ใช้ตัวเลือก/ขนาดชุดเดียวกับ gen-color-r39-compare-xlsx (color-compare-config.mjs)
 */
import fs from "node:fs";
import { openXlsx, sheetList } from "./dumpxlsx.mjs";
import { computeCost, r41Key, r41VariantKey } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { resolveAluColor, aluColorKeysFor } from "../src/lib/calculator40/alu-colors.ts";
import { stockColorOfCalc, buildPriceOverride, applyPriceOverride } from "../src/lib/calculator40/stock-link.ts";
import { IDOF, KEYOF, baseInput, withSpecDefaults } from "./color-compare-config.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SRC = "C:/Users/jralu/JR-beta/เทียบค่าอบสี.xlsx";
const OUT = arg("--out") || "docs/เทียบค่าอบสี.html";
const PB0 = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
let PB = PB0, nStock = 0;
if (arg("--stock")) {
  const raw = JSON.parse(fs.readFileSync(arg("--stock"), "utf8"));
  const rows = raw.rows ?? raw; nStock = rows.length;
  PB = applyPriceOverride(JSON.parse(JSON.stringify(PB0)), buildPriceOverride(rows, PB0));
}

// หมายเหตุรายรุ่น — สิ่งที่เจ้าของต้องรู้ตอนอ่านเทียบ (ตรวจแล้ว 12 ต.ค.69)
const NOTE = {
  "PC Door": { level: "file", text: "ไฟล์เดิมเขียนช่อง อลูที่ใช้ ผิด (ลอกของบานเปิดฟูจิมา) ของจริงเป็นเส้นเมืองทอง+SMS ตามไฟล์ถอดทุน v1 · น้ำหนักในไฟล์เดิมเชื่อไม่ได้" },
  "เฟี้ยม": { level: "file", text: "ไฟล์เดิมคิดราคาฐานแบบ 2 บาน ทั้งที่หัวข้อเขียน 6 บาน · เว็บคิด 6 บาน (อุปกรณ์ 14,000 ตามไฟล์ v1) ช่อง R4.0 เดิมจึงต่ำเกินจริง" },
  "บานเลื่อนรางบน": { level: "file", text: "ไฟล์เดิมเขียนคานรับราง 1.6\"×4\" · เว็บและใบตัดใช้ 2\"×4\"" },
  "บานระแนงเลื่อน": { level: "fix", text: "แก้ 12 ต.ค.69: ลูกฟูก 20 เส้นที่เป็นหน้าบานคิดตามสีแล้ว (เดิมราคาเดียวทุกสี)" },
  "บานโซลิด": { level: "rule", text: "เปิดมะฮอกกานี/ไวท์โอ๊คแบบสีสต็อก 12 ต.ค.69 · ใช้อลูหนักมาก (ลูกฟูก+เส้นคาดตาราง 2 ฝั่ง) ค่าสีจึงสูงกว่า R3.9 ที่บวกเหมา" },
  "บานหมุน": { level: "rule", text: "รุ่นนี้ไม่มีมะฮอกกานี/ไวท์โอ๊คสต็อก → เว็บคิดเป็นลายไม้อบพิเศษ (ไฟล์เดิมยังคิดสีสต็อก)" },
  "บานกระทุ้ง": { level: "rule", text: "รุ่นนี้ไม่มีมะฮอกกานี/ไวท์โอ๊คสต็อก → เว็บคิดเป็นลายไม้อบพิเศษ (ไฟล์เดิมยังคิดสีสต็อก)" },
  "บานเลื่อน SlimLux": { level: "info", text: "ราคามาตรฐานรวมค่าอบสีเทาไว้แล้ว ค่าสีพิเศษจึงบวกน้อย" },
  "บานเลื่อน E-series": { level: "info", text: "ราคามาตรฐานรวมค่าอบสีเทาไว้แล้ว ค่าสีพิเศษจึงบวกน้อย" },
  "Velora": { level: "info", text: "ราคามาตรฐานรวมค่าอบสีเทาไว้แล้ว · แก้ 12 ต.ค.69 ลูกฟูกตอนลายไม้อบพิเศษคิดค่าอบแล้ว" },
  "บานเลื่อน SMS": { level: "fix", text: "แก้ 12 ต.ค.69: ขวางบน/ล่าง B20054 ตอนสีพิเศษคิดค่าอบแล้ว (เดิมไม่คิด)" },
  "เปิดดัดโค้ง": { level: "rule", text: "บานสั่งสำเร็จจากร้าน — ทุนบาน = ตารางราคาร้านในไฟล์ v1 (1 บาน สูง≤2.4: ขาว/ดำ 16,000 · เทาซาฮาร่า 16,500 · ลายไม้ 21,000 · บานคู่ 26,000/26,500/34,500) · ร้านไม่ทำสีอบพิเศษ/ลายไม้อบพิเศษ → ไม่มีให้เลือก (เจ้าของ 13 ต.ค.69) · ค่าสีขาย = ราคาสีที่ร้านเพิ่มบวกกำไรแบบค่าของอื่น (เคาะ 13 ต.ค.69 เช่น ลายไม้ ร้าน +5,000 → ขาย +11,800)" },
};
const GROUP = (n) => /ระแนง|รั้ว/.test(n) && !/บานระแนงเลื่อน/.test(n) ? "ระแนง/รั้ว"
  : /หลังคา/.test(n) ? "หลังคา" : /เลื่อน/.test(n) ? "บานเลื่อน" : /เฟี้ยม/.test(n) ? "เฟี้ยม" : "บานเปิด/อื่น ๆ";

const x = openXlsx(SRC), rows0 = x.read(sheetList(x.zip)[0].path);
const cell = (r, c) => { const v = r.cells?.[c]; return v == null ? "" : String(v); };
const num = (v) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const items = []; let cur = null;
for (const r of rows0) {
  const a = cell(r, "A");
  if (a === "สินค้า") continue;
  if (a && cell(r, "B") && cell(r, "D")) {
    cur = { name: a, size: cell(r, "B"), panels: cell(r, "C"), kgFile: num(cell(r, "D")), spec: cell(r, "E").replace(/\r?\n/g, " · "),
      base40: num(cell(r, "M")), base39: num(cell(r, "N")), rows: [] };
    items.push(cur); continue;
  }
  const f = cell(r, "F");
  if (cur && f) cur.rows.push({ type: f, color: cell(r, "G"), costTxt: cell(r, "I"),
    cost40: num(cell(r, "I")), add40: num(cell(r, "J")), add39: num(cell(r, "K")), total40: num(cell(r, "M")), total39: num(cell(r, "N")) });
}
const webOpt = (key) => { const rc = resolveAluColor(key);
  return { color: rc.bake, colorName: rc.label, stockColor: stockColorOfCalc(key), colorKey: key, profitPct: 100, profitMat: 100, profitProd: 100, profitInst: 200, profitManual: false }; };
const R = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
// น้ำหนักอลูทั้งชุด (เส้นที่ซื้อ × กก./เส้น) — เทียบกับ "น้ำหนักที่อบแยก" (aluKg) ให้เห็นว่าเส้นไหนราคาสีรวมอบมาแล้ว (กล่อง/ฉาก) · เจ้าของ 15 ต.ค.69 "รางบน อบ 20.9 กก. ดูน้อย"
const kgAllOf = (c) => Math.round((c.lines || []).filter((l) => l.cat === "alu").reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.kg) || 0), 0) * 10) / 10;

const data = [];
// วิธีคิด "ค่าสีขาย" จากทุนสีที่เพิ่ม — เจ้าของ 15 ต.ค.69 "บอกแล้วไงให้เขียนให้ชัดเจนว่าคูณกำไรยังไงเท่าไหร่ ชั้นจะได้ตรวจได้"
//   สีสต็อก (เทา/ลายไม้สต็อก ฯลฯ) = ทุนสีที่เพิ่ม × 1.6 (เจ้าของเคาะ 15 ต.ค.69)
//   สีอบพิเศษ/ลายไม้อบพิเศษ = ทุนสีที่เพิ่มเข้าก้อนทุนค่าของ แล้วล็อกกำไรสุทธิเท่ากับทั้งชุด → ÷ (1 − 30/130 − กำไรสุทธิ)
//   รุ่นนอกตาราง R4.1 = ขายเพิ่ม ÷ ทุนเพิ่ม (สูตรรุ่นนั้น)
const sellHowOf = (c, wh) => {
  const sm = c.sellModel || {}, add = (c.sell?.withInstall || 0) - (wh.sell?.withInstall || 0), dc = c.cost.total - wh.cost.total;
  if (sm.r41 && sm.colourExtra && sm.colourExtra.cost > 0) return { mode: "stock", cost: R(sm.colourExtra.cost), mult: sm.colourExtra.mult, sell: R(sm.colourExtra.sell) };
  if (sm.r41 && sm.net != null) { const div = 1 - 30 / 130 - sm.net / 100; return { mode: "net", cost: R(dc), net: sm.net, div: Math.round(div * 10000) / 10000, sell: R(dc / div) }; }
  return { mode: "ratio", cost: R(dc), mult: dc > 0 ? Math.round((add / dc) * 100) / 100 : null, sell: R(add) };
};
// ราคาปลีก KC Fuji ปี 67 (บาท/เส้น ตามสี) — ไว้เทียบราคาเส้นลายไม้/ขาวในบล็อกค่าสี (15 ต.ค.69 เจ้าของ "ไม่มั่นใจว่าถูก ให้เช็คตัวเองด้วย")
const FUJI_RETAIL = fs.existsSync("scripts/fixtures/fuji-retail-2567.json") ? JSON.parse(fs.readFileSync("scripts/fixtures/fuji-retail-2567.json", "utf8")) : {};
const PDFCOL = { wood_teak: "wood_teak", wood_maho: "wood_maho", wood_whiteoak: "wood_whiteoak", sahara: "sahara", sahara_black: "sahara_black" };
// ราคาเส้นอลูทีละเส้น สีนี้ vs สีขาว (สีสต็อกเท่านั้น — สีอบพิเศษ = ขาว + ค่าอบ ราคาเส้นไม่เปลี่ยน)
//   [รหัส, ชื่อ, จำนวนเส้น, กก./เส้น, ขาว/เส้น, สีนี้/เส้น, PDF ขาว, PDF สีนี้]
const barsOf = (c, wh, key) => {
  const W = (wh.lines || []).filter((l) => l.cat === "alu"), C = (c.lines || []).filter((l) => l.cat === "alu");
  const seen = new Set(), out = [];
  C.forEach((l, i) => {
    const w = W[i] && W[i].code === l.code ? W[i] : W.find((x) => x.code === l.code) || null;
    const k = l.code + "|" + l.unitPrice; if (seen.has(k)) return; seen.add(k);
    const pdf = FUJI_RETAIL[l.code];
    out.push([l.code || "", String(l.name || "").replace(/\s*\([^)]*\)\s*$/, ""), Math.round((l.qty || 0) * 100) / 100, l.kg || 0,
      w ? w.unitPrice : null, l.unitPrice, pdf?.price?.white ?? null, pdf?.price?.[PDFCOL[key]] ?? null]);
  });
  return out; };
for (const it of items) {
  const id = IDOF[it.name], p = id && PRODUCTS[id];
  if (!p) continue;
  const base = baseInput(id, p, it.size, it.panels);
  const run = (k) => computeCost(PB, p, { ...base, ...webOpt(k) });
  const wh = run("white"), ws = run("wood_special");
  // ทุนแยกก้อน (แท็บ ทุน + ราคาขาย) — ทุนค่าของ = c.cost.total (ไม่รวมค่าแรง) · ทุนค่าแรง = ผลิต + ติดตั้ง
  const costOf = (c) => { const k = c.cost || {}, L = c.labor || {}, P = c.sell?.parts || {};
    return { mat: R(k.total), alu: R(k.alu), bake: R((k.bake || 0) + (k.openOven || 0)), glass: R(k.glass), hw: R((k.hardware || 0) + (k.consum || 0) + (k.frameColor || 0)),
      lp: R(L.prod), li: R(L.install), sMat: R(P.mat), sP: R(P.prod), sI: R(P.inst) }; };
  // id/vk = ผูกกับการ์ดรุ่นในตาราง R4.1 (15 ต.ค.69 รวมค่าสีเข้าหน้าเดียวกับราคา)
  const prod = { id: r41Key(id), vk: r41VariantKey(p, base.material, base.spec || {}, base.form), name: it.name, group: GROUP(it.name), size: it.size, panels: it.panels, spec: it.spec,
    kgFile: it.kgFile, kgWeb: Math.round((ws.aluKg || 0) * 10) / 10, kgAll: kgAllOf(ws), note: NOTE[it.name] || null,
    rows: [{ base: true, type: "มาตรฐาน", color: "อบขาว / ดำ", t39: it.base39, t40: it.base40, tWeb: R(wh.sell?.withInstall), costWeb: R(wh.cost.total), cost: costOf(wh) }] };
  for (const cr of it.rows) {
    const k = KEYOF(cr.color);
    if (!k || cr.color === "—" || /ไม่มีสีนี้ขาย/.test(cr.costTxt)) { prod.rows.push({ na: true, type: cr.type, color: cr.color || "—" }); continue; }
    // รุ่นที่ไม่ขายสีนี้ (เช่น บานโค้งสั่งร้าน ไม่มีสีอบพิเศษ — 13 ต.ค.69) → ไม่มีสีนี้ขาย
    if (k !== "white" && k !== "black" && !aluColorKeysFor(p.id).includes(k) && !aluColorKeysFor(p.id).includes(resolveAluColor(k)?.key)) { prod.rows.push({ na: true, type: cr.type, color: cr.color }); continue; }
    const c = run(k);
    const swapped = !p.euroColors && !p.woodStockColors && (k === "wood_maho" || k === "wood_whiteoak");
    prod.rows.push({ type: cr.type, color: cr.color,
      t39: cr.total39, t40: cr.total40, tWeb: R(c.sell?.withInstall),
      a39: cr.add39, a40: cr.add40, aWeb: R((c.sell?.withInstall || 0) - (wh.sell?.withInstall || 0)),
      c40: cr.cost40, cWeb: R(c.cost.total - wh.cost.total),
      oven: (c.cost?.openOven || 0) > 0, swapped, cost: costOf(c), sellHow: sellHowOf(c, wh),
      ...(PDFCOL[k] && !swapped ? { bars: barsOf(c, wh, k) } : {}),
      // วิธีคิดค่าสีของเว็บ — ให้คนอ่านตรวจสูตรได้: ค่าอบ = กก.ที่อบ × เรต/กก. + ค่าเปิดตู้อบ · สีสต็อก = ซื้อเส้นสีสำเร็จแพงกว่าขาว
      bake: { kg: Math.round((c.aluKg || 0) * 100) / 100, rate: PB.BAKE?.[resolveAluColor(swapped ? "wood_special" : k).bake] ?? 0,
        // ทุกก้อนเป็น "ส่วนที่เพิ่มจากสีขาว" — รุ่นที่สีขาวก็อบ/เปิดตู้อยู่แล้ว (Velora · SlimLux · E-series) จะได้ไม่โชว์ตู้อบซ้ำ
        bakeAll: R(c.cost?.bake), bakeWhite: R(wh.cost?.bake), bakeCost: R((c.cost?.bake || 0) - (wh.cost?.bake || 0)), oven: R((c.cost?.openOven || 0) - (wh.cost?.openOven || 0)), ovenWhite: R(wh.cost?.openOven || 0), aluDiff: R((c.cost?.alu || 0) - (wh.cost?.alu || 0)),
        otherDiff: R((c.cost.total - wh.cost.total) - ((c.cost?.bake || 0) - (wh.cost?.bake || 0)) - ((c.cost?.openOven || 0) - (wh.cost?.openOven || 0)) - ((c.cost?.alu || 0) - (wh.cost?.alu || 0))) } });
  }
  data.push(prod);
}
// ── รุ่นที่ไฟล์ เทียบค่าอบสี.xlsx ไม่มี → คิดค่าสีจากเว็บอย่างเดียว 1 ชุด ขนาดกลางในตาราง R4.1 (เจ้าของ 15 ต.ค.69 "ทำอบสีทุกชุด อย่างละ 1 ชุด ไซส์กลาง") ──
//   สีตัวแทน: เทาซาฮาร่า · ลายไม้สักทอง (สต็อก) · มะฮอกกานี/ไวท์โอ๊ค (เฉพาะรุ่นที่มีสต็อก) · สีอบพิเศษ · ลายไม้อบพิเศษ
//   ไม่มีคอลัมน์ R3.9 (a39 = null) · รุ่นที่สีไม่มีผลกับทุน (กระจกล้วน เช่น บานเปลือย/Shower) ไม่แสดง
{
  const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8")).rows;
  const have = new Set(data.map((d) => d.id));
  const byId = new Map();
  for (const r of FX) { if (!r.id || !r.inputs || r.small) continue; (byId.get(r.id) || byId.set(r.id, []).get(r.id)).push(r); }
  const TYPE = { sahara: "สต็อก", woodStock: "ลายไม้สต็อค", special: "อบสีพิเศษ", woodSpecial: "ลายไม้อบพิเศษ" };
  for (const [id, rs] of byId) {
    if (have.has(r41Key(id)) || !PRODUCTS[id]) continue;
    const p = PRODUCTS[id], vk0 = rs[0].vk || "";
    const cand = rs.filter((r) => (r.vk || "") === vk0).sort((a, b) => a.w * a.h - b.w * b.h);
    const mid = cand[Math.floor((cand.length - 1) / 2)];
    const base = withSpecDefaults(p, mid.inputs);
    const run = (k) => computeCost(PB, p, { ...base, ...webOpt(k) });
    const wh = run("white"), allow = aluColorKeysFor(id);
    const keys = ["sahara", "wood_teak", ...(p.euroColors || p.woodStockColors ? ["wood_maho", "wood_whiteoak"] : []), "special", "wood_special"].filter((k) => allow.includes(k) || k === "wood_maho" || k === "wood_whiteoak");
    const costOf = (c) => { const k = c.cost || {}, L = c.labor || {}, P = c.sell?.parts || {};
      return { mat: R(k.total), alu: R(k.alu), bake: R((k.bake || 0) + (k.openOven || 0)), glass: R(k.glass), hw: R((k.hardware || 0) + (k.consum || 0) + (k.frameColor || 0)),
        lp: R(L.prod), li: R(L.install), sMat: R(P.mat), sP: R(P.prod), sI: R(P.inst) }; };
    const rows = [{ base: true, type: "มาตรฐาน", color: "อบขาว / ดำ", t39: null, tWeb: R(wh.sell?.withInstall), costWeb: R(wh.cost.total), cost: costOf(wh) }];
    for (const k of keys) {
      const c = run(k);
      if (Math.abs(c.cost.total - wh.cost.total) < 1) continue;
      const rc = resolveAluColor(k);
      rows.push({ type: TYPE[rc.bake] || rc.bake, color: rc.label, t39: null, tWeb: R(c.sell?.withInstall), a39: null, aWeb: R((c.sell?.withInstall || 0) - (wh.sell?.withInstall || 0)),
        cWeb: R(c.cost.total - wh.cost.total), oven: (c.cost?.openOven || 0) > 0, swapped: false, cost: costOf(c), sellHow: sellHowOf(c, wh),
        ...(PDFCOL[k] ? { bars: barsOf(c, wh, k) } : {}),
        bake: { kg: Math.round((c.aluKg || 0) * 100) / 100, rate: PB.BAKE?.[rc.bake] ?? 0,
          bakeAll: R(c.cost?.bake), bakeWhite: R(wh.cost?.bake), bakeCost: R((c.cost?.bake || 0) - (wh.cost?.bake || 0)), oven: R((c.cost?.openOven || 0) - (wh.cost?.openOven || 0)), ovenWhite: R(wh.cost?.openOven || 0), aluDiff: R((c.cost?.alu || 0) - (wh.cost?.alu || 0)),
          otherDiff: R((c.cost.total - wh.cost.total) - ((c.cost?.bake || 0) - (wh.cost?.bake || 0)) - ((c.cost?.openOven || 0) - (wh.cost?.openOven || 0)) - ((c.cost?.alu || 0) - (wh.cost?.alu || 0))) } });
    }
    if (rows.length < 2) continue;
    data.push({ id: r41Key(id), vk: vk0, name: p.name, group: GROUP(p.name), size: mid.w + " x " + mid.h, panels: mid.p ? String(mid.p) : "—",
      kgWeb: Math.round((run("wood_special").aluKg || 0) * 10) / 10, kgAll: kgAllOf(run("wood_special")), note: null, noR39: true, rows });
  }
}
const meta = { builtAt: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }), nStock };

// ── แท็บ เทียบตาราง R4.1 (ข้อมูลจาก gen-r41-compare-data.mjs --out) ──
const r41rows = arg("--r41") ? JSON.parse(fs.readFileSync(arg("--r41"), "utf8")).rows : [];
// ผลพิสูจน์ด้วย Excel จริง (13 ต.ค.69 · xlcalc.ps1 คำนวณไฟล์ v1 / v20.1 ที่ขนาดเดียวกับตาราง) — --verify <โฟลเดอร์ที่มี verify-*.json>
//   แต่ละแถว: parts = { tableGen: v20.1−ตาราง, fileChange: v1−v20.1, webVsFile: เว็บ(ปิดเรต)−v1, brand: เรตแบรนด์ } (บาท) + verdict
if (arg("--verify") && fs.existsSync(arg("--verify"))) {
  const dir = arg("--verify"), sz = (s) => String(s || "").replace(/[^\d]+/g, " ").trim().split(" ").slice(0, 3).join("x");
  const byKey = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => /^verify-[a-z]+\.json$/.test(n))) {
    for (const v of JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"))) byKey.set(`${v.id}|${v.vk || ""}|${sz(v.size)}`, v);
  }
  let hit = 0;
  for (const r of r41rows) {
    const v = byKey.get(`${r.id}|${r.vk || ""}|${sz(`${r.w}x${r.h}x${r.p ?? 1}`)}`) || byKey.get(`${r.id}|${r.vk || ""}|${sz(`${r.w}x${r.h}`)}`);
    if (v && v.parts) { r.xl = { f1: v.f1, f201: v.f201, parts: v.parts, verdict: v.webVsFileVerdict, fix: v.fix || "" }; hit++; }
  }
  console.log("ผูกผล Excel ได้", hit, "/", r41rows.length, "แถว");
}
// หมายเหตุรายรุ่น + ข้อสรุป "ควรทำอะไร" — วิเคราะห์ 12 ต.ค.69 (เว็บตอนนี้ เทียบตาราง R4.1)
const NOTES41 = {
  // 14 ต.ค.69 ล้างหมายเหตุ "จูน % ค่าของ" ทั้งหมด — ราคาล็อกกำไรสุทธิเท่าตาราง R4.1 แล้ว (13 ต.ค.69) ไม่มีการจูนตามขนาด
  sms_slide: { level: "fix", text: "เรต SMS 188/กก. (เคาะแล้ว)" },
  cabinet_face: { level: "file", text: "ค่ากรีดรางเป็นออปชั่นแล้ว (ค่าตั้งต้นไม่คิด · 12 ต.ค.69) · ตาราง R4.1 คิดจากชีตที่ยังไม่เลือกสี/แบบ = ราคาสีชุบ + กระจก + ฉาก + สกรู ไม่มีชุดล้อ/รางยู → ทุนจริงสูงกว่า ราคาจึงสูงกว่าตาราง" },
  topslide: { level: "file", text: "1 บาน (90×220) ทุนเว็บสูงกว่าตาราง (ไฟล์ v1 เปลี่ยนมือจับ) ราคาจึงสูงกว่าตาราง" },
  roof_slide: { level: "rule", text: "ค่าแรงคิดบนผืนจริง (ใต้บานเลื่อนโล่ง ตามที่เคาะ 26 ก.ย.) · กำไรสุทธิ 25% เฉพาะตัวหลังคา + มอเตอร์ขายแยก (PDF เขียนแบบนี้) · มอเตอร์เว็บ 30,000 ตาราง 35,000 (รอเคาะ)" },
  louver: { level: "rule", text: "ค่าแรงปัดขนาดตามไฟล์ v1 (ตารางทำตามกฎเก่า)" },
  louver_rotate: { level: "rule", text: "ค่าแรงปัดขนาดตามไฟล์ v1 (แก้ 12 ต.ค.69) · มอเตอร์คิดผ่านกำไรสุทธิ 26% แบบตาราง" },
  gate: { level: "rule", text: "มอเตอร์คิดผ่านกำไรสุทธิ 35% แบบตาราง" },
  shower: { level: "fix", text: "แก้ 13 ต.ค.69: ยูจับกระจกไม่คิดในแบบบานเลื่อน · บานตายไม่คิดกระจกประตู · ค่าติดตั้งตามไฟล์ v1" },
};
const FINDS41 = [
  { sev: "ok", tag: "ตรวจแล้ว", title: "ทุนค่าของบนเว็บตรงไฟล์ถอดทุนล่าสุด (ตรวจด้วย Excel ทุกแถว)", why: "ตาราง R4.1 ทำจากไฟล์ถอดทุนรุ่นเก่า เว็บใช้ไฟล์รุ่นล่าสุด + ราคาอลูตามน้ำหนัก × เรตแบรนด์ ราคาที่ต่างจากตารางจึงมาจากของที่เปลี่ยน — รุ่นที่ต่างเยอะมีคำอธิบาย \"ทำไมราคาต่างจากตาราง\" ในการ์ดของรุ่นนั้น", act: "กดปุ่ม ค่าของ ▾ ใต้ขนาด เพื่อดูว่าใช้อะไร เท่าไหร่ กี่บาท" },
  { sev: "ok", tag: "ตรงแล้ว", title: "ค่าแรงขาย = ตาราง R4.1 ทุกช่อง", why: "ค่าผลิต/ค่าติดตั้งขาย ตรงตาราง 399/399 ช่อง · ทุนค่าแรงตามไฟล์ v1 ทุกรุ่น (ยกเว้นหลังคาเลื่อน ระแนง ระแนงหมุน ที่กฎเปลี่ยนหลังทำตาราง)", act: "" },
  { sev: "ok", tag: "ตรวจแล้ว", title: "สูตรค่าอบสี ไม่คิดซ้ำ ไม่คิดขาด", why: "ค่าอบ = กก.ที่เข้ากองอบ × เรต (เทา 100 · อบพิเศษ 173 · ลายไม้อบพิเศษ 190) + ตู้อบ 2,000 · ลายไม้สต็อก = ซื้อเส้นสีสำเร็จ ไม่อบ · เส้นที่ไฟล์ให้ราคาสีแล้วไม่เข้ากองอบ · กล่อง/ฉาก/ใบระแนง สีอบพิเศษ/ลายไม้อบพิเศษ คิดค่าอบตาม กก. เหมือนเส้นอื่นแล้ว (เลิกคูณ 1.90/1.99 ตั้งแต่ 15 ต.ค. · สีสต็อกคงตัวคูณเดิม)", act: "ดูวิธีคิดรายสีในแท็บ ค่าอบสี" },
  { sev: "mid", tag: "แก้แล้ว", title: "บัคทุน 2 จุดที่เจอวันนี้ (Shower)", why: "① แบบบานเลื่อน คิดยูจับกระจก 800 เกิน (ชีตรวมในชุดอุปกรณ์แล้ว) ② แบบบานตาย คิดกระจกประตู 1.2 ตร.ม. เพิ่มจากค่าเริ่มต้น 60×200 ทั้งที่ไม่มีประตู", act: "แก้และขึ้นเว็บแล้ว · Shower บานเลื่อนตรงตาราง 0.0%" },
  { sev: "ok", tag: "เคาะแล้ว", title: "ราคาล็อกกำไรสุทธิเท่าตาราง R4.1 (13–14 ต.ค.69)", why: "ขายรวม = ทุนรวม ÷ (1 − 30/130 − กำไรสุทธิ) ปัดร้อย · ค่าแรงขาย = ตาราง · ไม่จูน % ตามขนาดแล้ว → กำไรสุทธิเท่าตารางทุกขนาด และกำไรค่าของออกมาใกล้ตัวเลขในหัวตาราง (SMS 63%) เอง · ราคาที่ต่างจากตาราง = ทุนที่ต่าง", act: "" },
  { sev: "hi", tag: "เคาะ", title: "ทุนค่าของที่ห่างตารางเกิน 5% มี 21 กลุ่ม — สาเหตุรู้หมดแล้ว", why: "เรตต่อโล 188/193 (รุ่น SMS +4…13%) · เว็บตามไฟล์ v1 แต่ตารางทำจาก v20.1 (PC Door −12% · กระทุ้ง −7% · หลังคาเพิง −5%) · ที่เคาะไว้ (Velora ราคาสโตร์ +28% · SlimLux ไม่อบกล่องฟูจิซ้ำ −9% · หลังคาเลื่อนผืนรวม) · ตารางผิดเอง (เปิดดัดโค้ง นับค่าแรงซ้ำ · บานตู้ไม่ได้เลือกสี/แบบ)", act: "ถ้ายอมรับทุนใหม่ → ยอดขายด้วยตัวคูณเท่าตารางจะห่างจากตารางตามทุน (ดูคอลัมน์ขวา) ถ้าไม่รับ → ต้องแก้ที่ต้นทุน ไม่ใช่ซ่อนใน %" },
  { sev: "mid", tag: "แก้แล้ว", title: "ออดิตทุนรายขนาด (13 ต.ค.) — บั๊กเว็บ 5 จุดแก้แล้ว", why: "E-series ตบปิดเฟรมบน/ตบธรณีนับเส้นเต็ม (2/4 บาน −9% → 0%) · รางบน เสาเกี่ยว = จำนวนบาน + รอยซ้อน 4×(N−1) (3–4 บาน → ±2%) · SMS อุปกรณ์มือจับรายชิ้นตามชีต · บานยก น้ำหนัก B10004 6.355 ตามไฟล์ · ยูโร 4 บาน เฟรมบน-ล่าง F7977 ตามใบตัด (+18% → +9%) · หลังคาเลื่อน ส่วนติดตาย = เพิง v1 + ตัวเทียบส่งแบบเลื่อนข้าง (±15..−32% → −1%) · ระแนงสลับ ตัวเทียบไม่รวมโครง (→ 0%)", act: "" },
  { sev: "lo", tag: "รับทราบ", title: "ข้อมูลในไฟล์ที่ต้องแก้ (เจ้าของเคาะให้เว็บถูกแล้ว)", why: "ชีตราคาสี แถว 213 'อแดปเตอร์รูสกรู' (B28015) = 60 บาท/เส้น — เคาะเชื่อน้ำหนัก 6.573 กก. (เว็บ 1,236) · ชีต SlimLux v1 ยังตั้งราคากล่องฟูจิ 1,742 รวมค่าอบ ขัดกับกฎที่เคาะ (เว็บไม่อบซ้ำ) · ฝ้า/ผนัง/พื้น/ไฟ ยังเทียบ 3 ก้อนไม่ได้ (เว็บรวมค่าแรงในวัสดุ)", act: "" },
];
// สาเหตุที่ทุนเว็บ ≠ ตาราง (รายรุ่น · จาก scratchpad/cost-diff-reasons.json ที่ agent ตรวจ) → key "id|vk"
const reasons = {};
if (arg("--reasons") && fs.existsSync(arg("--reasons"))) for (const x of JSON.parse(fs.readFileSync(arg("--reasons"), "utf8"))) reasons[(x.id || "") + "|" + (x.vk || "")] = { text: x.reason, kind: x.kind };
// ทำไมราคาต่างจากตาราง — ภาษาง่าย (14 ต.ค.69 เจ้าของอ่านข้อความเทคนิค "✓ Excel · ไฟล์ v1 ..." ไม่เข้าใจ) · key id|แบบย่อย หรือ id
const why = fs.existsSync("scripts/fixtures/r41-why-plain.json") ? JSON.parse(fs.readFileSync("scripts/fixtures/r41-why-plain.json", "utf8")) : {};
delete why._note;
const r41 = { rows: r41rows, notes: NOTES41, finds: FINDS41, reasons, why };
const tpl = fs.readFileSync("scripts/color-compare.template.html", "utf8");
const json = JSON.stringify({ meta, data, r41 }).replace(/</g, "\\u003c");
fs.writeFileSync(OUT, tpl.replace("/*__DATA__*/null", json));
console.log(OUT, "· สินค้า", data.length, "· แถวสี", data.reduce((a, p) => a + p.rows.length, 0));
