import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht } from "@/lib/money";
import { STATUS_LABEL, type Quotation } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const q = data as Quotation;
  const items = (q.quotation_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const c = q.customer_snapshot;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href={`/quotations/${q.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
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
            <div className="text-xl font-bold" style={{ color: "#7d0f15" }}>ใบเสนอราคา</div>
            <div className="text-xs text-gray-400">Quotation</div>
            <table className="text-xs mt-2 ml-auto">
              <tbody>
                <tr><td className="text-gray-500 pr-3 text-left">เลขที่</td><td className="font-mono font-semibold">{q.code}</td></tr>
                <tr><td className="text-gray-500 pr-3 text-left">วันที่</td><td>{q.issue_date}</td></tr>
                <tr><td className="text-gray-500 pr-3 text-left">สถานะ</td><td>{STATUS_LABEL[q.status]}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-sm">
          <div className="text-gray-500 text-xs">ลูกค้า</div>
          <div className="font-semibold">{c.name}{c.job ? ` · ${c.job}` : ""}</div>
          <div className="text-xs text-gray-500">{c.address}</div>
          {c.tax_id && <div className="text-xs text-gray-500">เลขผู้เสียภาษี: {c.tax_id}</div>}
          <div className="text-xs text-gray-500">ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}</div>
        </div>

        <table className="w-full text-sm mt-5 border-collapse">
          <thead>
            <tr style={{ background: "#fdecec", color: "#7d0f15" }}>
              <th className="p-2 text-left border border-gray-200" style={{ width: 36 }}>#</th>
              <th className="p-2 text-left border border-gray-200">รายการ</th>
              <th className="p-2 text-center border border-gray-200" style={{ width: 64 }}>จำนวน</th>
              <th className="p-2 text-right border border-gray-200" style={{ width: 110 }}>ราคา/หน่วย</th>
              <th className="p-2 text-right border border-gray-200" style={{ width: 120 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td className="p-2 border border-gray-200 align-top">{i + 1}</td>
                <td className="p-2 border border-gray-200">
                  <div className="font-medium">{it.name}</div>
                  {it.detail && <div className="text-xs text-gray-500">{it.detail}</div>}
                </td>
                <td className="p-2 border border-gray-200 text-center align-top">{baht(it.qty)}</td>
                <td className="p-2 border border-gray-200 text-right align-top">{baht(it.unit_price)}</td>
                <td className="p-2 border border-gray-200 text-right align-top">{baht(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ยอดรวมก่อนภาษี</td><td className="text-right">{baht(q.subtotal)}</td></tr>
              {q.discount_amt > 0 && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ส่วนลด {q.discount_pct}%</td><td className="text-right">-{baht(q.discount_amt)}</td></tr>}
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ภาษีมูลค่าเพิ่ม {q.vat_rate}%</td><td className="text-right">{baht(q.vat_amt)}</td></tr>
              <tr className="font-bold" style={{ color: "#7d0f15" }}><td className="pr-10 py-1 border-t text-left">ยอดรวมสุทธิ</td><td className="text-right border-t">฿{baht(q.total)}</td></tr>
              {q.wht_amt > 0 && (<>
                <tr><td className="pr-10 py-0.5 text-gray-500 text-left">หัก ณ ที่จ่าย {q.wht_rate}%</td><td className="text-right">-{baht(q.wht_amt)}</td></tr>
                <tr className="font-bold text-lg" style={{ color: "#7d0f15" }}><td className="pr-10 py-1 text-left">ยอดรับสุทธิ</td><td className="text-right">฿{baht(q.net)}</td></tr>
              </>)}
            </tbody>
          </table>
        </div>

        {q.note && <div className="mt-6 text-xs text-gray-600"><b>หมายเหตุ:</b> {q.note}</div>}

        <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm">
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้เสนอราคา</div></div>
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้อนุมัติ / ลูกค้า</div></div>
        </div>
      </div>
    </div>
  );
}
