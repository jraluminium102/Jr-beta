import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import ProductionActions from "./ProductionActions";
import { PRODUCTION_STATUS_LABEL, type ProductionOrder, type ProductionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TONE: Record<ProductionStatus, "gray" | "sky" | "amber" | "violet" | "emerald" | "red"> = {
  queued: "gray",
  measuring: "sky",
  manufacturing: "amber",
  qc: "violet",
  ready: "sky",
  installed: "emerald",
  done: "emerald",
  cancelled: "red",
};

export default async function ProductionOrderDetail({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("production_orders")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const po = data as ProductionOrder;
  const items = po.items ?? [];
  const c = po.customer_snapshot;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/production-orders" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono">{po.code}</h1>
          <Badge tone={TONE[po.status]} dot>{PRODUCTION_STATUS_LABEL[po.status]}</Badge>
        </div>
        <div className="flex gap-2">
          <Link href={`/production-orders/${po.id}/print`} className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark">
            <Icon name="printer" size={16} /> พิมพ์ / PDF
          </Link>
          {canWrite(profile?.role) && <ProductionActions id={po.id} status={po.status} />}
        </div>
      </div>

      <Card className="p-6">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-medium text-ink-3 mb-1">ลูกค้า / งาน</div>
            <div className="font-semibold">{c.name}</div>
            <div className="text-ink-2">{c.job}</div>
            <div className="text-xs text-ink-3 mt-1">{c.address}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs text-ink-3">กำหนดส่ง: <b className="text-ink">{po.due_date || "—"}</b></div>
            <div className="text-xs text-ink-3">วัดหน้างาน: {po.measure_date || "—"}</div>
            <div className="text-xs text-ink-3">ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}</div>
          </div>
        </div>

        <div className="overflow-x-auto mt-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-brand-soft text-brand-dark">
                <th className="p-2 rounded-l-lg">#</th>
                <th>รายการ</th>
                <th>รายละเอียด / ขนาด</th>
                <th className="text-center p-2 rounded-r-lg">จำนวน</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="p-2 align-top">{i + 1}</td>
                  <td className="font-medium align-top">{it.name}</td>
                  <td className="text-ink-2 align-top">{it.detail || "—"}</td>
                  <td className="text-center p-2 align-top">{it.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {po.note && <div className="mt-5 text-xs text-ink-2"><b>หมายเหตุ:</b> {po.note}</div>}
      </Card>
    </div>
  );
}
