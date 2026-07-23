import { getProfile } from "@/lib/auth";
import { canSeeCost } from "@/lib/rbac";
import StockLedger from "./StockLedger";

export const dynamic = "force-dynamic";

const STORE_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING", "STORE"];

// สมุดสโตร์ — รวมประวัติเคลื่อนไหวสโตร์ที่เดียว (รายวัน+รายเดือน+รับเข้า+เบิกออก+ปรับยอด)
//   แทนหน้ารายเดือนเดิม + แท็บ "รายวัน" ใน /cutlist (ยุบมาที่นี่) · role สโตร์ = ซ่อนราคา (redact ที่ API ด้วย)
export default async function StockMovesPage() {
  const profile = await getProfile();
  const role = profile?.role ?? "";
  return <StockLedger canViewCost={canSeeCost(role || null)} canRelink={STORE_WRITE.includes(role)} />;
}
