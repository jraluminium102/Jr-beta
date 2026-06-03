import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PRODUCTION_STATUS_LABEL, type ProductionOrder } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: { id: string } }) {
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
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href={`/production-orders/${po.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {/* กระดาษ A4 */}
      <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "297mm", padding: "16mm" }}>
        <div className="flex justify-between items-start border-b-4 pb-4" style={{ borderColor: "#b3151d" }}>
          <div>
            <div className="text-3xl font-extrabold" style={{ color: "#b3151d" }}>JR <span className="text-gray-700">ALUMINIUM</span></div>
            <div className="text-xs text-gray-500 mt-1 leading-relaxed">
              บริษัท เจอาร์ อลูมิเนียม แอนด์ กลาส จำกัด<br />
              13 พหลโยธิน 25 จตุจักร กรุงเทพฯ 10140 · โทร 02-xxx-9000<br />
              เลขผู้เสียภาษี 0105xxxxxxxxx
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold" style={{ color: "#7d0f15" }}>ใบสั่งผลิต</div>
            <div className="text-xs text-gray-400">Production Order</div>
            <table className="text-xs mt-2 ml-auto">
              <tbody>
                <tr><td className="text-gray-500 pr-3 text-left">เลขที่</td><td className="font-mono font-semibold">{po.code}</td></tr>
                <tr><td className="text-gray-500 pr-3 text-left">กำหนดส่ง</td><td>{po.due_date || "—"}</td></tr>
                <tr><td className="text-gray-500 pr-3 text-left">สถานะ</td><td>{PRODUCTION_STATUS_LABEL[po.status]}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-sm">
          <div className="text-gray-500 text-xs">ลูกค้า / งาน</div>
          <div className="font-semibold">{c.name}{c.job ? ` · ${c.job}` : ""}</div>
          <div className="text-xs text-gray-500">{c.address}</div>
          <div className="text-xs text-gray-500">ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}</div>
        </div>

        <table className="w-full text-sm mt-5 border-collapse">
          <thead>
            <tr style={{ background: "#fdecec", color: "#7d0f15" }}>
              <th className="p-2 text-left border border-gray-200" style={{ width: 36 }}>#</th>
              <th className="p-2 text-left border border-gray-200">รายการ</th>
              <th className="p-2 text-left border border-gray-200">รายละเอียด / ขนาด</th>
              <th className="p-2 text-center border border-gray-200" style={{ width: 80 }}>จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="p-2 border border-gray-200 align-top">{i + 1}</td>
                <td className="p-2 border border-gray-200 align-top font-medium">{it.name}</td>
                <td className="p-2 border border-gray-200 align-top text-gray-600">{it.detail || "—"}</td>
                <td className="p-2 border border-gray-200 text-center align-top">{it.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {po.note && <div className="mt-6 text-xs text-gray-600"><b>หมายเหตุ:</b> {po.note}</div>}

        <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm">
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้สั่งผลิต</div></div>
          <div><div className="border-t border-gray-400 pt-2 mx-6">ช่างผลิต / ผู้รับงาน</div></div>
        </div>
      </div>
    </div>
  );
}
