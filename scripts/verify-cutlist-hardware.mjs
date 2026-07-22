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

console.log(fails === 0 ? "\n✅ verify-cutlist-hardware ผ่านหมด" : `\n❌ ล้มเหลว ${fails} จุด`);
process.exit(fails === 0 ? 0 : 1);
