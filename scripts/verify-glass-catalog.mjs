// verify-glass-catalog.mjs — ด่านกัน "ชื่อกระจกในดรอปดาวน์/ใบเสนอ ไม่ตรงลิสต์เจ้าของ 4 พ.ย.69"
// รัน:  node scripts/verify-glass-catalog.mjs
// ─────────────────────────────────────────────────────────────────────────────
//   ① ทุกชื่อในลิสต์ชี้คีย์ราคาที่มีอยู่จริงใน PB.GLASS (ราคา > 0) · ชื่อโชว์ไม่ซ้ำ
//   ② ดรอปดาวน์เรียงตามลิสต์ก่อน แล้วค่อยต่อท้ายคีย์ที่เหลือ (ครบทุกคีย์ ไม่ซ้ำ) แล้วแทนกระจก
//   ③ engine คิดราคาด้วย "ชื่อโชว์" = คิดด้วย "คีย์ราคาเดิม" ทุกตัว (ใบเก่ายังถูก)
//   ④ ความหนา (มม.) อ่านจากชื่อโชว์ได้ (ลามิเนต 4+4 = 8) → น้ำหนัก/ใบตัดไม่เพี้ยน
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GLASS_NAMED, GLASS_NO_PRICE, GLASS_EXTRA, glassPriceKey, glassDisplayName, glassCanonical, glassOptionGroups, glassOptionValues } from "../src/lib/calculator40/glass-catalog.mjs";
import { PRODUCTS } from "../src/lib/calculator40/products.mjs";
import { computeCost, glassMM } from "../src/lib/calculator40/engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/lib/calculator40/pricebook.json"), "utf8"));
let pass = 0, fail = 0;
const ok = (label, cond, got = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "✅" : "❌"} ${label}${cond || got === "" ? "" : `  (${got})`}`); };

console.log("═══ ① ลิสต์เจ้าของ ↔ คีย์ราคา ═══");
const names = GLASS_NAMED.map(([n]) => n);
ok(`ชื่อโชว์ไม่ซ้ำ (${names.length} ชื่อ)`, new Set(names).size === names.length);
const badKey = GLASS_NAMED.filter(([, k]) => !(PB.GLASS[k] > 0));
ok("ทุกชื่อชี้คีย์ราคาที่มีจริง (ราคา > 0)", badKey.length === 0, badKey.map(([n, k]) => `${n} → ${k}`).join(" · "));
ok("ชื่อที่ไม่มีราคา (GLASS_NO_PRICE) ไม่ซ้ำกับชื่อที่มี", !GLASS_NO_PRICE.some((n) => names.includes(n)));
ok("ลำดับต้น: เขียว 6 · ใส 6 · เขียว 8 · ใส 8 · เขียว 10 · ใส 10 (ตามลิสต์)",
  names.slice(0, 6).join("|") === ["เขียว หนา 6 มม.", "ใส หนา 6 มม.", "เขียว หนา 8 มม.", "ใส หนา 8 มม.", "เขียว หนา 10 มม.", "ใส หนา 10 มม."].join("|"));

console.log("\n═══ ② ดรอปดาวน์ ═══");
const groups = glassOptionGroups(PB);
const values = glassOptionValues(PB);
ok("ไม่มีค่าซ้ำในดรอปดาวน์", new Set(values).size === values.length);
ok("กลุ่มแรก = รายการหลักตามลิสต์ครบ", groups[0].cat === "รายการหลัก" && groups[0].items.map((i) => i.value).join("|") === names.join("|"));
const restKeys = groups.find((g) => g.cat.startsWith("อื่น"))?.items.map((i) => i.value) ?? [];
const namedKeys = new Set(GLASS_NAMED.map(([, k]) => k));
const allKeys = Object.keys(PB.GLASS);
ok(`คีย์ที่เหลือต่อท้ายครบ (${restKeys.length} = ${allKeys.length} − ${namedKeys.size} ที่ตั้งชื่อแล้ว)`, restKeys.length === allKeys.length - namedKeys.size && restKeys.every((k) => !namedKeys.has(k)));
ok("กลุ่มท้าย = แทนกระจก (คอมโพสิต/ลูกฟูก/เกล็ด Z)", groups[groups.length - 1].items.map((i) => i.value).join("|") === GLASS_EXTRA.join("|"));
ok("ชื่อที่ต่อท้ายแปลงเป็น 'หนา N มม.' (เช่น ชาดา 3มม. → ชาดา หนา 3 มม.)", glassDisplayName("ชาดา 3มม.") === "ชาดา หนา 3 มม." && glassDisplayName("ลามิเนต ใส6+6 1.52") === "ลามิเนต ใส6+6 1.52");

console.log("\n═══ ③ ราคาเท่าเดิมทุกตัว (ชื่อโชว์ = คีย์เดิม) ═══");
let same = 0, diff = [];
for (const [name, key] of GLASS_NAMED) {
  const a = computeCost(PB, PRODUCTS.fixed, { w: 150, h: 200, p: 1, form: "กระจกล้วน", glassType: name, color: "white", colorKey: "white", spec: {}, addons: {} });
  const b = computeCost(PB, PRODUCTS.fixed, { w: 150, h: 200, p: 1, form: "กระจกล้วน", glassType: key, color: "white", colorKey: "white", spec: {}, addons: {} });
  if (a.sell.withInstall === b.sell.withInstall && Math.abs(a.cost.total - b.cost.total) < 0.01) same++; else diff.push(`${name}: ${a.sell.withInstall} vs ${b.sell.withInstall}`);
}
ok(`บานติดตาย 150×200 ราคาเท่ากัน ${same}/${GLASS_NAMED.length}`, diff.length === 0, diff.slice(0, 3).join(" · "));
ok("glassPriceKey(ชื่อโชว์) = คีย์ · glassPriceKey(คีย์) = คีย์", glassPriceKey("เขียว หนา 6 มม.") === "เขียว 6มม." && glassPriceKey("เขียว 6มม.") === "เขียว 6มม.");
ok("glassCanonical(คีย์เดิม) = ชื่อโชว์ · glassDisplayName(คีย์เดิม) = ชื่อโชว์ (ใบเก่า)", glassCanonical("เขียว 6มม.") === "เขียว หนา 6 มม." && glassDisplayName("ใส 10มม.") === "ใส หนา 10 มม.");

console.log("\n═══ ④ ความหนา ═══");
ok("ลามิเนตใส ฟิล์มใส 0.38 หนา 4+4 มม. = 8 มม.", glassMM("ลามิเนตใส ฟิล์มใส 0.38 หนา 4+4 มม.") === 8);
ok("เทมเปอร์ใส หนา 10 มม. = 10 มม.", glassMM("เทมเปอร์ใส หนา 10 มม.") === 10);
// ชื่อที่ไม่มีตัวเลขความหนาเลย (เงาทอง · ฝ้า ร้าน TYK) อ่านไม่ได้เป็นธรรมดา → น้ำหนักกระจก 0 (มีเตือนบนจอ)
const NO_MM = new Set(["เงาทอง", "ฝ้า (ร้าน TYK)"]);
ok("ชื่อโชว์ทุกตัวอ่านความหนาได้ (ยกเว้นชื่อที่ไม่มีตัวเลข)", GLASS_NAMED.every(([n]) => NO_MM.has(n) || glassMM(n) > 0), GLASS_NAMED.filter(([n]) => !NO_MM.has(n) && !(glassMM(n) > 0)).map(([n]) => n).join(" · "));
ok("อินซูเลทชื่อใหม่อ่านความหนารวม 12 มม.", glassMM("อินซูเลทใส 6 มม. + A18 + กระจกใส 6 มม.") === 12 && glassMM("อินซูเลทใส 6 มม. + Air12 + 6 มม.") === 12);
ok("ราคาใหม่ 5 พ.ย.69 เข้าครบ (GLASS_NO_PRICE ว่าง · ยูโรบรอนซ์ 10 = ทุน 2,363)", GLASS_NO_PRICE.length === 0 && PB.GLASS["ยูโรบรอนซ์ หนา 10 มม."] === 2363);
// เจ้าของเคาะ "เอาราคาตามที่บอกใหม่" (5 พ.ย.69) → 3 ตัวที่ไฟล์เคยมีราคาต่าง ทับด้วย ขาย ÷ 2.708: 5,700 / 5,100 / 6,000
ok("ทับราคาไฟล์ 3 ตัวตามเจ้าของ (เทมเปอร์ใสพิเศษ 8 = 2,105 · ลามิเนตใส 5+5 กันเสียง = 1,883 · เทมเปอร์ลามิเนต 6+6 PVB = 2,215)",
  PB.GLASS["เทมเปอร์ใสพิเศษ 8มม."] === 2105 && PB.GLASS["ลามิเนตใส 5+5 กันเสียง 0.76"] === 1883 && PB.GLASS["เทมเปอร์ลามิเนต 6+6 PVB 1.52"] === 2215,
  [PB.GLASS["เทมเปอร์ใสพิเศษ 8มม."], PB.GLASS["ลามิเนตใส 5+5 กันเสียง 0.76"], PB.GLASS["เทมเปอร์ลามิเนต 6+6 PVB 1.52"]].join("/"));


// ── ช่องเลือกกระจกค้นหาได้ (เจ้าของ 13 พ.ย.69 "ดรอปดาวกระจก อยากให้เสิร์ชได้ มันเยอะแล้ว") ──
console.log("\n═══ 🔎 ค้นหากระจก (GlassPicker) ═══");
{
  const { filterGlassGroups, glassOptionGroups: _gog } = await import("../src/lib/calculator40/glass-catalog.mjs");
  const groups = _gog(PB);
  const flat = (gs) => gs.flatMap((g) => g.items);
  const total = flat(groups).length;
  ok("ไม่พิมพ์ = เห็นครบทุกตัว (" + total + ")", flat(filterGlassGroups(groups, "")).length === total && flat(filterGlassGroups(groups, "   ")).length === total);
  const r1 = flat(filterGlassGroups(groups, "เทมเปอร์"));
  ok("พิมพ์ 'เทมเปอร์' = เหลือแต่เทมเปอร์ (" + r1.length + " ตัว)", r1.length > 0 && r1.length < total && r1.every((i) => /เทมเปอร์/.test(i.label + i.value)));
  const r2 = flat(filterGlassGroups(groups, "เทมเปอร์ 10"));
  // 13 พ.ย.69 บั๊กจริงบนเว็บ: regex \\s หาย (กลายเป็น /[s.]/) → "เทมเปอร์ 10" เจอแค่ 1 ตัว · ตรวจจำนวนให้ตรงกับนับมือ
  const want2 = flat(groups).filter((i) => { const h = (i.label + "|" + i.value).replace(/[\s.]/g, ""); return h.includes("เทมเปอร์") && h.includes("10"); }).length;
  ok("หลายคำ 'เทมเปอร์ 10' = ต้องมีครบทุกคำ · ได้ครบทุกตัว (" + r2.length + "/" + want2 + ")", r2.length === want2 && want2 >= 5 && r2.some((i) => i.label === "เทมเปอร์ใส หนา 10 มม." || /เทมเปอร์ใส/.test(i.label)));
  const rs = flat(filterGlassGroups(groups, "ลามิเนต ใส"));
  ok("'ลามิเนต ใส' เจอหลายตัว (" + rs.length + ")", rs.length >= 2 && rs.every((i) => /ลามิเนต/.test(i.label + i.value) && /ใส/.test(i.label + i.value)));
  const r3 = flat(filterGlassGroups(groups, "ใส6"));
  ok("ไม่สนช่องว่าง: 'ใส6' เจอกระจกใส 6 มม.", r3.length > 0 && r3.every((i) => /ใส/.test(i.label + i.value) && /6/.test(i.label + i.value)));
  ok("ไม่เจอ = รายการว่าง (หน้าจอขึ้น 'ไม่เจอกระจก')", flat(filterGlassGroups(groups, "zzzไม่มีแน่")).length === 0);
  ok("กลุ่มที่ไม่มีตัวเหลือ ถูกซ่อน", filterGlassGroups(groups, "ลูกฟูก").every((g) => g.items.length > 0) && filterGlassGroups(groups, "ลูกฟูก").length === 1);
  const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const files = ["src/components/Calculator40Client.tsx", "src/components/calculator40/RoomComposer.tsx", "src/components/calculator40/SubPanesSection.tsx"];
  const cnt = files.map((f) => (read(f).match(/<GlassPicker\b/g) || []).length);
  ok("ช่องกระจกทั้ง 6 จุดใช้ตัวค้นหา (หน้าคิดราคา 2 · ห้องกระจก 3 · ผสมบาน 1) = " + cnt.join("/"), cnt[0] === 2 && cnt[1] === 3 && cnt[2] === 1);
  ok("ไม่เหลือ <select> กระจกแบบเก่า (optgroup รายการกระจก)", files.every((f) => !/<optgroup key=\{(g|gp)\.cat\}/.test(read(f))));
}
console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
