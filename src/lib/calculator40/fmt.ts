// fmt — จำนวนเต็มบาท (ไม่มีทศนิยม) แบบไทย ใช้กับป้ายราคา addon เท่านั้น
// ตรง app.js: const fmt = n => Math.round(n).toLocaleString('th-TH')
export function fmt(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("th-TH");
}
