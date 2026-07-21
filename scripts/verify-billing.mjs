/**
 * verify-billing — เทสสูตรเงิน ใบวางบิล → ใบเสร็จ (กฎเหล็ก: ยอดต้องตรง)
 *
 * รัน:  node --experimental-strip-types scripts/verify-billing.mjs
 * import โค้ดจริงจาก src/lib/money.ts ตรง ๆ (ไม่ลอกสูตรมาเทส — ลอกแล้วเทสผ่านทั้งที่ของจริงพัง)
 *
 * ครอบ: VAT 0/7 × หัก ณ ที่จ่าย 0/3 × ใบใหม่/ใบเก่า × footer_override ใบ × โหมดแก้ยอด
 */
import {
  computeTotals, backoutVat, splitCashReceived, footerSnapshot, suggestInstallments,
  billVatDecision, effectiveBillVat, isNoVatBill, planInstallments,
} from "../src/lib/money.ts";

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n     ได้  : ${JSON.stringify(got)}\n     คาด : ${JSON.stringify(exp)}`}`);
};
const near = (name, got, exp, tol = 0.005) => {
  const ok = Math.abs(got - exp) <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name} = ${got}${ok ? "" : `  (คาด ${exp})`}`);
};

console.log("\n═══ ① computeTotals — ลำดับ (ยอด−ส่วนลด) → VAT → (−หัก ณ ที่จ่าย) ═══");
{
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 0, wht_rate: 0 });
  eq("VAT 7% ไม่มีส่วนลด/WHT", [t.subtotal, t.vat_amt, t.total, t.net], [100000, 7000, 107000, 107000]);
}
{
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 0, discount_pct: 0, wht_rate: 0 });
  eq("ไม่มี VAT", [t.subtotal, t.vat_amt, t.total, t.net], [100000, 0, 100000, 100000]);
}
{
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 0, wht_rate: 3 });
  eq("VAT 7% + หัก ณ ที่จ่าย 3%", [t.subtotal, t.vat_amt, t.total, t.wht_amt, t.net], [100000, 7000, 107000, 3000, 104000]);
}
{
  // ส่วนลดบาท ต้องชนะ % เสมอ (กฎบัญชี — กัน round-trip drift)
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 50, discount_amt: 1234.56, wht_rate: 0 });
  eq("ส่วนลดบาทชนะ %", [t.discount_amt, t.after_discount], [1234.56, 98765.44]);
}
{
  // clamp: ส่วนลดเกินยอด → ไม่ให้ติดลบ
  const t = computeTotals({ items: [{ qty: 1, unit_price: 1000 }], vat_rate: 0, discount_pct: 0, discount_amt: 99999, wht_rate: 0 });
  eq("ส่วนลดเกินยอด → clamp", [t.discount_amt, t.after_discount, t.net], [1000, 0, 0]);
}

console.log("\n═══ ①-b computeTotals — หัก ณ ที่จ่ายเฉพาะ 'ค่าแรง' (17 ก.ค.69) ═══");
{
  // ยอดก่อน VAT 100,000 · ค่าแรง 30,000 (บาท) · VAT7 WHT3 → WHT บน 30,000 = 900, net 106,100
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 0, wht_rate: 3, labor_amount: 30000 });
  eq("ค่าแรงบาท → WHT เฉพาะค่าแรง", [t.labor_amt, t.material_amt, t.vat_amt, t.total, t.wht_amt, t.net], [30000, 70000, 7000, 107000, 900, 106100]);
}
{
  // ค่าแรง 30% ของ after_discount → labor 30,000 → เลขเท่ากันเป๊ะ
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 0, wht_rate: 3, labor_pct: 30 });
  eq("ค่าแรง % → เท่ากับกรอกบาท", [t.labor_amt, t.wht_amt, t.net], [30000, 900, 106100]);
}
{
  // legacy: ไม่ส่งค่าแรง → WHT ยังเป็นทั้งบิล (เคส ③ เดิม กันพัง)
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 0, wht_rate: 3 });
  eq("ไม่ส่งค่าแรง → WHT ทั้งบิล (legacy)", [t.labor_amt, t.wht_amt, t.net], [0, 3000, 104000]);
}
{
  // ค่าแรง = 0 (ส่ง explicit) → ไม่หัก
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 0, wht_rate: 3, labor_amount: 0 });
  eq("ค่าแรง 0 → WHT 0", [t.labor_amt, t.wht_amt, t.net], [0, 0, 107000]);
}
{
  // ค่าแรง > after_discount → clamp = after_discount (= จ้างทำของโดยปริยาย)
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 0, wht_rate: 3, labor_amount: 999999 });
  eq("ค่าแรงเกินยอด → clamp", [t.labor_amt, t.wht_amt, t.net], [100000, 3000, 104000]);
}
{
  // No-VAT + ค่าแรง 30k → vat 0, wht 900, net 99,100
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 0, discount_pct: 0, wht_rate: 3, labor_amount: 30000 });
  eq("No-VAT + ค่าแรง → wht เฉพาะค่าแรง", [t.vat_amt, t.total, t.wht_amt, t.net], [0, 100000, 900, 99100]);
}
{
  // ส่วนลด 10k + ค่าแรง 30k → after 90k, material 60k, vat 6300, wht 900, net 95400
  const t = computeTotals({ items: [{ qty: 1, unit_price: 100000 }], vat_rate: 7, discount_pct: 0, discount_amt: 10000, wht_rate: 3, labor_amount: 30000 });
  eq("ส่วนลด + ค่าแรง", [t.after_discount, t.labor_amt, t.material_amt, t.vat_amt, t.total, t.wht_amt, t.net], [90000, 30000, 60000, 6300, 96300, 900, 95400]);
}
{
  // footerSnapshot ส่งค่าแรง → wht เฉพาะค่าแรง
  const f = footerSnapshot(100000, 0, 7, 3, undefined, 30000);
  eq("footerSnapshot + ค่าแรง", [f.vat_amt, f.wht_amt, f.net], [7000, 900, 106100]);
}

console.log("\n═══ ② backoutVat — ถอด VAT จากยอดรวม VAT ═══");
eq("backout 107,000 @7% → ฐาน 100,000", backoutVat(107000, 7), { base: 100000, vat: 7000 });
eq("backout @0% = ไม่มี VAT", backoutVat(50000, 0), { base: 50000, vat: 0 });

console.log("\n═══ ③ billVatDecision — ใบวางบิลบอก VAT ได้ชัดไหม (ยึด vat_rate_set 0095) ═══");
eq("ใบใหม่ VAT 7 (ยืนยันแล้ว)", billVatDecision({ vat_rate: 7, vat_rate_set: true }), { rate: 7, known: true });
eq("ใบใหม่ No-VAT (ยืนยันแล้ว)", billVatDecision({ vat_rate: 0, vat_rate_set: true }), { rate: 0, known: true });
eq("ใบเก่า/import → ไม่รู้ชัด", billVatDecision({ vat_rate: 0, vat_rate_set: false }), { rate: 0, known: false });
eq("ใบเก่าที่ vat_rate ค้าง 7 แต่ยังไม่ยืนยัน → ไม่รู้ชัด (ห้ามเชื่อ)", billVatDecision({ vat_rate: 7, vat_rate_set: false }), { rate: 0, known: false });

console.log("\n═══ ④ effectiveBillVat — อัตราที่ใบเสร็จต้องใช้ (บั๊กที่เจ้าของเจอ) ═══");
// 🔴 เคสบั๊กจริง: ผู้ใช้ติ๊ก VAT ออกที่ใบวางบิล แต่ jobs.vat_rate ยังเป็น 7 (เขียนครั้งเดียวตอนสร้างใบเสนอ)
near("ใบติ๊ก VAT ออก + งานเป็น 7 → ต้องได้ 0 (เดิมได้ 7 = บั๊ก)",
  effectiveBillVat({ vat_rate: 0, vat_rate_set: true }, 7), 0);
near("ใบมี VAT 7 + งานเป็น 0 → ต้องได้ 7", effectiveBillVat({ vat_rate: 7, vat_rate_set: true }, 0), 7);
near("ใบเก่า (ไม่รู้ชัด) → fallback อัตราของงาน 7 (พฤติกรรมเดิม ห้ามขยับ)",
  effectiveBillVat({ vat_rate: 0, vat_rate_set: false }, 7), 7);
near("ใบเก่า + งาน No-VAT → 0", effectiveBillVat({ vat_rate: 0, vat_rate_set: false }, 0), 0);

console.log("\n═══ ⑤ isNoVatBill — ใบไหน 'ติ๊กชำระพอ ไม่ต้องออกใบกำกับ' ═══");
eq("ใบใหม่ No-VAT → ใช่", isNoVatBill({ vat_rate: 0, vat_rate_set: true }), true);
eq("ใบใหม่ VAT 7 → ไม่ใช่", isNoVatBill({ vat_rate: 7, vat_rate_set: true }), false);
eq("ใบเก่าไม่รู้ชัด → ไม่ใช่ (ยอดอาจรวม VAT อยู่ · ต้องออกใบเสร็จตามเดิม)", isNoVatBill({ vat_rate: 0, vat_rate_set: false }), false);
// fail-safe: ใบเก่าที่ footer (ที่ส่งลูกค้าจริง) โชว์ VAT 0 → ต้องยังซ่อนปุ่มออกใบเสร็จเหมือนก่อน 0095
// (ถ้าไม่มีบรรทัดนี้ = regression: ปุ่มโผล่ → กดแล้วออกใบกำกับ VAT 7% ขัดกับใบที่ส่งลูกค้า)
eq("🔴 ใบเก่า + footer โชว์ VAT 0 → ยังถือ No-VAT (คงพฤติกรรมเดิม)",
  isNoVatBill({ vat_rate: 0, vat_rate_set: false, footer_override: { vat_rate: 0, net: 85000 } }), true);
eq("ใบเก่า + footer โชว์ VAT 7 → ไม่ใช่ No-VAT",
  isNoVatBill({ vat_rate: 0, vat_rate_set: false, footer_override: { vat_rate: 7, net: 107000 } }), false);
eq("footer ไม่สมบูรณ์ (ไม่มี net) → ไม่นับ",
  isNoVatBill({ vat_rate: 0, vat_rate_set: false, footer_override: { vat_rate: 0 } }), false);
// footer มี net แต่ vat_rate เป็น null → ต้องถือว่า "ไม่มี VAT" ตามเจตนา (Number(null)||0 = 0) ไม่ใช่หลุดโดยบังเอิญ
eq("footer net มี · vat_rate = null → ถือ No-VAT (ตั้งใจ)",
  isNoVatBill({ vat_rate: 0, vat_rate_set: false, footer_override: { vat_rate: null, net: 100 } }), true);
eq("ใบที่ยืนยัน VAT 7 แล้ว → footer ไม่มีสิทธิ์พลิกเป็น No-VAT (ธง booked ชนะ)",
  isNoVatBill({ vat_rate: 7, vat_rate_set: true, footer_override: { vat_rate: 0, net: 85000 } }), false);
// ⚠ ยืนยันว่า footer_override "ห้ามขับตัวเลข" — effectiveBillVat ต้องไม่แตะ ov เด็ดขาด
near("effectiveBillVat ไม่สนใจ footer_override (ov ขับตัวเลขไม่ได้)",
  effectiveBillVat({ vat_rate: 0, vat_rate_set: false, footer_override: { vat_rate: 0, net: 85000 } }, 7), 7);

console.log("\n═══ ⑤b splitCashReceived — แยกเงินสดรับ → ฐาน/VAT/หัก ณ ที่จ่าย ═══");
// 🔴 เคสบั๊ก WHT: บิล 100,000 VAT7 WHT3 → บิลเก็บ total = net = 104,000 → งวดแตกจากยอดนี้
eq("A=104,000 VAT7 WHT3 → ฐาน 100,000 VAT 7,000 (เดิมได้ 97,196.26/6,803.74 = ผิด)",
  splitCashReceived(104000, 7, 3), { base: 100000, vat: 7000, wht: 3000, gross: 107000 });
eq("ไม่มี WHT → เหมือน backout ปกติ", splitCashReceived(107000, 7, 0), { base: 100000, vat: 7000, wht: 0, gross: 107000 });
eq("ไม่มีภาษีเลย → ผ่านตรง", splitCashReceived(59500, 0, 0), { base: 59500, vat: 0, wht: 0, gross: 59500 });
eq("No-VAT แต่มี WHT 3 → ฐาน = เงินรับ + wht", splitCashReceived(97000, 0, 3), { base: 100000, vat: 0, wht: 3000, gross: 100000 });
{
  // invariant: ฐาน + VAT − WHT = เงินรับ เป๊ะเสมอ (ไม่มีสตางค์ลอย) — ไล่เลขหลายแบบรวมเศษ
  let bad = 0;
  for (const A of [1, 33.33, 999.99, 12345.67, 59500, 104000, 1234567.89]) {
    for (const [r, w] of [[0, 0], [7, 0], [0, 3], [7, 3], [7, 1], [7, 5], [7, 2]]) {
      const s = splitCashReceived(A, r, w);
      const back = Math.round((s.base + s.vat - s.wht) * 100) / 100;
      if (Math.abs(back - Math.round(A * 100) / 100) > 0.005) { bad++; console.log(`   ⚠ A=${A} r=${r} w=${w} → ${back}`); }
      // VAT ต้อง = r% ของฐานที่พิมพ์บนใบ (บัญชี: แต่ละใบต้องถูกในตัวเอง) — ยอมพลาด ≤0.01 จากการปัด
      if (r > 0 && Math.abs(s.vat - Math.round((s.base * r) / 100 * 100) / 100) > 0.011) { bad++; console.log(`   ⚠ VAT≠${r}%×ฐาน A=${A} r=${r} w=${w}`); }
    }
  }
  eq("invariant ฐาน+VAT−WHT = เงินรับ · และ VAT = r%×ฐาน (49 ชุด)", bad, 0);
}

console.log("\n═══ ⑤b2 สูตรใหม่ต้องให้เลข 'เท่าของเดิมเป๊ะ' — ใบเสร็จเก่าห้ามขยับ (บัญชีข้อ #9) ═══");
{
  // สูตรเดิมใน receipts/route.ts: vat = round2(A×r/(100+r)) — หาร 1 ครั้ง
  // สูตรใหม่ splitCashReceived (w=0): raw = A/(1+r/100) → vat = round2(raw×r/100) — หารแล้วคูณ
  // พีชคณิตเท่ากัน แต่ลำดับ floating-point ต่าง → ถ้าค่าจริงตกขอบ .xx5 พอดี round2 อาจกระโดด 0.01
  // brute-force ปิดข้อสงสัยถาวร (บัญชีแนะนำ)
  const oldVat = (A, r) => Math.round(((A * r) / (100 + r) + Number.EPSILON) * 100) / 100;
  let diff = 0, worst = null;
  for (const r of [7]) {
    for (let cents = 1; cents <= 20_000_000; cents++) { // 0.01 → 200,000.00 ทีละสตางค์
      const A = cents / 100;
      const o = oldVat(A, r);
      const n = splitCashReceived(A, r, 0).vat;
      if (o !== n) { diff++; if (!worst) worst = { A, o, n }; }
    }
  }
  eq(`สูตรเก่า=ใหม่ ทุกยอด 0.01–200,000 (20 ล้านค่า, VAT 7%)${worst ? ` · ตัวอย่างต่าง: ${JSON.stringify(worst)}` : ""}`, diff, 0);
}

console.log("\n═══ ⑤c mode A 'แก้ยอดบิล' — ต้องไม่ล้างการตัดสินใจ VAT (P0 บัญชี) ═══");
{
  // จำลอง logic mode A ใหม่: carry forward vat_rate_set + back-out จากยอด flat
  const modeA = (newTotal, old) => {
    const keepSet = !!old.has_tax_breakdown || !!old.vat_rate_set;
    const keepRate = keepSet ? Number(old.vat_rate) || 0 : 0;
    const f = backoutVat(newTotal, keepRate);
    return { subtotal: f.base, vat_rate: keepRate, vat_amt: f.vat, has_tax_breakdown: false, vat_rate_set: keepSet };
  };
  // 🔴 เคสที่พังวันนี้: ติ๊ก VAT ออก (mode B) แล้วกด "แก้ยอดบิล" → VAT 7% กลับมาเงียบๆ ผ่าน fallback งาน
  const a1 = modeA(90000, { vat_rate: 0, vat_rate_set: true, has_tax_breakdown: true });
  eq("No-VAT แล้วแก้ยอด → ยังไม่มี VAT", [a1.vat_rate, a1.vat_rate_set, a1.subtotal, a1.vat_amt], [0, true, 90000, 0]);
  near("ใบเสร็จหลังแก้ยอด: อัตรายังเป็น 0 (ไม่ fallback ไป 7)", effectiveBillVat(a1, 7), 0);
  // ใบมี VAT แล้วแก้ยอด flat → ถอด VAT จากยอดใหม่ (subtotal + vat = total เป๊ะ)
  const a2 = modeA(107000, { vat_rate: 7, vat_rate_set: true, has_tax_breakdown: true });
  eq("มี VAT แล้วแก้ยอด → ถอด VAT จากยอดใหม่", [a2.vat_rate, a2.subtotal, a2.vat_amt], [7, 100000, 7000]);
  near("subtotal + vat = total เป๊ะ", a2.subtotal + a2.vat_amt, 107000);
  // ใบเก่าที่ไม่เคยยืนยัน → ยังไม่รู้ชัด → ใบเสร็จ fallback งาน (พฤติกรรมเดิม ห้ามขยับ)
  const a3 = modeA(50000, { vat_rate: 0, vat_rate_set: false, has_tax_breakdown: false });
  eq("ใบเก่าแก้ยอด → ยังไม่รู้ชัด", [a3.vat_rate_set, a3.subtotal], [false, 50000]);
  near("ใบเก่า → ใบเสร็จยัง fallback งาน 7", effectiveBillVat(a3, 7), 7);
}

console.log("\n═══ ⑥ เดินเลขเคสจริงที่เจ้าของแจ้ง (บิล 85,000 ติ๊ก VAT ออก) ═══");
{
  const t = computeTotals({ items: [{ qty: 1, unit_price: 85000 }], vat_rate: 0, discount_pct: 0, wht_rate: 0 });
  const plan = suggestInstallments(t.net);
  const inst1 = plan[0].amount;
  near("ยอดบิลหลังติ๊ก VAT ออก", t.net, 85000);
  near("งวด 1 (70%)", inst1, 59500);
  // ใบเสร็จ: อัตราถูก = 0 → ไม่ถอด VAT (ฐาน = เงินรับ)
  const rateFixed = effectiveBillVat({ vat_rate: 0, vat_rate_set: true }, 7);
  const okB = backoutVat(inst1, rateFixed);
  eq("ใบเสร็จหลังแก้: ฐาน=59,500 VAT=0 (ตรงใบวางบิล)", okB, { base: 59500, vat: 0 });
  // ของเดิม (อ่าน jobs.vat_rate=7) → เลขที่เจ้าของเห็นว่า "ไม่ตรงกับอะไรเลย"
  const bugVat = Math.round((inst1 * 7) / 107 * 100) / 100;
  near("ของเดิม (บั๊ก): VAT หลอนขึ้นมา", bugVat, 3892.52);
  near("ของเดิม (บั๊ก): ฐานเพี้ยน ไม่ตรงทั้ง 59,500 และ 85,000", Math.round((inst1 - bugVat) * 100) / 100, 55607.48);
}

console.log("\n═══ ⑦ ผลรวมงวด = ยอดบิลเป๊ะ (constraint tg_check_installment_sum) ═══");
for (const net of [85000, 100000, 104000, 107000, 250000, 333333.33, 500000, 1234567.89]) {
  const plan = suggestInstallments(net);
  const sum = Math.round(plan.reduce((a, p) => a + p.amount, 0) * 100) / 100;
  near(`ผลรวม ${plan.length} งวด ของ ${net}`, sum, Math.round(net * 100) / 100);
}

console.log("\n═══ ⑦-b suggestInstallments เรนจ์ (21 ก.ค.69) — 300-500k=3งวด ประกัน30k · 500-700k=4งวด ประกัน40k ═══");
{
  const p3 = suggestInstallments(300000);
  eq("≤300k คงเดิม 3 งวด 40/50/10", [p3.length, p3.map((x) => x.amount)], [3, [120000, 150000, 30000]]);
  const p4 = suggestInstallments(400000);
  eq("300-500k → 3 งวด 35%/เหลือ/ประกัน 30,000", [p4.length, p4.map((x) => x.amount), p4[2].label.includes("เงินประกัน")], [3, [140000, 230000, 30000], true]);
  const p5 = suggestInstallments(500000);
  eq("=500k → ยัง 3 งวด (ประกัน 30,000)", [p5.length, p5.map((x) => x.amount)], [3, [175000, 295000, 30000]]);
  const p6 = suggestInstallments(600000);
  eq("500-700k → 4 งวด 35%/30%/เหลือ/ประกัน 40,000", [p6.length, p6.map((x) => x.amount), p6[3].label.includes("เงินประกัน")], [4, [210000, 180000, 170000, 40000], true]);
}

console.log("\n═══ ⑧ footerSnapshot — footer ต้องตรง computeTotals เสมอ ═══");
{
  const f = footerSnapshot(100000, 0, 7, 3);
  eq("footer 100k VAT7 WHT3", [f.subtotal, f.vat_amt, f.wht_amt, f.net], [100000, 7000, 3000, 104000]);
}

console.log("\n═══ ⑨ planInstallments — ค่าแรงงวดสุดท้าย + ภาษี booked ต่องวด (17 ก.ค.69) ═══");
const cell = (it) => [it.kind, it.amount, it.base_amt, it.vat_amt, it.wht_amt];
{
  // เคส A-1: material 70k labor 30k VAT7 WHT3 (ไม่มี retention)
  const r = planInstallments({ material_amt: 70000, labor_amt: 30000, vat_rate: 7, wht_rate: 3, hasRetention: false });
  eq("A-1 3 งวด (ของ/ของ/แรง)", r.installments.map(cell), [
    ["material", 44940, 42000, 2940, 0],
    ["material", 29960, 28000, 1960, 0],
    ["labor", 31200, 30000, 2100, 900],
  ]);
}
{
  // เคส A-2: + retention 40k
  const r = planInstallments({ material_amt: 70000, labor_amt: 30000, vat_rate: 7, wht_rate: 3, hasRetention: true });
  eq("A-2 4 งวด (+เงินประกัน งวดสุดท้าย)", r.installments.map(cell), [
    ["material", 20940, 19570.09, 1369.91, 0],
    ["material", 13960, 13046.73, 913.27, 0],
    ["labor", 31200, 30000, 2100, 900],
    ["retention", 40000, 37383.18, 2616.82, 0],
  ]);
}
{
  // เคส C: No-VAT · material 50k labor 20k WHT3 → งวดแรง amount < base (หลังหัก WHT)
  const r = planInstallments({ material_amt: 50000, labor_amt: 20000, vat_rate: 0, wht_rate: 3 });
  eq("C No-VAT ค่าแรง", r.installments.map(cell), [
    ["material", 50000, 50000, 0, 0],
    ["labor", 19400, 20000, 0, 600],
  ]);
}
{
  // เคสขอบ: labor=0 → ทุกงวด material, wht=0
  const r = planInstallments({ material_amt: 100000, labor_amt: 0, vat_rate: 7, wht_rate: 3 });
  eq("labor=0 → ไม่มีงวดค่าแรง", [r.installments.every((i) => i.kind === "material" && i.wht_amt === 0), r.installments.reduce((a, i) => a + i.wht_amt, 0)], [true, 0]);
}
{
  // เคสขอบ: material=0 (ค่าแรงล้วน) → 1 งวด labor · retention ขอแต่ทำไม่ได้
  const r = planInstallments({ material_amt: 0, labor_amt: 40000, vat_rate: 7, wht_rate: 3, hasRetention: true });
  eq("material=0 → 1 งวดแรง · retention auto-off", [r.installments.length, r.installments[0].kind, r.retentionApplied], [1, "labor", false]);
}
// invariant loop: ทุก combo → Σ ครบ 4 + amount=base+vat−wht ต่องวด
console.log("   — invariant loop (material×labor×vat×wht×retention) —");
{
  let bad = 0, cases = 0;
  for (const material of [0, 20000, 70000, 600000])
    for (const labor of [0, 5000, 30000, 100000])
      for (const vr of [0, 7])
        for (const wr of [0, 3])
          for (const ret of [false, true]) {
            cases++;
            const c = computeTotals({ items: [{ qty: 1, unit_price: material + labor }], vat_rate: vr, discount_pct: 0, wht_rate: wr, labor_amount: labor });
            const r = planInstallments({ material_amt: c.material_amt, labor_amt: c.labor_amt, vat_rate: vr, wht_rate: wr, hasRetention: ret });
            const s = r.installments.reduce((a, i) => ({ amt: a.amt + i.amount, base: a.base + i.base_amt, vat: a.vat + i.vat_amt, wht: a.wht + i.wht_amt }), { amt: 0, base: 0, vat: 0, wht: 0 });
            const rr = (n) => Math.round(n * 100) / 100;
            const perItem = r.installments.every((i) => Math.abs(i.amount - (i.base_amt + i.vat_amt - i.wht_amt)) <= 0.01);
            if (Math.abs(rr(s.amt) - c.net) > 0.01 || Math.abs(rr(s.base) - c.after_discount) > 0.01 ||
                Math.abs(rr(s.vat) - c.vat_amt) > 0.01 || Math.abs(rr(s.wht) - c.wht_amt) > 0.01 || !perItem) bad++;
          }
  eq(`invariant ครบทุก combo (${cases} เคส)`, bad, 0);
}

console.log(`\n═══ สรุป: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน ═══`);
process.exit(fail > 0 ? 1 : 0);
