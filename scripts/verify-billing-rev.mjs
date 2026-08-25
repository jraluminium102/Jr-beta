/**
 * verify-billing-rev — เทส "Rev ใบวางบิลได้แม้ชำระแล้ว" (24 ส.ค.69)
 *
 * รัน:  node --experimental-strip-types scripts/verify-billing-rev.mjs
 * import โค้ดจริงจาก src/lib/money.ts ตรง ๆ (planRevUnpaidInstallments / planRevUnpaidInstallmentsLabor)
 *
 * ครอบเคสจาก spec:
 *   (ก) Rev เพิ่มยอด งวด1จ่ายแล้ว → งวด2/3 ปรับ
 *   (ข) Rev ลดยอดต่ำกว่าจ่าย → โชว์รับเกิน (adjustment line ติดลบ)
 *   (ค) งวดจ่ายบางส่วน = locked (ทดสอบผ่าน invariant lockedSum/paidLocked ที่ route.ts ส่งเข้ามา)
 *   (ง) บิลค่าแรง Rev → ภาษีต่องวดถูก (base/vat/wht ต่องวด sum ตรง invariant)
 * หมายเหตุ: การ "หา locked set จาก DB จริง" (classifyLockedInstallments) และ RPC (0126) เป็น DB-touching
 *   ทดสอบแยกด้วย manual QA (ดู PR description) — ที่นี่เทสเฉพาะตรรกะ pure (วางแผนงวดจากตัวเลข)
 */
import { planRevUnpaidInstallments, planRevUnpaidInstallmentsLabor, computeTotals } from "../src/lib/money.ts";

let pass = 0, fail = 0;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const near = (name, got, exp, tol = 0.01) => {
  const ok = Math.abs(got - exp) <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name} = ${got}${ok ? "" : `  (คาด ${exp})`}`);
};
const ok_ = (name, cond) => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✅" : "❌"} ${name}`);
};

console.log("\n═══ (ก) Rev เพิ่มยอด — งวด 1 จ่ายแล้ว (locked) → งวดที่เหลือ re-split ตามยอดใหม่ ═══");
{
  // เดิม 3 งวด รวม 300,000 (งวด1=120,000 จ่ายแล้ว) → Rev เพิ่มเป็น 360,000
  const lockedSum = 120000, paidLocked = 120000;
  const r = planRevUnpaidInstallments({ newTotalTarget: 360000, lockedSum, paidLocked, vatRate: 0 });
  near("newTotal = ยอดใหม่ที่กรอกเป๊ะ", r.newTotal, 360000);
  const sumItems = round2(r.items.reduce((s, i) => s + i.amount, 0));
  near("Σ items = newTotal - lockedSum", sumItems, 360000 - lockedSum);
  ok_("ไม่มี overpaid", r.overpaid === 0);
  ok_("ทุก item amount > 0 (ไม่มี adjustment line)", r.items.every((i) => i.amount > 0));
}

console.log("\n═══ (ข) Rev ลดยอดต่ำกว่าที่จ่ายแล้ว — โชว์ 'รับเกิน' ═══");
{
  // จ่ายมัดจำงวด 1 = 120,000 (locked) แต่ Rev ยอดใหม่ทั้งใบเหลือแค่ 100,000 (ลูกค้าลดงาน)
  const lockedSum = 120000, paidLocked = 120000;
  const r = planRevUnpaidInstallments({ newTotalTarget: 100000, lockedSum, paidLocked, vatRate: 0 });
  near("newTotal = ยอดใหม่ที่กรอกเป๊ะ (ต่ำกว่า lockedSum ก็ยอมให้)", r.newTotal, 100000);
  near("overpaid = paidLocked - newTotal", r.overpaid, 20000);
  ok_("มี adjustment line ติดลบ 1 บรรทัด", r.items.length === 1 && r.items[0].amount < 0);
  near("adjustment amount = newTotal - lockedSum", r.items[0]?.amount ?? 0, 100000 - lockedSum);
}

console.log("\n═══ (ข-2) ยอดใหม่ = lockedSum พอดี (ไม่เหลือ ไม่เกิน) ═══");
{
  const r = planRevUnpaidInstallments({ newTotalTarget: 120000, lockedSum: 120000, paidLocked: 120000, vatRate: 0 });
  near("newTotal = lockedSum", r.newTotal, 120000);
  ok_("ไม่มีงวดใหม่ (items ว่าง)", r.items.length === 0);
  near("overpaid = 0", r.overpaid, 0);
}

console.log("\n═══ (ค) งวดจ่ายบางส่วน = locked — invariant Σ(locked)+Σ(items)=newTotal ยังต้องตรง ═══");
{
  // งวด 1 จ่ายบางส่วน 50,000 จาก 120,000 → ยังนับเป็น "locked" เต็มยอด 120,000 (ตรึง amount เดิม ไม่หัก)
  // paidLocked = เงินที่รับจริง (50,000) ใช้แค่เช็ค overpaid ไม่ใช่ตัวตั้ง lockedSum
  const lockedSum = 120000, paidLocked = 50000;
  const r = planRevUnpaidInstallments({ newTotalTarget: 300000, lockedSum, paidLocked, vatRate: 7 });
  const sumItems = round2(r.items.reduce((s, i) => s + i.amount, 0));
  near("Σ(locked)+Σ(items) = newTotal", round2(lockedSum + sumItems), 300000);
  ok_("จ่ายแค่ 50,000 < newTotal → ไม่ overpaid", r.overpaid === 0);
}

console.log("\n═══ (ง) บิลค่าแรง Rev — ภาษีต่องวดถูก (base/vat/wht ต่องวด sum ตรง invariant) ═══");
{
  // เดิม: subtotal 500,000 · VAT7 · WHT3 (เฉพาะค่าแรง 150,000) → งวด "ค่าแรง" locked จ่ายไปแล้ว 1 งวด
  const vat = 7, wht = 3;
  const targetMaterialBase = 350000, targetLaborBase = 150000; // เป้าหมายใหม่ทั้งใบ (หลัง Rev แก้ subtotal/ส่วนลด)
  // locked: งวดค่าแรงจ่ายไปแล้วเต็มก้อน (base 150,000 ตรงเป้าหมายเป๊ะ — เคสง่ายสุดไม่มี drift)
  const lockedLaborBase = 150000, lockedMaterialBase = 0, lockedUnknownBase = 0;
  // lockedSum = amount ของงวดค่าแรงที่ booked จริงตอนนั้น (base+vat-wht) = 150000*1.07 - 150000*0.03*... (ท.ป.4/2528 ฐานก่อนVAT)
  const laborVat = round2(150000 * 0.07);
  const laborWht = round2(150000 * 0.03);
  const lockedSum = round2(150000 + laborVat - laborWht);
  const paidLocked = lockedSum;

  const r = planRevUnpaidInstallmentsLabor({
    targetMaterialBase, targetLaborBase, lockedMaterialBase, lockedLaborBase, lockedUnknownBase,
    lockedSum, paidLocked, vatRate: vat, whtRate: wht, newTotalTarget: 0, // ไม่ใช้ (remMaterial>0)
  });
  ok_("ไม่มี taxWarning (รู้ kind/base ครบ)", r.taxWarning === false);
  // ทุก item ต้องมี base_amt/vat_amt/wht_amt (tax-aware) และ amount = base+vat-wht
  const perItemOk = r.items.every((i) =>
    i.base_amt != null && Math.abs((i.amount) - ((i.base_amt ?? 0) + (i.vat_amt ?? 0) - (i.wht_amt ?? 0))) <= 0.01
  );
  ok_("ทุกงวดใหม่: amount = base+vat-wht (booked ต่องวดถูก)", perItemOk);
  // Σ base ของงวดใหม่ (kind=material) + lockedMaterialBase ต้องเท่า targetMaterialBase
  const newMaterialBase = round2(r.items.filter((i) => i.kind === "material").reduce((s, i) => s + (i.base_amt ?? 0), 0));
  near("Σ base งวดใหม่ (material) + locked = targetMaterialBase", round2(newMaterialBase + lockedMaterialBase), targetMaterialBase);
  // labor ไม่เหลือ (locked ครบแล้ว) → ไม่มีงวด kind=labor ใหม่
  ok_("ไม่มีงวดค่าแรงใหม่ (locked ครอบคลุมแล้ว)", r.items.every((i) => i.kind !== "labor"));
}

console.log("\n═══ (ง-2) บิลค่าแรง — มีงวด locked ที่ไม่รู้ kind/base_amt (ใบเก่า) → taxWarning ═══");
{
  const r = planRevUnpaidInstallmentsLabor({
    targetMaterialBase: 300000, targetLaborBase: 100000,
    lockedMaterialBase: 0, lockedLaborBase: 0, lockedUnknownBase: 50000, // งวดเก่าไม่รู้ชัด
    lockedSum: 50000, paidLocked: 50000, vatRate: 7, whtRate: 3, newTotalTarget: 0,
  });
  ok_("ยก taxWarning เมื่อมีงวด locked ที่ไม่รู้ kind/base", r.taxWarning === true);
}

console.log("\n═══ (จ) sanity: planRevUnpaidInstallments ไม่พึ่ง state ภายนอก (pure) ═══");
{
  const a = planRevUnpaidInstallments({ newTotalTarget: 200000, lockedSum: 0, paidLocked: 0, vatRate: 7 });
  const b = planRevUnpaidInstallments({ newTotalTarget: 200000, lockedSum: 0, paidLocked: 0, vatRate: 7 });
  ok_("เรียกซ้ำด้วย input เดิม → ผลเหมือนเดิมเป๊ะ", JSON.stringify(a) === JSON.stringify(b));
  // lockedSum=0 (ยังไม่จ่ายอะไรเลย) → เท่ากับ suggestInstallments(200000) ตรง ๆ (ยืนยันด้วย computeTotals reference)
  const t = computeTotals({ items: [{ qty: 1, unit_price: 200000 }], vat_rate: 0, discount_pct: 0, wht_rate: 0 });
  near("newTotal ตรงกับยอดที่ตั้งไว้เมื่อไม่มีงวด locked เลย", a.newTotal, t.net);
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail > 0 ? 1 : 0);
