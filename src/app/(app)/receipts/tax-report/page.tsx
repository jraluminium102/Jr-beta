import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import { isMonth } from "@/lib/sales-tax-report";
import TaxReportClient from "./TaxReportClient";

export const dynamic = "force-dynamic";

// รายงานภาษีขายรายเดือน (เจ้าของ 27 พ.ย.69) — ใบเสร็จในระบบ + ใบ FlowAccount ที่เพิ่มเข้ามา → ออก Excel แบบที่ใช้ยื่น
export default async function SalesTaxReportPage({ searchParams }: { searchParams: { m?: string } }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // หน้าปริ้น/หน้ารายงานต้องเช็คสิทธิ์เอง — ยอดขายทั้งเดือนเห็นได้เฉพาะคนที่มีสิทธิ์การเงิน
  if (!can(profile.role as Role, "finance", "read")) redirect("/receipts");

  // เดือนตั้งต้น = เดือนตามเวลาไทย (server บน Vercel เป็น UTC — ตี 0–7 ของวันที่ 1 จะได้เดือนก่อน)
  const fallback = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  const month = isMonth(searchParams.m) ? searchParams.m : fallback;
  return <TaxReportClient initialMonth={month} canEdit={can(profile.role as Role, "finance", "write")} />;
}
