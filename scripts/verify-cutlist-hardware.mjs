// เทียบ "จำนวนอุปกรณ์ + SKU" ที่พอร์ต vs สูตรในไฟล์ รวมใบตัด_JR_2 (ส่วน ⑤ สรุปอุปกรณ์)
//   รัน: node --experimental-strip-types --no-warnings scripts/verify-cutlist-hardware.mjs
import { CUT_SPEC_BY_ID } from "../src/lib/cutlist/products.ts";
import { computeCutList } from "../src/lib/cutlist/engine.ts";

let fails = 0;
const round1 = (x) => Math.round(x * 10) / 10;

// หา hardware row ตาม sku (หรือชื่อขึ้นต้น) แล้วเทียบจำนวน
function check(label, res, want) {
  for (const w of want) {
    const row = res.hardware.find((h) => (w.sku ? h.sku === w.sku && (w.nameHas ? h.name.includes(w.nameHas) : true) : h.name.includes(w.nameHas)));
    const got = row?.qty;
    const ok = row && Math.abs(got - w.qty) < 0.05 && (w.sku ? row.sku === w.sku : true);
    if (!ok) { fails++; console.log(`  ✗ ${label} · ${w.nameHas || w.sku}: want qty=${w.qty}${w.sku ? " sku=" + w.sku : ""} → got ${row ? `qty=${got} sku=${row.sku}` : "ไม่พบ"}`); }
    else console.log(`  ✓ ${label} · ${(w.nameHas || w.sku).padEnd(20)} qty=${got}${row.sku ? " " + row.sku : ""}`);
  }
}

// ── SMS อิสระ/สลับ · default W350 H159 N3 3รางเสียบ · ซ้าย=กุญแจ+ล็อค ขวา=ล็อค+ดัมมี่ · เมโทร/อบขาว ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_free"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  // felt อิสระ: 4*(ขวางบน+เสากุญแจ)*N + 2N*เฟรมบน + 2N*เฟรมล่าง + เฟรมข้าง (3รางเสียบ)
  const cross = round1((350 - 4.2 * 3 - 11.2) / 3), post = 159 - 6.1, top = 345.6, bot = 345.6, side = 159;
  const felt = round1((4 * (cross + post) * 3 + 2 * 3 * top + 2 * 3 * bot + side) / 100);
  console.log("SMS อิสระ/สลับ (N=3):");
  check("อิสระ", res, [
    { nameHas: "ล้อ 27", sku: "JR00576", qty: 6 },
    { nameHas: "มือจับ กุญแจ", sku: "JR00368", qty: 1 },
    { nameHas: "มือจับ ล็อค", sku: "JR00369", qty: 2 },
    { nameHas: "มือจับ ดัมมี่", sku: "JR00370", qty: 1 },
    { nameHas: "แกนมือจับ A", sku: "JR00478", qty: 4 },
    { nameHas: "แกนมือจับ B", sku: "JR00479", qty: 2 }, // H159>140 →1 ×lock2
    { nameHas: "ปลายมือจับ ดำ", sku: "JR00476", qty: 4 },
    { nameHas: "ตัวที เงิน", sku: "JR00475", qty: 2 },
    { nameHas: "ประกอบบาน", sku: "JR00864", qty: 12 },
    { nameHas: "ยึดล้อ", sku: "JR00863", qty: 12 },
    { nameHas: "ยางรูน้ำลง", sku: "JR00589", qty: 6 }, // 2+ceil((350-4.4-150)/50)=2+4
    { nameHas: "วาวรูน้ำออก", sku: "JR00485", qty: 6 },
    { nameHas: "ก้ามปูรับล็อค", sku: "JR00477", qty: 4 },
    { nameHas: "สักหลาด", sku: "JR00794", qty: felt },
  ]);
  // Digital lock ต้องไม่โผล่ (qty 0)
  if (res.hardware.some((h) => h.name.includes("Digital"))) { fails++; console.log("  ✗ Digital lock ไม่ควรโผล่ (qty 0)"); }
}

// ── SMS เปิดคู่กลาง · N=4 แต่สปส.บาน=2 ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_center"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  console.log("SMS เปิดคู่กลาง (สปส.=2):");
  check("คู่กลาง", res, [
    { nameHas: "ล้อ 27", sku: "JR00576", qty: 4 },  // 2*2
    { nameHas: "ประกอบบาน", sku: "JR00864", qty: 8 }, // 4*2
    { nameHas: "ยึดล้อ", sku: "JR00863", qty: 8 },
    { nameHas: "มือจับ กุญแจ", sku: "JR00368", qty: 1 },
    { nameHas: "มือจับ ล็อค", sku: "JR00369", qty: 2 },
  ]);
}

// ── SMS ลากจูง · N=3 → บานขยับ 2 · มือจับชุดเดียว (ซ้าย=กุญแจ+ล็อค) ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_tow"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  console.log("SMS ลากจูง (N=3 → 2 บาน · มือจับเดียว):");
  check("ลากจูง", res, [
    { nameHas: "ล้อ 27", sku: "JR00576", qty: 4 },  // 2*(3-1)
    { nameHas: "ประกอบบาน", sku: "JR00864", qty: 8 }, // 4*2
    { nameHas: "มือจับ กุญแจ", sku: "JR00368", qty: 1 },
    { nameHas: "มือจับ ล็อค", sku: "JR00369", qty: 1 },  // lock=1 (มือจับเดียว)
    { nameHas: "แกนมือจับ A", sku: "JR00478", qty: 2 },
    { nameHas: "ตัวที เงิน", sku: "JR00475", qty: 1 },
  ]);
  // ดัมมี่ ต้องไม่โผล่ (ซ้ายเดียว=กุญแจ+ล็อค → dummy0)
  if (res.hardware.some((h) => h.name.includes("ดัมมี่"))) { fails++; console.log("  ✗ ดัมมี่ ไม่ควรโผล่"); }
}

// ── มือจับ: เปลี่ยนยี่ห้อ/สี → SKU เปลี่ยน ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_free"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "Align", handleColor: "ดำ" }, 1);
  console.log("มือจับ Align/ดำ:");
  check("Align ดำ", res, [
    { nameHas: "มือจับ กุญแจ", sku: "JR00374", qty: 1 },  // Alignกุญแจดำ
    { nameHas: "มือจับ ล็อค", sku: "JR00375", qty: 2 },   // Alignล็อคดำ
  ]);
}

// ── sets คูณจำนวน: 2 ชุด → ล้อ 12 ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_free"];
  const res = computeCutList(spec, { ...spec.defaults }, 2);
  const roller = res.hardware.find((h) => h.sku === "JR00576");
  if (!roller || roller.qty !== 12) { fails++; console.log(`  ✗ sets×2 ล้อ want 12 got ${roller?.qty}`); }
  else console.log("  ✓ sets×2 · ล้อ 27 qty=12");
}

// ── PC Door · default W300 H240 แบ่ง2 (pcN=2 · บานเลื่อน=1) · ซ้าย=กุญแจ+ล็อค ขวา=ล็อค+ดัมมี่ ──
{
  const spec = CUT_SPEC_BY_ID["pc_door"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  console.log("PC Door (แบ่ง2):");
  check("PC", res, [
    { nameHas: "ล้อรางบน Hafele", sku: "JR00544", qty: 1 },
    { nameHas: "มือจับ กุญแจ", sku: "JR00368", qty: 1 },
    { nameHas: "มือจับ ล็อค", sku: "JR00369", qty: 2 },
    { nameHas: "มือจับ ดัมมี่", sku: "JR00370", qty: 1 },
    { nameHas: "แกนมือจับ A", sku: "JR00478", qty: 4 },
    { nameHas: "แกนมือจับ B", sku: "JR00479", qty: 2 },
    { nameHas: "ก้ามปูรับล็อค", sku: "JR00477", qty: 4 },
    { nameHas: "น็อตประกอบบาน", sku: "JR00864", qty: 4 },
    { nameHas: "หัวต่อราง", qty: 1 },
    { nameHas: "ฝาครอบราง", qty: 2 },
    { nameHas: "บานพับไม่บาก", sku: "JR00473", qty: 4 },
    { nameHas: "กลอน", sku: "JR00630", qty: 1 },
    { nameHas: "ปลายกลอน", sku: "JR00598", qty: 1 },
  ]);
  // แบ่ง4 → บานเลื่อน 2 · ล้อ 2 · ฝาครอบราง 4
  const r4 = computeCutList(spec, { ...spec.defaults, split: "แบ่ง 4" }, 1);
  const roll = r4.hardware.find((h) => h.sku === "JR00544");
  if (!roll || roll.qty !== 2) { fails++; console.log(`  ✗ PC แบ่ง4 ล้อ want 2 got ${roll?.qty}`); } else console.log("  ✓ PC แบ่ง4 · ล้อ Hafele qty=2");
  // สีดำ → บานพับไม่บาก JR00474
  const rBlack = computeCutList(spec, { ...spec.defaults, handleColor: "ดำ" }, 1);
  const hinge = rBlack.hardware.find((h) => h.name.includes("บานพับไม่บาก"));
  if (!hinge || hinge.sku !== "JR00474") { fails++; console.log(`  ✗ PC ดำ บานพับ want JR00474 got ${hinge?.sku}`); } else console.log("  ✓ PC ดำ · บานพับไม่บาก JR00474");
}

// ── บานโซลิด · default W120 H279 N2 แม่-ลูก motherW80 มีธรณี · ขาว ล็อคปกติ เปิดออก · แม่=คิงโบล็อค+กุญแจ ลูก=ไม่ใส่ ──
{
  const spec = CUT_SPEC_BY_ID["solid_door"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  console.log("บานโซลิด (แม่-ลูก):");
  check("โซลิด", res, [
    { nameHas: "บานพับ hyda", sku: "JR00489", qty: 8 },  // แม่4 + ลูก4×1
    { nameHas: "สปิงก็อท", sku: "JR00482", qty: 8 },      // 4×2
    { nameHas: "ฉากประคองมุม", sku: "JR00557", qty: 16 }, // 8×2
    { nameHas: "มือจับ ล็อค+กุญแจ (คิงโบ)", sku: "JR00315", qty: 1 },
    { nameHas: "ตลับกุญแจไฮด้า", sku: "JR00551", qty: 1 },
    { nameHas: "ไส้กุญแจ", sku: "JR00499", qty: 1 },
    { nameHas: "แผ่นรับล็อค", sku: "JR00562", qty: 1 },
    { nameHas: "CDQ", sku: "JR00596", qty: 1 },
    { nameHas: "น็อตเฟรม", sku: "JR00864", qty: 8 },
    { nameHas: "ยางกรอบบาน", sku: "JR00771", qty: 13.6 },
    { nameHas: "ยางวงกบ", sku: "JR00771", qty: 8 },
  ]);
  // ดัมมี่+ดัมมี่/Cmech ต้องไม่โผล่ที่ default
  if (res.hardware.some((h) => h.name.includes("ดัมมี่+ดัมมี่") || h.name.includes("Cmech"))) { fails++; console.log("  ✗ โซลิด: ดัมมี่/Cmech ไม่ควรโผล่"); }
  // สีดำ → บานพับ JR00488 · คิงโบ JR00314
  const rB = computeCutList(spec, { ...spec.defaults, hwColor: "ดำ" }, 1);
  const h1 = rB.hardware.find((h) => h.name.includes("บานพับ hyda"));
  const h2 = rB.hardware.find((h) => h.name.includes("ล็อค+กุญแจ (คิงโบ)"));
  if (!h1 || h1.sku !== "JR00488" || !h2 || h2.sku !== "JR00314") { fails++; console.log(`  ✗ โซลิด ดำ: บานพับ ${h1?.sku} คิงโบ ${h2?.sku}`); } else console.log("  ✓ โซลิด ดำ · บานพับ JR00488 · คิงโบ JR00314");
  // มัลติพ้อยล็อค → ตลับ JR00553 · เปิดเข้า → ไส้ JR00498
  const rM = computeCutList(spec, { ...spec.defaults, lockType: "มัลติพ้อยล็อค", openDir: "เปิดเข้า" }, 1);
  const t = rM.hardware.find((h) => h.name.includes("ตลับกุญแจ")); const c = rM.hardware.find((h) => h.name.includes("ไส้กุญแจ"));
  if (!t || t.sku !== "JR00553" || !c || c.sku !== "JR00498") { fails++; console.log(`  ✗ โซลิด มัลติ/เข้า: ตลับ ${t?.sku} ไส้ ${c?.sku}`); } else console.log("  ✓ โซลิด มัลติพ้อย JR00553 · เปิดเข้า JR00498");
}

// ── toprail (รางบนเฟรม) · default N2 SMS อิสระ → บานเลื่อน 2 · ใช้ handle table ──
{
  const spec = CUT_SPEC_BY_ID["toprail_frame"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  console.log("toprail รางบนเฟรม (N2 อิสระ):");
  check("toprail", res, [
    { nameHas: "ล้อรางบน Hafele", sku: "JR00544", qty: 2 },
    { nameHas: "มือจับ กุญแจ", sku: "JR00368", qty: 1 },
    { nameHas: "มือจับ ล็อค", sku: "JR00369", qty: 2 },
    { nameHas: "น็อตประกอบบาน", sku: "JR00864", qty: 8 },
  ]);
}

// ── SlimLux · default N3 อิสระ ยัดในช่อง กล่องสั้นซ้าย → บานเลื่อน 3 ──
{
  const spec = CUT_SPEC_BY_ID["slimlux_slide"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  console.log("SlimLux (N3 อิสระ · กล่องสั้นซ้าย):");
  check("SlimLux", res, [
    { nameHas: "กล่องยาว", sku: "JR00573", qty: 2 },
    { nameHas: "กล่องสั้น ซ้าย", sku: "JR00575", qty: 1 },
    { nameHas: "ล้อล่าง", sku: "JR00572", qty: 6 },
  ]);
  if (res.hardware.some((h) => h.name.includes("กล่องสั้น ขวา"))) { fails++; console.log("  ✗ SlimLux: กล่องสั้นขวา ไม่ควรโผล่ (เลือกซ้าย)"); }
}

// ── SMS240 เฟี้ยม · default 2L2R แบ่งบาน ขาว (LUT 2_2_1) ──
{
  const spec = CUT_SPEC_BY_ID["sms240_bifold"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  console.log("SMS240 เฟี้ยม (2L2R แบ่งบาน · เงิน):");
  check("เฟี้ยม", res, [
    { nameHas: "บานพับ (ระดับเดียว)", sku: "JR00610", qty: 2 },
    { nameHas: "ล้อแขวนบานตาย ซ้าย", sku: "JR00612", qty: 1 },
    { nameHas: "ล้อแขวนบานตาย ขวา", sku: "JR00613", qty: 1 },
    { nameHas: "ล้อแขวนบานกลาง (Meeting)", sku: "JR00616", qty: 1 },
    { nameHas: "สลักล็อค", sku: "JR00563", qty: 2 },
    { nameHas: "ยางเฟรม", sku: "JR00804", qty: 12 },
  ]);
  // สีดำ → บานพับเดียว JR00602
  const rB = computeCutList(spec, { ...spec.defaults, hwColor: "ดำ" }, 1);
  const hp = rB.hardware.find((h) => h.name.includes("บานพับ (ระดับเดียว)"));
  if (!hp || hp.sku !== "JR00602") { fails++; console.log(`  ✗ เฟี้ยม ดำ บานพับ want JR00602 got ${hp?.sku}`); } else console.log("  ✓ เฟี้ยม ดำ · บานพับ JR00602");
  // 3L3R: แบ่งบาน → สลักล็อค 6 · เดี่ยว → 2 (พิสูจน์ fold2)
  const rS = computeCutList(spec, { ...spec.defaults, rail: "3L3R", N: 6, fold2: "แบ่งบาน" }, 1);
  const rD = computeCutList(spec, { ...spec.defaults, rail: "3L3R", N: 6, fold2: "เดี่ยว" }, 1);
  const bS = rS.hardware.find((h) => h.name.includes("สลักล็อค"))?.qty;
  const bD = rD.hardware.find((h) => h.name.includes("สลักล็อค"))?.qty;
  if (bS !== 6 || bD !== 2) { fails++; console.log(`  ✗ เฟี้ยม 3L3R สลักล็อค แบ่งบาน=${bS}(ควร6) เดี่ยว=${bD}(ควร2)`); } else console.log("  ✓ เฟี้ยม 3L3R · แบ่งบาน สลักล็อค=6 · เดี่ยว=2");
}

// ── FUJI เลื่อนสลับ · default W350 2ราง (p=2) · ซ้าย=กุญแจ+ล็อค ขวา=ล็อค+ดัมมี่ ──
{
  const spec = CUT_SPEC_BY_ID["fuji_slide"];
  const res = computeCutList(spec, { ...spec.defaults }, 1);
  console.log("FUJI เลื่อนสลับ (2ราง):");
  check("FUJI", res, [
    { nameHas: "ล้อ 20", sku: "JR00577", qty: 4 },
    { nameHas: "มือจับ กุญแจ", sku: "JR00368", qty: 1 },
    { nameHas: "มือจับ ล็อค", sku: "JR00369", qty: 2 },
    { nameHas: "แกนมือจับ A", sku: "JR00478", qty: 4 },
    { nameHas: "ก้ามปูรับล็อค", sku: "JR00477", qty: 4 },
    { nameHas: "สปิงก็อท", sku: "JR00592", qty: 8 },
    { nameHas: "ฉากประกอบมุม", sku: "JR00480", qty: 32 },
    { nameHas: "ยางรูน้ำ", sku: "JR00589", qty: 6 },
    { nameHas: "วาวรูน้ำ", sku: "JR00485", qty: 6 },
  ]);
}

// ── FUJI บานเปิด (casement · ไม่มีธรณี) + ประตูเดี่ยว (มีธรณี) = SKU ชุดเดียวกับโซลิด ──
{
  const sw = computeCutList(CUT_SPEC_BY_ID["fuji_swing"], { ...CUT_SPEC_BY_ID["fuji_swing"].defaults }, 1);
  console.log("FUJI บานเปิด (casement):");
  check("FUJIเปิด", sw, [
    { nameHas: "บานพับ hyda", sku: "JR00489", qty: 4 },
    { nameHas: "สปิงก็อท", sku: "JR00482", qty: 4 },
    { nameHas: "ฉากประคองมุม", sku: "JR00557", qty: 8 },
    { nameHas: "มือจับ ล็อค+กุญแจ (คิงโบ)", sku: "JR00315", qty: 1 },
    { nameHas: "ตลับกุญแจไฮด้า", sku: "JR00551", qty: 1 },
    { nameHas: "น็อตเฟรม", sku: "JR00864", qty: 6 },
  ]);
  const dr = computeCutList(CUT_SPEC_BY_ID["fuji_door"], { ...CUT_SPEC_BY_ID["fuji_door"].defaults }, 1);
  console.log("FUJI ประตูเดี่ยว (มีธรณี):");
  check("FUJIประตู", dr, [
    { nameHas: "บานพับ hyda", sku: "JR00489", qty: 4 },
    { nameHas: "น็อตเฟรม", sku: "JR00864", qty: 8 },  // มีธรณี → 8
    { nameHas: "แผ่นรับล็อค", sku: "JR00562", qty: 1 },
  ]);
  // CDQ/ปลายกลอน (บานลอง) — ประตูเดี่ยว N คงที่ 1 (ไม่มีบานลอง) → ต้องเป็น 0 เสมอ (ไม่โผล่ในผลลัพธ์)
  if (dr.hardware.some((h) => h.name.includes("บานลอง"))) { fails++; console.log("  ✗ FUJIประตู: แถว (บานลอง) ไม่ควรโผล่ (qty ต้อง 0)"); }
  else console.log("  ✓ FUJIประตู · CDQ/ปลายกลอน (บานลอง) qty=0 ไม่โผล่ (ถูกต้อง — บานเดี่ยว)");
}

// ── v2: มือจับ Cmech แตก 3 sub-choice ตรงไฟล์ (FUJI ประตูเดี่ยว มีธรณี R71-86 · B67 COUNTIF 5 แบบ) ──
//   "Cmech กุญแจ+ล็อค" → กุญแจ(noStock)+ล็อค · "Cmech ล็อค+ดัมมี่" → ล็อค+ดัมมี่ · "Cmech ดัมมี่+ดัมมี่" → ดัมมี่×2 (ห้ามออกครบ 3 พร้อมกัน)
{
  const spec = CUT_SPEC_BY_ID["fuji_door"];
  console.log("FUJI ประตูเดี่ยว · Cmech 3 sub-choice (แยกตามไฟล์ v2):");

  const rKL = computeCutList(spec, { ...spec.defaults, motherHandle: "Cmech กุญแจ+ล็อค" }, 1);
  check("Cmech กุญแจ+ล็อค", rKL, [
    { nameHas: "Cmech กุญแจ", sku: "JR00293", qty: 1 },
    { nameHas: "Cmech ล็อค", sku: "JR00291", qty: 1 },
  ]);
  if (rKL.hardware.some((h) => h.name.includes("Cmech ดัมมี่"))) { fails++; console.log("  ✗ Cmech กุญแจ+ล็อค: Cmech ดัมมี่ ไม่ควรโผล่ (qty ต้อง 0)"); }
  else console.log("  ✓ Cmech กุญแจ+ล็อค · Cmech ดัมมี่ ไม่โผล่ (qty=0)");
  const cmech = rKL.hardware.find((h) => h.name.includes("Cmech กุญแจ"));
  if (!cmech || !cmech.noStock) { fails++; console.log("  ✗ Cmech กุญแจ ต้อง noStock=true"); } else console.log("  ✓ Cmech กุญแจ noStock=true");

  const rLD = computeCutList(spec, { ...spec.defaults, motherHandle: "Cmech ล็อค+ดัมมี่" }, 1);
  check("Cmech ล็อค+ดัมมี่", rLD, [
    { nameHas: "Cmech ล็อค", sku: "JR00291", qty: 1 },
    { nameHas: "Cmech ดัมมี่", sku: "JR00289", qty: 1 },
  ]);
  if (rLD.hardware.some((h) => h.name.includes("Cmech กุญแจ"))) { fails++; console.log("  ✗ Cmech ล็อค+ดัมมี่: Cmech กุญแจ ไม่ควรโผล่ (qty ต้อง 0)"); }
  else console.log("  ✓ Cmech ล็อค+ดัมมี่ · Cmech กุญแจ ไม่โผล่ (qty=0)");

  const rDD = computeCutList(spec, { ...spec.defaults, motherHandle: "Cmech ดัมมี่+ดัมมี่" }, 1);
  check("Cmech ดัมมี่+ดัมมี่", rDD, [{ nameHas: "Cmech ดัมมี่", sku: "JR00289", qty: 2 }]);
  if (rDD.hardware.some((h) => h.name.includes("Cmech กุญแจ") || h.name.includes("Cmech ล็อค"))) { fails++; console.log("  ✗ Cmech ดัมมี่+ดัมมี่: กุญแจ/ล็อค ไม่ควรโผล่ (qty ต้อง 0)"); }
  else console.log("  ✓ Cmech ดัมมี่+ดัมมี่ · กุญแจ/ล็อค ไม่โผล่ (qty=0)");

  // ยังเลือกคิงโบได้ปกติ (Cmech ไม่ควรโผล่เลย)
  const rKingbo = computeCutList(spec, { ...spec.defaults }, 1);
  if (rKingbo.hardware.some((h) => h.name.includes("Cmech"))) { fails++; console.log("  ✗ เลือกคิงโบ (default) ไม่ควรมีแถว Cmech ใดๆ"); }
  else console.log("  ✓ default คิงโบ · ไม่มีแถว Cmech");
}

// ── v2: FUJI_SWING รหัสเฟรมข้าง/เฟรมบน ผูกกับมุ้ง (ไม่ใช่ F7938 ตายตัว) — 2 sheet แยกกันจริงในไฟล์ ──
{
  const spec = CUT_SPEC_BY_ID["fuji_swing"];
  const noMesh = computeCutList(spec, { ...spec.defaults, mesh: "ไม่ใส่" }, 1);
  const withMesh = computeCutList(spec, { ...spec.defaults, mesh: "ใส่" }, 1);
  const codeOf = (res, name) => res.rows.find((r) => r.name === name)?.code;
  console.log("FUJI บานเปิด · รหัสเฟรมผูกมุ้ง:");
  if (codeOf(noMesh, "เฟรมข้าง") !== "F7859" || codeOf(noMesh, "เฟรม บน") !== "F7859") {
    fails++; console.log(`  ✗ ไม่ใส่มุ้ง ต้องเป็น F7859 (เฟรมข้าง=${codeOf(noMesh, "เฟรมข้าง")} เฟรมบน=${codeOf(noMesh, "เฟรม บน")})`);
  } else console.log("  ✓ ไม่ใส่มุ้ง · เฟรมข้าง/เฟรมบน = F7859");
  if (codeOf(withMesh, "เฟรมข้าง") !== "F7938" || codeOf(withMesh, "เฟรม บน") !== "F7938") {
    fails++; console.log(`  ✗ ใส่มุ้ง ต้องเป็น F7938 (เฟรมข้าง=${codeOf(withMesh, "เฟรมข้าง")} เฟรมบน=${codeOf(withMesh, "เฟรม บน")})`);
  } else console.log("  ✓ ใส่มุ้ง · เฟรมข้าง/เฟรมบน = F7938");
  // ความยาวต้องเท่าเดิมไม่ว่ามุ้งจะใส่หรือไม่
  const lenOf = (res, name) => res.rows.find((r) => r.name === name)?.len;
  if (lenOf(noMesh, "เฟรมข้าง") !== lenOf(withMesh, "เฟรมข้าง") || lenOf(noMesh, "เฟรม บน") !== lenOf(withMesh, "เฟรม บน")) {
    fails++; console.log("  ✗ ความยาวเฟรมข้าง/เฟรมบน ต้องเท่ากันไม่ว่ามุ้งใส่หรือไม่");
  } else console.log("  ✓ ความยาวเฟรมข้าง/เฟรมบน เท่าเดิมทั้ง 2 กรณี");
}

// ── v2: มือจับ "อื่นๆ พิมพ์เอง" — ข้ามแถว SKU ปกติ + ออกแถว noStock ชื่อที่พิมพ์ ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_free"];
  const res = computeCutList(spec, { ...spec.defaults, handleL: "อื่นๆ", handleL_other: "มือจับพิเศษ ABC" }, 1);
  console.log("SMS อิสระ · handleL=อื่นๆ (พิมพ์เอง):");
  const other = res.hardware.find((h) => h.name === "มือจับพิเศษ ABC");
  if (!other || other.qty !== 1 || !other.noStock) { fails++; console.log(`  ✗ ต้องมีแถวชื่อ 'มือจับพิเศษ ABC' qty=1 noStock=true (got ${JSON.stringify(other)})`); }
  else console.log("  ✓ แถว 'มือจับพิเศษ ABC' qty=1 noStock=true");
  // handleL=อื่นๆ → มือจับกุญแจ/ล็อค/ดัมมี่ ปกติ (ฝั่งซ้าย) ต้องไม่นับรวม (ขวายังเป็นล็อค+ดัมมี่ตามค่าเริ่มต้น)
  const lock = res.hardware.find((h) => h.name.includes("มือจับ ล็อค ("));
  if (!lock || lock.qty !== 1) { fails++; console.log(`  ✗ มือจับ ล็อค ต้องเหลือ 1 (จากขวาอย่างเดียว) got ${lock?.qty}`); } else console.log("  ✓ มือจับ ล็อค (ปกติ) qty=1 — นับเฉพาะฝั่งขวา");

  const spec2 = CUT_SPEC_BY_ID["fuji_door"];
  const res2 = computeCutList(spec2, { ...spec2.defaults, motherHandle: "อื่นๆ", motherHandle_other: "" }, 1);
  const other2 = res2.hardware.find((h) => h.qty === 1 && h.noStock && h.name === "มือจับ (อื่นๆ)");
  if (!other2) { fails++; console.log("  ✗ FUJIประตู motherHandle=อื่นๆ (ไม่พิมพ์ชื่อ) ต้องมีแถว 'มือจับ (อื่นๆ)' qty=1"); }
  else console.log("  ✓ FUJIประตู motherHandle=อื่นๆ ไม่พิมพ์ชื่อ → ป้ายกลาง 'มือจับ (อื่นๆ)'");
  if (res2.hardware.some((h) => h.name.includes("คิงโบ") || h.name.includes("Cmech"))) { fails++; console.log("  ✗ motherHandle=อื่นๆ ไม่ควรมีแถวคิงโบ/Cmech"); }
}

// ── v2: ประตูรั้ว ล้อวิ่ง 3" — เดิม qty คงที่ 2 → กว้าง>400 เพิ่มทุก 100 ซม. (Excel R39) ──
{
  const spec = CUT_SPEC_BY_ID["gate_slide"];
  const r1 = computeCutList(spec, { ...spec.defaults, W: 350 }, 1);
  const r2 = computeCutList(spec, { ...spec.defaults, W: 620 }, 1); // >400 → 2+ceil(220/100)=5
  const roller1 = r1.hardware.find((h) => h.name.includes("ล้อวิ่ง"));
  const roller2 = r2.hardware.find((h) => h.name.includes("ล้อวิ่ง"));
  console.log("ประตูรั้ว ล้อวิ่ง 3\" (W>400 เพิ่มล้อ):");
  if (!roller1 || roller1.qty !== 2) { fails++; console.log(`  ✗ W350 ล้อวิ่ง ต้อง 2 got ${roller1?.qty}`); } else console.log("  ✓ W350 (≤400) · ล้อวิ่ง qty=2");
  if (!roller2 || roller2.qty !== 5) { fails++; console.log(`  ✗ W620 ล้อวิ่ง ต้อง 5 got ${roller2?.qty}`); } else console.log("  ✓ W620 (>400) · ล้อวิ่ง qty=5 (2+⌈220/100⌉)");
}

console.log(fails === 0 ? "\n✅ verify-cutlist-hardware ผ่านหมด" : `\n❌ ล้มเหลว ${fails} จุด`);
process.exit(fails === 0 ? 0 : 1);
