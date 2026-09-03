#!/usr/bin/env node
/**
 * verify-roof-slide — หลังคาเลื่อน (roof_slide) ต้องตรงชีต "คิดทุน หลังคาเลื่อน" ในไฟล์ถอดทุน v9
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ รุ่นนี้ "ไม่มีไฟล์ตัดประกอบ" (เจ้าของยืนยัน 27 ส.ค.69 "เอาแค่คิดราคาพอ")
 *   → ชีตถอดทุนคือแหล่งความจริงเดียว ห้ามคิดตัวเลขขึ้นมาเอง
 *
 * ตัวเลขอ้างอิงจากชีต (ไวนิล · ติดตาย 400×200 · เลื่อน 150×150 ×2 บาน · เลื่อนยื่น · แปเดี่ยว · มอเตอร์ 80 กก.):
 *   ติดตาย(วัสดุ) 24,390 · เลื่อน(วัสดุ) 24,340 · ราง 2,652 · ค่าแรงผลิต 10,050 · ติดตั้ง 19,125
 *   ⚠ ต่างชีต 660 บาท = กล่องเหล็ก 1"×1" ราคาสโตร์ 110 vs ชีต 170 (×11 เส้น) — รอเจ้าของเคาะว่าใช้ราคาไหน
 *
 *   node scripts/verify-roof-slide.mjs
 */
import fs from "node:fs";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
let pass = 0, fail = 0;
const ok = (label, cond, got = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`); };

const P = PRODUCTS.roof_slide;
const C = (o = {}) => computeCost(PB, P, {
  w: 400, h: 200, p: 2, form: "เลื่อนยื่น", material: "ไวนิล",
  color: "white", colorKey: "white", spec: {}, addons: {}, ...o,
});
const sum = (r, re) => Math.round(r.lines.filter((l) => re.test(l.name)).reduce((s, l) => s + (Number(l.amount) || 0), 0));
const line = (r, re) => r.lines.find((l) => re.test(l.name));

// ── ① ตรงชีตทีละก้อน ──
console.log("\n═══ ① ทุนแต่ละก้อน = ชีตถอดทุน (ไวนิล · 400×200 + เลื่อน 150×150 ×2) ═══");
{
  const r = C();
  // ต่างชีต 660 = กล่องเหล็ก 1"×1" คนละราคา (สโตร์ 110 · ชีต 170) — ยอมรับไว้ก่อน รอเจ้าของเคาะ
  // 3 ก.ย.69 v20.1: ติดตาย −602 = ฝาครอบไวนิล 16→6 เส้น (1 เส้น/แผ่น) −2,450 + แผ่น 6 ×1.2 buf_roof +1,848
  //                 เลื่อน −728 = ฝาครอบ 12→4 เส้น −1,960 + แผ่น 4 ×1.2 +1,232
  ok("ติดตาย (วัสดุ) 23,488 (ชีต v20 24,090 − ฝาครอบ + buf_roof)", sum(r, /ติดตาย/) === 23488, String(sum(r, /ติดตาย/)));
  ok("เลื่อน (วัสดุ) 23,252 (ชีต v20 23,980 − ฝาครอบ + buf_roof)", sum(r, /เลื่อน\)/) === 23252, String(sum(r, /เลื่อน\)/)));
  ok("ราง (2 ฝั่ง) 2,652 ตรงชีตเป๊ะ", sum(r, /^ราง/) === 2652, String(sum(r, /^ราง/)));
  ok("ค่าแรงผลิต 10,050 ตรงชีตเป๊ะ", Math.round(r.labor.prod) === 10050, String(Math.round(r.labor.prod)));
  ok("ค่าแรงติดตั้ง 19,125 ตรงชีตเป๊ะ", Math.round(r.labor.install) === 19125, String(Math.round(r.labor.install)));
}

// ── ② จุดที่เคยตรึงตายตัว ต้องขยับตามที่กรอกแล้ว ──
console.log("\n═══ ② ช่องที่เคยตรึงตายตัว (ของเดิมกรอกไม่ได้) ═══");
{
  ok("มีช่องกรอกขนาดส่วนเลื่อน กว้าง/ยื่น", ["slidew", "slideh"].every((k) => (P.specOpts ?? []).some((o) => o.key === k && o.type === "number")));
  ok("มีช่องเลือกแป (ชีตมี B4)", (P.specOpts ?? []).some((o) => o.key === "batten"));
  const base = C().cost.total;
  ok("ส่วนเลื่อนใหญ่ขึ้น = แพงขึ้น", C({ spec: { slidew: "300", slideh: "200" } }).cost.total > base);
  ok("ส่วนเลื่อนเล็กลง = ถูกลง", C({ spec: { slidew: "100", slideh: "100" } }).cost.total < base);
  ok("แปคู่ (กล่องถูกกว่า) = ถูกลง", C({ spec: { batten: "แปคู่" } }).cost.total < base);
  ok("บานเลื่อนมากขึ้น = แพงขึ้น", C({ p: 4 }).cost.total > base);
  // ราง: เลื่อนยื่น = ยาวตามยื่น · รูปแบบอื่น = ยาวตามกว้าง (ชีต D12) — ต้องต่างกันเมื่อ กว้าง ≠ ยื่น
  const s = { slidew: "300", slideh: "150" };
  ok("รูปแบบเลื่อนเปลี่ยน → ความยาวรางเปลี่ยน (ชีต D12)",
    sum(C({ form: "เลื่อนยื่น", spec: s }), /^ราง/) !== sum(C({ form: "เลื่อนข้าง", spec: s }), /^ราง/),
    `${sum(C({ form: "เลื่อนยื่น", spec: s }), /^ราง/)} vs ${sum(C({ form: "เลื่อนข้าง", spec: s }), /^ราง/)}`);
}

// ── ③ แผ่นไวนิลตัดจากแผ่นยาว 7 ม. (ชีต H7/J7) ──
console.log("\n═══ ③ แผ่นไวนิล — 1 แผ่น (ยาว 7 ม.) ตัดได้หลายแถบ ═══");
{
  // ติดตาย 400 กว้าง → 16 แถบ · ยื่น 200 → แผ่นละ 3 แถบ → ซื้อ 6 แผ่น (ไม่ใช่ 16)
  ok("ติดตาย ยื่น 200 → 6 แผ่น (ไม่ใช่ 16)", line(C(), /^แผ่นไวนิล \(ติดตาย\)/)?.qty === 6, String(line(C(), /^แผ่นไวนิล \(ติดตาย\)/)?.qty));
  // ยื่น 350 → แผ่นละ 2 แถบ → 8 แผ่น
  ok("ยื่นลึกขึ้น (350) → ตัดได้/แผ่นน้อยลง → 8 แผ่น", line(C({ h: 350 }), /^แผ่นไวนิล \(ติดตาย\)/)?.qty === 8, String(line(C({ h: 350 }), /^แผ่นไวนิล \(ติดตาย\)/)?.qty));
  // ฝาครอบยังนับต่อแถบเหมือนเดิม (ชีต H8 ไม่มีการหารแผ่น)
  ok("ฝาครอบไวนิล = 1 เส้น/แผ่น → 6 (v20.1 H8 หารแผ่นแล้ว · เดิม 16 ต่อแถบ)", line(C(), /^ฝาครอบไวนิล \(ติดตาย\)/)?.qty === 6, String(line(C(), /^ฝาครอบไวนิล \(ติดตาย\)/)?.qty));
}

// ── ④ ค่าแรงคิดจากพื้นที่ ติดตาย + เลื่อน×บาน ──
console.log("\n═══ ④ ค่าแรงคิดจากพื้นที่รวม (ชีต D14/D15 = เรต × (H3 + J3×บาน)) ═══");
{
  ok("ไม่ฝังค่าแรงเป็นบรรทัดวัสดุแล้ว", !P.consum.some((c) => /ค่าแรง/.test(String(c.name))));
  ok("ผูกตารางค่าแรงกลาง 'หลังคาเลื่อน'", P.laborKey === "หลังคาเลื่อน");
  ok("พื้นที่ = ติดตาย + เลื่อน×บาน", P.areaExpr === "fArea + sArea*P");
  const r = C(), rate = PB.LABOR["หลังคาเลื่อน"];
  ok("ค่าแรงผลิต = 804 × 12.5 ตร.ม.", Math.round(r.labor.prod) === Math.round(rate.pRate * 12.5));
  ok("บานเยอะขึ้น → ค่าแรงเยอะขึ้น (พื้นที่โต)", C({ p: 4 }).labor.prod > r.labor.prod);
}

// ── ⑤ วัสดุมุงทุกชนิดต้องมีราคา ──
console.log("\n═══ ⑤ วัสดุมุงครบ 8 ชนิด ต้องออกราคา ไม่มี 0 ═══");
{
  const bad = [];
  for (const m of P.materials) {
    const r = C({ material: m });
    const sheets = r.lines.filter((l) => l.cat === "consum" && /แผ่น|ชินโคร์|กระจก|เมทัล/.test(l.name) && l.qty > 0);
    if (!sheets.length || sheets.some((l) => !(l.unitPrice > 0))) bad.push(m);
  }
  ok(`${P.materials.length} ชนิด ออกราคาครบ`, bad.length === 0, bad.join(","));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
