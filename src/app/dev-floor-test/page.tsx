import { notFound } from "next/navigation";
import Harness from "./Harness";

/**
 * หน้าทดสอบหน้าตาใบเสนอราคางานพื้น (dev เท่านั้น — production คืน 404)
 *   ?edit=1  = โหมดแก้ไข · ไม่ใส่ = โหมดพิมพ์
 * ใช้ตรวจว่า 2 โหมดหน้าตาตรงกัน (คอมโพเนนต์ตัวเดียวกัน ต่างแค่ editable)
 */
export const dynamic = "force-dynamic";

const RAW: [string, string, number][] = [
  ["งานส่วนชั้น2 (ระเบียง ห้องเสื้อผ้า)", "งานรื้อราวกันตก-รื้อไม้ระแนง-รื้อคิ้วปูน-รื้อบัว และเก็บงานปูนพร้อมขนทิ้ง", 13500],
  ["งานส่วนชั้น2 (ระเบียง ห้องเสื้อผ้า)", "งานเทปูนปรับพื้น", 10500],
  ["งานส่วนชั้น2 (ระเบียง ห้องเสื้อผ้า)", "งานปูกระเบื้องพื้นพร้อมปูนทราย (ไม่รวมกระเบื้อง)", 9500],
  ["งานส่วนชั้น2 (ระเบียง ห้องเสื้อผ้า)", 'งานเดินท่อร้อยสายไฟดาวน์ไลท์ 3 จุด สวิตช์ 1 จุด ดาวน์ไลท์ 6" สีขาว สวิตช์พานาโซนิคสีขาว', 8500],
  ["งานส่วนห้องเก็บของ", 'งานทำฝ้าฉาบเรียบ 9 มม. ใส่ฉนวนกันร้อน 3"', 9500],
  ["งานส่วนห้องเก็บของ", "งานทาสีผนังตัวบ้านและผนังสมาร์ทบอร์ด JR ภายใน", 12500],
];

const ITEMS = RAW.map(([group_label, name, p], i) => ({
  group_label, name, qty: 1, unit: "งาน",
  material_price: null, labor_price: p, unit_price: p, line_total: p,
  remark: i === 5 ? "งานเพิ่ม" : "", sort_order: i,
}));

export default function DevFloorTest({ searchParams }: { searchParams: { edit?: string } }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-dvh bg-gray-100 p-4">
      <Harness initial={ITEMS} editable={searchParams.edit === "1"} />
    </div>
  );
}
