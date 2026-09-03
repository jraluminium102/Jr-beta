/**
 * verify-auto — มอเตอร์ / ชุดออโต้ ต้องตรงชีต "ราคาออโต้" ในไฟล์ถอดทุน และขึ้นถูกหมวด
 * ─────────────────────────────────────────────────────────────────────────────
 * เจ้าของสั่ง 3 ก.ย.69: "ในชีทราคาออโต้ คือรายละเอียดมอเตอร์ที่ใช้ในบานแต่ละประเภท
 *   อยากให้ใส่เข้าไปในคิดราคาให้ตามหมวด ... ถ้าลูกค้าเลือกมอเตอร์นั้น ๆ ให้ขึ้นตามประเภทบาน
 *   ห้ามขึ้นมั่ว ** ราคาเป็นราคาทุน ใส่ไปเลย เพราะค่าของสุดท้ายเรา ×2"
 *
 * ตรวจ 4 ชั้น
 *   ① ตารางราคากลาง PB.MOTOR = ชีตราคาออโต้ (ทุกแถว)
 *   ② ทุนของชุดออโต้ = สูตรในชีต "คิดทุน <รุ่น>" (บวกค่าส่ง/คูณบาน/อุปกรณ์พิเศษ ให้ถูก)
 *   ③ ขาย = ทุน × กำไร% (ไม่ใช่ ×2.5 ขั้นต่ำ 6,000 แบบ R3.9)
 *   ④ ขึ้นถูกหมวด — รุ่นที่ชีตไม่มีมอเตอร์ ต้องไม่มีให้เลือก
 */
import fs from "node:fs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCost, autoSetsFor } from "../src/lib/calculator40/engine.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
let pass = 0, fail = 0;
const ok = (label, cond, got = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`); };
const C = (id, o) => computeCost(PB, PRODUCTS[id], { color: "white", colorKey: "white", spec: {}, addons: {}, ...o });
const addonCost = (r, re) => Math.round(r.lines.filter((l) => l.cat === "addon" && re.test(l.name)).reduce((s, l) => s + (Number(l.cost) || 0), 0));
const addonSell = (r, re) => Math.round(r.lines.filter((l) => l.cat === "addon" && re.test(l.name)).reduce((s, l) => s + (Number(l.amount) || 0), 0));

// ── ① ตารางราคากลาง = ชีตราคาออโต้ ──────────────────────────────────
console.log("\n═══ ① PB.MOTOR ตรงชีต \"ราคาออโต้\" ═══");
{
  const FILE = {
    "บานยก ยก80": 4500, "บานยก ยก300": 12500, "บานยก ค่าส่ง": 1700,
    "หลังคาเลื่อน ยก80": 4500, "หลังคาเลื่อน ยก300": 12500, "หลังคาเลื่อน ยก1500": 13325, "หลังคาเลื่อน ค่าส่ง": 1700,
    "ฟันเฟือง/ม.": 340, "เซนเซอร์กันฝน": 1100,
    "บานเกล็ด": 1800, "ระแนงหมุน": 1800,
    "กระทุ้ง โช้ค50": 3575, "กระทุ้ง โช้ค80": 3725, "กระทุ้ง โซ่เดี่ยว50": 1900, "กระทุ้ง โซ่คู่50": 2600,
    "กระทุ้ง อุปกรณ์พิเศษ": 600, "กระทุ้ง ค่าส่ง": 1700,
    "เลื่อน Evecca": 13480, "เลื่อน Evecca สายพาน/ม.": 75, "เลื่อน Evecca Smart lock": 6500, "เลื่อน Evecca ค่าส่ง": 1700,
    "เลื่อน ช่างแซก": 8000, "เลื่อน ช่างแซก ตาแมว": 1000, "เลื่อน ช่างแซก ราง/ม.": 950,
    "เลื่อน ช่างแซก Touch": 1000, "เลื่อน ช่างแซก Infrared": 9000,
    "เลื่อน SlimLux ชุดแรก": 6900, "เลื่อน SlimLux บานเพิ่ม": 2250, "เลื่อน SlimLux ราง/ม.": 1100,
    "เลื่อน SlimLux สแกนหน้า": 2750, "เลื่อน SlimLux Touch": 100,
    "ประตูรั้ว": 10000, "ประตูรั้ว เดินไฟ": 2000,
  };
  for (const [k, v] of Object.entries(FILE)) ok(`${k} = ${v.toLocaleString()}`, PB.MOTOR[k] === v, String(PB.MOTOR[k]));
}

// ── ② ทุนตรงสูตรในชีต "คิดทุน <รุ่น>" ────────────────────────────────
console.log("\n═══ ② ทุนชุดออโต้ = สูตรในชีตคิดทุน ═══");
{
  // บานยก D51 = ราคา + ค่าส่ง (เจ้าของยืนยันเลข 6,200 / 14,200)
  const lift80 = C("banyok", { w: 150, h: 150, p: 1, form: "เดี่ยว", addons: { motor: "80" } });
  ok("บานยก 80 กก. = 6,200 (4,500 + ค่าส่ง 1,700)", addonCost(lift80, /บานยก/) === 6200, String(addonCost(lift80, /บานยก/)));
  const lift300 = C("banyok", { w: 150, h: 150, p: 1, form: "เดี่ยว", addons: { motor: "300" } });
  ok("บานยก 300 กก. = 14,200 (12,500 + ค่าส่ง 1,700)", addonCost(lift300, /บานยก/) === 14200, String(addonCost(lift300, /บานยก/)));
  // เฟี้ยมยกใช้หมวดเดียวกัน
  const fl = C("fold_lift", { w: 240, h: 240, p: 2, form: "2บาน: 2-0 พับข้างเดียว", addons: { motor: "300" } });
  ok("เฟี้ยมยกใช้ชุดเดียวกับบานยก = 14,200", addonCost(fl, /บานยก/) === 14200, String(addonCost(fl, /บานยก/)));

  // กระทุ้ง D54 = บาน×ราคา + ค่าส่ง(ครั้งเดียว) + อุปกรณ์พิเศษ 600 เมื่อโช็ค ≥2 บาน
  const a1 = C("awning", { w: 150, h: 100, p: 1, form: "เปิดบน", addons: { awn_auto: "choke50" } });
  ok("กระทุ้ง โช็ค50 1 บาน = 5,275 (3,575 + ค่าส่ง)", addonCost(a1, /./) === 5275, String(addonCost(a1, /./)));
  const a2 = C("awning", { w: 150, h: 100, p: 2, form: "เปิดบน", addons: { awn_auto: "choke50" } });
  ok("กระทุ้ง โช็ค50 2 บาน = 9,450 (3,575×2 + ค่าส่ง + พิเศษ 600)", addonCost(a2, /./) === 9450, String(addonCost(a2, /./)));
  const a3 = C("awning", { w: 150, h: 100, p: 2, form: "เปิดบน", addons: { awn_auto: "chain1" } });
  ok("โซ่ 2 บาน ไม่บวกอุปกรณ์พิเศษ = 5,500 (1,900×2 + ค่าส่ง)", addonCost(a3, /./) === 5500, String(addonCost(a3, /./)));

  // SMS D57 — Evecca = ชุด + สายพาน(กว้าง×2 ม.) + ค่าส่ง
  const ev = C("sms_slide", { w: 300, h: 200, p: 2, form: "2 บาน (SS)", addons: { slide_auto: { brand: "evecca" } } });
  ok("Evecca 3 ม. = 15,630 (13,480 + ส่ง 1,700 + สายพาน 75×6)", addonCost(ev, /Evecca/) === 15630, String(addonCost(ev, /Evecca/)));
  // ช่างแซก = (ชุด + ตาแมว + ราง/ม. + ออป) × MIN(บาน,3) · "เปิดคู่กลาง" = 1
  const cs2 = C("sms_slide", { w: 400, h: 200, p: 2, form: "2 บาน (SS)", addons: { slide_auto: { brand: "changsaek" } } });
  ok("ช่างแซก 2 บาน กว้าง 4 ม. = 25,600 ((8,000+1,000+3,800)×2)", addonCost(cs2, /./) === 25600, String(addonCost(cs2, /./)));
  const cs4 = C("sms_slide", { w: 400, h: 200, p: 4, form: "4 บาน (SSSS)", addons: { slide_auto: { brand: "changsaek" } } });
  ok("ช่างแซก 4 บาน = คูณสูงสุด 3 ชุด = 38,400", addonCost(cs4, /./) === 38400, String(addonCost(cs4, /./)));
  const csC = C("sms_slide", { w: 400, h: 200, p: 4, form: "เปิดคู่กลาง (SSSS)", addons: { slide_auto: { brand: "changsaek" } } });
  ok("ช่างแซก เปิดคู่กลาง = 1 ชุด = 12,800", addonCost(csC, /./) === 12800, String(addonCost(csC, /./)));

  // SlimLux D58 = ชุดแรก + บานเพิ่ม×(บาน−1) + ราง×กว้าง×บาน + (สแกนหน้า | Touch)
  const sl = C("slimlux", { w: 300, h: 200, p: 2, form: "2 บาน (SS)", addons: { slide_auto: { brand: "slimlux" } } });
  ok("SlimLux 2 บาน 3 ม. = 15,850 (6,900 + 2,250 + ราง 6,600 + Touch 100)", addonCost(sl, /./) === 15850, String(addonCost(sl, /./)));
  const slS = C("slimlux", { w: 300, h: 200, p: 2, form: "2 บาน (SS)", addons: { slide_auto: { brand: "slimlux", scan: true } } });
  ok("SlimLux เลือกสแกนหน้า = +2,650 จาก Touch", addonCost(slS, /./) - addonCost(sl, /./) === 2650, String(addonCost(slS, /./) - addonCost(sl, /./)));

  // บานเกล็ด · ระแนงหมุน (ไม่มีค่าส่ง)
  const bk = C("banklet", { w: 100, h: 150, p: 1, form: "เดี่ยว", addons: { banklet_motor: "yes" } });
  ok("บานเกล็ด มอเตอร์ = 1,800 (ไม่มีค่าส่ง)", addonCost(bk, /./) === 1800, String(addonCost(bk, /./)));
  const rOn = C("louver_rotate", { w: 200, h: 240, p: 1, form: "นอน" });
  const rOff = C("louver_rotate", { w: 200, h: 240, p: 1, form: "นอน", spec: { rnMotor: "ไม่เอา" } });
  ok("ระแนงหมุน ค่าตั้งต้น = มีมอเตอร์ (ตามไฟล์)", Math.round(rOn.cost.total - rOff.cost.total) === 1800, String(Math.round(rOn.cost.total - rOff.cost.total)));
}

// ── ③ ขาย = ทุน × กำไร% ────────────────────────────────────────────
console.log("\n═══ ③ ขายชุดออโต้ = ทุน × กำไร% (ชีตเขียน \"บวกเข้าทุน × กำไร%\") ═══");
{
  const r = C("banyok", { w: 150, h: 150, p: 1, form: "เดี่ยว", addons: { motor: "80" } });
  ok("บานยก 80: ขาย 12,400 = ทุน 6,200 × 2", addonSell(r, /บานยก/) === 12400, String(addonSell(r, /บานยก/)));
  const r70 = C("banyok", { w: 150, h: 150, p: 1, form: "เดี่ยว", profitPct: 70, addons: { motor: "80" } });
  ok("กำไร 70% → ขาย 10,600 (ไม่ตรึง ×2.5 / ขั้นต่ำ 6,000)", addonSell(r70, /บานยก/) === 10600, String(addonSell(r70, /บานยก/)));
  const bk = C("banklet", { w: 100, h: 150, p: 1, form: "เดี่ยว", addons: { banklet_motor: "yes" } });
  ok("บานเกล็ด: ขาย 3,600 (เดิมตรึงขั้นต่ำ 6,000)", addonSell(bk, /./) === 3600, String(addonSell(bk, /./)));
}

// ── ④ ขึ้นถูกหมวด — ห้ามขึ้นมั่ว ──────────────────────────────────
console.log("\n═══ ④ มอเตอร์ขึ้นตามประเภทบาน (ห้ามขึ้นมั่ว) ═══");
{
  const groups = (id) => [...new Set(autoSetsFor(PB, PRODUCTS[id]).map((m) => m.group))].join(",");
  const EXPECT = {
    banyok: "บานยก / เฟี้ยมยก", fold_lift: "บานยก / เฟี้ยมยก",
    roof_slide: "หลังคาเลื่อน", banklet: "บานเกล็ด 38.1", awning: "บานกระทุ้ง",
    sms_slide: "เลื่อน SMS/ยูโร", euro_slide: "เลื่อน SMS/ยูโร", slimlux: "SlimLux",
    gate: "ประตูรั้ว", louver_rotate: "ระแนงหมุน",
  };
  for (const [id, g] of Object.entries(EXPECT)) ok(`${id} → หมวด "${g}"`, groups(id) === g, groups(id) || "(ว่าง)");
  // รุ่นที่ชีตไม่มีมอเตอร์ ต้องไม่มีให้เลือกเลย
  for (const id of ["fixed", "open_door", "folding", "pcdoor", "velora", "shower", "roof", "louver", "handrail"])
    ok(`${id} ไม่มีมอเตอร์ให้เลือก (ชีตไม่มี)`, autoSetsFor(PB, PRODUCTS[id]).length === 0, groups(id));
  // ยี่ห้อชุดเลื่อนต้องไม่ข้ามรุ่น
  ok("SMS ไม่มี SlimLux ให้เลือก", !autoSetsFor(PB, PRODUCTS.sms_slide).some((m) => m.group === "SlimLux"));
  ok("SlimLux ไม่มี Evecca/ช่างแซก ให้เลือก", !autoSetsFor(PB, PRODUCTS.slimlux).some((m) => m.group === "เลื่อน SMS/ยูโร"));
  ok("ประตูรั้วไม่มีชุดเลื่อน SMS", !autoSetsFor(PB, PRODUCTS.gate).some((m) => /เลื่อน|SlimLux/.test(m.group)));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
