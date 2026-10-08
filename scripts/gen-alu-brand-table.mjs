#!/usr/bin/env node
/**
 * gen-alu-brand-table — ระบบราคาอลูแบบใหม่: "แบรนด์ × สี → บาท/กก." ตารางเดียวจบ
 *   node scripts/gen-alu-brand-table.mjs            → ดูผลอย่างเดียว + ออกไฟล์เทียบ
 *   node scripts/gen-alu-brand-table.mjs --write    → เขียน PB.ALU_BRAND / ALU_BRAND_OF / ALU_KG ลง pricebook
 *
 * เจ้าของสั่ง 8 ต.ค.69: "อยากได้แบบให้ใส่แค่ช่องราคาและสีที่มี แยกตามแบรนด์ 3 แบรนด์จบ"
 *   ราคาเส้น = น้ำหนัก/เส้น × เรต(แบรนด์, สี)   ไม่ต้องไล่แก้ราคารายรหัสอีก
 *   ⚠ ยังไม่ต่อเข้าเอนจิน — รอบนี้สร้างตาราง + ไฟล์เทียบ "ราคาเก่า vs ราคาใหม่" ให้ตรวจก่อน
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openXlsx } from "./dumpxlsx.mjs";
import { writeXlsx, S } from "./xlsxwrite.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB_PATH = path.join(ROOT, "src/lib/calculator40/pricebook.json");
const PB = JSON.parse(fs.readFileSync(PB_PATH, "utf8"));
const WEIGHT_FILE = "C:/Users/jralu/JR-beta/น้ำหนักโปรไฟล์.xlsx";

// ── ① ตารางเรต บาท/กก. (ที่เจ้าของส่งมา 8 ต.ค.69 — แก้ที่นี่ที่เดียว) ─────────
export const ALU_BRAND = {
  fuji: {
    label: "Euro Fuji",
    note: "รหัสขึ้นต้น F ทุกตัว (บานเปิด/เฟี้ยม/เลื่อนยูโร · บานยก · กระทุ้ง) + ลูกฟูกทุกเส้น + กล่อง/ฉาก เฉพาะไซส์ในลิสต์",
    rate: {
      "สีชุบขาว": 193, "สีชุบชา": 205, "สีชุบดำ": 208,
      "อบขาว": 193, "ดำ": 193,
      "เทาซาฮาร่า": 205, "ดำซาฮาร่า": 205,
      "แอทแทคเกรย์": 207,
      "ลายไม้สักทอง": 282, "มะฮอกกานี": 285, "ไวท์โอ๊ค": 282,
      "มิว": 182,
    },
  },
  sms: {
    label: "SMS",
    note: "รหัสขึ้นต้น B ทุกตัว (บานเลื่อน/เฟี้ยมเซมิยูโร) · ไม่มีลายไม้มะฮอกกานี/ไวท์โอ๊ค/แอทแทคเกรย์/สีชุบ",
    rate: {
      "อบขาว": 188, "ดำ": 188,
      "เทาซาฮาร่า": 203, "ดำซาฮาร่า": 203,
      "ลายไม้สักทอง": 286,
      "มิว": 188,
    },
  },
  market: {
    label: "ตลาด",
    note: "ตัว Z · กล่องที่มีชื่อเรียก (กล่องร่อง/กล่องเปิด) · กล่อง/ฉาก ไซส์นอกลิสต์ฟูจิ · วงกบมีติ่ง/กรอบบานเปิด 3\" · ฉากข้อต่อ · ไม่มีลายไม้และแอทแทคเกรย์",
    rate: {
      "มิว": 183, "ขาว NA": 188, "สีชา": 198,
      "ดำ": 203, "อบขาว": 188,
      "เทาซาฮาร่า": 203, "ดำซาฮาร่า": 203,
    },
  },
};

// สีในเอนจิน (colorKey) → ชื่อสีในตารางเรต
export const ALU_COLOR_NAME = {
  white: "อบขาว", black: "ดำ",
  sahara: "เทาซาฮาร่า", sahara_black: "ดำซาฮาร่า",
  aztec: "แอทแทคเกรย์",
  wood_teak: "ลายไม้สักทอง", wood_maho: "มะฮอกกานี", wood_whiteoak: "ไวท์โอ๊ค",
  mill: "มิว", tea: "สีชา", white_na: "ขาว NA",
  anod_white: "สีชุบขาว", anod_tea: "สีชุบชา", anod_black: "สีชุบดำ",
};

// ── ② กล่อง/ฉาก ไซส์ที่เป็นฟูจิ (เจ้าของส่งลิสต์ 8 ต.ค.69) ─────────────────
//    ไซส์นอกลิสต์ = ตลาด · "ฉาก 2\"/ฉาก 4\"" = ฉากL ½×2 และ ½×4 ในลิสต์ (เจ้าของยืนยัน)
const FUJI_BOX = ["1X1", "1X1.6", "1X2", "1X4", "1.6X1.6", "1.6X3", "1.6X4", "2X2", "2X4", "4X4"];
const FUJI_ANGLE = ["3หุน", "4หุน", "6หุน", "1", "2", "3", "4", "1X1"];

// ── ③ รหัสที่ "ซื้อเป็นเส้น" ไม่คิดต่อกิโล (เจ้าของสั่ง) — ราคาคงเดิม แต่ยังเก็บน้ำหนักไว้คิดค่าอบ ──
const FIXED_PREFIX = [/^WM-K/, /^E-\d/, /^OPK/i, /^XSW/i];
const FIXED_CODE = new Set([
  "JR02885", "JR02886",              // วงกบ/กรอบบาน Velora
  "JR02889", "JR02890", "JR02891",   // เสามือจับ X-J (SlimLux)
  "JR03136",                          // ฝาครอบราง PC door
  "JR01840", "JR01841", "JR01859",   // คาน/เสารับบาน/คานรับราง
  "JR03141",                          // ราง Hafele (ซื้อเป็นชุด)
]);
// รหัสที่เจ้าของระบุแบรนด์ให้ตรง ๆ
const BRAND_CODE = new Map(Object.entries({
  JR01994: "fuji",      // ลูกฟูก 2 ทาง — "ลูกฟูกทุกเส้น" = Fuji
  JR01679: "market",    // เส้นคาดตาราง
  "9014": "market",     // ตัวตบ/ตัวเดินเคอเทนวอล
  JR02944: "market",    // ฉากข้อต่อ 2"
  JR03125: "market",    // ชนกลางรับบานเลื่อน (เมืองทอง)
  JR03126: "market", JR03127: "market", JR03131: "market", JR03132: "market",  // กรอบบานเปิด 3"
  JR03129: "market", JR03130: "market",                                        // วงกบมีติ่ง
  JR02892: "fuji", JR02893: "fuji", JR02894: "fuji",                           // F7948/F7949/F7860
  JR01949: "fuji",      // ฉาก 4" ปิดราง
  JR01822: "market", JR01823: "market",   // บังใบกล่อง ½"×1" — ไซส์นอกลิสต์
  JR01984: "?", JR01985: "?",             // กล่องเรียบ 1.6×4 — "เรียบ" = มีชื่อเรียก หรือนับเป็นไซส์? รอเจ้าของ
}));

const normBox = (s) => String(s).toUpperCase().replace(/["”]/g, "").replace(/\s+/g, "").replace(/นิ้ว/g, "").replace(/X/g, "X");

export function brandOf(code) {
  const c = String(code || "").trim();
  if (!c) return "?";
  if (BRAND_CODE.has(c)) return BRAND_CODE.get(c);
  if (FIXED_CODE.has(c)) return "fixed";
  if (FIXED_PREFIX.some((re) => re.test(c))) return "fixed";
  if (/^F\d/.test(c)) return "fuji";
  if (/^B\d/.test(c)) return "sms";
  if (/^(ตัวZ|แซด|Z\s)/i.test(c)) return "market";
  const box = c.match(/^กล่อง\s*(.+)$/);
  if (box) return FUJI_BOX.includes(normBox(box[1])) ? "fuji" : "market";
  const ang = c.match(/^ฉาก\s*(.+)$/);
  if (ang) return FUJI_ANGLE.includes(normBox(ang[1])) ? "fuji" : "market";
  return "?";
}

// ── ④ น้ำหนัก กก./เส้น — ยึดไฟล์ "น้ำหนักโปรไฟล์.xlsx" ──────────────────────
//    กล่อง/ฉากที่มีหลายความหนา: เจ้าของสั่ง "เอา 1.5 หลัก ไม่มีก็ 1.2" (8 ต.ค.69)
const PICK_THICK = [1.5, 1.2];
function readWeights() {
  const x = openXlsx(WEIGHT_FILE);
  const sh = x.sheets.find((s) => s.name === "น้ำหนักโปรไฟล์");
  const rows = x.read(sh.path);
  const byCode = new Map();      // รหัส → {kg, thick, len, name}
  const boxSizes = new Map();    // ชื่อขนาด → [{thick, kg}]
  for (const { cells } of rows) {
    const brand = String(cells.B ?? "").trim();
    if (!brand || brand.includes("—") || brand.startsWith("หมายเหตุ")) continue;
    const code = String(cells.C ?? "").trim().replace(/-\d{2}$/, "");
    const size = String(cells.D ?? "").trim();
    const name = String(cells.E ?? "").trim();
    const len = Number(cells.F) || 0;
    const kg = Number(cells.H) || (Number(cells.G) || 0) * len;
    if (!(kg > 0)) continue;
    if (code && code !== "-" && !byCode.has(code)) byCode.set(code, { kg, len, name, thick: size });
    // กล่อง/แป๊บ ของเมืองทอง: ชื่ออยู่คอลัมน์ E, ความหนาอยู่ D
    if (/^เมืองทอง/.test(brand) && /^[\d.]+\s*มม\.$/.test(size) && name) {
      const t = Number(size);
      if (!boxSizes.has(name)) boxSizes.set(name, []);
      boxSizes.get(name).push({ thick: t, kg, code });
    }
    if (/^เมืองทอง/.test(brand) && /^กล่อง|^ฉาก/.test(size)) {
      if (!boxSizes.has(size)) boxSizes.set(size, []);
      boxSizes.get(size).push({ thick: Number(String(cells.D).match(/[\d.]+/) ?? 0) || 0, kg, code });
    }
  }
  return { byCode, boxSizes };
}

/** เลือกความหนาตามกฎ 1.5 → 1.2 → หนาที่สุดที่มี */
export function pickThickness(list) {
  for (const t of PICK_THICK) {
    const hit = list.find((x) => Math.abs(x.thick - t) < 0.001);
    if (hit) return { ...hit, rule: t + " มม. (ตามกฎ)" };
  }
  const srt = [...list].sort((a, b) => b.thick - a.thick);
  return srt[0] ? { ...srt[0], rule: "ไม่มี 1.5/1.2 → ใช้ " + srt[0].thick + " มม. (หนาสุดที่มี) ⚠" } : null;
}

// น้ำหนักที่อ่านจากแคตตาล็อก Schimmer (กล่องฉากแซด อื่นๆ.pdf) — ยังไม่ได้ให้เจ้าของยืนยัน
const FROM_SHEET_NAME = {
  JR01994: { kg: 2.544, note: "ชีตน้ำหนักโปรไฟล์ แถว 53 (SlimLux · ลูกฟูก 6 ม. 0.424 กก./ม.)" },
};
const FROM_CATALOGUE = {
  "ฉาก 4 หุน": { kg: 0.47, note: "S05214 12.7×12.7 หนา 1.2 (ไม่มี 1.5) · แคตตาล็อก Schimmer" },
  "ฉาก 1\"x1\"": { kg: 1.20, note: "S05282 25.4×25.4 หนา 1.5 · แคตตาล็อก Schimmer" },
  "กล่อง 4 หุน": { kg: 0.83, note: "S12071 12×12 หนา 1.2 (ไม่มี 1.5) · แคตตาล็อก Schimmer" },
};

// ── ⑤ รวบรวมรหัสอลูที่สูตรใช้จริง ─────────────────────────────────────────
function collectCodes() {
  const map = new Map();
  for (const p of Object.values(PRODUCTS)) {
    if (!p || !p.id) continue;
    for (const it of p.alu || []) {
      const raw = String(it.code ?? "");
      if (!raw) continue;
      const codes = raw.includes("?") ? (raw.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : [raw];
      for (const c of codes) {
        if (/^[a-z_]+$/.test(c)) continue;   // 'white'/'black' ในสูตรเลือกรหัสตามสี ไม่ใช่รหัสอลู
        if (!map.has(c)) map.set(c, { code: c, names: new Set(), prods: new Set(), kgLine: 0 });
        const e = map.get(c);
        e.names.add(String(it.name).slice(0, 34));
        e.prods.add(p.id);
        if (!(e.kgLine > 0) && Number(it.kg) > 0) e.kgLine = Number(it.kg);
      }
    }
  }
  return [...map.values()];
}

// ── main ───────────────────────────────────────────────────────────────────
const { byCode, boxSizes } = readWeights();
const codes = collectCodes();
const SIZE_ALIAS = {
  "กล่อง 1\"x1\"": "แป๊บ 1 นิ้ว", "กล่อง 1\"x1.5\"": "แป๊บ 1½ นิ้ว", "กล่อง 1\"x1.6\"": "1¾×1 นิ้ว",
  "กล่อง 1\"x2\"": "1×2 นิ้ว", "กล่อง 1\"x4\"": "1×4 นิ้ว", "กล่อง 1.6\"x1.6\"": "แป๊บ 1¾ นิ้ว",
  "กล่อง 1.6\"x3\"": "กล่อง 1.6\"×3\"", "กล่อง 1.6\"x4\"": "กล่อง 1.6\"×4\"",
  "กล่อง 2\"x2\"": "แป๊บ 2 นิ้ว", "กล่อง 2\"x4\"": "2×4 นิ้ว", "กล่อง 4\"x4\"": "กล่อง 4\"×4\"",
  "ฉาก 6 หุน": "ฉาก 6 หุน",
};
const rowsOut = [];
const gaps = [];
for (const e of codes) {
  const brand = brandOf(e.code);
  let kg = 0, src = "";
  const w = byCode.get(e.code);
  if (w) { kg = w.kg; src = "ไฟล์น้ำหนักโปรไฟล์"; }
  if (!kg) {
    const alias = SIZE_ALIAS[e.code];
    const list = alias ? boxSizes.get(alias) : null;
    if (list && list.length) { const p = pickThickness(list); kg = p.kg; src = "เมืองทอง · " + p.rule; }
  }
  if (!kg && FROM_SHEET_NAME[e.code]) { kg = FROM_SHEET_NAME[e.code].kg; src = FROM_SHEET_NAME[e.code].note; }
  if (!kg && FROM_CATALOGUE[e.code]) { kg = FROM_CATALOGUE[e.code].kg; src = FROM_CATALOGUE[e.code].note; }
  if (!kg && e.kgLine > 0) { kg = e.kgLine; src = "น้ำหนักที่ฝังในสูตร (ยังไม่ยืนยัน)"; }
  const oldWhite = Number(PB.ALUCODE?.[e.code]) || 0;
  const rate = ALU_BRAND[brand]?.rate?.["อบขาว"] ?? 0;
  const neu = kg > 0 && rate ? Math.round(kg * rate) : 0;
  rowsOut.push({ code: e.code, brand, name: [...e.names][0], prods: [...e.prods].join(" "), kg, src, oldWhite, neu });
  if (brand === "?" || (brand !== "fixed" && !(kg > 0))) gaps.push({ code: e.code, brand, name: [...e.names][0], why: brand === "?" ? "ยังไม่รู้แบรนด์" : "ไม่มีน้ำหนัก", prods: [...e.prods].join(" ") });
}

const cnt = new Map();
for (const r of rowsOut) cnt.set(r.brand, (cnt.get(r.brand) || 0) + 1);
console.log("รหัสอลูในสูตร " + rowsOut.length + " รหัส");
for (const [b, n] of [...cnt.entries()].sort((a, c) => c[1] - a[1])) console.log("   " + String(b).padEnd(8) + n);
console.log("ยังขาดข้อมูล " + gaps.length + " รหัส");

// ── ไฟล์เทียบให้เจ้าของตรวจ ──
const COLORS = [...new Set(Object.values(ALU_BRAND).flatMap((b) => Object.keys(b.rate)))];
const sheets = [];
sheets.push({
  name: "เรตแบรนด์",
  widths: [16, 34, ...COLORS.map(() => 13)],
  rows: [
    ["ตารางเดียวจบ — แก้ราคาที่นี่ที่เดียว · ราคาเส้น = น้ำหนัก/เส้น × เรต"],
    ["แบรนด์", "ครอบคลุม", ...COLORS],
    ...Object.entries(ALU_BRAND).map(([k, b]) => [b.label, b.note, ...COLORS.map((c) => b.rate[c] ?? "—")]),
    [],
    ["— = แบรนด์นั้นไม่มีสีนี้ขาย → ระบบคิดเป็น \"สีอบพิเศษ\" (ขาว + ค่าอบ + เปิดตู้อบ 2,000/งาน)"],
  ],
});
sheets.push({
  name: "เทียบราคาขาว",
  widths: [14, 10, 34, 10, 30, 12, 12, 10, 24],
  rows: [
    ["ราคาสีอบขาว — ของเดิม เทียบกับ คิดจากน้ำหนัก × เรตแบรนด์"],
    ["รหัส", "แบรนด์", "ชื่อ", "กก./เส้น", "น้ำหนักมาจาก", "ราคาเดิม", "ราคาใหม่", "ต่าง %", "รุ่นที่ใช้"],
    ...rowsOut.sort((a, b) => (a.brand + a.code).localeCompare(b.brand + b.code)).map((r) => [
      r.code, ALU_BRAND[r.brand]?.label ?? r.brand, r.name,
      r.kg ? Math.round(r.kg * 1000) / 1000 : "", r.src,
      r.oldWhite || "", r.neu || "",
      r.oldWhite && r.neu ? Math.round((r.neu - r.oldWhite) / r.oldWhite * 100) + "%" : "",
      r.prods.slice(0, 40),
    ]),
  ],
});
sheets.push({
  name: "ยังขาด",
  widths: [14, 10, 36, 22, 30],
  rows: [
    ["ต้องเติมก่อนเปิดใช้ระบบใหม่"],
    ["รหัส", "แบรนด์", "ชื่อ", "ขาดอะไร", "รุ่นที่ใช้"],
    ...gaps.map((g) => [g.code, g.brand, g.name, g.why, g.prods.slice(0, 40)]),
  ],
});
// ── ⑥ น้ำหนักในสูตรเทียบกับไฟล์ — ตัวนี้มีผลกับ "ค่าอบสีพิเศษ" (ค่าอบ = กก. × เรต) ──
const kgRows = [];
for (const e of codes) {
  const w = byCode.get(e.code);
  if (!w || !(e.kgLine > 0)) continue;
  const pct = (e.kgLine - w.kg) / w.kg * 100;
  if (Math.abs(pct) < 5) continue;
  kgRows.push([e.code, [...e.names][0], Math.round(w.kg * 1000) / 1000, e.kgLine, Math.round(pct) + "%", [...e.prods].join(" ").slice(0, 40)]);
}
kgRows.sort((a, b) => Math.abs(parseFloat(b[4])) - Math.abs(parseFloat(a[4])));
sheets.push({
  name: "น้ำหนักเพี้ยน",
  rowStyles: [S.HEAD, S.HEAD],
  widths: [14, 34, 12, 12, 10, 30],
  rows: [
    ["น้ำหนักที่ระบบใช้อยู่ เทียบกับไฟล์น้ำหนักโปรไฟล์ — ตัวนี้คูณเป็นค่าอบสีพิเศษ ผิดเท่าไหร่ ค่าอบผิดเท่านั้น"],
    ["รหัส", "ชื่อ", "ไฟล์ กก./เส้น", "ระบบใช้อยู่", "ต่าง", "รุ่นที่ใช้"],
    ...kgRows,
  ],
});
const out = path.join(ROOT, "docs/ราคาอลู-3แบรนด์-เทียบก่อนสลับ.xlsx");
writeXlsx(out, sheets);
console.log("เขียนไฟล์เทียบ: " + out);

if (process.argv.includes("--write")) {
  PB.ALU_BRAND = Object.fromEntries(Object.entries(ALU_BRAND).map(([k, b]) => [k, b.rate]));
  PB.ALU_BRAND_NOTE = "เรตบาท/กก. แยกแบรนด์ × สี (เจ้าของส่ง 8 ต.ค.69) — ราคาเส้น = น้ำหนัก × เรต · ยังไม่ต่อเข้าเอนจิน";
  PB.ALU_BRAND_OF = Object.fromEntries(rowsOut.map((r) => [r.code, r.brand]));
  PB.ALU_COLOR_NAME = ALU_COLOR_NAME;
  PB.ALU_KG = Object.fromEntries(rowsOut.filter((r) => r.kg > 0).map((r) => [r.code, Math.round(r.kg * 1000) / 1000]));
  fs.writeFileSync(PB_PATH, JSON.stringify(PB, null, 2) + "\n");
  console.log("เขียน PB.ALU_BRAND / ALU_BRAND_OF / ALU_KG ลง pricebook แล้ว (ยังไม่มีผลกับราคา)");
}
