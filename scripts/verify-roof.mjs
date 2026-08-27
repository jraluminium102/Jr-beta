#!/usr/bin/env node
/**
 * verify-roof — กันสาดเพิง คิดราคา 4.0 (`roof`) ต้องตรงใบตัด `awning` (ไฟล์ JR_กันสาด ชีต "กันสาดเพิง")
 * ─────────────────────────────────────────────────────────────────────────────
 * เจ้าของเคาะ 27 ส.ค.69: ① ระยะจันทัน ไวนิล = 75 (ตามใบตัด ไม่ใช่ 100 ตามชีตถอดทุน)
 *                        ② กล่องเหล็ก 1"×1" = เก็บไว้ (ใบตัดเขียน "ยกเลิก" แต่ของจริงยังใช้)
 *                        ③ นับเส้นแบบปัดขึ้นเส้นเต็ม (จัดชิ้นลงเส้นจริง เหมือนประตูรั้ว)
 *
 *   node scripts/verify-roof.mjs
 */
import fs from "node:fs";
import { computeCutList } from "../src/lib/cutlist/engine.ts";
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { cutInputFromRecipe } from "../src/lib/cutlist/from-recipe.ts";
import { computeCost } from "../src/lib/calculator40/engine.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";

const PB = JSON.parse(fs.readFileSync("src/lib/calculator40/pricebook.json", "utf8"));
const SPEC = CUT_SPEC_BY_ID.awning;
let pass = 0, fail = 0;
const ok = (label, cond, got = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`);
};
const cut = (o) => computeCutList(SPEC, { ...SPEC.defaults, ...o }, 1);
const row = (r, n) => r.rows.find((x) => x.name === n);

// ── ① ค่าที่เจ้าของเคาะ ต้องอยู่ในสูตร ──
console.log("\n═══ ① ค่าที่เจ้าของเคาะ 27 ส.ค.69 ═══");
{
  const P = PRODUCTS.roof;
  const E1 = (material) => new Function("material", `return ${P.vars.E1}`)(material);
  ok("ระยะจันทัน ไวนิล = 75 (ตามใบตัด ไม่ใช่ 100 ตามชีตถอดทุน)", E1("ไวนิล") === 75, String(E1("ไวนิล")));
  ok("วัสดุที่ใบตัดไม่มีชนิดแผ่น (กระจก) ตกไปไวนิล 75 เหมือน from-recipe", E1("กระจก 4+4") === 75, String(E1("กระจก 4+4")));
  ok('กล่องเหล็ก 1"×1" ยังอยู่ (เจ้าของสั่งเก็บไว้)', P.consum.some((c) => /กล่องเหล็ก/.test(c.name)));
  ok("นับเส้นแบบจัดชิ้นลงเส้นจริง (packBars)", P.packBars === true && SPEC.packBars === true);
  ok("โครงผูกรหัสกล่องในสโตร์ครบทุกบรรทัด",
    P.alu.length > 0 && P.alu.every((a) => !!a.code && !!a.box), P.alu.filter((a) => !a.code).map((a) => a.name).join(","));
}

// ── ② เทียบตัวอย่างกับใบตัดตรง ๆ (400×200 ไวนิล แปเดี่ยว) ──
console.log("\n═══ ② โครงตรงใบตัด (400×200 · ไวนิล · แปเดี่ยว · ปลาย=รางน้ำ) ═══");
{
  const r = cut({ W: 400, P: 200, sheet: "ไวนิล", purlin: "แปเดี่ยว" });
  // จันทันรวม = ⌈400/75⌉+1 = 7 · ช่อง 6 · แถวแป = ⌈200/50⌉+1 = 5
  ok("จันทันรวม 7 แนว (ระยะ 75)", row(r, "จันทันซอย 1.6×4").qty === 7, String(row(r, "จันทันซอย 1.6×4").qty));
  ok("จันทันรัดรอบ กว้าง = W−0.4 × 2", row(r, "จันทันรัดรอบ (กว้าง หน้า-หลัง)").len === 399.6);
  ok("แป เดี่ยว = ช่อง 6 × แถว 5 = 30 ท่อน", row(r, "แป (ยัดในช่อง)").qty === 30, String(row(r, "แป (ยัดในช่อง)").qty));
  ok("แป เดี่ยว ใช้กล่อง 1.6×1.6", row(r, "แป (ยัดในช่อง)").code === 'กล่อง 1.6"x1.6"');
  const rd = cut({ W: 400, P: 200, sheet: "ไวนิล", purlin: "แปคู่" });
  ok("แป คู่ = 30 × 2 = 60 ท่อน · กล่อง 1×1½",
    rd.rows.find((x) => x.name === "แป (ยัดในช่อง)").qty === 60 && rd.rows.find((x) => x.name === "แป (ยัดในช่อง)").code === 'กล่อง 1"x1.5"');
}

// ── ③ กวาดทุกคอมบิเนชัน — จำนวนชิ้นต่อรหัส ฝั่งคิดราคาต้องเท่าใบตัด ──
console.log("\n═══ ③ กวาดทุกรูปแบบ — ชิ้นต่อรหัส ใบตัด = คิดราคา ═══");
{
  const MAT = ["ไวนิล", "ดีไลท์", "โพลีตัน", "ชินโคร์ HC", "ชินโคร์ Sup", 'เมทัล 1" PVC', "กระจก 4+4"];
  let n = 0; const bad = [];
  for (const material of MAT)
    for (const batten of ["แปเดี่ยว", "แปคู่"])
      for (const [w, h] of [[400, 200], [200, 200], [600, 150], [800, 400], [300, 500]]) {
        n++;
        const spec = { batten };
        const calc = computeCost(PB, PRODUCTS.roof, { w, h, p: 1, form: "หลังคาเพิง", material, color: "white", colorKey: "white", spec, addons: {} });
        const map = cutInputFromRecipe({ kind: "std", prodId: "roof", w, h, p: 1, form: "หลังคาเพิง", material, spec }, { rawCompare: true });
        const c = computeCutList(SPEC, map.input, 1);
        const calcPc = new Map(), cutPc = new Map();
        for (const l of calc.lines) if (l.cat === "alu" && l.code) calcPc.set(l.code, (calcPc.get(l.code) ?? 0) + (Number(l.pieces) || 0));
        for (const x of c.rows) if (x.code && x.code !== "-" && x.qty > 0) cutPc.set(x.code, (cutPc.get(x.code) ?? 0) + x.qty);
        for (const [code, q] of cutPc) {
          const got = Math.round(calcPc.get(code) ?? 0);
          if (got !== q) bad.push(`${material}/${batten}/${w}×${h} ${code}: คิดราคา ${got} ≠ ใบตัด ${q}`);
        }
      }
  ok(`${n} คอมบิเนชัน — ชิ้นตรงกันทุกเคส`, bad.length === 0, bad.slice(0, 4).join(" · ") + (bad.length > 4 ? ` …อีก ${bad.length - 4}` : ""));
}

// ── ④ กฎที่ต้องไม่พัง ──
console.log("\n═══ ④ กฎที่ต้องไม่พัง ═══");
{
  const C = (o) => computeCost(PB, PRODUCTS.roof, { w: 400, h: 200, p: 1, form: "หลังคาเพิง", material: "ไวนิล", color: "white", colorKey: "white", spec: {}, addons: {}, ...o }).cost.total;
  ok("กว้างขึ้น = แพงขึ้น", C({ w: 400 }) < C({ w: 600 }));
  ok("ยื่นลึกขึ้น = แพงขึ้น", C({ h: 200 }) < C({ h: 400 }));
  // แปคู่ = 2 ท่อนต่อช่อง (กล่อง 1×1½) · แปเดี่ยว = 1 ท่อน (กล่อง 1.6×1.6) — ราคาต่อเส้นต่างกัน ไม่การันตีว่าคู่แพงกว่า
  {
    const pc = (b) => cut({ W: 400, P: 200, sheet: "ไวนิล", purlin: b }).rows.find((x) => x.name === "แป (ยัดในช่อง)").qty;
    ok("แปคู่ = 2 เท่าของแปเดี่ยว", pc("แปคู่") === pc("แปเดี่ยว") * 2, `${pc("แปคู่")} vs ${pc("แปเดี่ยว")}`);
  }
  // ระยะจันทันต่างตามวัสดุ → ชินโคร์ (138) ใช้จันทันน้อยกว่าไวนิล (75)
  const nr = (m) => cut({ W: 400, P: 200, sheet: m }).rows.find((x) => x.name === "จันทันซอย 1.6×4").qty;
  ok("ชินโคร์ (จันทัน 138) ใช้จันทันน้อยกว่าไวนิล (75)", nr("ชินโคร์ HC") < nr("ไวนิล"), `${nr("ชินโคร์ HC")} < ${nr("ไวนิล")}`);
}

// ── ⑤ หลังคาจั่ว (roof_gable) ต้องตรงใบตัด gable_straight ──
console.log("\n═══ ⑤ หลังคาจั่ว — คิดราคา = ใบตัด 'หลังคาจั่วตรง' ═══");
{
  const G = PRODUCTS.roof_gable, GS = CUT_SPEC_BY_ID.gable_straight;
  ok("สูงสัน เลือกได้แล้ว (เดิมตรึง 150)", (G.specOpts ?? []).some((o) => o.key === "ridge" && o.type === "number"));
  ok("แป/ปลายหลังคา เลือกได้ (ตรงช่องกรอกใบตัด)",
    ["batten", "roofend"].every((k) => (G.specOpts ?? []).some((o) => o.key === k)));
  ok("โครงผูกรหัสกล่องครบทุกบรรทัด", G.alu.length > 0 && G.alu.every((a) => !!a.code && !!a.box));
  ok("นับเส้นแบบจัดชิ้นลงเส้นจริง (packBars)", G.packBars === true && GS.packBars === true);
  const gE1 = (material) => new Function("material", `return ${G.vars.E1}`)(material);
  ok("ระยะจันทันไวนิล 75 ตรง ROOF_SHEET (เดิม 100)", gE1("ไวนิล") === 75, String(gE1("ไวนิล")));

  const MAT = ["ไวนิล", "ดีไลท์", "โพลีตัน", "ชินโคร์ HC", "ชินโคร์ Sup", "เมทัลชีท", "กระจก 4+4", "กระจก 5+5"];
  let n = 0; const bad = [];
  for (const material of MAT)
    for (const batten of ["แปเดี่ยว", "แปคู่"])
      for (const roofend of ["รางน้ำ", "ปล่อยปลาย"])
        for (const ridge of ["80", "150", "250"])
          for (const [w, h] of [[400, 200], [300, 300], [600, 400], [800, 250], [250, 500]]) {
            n++; const spec = { batten, roofend, ridge };
            const calc = computeCost(PB, G, { w, h, p: 1, form: "หลังคาจั่ว", material, color: "white", colorKey: "white", spec, addons: {} });
            const map = cutInputFromRecipe({ kind: "std", prodId: "roof_gable", w, h, p: 1, form: "หลังคาจั่ว", material, spec }, { rawCompare: true });
            const c = computeCutList(GS, map.input, 1);
            const A = new Map(), B = new Map();
            for (const l of calc.lines) if (l.cat === "alu" && l.code) A.set(l.code, (A.get(l.code) ?? 0) + (Number(l.pieces) || 0));
            for (const x of c.rows) if (x.code && x.code !== "-" && x.qty > 0) B.set(x.code, (B.get(x.code) ?? 0) + x.qty);
            for (const [code, q] of B) {
              const got = Math.round(A.get(code) ?? 0);
              if (got !== q) bad.push(`${material}/${batten}/${roofend}/สัน${ridge}/${w}×${h} ${code}: ${got} ≠ ${q}`);
            }
          }
  ok(`${n} คอมบิเนชัน — ชิ้นตรงกันทุกเคส`, bad.length === 0, bad.slice(0, 4).join(" · "));

  const GC = (o) => computeCost(PB, G, { w: 400, h: 200, p: 1, form: "หลังคาจั่ว", material: "ไวนิล", color: "white", colorKey: "white", spec: {}, addons: {}, ...o }).cost.total;
  ok("สันสูงขึ้น = แพงขึ้น (จันทันยาวขึ้น)", GC({ spec: { ridge: "80" } }) < GC({ spec: { ridge: "250" } }));
  const gp = (purlin) => computeCutList(GS, { ...GS.defaults, W: 400, D: 200, ridgeH: 150, purlin }, 1).rows.find((x) => x.name === "แป 1×1½").qty;
  ok("แปคู่ (ค่าตั้งต้นรุ่นนี้) ใช้แป 2 เท่าของแปเดี่ยว", gp("แปคู่") === 2 * gp("แปเดี่ยว"), `${gp("แปคู่")} vs ${gp("แปเดี่ยว")}`);
}

// ── ⑥ แผ่นไวนิล ขายเป็นแผ่นยาว 7 ม. เอามาตัดแบ่งเอง (เจ้าของยืนยัน 27 ส.ค.69) ──
//    เดิมนับ 1 แถบ = 1 แผ่น → คิดเงินเกินหลายเท่า (กันสาด 400×200 เกิน 15,400 บาท)
console.log("\n═══ ⑥ แผ่นไวนิล — 1 แผ่น (ยาว 7 ม.) ตัดได้หลายแถบ ═══");
{
  const V = (id, form, w, h) => {
    const r = computeCost(PB, PRODUCTS[id], { w, h, p: 1, form, material: "ไวนิล", color: "white", colorKey: "white", spec: {}, addons: {} });
    return r.lines.find((l) => /^แผ่นไวนิล/.test(l.name))?.qty ?? 0;
  };
  // กันสาด 400 กว้าง = 16 แถบ · ยื่น 200 → 1 แผ่นตัดได้ 3 แถบ → ซื้อ 6 แผ่น
  ok("กันสาด 400×200 → 6 แผ่น (ไม่ใช่ 16 แถบ)", V("roof", "หลังคาเพิง", 400, 200) === 6, String(V("roof", "หลังคาเพิง", 400, 200)));
  ok("ยื่นลึก 400 → ตัดได้แผ่นละแถบเดียว → 16 แผ่น", V("roof", "หลังคาเพิง", 400, 400) === 16, String(V("roof", "หลังคาเพิง", 400, 400)));
  // จั่ว: แถบ = ⌈ลึก/25⌉ ต่อสโลป · แถบยาวเท่าเฉียง (400×200 สัน 150 → เฉียง 250 → แผ่นละ 2 แถบ)
  ok("จั่ว 400×200 → 8 แผ่น (2 สโลป × ⌈8/2⌉)", V("roof_gable", "หลังคาจั่ว", 400, 200) === 8, String(V("roof_gable", "หลังคาจั่ว", 400, 200)));
  const cap = computeCost(PB, PRODUCTS.roof, { w: 400, h: 200, p: 1, form: "หลังคาเพิง", material: "ไวนิล", color: "white", colorKey: "white", spec: {}, addons: {} })
    .lines.find((l) => /^ฝาครอบไวนิล/.test(l.name));
  ok("ฝาครอบไวนิล ยังนับต่อแถบ 16 (ชีตไม่หารแผ่น)", cap?.qty === 16, String(cap?.qty));
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
