import { getProfile } from "@/lib/auth";
import StockLedger from "./StockLedger";

export const dynamic = "force-dynamic";

// สมุดสโตร์ — รวมประวัติเคลื่อนไหวสโตร์ที่เดียว (รายวัน+รายเดือน+รับเข้า+เบิกออก+ปรับยอด)
//   แทนหน้ารายเดือนเดิม + แท็บ "รายวัน" ใน /cutlist (ยุบมาที่นี่)
export default async function StockMovesPage() {
  await getProfile();
  // การซ่อนราคาจากฝ่ายสโตร์ยังไม่เปิด — ทุกคนที่เข้าถึงเห็นราคา (ไว้สร้างแอคเคาท์สโตร์ค่อยตั้ง role)
  const canViewCost = true;
  return <StockLedger canViewCost={canViewCost} />;
}
