import { baht } from "@/lib/money";
import type { InstallmentFooter } from "@/lib/types";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// แถวยอดท้ายใบวางบิล (รวมเป็นเงิน / VAT / จำนวนเงินรวมทั้งสิ้น / หัก ณ ที่จ่าย)
// — presentational ล้วน (ไม่มี "use client") ใช้ร่วม 2 ที่: PrintFooterEditor (ต้นฉบับ · แก้ได้) + สำเนา (อ่านอย่างเดียว)
// บรรทัด "จำนวนเงินรวมทั้งสิ้น" = ยอดรวม VAT แล้ว (ก่อนหัก ณ ที่จ่าย) — โชว์เฉพาะเมื่อมีหัก ณ ที่จ่าย
// (ไม่มีหัก → บรรทัดท้ายใบ "ยอดรวมทั้งสิ้น" เป็นยอดรวม VAT อยู่แล้ว ไม่ต้องโชว์ซ้ำ)
export function FooterDisplayRows({ v, suffix = "" }: { v: InstallmentFooter; suffix?: string }) {
  const cellL = "pr-10 py-0.5 text-gray-500 text-left";
  const cellR = "text-right tabular-nums";
  const afterDiscount = round2(v.subtotal - v.discount_amt);
  const gross = round2(afterDiscount + v.vat_amt); // รวม VAT · ก่อนหัก ณ ที่จ่าย
  return (
    <>
      {/* ใบวางบิลไม่โชว์ส่วนลด (เจ้าของสั่ง 22 ต.ค.69 — ส่วนลดโชว์แค่ใบเสนอราคา) → "รวมเป็นเงิน" = ยอดหลังหักส่วนลดแล้ว */}
      <tr><td className={cellL}>รวมเป็นเงิน{suffix}</td><td className={cellR}>{baht(afterDiscount)}</td></tr>
      {v.vat_amt > 0 && <tr><td className={cellL}>ภาษีมูลค่าเพิ่ม {v.vat_rate}%</td><td className={cellR}>{baht(v.vat_amt)}</td></tr>}
      {v.wht_amt > 0 && <tr className="font-semibold"><td className={cellL}>จำนวนเงินรวมทั้งสิ้น</td><td className={cellR}>{baht(gross)}</td></tr>}
      {v.wht_amt > 0 && <tr><td className={cellL}>หักภาษี ณ ที่จ่าย {v.wht_rate}%</td><td className={`${cellR} text-red-700`}>-{baht(v.wht_amt)}</td></tr>}
    </>
  );
}
