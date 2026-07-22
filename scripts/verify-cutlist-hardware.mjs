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
  console.log("SMS240 เฟี้ยม (2L2R แบ่งบาน · ขาว):");
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
}

console.log(fails === 0 ? "\n✅ verify-cutlist-hardware ผ่านหมด" : `\n❌ ล้มเหลว ${fails} จุด`);
process.exit(fails === 0 ? 0 : 1);
