// เทียบ GABLE_MULTI (จั่วหลายด้าน) กับสูตรใน JR_จั่วหลายด้าน.xlsx ชีต "จั่วหลายด้าน"
// คำนวณอิสระในไฟล์นี้ (ไม่เรียก gm* ของโค้ดจริง) เพื่อ cross-check ไม่ให้ bug ซ้ำสองที่
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { computeCutList } from "../src/lib/cutlist/engine.ts";

const r1 = (x) => Math.round(x * 10) / 10;
const ceil = (x) => Math.ceil(x - 1e-9);
const SHEET = { "ไวนิล": { max: 100, w: 25 } };

// จำลองสูตร Excel อิสระ (ตาราง ③.5 + ④ สรุป) — ใช้ input object แบบ {W, ridgeH, sides:[{D,jointAfter}], ...}
function refCalc({ W, ridgeH, sides }) {
  const depth = W / 2;
  const E = r1(Math.sqrt(depth ** 2 + ridgeH ** 2));
  const n = sides.length;
  const active = sides.map((s) => s.D > 0);
  const AD = new Array(n).fill(0);
  const AE = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i > 0 && active[i] && active[i - 1]) {
      const j = sides[i - 1].jointAfter;
      AD[i] = j === "นูน" ? depth : j === "เว้า" ? -depth : 0;
    }
    if (i < n - 1 && active[i] && active[i + 1]) {
      const j = sides[i].jointAfter;
      AE[i] = j === "นูน" ? depth : j === "เว้า" ? -depth : 0;
    }
  }
  const J = sides.map((s, i) => (active[i] ? s.D + AD[i] + AE[i] : 0));
  const F = J.map((j, i) => (active[i] ? ceil(j / SHEET["ไวนิล"].max) + 1 : 0));
  const AF = F.map((f, i) => (f <= 1 ? 0 : J[i] / (f - 1)));
  const posRaw = [];
  const posCut = [];
  for (let i = 0; i < n; i++) {
    const raw = [], cut = [];
    for (let k = 0; k < (active[i] ? F[i] : 0); k++) {
      const leftF = AD[i] === 0 ? 1 : (k * AF[i]) / Math.abs(AD[i]);
      const rightF = AE[i] === 0 ? 1 : (J[i] - k * AF[i]) / Math.abs(AE[i]);
      const v = r1(E * Math.max(0, Math.min(1, leftF, rightF)));
      raw.push(v);
      cut.push(v <= 0 ? 0 : Math.max(r1(v - 10.2), 0));
    }
    posRaw.push(raw);
    posCut.push(cut);
  }
  const hip = [];
  for (let i = 0; i < n - 1; i++) {
    const jt = sides[i].jointAfter;
    hip.push((jt === "นูน" || jt === "เว้า") && active[i] && active[i + 1] ? r1(Math.sqrt(depth ** 2 + depth ** 2 + ridgeH ** 2)) : 0);
  }
  const ridgeTotal = sides.reduce((s, sd, i) => s + (active[i] ? sd.D : 0), 0);
  const ridgeNet = Math.max(ridgeTotal - 10.2, 0);
  const ridgeBars = ridgeNet > 0 ? ceil(ridgeNet / 600) : 0;
  const ridgeLen = ridgeBars > 0 ? r1(ridgeNet / ridgeBars) : 0;
  const tBeamCount = F.reduce((s, f, i) => s + (active[i] ? f - 1 : 0), 0);
  return { depth, E, J, F, posRaw, posCut, hip, ridgeTotal, ridgeNet, ridgeBars, ridgeLen, tBeamCount };
}

const spec = CUT_SPEC_BY_ID["gable_multi"];
let bad = 0;
function check(label, cond, detail) {
  if (!cond) { bad++; console.log(`❌ ${label} — ${detail}`); }
  else console.log(`✅ ${label}`);
}

// เคส 1: ค่า default ของไฟล์ (400/300/350/200, W=400, ridgeH=60, joint นูน/เว้า/นูน/ติดบ้าน/ติดบ้าน)
{
  const input = { ...spec.defaults };
  const ref = refCalc({
    W: 400, ridgeH: 60,
    sides: [
      { D: 400, jointAfter: "นูน" }, { D: 300, jointAfter: "เว้า" }, { D: 350, jointAfter: "นูน" },
      { D: 200, jointAfter: "ติดบ้าน" }, { D: 0, jointAfter: "ติดบ้าน" }, { D: 0, jointAfter: "" },
    ],
  });
  const res = computeCutList(spec, input, 1);
  console.log("\n=== เคส 1: default (400/300/350/200 · W=400 ridgeH=60) ===");
  check("depth=200,E=208.8", ref.depth === 200 && ref.E === 208.8, `depth=${ref.depth} E=${ref.E}`);
  check("ด้าน1 J=600 F=7", ref.J[0] === 600 && ref.F[0] === 7, `J=${ref.J[0]} F=${ref.F[0]}`);
  check("ด้าน1 ตำแหน่งดิบ [208.8×5,104.4,0]", JSON.stringify(ref.posRaw[0]) === JSON.stringify([208.8, 208.8, 208.8, 208.8, 208.8, 104.4, 0]), JSON.stringify(ref.posRaw[0]));
  check("ด้าน1 ตัดจริง [198.6×5,94.2,0]", JSON.stringify(ref.posCut[0]) === JSON.stringify([198.6, 198.6, 198.6, 198.6, 198.6, 94.2, 0]), JSON.stringify(ref.posCut[0]));
  check("ตะเข้ 1-2/2-3/3-4 = 289.1 ทุกมุม", ref.hip[0] === 289.1 && ref.hip[1] === 289.1 && ref.hip[2] === 289.1, JSON.stringify(ref.hip));
  check("ด้าน4-5/5-6 ไม่มีตะเข้ (ด้านไม่ใช้งาน)", ref.hip[3] === 0 && ref.hip[4] === 0, JSON.stringify(ref.hip));

  // เทียบกับ engine จริง (ต่อตำแหน่งของด้าน 1)
  for (let k = 0; k < 7; k++) {
    const row = res.rows.find((r) => r.name === `จันทัน ด้าน 1 #${k + 1} (×2 สโลป)`);
    const expLen = ref.posCut[0][k];
    const okLen = row && Math.abs(row.len - expLen) < 0.001;
    const okQty = row && row.qty === (expLen > 1e-6 ? 2 : 0);
    check(`engine จันทัน ด้าน1 #${k + 1} len/qty`, okLen && okQty, `len web=${row?.len} exp=${expLen} · qty web=${row?.qty} exp=${expLen > 1e-6 ? 2 : 0}`);
  }
  // edge code check: k=0 ควรเป็น 4×4 (ขอบเปิดจริง, ไม่ชนตะเข้ฝั่งซ้าย) เทียบรหัสกับ "คานตัวT" ที่รู้ว่าเป็น boxCode("4×4") แน่ๆ
  const tBeamRefCode = res.rows.find((r) => r.name === "คานตัวT คานนอน 4×4")?.code;
  const rowK0 = res.rows.find((r) => r.name === "จันทัน ด้าน 1 #1 (×2 สโลป)");
  check("ด้าน1 #1 (k=0) รหัส 4×4 (ขอบเปิด)", rowK0 && rowK0.code === tBeamRefCode, `code=${rowK0?.code} exp=${tBeamRefCode}`);
  const rowK4 = res.rows.find((r) => r.name === "จันทัน ด้าน 1 #5 (×2 สโลป)");
  check("ด้าน1 #5 (k=4) รหัส 1.6×4 (ในตัว, ต่างจาก 4×4)", rowK4 && rowK4.code !== tBeamRefCode, `code=${rowK4?.code} tbeamCode=${tBeamRefCode}`);

  // สัน/อกไก่: รวม 400+300+350+200=1250 − 10.2 = 1239.8 → 3 เส้น (⌈1239.8/600⌉=3) → 413.2667→413.3/เส้น
  const ridgeRow = res.rows.find((r) => r.name === "สัน/อกไก่ 4×4 (ต่อเนื่องทั้งหลัง)");
  check("สัน/อกไก่ รวม=1239.8 → 3 เส้น × 413.3", ref.ridgeBars === 3 && ridgeRow?.qty === 3 && Math.abs(ridgeRow.len - 413.3) < 0.05,
    `ridgeNet=${ref.ridgeNet} bars=${ref.ridgeBars} len(web)=${ridgeRow?.len} qty(web)=${ridgeRow?.qty}`);

  // คานตัวT: จำนวน = Σ(F_i−1) ด้านที่ใช้งาน = (7-1)+(F2-1)+(F3-1)+(F4-1)
  const tBeamH = res.rows.find((r) => r.name === "คานตัวT คานนอน 4×4");
  const tBeamV = res.rows.find((r) => r.name === "คานตัวT เสาตั้ง 4×4");
  check(`คานตัวT จำนวน=${ref.tBeamCount} (คานนอน+เสาตั้งเท่ากัน)`, tBeamH?.qty === ref.tBeamCount && tBeamV?.qty === ref.tBeamCount,
    `web H=${tBeamH?.qty} V=${tBeamV?.qty} exp=${ref.tBeamCount}`);
  check("คานตัวT คานนอน ยาว = W-20.4 = 379.6", Math.abs(tBeamH.len - 379.6) < 0.001, tBeamH.len);
  check("คานตัวT เสาตั้ง ยาว = ridgeH-10.2 = 49.8", Math.abs(tBeamV.len - 49.8) < 0.001, tBeamV.len);

  // ตะเข้ engine
  for (let i = 1; i <= 3; i++) {
    const row = res.rows.find((r) => r.name === `ตะเข้ ด้าน ${i}-${i + 1} (×2 สโลป)`);
    check(`engine ตะเข้ ${i}-${i + 1} = 289.1 ×2`, row && Math.abs(row.len - 289.1) < 0.001 && row.qty === 2, `len=${row?.len} qty=${row?.qty}`);
  }
  const hip45 = res.rows.find((r) => r.name === "ตะเข้ ด้าน 4-5 (×2 สโลป)");
  check("ตะเข้ 4-5 = 0 (ด้าน5 ไม่ใช้งาน)", hip45 && hip45.qty === 0, `qty=${hip45?.qty}`);

  // แผ่นหลังคา ด้าน1: K = ceil(J/25) = ceil(600/25)=24 → ×2 = 48 · ยาว = E = 208.8
  const sheetRow = res.rows.find((r) => r.name === "แผ่นหลังคา ด้าน 1 (×2 สโลป)");
  check("แผ่นหลังคา ด้าน1 ยาว 208.8 จำนวน 48", Math.abs(sheetRow.len - 208.8) < 0.001 && sheetRow.qty === 48, `len=${sheetRow.len} qty=${sheetRow.qty}`);

  // ราง/เชิงชาย ด้าน1: ยาว = J = 600 · qty=1 (ไม่ ×2 ตามสูตรไฟล์)
  const eaveRow = res.rows.find((r) => r.name === "ราง/เชิงชาย ด้าน 1");
  check("ราง/เชิงชาย ด้าน1 ยาว 600 จำนวน 1 (ไม่×2)", Math.abs(eaveRow.len - 600) < 0.001 && eaveRow.qty === 1, `len=${eaveRow.len} qty=${eaveRow.qty}`);

  // ด้าน 5/6 ไม่ใช้งาน → ไม่มีจันทัน/แผ่น/ราง
  const side5eave = res.rows.find((r) => r.name === "ราง/เชิงชาย ด้าน 5");
  check("ด้าน5 (ไม่ใช้งาน) ราง qty=0", side5eave && side5eave.qty === 0, `qty=${side5eave?.qty}`);
}

// เคส 2: 2 ด้านเท่านั้น (ตัด joint เหลือ นูน 1 จุด) — เช็คไม่พังตอนด้านน้อย
{
  const input = { ...spec.defaults, side1D: 500, side2D: 250, side3D: 0, side4D: 0, joint1: "นูน", joint2: "" };
  const ref = refCalc({
    W: 400, ridgeH: 60,
    sides: [{ D: 500, jointAfter: "นูน" }, { D: 250, jointAfter: "" }, { D: 0, jointAfter: "" }, { D: 0, jointAfter: "" }, { D: 0, jointAfter: "" }, { D: 0, jointAfter: "" }],
  });
  const res = computeCutList(spec, input, 1);
  console.log("\n=== เคส 2: 2 ด้าน (500/250 นูน) ===");
  check("ด้าน1 J=500+200=700 F=8", ref.J[0] === 700 && ref.F[0] === 8, `J=${ref.J[0]} F=${ref.F[0]}`);
  check("ด้าน2 J=250+200=450 F=6", ref.J[1] === 450 && ref.F[1] === 6, `J=${ref.J[1]} F=${ref.F[1]}`);
  check("ตะเข้ 1-2 = 289.1", ref.hip[0] === 289.1, ref.hip[0]);
  const hipRow = res.rows.find((r) => r.name === "ตะเข้ ด้าน 1-2 (×2 สโลป)");
  check("engine ตะเข้ 1-2 = 289.1 ×2", hipRow && Math.abs(hipRow.len - 289.1) < 0.001 && hipRow.qty === 2, `len=${hipRow?.len} qty=${hipRow?.qty}`);
  const ridgeRow = res.rows.find((r) => r.name === "สัน/อกไก่ 4×4 (ต่อเนื่องทั้งหลัง)");
  // รวม 500+250=750 -10.2=739.8 -> ceil(739.8/600)=2 -> 369.9/เส้น
  check("สัน/อกไก่ รวม 750 → 2 เส้น × 369.9", ridgeRow.qty === 2 && Math.abs(ridgeRow.len - 369.9) < 0.05, `qty=${ridgeRow.qty} len=${ridgeRow.len}`);
}

// เคส 3: ด้านเดียว (ไม่มีรอยต่อเลย) — จันทันควรเต็ม E ทุกตำแหน่ง (ไม่มีชนตะเข้), ตะเข้=0 ทุกจุด
{
  const input = { ...spec.defaults, side1D: 400, side2D: 0, side3D: 0, side4D: 0, joint1: "", joint2: "" };
  const res = computeCutList(spec, input, 1);
  console.log("\n=== เคส 3: ด้านเดียว (400, ไม่มีรอยต่อ) — เทียบ GABLE_STRAIGHT ===");
  // เมื่อไม่มีรอยต่อ ด้าน1 ควรมีพฤติกรรมเหมือน GABLE_STRAIGHT D=400 W=400 ridgeH=60 (single span)
  const straight = CUT_SPEC_BY_ID["gable_straight"];
  const resStraight = computeCutList(straight, { ...straight.defaults, W: 400, D: 400, ridgeH: 60 }, 1);
  const straightRafter = resStraight.rows.find((r) => r.name === "จันทัน 1.6×4 (2 ฝั่ง)");
  // straightRafter.len ควรเท่ากับ (E − หัก รางน้ำ 10.2) ของด้านเดี่ยว — เช็คว่าไม่มีจันทันไหนของ gable_multi ยาวเกิน E
  const anyRow = res.rows.find((r) => r.name === "จันทัน ด้าน 1 #1 (×2 สโลป)");
  check("ด้านเดี่ยว: ตำแหน่งแรกยาว = E-10.2 (เหมือนหักปลายทั้งสองข้าง = เต็มด้าน)",
    Math.abs(anyRow.len - straightRafter.len) < 0.15, `gable_multi=${anyRow.len} gable_straight=${straightRafter.len}`);
  const hipAny = res.rows.filter((r) => /^ตะเข้/.test(r.name));
  check("ด้านเดี่ยว: ไม่มีตะเข้เลย (qty ทุกจุด=0)", hipAny.every((r) => r.qty === 0), JSON.stringify(hipAny.map((r) => r.qty)));
}

console.log(bad ? `\n❌ ไม่ตรง ${bad} จุด` : "\n✅ ตรงกับสูตร Excel ทุกจุดที่ตรวจ");
process.exit(bad ? 1 : 0);
