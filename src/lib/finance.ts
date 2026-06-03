// คำนวณฝั่ง app (DB ก็ทำซ้ำใน trigger เพื่อ integrity) — OQ-04
const VAT_RATE = 0.07;

export function calcFinancials(netAmount: number, discount = 0) {
  const net = Math.round((netAmount - discount) * 100) / 100; // ยอดก่อน VAT หักส่วนลดแล้ว
  const vat = Math.round(net * VAT_RATE * 100) / 100;
  return { netAmount: net, vatAmount: vat, totalAmount: net + vat, discountAmount: discount };
}

export function calcOutstanding(total: number, entries: { amount: number; is_voided: boolean }[]) {
  const paid = entries.filter((e) => !e.is_voided).reduce((s, e) => s + Number(e.amount), 0);
  return Math.round((total - paid) * 100) / 100;
}
