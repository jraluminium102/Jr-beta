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
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
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
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
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
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
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
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 2);
  const roller = res.hardware.find((h) => h.sku === "JR00576");
  if (!roller || roller.qty !== 12) { fails++; console.log(`  ✗ sets×2 ล้อ want 12 got ${roller?.qty}`); }
  else console.log("  ✓ sets×2 · ล้อ 27 qty=12");
}

// ── PC Door · default W300 H240 แบ่ง2 (pcN=2 · บานเลื่อน=1) · ซ้าย=กุญแจ+ล็อค ขวา=ล็อค+ดัมมี่ ──
{
  const spec = CUT_SPEC_BY_ID["pc_door"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
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
  const r4 = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร", split: "แบ่ง 4" }, 1);
  const roll = r4.hardware.find((h) => h.sku === "JR00544");
  if (!roll || roll.qty !== 2) { fails++; console.log(`  ✗ PC แบ่ง4 ล้อ want 2 got ${roll?.qty}`); } else console.log("  ✓ PC แบ่ง4 · ล้อ Hafele qty=2");
  // สีดำ → บานพับไม่บาก JR00474
  const rBlack = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร", handleColor: "ดำ" }, 1);
  const hinge = rBlack.hardware.find((h) => h.name.includes("บานพับไม่บาก"));
  if (!hinge || hinge.sku !== "JR00474") { fails++; console.log(`  ✗ PC ดำ บานพับ want JR00474 got ${hinge?.sku}`); } else console.log("  ✓ PC ดำ · บานพับไม่บาก JR00474");
}

// ── บานโซลิด · default W120 H279 N2 แม่-ลูก motherW80 มีธรณี · ขาว ล็อคปกติ เปิดออก · แม่=คิงโบล็อค+กุญแจ ลูก=ไม่ใส่ ──
{
  const spec = CUT_SPEC_BY_ID["solid_door"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
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
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
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
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
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
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
  console.log("SMS240 เฟี้ยม (2L2R แบ่งบาน · เงิน):");
  check("เฟี้ยม", res, [
    { nameHas: "บานพับ (ระดับเดียว)", sku: "JR00610", qty: 2 },
    { nameHas: "ล้อแขวนบานตาย ซ้าย", sku: "JR00612", qty: 1 },
    { nameHas: "ล้อแขวนบานตาย ขวา", sku: "JR00613", qty: 1 },
    { nameHas: "ล้อแขวนบานกลาง (Meeting)", sku: "JR00616", qty: 1 },
    // 05-014 ยังไม่มีในสโตร์ → ตั้งใจไม่ผูก sku (เดิมผูก JR00563 = CDQ CMECH คนละตัว หักผิดมาตลอด · เช็คสโตร์จริง 24 ส.ค.69)
    { nameHas: "สลักล็อค", sku: "", qty: 2 },
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
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
  console.log("FUJI เลื่อนสลับ (2ราง):");
  check("FUJI", res, [
    { nameHas: "ล้อ-15x20x230", sku: "JR00577", qty: 4 },
    { nameHas: "มือจับ กุญแจ", sku: "JR00368", qty: 1 },
    { nameHas: "มือจับ ล็อค", sku: "JR00369", qty: 2 },
    { nameHas: "แกนมือจับ A", sku: "JR00478", qty: 4 },
    { nameHas: "ก้ามปูรับล็อค", sku: "JR00477", qty: 4 },
    { nameHas: "สปิงก็อท", sku: "JR00592", qty: 8 },
    { nameHas: "ฉากประกอบมุม", sku: "JR00480", qty: 24 },   // 12/บาน × 2 บาน — เจ้าของเคาะ 21 ส.ค.69 (เดิมไฟล์เขียน 16/บาน)
    { nameHas: "ยางรูน้ำ", sku: "JR00589", qty: 6 },
    { nameHas: "วาวรูน้ำ", sku: "JR00485", qty: 6 },
  ]);
}

// ── FUJI บานเปิด (FUJI_SWING) — ชุดอุปกรณ์เฉพาะตัว (ไม่ใช่ชุดประตู) · default W80 H140 (≤180 → ล็อคเสริม=2) ──
{
  const sw = computeCutList(CUT_SPEC_BY_ID["fuji_swing"], { ...CUT_SPEC_BY_ID["fuji_swing"].defaults }, 1);
  console.log("FUJI บานเปิด (FUJI_SWING — ชุดใหม่):");
  check("FUJIเปิด", sw, [
    { nameHas: "มือจับ (บานเปิด/กระทุ้ง)", sku: "JR00304", qty: 1 },
    { nameHas: "CDQ กระทุ้ง", sku: "JR00566", qty: 1 },
    { nameHas: "วิทโก้", sku: "JR00559", qty: 2 },
    { nameHas: "ลูกเบี้ยวล็อค", sku: "JR00486", qty: 2 },
    { nameHas: "รับล็อคลูกเบี้ยว", sku: "JR00483", qty: 2 },
    { nameHas: "สปิงก็อท", sku: "JR00482", qty: 4 },
    { nameHas: "ฉากประคองมุม", sku: "JR00557", qty: 8 },
    { nameHas: "น็อตเฟรม", sku: "JR00864", qty: 8 },
    { nameHas: "ยางกรอบบาน", sku: "JR00770", qty: 4.4 }, // round(2*(80+140)/100,1)
    { nameHas: "ยางวงกบ", sku: "JR00770", qty: 4.4 },
  ]);
  // สูง>180 → ลูกเบี้ยวล็อค/รับล็อคลูกเบี้ยว เพิ่มทุก 50ซม. (H=250 → 2+ceil(70/50)=4)
  const swTall = computeCutList(CUT_SPEC_BY_ID["fuji_swing"], { ...CUT_SPEC_BY_ID["fuji_swing"].defaults, H: 250 }, 1);
  const lockQ = swTall.hardware.find((h) => h.name.includes("ลูกเบี้ยวล็อค"))?.qty;
  if (lockQ !== 4) { fails++; console.log(`  ✗ FUJIเปิด H250 ลูกเบี้ยวล็อค want 4 got ${lockQ}`); } else console.log("  ✓ FUJIเปิด H250 (>180) · ลูกเบี้ยวล็อค qty=4 (2+ceil(70/50))");
  // ชุดประตู (casementDoorHardware) ต้องไม่ปนมากับ FUJI_SWING แล้ว
  if (sw.hardware.some((h) => h.name.includes("คิงโบ") || h.name.includes("ตลับกุญแจไฮด้า"))) { fails++; console.log("  ✗ FUJI_SWING ไม่ควรมีอุปกรณ์ชุดประตู (คิงโบ/ตลับกุญแจ) ปนมา"); }
  else console.log("  ✓ FUJI_SWING ไม่มีอุปกรณ์ชุดประตูปนมา (แยกชุดสำเร็จ)");

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
  const rKingbo = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
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

// ── B) FUJI บานเลื่อน — รหัสอลู "เลื่อนสลับ2ราง" F7978(เฟรมข้าง)/F7976(เฟรมบน-ล่าง) — ยืนยันแล้วค่าเดิมถูกอยู่แล้ว (ไม่แก้) ──
{
  const spec = CUT_SPEC_BY_ID["fuji_slide"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
  const codeOf = (name) => res.rows.find((r) => r.name === name)?.code;
  console.log("FUJI บานเลื่อน (รหัสอลู):");
  if (codeOf("เฟรมข้าง") !== "F7978") { fails++; console.log(`  ✗ เฟรมข้าง ต้อง F7978 got ${codeOf("เฟรมข้าง")}`); } else console.log("  ✓ เฟรมข้าง = F7978");
  if (codeOf("เฟรม บน-ล่าง") !== "F7869") { fails++; console.log(`  ✗ เฟรม บน-ล่าง ต้อง F7869 (ตัวหนา) got ${codeOf("เฟรม บน-ล่าง")}`); } else console.log("  ✓ เฟรม บน-ล่าง = F7976");
}

// ── C) SMS เลื่อนอิสระ/สลับ (FREE) — เพิ่ม "ตบรางล้อ" F7994 (qty=N) + ระบบมุ้ง (เฟรมเล็ก=B30006 · เฟรมใหญ่=อลูหลัก+มือจับ/ล้อ) ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_free"];
  const base = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1); // W350 N3 mesh=ไม่มี
  const rowOf = (res, name) => res.rows.find((r) => r.name === name);
  console.log("SMS อิสระ/สลับ — ตบรางล้อ + มุ้ง:");
  const rail = rowOf(base, "ตบรางล้อ");
  if (!rail || rail.code !== "F7994" || rail.qty !== 3 || Math.abs(rail.len - 345.6) > 0.05) { fails++; console.log(`  ✗ ตบรางล้อ want code=F7994 qty=3 len=345.6 got ${JSON.stringify(rail)}`); }
  else console.log("  ✓ ตบรางล้อ F7994 qty=3(N) len=345.6(W-4.4)");

  const small = computeCutList(spec, { ...spec.defaults, N: 2, mesh: "เฟรมเล็ก", meshCount: 2 }, 1);
  const postSmall = rowOf(small, "เสาตั้งมุ้ง (เฟรมเล็ก)"), crossSmall = rowOf(small, "เสานอนมุ้ง (เฟรมเล็ก)");
  const rIn = rowOf(small, "ตบเฟรมบน/ล่าง ร่องในบน"), rOut = rowOf(small, "ตบเฟรมบน/ล่าง ร่องในล่าง");
  if (!postSmall || postSmall.code !== "B30006" || postSmall.qty !== 4) { fails++; console.log(`  ✗ เสาตั้งมุ้ง(เฟรมเล็ก) want code=B30006 qty=4 got ${JSON.stringify(postSmall)}`); } else console.log("  ✓ เสาตั้งมุ้ง (เฟรมเล็ก) B30006 qty=4 (2×meshCount)");
  if (!crossSmall || crossSmall.code !== "B30006" || crossSmall.qty !== 4) { fails++; console.log(`  ✗ เสานอนมุ้ง(เฟรมเล็ก) want code=B30006 qty=4 got ${JSON.stringify(crossSmall)}`); } else console.log("  ✓ เสานอนมุ้ง (เฟรมเล็ก) B30006 qty=4");
  if (rIn?.qty !== 0) { fails++; console.log(`  ✗ ร่องในบน ต้อง 0 เมื่อมีมุ้ง got ${rIn?.qty}`); } else console.log("  ✓ ร่องในบน = 0 (มีมุ้ง)");
  if (!rOut || rOut.code !== "B20048" || rOut.qty !== 1) { fails++; console.log(`  ✗ ร่องในล่าง want code=B20048 qty=1(N≤2→W-7) got ${JSON.stringify(rOut)}`); } else console.log("  ✓ ร่องในล่าง code=B20048 (เฟรมเล็ก) qty=1");

  const big = computeCutList(spec, { ...spec.defaults, mesh: "เฟรมใหญ่", meshCount: 2 }, 1);
  const lockPost = rowOf(big, "เสากุญแจมุ้ง (ใหญ่)"), railBig = rowOf(big, "ตบรางล้อ (มุ้งใหญ่)");
  if (!lockPost || lockPost.code !== "B20051" || lockPost.qty !== 2) { fails++; console.log(`  ✗ เสากุญแจมุ้ง(ใหญ่) want code=B20051 qty=2 got ${JSON.stringify(lockPost)}`); } else console.log("  ✓ เสากุญแจมุ้ง (ใหญ่) B20051 qty=2(meshCount)");
  if (!railBig || railBig.code !== "F7994" || railBig.qty !== 2) { fails++; console.log(`  ✗ ตบรางล้อ(มุ้งใหญ่) want code=F7994 qty=2 got ${JSON.stringify(railBig)}`); } else console.log("  ✓ ตบรางล้อ (มุ้งใหญ่) F7994 qty=2");
  check("มุ้งเฟรมใหญ่ อุปกรณ์", big, [
    { nameHas: "ล้อมุ้ง", sku: "JR00576", qty: 4 }, // 2*meshCount
    { nameHas: "มือจับมุ้ง กุญแจ", sku: "JR00368", qty: 1 },
    { nameHas: "มือจับมุ้ง ล็อค", sku: "JR00369", qty: 2 },
    { nameHas: "แกนมือจับ A มุ้ง", sku: "JR00478", qty: 4 },
  ]);
  // meshHandleL/R default = กุญแจ+ล็อค/ล็อค+ดัมมี่ → dummyCount=1 (จาก "ล็อค+ดัมมี่") เหมือนมือจับหลัก
  const dummyMesh = big.hardware.find((h) => h.name.includes("มือจับมุ้ง ดัมมี่"));
  if (!dummyMesh || dummyMesh.qty !== 1 || dummyMesh.sku !== "JR00370") { fails++; console.log(`  ✗ มือจับมุ้ง ดัมมี่ want qty=1 sku=JR00370 got ${JSON.stringify(dummyMesh)}`); } else console.log("  ✓ มือจับมุ้ง ดัมมี่ qty=1 JR00370 (จากล็อค+ดัมมี่ ฝั่งขวา)");
}

// ── C) SMS เปิดคู่กลาง (CENTER) — มุ้งคงที่ 2 เสมอ ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_center"];
  const base = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
  const rail = base.rows.find((r) => r.name === "ตบรางล้อ");
  console.log("SMS เปิดคู่กลาง — ตบรางล้อ + มุ้ง:");
  if (!rail || rail.code !== "F7994" || rail.qty !== 2) { fails++; console.log(`  ✗ ตบรางล้อ (CENTER) want F7994 qty=2 got ${JSON.stringify(rail)}`); } else console.log("  ✓ ตบรางล้อ F7994 qty=2 (สปส.คงที่)");
  const big = computeCutList(spec, { ...spec.defaults, mesh: "เฟรมใหญ่" }, 1);
  const wheel = big.hardware.find((h) => h.name.includes("ล้อมุ้ง"));
  if (!wheel || wheel.qty !== 4 || wheel.sku !== "JR00576") { fails++; console.log(`  ✗ CENTER มุ้งใหญ่ ล้อมุ้ง want qty=4 sku=JR00576 got ${JSON.stringify(wheel)}`); } else console.log("  ✓ CENTER มุ้งใหญ่ · ล้อมุ้ง qty=4 (2 มุ้งคงที่)");
}

// ── C) SMS ลากจูง (TOW) — ตบรางล้อ qty=N (ดิบ ไม่ใช่ N-1) ──
{
  const spec = CUT_SPEC_BY_ID["sms_slide_tow"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1); // N=3
  const rail = res.rows.find((r) => r.name === "ตบรางล้อ");
  console.log("SMS ลากจูง — ตบรางล้อ (N ดิบ):");
  if (!rail || rail.code !== "F7994" || rail.qty !== 3) { fails++; console.log(`  ✗ ตบรางล้อ (TOW) want F7994 qty=3(N) got ${JSON.stringify(rail)}`); } else console.log("  ✓ ตบรางล้อ F7994 qty=3 (N ดิบ ไม่ใช่ N-1)");
}

// ── D) กันสาดเพิง (AWNING) — จันทัน max ไวนิล 75 · ค่าหักปิดปลาย/รางน้ำ · กล่องครอบเพลท×0.25 · แปเดี่ยว · ลบกล่องเหล็ก · override จันทันรวม ──
{
  const spec = CUT_SPEC_BY_ID["awning"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1); // W300 ไวนิล P150 deg7 รางน้ำ
  console.log("กันสาดเพิง (AWNING):");
  const jack = res.rows.find((r) => r.name === "จันทันซอย 1.6×4");
  if (!jack || jack.qty !== 5) { fails++; console.log(`  ✗ จันทันซอย qty ต้อง 5 (⌈300/75⌉+1) got ${jack?.qty}`); } else console.log("  ✓ จันทัน max ไวนิล=75 → จันทันซอย qty=5");
  if (res.rows.some((r) => r.name.includes("กล่องเหล็ก"))) { fails++; console.log("  ✗ กล่องเหล็ก 1x1 ไม่ควรมีแล้ว (ไฟล์ยกเลิก)"); } else console.log("  ✓ ไม่มีโปรไฟล์ 'กล่องเหล็ก' แล้ว (ยกเลิกตามไฟล์)");
  const plate = res.rows.find((r) => r.name.includes("กล่องครอบเพลท"));
  const rake = res.rows.find((r) => r.name === "แผ่นหลังคา")?.len ?? 0;
  if (!plate || Math.abs(plate.len - rake * 0.25) > 0.05) { fails++; console.log(`  ✗ กล่องครอบเพลท want ${rake * 0.25} got ${plate?.len}`); } else console.log(`  ✓ กล่องครอบเพลท = ยื่นเอียง×0.25 (${plate.len})`);
  const purlinCouple = res.rows.find((r) => r.name.startsWith("แป ("));
  if (!purlinCouple || !purlinCouple.code.includes("1\"x1.5\"")) { fails++; console.log(`  ✗ แปคู่(default) code ต้องเป็นกล่อง 1x1.5 got ${purlinCouple?.code}`); } else console.log("  ✓ แปคู่(default) code = กล่อง 1\"x1.5\"");
  const single = computeCutList(spec, { ...spec.defaults, purlin: "แปเดี่ยว" }, 1);
  const purlinSingle = single.rows.find((r) => r.name.startsWith("แป ("));
  if (!purlinSingle || !purlinSingle.code.includes("1.6\"x1.6\"")) { fails++; console.log(`  ✗ แปเดี่ยว code ต้องเป็นกล่อง 1.6x1.6 got ${purlinSingle?.code}`); } else console.log("  ✓ แปเดี่ยว code = กล่อง 1.6\"x1.6\"");
  // ค่าหักจันทันซอย: ปิดปลาย=2.5 · รางน้ำ=10.2 (เดิม 16.5/14.7)
  const closed = computeCutList(spec, { ...spec.defaults, roofEnd: "ปิดปลาย" }, 1);
  const jackClosed = closed.rows.find((r) => r.name === "จันทันซอย 1.6×4");
  const rakeClosed = closed.rows.find((r) => r.name === "แผ่นหลังคา")?.len ?? 0;
  if (!jackClosed || Math.abs(jackClosed.len - (rakeClosed - 2.5)) > 0.05) { fails++; console.log(`  ✗ จันทันซอย ปิดปลาย ค่าหักต้อง 2.5 got len=${jackClosed?.len} rake=${rakeClosed}`); } else console.log("  ✓ จันทันซอย ปิดปลาย ค่าหัก=2.5 (เดิม 16.5)");
  const jackRain = res.rows.find((r) => r.name === "จันทันซอย 1.6×4");
  if (!jackRain || Math.abs(jackRain.len - (rake - 10.2)) > 0.05) { fails++; console.log(`  ✗ จันทันซอย รางน้ำ ค่าหักต้อง 10.2 got len=${jackRain?.len} rake=${rake}`); } else console.log("  ✓ จันทันซอย รางน้ำ ค่าหัก=10.2 (เดิม 14.7)");
  // override จันทันรวม (ช่างกรอกเอง)
  const overridden = computeCutList(spec, { ...spec.defaults, rakeTotal: 6 }, 1);
  const jackOv = overridden.rows.find((r) => r.name === "จันทันซอย 1.6×4");
  if (!jackOv || jackOv.qty !== 6) { fails++; console.log(`  ✗ จันทันรวม override=6 ต้อง qty=6 got ${jackOv?.qty}`); } else console.log("  ✓ จันทันรวม override (rakeTotal=6) → จันทันซอย qty=6");
}

// ── E) SMS 240 เฟี้ยม — มุมตัด 45°(default)/90° ──
{
  const spec = CUT_SPEC_BY_ID["sms240_bifold"];
  console.log("SMS240 เฟี้ยม — มุมตัด 45°/90°:");
  const r45 = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1); // 2L2R default = 45°
  const r90 = computeCutList(spec, { ...spec.defaults, cutAngle: "90°" }, 1);
  const sash45 = r45.rows.find((r) => r.name === "ขวางบน+ล่าง")?.len;
  const sash90 = r90.rows.find((r) => r.name === "ขวางบน+ล่าง")?.len;
  if (Math.abs(sash45 - 83.9) > 0.05) { fails++; console.log(`  ✗ 45° (2L2R) ขวางบน+ล่าง want 83.9 got ${sash45}`); } else console.log("  ✓ 45° (2L2R สมมาตร) · ขวางบน+ล่าง = 83.9");
  if (Math.abs(sash90 - 74.4) > 0.05) { fails++; console.log(`  ✗ 90° (2L2R) ขวางบน+ล่าง want 74.4 got ${sash90}`); } else console.log("  ✓ 90° (สูตรเดิม) · ขวางบน+ล่าง = 74.4");
  // เสากุญแจ: จำนวนมาจาก config เสมอ (smsCfg.lock) ไม่ผูกมุมตัด — 3L3R (N=6) lock=1 ทั้ง 45°/90° (ไม่ใช่ INT(N/2)=3)
  const lock45 = computeCutList(spec, { ...spec.defaults, rail: "3L3R", N: 6, cutAngle: "45°" }, 1).rows.find((r) => r.name === "เสากุญแจ")?.qty;
  const lock90 = computeCutList(spec, { ...spec.defaults, rail: "3L3R", N: 6, cutAngle: "90°" }, 1).rows.find((r) => r.name === "เสากุญแจ")?.qty;
  if (lock45 !== 1 || lock90 !== 1) { fails++; console.log(`  ✗ เสากุญแจ 3L3R ต้อง=1 ทั้ง 45°/90° (จาก config) got 45°=${lock45} 90°=${lock90}`); } else console.log("  ✓ เสากุญแจ 3L3R · lock=1 ทั้ง 45°/90° (มาจาก config ไม่ผูกมุมตัด)");
}

// ── F) รางบนเฟรม (TOPRAIL_FRAME) — เพิ่ม "ไกด์ดำ" (noStock) ──
{
  const spec = CUT_SPEC_BY_ID["toprail_frame"];
  console.log("รางบนเฟรม — ไกด์ดำ:");
  const free = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1); // sashMode=อิสระ
  const tow = computeCutList(spec, { ...spec.defaults, sashMode: "ลากจูง" }, 1);
  const gFree = free.hardware.find((h) => h.name.includes("ไกด์ดำ"));
  const gTow = tow.hardware.find((h) => h.name.includes("ไกด์ดำ"));
  if (!gFree || gFree.qty !== 2 || !gFree.noStock) { fails++; console.log(`  ✗ ไกด์ดำ (อิสระ) want qty=2 noStock got ${JSON.stringify(gFree)}`); } else console.log("  ✓ ไกด์ดำ อิสระ qty=2 noStock=true");
  if (!gTow || gTow.qty !== 1) { fails++; console.log(`  ✗ ไกด์ดำ (ลากจูง) want qty=1 got ${JSON.stringify(gTow)}`); } else console.log("  ✓ ไกด์ดำ ลากจูง qty=1");
}

// ── G) บานโซลิด — Cmech แยก 2 sub-choice + ตลับ/ไส้/รับล็อค=0 เมื่อ Digital lock/ไม่ใส่ ──
{
  const spec = CUT_SPEC_BY_ID["solid_door"];
  console.log("บานโซลิด — Cmech แยก + Digital/ไม่ใส่:");
  const cKL = computeCutList(spec, { ...spec.defaults, motherHandle: "Cmech ล็อค+กุญแจ" }, 1);
  const hKL = cKL.hardware.find((h) => h.name === "มือจับ Cmech ล็อค+กุญแจ");
  if (!hKL || hKL.qty !== 1 || !hKL.noStock) { fails++; console.log(`  ✗ Cmech ล็อค+กุญแจ want qty=1 noStock got ${JSON.stringify(hKL)}`); } else console.log("  ✓ Cmech ล็อค+กุญแจ qty=1 noStock=true");
  if (cKL.hardware.some((h) => h.name === "มือจับ Cmech ดัมมี่+ดัมมี่")) { fails++; console.log("  ✗ Cmech ดัมมี่+ดัมมี่ ไม่ควรโผล่เมื่อเลือกล็อค+กุญแจ"); }

  const cDD = computeCutList(spec, { ...spec.defaults, motherHandle: "Cmech ดัมมี่+ดัมมี่" }, 1);
  const hDD = cDD.hardware.find((h) => h.name === "มือจับ Cmech ดัมมี่+ดัมมี่");
  if (!hDD || hDD.qty !== 1) { fails++; console.log(`  ✗ Cmech ดัมมี่+ดัมมี่ want qty=1 got ${JSON.stringify(hDD)}`); } else console.log("  ✓ Cmech ดัมมี่+ดัมมี่ qty=1");

  const dig = computeCutList(spec, { ...spec.defaults, motherHandle: "Digital lock" }, 1);
  if (dig.hardware.some((h) => ["ตลับกุญแจไฮด้า", "ไส้กุญแจ", "แผ่นรับล็อค"].includes(h.name))) { fails++; console.log("  ✗ Digital lock: ตลับ/ไส้/รับล็อค ไม่ควรโผล่"); }
  else console.log("  ✓ motherHandle=Digital lock · ตลับ/ไส้/รับล็อค qty=0 ไม่โผล่");
  const digRow = dig.hardware.find((h) => h.name.includes("Digital lock (ซื้อแยก)"));
  if (!digRow || digRow.qty !== 1 || !digRow.noStock) { fails++; console.log(`  ✗ Digital lock (ซื้อแยก) want qty=1 noStock got ${JSON.stringify(digRow)}`); } else console.log("  ✓ Digital lock (ซื้อแยก) qty=1 noStock=true");

  const none = computeCutList(spec, { ...spec.defaults, motherHandle: "ไม่ใส่" }, 1);
  if (none.hardware.some((h) => ["ตลับกุญแจไฮด้า", "ไส้กุญแจ", "แผ่นรับล็อค"].includes(h.name) || h.name.includes("Digital lock (ซื้อแยก)"))) { fails++; console.log("  ✗ motherHandle=ไม่ใส่: ตลับ/ไส้/รับล็อค/Digital ไม่ควรโผล่"); }
  else console.log("  ✓ motherHandle=ไม่ใส่ · ตลับ/ไส้/รับล็อค/Digital lock qty=0 ไม่โผล่");
  // default (คิงโบ) ยังปกติ — ตลับ/ไส้/รับล็อค ต้องยังมี
  const def = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
  if (!def.hardware.some((h) => h.name === "ตลับกุญแจไฮด้า" && h.qty === 1)) { fails++; console.log("  ✗ default (คิงโบ) ตลับกุญแจไฮด้า ต้องยังมี qty=1"); } else console.log("  ✓ default (คิงโบ) ตลับกุญแจไฮด้า qty=1 (ไม่กระทบ)");
}

// ── H) FUJI บานยก (FUJI_HUNG) — เพิ่ม hardware 24 รายการ (noStock ทั้งหมด · รหัส SKU JR ว่าง) ──
{
  const spec = CUT_SPEC_BY_ID["fuji_hung"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1); // W104.3 H288.8 ดำ glass6
  console.log("FUJI บานยก (HUNG) — hardware 24 รายการ:");
  const want = [
    ["ไกด์ประคองกรอบบาน", 4], ["ตะขอเกี่ยวตลับเชือก", 4], ["ตลับล้อพูเล่ย์", 2], ["ตลับใส่เชือก", 4],
    ["ฝาปิดมุมกรอบบาน", 8], ["ฝาปิดรูเสาเกี่ยว", 2], ["ตัวเบรคบาน", 2], ["ประเก็นกันน้ำเฟรมบน", 1],
    ["ประเก็นกันน้ำเฟรมล่าง", 1], ["ยางกันลมบานยก", 2], ["ล็อคกลางบานยก", 1], ["ขอล็อคกลางบานยก", 1],
    ["สกรูหัวจม #7x8", 4], ["สกรูหัวจม #8x12", 32], ["สกรูหัวนูน #8x10", 8], ["สกรูหัวนูน #7x40", 8], ["สกรูหัวนูน #8x38", 8],
    ["ยางเฟรมข้าง", 12], ["สักหลาด 5มม.", 16], ["ยางอัดกระจก ใหญ่", 19],
  ];
  for (const [name, qty] of want) {
    const row = res.hardware.find((h) => h.name.includes(name));
    const ok = row && Math.abs(row.qty - qty) < 0.05 && row.noStock;
    if (!ok) { fails++; console.log(`  ✗ ${name}: want qty=${qty} noStock=true → got ${row ? `qty=${row.qty} noStock=${row.noStock}` : "ไม่พบ"}`); }
    else console.log(`  ✓ ${name.padEnd(18)} qty=${row.qty} noStock=true`);
  }
  const cord = res.hardware.find((h) => h.name.includes("เชือกไนล่อน"));
  if (!cord || Math.abs(cord.qty - 8.3) > 0.05) { fails++; console.log(`  ✗ เชือกไนล่อน want ~8.3 got ${cord?.qty}`); } else console.log(`  ✓ เชือกไนล่อน qty=${cord.qty} (≈8.327 ตามไฟล์ ปัด 1 ตำแหน่ง)`);
  const handle = res.hardware.find((h) => h.name.includes("มือจับบานยก"));
  if (!handle || !handle.name.includes("06-008-BL")) { fails++; console.log(`  ✗ มือจับบานยก สีดำ(default) ต้องมีรหัส 06-008-BL got ${handle?.name}`); } else console.log("  ✓ มือจับบานยก สีดำ → รหัส 06-008-BL");
  if (res.hardware.some((h) => h.name.includes("8มม. เล็ก"))) { fails++; console.log("  ✗ glass=6(default) ไม่ควรมี ยางอัดกระจก 8มม.เล็ก"); } else console.log("  ✓ glass=6(default) · ยางอัดกระจก 8มม.เล็ก ไม่โผล่");
  // glass=8 → สลับสัดส่วน gasket
  const g8 = computeCutList(spec, { ...spec.defaults, glass: 8 }, 1);
  const big8 = g8.hardware.find((h) => h.name.includes("ยางอัดกระจก ใหญ่"));
  const small8 = g8.hardware.find((h) => h.name.includes("8มม. เล็ก"));
  if (!big8 || big8.qty !== 10 || !small8 || small8.qty !== 10) { fails++; console.log(`  ✗ glass=8 ยางอัดกระจก ใหญ่=${big8?.qty}(ควร10) เล็ก=${small8?.qty}(ควร10)`); } else console.log("  ✓ glass=8 · ยางอัดกระจก ใหญ่=10 · เล็ก=10");
}

// ── I) กลาสเฮ้าส์หลายด้าน (GLASSHOUSE_MULTI) — ตะเข้/รอยต่อ/จันทันรายตัว (③.5) ──
//   เลขคาดหวัง คำนวณจากสูตรไฟล์ "เต็ม" อิสระ (จำลองแยก node ไม่ใช่จากไฟล์ — ไฟล์ไม่แคชค่าที่คำนวณ)
//   input ตัวอย่างในไฟล์ (ทั้ง _ตัวอย่าง และ เต็ม ตรงกัน): ด้าน1-4 W/P = 400/150,300/100,350/200,200/150
//   รอยต่อ 1-2=นูน 2-3=เว้า 3-4=นูน · สูง 270/240 (drop=30) · ไวนิล (max=100,w=25) · แปคู่
{
  const spec = CUT_SPEC_BY_ID["glasshouse_multi"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1);
  const rowsOf = (name) => res.rows.filter((r) => r.name.startsWith(name) && r.qty > 0);
  const rowAt = (name) => res.rows.find((r) => r.name === name);
  console.log("กลาสเฮ้าส์หลายด้าน (GLASSHOUSE_MULTI):");

  // ด้าน 1: J=500 F=6 → ตำแหน่ง [153,153,153,153,153,0] (ริมขวาชนตะเข้1-2 = 0 ไม่นับ)
  const s1 = rowsOf("จันทัน ด้าน 1 #");
  if (s1.length !== 5 || s1.some((r) => Math.abs(r.len - 153) > 0.05)) { fails++; console.log(`  ✗ ด้าน1 จันทัน ต้องมี 5 เส้น ยาว 153 ทั้งหมด got ${JSON.stringify(s1.map((r) => r.len))}`); }
  else console.log("  ✓ ด้าน1 จันทัน 5 เส้น × 153 ซม. (ริมขวาชนตะเข้ #6 ไม่นับ)");
  const s1e1 = rowAt("จันทัน ด้าน 1 #1");
  if (!s1e1 || s1e1.code !== 'กล่อง 4"x4"') { fails++; console.log(`  ✗ ด้าน1 #1 (ริมซ้าย เปิด/ไม่ชนตะเข้) ต้องเป็นกล่อง 4"x4" got ${s1e1?.code}`); } else console.log('  ✓ ด้าน1 #1 (ริมเปิด) = กล่อง 4"x4" (รัดรอบ)');
  const s1int = rowAt("จันทัน ด้าน 1 #2");
  if (!s1int || s1int.code !== 'กล่อง 1.6"x4"') { fails++; console.log(`  ✗ ด้าน1 #2 (ในตัว) ต้องเป็นกล่อง 1.6"x4" got ${s1int?.code}`); } else console.log('  ✓ ด้าน1 #2 (ในตัว) = กล่อง 1.6"x4"');

  // ด้าน 2: J=250 F=4 → ตำแหน่ง [0,58,43.5,0] (ประกบตะเข้ 2 ฝั่ง นูน+เว้า → ไม่มีจันทันเต็มเลย)
  const s2 = rowsOf("จันทัน ด้าน 2 #");
  const s2lens = s2.map((r) => r.len).sort((a, b) => a - b);
  if (s2.length !== 2 || Math.abs(s2lens[0] - 43.5) > 0.05 || Math.abs(s2lens[1] - 58) > 0.05) { fails++; console.log(`  ✗ ด้าน2 (ประกบตะเข้ 2 ฝั่ง) ต้องมี 2 เส้น [43.5,58] got ${JSON.stringify(s2lens)}`); }
  else console.log("  ✓ ด้าน2 (ประกบตะเข้ 2 ฝั่ง) จันทัน jack สั้น 2 เส้น [43.5, 58]");

  // ด้าน 3: J=400 F=5 → [0,202.2,202.2,134.8,0] (ริมซ้ายชนตะเข้2-3=เว้า, ริมขวาชนตะเข้3-4=นูน)
  const s3 = rowsOf("จันทัน ด้าน 3 #");
  const s3lens = s3.map((r) => r.len).sort((a, b) => a - b);
  if (s3.length !== 3 || Math.abs(s3lens[0] - 134.8) > 0.05 || Math.abs(s3lens[1] - 202.2) > 0.05 || Math.abs(s3lens[2] - 202.2) > 0.05) { fails++; console.log(`  ✗ ด้าน3 ต้องมี 3 เส้น [134.8,202.2,202.2] got ${JSON.stringify(s3lens)}`); }
  else console.log("  ✓ ด้าน3 จันทัน 3 เส้น [134.8(jack), 202.2, 202.2] (ทั้งสองริมชนตะเข้ ไม่นับ)");
  if (res.rows.some((r) => r.name === "จันทัน ด้าน 3 #1" && r.qty > 0)) { fails++; console.log("  ✗ ด้าน3 #1 (ริมซ้าย ชนตะเข้) ไม่ควรนับ (qty ต้อง 0)"); } else console.log("  ✓ ด้าน3 #1 (ริมซ้าย ชนตะเข้) qty=0 ไม่นับ (ตะเข้เป็นเส้นแยก)");

  // ด้าน 4: J=400 F=5 → [0,76.5,153,153,153] (ริมซ้ายชนตะเข้3-4, ริมขวาเปิด/ไม่ชนตะเข้ → เต็ม+ขอบ 4×4)
  const s4last = rowAt("จันทัน ด้าน 4 #5");
  if (!s4last || Math.abs(s4last.len - 153) > 0.05 || s4last.code !== 'กล่อง 4"x4"') { fails++; console.log(`  ✗ ด้าน4 #5 (ริมขวา เปิด) ต้องยาว153 กล่อง 4"x4" got ${JSON.stringify(s4last)}`); } else console.log('  ✓ ด้าน4 #5 (ริมขวา เปิด) = 153 ซม. กล่อง 4"x4" (รัดรอบ ไม่ใช่ในตัว)');
  const s4jack = rowAt("จันทัน ด้าน 4 #2");
  if (!s4jack || Math.abs(s4jack.len - 76.5) > 0.05) { fails++; console.log(`  ✗ ด้าน4 #2 (jack ใกล้ตะเข้) ต้อง 76.5 got ${s4jack?.len}`); } else console.log("  ✓ ด้าน4 #2 (jack ใกล้ตะเข้) = 76.5 ซม.");

  // ตะเข้ (มุมลอย) — √(ยื่นซ้าย²+ยื่นขวา²+สูงตก²)
  const hip12 = rowAt("ตะเข้ ด้าน 1-2"), hip23 = rowAt("ตะเข้ ด้าน 2-3"), hip34 = rowAt("ตะเข้ ด้าน 3-4");
  const wantHip = [[hip12, 182.8, "1-2"], [hip23, 225.6, "2-3"], [hip34, 251.8, "3-4"]];
  for (const [row, want, label] of wantHip) {
    if (!row || Math.abs(row.len - want) > 0.05 || row.qty !== 1) { fails++; console.log(`  ✗ ตะเข้ ${label} ต้อง ${want} ซม. got ${JSON.stringify(row)}`); } else console.log(`  ✓ ตะเข้ ${label} = ${want} ซม.`);
  }
  const hip45 = res.rows.find((r) => r.name === "ตะเข้ ด้าน 4-5");
  if (!hip45 || hip45.qty !== 0) { fails++; console.log("  ✗ ตะเข้ 4-5 (ด้าน5 ไม่ใช้งาน) ต้อง qty=0"); } else console.log("  ✓ ตะเข้ 4-5 qty=0 (ด้าน 5-6 ไม่ได้ใช้งาน)");

  // แป + แผ่นหลังคา ด้าน1 (I=34, H=94.6, K=20)
  const purlin1 = rowAt("แป 1×1½ ด้าน 1");
  if (!purlin1 || purlin1.qty !== 34 || Math.abs(purlin1.len - 94.6) > 0.05) { fails++; console.log(`  ✗ แป ด้าน1 ต้อง qty=34 len=94.6 got ${JSON.stringify(purlin1)}`); } else console.log("  ✓ แป 1×1½ ด้าน1 qty=34 len=94.6 (แปคู่ ×2)");
  const sheet1 = rowAt("แผ่นหลังคา ด้าน 1");
  if (!sheet1 || sheet1.qty !== 20 || Math.abs(sheet1.len - 153) > 0.05) { fails++; console.log(`  ✗ แผ่นหลังคา ด้าน1 ต้อง qty=20 len=153 got ${JSON.stringify(sheet1)}`); } else console.log("  ✓ แผ่นหลังคา ด้าน1 qty=20 len=153");

  // ปลายหลังคา — default รางน้ำ → รางน้ำอลู ด้าน1 qty=1 len=J1(500) · กล่อง1×4ปิดปลาย ต้อง qty=0
  const gutter1 = rowAt("รางน้ำอลู ด้าน 1");
  const boxEnd1 = rowAt("กล่อง 1×4 ปิดปลาย ด้าน 1");
  if (!gutter1 || gutter1.qty !== 1 || Math.abs(gutter1.len - 500) > 0.05 || (boxEnd1 && boxEnd1.qty !== 0)) { fails++; console.log(`  ✗ ปลายหลังคา (รางน้ำ default) ต้อง รางน้ำอลู ด้าน1 qty=1 len=500 · กล่อง1×4=0 got gutter=${JSON.stringify(gutter1)} box=${JSON.stringify(boxEnd1)}`); }
  else console.log("  ✓ ปลายหลังคา default=รางน้ำ → รางน้ำอลู ด้าน1 qty=1 len=500 · กล่อง1×4ปิดปลาย qty=0");
  const closedEnd = computeCutList(spec, { ...spec.defaults, roofEnd: "ปิดปลาย" }, 1);
  const boxEnd1closed = closedEnd.rows.find((r) => r.name === "กล่อง 1×4 ปิดปลาย ด้าน 1");
  if (!boxEnd1closed || boxEnd1closed.qty !== 1 || Math.abs(boxEnd1closed.len - 500) > 0.05) { fails++; console.log(`  ✗ roofEnd=ปิดปลาย → กล่อง1×4 ด้าน1 ต้อง qty=1 len=500 got ${JSON.stringify(boxEnd1closed)}`); } else console.log("  ✓ roofEnd=ปิดปลาย → กล่อง1×4ปิดปลาย ด้าน1 qty=1 len=500");

  // ด้าน 5/6 ไม่ใช้งาน (default side5W/side6W=0) — จันทัน/แผ่น/แป ต้อง qty=0 ทั้งหมด
  const s5any = res.rows.some((r) => r.name.startsWith("จันทัน ด้าน 5 #") && r.qty > 0);
  const sheet5 = rowAt("แผ่นหลังคา ด้าน 5");
  if (s5any || (sheet5 && sheet5.qty !== 0)) { fails++; console.log("  ✗ ด้าน 5 (ไม่ใช้งาน) ต้อง qty=0 ทุกโปรไฟล์"); } else console.log("  ✓ ด้าน 5/6 (ไม่ใช้งาน) qty=0 ทุกโปรไฟล์ (side5W/6W=0)");
}

// ── J) กันสาดหลายด้าน (AWNING_MULTI) — เหมือน GLASSHOUSE_MULTI + หัก ⑦ (จันทันรายตัว) + ⑥ เหล็ก/เพลท ──
//   ใช้ input เดียวกับ GLASSHOUSE_MULTI (ด้าน1-4 W/P = 400/150,300/100,350/200,200/150 · รอยต่อ นูน/เว้า/นูน · สูง270/240)
//   raw จันทัน (ก่อนหัก ⑦) เหมือน GLASSHOUSE_MULTI เป๊ะ: ด้าน1[153×5,0] ด้าน2[0,58,43.5,0] ด้าน3[0,202.2,202.2,134.8,0] ด้าน4[0,76.5,153,153,153]
{
  const spec = CUT_SPEC_BY_ID["awning_multi"];
  const res = computeCutList(spec, { ...spec.defaults, handleBrand: "เมโทร" }, 1); // default roofEnd=รางน้ำ → หัก 10.2
  const rowsOf = (name) => res.rows.filter((r) => r.name.startsWith(name) && r.qty > 0);
  const rowAt = (name) => res.rows.find((r) => r.name === name);
  console.log("กันสาดหลายด้าน (AWNING_MULTI):");

  // ③.5 จันทันรายตัว — หัก amEndCut(รางน้ำ=10.2) จาก raw แล้ว floor 0 (raw=0 ที่ชนตะเข้ยังคง 0)
  const s1 = rowsOf("จันทัน ด้าน 1 #");
  if (s1.length !== 5 || s1.some((r) => Math.abs(r.len - 142.8) > 0.05)) { fails++; console.log(`  ✗ ด้าน1 (รางน้ำ) ต้องมี 5 เส้น ยาว 142.8 (153-10.2) got ${JSON.stringify(s1.map((r) => r.len))}`); }
  else console.log("  ✓ ด้าน1 (รางน้ำ) จันทัน 5 เส้น × 142.8 ซม. (153-10.2)");
  const s1e1 = rowAt("จันทัน ด้าน 1 #1");
  if (!s1e1 || s1e1.code !== 'กล่อง 4"x4"') { fails++; console.log(`  ✗ ด้าน1 #1 (ริมเปิด) ต้องเป็นกล่อง 4"x4" got ${s1e1?.code}`); } else console.log('  ✓ ด้าน1 #1 (ริมเปิด) = กล่อง 4"x4" (เหมือน GLASSHOUSE_MULTI)');
  const s1int = rowAt("จันทัน ด้าน 1 #2");
  if (!s1int || s1int.code !== 'กล่อง 1.6"x4"') { fails++; console.log(`  ✗ ด้าน1 #2 (ในตัว) ต้องเป็นกล่อง 1.6"x4" got ${s1int?.code}`); } else console.log('  ✓ ด้าน1 #2 (ในตัว) = กล่อง 1.6"x4"');

  const s2 = rowsOf("จันทัน ด้าน 2 #");
  const s2lens = s2.map((r) => r.len).sort((a, b) => a - b);
  if (s2.length !== 2 || Math.abs(s2lens[0] - 33.3) > 0.05 || Math.abs(s2lens[1] - 47.8) > 0.05) { fails++; console.log(`  ✗ ด้าน2 (ประกบตะเข้ 2 ฝั่ง) ต้องมี 2 เส้น [33.3,47.8] (43.5/58 -10.2) got ${JSON.stringify(s2lens)}`); }
  else console.log("  ✓ ด้าน2 จันทัน jack สั้น 2 เส้น [33.3, 47.8] (หัก 10.2 จาก raw 43.5/58)");

  const s4last = rowAt("จันทัน ด้าน 4 #5");
  if (!s4last || Math.abs(s4last.len - 142.8) > 0.05 || s4last.code !== 'กล่อง 4"x4"') { fails++; console.log(`  ✗ ด้าน4 #5 (ริมเปิด) ต้อง 142.8 กล่อง 4"x4" got ${JSON.stringify(s4last)}`); } else console.log('  ✓ ด้าน4 #5 (ริมเปิด) = 142.8 ซม. กล่อง 4"x4"');

  // roofEnd → amEndCut ต่างกัน (ยื่นปลาย=10 · ปิดปลาย=12.5 · รางน้ำ=10.2)
  const outEnd = computeCutList(spec, { ...spec.defaults, roofEnd: "ยื่นปลาย" }, 1);
  const closedEnd = computeCutList(spec, { ...spec.defaults, roofEnd: "ปิดปลาย" }, 1);
  const s1out = outEnd.rows.find((r) => r.name === "จันทัน ด้าน 1 #1")?.len;
  const s1closed = closedEnd.rows.find((r) => r.name === "จันทัน ด้าน 1 #1")?.len;
  if (Math.abs(s1out - 143.0) > 0.05) { fails++; console.log(`  ✗ ยื่นปลาย (หัก10) ด้าน1#1 ต้อง 143.0 got ${s1out}`); } else console.log("  ✓ roofEnd=ยื่นปลาย → หัก 10 · ด้าน1#1 = 143.0");
  if (Math.abs(s1closed - 140.5) > 0.05) { fails++; console.log(`  ✗ ปิดปลาย (หัก12.5) ด้าน1#1 ต้อง 140.5 got ${s1closed}`); } else console.log("  ✓ roofEnd=ปิดปลาย → หัก 12.5 · ด้าน1#1 = 140.5");

  // ตะเข้ (ไม่กระทบจาก ⑦ — geometric ล้วน เหมือน GLASSHOUSE_MULTI)
  const hip12 = rowAt("ตะเข้ ด้าน 1-2"), hip23 = rowAt("ตะเข้ ด้าน 2-3"), hip34 = rowAt("ตะเข้ ด้าน 3-4");
  const wantHip = [[hip12, 182.8, "1-2"], [hip23, 225.6, "2-3"], [hip34, 251.8, "3-4"]];
  for (const [row, want, label] of wantHip) {
    if (!row || Math.abs(row.len - want) > 0.05 || row.qty !== 1) { fails++; console.log(`  ✗ ตะเข้ ${label} ต้อง ${want} ซม. got ${JSON.stringify(row)}`); } else console.log(`  ✓ ตะเข้ ${label} = ${want} ซม. (ไม่หัก ⑦)`);
  }

  // ⑥ เหล็ก + ฝาครอบ ด้าน 1 — ฉาก/แซด ยาว=B(กว้างดิบ 400) จำนวน=⌈400/600⌉=1 · กล่องเหล็ก/ครอบเพลท ยาว=E(153.0)/÷3 จำนวน=จันทันรวม(5)
  const angle1 = rowAt("ฉาก 6 หุน ด้าน 1 (เหล็ก)");
  if (!angle1 || angle1.qty !== 1 || Math.abs(angle1.len - 400) > 0.05) { fails++; console.log(`  ✗ ฉาก6หุน ด้าน1 ต้อง len=400 qty=1 got ${JSON.stringify(angle1)}`); } else console.log("  ✓ ฉาก 6 หุน ด้าน1 len=400(กว้างดิบ) qty=1");
  const zed1 = rowAt('แซด 4" ด้าน 1 (เหล็ก)');
  if (!zed1 || zed1.qty !== 1 || Math.abs(zed1.len - 400) > 0.05) { fails++; console.log(`  ✗ แซด4" ด้าน1 ต้อง len=400 qty=1 got ${JSON.stringify(zed1)}`); } else console.log('  ✓ แซด 4" ด้าน1 len=400 qty=1');
  const steelBox1 = rowAt("กล่องเหล็ก 1×1 ด้าน 1");
  if (!steelBox1 || steelBox1.qty !== 5 || Math.abs(steelBox1.len - 153.0) > 0.05) { fails++; console.log(`  ✗ กล่องเหล็ก1×1 ด้าน1 ต้อง len=153.0 qty=5 got ${JSON.stringify(steelBox1)}`); } else console.log("  ✓ กล่องเหล็ก 1×1 ด้าน1 len=153.0(=E) qty=5(จันทันรวม)");
  const plateCap1 = rowAt("กล่องครอบเพลท 1.6×4 ด้าน 1");
  if (!plateCap1 || plateCap1.qty !== 5 || Math.abs(plateCap1.len - 51.0) > 0.05) { fails++; console.log(`  ✗ กล่องครอบเพลท ด้าน1 ต้อง len=51.0(153÷3) qty=5 got ${JSON.stringify(plateCap1)}`); } else console.log("  ✓ กล่องครอบเพลท ด้าน1 len=51.0(E÷3) qty=5");
  const cover1 = rowAt("ฝาครอบ ด้าน 1");
  if (!cover1 || cover1.qty !== 20 || Math.abs(cover1.len - 153.0) > 0.05) { fails++; console.log(`  ✗ ฝาครอบ ด้าน1 (ไวนิล) ต้อง qty=20(=K,แผ่น) len=153.0 got ${JSON.stringify(cover1)}`); } else console.log("  ✓ ฝาครอบ ด้าน1 (ไวนิล) qty=20(=มหK แผ่น) len=153.0");
  // โพลีตัน → ฝาครอบ จำนวน = จันทันรวม (ไม่ใช่ K)
  const polyRes = computeCutList(spec, { ...spec.defaults, sheet: "โพลีตัน" }, 1);
  const cover1Poly = polyRes.rows.find((r) => r.name === "ฝาครอบ ด้าน 1");
  if (!cover1Poly || cover1Poly.qty !== 5) { fails++; console.log(`  ✗ ฝาครอบ ด้าน1 (โพลีตัน) ต้อง qty=5(จันทันรวม) got ${cover1Poly?.qty}`); } else console.log("  ✓ ฝาครอบ ด้าน1 (โพลีตัน) qty=5(จันทันรวม แทน K)");

  // เพลทเหล็ก (รวมทุกด้าน) = 2×Σจันทันรวม (ด้าน1=5,ด้าน2=2,ด้าน3=3,ด้าน4=4 → รวม14 ×2=28)
  const plateAll = rowAt("เพลทเหล็ก (รวมทุกด้าน)");
  if (!plateAll || plateAll.qty !== 28) { fails++; console.log(`  ✗ เพลทเหล็ก(รวมทุกด้าน) ต้อง qty=28 (2×(5+2+3+4)) got ${plateAll?.qty}`); } else console.log("  ✓ เพลทเหล็ก (รวมทุกด้าน) qty=28 (2×Σจันทันรวม 5+2+3+4)");

  // ด้าน 5/6 ไม่ใช้งาน — ⑥ เหล็ก/เพลท ต้อง qty=0 เช่นกัน
  const angle5 = rowAt("ฉาก 6 หุน ด้าน 5 (เหล็ก)");
  const steelBox5 = rowAt("กล่องเหล็ก 1×1 ด้าน 5");
  if ((angle5 && angle5.qty !== 0) || (steelBox5 && steelBox5.qty !== 0)) { fails++; console.log("  ✗ ด้าน 5 (ไม่ใช้งาน) ⑥ เหล็ก/กล่องเหล็ก ต้อง qty=0"); } else console.log("  ✓ ด้าน 5/6 (ไม่ใช้งาน) ⑥ เหล็ก/กล่องเหล็ก qty=0 ทุกโปรไฟล์");
}

console.log(fails === 0 ? "\n✅ verify-cutlist-hardware ผ่านหมด" : `\n❌ ล้มเหลว ${fails} จุด`);
process.exit(fails === 0 ? 0 : 1);
