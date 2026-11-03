import { OLD_CUSTOMER_LABEL } from "@/lib/queue";

/**
 * แท็ก "ลูกค้าเก่า" — โชว์ในใบเสนอราคา / เช็คลิสต์ / บอร์ดแบบ (เจ้าของ 3 พ.ย.69)
 *   แหล่งความจริง = คิวประเมิน (isOldCustomer ใน src/lib/queue.ts) ทั้งลูกค้าเก่าที่มีและไม่มีในระบบ
 */
export default function OldCustomerTag({ show, small }: { show?: boolean | null; small?: boolean }) {
  if (!show) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md bg-violet-100 text-violet-800 font-semibold ${small ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-0.5 text-xs"}`}
      title="ลูกค้าเก่า — มาจากคิวประเมิน"
    >
      {OLD_CUSTOMER_LABEL}
    </span>
  );
}
