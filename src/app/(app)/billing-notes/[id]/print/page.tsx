import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht } from "@/lib/money";
import { BILLING_STATUS_LABEL, type BillingNote } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function BillingPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("billing_notes")
    .select("*, billing_installments(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const bn = data as BillingNote;
  const installments = (bn.billing_installments ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const c = bn.customer_snapshot;
  const totalPaid = installments.reduce((a, i) => a + (Number(i.paid_amount) || 0), 0);
  const remaining = (Number(bn.total) || 0) - totalPaid;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href={`/billing-notes/${bn.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
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
            <div className="text-xl font-bold" style={{ color: "#7d0f15" }}>ใบวางบิล</div>
            <div className="text-xs text-gray-400">Billing Note</div>
            <table className="text-xs mt-2 ml-auto">
              <tbody>
                <tr><td className="text-gray-500 pr-3 text-left">เลขที่</td><td className="font-mono font-semibold">{bn.code}</td></tr>
                <tr><td className="text-gray-500 pr-3 text-left">วันที่</td><td>{bn.issue_date}</td></tr>
                <tr><td className="text-gray-500 pr-3 text-left">สถานะ</td><td>{BILLING_STATUS_LABEL[bn.status]}</td></tr>
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
              <th className="p-2 text-left border border-gray-200" style={{ width: 48 }}>งวด</th>
              <th className="p-2 text-left border border-gray-200">รายละเอียด</th>
              <th className="p-2 text-center border border-gray-200" style={{ width: 96 }}>กำหนดชำระ</th>
              <th className="p-2 text-right border border-gray-200" style={{ width: 130 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {installments.map((it) => (
              <tr key={it.id}>
                <td className="p-2 border border-gray-200 align-top text-center">{it.seq}</td>
                <td className="p-2 border border-gray-200">
                  <div className="font-medium">{it.label}</div>
                  {it.status === "paid" && (
                    <div className="text-xs text-gray-500">รับชำระแล้ว ฿{baht(it.paid_amount)}{it.paid_date ? ` · ${it.paid_date}` : ""}</div>
                  )}
                </td>
                <td className="p-2 border border-gray-200 text-center align-top">{it.due_date || "—"}</td>
                <td className="p-2 border border-gray-200 text-right align-top tabular-nums">{baht(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">รับชำระแล้ว</td><td className="text-right tabular-nums">{baht(totalPaid)}</td></tr>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">คงเหลือ</td><td className="text-right tabular-nums">{baht(remaining)}</td></tr>
              <tr className="font-bold text-lg" style={{ color: "#7d0f15" }}><td className="pr-10 py-1 border-t text-left">ยอดรวมทั้งสิ้น</td><td className="text-right border-t tabular-nums">฿{baht(bn.total)}</td></tr>
            </tbody>
          </table>
        </div>

        {bn.note && <div className="mt-6 text-xs text-gray-600"><b>หมายเหตุ:</b> {bn.note}</div>}

        <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm">
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้วางบิล</div></div>
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้รับวางบิล / ลูกค้า</div></div>
        </div>
      </div>
    </div>
  );
}
