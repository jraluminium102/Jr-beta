import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import { isMonth } from "@/lib/sales-tax-report";
import PurchaseTaxClient from "./PurchaseTaxClient";

export const dynamic = "force-dynamic";

// รายงานภาษีซื้อรายเดือน (เจ้าของ 27 พ.ย.69) — สแกนบิลให้ AI อ่าน → คนตรวจ → ออก Excel แบบชีต "ซื้อ"
export default async function PurchaseTaxPage({ searchParams }: { searchParams: { m?: string } }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // หน้ารายงานต้องเช็คสิทธิ์เอง — ราคาซื้อจากร้านค้าเห็นได้เฉพาะคนที่แก้การเงินได้ (ฝ่ายขายมีแค่ finance:read ไม่ให้เห็น)
  if (!can(profile.role as Role, "finance", "write")) redirect("/receipts");

  // เดือนตั้งต้น = เดือนตามเวลาไทย (server บน Vercel เป็น UTC)
  const fallback = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  const month = isMonth(searchParams.m) ? searchParams.m : fallback;
  return <PurchaseTaxClient initialMonth={month} />;
}
