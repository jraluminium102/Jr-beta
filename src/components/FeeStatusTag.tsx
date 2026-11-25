import { FEE_STATUS_TH, type FeeStatus } from "@/lib/fee-check";

/**
 * ป้ายสถานะค่าประเมินหน้างาน — โชว์ในหน้าใบเสนอราคา · เช็คลิสต์ (เจ้าของ 25 พ.ย.69)
 *   ดูอย่างเดียว กดเปลี่ยนไม่ได้ · ข้อมูลมาจากหน้าคิวงาน (ค่าประเมิน + ติ๊กชำระ) แก้ที่นั่นที่เดียว
 *   null = งานนี้ไม่ได้ผูกกับคิวประเมิน → ไม่โชว์ป้าย (ไม่เดา)
 */
const STYLE: Record<FeeStatus, string> = {
  NONE: "bg-gray-100 text-gray-600",
  WAITING: "bg-orange-100 text-orange-800",
  PAID: "bg-emerald-100 text-emerald-800",
};

export default function FeeStatusTag({ status, small }: { status?: FeeStatus | null; small?: boolean }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold whitespace-nowrap ${STYLE[status]} ${small ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-0.5 text-xs"}`}
      title="สถานะค่าประเมิน — ดูอย่างเดียว อัปเดตตามหน้าคิวงาน"
    >
      {FEE_STATUS_TH[status]}
    </span>
  );
}
