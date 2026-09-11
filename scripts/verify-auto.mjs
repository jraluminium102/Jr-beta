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
const NL = "\n";   // ขึ้นบรรทัดใหม่ (เลี่ยงพิมพ์ escape ตรง ๆ ในสคริปต์แก้ไฟล์)
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCost, autoSetsFor, motorSizeOk, pickMotorByWeight, MOTOR_ADDON_IDS } from "../src/lib/calculator40/engine.mjs";
import { applyBootstrap } from "../src/lib/calculator40/bootstrap.mjs";
const R39DATA = JSON.parse(fs.readFileSync("src/lib/calculator40/r39-data.json", "utf8"));

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
  const a1 = C("awning", { w: 130, h: 100, p: 1, form: "เปิดบน", addons: { awn_auto: "choke50" } });   // 130×100/บาน = อยู่ในช่วงโช้ค 50
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

// ── ③ ขายมอเตอร์ = "ขายขั้นต่ำ" ตามชีตราคาออโต้ (ไม่ผ่านกำไร) ──────────
//   เจ้าของสั่ง 5 ก.ย.69 "มอเตอร์คิดแยกกับการคูณกำไรรวม เป็นราคาขายเลย · แต่ให้แสดงราคาทุนด้วย"
console.log("\n═══ ③ ขายมอเตอร์ = ขายขั้นต่ำตามไฟล์ (กด +/- กำไร ราคาต้องนิ่ง) ═══");
{
  const r = C("banyok", { w: 150, h: 150, p: 1, form: "เดี่ยว", addons: { motor: "80" } });
  ok("บานยก 80: ขาย 25,000 (ขายขั้นต่ำตามไฟล์)", addonSell(r, /บานยก/) === 25000, String(addonSell(r, /บานยก/)));
  const r70 = C("banyok", { w: 150, h: 150, p: 1, form: "เดี่ยว", profitPct: 70, addons: { motor: "80" } });
  ok("บานยก 80: กำไร 70% ราคายังนิ่ง 25,000", addonSell(r70, /บานยก/) === 25000, String(addonSell(r70, /บานยก/)));
  const r300 = C("banyok", { w: 150, h: 150, p: 1, form: "เดี่ยว", addons: { motor: "300" } });
  ok("บานยก 300: ขาย 35,000", addonSell(r300, /บานยก/) === 35000, String(addonSell(r300, /บานยก/)));
  const bk = C("banklet", { w: 100, h: 150, p: 1, form: "เดี่ยว", addons: { banklet_motor: "yes" } });
  ok("มอเตอร์บานเกล็ด: ขาย 12,000", addonSell(bk, /./) === 12000, String(addonSell(bk, /./)));
}

// ── ④ ขึ้นถูกหมวด — ห้ามขึ้นมั่ว ──────────────────────────────────
console.log("\n═══ ④ มอเตอร์ขึ้นตามประเภทบาน (ห้ามขึ้นมั่ว) ═══");
{
  // "ออปชั่นร่วม" = เซนเซอร์กันฝน (เจ้าของสั่ง 4 ก.ย.69 ให้เลือกได้ทุกมอเตอร์ ยกเว้น SlimLux)
  //   ไม่ใช่หมวดมอเตอร์ของรุ่น → ตัดออกก่อนเทียบ แต่มีเทสของตัวเองด้านล่าง
  const groups = (id) => [...new Set(autoSetsFor(PB, PRODUCTS[id]).map((m) => m.group))].filter((g) => g !== "ออปชั่นร่วม").join(",");
  const EXPECT = {
    banyok: "บานยก / เฟี้ยมยก", fold_lift: "บานยก / เฟี้ยมยก",
    roof_slide: "หลังคาเลื่อน", banklet: "บานเกล็ด 38.1", awning: "บานกระทุ้ง",
    sms_slide: "เลื่อน SMS/ยูโร", euro_slide: "เลื่อน SMS/ยูโร", slimlux: "SlimLux",
    gate: "ประตูรั้ว", louver_rotate: "ระแนงหมุน",
  };
  for (const [id, g] of Object.entries(EXPECT)) ok(`${id} → หมวด "${g}"`, groups(id) === g, groups(id) || "(ว่าง)");
  // รุ่นที่ชีตไม่มีมอเตอร์ ต้องไม่มีให้เลือกเลย
  //   4 ก.ย.69: roof/roof_gable/roof_multi ออกจากรายการนี้ — เจ้าของสั่ง "ไม่มีมอเตอร์ให้เลือกในหลังคา" ให้ใส่เข้าไป
  //   10 ก.ย.69: velora ออกจากรายการนี้ — เจ้าของเพิ่มมอเตอร์ Kuangdi ลงชีต "ราคาออโต้" แถว 34-36 เอง
  for (const id of ["fixed", "open_door", "folding", "pcdoor", "shower", "louver", "handrail"])
    ok(`${id} ไม่มีมอเตอร์ให้เลือก (ชีตไม่มี)`, autoSetsFor(PB, PRODUCTS[id]).length === 0, groups(id));
  // ยี่ห้อชุดเลื่อนต้องไม่ข้ามรุ่น
  ok("SMS ไม่มี SlimLux ให้เลือก", !autoSetsFor(PB, PRODUCTS.sms_slide).some((m) => m.group === "SlimLux"));
  // ── SlimLux ต้องไม่ไปโผล่ในรุ่นอื่น รวมรุ่น R3.9 ที่ bootstrap สร้างให้ตอนรันจริง ──
  //   (เจ้าของท้วง 4 ก.ย.69 "บานเลื่อนรางบน เอาช้อยมอเตอร์ SlimLux ออก" — bootstrap ใส่ slide_auto
  //    ให้ทุกรุ่นที่ชื่อมีคำว่า "เลื่อน" โดยไม่จำกัดยี่ห้อ → UI โชว์ครบ 3 ยี่ห้อ)
  {
    const P2 = JSON.parse(JSON.stringify(PRODUCTS, (k, v) => (typeof v === "function" ? undefined : v)));
    applyBootstrap(P2, R39DATA);
    const bad = Object.entries(P2).filter(([id, p]) => (p.addons || []).includes("slide_auto")
      && (!Array.isArray(p.autoBrands) || (p.autoBrands.includes("slimlux") && id !== "slimlux")));
    ok("ทุกรุ่นที่มีชุดออโต้เลื่อน ต้องจำกัดยี่ห้อ + SlimLux เฉพาะรุ่น SlimLux",
      bad.length === 0, bad.map(([id, p]) => id + ":" + JSON.stringify(p.autoBrands ?? null)).slice(0, 6).join(" · "));
  }
  ok("SlimLux ไม่มี Evecca/ช่างแซก ให้เลือก", !autoSetsFor(PB, PRODUCTS.slimlux).some((m) => m.group === "เลื่อน SMS/ยูโร"));
  ok("ประตูรั้วไม่มีชุดเลื่อน SMS", !autoSetsFor(PB, PRODUCTS.gate).some((m) => /เลื่อน|SlimLux/.test(m.group)));
  // ── เซนเซอร์กันฝน (เจ้าของสั่ง 4 ก.ย.69 "เพิ่มเป็นออปชั่นให้เลือก ทุกมอเตอร์ ยกเว้น SlimLux") ──
  const hasSensor = (id) => (PRODUCTS[id].addons || []).includes("rain_sensor")
    || (PRODUCTS[id].addons || []).includes("slide_motor");   // ชุดหลังคาเลื่อนมีเซนเซอร์ในตัวเลือกอยู่แล้ว
  for (const id of ["banyok", "fold_lift", "banklet", "gate", "awning", "sms_slide", "euro_slide", "bar_slide",
                    "zipscreen", "roof", "roof_gable", "roof_multi", "roof_slide"])
    ok(`${id} เลือกเซนเซอร์กันฝนได้`, hasSensor(id), JSON.stringify(PRODUCTS[id].addons));
  ok("SlimLux ต้องไม่มีเซนเซอร์กันฝน (เจ้าของสั่งยกเว้น)", !hasSensor("slimlux"), JSON.stringify(PRODUCTS.slimlux.addons));
  ok("หลังคา (เพิง/จั่ว/หลายด้าน) เลือกมอเตอร์ได้แล้ว",
    ["roof", "roof_gable", "roof_multi"].every((id) => (PRODUCTS[id].addons || []).includes("slide_motor")));
  ok("เซนเซอร์กันฝนคิดทุน 1,100 ตามชีต", (PB.MOTOR["เซนเซอร์กันฝน"] ?? 0) === 1100, String(PB.MOTOR["เซนเซอร์กันฝน"]));

  // ── ของต่อพ่วงมอเตอร์ต้อง "ห้อยกับมอเตอร์" จริง (เจ้าของท้วง 4 ก.ย.69) ──
  //   ① ลำดับ: มอเตอร์ต้องมาก่อนเซนเซอร์เสมอ (ลำดับบนหน้าจอวิ่งตาม prod.addons ในหมวดเดียวกัน)
  //   ② ไม่เลือกมอเตอร์ = ห้ามคิดเงินเซนเซอร์ แม้ค่าจะค้างอยู่ในสูตรเดิม
  //   ③ มอเตอร์ที่ engine ปฏิเสธ (ยก 80 กก. เกินพื้นที่) ก็ไม่นับว่ามีมอเตอร์
  //   ดึงจากเอนจินตรง ๆ (เคยลอกไว้ พอเพิ่ม velora_motor เทสเลยแดงทั้งที่เรียงถูก)
  const MOTOR_IDS = MOTOR_ADDON_IDS;
  for (const [id, p] of Object.entries(PRODUCTS)) {
    const ads = p.addons || [];
    if (!ads.includes("rain_sensor")) continue;
    const iS = ads.indexOf("rain_sensor");
    const iM = Math.min(...MOTOR_IDS.map((m) => { const k = ads.indexOf(m); return k < 0 ? 99 : k; }));
    ok(`${id}: มอเตอร์มาก่อนเซนเซอร์`, iM < iS, JSON.stringify(ads));
  }
  const sensorLines = (id, addons, w = 300, h = 240) =>
    (computeCost(PB, PRODUCTS[id], { w, h, p: 2, glassType: "เขียว 6มม.", addons }).lines || [])
      .filter((l) => /เซนเซอร์กันฝน/.test(l.name || "")).length;
  for (const id of ["banyok", "fold_lift", "banklet", "awning", "sms_slide", "euro_slide", "bar_slide"])
    ok(`${id}: ไม่เลือกมอเตอร์ = ไม่คิดเงินเซนเซอร์`, sensorLines(id, { rain_sensor: "yes" }) === 0);
  ok("banyok: เลือกมอเตอร์แล้วเซนเซอร์คิดเงินได้", sensorLines("banyok", { motor: "300", rain_sensor: "yes" }) === 1);
  ok("banyok: มอเตอร์ 80 กก. เกินพื้นที่ (โดนปฏิเสธ) = ไม่คิดเงินเซนเซอร์",
    sensorLines("banyok", { motor: "80", rain_sensor: "yes" }) === 0);
  ok("banyok: มอเตอร์ 80 กก. ในพื้นที่ที่ใช้ได้ = คิดเงินเซนเซอร์ได้",
    sensorLines("banyok", { motor: "80", rain_sensor: "yes" }, 150, 100) === 1);
  ok("หลังคา: ไม่เลือกมอเตอร์ = ไม่มีทั้งมอเตอร์และเซนเซอร์",
    sensorLines("roof", { slide_motor: { kw: "none" }, rain_sensor: "yes" }) === 0);
  ok("ประตูรั้ว/ม่านซิป: มอเตอร์อยู่ในชุดเสมอ → เลือกเซนเซอร์ได้เลย",
    sensorLines("gate", { rain_sensor: "yes" }) === 1 && sensorLines("zipscreen", { rain_sensor: "yes" }) === 1);
  // ── มอเตอร์หลังคาเลื่อน: ราคาขายตายตัวตามไฟล์ ไม่ผ่านกำไร (ชีต "คิดทุน หลังคาเลื่อน" แถว 49-51 + หมายเหตุแถว 60) ──
  //   เจ้าของท้วง 4 ก.ย.69 "กด +- กำไรแล้วราคาดิ้น" — ของถูกคือนิ่งทุกกำไร% และนิ่งทุกขนาดยก
  {
    const mo = (o) => (computeCost(PB, PRODUCTS.roof_slide, { w: 400, h: 250, p: 1, glassType: "เขียว 6มม.", ...o }).lines || [])
      .filter((l) => /มอเตอร์หลังคาเลื่อน|เซนเซอร์กันฝน/.test(l.name || ""));
    const at = (pp, kw, count) => mo({ profitPct: pp, addons: { slide_motor: { kw, count } } });
    const amt = (rows, re) => (rows.find((l) => re.test(l.name)) || {}).amount ?? 0;
    for (const pp of [50, 80, 100, 150, 200])
      ok(`หลังคาเลื่อน กำไร ${pp}% → มอเตอร์ยังขาย 50,000 (ไม่ผ่านกำไร)`, amt(at(pp, "1500"), /มอเตอร์/) === 50000, String(amt(at(pp, "1500"), /มอเตอร์/)));
    // ขายขั้นต่ำแยกตามขนาดยก (ชีตราคาออโต้: 80 = 30,000 · 300 = 40,000 · 1500 = 45,000)
    for (const [kw, want] of [["80", 30000], ["300", 40000], ["1500", 50000]])
      ok(`หลังคาเลื่อน ยก ${kw} กก. → ขาย ${want.toLocaleString()}`, amt(at(100, kw), /มอเตอร์/) === want, String(amt(at(100, kw), /มอเตอร์/)));
    ok("หลังคาเลื่อน 2 ตัว → 40,000 + 25,000", amt(at(100, "300", 2), /มอเตอร์/) === 65000, String(amt(at(100, "300", 2), /มอเตอร์/)));
    ok("หลังคาเลื่อน 3 ตัว → 40,000 + 25,000×2", amt(at(100, "300", 3), /มอเตอร์/) === 90000);
    ok("เซนเซอร์กันฝน (หลังคา) ขาย 2,000 ตายตัว", amt(at(100, "1500"), /เซนเซอร์/) === 2000);
    // ทุนต้องเข้าทุนรวมตามปกติ และต้องนิ่งเมื่อเปลี่ยนกำไร
    const cost = (pp) => computeCost(PB, PRODUCTS.roof_slide, { w: 400, h: 250, p: 1, glassType: "เขียว 6มม.", profitPct: pp, addons: { slide_motor: { kw: "1500" } } }).cost.total;
    ok("ทุนมอเตอร์ยังเข้าทุนรวม (ไม่ใช่ขายฟรี)", cost(100) > computeCost(PB, PRODUCTS.roof_slide, { w: 400, h: 250, p: 1, glassType: "เขียว 6มม.", addons: {} }).cost.total);
    ok("กด +/- กำไร ทุนรวมต้องไม่ดิ้น", cost(50) === cost(200), cost(50) + " vs " + cost(200));
    // ป้ายกำกับระบบสั่งงาน (เจ้าของสั่งให้เขียนลงใบเสนอ)
    const names = (id, o) => (computeCost(PB, PRODUCTS[id], { w: 300, h: 240, p: 2, glassType: "เขียว 6มม.", ...o }).lines || []).map((l) => l.name || "").join(" | ");
    ok("Evecca เขียนระบบสั่งงาน รีโมท+จอควบคุม+สมาร์ทโฮม",
      names("sms_slide", { addons: { slide_auto: { brand: "evecca" } } }).includes("ระบบสั่งงาน: รีโมท + จอควบคุม + สมาร์ทโฮม"));
    ok("บานกระทุ้ง เขียนระบบสั่งงาน รีโมท",
      /ระบบสั่งงาน: รีโมท/.test(names("awning", { w: 240, h: 120, p: 2, addons: { awn_auto: "choke50" } })));
    ok("หลังคาเลื่อน เขียนระบบสั่งงาน รีโมท", /ระบบสั่งงาน: รีโมท/.test(names("roof_slide", { addons: { slide_motor: { kw: "1500" } } })));
    ok("มอเตอร์หลังคาเลื่อนไม่มีคำว่า 'ยก' ในชื่อแล้ว", !/มอเตอร์หลังคาเลื่อน ยก/.test(names("roof_slide", { addons: { slide_motor: { kw: "1500" } } })));
    // ระบบสั่งงาน SlimLux — ไฟล์เขียน "บังคับเลือก 1" · เจ้าของยืนยัน 10 ก.ย.69
    //   (กลับคำสั่ง 4 ก.ย.69 ที่เคยให้เลือกทั้งสอง — กลับมาตามไฟล์)
    const sl = (o) => names("slimlux", { addons: { slide_auto: { brand: "slimlux", ...o } } });
    const one = (t) => (/สแกนหน้า/.test(t) ? 1 : 0) + (/Touch Switch/.test(t) ? 1 : 0);
    ok("SlimLux: ติ๊กทั้งคู่ → ได้อย่างเดียว (สแกนหน้าชนะ)",
      one(sl({ touch: true, scan: true })) === 1 && /สแกนหน้า/.test(sl({ touch: true, scan: true })));
    ok("SlimLux: สแกนหน้าอย่างเดียว", one(sl({ scan: true })) === 1 && /สแกนหน้า/.test(sl({ scan: true })));
    ok("SlimLux: ทัชสวิชอย่างเดียว", one(sl({ touch: true })) === 1 && /Touch Switch/.test(sl({ touch: true })));
    ok("SlimLux: ไม่เลือกอะไร = ได้ทัชสวิช", one(sl({})) === 1 && /Touch Switch/.test(sl({})));
  }

  // ── รุ่นที่ "มีมอเตอร์ในชุด" แต่เลือกแบบไม่ใช้มอเตอร์ได้ ต้องไม่มีของต่อพ่วงเหลือค้าง ──
  const lineNames = (id, o) => (computeCost(PB, PRODUCTS[id], { w: 400, h: 180, p: 1, ...o }).lines || []).map((l) => l.name || "");
  {
    const g = lineNames("gate", { spec: { drive: "มือผลัก" }, addons: { rain_sensor: "yes", gate_motor: 2 } });
    ok("ประตูรั้วมือผลัก: ไม่มีมอเตอร์ในชุด → ไม่มีเซนเซอร์", !g.some((n) => /เซนเซอร์กันฝน/.test(n)), g.join(" | "));
    ok("ประตูรั้วมือผลัก: เพิ่มมอเตอร์ไม่ได้", !g.some((n) => /มอเตอร์/.test(n)), g.join(" | "));
    const z = lineNames("zipscreen", { w: 300, h: 240, motor: "manual", addons: { rain_sensor: "yes" } });
    ok("ม่านซิปมือดึงล้วน: ไม่มีเซนเซอร์", !z.some((n) => /เซนเซอร์กันฝน/.test(n)), z.join(" | "));
  }
}

// ── ⑮ SlimLux — ราคาเส้นตามสี (เจ้าของเคาะ 10 ก.ย.69) ──────────────
//   ราคาในสูตรเดิม = สีมิว (ยังไม่อบสี) → อบขาว/อบดำ/เทาซาฮาร่า ใช้ราคาตามไฟล์
//   ⚠ รหัสเว็บ/สโตร์ขึ้นต้น XSW/OPK — ไฟล์เขียน WM-K* (คนละชุด) จับคู่ด้วยน้ำหนัก
console.log(NL + "═══ ⑮ SlimLux — ราคาเส้นตามสี ═══");
{
  const BAKED = { "OPK-A201-40": 1233.8, "OPK-A202-40": 775, "OPK-A203-40": 429, "OPK-A204-40": 454,
    "XSW40008": 1414.8, "XSW400013": 132.2, "XSW400023": 223.12 };
  for (const key of ["white", "black", "sahara"])
    for (const [code, want] of Object.entries(BAKED))
      ok("ราคาอบ " + key + " " + code + " = " + want, (PB.ALUCOLOR_KEY[key] || {})[code] === want, String((PB.ALUCOLOR_KEY[key] || {})[code]));
  const S = (ck, bake) => computeCost(PB, PRODUCTS.slimlux,
    { w: 200, h: 240, p: 2, form: "อิสระ", glassType: "เทมเปอร์ 6มม.", color: bake, colorKey: ck, spec: { slHandle: "มือจับล็อค" } });
  const wh = S("white", "white"), sp = S("special", "special");
  // 11 ก.ย.69: ชีต "คิดทุน SlimLux" C12–C20 บวกค่าอบเรตเทาทุกเส้น (ขาว/ดำ/เทา) — เส้นที่ใช้ราคาอบสำเร็จจากไฟล์ (7 รหัส) ไม่บวกซ้ำ
  //   เส้นดิบที่ไม่มีราคาอบ (กล่อง/ฉาก/บังใบ) → ค่าอบ 100/กก. × กก.ของเส้นพวกนั้น
  const rawKg = (wh.lines || []).filter((l) => l.cat === "alu" && !/\(อบขาว/.test(l.name)).reduce((s, l) => s + l.qty * (l.kg || 0), 0);
  ok("อบขาว: เส้นราคาไฟล์ไม่บวกค่าอบซ้ำ · เส้นดิบบวกเรตเทา 100/กก.", rawKg > 0 && Math.abs(wh.cost.bake - 100 * rawKg) <= 1, wh.cost.bake + " vs " + (100 * rawKg).toFixed(2));
  ok("อบขาว: ทุนสูงกว่าเดิม (เดิมคิดราคามิว)", wh.cost.total > 9000, String(wh.cost.total));
  ok("สีอื่น (อบพิเศษ): ยังคิดค่าอบตามปกติ", sp.cost.bake > 0, String(sp.cost.bake));
  ok("สีอบพิเศษแพงกว่าอบขาว", sp.cost.total > wh.cost.total);
  // น้ำหนักต้องตรงกับที่ไฟล์เขียน (จับคู่ WM ↔ XSW ด้วยน้ำหนัก)
  for (const [xsw, wm] of [["OPK-A201-40", "WM-K04"], ["OPK-A202-40", "WM-K01"], ["OPK-A203-40", "WM-K02"],
    ["OPK-A204-40", "WM-K03"], ["XSW40008", "WM-K15"], ["XSW400013", "WM-K20"]])
    ok("น้ำหนัก " + xsw + " = " + wm, Math.abs(PB.ALUWEIGHT[xsw] - PB.ALUWEIGHT[wm]) < 0.02,
      PB.ALUWEIGHT[xsw] + " vs " + PB.ALUWEIGHT[wm]);

  // ค่าเปิดตู้อบ — เจ้าของเคาะ 10 ก.ย.69 "บวกสีขาวดำด้วย เฉพาะ SlimLux Velora
  //   เพราะเราซื้อมาเป็นสีมิว" → prod.millBar
  const oven = (id, ck, bk, o) => computeCost(PB, PRODUCTS[id],
    { w: 200, h: 240, p: 2, glassType: "เทมเปอร์ 6มม.", color: bk, colorKey: ck, ...(o || {}) }).cost.openOven;
  ok("SlimLux อบขาว: คิดค่าเปิดตู้อบ 2,000", oven("slimlux", "white", "white", { form: "อิสระ" }) === 2000);
  ok("SlimLux อบดำ: คิดค่าเปิดตู้อบ 2,000", oven("slimlux", "black", "white", { form: "อิสระ" }) === 2000);
  ok("Velora อบขาว: คิดค่าเปิดตู้อบ 2,000", oven("velora", "white", "white") === 2000);
  ok("SlimLux อบพิเศษ: ยังคิดเหมือนเดิม", oven("slimlux", "special", "special", { form: "อิสระ" }) === 2000);
  // รุ่นอื่นซื้อเส้นอบขาวมาแล้ว — ห้ามโดนด้วย
  for (const id of ["sms_slide", "euro_slide", "open_door", "fixed", "banyok"])
    ok(id + " อบขาว: ไม่คิดค่าเปิดตู้อบ", oven(id, "white", "white", { form: PRODUCTS[id].defForm }) === 0,
      String(oven(id, "white", "white", { form: PRODUCTS[id].defForm })));
}

// ── ⑭ ห้องกระจก G6 — ช่องกำไรค่าผลิต/ค่าติดตั้ง ต้องมีผลจริง ────
//   เจ้าของจับได้ 10 ก.ย.69 "ลากยังไงราคาก็ไม่ขยับ" — RoomComposer ส่งแต่ profitPct ตัวเดียว
//   และไม่เคยส่ง profitManual → ทุกบานใช้สูตรตามไฟล์เสมอ ช่อง % เป็นของตาย
console.log(NL + "═══ ⑭ ห้องกระจก G6 — กำไร 3 ก้อนต้องมีผล ═══");
{
  const M = (mat, prod, inst) => computeCost(PB, PRODUCTS.fixed,
    { w: 150, h: 200, p: 1, glassType: "เขียว 6มม.", profitManual: true, profitMat: mat, profitProd: prod, profitInst: inst });
  const base = M(100, 100, 200);
  ok("ขยับ % ค่าผลิต → ก้อนค่าผลิตขยับ", M(100, 300, 200).sell.parts.prod > base.sell.parts.prod);
  ok("ขยับ % ค่าผลิต → ก้อนค่าติดตั้งนิ่ง", M(100, 300, 200).sell.parts.inst === base.sell.parts.inst);
  ok("ขยับ % ค่าติดตั้ง → ก้อนค่าติดตั้งขยับ", M(100, 100, 500).sell.parts.inst > base.sell.parts.inst);
  ok("ขยับ % ค่าติดตั้ง → ก้อนค่าผลิตนิ่ง", M(100, 100, 500).sell.parts.prod === base.sell.parts.prod);

  // ซอร์ส: นับจำนวนครั้งด้วย split (ไม่ใช้ regex — อ่านง่ายกว่า/พังยากกว่า)
  const cnt = (t, k) => t.split(k).length - 1;
  const rc = fs.readFileSync("src/components/calculator40/RoomComposer.tsx", "utf8");
  ok("RoomComposer: ทุก computeCost ส่งกำไร 3 ก้อน",
    cnt(rc, "computeCost(") > 0 && cnt(rc, "profitManual: true") >= cnt(rc, "computeCost("),
    "computeCost " + cnt(rc, "computeCost(") + " จุด · ส่งกำไร " + cnt(rc, "profitManual: true"));
  // นับเป็นรายบรรทัด — ทุกบรรทัดที่เรียก panePrice ต้องมีกำไรต่อท้ายอาร์กิวเมนต์
  {
    const pp = rc.split(NL).filter((l) => l.includes("panePrice("));
    ok("RoomComposer: panePrice ทุกจุดส่งกำไรต่อ",
      pp.length > 0 && pp.every((l) => l.includes(", pf)") || l.includes(", profitOpt)")),
      pp.length + " จุด · ส่งต่อ " + pp.filter((l) => l.includes(", pf)") || l.includes(", profitOpt)")).length);
  }
  ok("RoomComposer: ส่ง profitOpt ต่อให้คอมโพเนนต์ลูกครบ",
    cnt(rc, "profitPct={profitPct}") === cnt(rc, "profitOpt={profitOpt}"),
    cnt(rc, "profitPct={profitPct}") + " vs " + cnt(rc, "profitOpt={profitOpt}"));
  const cc = fs.readFileSync("src/components/Calculator40Client.tsx", "utf8");
  // ทั้งห้องกระจก (G6) และผสมบาน (G1) ต้องได้กำไร 3 ก้อน — บั๊กเดียวกัน
  ok("หน้าคิดราคา: ส่งกำไร 3 ก้อนให้ห้องกระจก + ผสมบานครบ",
    cnt(cc, "<RoomComposer") + cnt(cc, "<SubPanesSection") === cnt(cc, "profitOpt={{ manual: profitManual"),
    (cnt(cc, "<RoomComposer") + cnt(cc, "<SubPanesSection")) + " vs " + cnt(cc, "profitOpt={{ manual: profitManual"));
  ok("ผสมบาน (G1): subPrice ส่งกำไร 3 ก้อนต่อ",
    cnt(cc, "subPrice(") === cnt(cc, "manual: profitManual, edit: profitEdit, mat: profitPct"),
    cnt(cc, "subPrice(") + " จุด");
}

// ── ⑬ มอเตอร์ Velora บานเปิดสลิม (Kuangdi) — ชีตราคาออโต้ แถว 34-36 ──
//   เจ้าของเพิ่มลงไฟล์เอง 10 ก.ย.69 → ทุน 6,800/บาน + ค่าส่ง 1,700 · ขายขั้นต่ำ 20,000/บาน
console.log("\n═══ ⑬ มอเตอร์ Velora (Kuangdi) ═══");
{
  const V = (o) => computeCost(PB, PRODUCTS.velora, { w: 220, h: 200, glassType: "เทมเปอร์ใส 6มม.", ...o });
  const ln = (r, re) => (r.lines || []).find((l) => re.test(l.name || "")) || {};

  ok("ราคาตรงไฟล์: ทุน 6,800/บาน", PB.MOTOR["Velora Kuangdi"] === 6800, String(PB.MOTOR["Velora Kuangdi"]));
  ok("ราคาตรงไฟล์: ค่าส่ง 1,700", PB.MOTOR["Velora ค่าส่ง"] === 1700);
  ok("ราคาตรงไฟล์: ขายขั้นต่ำ 20,000/บาน", PB.MOTORSELL["Velora บานเปิดสลิม"] === 20000);

  const m1 = V({ p: 1, addons: { velora_motor: {} } }), m2 = V({ p: 2, addons: { velora_motor: {} } });
  ok("1 บาน → ขาย 20,000 (ไฟล์)", ln(m1, /ชุดออโต้ Velora/).amount === 20000, String(ln(m1, /Velora/).amount));
  ok("2 บาน → ขาย 40,000 (ไฟล์)", ln(m2, /ชุดออโต้ Velora/).amount === 40000, String(ln(m2, /Velora/).amount));
  ok("ทุน 1 บาน = 8,500 (6,800 + ค่าส่ง)", ln(m1, /ชุดออโต้ Velora/).cost === 8500, String(ln(m1, /Velora/).cost));
  ok("ทุน 2 บาน = 15,300 (ค่าส่งครั้งเดียว)", ln(m2, /ชุดออโต้ Velora/).cost === 15300, String(ln(m2, /Velora/).cost));
  ok("มอเตอร์ขายฟิก ไม่ผ่านกำไร", ln(m2, /ชุดออโต้ Velora/).fixedSell === true);

  ok("ไม่เลือกระบบสั่งงาน = ได้ทัชสวิช", !!ln(m1, /Touch Switch/).amount);
  const sc = V({ p: 2, addons: { velora_motor: { scan: true } } });
  ok("เลือกสแกนหน้า → ไม่ได้ทัชสวิชซ้ำ", !!ln(sc, /สแกนหน้า/).amount && !ln(sc, /Touch Switch/).amount);
  const both = V({ p: 2, addons: { velora_motor: { scan: true, touch: true } } });
  ok("ติ๊กทั้งคู่ → ได้อย่างเดียว (บังคับเลือก 1 ตามไฟล์)", !!ln(both, /สแกนหน้า/).amount && !ln(both, /Touch Switch/).amount);

  // ออปชั่นลูก: เซนเซอร์ต้องมีมอเตอร์ก่อน
  const noM = V({ p: 1, addons: { rain_sensor: "yes" } });
  ok("ไม่มีมอเตอร์ → ไม่มีเซนเซอร์กันฝน", !(noM.lines || []).some((l) => l.cat === "addon" && /เซนเซอร์/.test(l.name || "")));
  const wS = V({ p: 1, addons: { velora_motor: {}, rain_sensor: "yes" } });
  ok("มีมอเตอร์ → เซนเซอร์ขึ้นได้ 2,000", ln(wS, /เซนเซอร์/).amount === 2000);
  ok("มอเตอร์มาก่อนเซนเซอร์ในรายการออปชั่น",
    PRODUCTS.velora.addons.indexOf("velora_motor") < PRODUCTS.velora.addons.indexOf("rain_sensor"));

  // ไม่ไปโดนรุ่นอื่น (เคยแก้ผิดไปลง pcdoor มาก่อน)
  ok("PC Door ไม่มีมอเตอร์ Velora ติดไป", !PRODUCTS.pcdoor.addons.includes("velora_motor"), JSON.stringify(PRODUCTS.pcdoor.addons));
  ok("PC Door ออปชั่นครบเหมือนเดิม", PRODUCTS.pcdoor.addons.includes("digihandle") && PRODUCTS.pcdoor.addons.length === 7);
}

// ── ⑧ น้ำหนักบาน + เลือกมอเตอร์อัตโนมัติ ─────────────────────────────
//   เจ้าของสั่ง 8 ก.ย.69 "คำนวณ นน.บาน แล้วให้เว็บเลือกออโต้ให้ได้ไหม"
//   น้ำหนัก = อลู(ยาวตัดจริง × กก./เส้น ÷ ความยาวเส้น) + กระจก(พื้นที่ × ความหนา × 2.5)
console.log("\n═══ ⑧ น้ำหนักบาน → เลือกขนาดมอเตอร์เอง ═══");
{
  const W = (id, o) => computeCost(PB, PRODUCTS[id], { glassType: "เขียว 6มม.", ...o });
  const mline = (r) => (r.lines || []).find((l) => /ออโต้บานยก|มอเตอร์หลังคาเลื่อน/.test(l.name || "")) || {};
  const warn = (r) => (r.lines || []).filter((l) => l.cat === "warn").map((l) => l.name).join(" | ");

  // กระจกเขียว 6 มม. 1 ตร.ม. = 15 กก. เป๊ะ (2.5 × 6)
  const g1 = W("fixed", { w: 100, h: 100, p: 1 });
  ok("กระจก 6 มม. 1 ตร.ม. = 15 กก.", g1.weight.glass === 15, String(g1.weight.glass));
  const g2 = W("fixed", { w: 100, h: 100, p: 1, glassType: "ลามิเนต 5+5 ฟิล์ม 0.38" });
  ok("ลามิเนต 5+5 = กระจก 10 มม. → 25 กก.", g2.weight.glass === 25 && g2.weight.glassMM === 10, g2.weight.glass + " / " + g2.weight.glassMM);
  const g3 = W("fixed", { w: 100, h: 100, p: 1, glassType: "อินซูเลท 6+6+6มม." });
  ok("อินซูเลท 6+6+6 = เนื้อกระจก 12 มม. (ไม่นับช่องอากาศ)", g3.weight.glassMM === 12, String(g3.weight.glassMM));

  // น้ำหนักต้องนิ่งเมื่อเปลี่ยนกำไร (เป็นสเปค ไม่ใช่ราคา)
  ok("น้ำหนักไม่ขยับตามกำไร", W("banyok", { w: 200, h: 200, p: 1, profitPct: 50 }).weight.total === W("banyok", { w: 200, h: 200, p: 1, profitPct: 200 }).weight.total);

  // เลือกอัตโนมัติ
  const small = W("banyok", { w: 150, h: 150, p: 1, addons: { motor: "auto" } });
  ok("บานยกเล็ก (" + small.weight.total + " กก.) → เลือก 80 กก.", /บานยก 80 กก/.test(mline(small).name || ""), mline(small).name || warn(small));
  const big = W("banyok", { w: 300, h: 250, p: 1, addons: { motor: "auto" } });
  ok("บานยกใหญ่ (" + big.weight.total + " กก.) → เลือก 300 กก.", /บานยก 300 กก/.test(mline(big).name || ""), mline(big).name || warn(big));
  ok("เลือกอัตโนมัติแล้วบอกน้ำหนักที่ใช้ตัดสินใจด้วย", /เลือกอัตโนมัติจากน้ำหนักบาน/.test(mline(big).name || ""), mline(big).name || "");

  // เลือกเองแล้วเกินพิกัด = เตือน ไม่คิดเงิน
  const over = W("banyok", { w: 300, h: 250, p: 1, addons: { motor: "80" } });
  ok("เลือก 80 กก. เองแต่บานหนักเกิน → เตือน ไม่คิดเงิน", !mline(over).amount && /รับไม่ไหว/.test(warn(over)), warn(over));

  // หนักเกินตัวใหญ่สุด = เตือน ไม่เดา
  const huge = W("fold_lift", { w: 700, h: 280, p: 6, addons: { motor: "auto" } });
  ok("หนักเกิน 300 กก. → เตือน ไม่เลือกให้มั่ว", /เกินมอเตอร์ตัวใหญ่สุด/.test(warn(huge)), warn(huge));

  // 🐞 QA 8 ก.ย.69 #1 — แผ่นแทนกระจก (คอมโพสิต/ลูกฟูก/เกล็ด Z) ไฟล์ไม่มีน้ำหนัก → ต้องเตือน ไม่ใช่นับ 0 เงียบ
  const pan = W("banyok", { w: 200, h: 250, p: 1, glassType: "แผ่นคอมโพสิต", addons: { motor: "auto" } });
  ok("แผ่นคอมโพสิต: ขึ้นเตือนว่ายังไม่มีน้ำหนัก", (pan.weight.missing || []).some((m) => /แผ่นคอมโพสิต/.test(m)), JSON.stringify(pan.weight.missing));
  ok("แผ่นคอมโพสิต: ไม่เลือกมอเตอร์ให้มั่ว", !mline(pan).amount && /น้ำหนักยังไม่ครบ/.test(warn(pan)), warn(pan));

  // 🐞 QA 8 ก.ย.69 #2 — auto เลือกไม่สำเร็จ = ไม่มีมอเตอร์ → เซนเซอร์กันฝนต้องไม่โผล่ทั้ง engine และ UI
  const noW = W("banyok", { w: 200, h: 200, p: 1, glassType: "กระจกเงาทอง", addons: { motor: "auto", rain_sensor: "yes" } });
  ok("auto ล้มเหลว: ไม่มีบรรทัดเซนเซอร์กันฝน (engine)", !(noW.lines || []).some((l) => l.cat === "addon" && /เซนเซอร์กันฝน/.test(l.name || "")), warn(noW));
  ok("auto ล้มเหลว: UI ก็ต้องไม่โชว์เซนเซอร์ (motorSizeOk เดียวกัน)", motorSizeOk("auto", noW.weight, [80, 300]) === false);
  const okW = W("banyok", { w: 200, h: 200, p: 1, addons: { motor: "auto", rain_sensor: "yes" } });
  ok("auto สำเร็จ: เซนเซอร์กันฝนขึ้นตามปกติ", (okW.lines || []).some((l) => l.cat === "addon" && /เซนเซอร์กันฝน/.test(l.name || "")));
  ok("auto สำเร็จ: UI เห็นตรงกับ engine", motorSizeOk("auto", okW.weight, [80, 300]) === true);
  ok("เลือก 80 เองแต่เกินพิกัด: UI เห็นตรงกับ engine (ไม่ถือว่ามีมอเตอร์)", motorSizeOk("80", big.weight, [80, 300]) === false);

  // เผื่อความปลอดภัย 80% ของพิกัด (เจ้าของสั่ง 8 ก.ย.69 "เผื่อ")
  const mid = W("banyok", { w: 180, h: 180, p: 1, addons: { motor: "auto" } });
  ok("บาน " + mid.weight.total + " กก. เกิน 80% ของ 80 (=64) → ขยับขึ้น 300", /บานยก 300 กก/.test(mline(mid).name || ""), mline(mid).name || warn(mid));
  ok("เลือก 80 เองตอนน้ำหนัก 65.94 → เตือน (เผื่อแล้วรับได้ 64)", /รับไม่ไหว/.test(warn(W("banyok", { w: 180, h: 180, p: 1, addons: { motor: "80" } }))));
  ok("ป้ายบอก % เผื่อด้วย", pickMotorByWeight(small.weight, [80, 300]).pct === 80, String(pickMotorByWeight(small.weight, [80, 300]).pct));

  // แผ่นมุงหลังคา — เจ้าของให้น้ำหนัก 7 ตัว 8 ก.ย.69 (เมทัลชีทขอติดไว้ก่อน)
  const rv = W("roof_slide", { w: 400, h: 250, p: 1, material: "ไวนิล", addons: { slide_motor: { kw: "auto" } } });
  ok("หลังคาไวนิล: คิดน้ำหนักแผ่นได้ (7 กก./ตร.ม.)", rv.weight.sheet > 0, String(rv.weight.sheet));
  ok("หลังคาเลื่อน: 'น้ำหนักที่ต้องยก' = เฉพาะส่วนเลื่อน ไม่ใช่ทั้งผืน", rv.weight.load > 0 && rv.weight.load < rv.weight.total, rv.weight.load + " / " + rv.weight.total);
  const mt = W("roof_slide", { w: 400, h: 250, p: 1, material: "เมทัลชีท EPS 2 นิ้ว PVC", addons: { slide_motor: { kw: "auto" } } });
  ok("เมทัลชีท: ยังไม่มีน้ำหนัก → เตือนให้เลือกมอเตอร์เอง", (mt.weight.missing || []).some((m) => /เมทัลชีท/.test(m)), JSON.stringify(mt.weight.missing).slice(0, 90));
  ok("หลังคาไวนิล: คิดน้ำหนักโครงได้ (BOX_KG ครบ 9 ก.ย.69)", rv.weight.box > 0, String(rv.weight.box));
  ok("หลังคาไวนิล: ข้อมูลครบ → เลือกมอเตอร์ให้ได้จริง", /มอเตอร์หลังคาเลื่อน \d+ กก/.test(mline(rv).name || ""), mline(rv).name || warn(rv));
  // น้ำหนักโครงต้องคิดตาม "ยาวตัดจริง" ไม่ใช่ตามเส้นที่ซื้อ (จันทันบานเลื่อนยาว 1.5 ม. ไม่ใช่ 6 ม.)
  //   เลื่อน 150×150 ไวนิล: แผ่น 2.25 ตร.ม. × 7 = 15.75 กก. · โครง 17.05 กก. → ลากรวม 32.8 กก.
  ok("น้ำหนักโครงคิดตามยาวตัดจริง ไม่ใช่ 6 ม./เส้น", Math.abs(rv.weight.load - 32.8) < 0.05, String(rv.weight.load));

  // 🐞 QA 8 ก.ย.69 — น้ำหนักโครงกล่องต้องนับเฉพาะรุ่นที่ประกาศ weightSpec
  //   ไม่งั้นวันที่เจ้าของเติม BOX_KG น้ำหนักจะแอบไปโผล่ที่หลังคาทรงอื่น (รางน้ำอลูใช้ box เดียวกัน)
  {
    const PB2 = JSON.parse(JSON.stringify(PB));
    PB2.BOX_KG = { "กล่อง|4": 5, "กล่อง|1.6X4": 6 };
    const box = (id) => computeCost(PB2, PRODUCTS[id], { w: 400, h: 250, p: 1, glassType: "เขียว 6มม.", material: "ไวนิล" }).weight.box;
    ok("เติม BOX_KG แล้ว: หลังคาเลื่อนนับน้ำหนักโครงได้", box("roof_slide") > 0, String(box("roof_slide")));
    for (const id of ["roof", "roof_gable", "glasshouse"])
      ok("เติม BOX_KG แล้ว: " + id + " ต้องไม่นับตาม (ไม่มี weightSpec)", box(id) === 0, String(box(id)));
  }

  // หลังคาเลื่อน: โครงกล่องยังไม่มีน้ำหนักในไฟล์ → ห้ามเดา
  ok("หลังคาเลื่อน: น้ำหนักไม่ครบ (เมทัลชีท) → ไม่เลือกให้ ขึ้นเตือนแทน", /น้ำหนักยังไม่ครบ/.test(warn(mt)), warn(mt));
  ok("หลังคาเลื่อน: เลือกขนาดเองยังใช้ได้ตามปกติ", (W("roof_slide", { w: 400, h: 250, p: 1, addons: { slide_motor: { kw: "300" } } }).lines || []).some((l) => /มอเตอร์หลังคาเลื่อน 300/.test(l.name || "")));
}

// ── ⑨ มอเตอร์บานกระทุ้ง — เลือกรุ่นตามขนาด กว้าง×ยื่น ต่อบาน (เจ้าของอัปเดต 9 ก.ย.69) ──
console.log("\n═══ ⑨ มอเตอร์บานกระทุ้ง — รุ่น/ขนาดที่ทำได้ ═══");
{
  const A = (w, h, p, sel) => computeCost(PB, PRODUCTS.awning, { w, h, p, glassType: "เขียว 6มม.", addons: { awn_auto: sel } });
  const mo = (r) => (r.lines || []).find((l) => /ชุดออโต้กระทุ้ง/.test(l.name || "")) || {};
  const wn = (r) => (r.lines || []).filter((l) => l.cat === "warn").map((l) => l.name).join(" | ");

  // ราคาขายขั้นต่ำต่อบาน (ฟิกตามไฟล์)
  for (const [k, want] of [["choke30", 20000], ["choke50", 20000], ["choke80", 22000], ["chain1", 18000], ["chain2", 22000]])
    ok("ขาย " + k + " = " + want.toLocaleString() + "/บาน", PB.AWN_MOTOR[k].sell === want, String(PB.AWN_MOTOR[k].sell));

  // เลือกอัตโนมัติตามขนาด (ไล่ตาม AWN_MOTOR_ORDER — เล็กไปใหญ่ โช้คก่อนโซ่)
  for (const [w, h, p, want] of [
    [100, 100, 1, "โช้ค เปิด 30"],     // 100×100 — โช้ค 30 พอดี
    [80, 120, 1, "โช้ค เปิด 50"],      // สูง 120 เกินโช้ค 30 (max 110)
    [180, 180, 1, "โช้ค เปิด 80"],     // ใหญ่เกินโช้ค 50
    [200, 100, 1, "โซ่คู่ เปิด 40"],   // กว้าง 200 เตี้ย 100 — โช้คไม่ได้ (ต้องสูง ≥115)
    [60, 60, 1, "โซ่เดี่ยว 50"],       // เตี้ย 60 — มีแต่โซ่เดี่ยวที่ต่ำสุด 55
  ]) ok("บาน " + w + "×" + h + " → " + want, (mo(A(w, h, p, "auto")).name || "").includes(want), mo(A(w, h, p, "auto")).name || wn(A(w, h, p, "auto")).slice(0, 60));

  // เกินทุกรุ่น = เตือน ไม่คิดเงิน
  ok("บาน 50×50 เล็กเกินทุกรุ่น → เตือน ไม่คิดเงิน", !mo(A(50, 50, 1, "auto")).amount && /ไม่มีรุ่นไหนทำได้/.test(wn(A(50, 50, 1, "auto"))), wn(A(50, 50, 1, "auto")).slice(0, 60));
  ok("บาน 300×300 ใหญ่เกินทุกรุ่น → เตือน", !mo(A(300, 300, 1, "auto")).amount && /ไม่มีรุ่นไหนทำได้/.test(wn(A(300, 300, 1, "auto"))));

  // เลือกรุ่นเองแล้วขนาดไม่เข้าเกณฑ์ = เตือน + บอกรุ่นที่ใช้ได้
  const bad = A(100, 100, 1, "choke80");
  ok("เลือกโช้ค 80 เองแต่บานเล็กไป → เตือน ไม่คิดเงิน", !mo(bad).amount && /ทำได้ 90×115/.test(wn(bad)), wn(bad).slice(0, 70));
  ok("เตือนแล้วบอกด้วยว่ารุ่นไหนใช้ได้", /ใช้ได้:/.test(wn(bad)), wn(bad).slice(0, 90));

  // ขนาดคิดต่อบาน ไม่ใช่ทั้งชุด
  ok("กว้าง 240 ซม. 2 บาน = 120 ซม./บาน (ไม่ใช่ 240)", /120×150/.test(mo(A(240, 150, 2, "auto")).name || ""), mo(A(240, 150, 2, "auto")).name || "");

  // โช้ค 30 — เจ้าของเคาะ 9 ก.ย.69 "ตั้งทุนเท่า 50" (3,575) → ไม่ต้องเตือนเรื่องทุนอีก
  ok("โช้ค 30 ทุนเท่าโช้ค 50", PB.MOTOR["กระทุ้ง โช้ค30"] === PB.MOTOR["กระทุ้ง โช้ค50"], String(PB.MOTOR["กระทุ้ง โช้ค30"]));
  ok("โช้ค 30 ไม่มีคำเตือนเรื่องทุนแล้ว", !/ยังไม่มีราคาทุนในไฟล์/.test(wn(A(100, 100, 1, "choke30"))), wn(A(100, 100, 1, "choke30")).slice(0, 60));
  ok("โช้ค 30 ราคาขาย 20,000 · ทุน 5,275 (3,575 + ค่าส่ง)", mo(A(100, 100, 1, "choke30")).amount === 20000 && mo(A(100, 100, 1, "choke30")).cost === 5275,
    mo(A(100, 100, 1, "choke30")).amount + " / " + mo(A(100, 100, 1, "choke30")).cost);
  // กลไกเตือน "ไม่มีทุน" ต้องยังทำงาน ถ้ามีรุ่นใหม่ที่ยังไม่ได้เติมทุน
  ok("กลไกเตือน 'ไม่มีทุน' ยังอยู่ (ลองถอดทุนออก)", (() => {
    const PB3 = JSON.parse(JSON.stringify(PB)); delete PB3.MOTOR["กระทุ้ง โช้ค30"];
    const r = computeCost(PB3, PRODUCTS.awning, { w: 100, h: 100, p: 1, glassType: "เขียว 6มม.", addons: { awn_auto: "choke30" } });
    return (r.lines || []).some((l) => l.cat === "warn" && /ยังไม่มีราคาทุนในไฟล์/.test(l.name || ""));
  })());

  // 🐞 QA 9 ก.ย.69 — ทุกจุดที่เรียก <AddonsSection> ต้องส่ง size ให้ครบ
  //   ห้องกระจก G6 เคยไม่ส่ง → หน้าจอเห็นบาน "0×0" เตือนผิดตลอด + เซนเซอร์กันฝนไม่โผล่ให้เลือกเลย
  //   (ราคาไม่พัง เพราะเอนจินอ่านขนาดจาก pane เอง — พังเฉพาะฝั่ง UI จึงไม่มีเทสไหนจับได้)
  {
    for (const file of ["src/components/Calculator40Client.tsx", "src/components/calculator40/RoomComposer.tsx"]) {
      const src = fs.readFileSync(file, "utf8");
      // นับเฉพาะ JSX จริง (ขึ้นบรรทัดใหม่หลังชื่อคอมโพเนนต์) ไม่นับที่อ้างในคอมเมนต์หัวไฟล์
      //   ตัดแต่ละ element ให้จบที่ "/>" ของตัวมันเอง ไม่งั้นจะไปเห็น size ของ element ถัดไปแล้วผ่านฟรี
      const calls = src.split(/<AddonsSection\s*\n/).slice(1).map((c) => c.slice(0, c.indexOf("/>")));
      const has = (c) => /\bsize=\{/.test(c);
      ok(file.split("/").pop() + ": <AddonsSection> ทุกจุดส่ง size", calls.length > 0 && calls.every(has),
        calls.length + " จุด · ส่ง size " + calls.filter(has).length);
    }
  }

  // ขนาดไม่เข้าเกณฑ์ = ไม่มีมอเตอร์ → เซนเซอร์กันฝนต้องไม่โผล่ (กฎออปชั่นลูก)
  const noM = computeCost(PB, PRODUCTS.awning, { w: 50, h: 50, p: 1, glassType: "เขียว 6มม.", addons: { awn_auto: "auto", rain_sensor: "yes" } });
  ok("ขนาดไม่เข้าเกณฑ์: ไม่มีเซนเซอร์กันฝนตามมา", !(noM.lines || []).some((l) => l.cat === "addon" && /เซนเซอร์กันฝน/.test(l.name || "")));
}

// ── ⑩ % กำไรค่าของตั้งต้น (R4.1) — เจ้าของเคาะ 10 ก.ย.69 ─────────────────────────────
//   "ถ้าราคาไม่เท่าคอลัมน์ราคาขายรวมทั้งชุด ให้ set default กำไรของราคาทุนเอาให้มันเท่า"
//   ต้องแตะเฉพาะฝั่ง "ค่าของ" · ค่าแรงขายล็อกตามตาราง · มอเตอร์ขายฟิกต้องไม่ถูกคูณตาม
//   % ที่โชว์ต้องเอาไปคูณทุนแล้วได้ราคาจริง (บั๊กเดิม: โชว์ 47% แต่ราคา = ทุน × 1.96 — เจ้าของจับได้)
console.log("\n═══ ⑩ % กำไรค่าของตั้งต้น (R41.matPct) ═══");
{
  const R = (id, o, pb) => computeCost(pb || PB, PRODUCTS[id], { w: 200, h: 200, p: 1, glassType: "เขียว 6มม.", ...o });
  const withPct = (id, pct) => { const p = JSON.parse(JSON.stringify(PB)); p.R41.matPct[id] = { _: pct }; return p; };
  ok("ไม่เหลือ matAdjPct ค้างใน PB.SELL (เลขที่ไม่มีผลแล้ว หลอกคนแก้)", Object.values(PB.SELL.products).every((x) => x.matAdjPct == null));

  for (const id of ["sms_slide", "open_door", "pivot", "awning", "banyok", "fold_euro", "fold_lift", "fixed", "curve_fixed", "bansolid"]) {
    // % ตั้งต้นตามแบบย่อยของค่าตั้งต้นรุ่น (บานโซลิดแยก 1/2 ชั้น) — ไม่มีแบบย่อย = ค่าทั้งรุ่น
    const vk0 = (R(id, {}).sellModel || {}).vk, M0 = PB.R41.matPct[id] || {};
    const m0 = vk0 && M0[vk0] != null ? M0[vk0] : M0._;
    ok(id + ": มี % ค่าของตั้งต้น", typeof m0 === "number", String(m0));
    const lo = R(id, {}, withPct(id, m0 - 20)), hi = R(id, {}, withPct(id, m0 + 20));
    ok(id + ": ปรับ % แล้วทุนไม่ขยับ", lo.cost.total === hi.cost.total);
    ok(id + ": % ขึ้น → ค่าของ (ขาย) ขึ้น", hi.sell.parts.mat > lo.sell.parts.mat, lo.sell.parts.mat + " → " + hi.sell.parts.mat);
    ok(id + ": % ขึ้น → ค่าแรงขาย 2 ก้อนนิ่ง", lo.sell.parts.prod === hi.sell.parts.prod && lo.sell.parts.inst === hi.sell.parts.inst);
    ok(id + ": % ที่โชว์ = % ตั้งต้น", R(id, {}).profit3.mat === m0, String(R(id, {}).profit3.mat));
  }

  // % ที่โชว์ต้องคูณกลับได้ราคาจริงทุกก้อน
  for (const [id, o] of [["sms_slide", { w: 300, h: 250, p: 2, form: "อิสระ" }], ["slimlux", { w: 250, h: 240, p: 2, form: "อิสระ", color: "white", colorKey: "white" }],
    ["open_door", {}], ["awning", {}], ["banyok", {}], ["fold_euro", {}], ["curve_fixed", {}], ["fixed", {}], ["bansolid", {}], ["roof", { w: 400, h: 200, material: "ไวนิล" }]]) {
    const r = R(id, o), tag = id + " " + (o.w || 200) + "×" + (o.h || 200);
    ok(tag + ": ค่าของขาย = ปัดร้อย(ทุน × (1 + % ที่โชว์))", r.sell.beforeLabor === Math.ceil(r.cost.total * (1 + r.profit3.mat / 100) / 100) * 100, r.sell.beforeLabor + " (%=" + r.profit3.mat + ")");
    ok(tag + ": % ค่าผลิต = ขาย ÷ ทุน − 1", !(r.labor.prod > 0) || r.profit3.prod === Math.round((r.sell.parts.prod / r.labor.prod - 1) * 100), r.profit3.prod + " · " + r.sell.parts.prod + "/" + r.labor.prod);
    ok(tag + ": % ค่าติดตั้ง = ขาย ÷ ทุน − 1", !(r.labor.install > 0) || r.profit3.inst === Math.round((r.sell.parts.inst / r.labor.install - 1) * 100), r.profit3.inst + " · " + r.sell.parts.inst + "/" + r.labor.install);
  }

  // กดแก้ % เองทีละก้อน (profitEdit) — ก้อนที่แตะต้องมีผล · ก้อนที่ไม่แตะคงตามตาราง
  for (const id of ["sms_slide", "awning", "banyok"]) {
    const base = R(id, {});
    const mat = (pp) => R(id, { profitEdit: { mat: true }, profitMat: pp });
    ok(id + ": แก้ % ค่าของ 50 → 200 ราคาขยับจริง", mat(50).sell.withInstall < mat(200).sell.withInstall, mat(50).sell.withInstall + " → " + mat(200).sell.withInstall);
    ok(id + ": แก้ % ค่าของ → ค่าแรงขายยังตามตาราง", mat(200).sell.parts.prod === base.sell.parts.prod && mat(200).sell.parts.inst === base.sell.parts.inst);
    const pe = R(id, { profitEdit: { prod: true }, profitProd: 300 });
    ok(id + ": แก้ % ค่าผลิต 300 → ค่าผลิต = ทุน × 4", pe.sell.parts.prod === Math.round(base.labor.prod * 4), pe.sell.parts.prod + " vs " + Math.round(base.labor.prod * 4));
    ok(id + ": แก้ % ค่าผลิต → ค่าติดตั้ง + ค่าของ (ก่อนค่าแรง) นิ่ง", pe.sell.parts.inst === base.sell.parts.inst && pe.sell.beforeLabor === base.sell.beforeLabor);
    ok(id + ": ใบเก่า (profitManual ล้วน) = ทั้ง 3 ก้อนตาม % ที่กรอก",
      R(id, { profitManual: true, profitMat: 100, profitProd: 100, profitInst: 100 }).sell.parts.inst === Math.round(base.labor.install * 2));
  }

  // ไม่ตีกับมอเตอร์ — มอเตอร์ขายฟิก ต้องไม่ถูกคูณด้วย % ค่าของ
  {
    const noM = R("banyok", {}), withM = R("banyok", { addons: { motor: "auto" } });
    const mLine = (withM.lines || []).find((l) => /ออโต้บานยก/.test(l.name || "")) || {};
    ok("บานยก: ส่วนต่างขาย = ราคามอเตอร์เป๊ะ (ไม่โดนคูณกำไรค่าของ)",
      withM.sell.withInstall - noM.sell.withInstall === mLine.amount, (withM.sell.withInstall - noM.sell.withInstall) + " vs " + mLine.amount);
    const hi = R("banyok", { addons: { motor: "auto" } }, withPct("banyok", 300));
    const mHi = (hi.lines || []).find((l) => /ออโต้บานยก/.test(l.name || "")) || {};
    ok("ดัน % ค่าของเป็น 300 ราคามอเตอร์ยังนิ่ง", mHi.amount === mLine.amount, mHi.amount + " vs " + mLine.amount);
    ok("ดัน % ค่าของแล้วราคารวมขยับจริง", hi.sell.withInstall > withM.sell.withInstall);
  }

  // 🐞 เจ้าของเจอเอง 9 ก.ย.69 "กดเปลี่ยน % ช่องติดตั้ง ช่องอื่นดันเปลี่ยนตาม"
  //   สาเหตุ: state ค้างค่าเก่า (100/100/200) พอสลับเป็นโหมดกรอกเอง จอเลิกอ่านตัวคูณจริง
  //   กันซ้ำ 2 ชั้น — ① ซอร์สต้องสลับโหมดผ่าน seedManual() ที่เดียว ② เอนจินต้องแยก 3 ก้อนจริง
  {
    const src = fs.readFileSync("src/components/Calculator40Client.tsx", "utf8");
    // ทุกจุดที่สลับเป็นโหมดกรอกเอง ต้องเรียก seedManual() — ห้ามเรียก setProfitManual(true) ลอย ๆ
    const bare = (src.match(/setProfitManual\(true\)/g) || []).length;
    ok("สลับโหมดกรอกเองผ่าน seedManual() ที่เดียว (กัน 3 ช่องกระโดด)", bare === 1, "setProfitManual(true) โผล่ " + bare + " จุด (ต้อง 1 = ในตัว seedManual เอง)");
    ok("seedManual คัดลอกตัวคูณที่โชว์อยู่ครบ 3 ช่องก่อนสลับโหมด",
      /function seedManual\(\) \{[\s\S]{0,220}setProfit\(shownPct\.mat\);[\s\S]{0,80}setProfitProd\(shownPct\.prod\);[\s\S]{0,80}setProfitInst\(shownPct\.inst\);/.test(src));
    ok("ช่อง % ทุกจุดอ่านจาก shownPct (ไม่ใช่ state ดิบ)",
      !/value=\{profit\}|value=\{profitProd\}|value=\{profitInst\}/.test(src), "");

    // เอนจิน: โหมดกรอกเอง 3 ก้อนต้องเป็นอิสระต่อกันจริง — ขยับติดตั้งอย่างเดียว ของ/ผลิต ต้องนิ่ง
    const M = (pm, pp, pi) => computeCost(PB, PRODUCTS.sms_slide,
      { w: 300, h: 250, p: 2, glassType: "เขียว 6มม.", form: "อิสระ", profitManual: true, profitMat: pm, profitProd: pp, profitInst: pi });
    const base = M(113, 109, 106), onlyInst = M(113, 109, 150);
    ok("ขยับ % ติดตั้งอย่างเดียว: ค่าของไม่ขยับ", base.sell.beforeLabor === onlyInst.sell.beforeLabor, base.sell.beforeLabor + " vs " + onlyInst.sell.beforeLabor);
    // ดูที่ก้อนตรง ๆ (sell.parts) — ยอดรวมปัดร้อยทีเดียว เอายอดมาลบกันเศษจะไหลข้ามก้อน
    ok("ขยับ % ติดตั้งอย่างเดียว: ค่าผลิตไม่ขยับ", base.sell.parts.prod === onlyInst.sell.parts.prod, base.sell.parts.prod + " vs " + onlyInst.sell.parts.prod);
    ok("ขยับ % ติดตั้งอย่างเดียว: ค่าติดตั้งขยับจริง", onlyInst.sell.parts.inst > base.sell.parts.inst);
    const onlyMat = M(150, 109, 106);
    ok("ขยับ % ค่าของอย่างเดียว: ค่าติดตั้งไม่ขยับ", base.sell.parts.inst === onlyMat.sell.parts.inst);

    // R4.1: ช่อง % ทุกช่องแก้ผ่าน editPct → ติดธงเฉพาะก้อนที่แตะ (ไม่สลับทั้งหน้าเป็นโหมดกรอกเอง)
    ok("ช่อง % ทุกช่องเรียก editPct (ไม่มี seedManual ลอยในช่องกรอก)",
      !/seedManual\(\); setProfit/.test(src) && (src.match(/editPct\("(mat|prod|inst)", v\)/g) || []).length === 6, String((src.match(/editPct\("(mat|prod|inst)", v\)/g) || []).length));
    ok("การ์ด 3 ก้อนแก้ผ่าน editPct ตามชื่อก้อน", /const setPct = \(v: string\) => editPct\(label === "ค่าของ" \? "mat" : label === "ค่าผลิต" \? "prod" : "inst", v\);/.test(src));
    ok("รุ่น R4.1 ติดธงรายก้อน · ใบเก่าโหมดกรอกเองเริ่มธงครบ 3 ก้อน",
      /if \(isR41Prod\) \{ setProfitEdit\(\(e\) => \(\{ \.\.\.\(e \|\| \(profitManual \? \{ mat: true, prod: true, inst: true \} : \{\}\)\), \[k\]: true \}\)\); set\(v\); return; \}/.test(src));
    ok("คืนค่าตามไฟล์ / เปลี่ยนรุ่น = ล้างธงแก้เอง", /setProfitManual\(false\); setProfitEdit\(null\);/.test(src) && /setProfitInst\(String\(dp\.inst\)\);\s*setProfitEdit\(null\);/.test(src));
    ok("สูตรข้อเก็บ + คืนธงแก้เอง", /profitManual, profitEdit, laborMode,/.test(src) && /setProfitEdit\(r\.profitEdit/.test(src));
    ok("ส่งธงแก้เองให้บานย่อย/ห้องกระจกครบ 3 จุด", (src.match(/edit: profitEdit/g) || []).length === 3, String((src.match(/edit: profitEdit/g) || []).length));
    ok("ส่งธงแก้เองเข้าเอนจิน", /\.\.\.\(profitEdit \? \{ profitEdit \} : \{\}\)/.test(src));
    const pcs = fs.readFileSync("src/lib/calculator40/pane-calc.ts", "utf8");
    ok("pane-calc ส่งธงแก้เองต่อให้เอนจิน", /profitOpt && profitOpt\.edit \? \{ profitEdit: profitOpt\.edit \}/.test(pcs));
  }

  // ⑥ ทุกรุ่นที่มีสูตรราคาขายตามไฟล์ (PB.SELL) ต้องย้ายมาใช้โมเดล R4.1 หมด — ห้ามมีรุ่นตกค้างสูตรเก่า
  {
    const left = Object.keys(PB.SELL.products).filter((id) => PRODUCTS[id] && !(R(id, {}).sellModel || {}).r41);
    ok("รุ่นใน PB.SELL ใช้โมเดล R4.1 ครบ", left.length === 0, left.join(", "));
  }
}

// ── ⑫ 3 ก้อนราคาขาย — ค่าแรงขายตรง ★ ตาราง R4.1 · รวมแล้วเท่าราคาขายจริง ─────────────
//   กฎเจ้าของ 10 ก.ย.69 "ค่าแรงทั้งหมด ติดตั้ง ผลิต ควรราคาเท่าในไฟล์ 4.1 เป๊ะ ๆ · อย่าไปเมคราคาค่าแรงเด็ดขาด"
//   ① ทุกแถวในตาราง (scripts/fixtures/r41-rows.json ดึงจาก PDF) ที่ทุนค่าแรงเว็บ = ตาราง → ขายต้องเท่าตารางทุกบาท
//   ② ขนาดนอกตาราง → ทุน × ตัวคูณของแถวอ้างอิง (แถวเดียวกับที่โชว์ใน "ดูวิธีคิด")
//   ③ ขยับกำไรค่าของ / ใส่มอเตอร์ → ค่าแรง 2 ก้อนนิ่ง
console.log("\n═══ ⑫ 3 ก้อนราคาขาย — ค่าแรงตรงตาราง R4.1 · รวมเท่าราคาขาย ═══");
{
  const FX = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8")).rows.filter((x) => x.id && x.inputs && PRODUCTS[x.id]);
  let cmp = 0, bad = 0, sumBad = 0;
  for (const x of FX) {
    const r = computeCost(PB, PRODUCTS[x.id], x.inputs);
    const P = r.sell.parts;
    if (Math.abs(P.mat + P.prod + P.inst - r.sell.withInstall) > 0.01) sumBad++;
    for (const [c, s, wc, ws] of [["cP", "sP", r.labor.prod, P.prod], ["cI", "sI", r.labor.install, P.inst]]) {
      if (Math.abs(wc - x.pdf[c]) > 1) continue;   // ทุนค่าแรงเว็บยังไม่ตรงตาราง = เรื่องสูตรค่าแรง (audit-r41-pdf รายงานแยก)
      cmp++;
      if (ws !== x.pdf[s]) { bad++; if (bad <= 5) console.log("     ✗", x.id, x.vk, x.w + "×" + x.h, s, ws, "ตาราง", x.pdf[s]); }
    }
  }
  ok("ค่าแรงขายตรงตาราง R4.1 ทุกช่องที่ทุนตรง (" + cmp + " ช่อง)", cmp > 300 && bad === 0, bad + " ช่องไม่ตรง");
  ok("3 ก้อนบวกกันเท่าราคาขายทุกแถวในตาราง (" + FX.length + " แถว)", sumBad === 0, sumBad + " แถว");

  const CASES = [
    ["sms_slide", { w: 300, h: 250, p: 2, form: "อิสระ" }], ["sms_slide", { w: 600, h: 300, p: 3, form: "อิสระ" }],
    ["open_door", { w: 150, h: 200, p: 1 }], ["pivot", {}], ["awning", { w: 120, h: 120, p: 1 }],
    ["banyok", {}], ["fold_euro", {}], ["fold_lift", {}], ["curve_fixed", { w: 100, h: 50, p: 1 }],
    ["fixed", {}], ["bansolid", {}], ["velora", {}], ["pcdoor", {}], ["banklet", {}], ["gate", {}],
    ["roof", { w: 300, h: 200, p: 1, material: "ไวนิล" }],
    ["roof_gable", { w: 800, h: 600, p: 1, material: "กระจก 5+5" }],
    ["roof_slide", { w: 400, h: 250, p: 1, material: "ไวนิล" }],
    ["louver", { w: 200, h: 240, p: 1 }], ["shower", {}], ["handrail", {}],
  ];
  let off = 0;
  for (const [id, o] of CASES) {
    const r = computeCost(PB, PRODUCTS[id], { w: 200, h: 200, p: 1, glassType: "เขียว 6มม.", ...o });
    const P = r.sell.parts, sm = r.sellModel || {};
    if (!sm.r41) { off++; console.log("     ✗", id, "ไม่ได้ใช้โมเดล R4.1"); continue; }
    for (const [lbl, ref, cost, sell] of [["ผลิต", sm.refProd, r.labor.prod, P.prod], ["ติดตั้ง", sm.refInst, r.labor.install, P.inst]]) {
      if (!(cost > 0)) { if (sell !== 0) { off++; console.log("     ✗", id, lbl, "ทุน 0 แต่ขาย", sell); } continue; }
      if (!ref) { off++; console.log("     ✗", id, lbl, "ไม่มีแถวอ้างอิง"); continue; }
      const want = Math.abs(ref.cost - cost) <= 1 ? ref.sell : Math.round(cost * ref.sell / ref.cost);
      if (sell !== want) { off++; console.log("     ✗", id, lbl, sell, "want", want); }
    }
    if (Math.abs(P.mat + P.prod + P.inst - r.sell.withInstall) > 0.01) { off++; console.log("     ✗", id, "3 ก้อนรวมไม่เท่ายอดขาย"); }
  }
  ok("ขนาดนอกตาราง: ค่าแรงขาย = ทุน × ตัวคูณแถวอ้างอิง (" + CASES.length + " เคส)", off === 0, off + " จุดเพี้ยน");
  {
    const r = computeCost(PB, PRODUCTS.sms_slide, { w: 350, h: 260, p: 2, form: "อิสระ", glassType: "เขียว 6มม." });
    const nodes = PB.R41.labor.sms_slide.filter((n) => !n.small);
    const near = nodes.reduce((a, n) => (Math.abs(n.cP - r.labor.prod) < Math.abs(a.cP - r.labor.prod) ? n : a));
    ok("SMS 350×260: แถวอ้างอิงค่าผลิต = แถวในตารางที่ทุนใกล้สุด", r.sellModel.refProd.cost === near.cP, r.sellModel.refProd.cost + " vs " + near.cP);
  }

  // ก้อนค่าแรงต้องนิ่งเมื่อขยับกำไรค่าของ (กฎ "ไม่ยุ่งกับค่าแรง")
  const pbHi = JSON.parse(JSON.stringify(PB)); pbHi.R41.matPct.sms_slide = { _: PB.R41.matPct.sms_slide._ + 40 };
  const lo = computeCost(PB, PRODUCTS.sms_slide, { w: 300, h: 250, p: 2, glassType: "เขียว 6มม.", form: "อิสระ" });
  const hi = computeCost(pbHi, PRODUCTS.sms_slide, { w: 300, h: 250, p: 2, glassType: "เขียว 6มม.", form: "อิสระ" });
  ok("ดันกำไรค่าของ: ก้อนค่าแรงผลิตไม่ขยับ", lo.sell.parts.prod === hi.sell.parts.prod, lo.sell.parts.prod + " vs " + hi.sell.parts.prod);
  ok("ดันกำไรค่าของ: ก้อนค่าแรงติดตั้งไม่ขยับ", lo.sell.parts.inst === hi.sell.parts.inst, lo.sell.parts.inst + " vs " + hi.sell.parts.inst);
  ok("ดันกำไรค่าของ: ก้อนค่าของขยับจริง", hi.sell.parts.mat > lo.sell.parts.mat);

  // มอเตอร์ขายฟิกต้องลงที่ก้อนค่าของ ไม่ใช่ค่าแรง
  const noM = computeCost(PB, PRODUCTS.banyok, { w: 200, h: 200, p: 1, glassType: "เขียว 6มม." });
  const wM = computeCost(PB, PRODUCTS.banyok, { w: 200, h: 200, p: 1, glassType: "เขียว 6มม.", addons: { motor: "auto" } });
  ok("ใส่มอเตอร์: ก้อนค่าแรงไม่ขยับ", noM.sell.parts.prod === wM.sell.parts.prod && noM.sell.parts.inst === wM.sell.parts.inst);
  ok("ใส่มอเตอร์: 3 ก้อนยังรวมได้เท่าราคาขาย", Math.abs(wM.sell.parts.mat + wM.sell.parts.prod + wM.sell.parts.inst - wM.sell.withInstall) < 0.01);

  // จอต้องอ่านจาก sell.parts ไม่ใช่ลบกันเอง
  const src = fs.readFileSync("src/components/Calculator40Client.tsx", "utf8");
  ok("การ์ดกำไรอ่านก้อนจาก sell.parts", /\["ค่าผลิต",[^\]]*sellParts\.prod\]/.test(src) && /\["ค่าติดตั้ง",[^\]]*sellParts\.inst\]/.test(src));
  ok("ไม่เหลือการลบ mfgOnly − beforeLabor ในการ์ดกำไร", !/setProfitProd, result\.sell\.mfgOnly - result\.sell\.beforeLabor/.test(src));
  ok("ดูวิธีคิดค่าแรง: ใช้ก้อนขายจริง + แถวอ้างอิงในตาราง R4.1",
    /const sell = isProd \? sellParts\.prod : sellParts\.inst;/.test(src) && /sm\.r41 \? \(isProd \? sm\.refProd : sm\.refInst\) : null/.test(src));
}

// ── ⑰ บานโซลิด 1 ชั้น / 2 ชั้น (เจ้าของเคาะ 10 ก.ย.69) ───────────────────────────
//   ชีตคิดทุน B10: โซลิด 1 ชั้น = ลูกฟูกฝั่งเดียว · เส้นคาดตาราง 2 ฝั่งเท่าเดิม (เจ้าของเลือกตามสูตรทุน)
//   ด่านไม่พึ่งเลขเอนจิน: ทุนต่างของ 2 แบบ ต้องเท่าส่วนต่างในตาราง R4.1 (PDF) ทุกขนาด
console.log("\n═══ ⑰ บานโซลิด 1 ชั้น / 2 ชั้น ═══");
{
  const S = (o) => computeCost(PB, PRODUCTS.bansolid, { p: 1, form: "มีธรณี", color: "white", colorKey: "white", ...o });
  const line = (r, re) => (r.lines || []).find((l) => re.test(l.name || "")) || {};
  ok("บานโซลิดมีตัวเลือก แบบโซลิด 1/2 ชั้น (ค่าตั้งต้น 2 ชั้น)", (PRODUCTS.bansolid.specOpts || []).some((o) => o.key === "solidLayer" && o.def === "โซลิด 2 ชั้น" && o.opts.includes("โซลิด 1 ชั้น")));
  const FXS = JSON.parse(fs.readFileSync("scripts/fixtures/r41-rows.json", "utf8")).rows.filter((x) => x.id === "bansolid");
  for (const [w, h] of [[80, 200], [90, 240], [120, 280]]) {
    const two = S({ w, h, spec: { solidLayer: "โซลิด 2 ชั้น" } }), one = S({ w, h, spec: { solidLayer: "โซลิด 1 ชั้น" } });
    const t2 = FXS.find((x) => x.vk === "โซลิด 2 ชั้น" && x.w === w && x.h === h), t1 = FXS.find((x) => x.vk === "โซลิด 1 ชั้น" && x.w === w && x.h === h);
    ok(w + "×" + h + ": ตาราง R4.1 มีทั้ง 2 แบบ", !!(t1 && t2));
    if (!(t1 && t2)) continue;
    const dWeb = two.cost.total - one.cost.total, dPdf = t2.pdf.cM - t1.pdf.cM;
    ok(w + "×" + h + ": ทุน 2 ชั้น − 1 ชั้น = ส่วนต่างในตาราง (" + dPdf + ")", Math.abs(dWeb - dPdf) <= 1, String(Math.round(dWeb)));
    // สูตรชีตคิดทุน B24 (P=1): ROUNDUP(ROUNDUP(กว้าง/10) × ฝั่ง / INT(600/สูง)) — ปัดขึ้นทั้งก้อน ไม่ใช่ครึ่งหนึ่งเป๊ะ (90×240: 5 กับ 9)
    const corr = (sides) => Math.ceil(Math.ceil(w / 10) * sides / Math.max(1, Math.trunc(600 / h)));
    ok(w + "×" + h + ": ลูกฟูกตามสูตรชีต B24 (1 ชั้น " + corr(1) + " · 2 ชั้น " + corr(2) + " เส้น)",
      line(one, /ลูกฟูก/).qty === corr(1) && line(two, /ลูกฟูก/).qty === corr(2), line(one, /ลูกฟูก/).qty + " / " + line(two, /ลูกฟูก/).qty);
    ok(w + "×" + h + ": เส้นคาดตารางเท่ากัน 2 ฝั่ง", line(one, /เส้นคาด/).qty === line(two, /เส้นคาด/).qty);
    ok(w + "×" + h + ": ค่าแรงทุนเท่ากันทั้ง 2 แบบ", one.labor.prod === two.labor.prod && one.labor.install === two.labor.install);
    ok(w + "×" + h + ": 1 ชั้น ใช้แถวอ้างอิง/% ของ 1 ชั้น", one.sellModel.vk === "โซลิด 1 ชั้น" && one.sellModel.refInst && one.sellModel.refInst.vk === "โซลิด 1 ชั้น");
  }
  ok("ไม่เลือก = 2 ชั้น (ใบเก่า)", S({ w: 90, h: 240 }).cost.total === S({ w: 90, h: 240, spec: { solidLayer: "โซลิด 2 ชั้น" } }).cost.total);
  // ใบตัดต้องได้ตัวเลือกไปด้วย — ส่งผ่าน from-recipe
  const fr = fs.readFileSync("src/lib/cutlist/from-recipe.ts", "utf8");
  ok("ใบตัด: ส่งแบบโซลิดจากคิดราคาไปใบตัด", /solidLayer: recipe\.spec\?\.solidLayer === "โซลิด 1 ชั้น" \? "โซลิด 1 ชั้น" : "โซลิด 2 ชั้น"/.test(fr));
}

// ── ⑱ นับเส้นอลูแบบไฟล์ (aluWaste) — Velora · บานระแนงเลื่อน (10 ก.ย.69) ─────────────
//   เลขทุกตัวในบล็อกนี้มาจากชีตคิดทุนใน ถอดทุน_รวมทั้งหมด v20.1.xlsx (ค่าที่ชีตคำนวณไว้) — ไม่ใช่เลขที่เอนจินคิด
console.log("\n═══ ⑱ นับเส้นอลูแบบไฟล์ — Velora · บานระแนงเลื่อน ═══");
{
  const v = computeCost(PB, PRODUCTS.velora, { w: 220, h: 200, p: 1, glassType: "เทมเปอร์ใส 6มม.", color: "white", colorKey: "white" });
  ok("Velora 220×200 อบขาว: ทุนรวม = ชีต D24 8,151.57", Math.abs(v.cost.total - 8151.57) <= 0.5, String(v.cost.total));
  const q = (r, re) => (r.lines || []).filter((l) => l.cat === "alu" && re.test(l.name || "")).reduce((a, l) => a + Number(l.qty), 0);
  ok("Velora วงกบ = ชีต B15 1.3433 เส้น", Math.abs(q(v, /^วงกบ/) - 1.34333) < 0.001, String(q(v, /^วงกบ/)));
  ok("Velora กรอบบาน = ชีต B16 1.781 เส้น", Math.abs(q(v, /^กรอบบาน/) - 1.781) < 0.001, String(q(v, /^กรอบบาน/)));
  const b = computeCost(PB, PRODUCTS.bar_slide, { w: 600, h: 300, p: 3, form: "ภายนอก", material: "อิสระ", color: "white", colorKey: "white" });
  for (const [re, want, lbl] of [[/^เฟรมบน/, 1.21875, "เฟรมบน B11"], [/^เฟรมข้าง/, 1.21875, "เฟรมข้าง B12"], [/^เฟรมล่างกันน้ำ \(ภายนอก/, 1.21875, "เฟรมล่าง B13"],
    [/^เสากุญแจ/, 1.21875, "เสากุญแจ B14"], [/^เสาเกี่ยวธรรมดา/, 1.21875, "เสาเกี่ยวธรรมดา B15"], [/^เสาเกี่ยวรับแรง/, 1.21875, "เสาเกี่ยวรับแรง B16"],
    [/^ขวางบน/, 2.4375, "ขวาง B17"], [/^ตบปิดเฟรม/, 2.4375, "ตบปิดเฟรม B18"], [/^ตบราง \(ภายนอก/, 3, "ตบราง B19 (เต็มเส้น)"]])
    ok("บานระแนงเลื่อน 600×300 3 บาน: " + lbl + " = " + want + " เส้น", Math.abs(q(b, re) - want) < 0.001, String(q(b, re)));
}

// ── ⑲ E-series — เส้นสีมิว อบทุกสี · ราคาตามไฟล์เท่านั้น ไม่ดึงสโตร์ (เจ้าของ 11 ก.ย.69) ─────────
//   เลขอ้างอิงจากชีต "คิดทุน E-series" v20.1: D29 ทุนรวม 32,125.92 (600×300 3 บาน อบขาว)
//   ค่าอบ = ทุนรวม − (อลู 15,281.69 + กระจก 4,910.4 + อุปกรณ์ 1,010 + สิ้นเปลือง 434 + ค่าเปิดตู้อบ 2,000) = 8,489.83
//   เรตค่าอบจากชีต "อัปเดตราคาอลู": เทา 100 · อบพิเศษ 173 · ลายไม้อบพิเศษ 190
console.log("\n═══ ⑲ E-series — อบทุกสี · ราคาตามไฟล์ ═══");
{
  const BAKE_OF = { white: "white", black: "white", sahara: "sahara", sahara_black: "sahara", aztec: "special", wood_teak: "woodStock", special: "special", wood_special: "woodSpecial" };
  const E = (key, pb, extra = {}) => computeCost(pb || PB, PRODUCTS.eseries, { w: 600, h: 300, p: 3, form: "อิสระ", glassType: "เขียว 6มม.", color: BAKE_OF[key], colorKey: key, ...extra });
  const white = E("white");
  ok("อบขาว 600×300 3 บาน = ชีต D29 32,125.92", Math.abs(white.cost.total - 32125.92) <= 0.5, String(white.cost.total));
  ok("อบขาว: ค่าอบ 8,489.83 (เรตเทา 100 ตามชีต H6)", Math.abs(white.cost.bake - 8489.83) <= 0.5, String(white.cost.bake));
  const kg = 8489.83 / 100;
  const bakeLine = (r) => ((r.lines || []).find((l) => /^ค่าอบสี/.test(l.name || "")) || {}).amount || 0;
  ok("ค่าเปิดตู้อบ 2,000 ทุกสี (ชีต B28)", Object.keys(BAKE_OF).every((k) => E(k).cost.openOven === 2000));
  for (const [k, rate] of [["black", 100], ["sahara", 100], ["sahara_black", 100], ["special", 173], ["aztec", 173], ["wood_teak", 190], ["wood_special", 190]]) {
    const r = E(k);
    ok("สี " + k + ": ค่าอบเรต " + rate + "/กก. ตามชีต", Math.abs(bakeLine(r) - rate * kg) <= 1, bakeLine(r) + " vs " + (rate * kg).toFixed(2));
  }
  // เทา = ขาว × สัดส่วน เทา÷ขาว ไฟล์ v20.1 (เจ้าของ 11 ก.ย.69 "เทาต้องแพงกว่าขาว") — ส่วนต่างคิดบน ค่าเส้น+ค่าอบ ไม่รวมค่าเปิดตู้อบ
  ok("สัดส่วน เทา÷ขาว = 1.073 (เฉลี่ย 109 รหัส B/F ชีตราคาสี v20.1)", PB.GREY_RATIO && PB.GREY_RATIO.ratio === 1.073, JSON.stringify(PB.GREY_RATIO));
  for (const k of ["sahara", "sahara_black"]) {
    const g = E(k), want = (white.cost.alu + white.cost.bake) * (PB.GREY_RATIO.ratio - 1);
    ok("สี " + k + ": แพงกว่าขาว = (ค่าเส้น+ค่าอบ) × 7.3%", Math.abs(g.cost.total - white.cost.total - want) <= 1, (g.cost.total - white.cost.total).toFixed(2) + " vs " + want.toFixed(2));
  }
  // ราคาสโตร์ห้ามทับ — ใส่ราคาปลอมทุกช่องที่มาจากสโตร์ ทุนต้องเท่าเดิมเป๊ะ
  const pbS = JSON.parse(JSON.stringify(PB));
  pbS.SKUPRICE = { ...(pbS.SKUPRICE || {}), JR00456: 999, JR00794: 999, JR00864: 999 };
  pbS.ALUCODE = { ...(pbS.ALUCODE || {}), "E-01": 9999, "E-07E": 9999 };
  pbS.ALUCODE_FROM_STOCK = { "E-01": true, "E-07E": true };
  pbS.ALUCOLOR_STOCK = { "อบขาว": { "E-01": 9999 }, "เทาซาฮาร่า": { "E-01": 9999 } };
  ok("ราคาสโตร์ไม่ทับ E-series (ไม่สต็อก)", E("white", pbS, { stockColor: "อบขาว" }).cost.total === white.cost.total, String(E("white", pbS, { stockColor: "อบขาว" }).cost.total));
  // เรตต่อโลอลูจากสโตร์ (ตัวคูณแบรนด์ SMS) ก็ห้ามทับ — E-series ใช้แบรนด์ SMS ร่วมกับบานเลื่อน SMS ที่สต็อกจริง
  const pbK = JSON.parse(JSON.stringify(PB)); pbK.ALU = { ...pbK.ALU, SMS: (pbK.ALU_BASE.SMS || 187) + 13 };
  ok("เรตต่อโลอลูในสโตร์ขยับ → E-series ไม่ขยับ", E("white", pbK).cost.total === white.cost.total, String(E("white", pbK).cost.total));
  ok("เรตต่อโลอลูในสโตร์ขยับ → บานเลื่อน SMS ยังขยับตามปกติ",
    computeCost(pbK, PRODUCTS.sms_slide, { w: 300, h: 250, p: 2, form: "อิสระ", glassType: "เขียว 6มม." }).cost.total !== computeCost(PB, PRODUCTS.sms_slide, { w: 300, h: 250, p: 2, form: "อิสระ", glassType: "เขียว 6มม." }).cost.total);
  ok("ล็อคก้นหอยใช้ราคาไฟล์ 100 (ไม่ใช่สโตร์)", ((E("white", pbS).lines || []).find((l) => l.name === "ล็อคก้นหอย") || {}).unitPrice === 100);
  // รุ่นอื่นยังใช้สโตร์ตามปกติ (ธงไม่รั่ว)
  const sms = computeCost(pbS, PRODUCTS.sms_slide, { w: 300, h: 250, p: 2, form: "อิสระ", glassType: "เขียว 6มม." });
  const smsBase = computeCost(PB, PRODUCTS.sms_slide, { w: 300, h: 250, p: 2, form: "อิสระ", glassType: "เขียว 6มม." });
  ok("รุ่นอื่น (SMS) ยังดึงราคาสโตร์ได้ตามปกติ", sms.cost.total !== smsBase.cost.total);
  ok("ไม่มีราคาสี E-series ในตารางไฟล์ (คิด ขาว + ค่าอบ ล้วน)", !Object.values(PB.ALUCOLOR_KEY || {}).some((t) => t && t["E-01"] != null) && !Object.values(PB.ALUCOLOR || {}).some((t) => t && t["E-01"] != null));
}

// ── ⑳ ลำดับราคาสี (เจ้าของ 11 ก.ย.69) ─────────────────────────────
//   "อบขาว ดำ ถูกสุด → เทาซาฮาร่า ดำซาฮาร่า → เอสเทคเกรย์ (มีแค่ยูโร) → ไม้สักทอง · มะฮอกกานี/ไวท์โอ๊ค มีแค่ยูโร"
//   ① ทุกรุ่นที่เลือกสีได้ ขนาดตั้งต้น (ราคาไฟล์ ไม่มีสโตร์)  ② สโตร์จำลองเคสที่เคยพังจริง
console.log("\n═══ ⑳ ลำดับราคาสี — ขาว=ดำ < เทา=ดำซาฮาร่า ≤ แอทแทค < ลายไม้ ═══");
{
  const fsx = await import("node:fs");
  const BAKE = { white: "white", black: "white", sahara: "sahara", sahara_black: "sahara", aztec: "sahara", wood_teak: "woodStock", wood_maho: "woodStock", wood_whiteoak: "woodStock" };
  const EURO_ONLY = ["aztec", "wood_maho", "wood_whiteoak"];
  const colorsSrc = fsx.readFileSync(new URL("../src/lib/calculator40/alu-colors.ts", import.meta.url), "utf8");
  const special = new Set([...((/SPECIAL_COLOR_PRODUCTS = new Set\(\[([\s\S]*?)\]\)/.exec(colorsSrc) || [])[1] || "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
  ok("อ่านรายชื่อรุ่นยูโรที่มีสีพิเศษได้", special.has("open_door") && special.has("bansolid"), [...special].join(","));
  // เจ้าของ 11 ก.ย.69: Aztec gray / มะฮอกกานี / ไวท์โอ๊ค มีแค่ บานเปิดยูโร · บานเลื่อนยูโร · บานโซลิด · PC Door (E-series ใบเก่า aztec = สีอบพิเศษ ⑲)
  ok("3 สีพิเศษเลือกได้ 4 รุ่นเท่านั้น", [...special].sort().join(",") === "bansolid,euro_slide,open_door,pcdoor", [...special].join(","));
  ok("ธง euroColors ในสูตร = รายชื่อใน alu-colors", Object.values(PRODUCTS).filter((p) => p.euroColors).map((p) => p.id).sort().join(",") === [...special].sort().join(","),
    Object.values(PRODUCTS).filter((p) => p.euroColors).map((p) => p.id).join(","));
  const AC = await import("../src/lib/calculator40/alu-colors.ts");
  ok("ใบเก่า: กระทุ้ง Aztec → สีอบพิเศษ", AC.allowedColorFor("awning", "aztec") === "special");
  ok("ใบเก่า: กระทุ้ง มะฮอกกานี → ลายไม้อบพิเศษ", AC.allowedColorFor("awning", "wood_maho") === "wood_special" && AC.allowedColorFor("sms_slide", "wood_whiteoak") === "wood_special");
  ok("รุ่นที่มีสีนี้ / สีปกติ → คงเดิม", AC.allowedColorFor("open_door", "aztec") === "aztec" && AC.allowedColorFor("pcdoor", "wood_maho") === "wood_maho" && AC.allowedColorFor("awning", "sahara") === "sahara");
  ok("ตัวเลือกสีกระทุ้ง/บานหมุน/เฟี้ยมยูโร/เฟี้ยมยก ไม่มี 3 สีพิเศษ", ["awning", "pivot", "fold_euro", "fold_lift"].every((id) => !AC.aluColorKeysFor(id).some((k) => ["aztec", "wood_maho", "wood_whiteoak"].includes(k))));
  // สีพิมพ์ลงใบอย่างเดียว (ไฟล์ไม่มีสูตรสี) — ผนังลูกฟูก/ผนังคอมโพสิต/ตู้
  const LABEL_ONLY = new Set(["wall_corrugated", "wall_composite", "cabinet"]);
  // ราวกันตก: ชีต H7 คิดสีเฉพาะ "กล่องอลู 1×1.6" (ระบบเสาตั้ง) · ระบบยูเหล็ก+ครอบอลู (ค่าตั้งต้น) ไฟล์ไม่มีส่วนต่างสี
  const OVR = { handrail: { material: "เฉียง|เสาตั้ง+ราวจับอลู" } };
  const order = (id, c) => {
    const bad = [];
    if (Math.abs(c.white - c.black) > 0.5) bad.push("ขาว≠ดำ");
    if (Math.abs(c.sahara - c.sahara_black) > 0.5) bad.push("เทา≠ดำซาฮาร่า");
    if (!(c.sahara > c.white + 0.5)) bad.push("เทาไม่แพงกว่าขาว");
    if (c.wood_teak != null && !(c.wood_teak > c.sahara + 0.5)) bad.push("สักทองไม่แพงกว่าเทา");
    if (c.aztec != null && !(c.aztec >= c.sahara - 0.5 && c.aztec < c.wood_teak)) bad.push("แอทแทคไม่อยู่ระหว่างเทากับสักทอง");
    for (const k of ["wood_maho", "wood_whiteoak"]) if (c[k] != null && !(c[k] > c.sahara + 0.5)) bad.push(k + " ไม่แพงกว่าเทา");
    return bad;
  };
  const costs = (pb, p, extra = (k) => ({})) => {
    const base = { w: p.defaults?.w ?? 200, h: p.defaults?.h ?? 200, p: p.defaults?.p ?? 1, form: p.defForm ?? (p.forms || [])[0] ?? "" };
    if (p.defMaterial) base.material = p.defMaterial;
    if (p.defGlass) base.glassType = p.defGlass;
    const c = {};
    for (const k of Object.keys(BAKE)) {
      if (EURO_ONLY.includes(k) && !special.has(p.id)) continue;
      try { const x = computeCost(pb, p, { ...base, color: BAKE[k], colorKey: k, ...extra(k) }); if (!x.error) c[k] = x.cost.total; } catch { /* รุ่นที่คิดขนาดตั้งต้นไม่ได้ */ }
    }
    return c;
  };
  const round = (c) => JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v)])));
  let checked = 0;
  for (const p of Object.values(PRODUCTS)) {
    if (p.composite || p.sellDirect || p.sellZip || LABEL_ONLY.has(p.id)) continue;
    if (!(p.alu || []).length && !p.showColor) continue;
    const c = costs(PB, p, () => OVR[p.id] || {});
    if (c.white == null || c.sahara == null) continue;
    checked++;
    const bad = order(p.id, c);
    ok(p.id + ": ลำดับราคาสี (ราคาไฟล์)", bad.length === 0, bad.join(", ") + " " + round(c));
  }
  ok("ตรวจครบทุกรุ่นที่เลือกสีได้ (≥ 25 รุ่น)", checked >= 25, String(checked));
  // ใบเก่าที่เลือก 3 สีนี้ ในรุ่นที่เอาตัวเลือกออกแล้ว → Aztec = สีอบพิเศษ · มะฮอกกานี/ไวท์โอ๊ค = ลายไม้อบพิเศษ (แพงกว่าสักทอง)
  const baseOf = (p) => ({ w: p.defaults?.w ?? 200, h: p.defaults?.h ?? 200, p: p.defaults?.p ?? 1, form: p.defForm ?? (p.forms || [])[0] ?? "", ...(p.defGlass ? { glassType: p.defGlass } : {}) });
  for (const id of ["awning", "pivot", "fold_euro", "fold_lift", "sms_slide"]) {
    const p = PRODUCTS[id], cost = (x) => computeCost(PB, p, { ...baseOf(p), ...x }).cost.total;
    const ws = cost({ color: "woodSpecial", colorKey: "wood_special" }), sp = cost({ color: "special", colorKey: "special" });
    const tk = cost({ color: "woodStock", colorKey: "wood_teak" });
    for (const k of ["wood_maho", "wood_whiteoak"]) {
      const old = cost({ color: "woodStock", colorKey: k, stockColor: k === "wood_maho" ? "มะฮอกกานี" : "ไวท์โอ็ค" });
      ok(id + ": ใบเก่า " + k + " = ลายไม้อบพิเศษ (แพงกว่าสักทอง)", Math.abs(old - ws) < 0.01 && ws > tk, old + " / " + ws + " / สักทอง " + tk);
    }
    const az = cost({ color: "sahara", colorKey: "aztec", stockColor: "Aztecgray" }), azOld = cost({ color: "special", colorKey: "aztec" });
    ok(id + ": ใบเก่า aztec = สีอบพิเศษ", Math.abs(az - sp) < 0.01 && Math.abs(azOld - sp) < 0.01, az + " / " + azOld + " / " + sp);
  }
  for (const id of ["open_door", "euro_slide", "bansolid", "pcdoor"]) {
    const p = PRODUCTS[id], cost = (x) => computeCost(PB, p, { ...baseOf(p), ...x }).cost.total;
    const m = cost({ color: "woodStock", colorKey: "wood_maho" }), ws = cost({ color: "woodSpecial", colorKey: "wood_special" });
    const az = cost({ color: "sahara", colorKey: "aztec" }), sp = cost({ color: "special", colorKey: "special" });
    ok(id + ": มะฮอกกานี/Aztec ใช้ราคาสีสต็อกของตัวเอง (ไม่ใช่อบพิเศษ)", Math.abs(m - ws) > 1 && az < sp, m + " vs " + ws + " · " + az + " vs " + sp);
  }

  // ② สโตร์จำลอง — ต้องใช้ Node ที่อ่าน TypeScript ได้ (stock-link.ts)
  const SL = await import("../src/lib/calculator40/stock-link.ts").catch((e) => ({ err: e }));
  if (SL.err) ok("โหลด stock-link.ts ได้", false, String(SL.err.message || SL.err).slice(0, 160));
  else {
    // เคสจริง F7864: ขาว/ดำ/เทา ราคา 0 · สักทอง 3,170 → เดิมเอา 3,170 เป็นราคาขาว = เทาแพงกว่าสักทอง
    const rows = [
      { name: "F7864-เสาบานเปิด 10 ซม.", sku: "F7864", color: "อบขาว", unit_cost: 0 },
      { name: "F7864-เสาบานเปิด 10 ซม.", sku: "F7864", color: "ดำ", unit_cost: 0 },
      { name: "F7864-เสาบานเปิด 10 ซม.", sku: "F7864", color: "เทาซาฮาร่า", unit_cost: 0 },
      { name: "F7864-เสาบานเปิด 10 ซม.-ลายไม้สักทอง", sku: "F7864", color: "", unit_cost: 3170 },
      { name: "JR02885-วงกบ Velora", sku: "JR02885", color: "มิว", unit_cost: 1500 },
    ];
    const ov = SL.buildPriceOverride(rows, PB);
    ok("สโตร์: ขาว/ดำ/เทา ราคา 0 แต่สักทอง 3,170 → ห้ามเอาเป็นราคาขาว", !(ov.ALUCODE.F7864 > 0), String(ov.ALUCODE.F7864));
    ok("สโตร์: เส้นดิบ (มิว 1,500) ยังเป็นราคาฐานได้", ov.ALUCODE.JR02885 === 1500, String(ov.ALUCODE.JR02885));
    const pbA = SL.applyPriceOverride(JSON.parse(JSON.stringify(PB)), ov);
    const cA = costs(pbA, PRODUCTS.open_door, (k) => ({ stockColor: SL.stockColorOfCalc(k) }));
    ok("สโตร์ F7864: บานเปิด ลำดับราคาสีถูก", order("open_door", cA).length === 0, order("open_door", cA).join(", ") + " " + round(cA));
    // กล่องเมืองทอง: สโตร์ตั้งทุกสีเท่าราคาขาว (ก๊อป) · ลายไม้บางขนาดถูกกว่าตัวคูณเทาในไฟล์
    const boxRows = [];
    for (const [nm, px, teak] of [["กล่อง 2\"x4\"", 1540, 1600], ["กล่อง 1\"x4\"", 905, 905], ["กล่อง 1.6\"x4\"", 1220, 1394], ["กล่อง 4\"x4\"", 2210, 3223.35], ["กล่อง 1\"x1.6\"", 485, 683]]) {
      for (const col of ["มิว", "อบขาว", "ดำ", "เทาซาฮาร่า", "Aztec gray"]) boxRows.push({ name: nm + "-" + col, unit_cost: px });
      boxRows.push({ name: nm + "-ลายไม้สักทอง", unit_cost: teak });
    }
    const pbB = SL.applyPriceOverride(JSON.parse(JSON.stringify(PB)), SL.buildPriceOverride(boxRows, PB));
    ok("สโตร์กล่องจำลองอ่านได้", !!(pbB.BOXPRICE && pbB.BOXPRICE["กล่อง|2X4"] && pbB.BOXPRICE["กล่อง|2X4"]["เทาซาฮาร่า"] === 1540), JSON.stringify(pbB.BOXPRICE && pbB.BOXPRICE["กล่อง|2X4"]));
    for (const id of ["gate", "roof", "louver_rotate", "handrail", "fixed", "slimlux", "pcdoor"]) {
      const c = costs(pbB, PRODUCTS[id], (k) => ({ stockColor: SL.stockColorOfCalc(k), ...(OVR[id] || {}) }));
      const bad = order(id, c);
      ok("สโตร์กล่องราคาเท่าขาว: " + id + " ลำดับราคาสีถูก", bad.length === 0, bad.join(", ") + " " + round(c));
    }
  }
  // ตัวคูณสีกล่องใน pricebook ต้องเท่ากับ CF_EXPR ในสูตร (แหล่งเดียวกัน)
  const prodSrc = fsx.readFileSync(new URL("../src/lib/calculator40/products.mjs", import.meta.url), "utf8");
  const cfm = /const CF_EXPR = "mult\*\(\(\((\{[^}]*\})\)/.exec(prodSrc);
  const cfObj = cfm ? Function("return " + cfm[1])() : null;
  ok("PB.BOX_CF = CF_EXPR ในสูตร", !!cfObj && ["white", "sahara", "woodStock", "special", "woodSpecial"].every((k) => Math.abs(cfObj[k] - PB.BOX_CF[k]) < 1e-9), JSON.stringify(cfObj));
}

// ── ⑪ บานติดตายดัดโค้ง — กล่องเปิด+ตบปิดเปิด คิดตามยาวจริง ไม่ใช่ซื้อเต็มเส้น ──────
//   ไฟล์ ถอดทุน v20.1 ชีต "คิดทุน ตายดัดโค้ง" D14 = (กว้าง/600) × buf_scrap 1.3 × (1267+582)
//   เดิมเว็บ ceil(กว้าง/600) × 1849 → กว้าง 1 ม. คิด 1,849 แทน 400.62 → ทุนเกิน 50% (QA จับ 9 ก.ย.69)
console.log("\n═══ ⑪ บานติดตายดัดโค้ง — ทุนต้องตรงไฟล์ ═══");
{
  const r = computeCost(PB, PRODUCTS.curve_fixed, { w: 100, h: 50, p: 1, glassType: "เขียว 6มม." });
  const box = (r.lines || []).find((l) => /กล่องเปิด/.test(l.name || "")) || {};
  ok("กล่องเปิด+ตบปิดเปิด = 400.62 (ไม่ใช่ 1,849 เต็มเส้น)", Math.abs((box.amount || 0) - 400.62) < 0.5, String(box.amount));
  ok("ทุนรวม = 2,800 ตรงไฟล์ D15", r.cost.total === 2800, String(r.cost.total));
  ok("ค่าแรงผลิต 1,076 ตรงไฟล์ D21", Math.round(r.labor.prod) === 1076, String(r.labor.prod));
  ok("ค่าแรงติดตั้ง 2,519 ตรงไฟล์ D22", Math.round(r.labor.install) === 2519, String(r.labor.install));
  // ราคาขายยึด ★ ตาราง R4.1 (เจ้าของเคาะ 10 ก.ย.69) — เลขจาก PDF แถว "ตายดัดโค้ง 80×80": ผลิต 2,400 · ติดตั้ง 7,024 · รวม 15,400
  const t = computeCost(PB, PRODUCTS.curve_fixed, { w: 80, h: 80, p: 1, glassType: "เขียว 6มม." });
  ok("R4.1 แถว 80×80: ค่าผลิต (ขาย) 2,400 ตรงตาราง", t.sell.parts.prod === 2400, String(t.sell.parts.prod));
  ok("R4.1 แถว 80×80: ค่าติดตั้ง (ขาย) 7,024 ตรงตาราง", t.sell.parts.inst === 7024, String(t.sell.parts.inst));
  ok("R4.1 แถว 80×80: ยอดรวมใกล้ 15,400 (±2%)", Math.abs(t.sell.withInstall / 15400 - 1) <= 0.02, String(t.sell.withInstall));
  // กว้างขึ้นเป็น 2 เท่า ทุนกล่องต้องขึ้นเป็น 2 เท่า (ไม่ใช่กระโดดทีละเส้น)
  const r2 = computeCost(PB, PRODUCTS.curve_fixed, { w: 200, h: 50, p: 1, glassType: "เขียว 6มม." });
  const box2 = (r2.lines || []).find((l) => /กล่องเปิด/.test(l.name || "")) || {};
  ok("กว้าง 2 เท่า → ทุนกล่อง 2 เท่า (ไม่กระโดดเป็นเส้น)", Math.abs((box2.amount || 0) - (box.amount || 0) * 2) < 0.5, box.amount + " → " + box2.amount);
}

// ── ⑦ มอเตอร์ที่ฝังอยู่ในสูตรบาน (ไม่ใช่ออปชั่น) ก็ต้องขายฟิก ───────────
//   เจ้าของเคาะ 5 ก.ย.69: ประตูรั้วตัวแรก 25,000 · ระแนงหมุน 12,000
console.log("\n═══ ⑦ มอเตอร์ในสูตรบาน — ขายฟิก ทุนยังอยู่ในทุนรวม ═══");
{
  const R = (id, o) => computeCost(PB, PRODUCTS[id], { w: 300, h: 200, p: 2, glassType: "เขียว 6มม.", ...o });
  const fx = (r, re) => (r.lines || []).find((l) => l.fixedSell && re.test(l.name || "")) || {};

  const g = R("gate", {});
  ok("ประตูรั้ว มอเตอร์ในชุด ขาย 25,000 ฟิก", fx(g, /^มอเตอร์$/).sellFixed === 25000, String(fx(g, /^มอเตอร์$/).sellFixed));
  ok("ประตูรั้ว มอเตอร์ในชุด ยังโชว์ทุน 10,000", fx(g, /^มอเตอร์$/).cost === 10000, String(fx(g, /^มอเตอร์$/).cost));
  const gManual = R("gate", { spec: { drive: "มือผลัก (ไม่มีมอเตอร์)" } });
  ok("ประตูรั้วมือผลัก: ทุนรวมต่างกัน = ทุนมอเตอร์ 10,000", Math.round(g.cost.total - gManual.cost.total) === 10000, String(Math.round(g.cost.total - gManual.cost.total)));
  ok("ประตูรั้วมือผลัก: ขายต่างกัน = 25,000", Math.round(g.sell.withInstall - gManual.sell.withInstall) === 25000, String(Math.round(g.sell.withInstall - gManual.sell.withInstall)));
  const gp = (pp) => R("gate", { profitPct: pp, profitManual: true });
  ok("ประตูรั้ว: กด +/- กำไร ทุนรวมไม่ดิ้น", Math.round(gp(50).cost.total) === Math.round(gp(200).cost.total));

  const lv = R("louver_rotate", {});
  ok("ระแนงหมุน มอเตอร์ขาย 12,000 ฟิก", fx(lv, /มอเตอร์ระแนงหมุน/).sellFixed === 12000, String(fx(lv, /มอเตอร์ระแนงหมุน/).sellFixed));
  ok("ระแนงหมุน มอเตอร์ยังโชว์ทุน 1,800", fx(lv, /มอเตอร์ระแนงหมุน/).cost === 1800, String(fx(lv, /มอเตอร์ระแนงหมุน/).cost));
  const lvNo = R("louver_rotate", { spec: { rnMotor: "ไม่เอา" } });
  ok("ระแนงหมุน ไม่เอามอเตอร์: ทุนหาย 1,800", Math.round(lv.cost.total - lvNo.cost.total) === 1800, String(Math.round(lv.cost.total - lvNo.cost.total)));
  ok("ระแนงหมุน ไม่เอามอเตอร์: ขายหาย 12,000", Math.round(lv.sell.withInstall - lvNo.sell.withInstall) === 12000, String(Math.round(lv.sell.withInstall - lvNo.sell.withInstall)));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
