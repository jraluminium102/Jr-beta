/**
 * /production-orders/[id]/cover
 * ใบปะหน้างาน (Cover Sheet) — Server Component
 * สิทธิ์อ่าน: ทุก role ที่อ่าน production_orders ได้
 * สิทธิ์แก้ไข: ADMIN / PRODUCTION / SALES
 */
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import CoverSheetView from "./CoverSheetView";

export const dynamic = "force-dynamic";

export default async function CoverSheetPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const role = profile.role as Role;
  if (!can(role, "production_orders", "read")) redirect(`/production-orders/${params.id}`);

  const canEdit = can(role, "production_orders", "write");

  return <CoverSheetView orderId={params.id} canEdit={canEdit} />;
}
