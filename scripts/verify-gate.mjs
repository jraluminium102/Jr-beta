#!/usr/bin/env node
/**
 * verify-gate — ประตูรั้วบานเลื่อน ต้องตรง "JR_ประตูรั้ว.xlsx" ทุกบรรทัด ทุกรูปแบบ
 * ─────────────────────────────────────────────────────────────────────────────
 * เจ้าของสั่ง 24 ส.ค.69 "คิดใหม่ทำใหม่ ยึดไฟล์ · เช็คให้ครบทุกรูปแบบ มันทำได้หลายรูปแบบมาก"
 *   รูปแบบ = แบบประกอบ 2 × แนวระแนง 2 × ชนิดใบ 2 × กล่อง 7 × ด้านโชว์ 6 × ช่องห่าง
 *   ล็อกไว้ 3 ชั้น: ① ตัวเลขตรงตัวอย่างในไฟล์ ② ใบตัด=คิดราคา ทุกคอมบิเนชัน ③ กฎที่ต้องไม่พัง
 *
 *   node scripts/verify-gate.mjs
 */
import fs from "node:fs";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { cutInputFromRecipe } from "../src/lib/cutlist/from-recipe.ts";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const SPEC = CUT_SPEC_BY_ID.gate_slide;
let pass = 0, fail = 0;
const ok = (label, cond, got = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`);
};
const cut = (o) => computeCutList(SPEC, { ...SPEC.defaults, ...o }, 1);
const row = (r, name) => r.rows.find((x) => x.name === name);
const barsOf = (r, code) => r.barsByCode.find((b) => b.code === code)?.bars ?? 0;

// ── ① ตัวอย่างในไฟล์: 350×180 · ยัดใน · ตั้ง · ระแนง · กล่อง 1×1.6 · โชว์ 1.6" · ห่าง 5 ──
console.log('\n═══ ① ตรงตัวอย่างในไฟล์ (350×180 ยัดใน ตั้ง ระแนง กล่อง 1×1.6 โชว์1.6" ห่าง5) ═══');
{
  const r = cut({});
  const want = [
    ["เสาตั้งข้าง (2×4)", 164.5, 2],
    ["เสานอนบน (2×4, รวมหาง)", 380, 1],
    ["เสานอนล่าง (2×4, รวมหาง)", 380, 1],
    ["เสาตั้งท้ายหาง (2×4)", 164.5, 1],
    ["เส้นทแยงค้ำมุมบน (2×4)", 39.1, 1],
    ["ใบระแนง A", 144.1, 39],
    ["ใบระแนง B (สลับ)", 0, 0],
    ['ฉากข้อ 2" (เฉพาะแปะนอก)', 350, 0],
    ["เสารับไกด์ (4×4) — เสาแยก", 180, 1],
    ['ราง ฉากเหล็ก 1.5"+เพลา 4หุน', 650, 1],
  ];
  for (const [name, len, qty] of want) {
    const x = row(r, name);
    ok(`${name}: ยาว ${len} × ${qty}`, x && Math.abs(x.len - len) < 0.05 && x.qty === qty, `${x?.len} × ${x?.qty}`);
  }
  // ④ สรุปจำนวนเส้น (ท่อน 6 ม.) ในไฟล์
  ok('④ กล่อง 2×4 = 3 เส้น', barsOf(r, 'กล่อง 2"x4"') === 3, String(barsOf(r, 'กล่อง 2"x4"')));
  ok("④ ใบระแนง A = 10 เส้น", barsOf(r, 'กล่อง 1"x1.6"') === 10, String(barsOf(r, 'กล่อง 1"x1.6"')));
  ok("④ เสารับไกด์ 4×4 = 1 เส้น", barsOf(r, 'กล่อง 4"x4"') === 1, String(barsOf(r, 'กล่อง 4"x4"')));
}

// ── ② ระแนงสลับ: ไฟล์บอก ท่อนรวม 39 = A 15 + B 24 (A3:B5 · โชว์เท่ากัน) ──
console.log("\n═══ ② ระแนงสลับ A3:B5 ตรงไฟล์ (รวม 39 = A 15 + B 24) ═══");
{
  const r = cut({ slatType: "ระแนงสลับ" });
  const a = row(r, "ใบระแนง A")?.qty, b = row(r, "ใบระแนง B (สลับ)")?.qty;
  ok("A = 15", a === 15, String(a));
  ok("B = 24", b === 24, String(b));
  ok("A+B = 39 เท่าเดี่ยว", a + b === 39, String(a + b));
  ok("ใบสลับยาวเท่าใบ A", row(r, "ใบระแนง B (สลับ)")?.len === row(r, "ใบระแนง A")?.len);
}

// ── ③ แปะนอก: เสาตั้งหักลึกกว่า · ใบระแนงบวก 5 · มีฉากข้อ 2" · เสารับไกด์ +5 ──
console.log("\n═══ ③ แปะนอก (⑥ แผงแก้ค่า) ═══");
{
  const inn = cut({}), out = cut({ fit: "แปะนอก" });
  ok("เสาตั้ง ยัดใน H−15.5 · แปะนอก H−17.5",
    row(inn, "เสาตั้งข้าง (2×4)").len === 164.5 && row(out, "เสาตั้งข้าง (2×4)").len === 162.5,
    `${row(inn, "เสาตั้งข้าง (2×4)").len} / ${row(out, "เสาตั้งข้าง (2×4)").len}`);
  ok("ใบระแนง ยัดใน −20.4 · แปะนอก +5",
    row(inn, "ใบระแนง A").len === 144.1 && row(out, "ใบระแนง A").len === 167.5,
    `${row(inn, "ใบระแนง A").len} / ${row(out, "ใบระแนง A").len}`);
  ok('ฉากข้อ 2" มีเฉพาะแปะนอก (ยาว = W)',
    row(inn, 'ฉากข้อ 2" (เฉพาะแปะนอก)').qty === 0 && row(out, 'ฉากข้อ 2" (เฉพาะแปะนอก)').qty === 1 && row(out, 'ฉากข้อ 2" (เฉพาะแปะนอก)').len === 350);
  ok("เสารับไกด์ ยัดใน H · แปะนอก H+5",
    row(inn, "เสารับไกด์ (4×4) — เสาแยก").len === 180 && row(out, "เสารับไกด์ (4×4) — เสาแยก").len === 185);
}

// ── ④ แนวระแนง: ตั้ง กระจายบนเสานอน(W) · นอน กระจายบนเสาตั้ง ──
console.log("\n═══ ④ แนวระแนง — ช่วงกระจายสลับด้าน (ตรงไฟล์ ② คำนวณ) ═══");
{
  const v = cut({ slatDir: "ตั้ง" }), h = cut({ slatDir: "นอน" });
  ok("ตั้ง: ใบยาว = เสาตั้ง−20.4 = 144.1 · จำนวนจาก W", row(v, "ใบระแนง A").len === 144.1 && row(v, "ใบระแนง A").qty === 39);
  // นอน: ช่วง = เสาตั้ง 164.5 → INT(164.5/9.06)+1 = 19 · ใบยาว = W−20.4 = 329.6
  ok("นอน: ใบยาว = W−20.4 = 329.6 · จำนวน 19 (ช่วง=เสาตั้ง)",
    row(h, "ใบระแนง A").len === 329.6 && row(h, "ใบระแนง A").qty === 19,
    `${row(h, "ใบระแนง A").len} × ${row(h, "ใบระแนง A").qty}`);
}

// ── ⑤ กวาดทุกคอมบิเนชัน: ใบตัด vs คิดราคา ต้องได้ "จำนวนเส้นต่อรหัส" เท่ากันเป๊ะ ──
console.log("\n═══ ⑤ กวาดทุกรูปแบบ — ใบตัด = คิดราคา (จำนวนเส้นต่อรหัส) ═══");
{
  const BOX = ["1x1", "1x1.5", "1x1.6", "1x4", "1x5", "1.6x1.6", "1.6x4"];
  const FACE = ["1", "5", "2.54", "3.81", "4.06", "10.16"];
  let n = 0; const bad = [];
  for (const gfit of ["ยัดใน", "แปะนอก"])
    for (const form of ["ตั้ง", "นอน"])
      for (const gslat of ["ระแนง", "ระแนงสลับ"])
        for (const material of BOX)
          for (const rnFace of FACE)
            for (const rnGap of [2, 5, 15])
              for (const [w, h] of [[350, 180], [600, 240], [200, 120]]) {
                n++;
                const spec = { gfit, gslat, rnFace, rnGap: String(rnGap), gboxB: material, gfaceB: rnFace, gaRun: "3", gbRun: "5" };
                const calc = computeCost(PB, PRODUCTS.gate, { w, h, p: 1, form, material, color: "white", colorKey: "white", spec, addons: {} });
                const map = cutInputFromRecipe({ kind: "std", prodId: "gate", w, h, p: 1, form, material, spec });
                const c = computeCutList(SPEC, map.input, 1);
                // รวมเส้นต่อรหัสฝั่งคิดราคา (poolBars ให้เศษเส้น → รวมแล้วปัดขึ้น = จำนวนเส้นจริง)
                const byCode = new Map();
                for (const l of calc.lines) if (l.cat === "alu" && l.code) byCode.set(l.code, (byCode.get(l.code) ?? 0) + (Number(l.qty) || 0));
                for (const b of c.barsByCode) {
                  const got = Math.round(byCode.get(b.code) ?? 0);
                  if (got !== b.bars) bad.push(`${gfit}/${form}/${gslat}/${material}/โชว์${rnFace}/ห่าง${rnGap}/${w}×${h} ${b.code}: คิดราคา ${got} ≠ ใบตัด ${b.bars}`);
                }
              }
  ok(`${n} คอมบิเนชัน — จำนวนเส้นตรงกันทุกเคส`, bad.length === 0, bad.slice(0, 4).join(" · ") + (bad.length > 4 ? ` …อีก ${bad.length - 4}` : ""));
}

// ── ⑥ กฎที่ต้องไม่พัง ──
console.log("\n═══ ⑥ กฎที่ต้องไม่พัง ═══");
{
  ok("ทุกเส้นอลูผูกรหัสสโตร์ (ยกเว้นรางเหล็ก ที่ยังไม่มีในสโตร์)",
    PRODUCTS.gate.alu.filter((a) => !a.code).every((a) => /ราง/.test(a.name)),
    PRODUCTS.gate.alu.filter((a) => !a.code).map((a) => a.name).join(","));
  ok("ทุกเส้นมี box ผูกชื่อกล่องในสโตร์ (ยกเว้นราง)",
    PRODUCTS.gate.alu.filter((a) => !a.box).every((a) => /ราง/.test(a.name)));
  const r = cut({});
  ok("อุปกรณ์ในใบตัดตั้งใจไม่ผูก sku (ไฟล์เขียน 'ไม่สต็อก ซื้อต่อออเดอร์ เว้นรหัส')",
    r.hardware.every((h) => !h.sku && h.noStock), r.hardware.map((h) => h.name + ":" + (h.sku || "-")).join(","));
  // ช่องห่างมาก = ใบน้อยลง = ถูกลง · ถี่ = แพงขึ้น (กันสูตรกลับด้าน)
  const cheap = computeCost(PB, PRODUCTS.gate, { w: 350, h: 180, p: 1, form: "ตั้ง", material: "1x1.6", color: "white", colorKey: "white", spec: { rnGap: "15" }, addons: {} });
  const dear = computeCost(PB, PRODUCTS.gate, { w: 350, h: 180, p: 1, form: "ตั้ง", material: "1x1.6", color: "white", colorKey: "white", spec: { rnGap: "2" }, addons: {} });
  ok("ห่าง 15 ถูกกว่า ห่าง 2", cheap.cost.total < dear.cost.total, `${Math.round(cheap.cost.total)} < ${Math.round(dear.cost.total)}`);
  // มือผลัก = ตัดมอเตอร์ 16,000
  const push = computeCost(PB, PRODUCTS.gate, { w: 350, h: 180, p: 1, form: "ตั้ง", material: "1x1.6", color: "white", colorKey: "white", spec: { drive: "มือผลัก (ไม่มีมอเตอร์)" }, addons: {} });
  const moto = computeCost(PB, PRODUCTS.gate, { w: 350, h: 180, p: 1, form: "ตั้ง", material: "1x1.6", color: "white", colorKey: "white", spec: {}, addons: {} });
  ok("มือผลัก = ตัดมอเตอร์ 16,000", Math.round(moto.cost.total - push.cost.total) === 16000, String(Math.round(moto.cost.total - push.cost.total)));
  // รีโมท 2 ตัว = +1,000
  const rem = computeCost(PB, PRODUCTS.gate, { w: 350, h: 180, p: 1, form: "ตั้ง", material: "1x1.6", color: "white", colorKey: "white", spec: { gremote: "2" }, addons: {} });
  ok("รีโมท 2 ตัว = +1,000 (ของใหม่ ตามไฟล์ ⑤)", Math.round(rem.cost.total - moto.cost.total) === 1000, String(Math.round(rem.cost.total - moto.cost.total)));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
