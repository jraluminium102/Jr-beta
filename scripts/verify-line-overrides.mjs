/**
 * verify-line-overrides — ชั้นทับค่าสูตร (0134) applyLineOverrides()/lineKeyOf() ต้องเป็น pure function
 *   ไม่มี override = คืนของเดิมเป๊ะ (deep-equal + reference เดิม) · มี override = เปลี่ยนตามที่สั่งเท่านั้น
 *   ไม่หลุดไปรุ่นอื่น/scope อื่น · สูตรพังต้องไม่ทำทั้งระบบล่ม
 */
import { applyLineOverrides, lineKeyOf } from "../src/lib/calculator40/line-overrides.ts";

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${good ? "✅" : "❌"} ${name}` + (good ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
  good ? pass++ : fail++;
};
const okTrue = (name, cond) => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}`);
  cond ? pass++ : fail++;
};

// ── fixture: PRODUCTS จำลอง (คนละ instance กับของจริง กันเทสไปพังของจริงถ้าคนอื่นแก้ products.mjs) ──
function makeCalcProducts() {
  return {
    sms_fake: {
      id: "sms_fake", name: "บานเลื่อนจำลอง",
      alu: [
        { name: "เฟรมบน", code: "B20001", price: 1235, kg: 6.86, seg: "W", count: "1" },
        { name: "เฟรมข้าง", code: "B20003", price: 1045, kg: 5.8, seg: "H", count: "2" },
      ],
      hardware: [
        { name: "ล้อ 27", sku: "JR00228", price: 80, unit: "ลูก", count: "2*F2" },
      ],
      consum: [
        { name: "น็อต", sku: "JR00226", price: 1, unit: "ตัว", count: "8+4*P" },
      ],
    },
    euro_fake: {
      id: "euro_fake", name: "บานเลื่อนจำลอง 2",
      alu: [{ name: "เสา", code: "F7980", price: 1445, kg: 7.8, seg: "H", count: "2*P" }],
      hardware: [],
      consum: [],
    },
  };
}
function makeCutSpecs() {
  return {
    sms_fake_cut: {
      id: "sms_fake_cut", name: "ใบตัดจำลอง",
      profiles: [
        { name: "เฟรมล่าง", code: "B20041", len: (o) => o.W - 4.4, qty: () => 1 },
        { name: "ตบเฟรม", code: "-", len: (o) => o.W - 7, qty: () => 2 },
      ],
      hardware: [
        { name: "ล้อ", sku: "JR00228", qty: () => 2, unit: "ตัว" },
      ],
    },
  };
}

console.log("\n═══ 1) ไม่มี override → คืนของเดิมเป๊ะ ═══");
{
  const p = makeCalcProducts();
  const out1 = applyLineOverrides(p, []);
  const out2 = applyLineOverrides(p, null);
  const out3 = applyLineOverrides(p, undefined);
  okTrue("overrides=[] → reference เดิม", out1 === p);
  okTrue("overrides=null → reference เดิม", out2 === p);
  okTrue("overrides=undefined → reference เดิม", out3 === p);
  ok("deep-equal กับต้นฉบับ", out1, p);
}

console.log("\n═══ 2) เปลี่ยนรหัส (set_sku) ═══");
{
  const p = makeCalcProducts();
  const out = applyLineOverrides(p, [
    { product_id: "sms_fake", scope: "calc", match_key: "B20001", set_sku: "B99999" },
  ]);
  ok("เฟรมบนเปลี่ยนรหัสเป็น B99999", out.sms_fake.alu[0].code, "B99999");
  ok("บรรทัดอื่นในรุ่นเดียวกันไม่กระทบ", out.sms_fake.alu[1].code, "B20003");
  okTrue("ของเดิม (p) ไม่ถูกแตะ", p.sms_fake.alu[0].code === "B20001");
}

console.log("\n═══ 3) เปลี่ยนจำนวน (set_qty ฝั่งคิดราคา) ═══");
{
  const p = makeCalcProducts();
  const out = applyLineOverrides(p, [
    { product_id: "sms_fake", scope: "calc", match_key: "JR00228", set_qty: "4*F2" },
  ]);
  ok("count ของล้อ 27 เปลี่ยนเป็นสูตรใหม่", out.sms_fake.hardware[0].count, "4*F2");
  ok("ราคายังเท่าเดิม (ไม่ได้สั่งเปลี่ยน)", out.sms_fake.hardware[0].price, 80);
}

console.log("\n═══ 4) เปลี่ยนความยาว (set_len ฝั่งใบตัด — ต้องได้ฟังก์ชันจริง) ═══");
{
  const c = makeCutSpecs();
  const out = applyLineOverrides(c, [
    { product_id: "sms_fake_cut", scope: "cut", match_key: "B20041", set_len: "o.W - 10" },
  ]);
  const line = out.sms_fake_cut.profiles.find((x) => x.code === "B20041");
  okTrue("len กลายเป็นฟังก์ชัน", typeof line.len === "function");
  ok("len(o) คำนวณตามสูตรใหม่", line.len({ W: 100 }), 90);
  okTrue("ของเดิมยังใช้สูตรเก่า", c.sms_fake_cut.profiles[0].len({ W: 100 }) === 95.6);
}

console.log("\n═══ 5) เพิ่มแถวใหม่ (is_added) ═══");
{
  const p = makeCalcProducts();
  const out = applyLineOverrides(p, [
    { product_id: "sms_fake", scope: "calc", match_key: "B30099", is_added: true, item_name: "เสริมพิเศษ", set_sku: "B30099", set_price: 500, set_qty: "2", set_len: "W" },
  ]);
  ok("จำนวนบรรทัดอลูเพิ่มขึ้น 1", out.sms_fake.alu.length, 3);
  const added = out.sms_fake.alu.find((x) => x.code === "B30099");
  okTrue("บรรทัดใหม่มีชื่อ/ราคาตามที่สั่ง", added && added.name === "เสริมพิเศษ" && added.price === 500);

  const c = makeCutSpecs();
  const outCut = applyLineOverrides(c, [
    { product_id: "sms_fake_cut", scope: "cut", match_key: "JR00999", is_added: true, item_name: "อุปกรณ์เพิ่ม", set_sku: "JR00999", set_price: 10, set_qty: "3" },
  ]);
  const addedHw = outCut.sms_fake_cut.hardware.find((x) => x.sku === "JR00999");
  okTrue("เพิ่มบรรทัดใบตัด (ไม่ใช่รหัสอลู) ไปลง hardware ไม่ใช่ profiles", !!addedHw && typeof addedHw.qty === "function" && addedHw.qty() === 3);
}

console.log("\n═══ 6) ปิดแถว (disabled) ═══");
{
  const p = makeCalcProducts();
  const out = applyLineOverrides(p, [
    { product_id: "sms_fake", scope: "calc", match_key: "B20003", disabled: true },
  ]);
  ok("จำนวนบรรทัดอลูลดลง 1", out.sms_fake.alu.length, 1);
  okTrue("บรรทัดที่ปิดหายไปจริง", !out.sms_fake.alu.some((x) => x.code === "B20003"));
  okTrue("ของเดิมยังอยู่ครบ", p.sms_fake.alu.length === 2);
}

console.log("\n═══ 7) product_id ไม่มีจริง → ข้ามเงียบ ๆ ไม่ throw ═══");
{
  const p = makeCalcProducts();
  let threw = false;
  let out;
  try {
    out = applyLineOverrides(p, [
      { product_id: "ไม่มีรุ่นนี้จริง", scope: "calc", match_key: "B20001", set_sku: "B00000" },
    ]);
  } catch { threw = true; }
  okTrue("ไม่ throw", !threw);
  okTrue("ผลลัพธ์เหมือนต้นฉบับเป๊ะ", JSON.stringify(out) === JSON.stringify(p));
}

console.log("\n═══ 8) scope ผิด → ไม่กระทบ (cut override ยิงใส่ต้นไม้ calc) ═══");
{
  const p = makeCalcProducts();
  // sms_fake มี array 'alu' (ฝั่ง calc) — override สั่ง scope='cut' ซึ่งมองหาแค่ profiles/hardware เท่านั้น
  const out = applyLineOverrides(p, [
    { product_id: "sms_fake", scope: "cut", match_key: "B20001", set_sku: "B00000" },
  ]);
  ok("alu ไม่ถูกแตะ (scope cut มองไม่เห็น array alu)", out.sms_fake.alu[0].code, "B20001");
}

console.log("\n═══ 9) override 2 รุ่นไม่ปนกัน ═══");
{
  const p = makeCalcProducts();
  const out = applyLineOverrides(p, [
    { product_id: "sms_fake", scope: "calc", match_key: "B20001", set_sku: "B11111" },
    { product_id: "euro_fake", scope: "calc", match_key: "F7980", set_price: 2000 },
  ]);
  ok("sms_fake โดนแก้", out.sms_fake.alu[0].code, "B11111");
  ok("euro_fake โดนแก้คนละบรรทัด", out.euro_fake.alu[0].price, 2000);
  okTrue("sms_fake ไม่เห็นการแก้ของ euro_fake", out.sms_fake.alu.every((x) => x.price !== 2000 || x.code === "B11111"));
}

console.log("\n═══ 10) ค่าว่าง/null → ไม่พัง ไม่เปลี่ยนฟิลด์นั้น ═══");
{
  const p = makeCalcProducts();
  let threw = false;
  let out;
  try {
    out = applyLineOverrides(p, [
      { product_id: "sms_fake", scope: "calc", match_key: "B20001", set_sku: null, set_qty: "", set_price: null },
    ]);
  } catch { threw = true; }
  okTrue("ไม่ throw", !threw);
  ok("ค่าว่าง/null ไม่เปลี่ยนอะไรเลย", out.sms_fake.alu[0], p.sms_fake.alu[0]);
}

console.log("\n═══ 11) สูตรจำนวนพัง (ฝั่งใบตัด) → ไม่ทำทั้งระบบล่ม ═══");
{
  const c = makeCutSpecs();
  let threw = false;
  let out;
  try {
    out = applyLineOverrides(c, [
      { product_id: "sms_fake_cut", scope: "cut", match_key: "B20041", set_len: "))) syntax error (((" },
    ]);
  } catch { threw = true; }
  okTrue("คอมไพล์พัง (syntax ผิด) ตอน apply ไม่ throw", !threw);
  const line1 = out.sms_fake_cut.profiles.find((x) => x.code === "B20041");
  okTrue("syntax ผิด → ใช้สูตรเดิม (fallback)", line1.len({ W: 100 }) === 95.6);

  // รันได้แต่พังตอนอ้างตัวแปรที่ไม่มีจริง (ReferenceError ตอนเรียก) → ต้องไม่ throw ออกมาข้างนอก คืน 0
  const out2 = applyLineOverrides(c, [
    { product_id: "sms_fake_cut", scope: "cut", match_key: "B20041", set_len: "o.ไม่มีตัวแปรนี้จริง.x" },
  ]);
  const line2 = out2.sms_fake_cut.profiles.find((x) => x.code === "B20041");
  let threw2 = false, v2 = null;
  try { v2 = line2.len({ W: 100 }); } catch { threw2 = true; }
  // ⚠ เปลี่ยนพฤติกรรม 1 ก.ย.69: สูตรพังตอนรัน → ถอยไปใช้ "สูตรเดิม" ไม่ใช่คืน 0
  //   คืน 0 = ความยาวตัดกลายเป็นศูนย์เงียบ ๆ ใบตัดผิดโดยไม่มีใครรู้ (อันตรายกว่าสูตรเดิมที่ยังถูก)
  //   หมายเหตุ: สูตรนี้ยังไม่ผ่านด่าน isSafeExpr ด้วย (มีอักษรไทย) เลยตกไปใช้สูตรเดิมตั้งแต่ตอนคอมไพล์
  okTrue("รันแล้ว throw ข้างใน (ตัวแปรไม่มีจริง) → ถอยไปใช้สูตรเดิม ไม่หลุดออกมา", !threw2 && v2 === 95.6);
}

console.log("\n═══ 12) ทุนขยับตรงกับที่คาด (เชื่อม engine.mjs ของจริง) ═══");
{
  const { computeCost } = await import("../src/lib/calculator40/engine.mjs");
  const { PRODUCTS } = await import("../src/lib/calculator40/products.mjs");
  const PB = (await import("../src/lib/calculator40/pricebook.json", { with: { type: "json" } })).default;

  const prodId = "sms_slide";
  const before = computeCost(PB, PRODUCTS[prodId], {});
  const wheelLine = PRODUCTS[prodId].hardware.find((h) => h.sku === "JR00228");
  okTrue("มีบรรทัดล้อ 27 จริงในสูตร sms_slide (กันเทสพังเงียบถ้าสูตรเปลี่ยนชื่อ/รหัส)", !!wheelLine);

  const overridden = applyLineOverrides(PRODUCTS, [
    { product_id: prodId, scope: "calc", match_key: "JR00228", set_price: wheelLine.price + 1000 },
  ]);
  const after = computeCost(PB, overridden[prodId], {});

  // จำนวนล้อที่ขนาดดีฟอลต์ (F2 = จำนวนบานเลื่อน ตามฟอร์มตั้งต้น 'อิสระ' → F2=P=3) — เทียบจากทุนจริงที่ engine คิดออกมา
  // แทนที่จะคำนวณ F2 เองซ้ำ (จะกลายเป็นสูตรคู่ขนานที่พังพร้อมกันได้) — เทียบ "ส่วนต่างทุนหารด้วยส่วนต่างราคา/หน่วย" แทน
  const diff = after.cost.total - before.cost.total;
  const expectedQty = diff / 1000;   // ราคาต่อหน่วยขยับ 1000 → ทุนต้องขยับ 1000×จำนวนล้อ
  okTrue(`ทุนขยับขึ้นจริง (+${diff.toFixed(2)})`, diff > 0);
  okTrue(`ส่วนต่างหารด้วย 1000 ได้จำนวนเต็มบวก (${expectedQty}) — ไม่ใช่เศษเลขมั่ว`, Number.isInteger(Math.round(expectedQty * 100) / 100) && expectedQty > 0);
  okTrue("PRODUCTS ต้นฉบับไม่ถูกแตะ (ราคาล้อยังเท่าเดิม)", PRODUCTS[prodId].hardware.find((h) => h.sku === "JR00228").price === wheelLine.price);
}

console.log("\n═══ lineKeyOf() ═══");
{
  ok("มีรหัส code → ใช้ code", lineKeyOf({ code: "B20001", name: "x" }, "calc"), "B20001");
  ok("ไม่มี code แต่มี sku → ใช้ sku", lineKeyOf({ sku: "JR00228", name: "x" }, "calc"), "JR00228");
  ok("ไม่มีทั้งคู่ → name:<ชื่อ>", lineKeyOf({ name: "ซิลิโคน" }, "calc"), "name:ซิลิโคน");
  ok("code='-' (ไม่มีรหัสจริง ตามธรรมเนียมใบตัด) → ตกไปหา sku/name", lineKeyOf({ code: "-", name: "ตบเฟรม" }, "cut"), "name:ตบเฟรม");
  ok("code เป็นฟังก์ชัน (ใบตัดบางบรรทัด) → ตกไปใช้ชื่อแทน", lineKeyOf({ code: () => "B1", name: "เสา" }, "cut"), "name:เสา");
}


// ── ⑬ ด่านความปลอดภัยสูตร (เพิ่ม 1 ก.ย.69) ────────────────────────────────
//   สูตรมาจากฐานข้อมูล → รันด้วย new Function ฝั่งเซิร์ฟเวอร์
//   ถ้าไม่กรอง คนที่มีสิทธิ์แค่แก้สูตรจะรันโค้ดอะไรก็ได้บนเซิร์ฟเวอร์ (ยกระดับสิทธิ์)
{
  const { isSafeExpr, isSafeCalcExpr } = await import('../src/lib/calculator40/line-overrides.ts');
  const SAFE = ['o.W-6.9', '2*(o.W+o.H/2)', 'Math.ceil(o.W/6.4)', 'o.N>2?o.W:0',
    '(o.W-10)/2', 'Math.max(0, o.H-24.2)', 'o.W*100/6400'];
  const BAD = ['process.env.SUPABASE_SERVICE_ROLE_KEY', 'require("fs").readFileSync("/etc/passwd")',
    'globalThis.process.exit(1)', 'o.constructor.constructor("return process")()',
    '(()=>{while(1);})()', 'fetch("http://x")', 'eval("1")', '`${process.env.X}`',
    'o.W; process.exit()', 'this.constructor'];
  console.log('\n═══ ⑬ ด่านความปลอดภัยสูตร ═══');
  let s1 = 0, s2 = 0;
  for (const e of SAFE) { if (isSafeExpr(e)) s1++; else console.log(`  ❌ สูตรปกติถูกปฏิเสธ: ${e}`); }
  for (const e of BAD) { if (!isSafeExpr(e)) s2++; else console.log(`  🔴 สูตรอันตรายหลุดผ่าน: ${e}`); }
  console.log(`  ${s1 === SAFE.length ? '✅' : '❌'} สูตรตัดปกติผ่านได้ ${s1}/${SAFE.length}`);
  console.log(`  ${s2 === BAD.length ? '✅' : '🔴'} สูตรอันตรายถูกบล็อก ${s2}/${BAD.length}`);
  if (s1 === SAFE.length) pass++; else fail++;
  if (s2 === BAD.length) pass++; else fail++;

  // ── ฝั่ง "คิดราคา" (count/seg) — ช่องที่ QA เจอว่าหลุด 1 ก.ย.69 ──
  //   engine.mjs เอาข้อความสูตรไปเข้า new Function เองตอนรัน
  //   ถ้าไม่กรองที่ line-overrides = คนที่มีสิทธิ์แก้สูตรรันโค้ดบนเซิร์ฟเวอร์ได้ (พิสูจน์แล้วว่าทำได้จริง)

  const CSAFE = ['2*P', 'H>2.4?F6:2*F6', 'Math.ceil(W*100/600)', '8+4*P',
    'spec.bottomrail', 'Math.round(2*(W+H)*10)/10', "form==='อิสระ'?P:P-1"];
  const CBAD = ['(()=>{ globalThis.x=1; return 1; })()', 'process.version.length',
    'globalThis.process.pid', "require('fs').readdirSync('.').length", "eval('1')",
    "[].constructor.constructor('return 1')()", '1;globalThis.y=1', "import('fs')",
    "this.constructor.constructor('return process')()", '`${process.env.X}`'];
  let c1 = 0, c2 = 0;
  for (const e of CSAFE) { if (isSafeCalcExpr(e)) c1++; else console.log(`  ❌ สูตรคิดราคาปกติถูกปฏิเสธ: ${e}`); }
  for (const e of CBAD) { if (!isSafeCalcExpr(e)) c2++; else console.log(`  🔴 สูตรคิดราคาอันตรายหลุด: ${e}`); }
  console.log(`  ${c1 === CSAFE.length ? '✅' : '❌'} สูตรคิดราคาปกติผ่านได้ ${c1}/${CSAFE.length}`);
  console.log(`  ${c2 === CBAD.length ? '✅' : '🔴'} สูตรคิดราคาอันตรายถูกบล็อก ${c2}/${CBAD.length}`);
  if (c1 === CSAFE.length) pass++; else fail++;
  if (c2 === CBAD.length) pass++; else fail++;

}

// ── ⑭ บังคับกรอง scope ในตัวฟังก์ชันเอง (QA จับได้ 1 ก.ย.69) ──────────────
//   calc กับ cut ใช้ชื่อ array 'hardware' ร่วมกัน → ลืม filter = override ใบตัดไปแก้ราคาคิดราคา
console.log("\n═══ ⑭ onlyScope กันหลุดข้าม scope ═══");
{
  const p = makeCalcProducts();
  const ovs = [{ product_id: "sms_fake", scope: "cut", match_key: "JR00228", set_price: 99999 }];
  const leaky = applyLineOverrides(p, ovs);                 // ไม่ระบุ scope = พฤติกรรมเดิม
  const safe  = applyLineOverrides(p, ovs, "calc");         // ระบุ scope = ต้องกันได้
  okTrue("ระบุ onlyScope='calc' → override ของ cut ไม่หลุดมาแก้ราคาคิดราคา",
    safe.sms_fake.hardware[0].price === 80);
  okTrue("ระบุ onlyScope แล้วคืน reference เดิม (ไม่ clone ทิ้งเปล่า)", safe === p);
  okTrue("(อ้างอิง) ไม่ระบุ scope = ยังหลุดได้ — จึงต้องระบุเสมอตอนใช้จริง",
    leaky.sms_fake.hardware[0].price === 99999);
}
console.log(`\n═══ สรุปรวมทั้งไฟล์ (รวมด่าน scope): ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail ? 1 : 0);
