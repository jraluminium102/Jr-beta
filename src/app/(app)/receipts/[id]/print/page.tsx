import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht } from "@/lib/money";
import type { Receipt } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = {
  transfer: "โอนเงิน", cash: "เงินสด", cheque: "เช็ค",
};

export default async function ReceiptPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const rc = data as Receipt;
  const c = rc.customer_snapshot;

  // ดึงรหัสใบวางบิลอ้างอิง (ถ้ามี)
  let refCode: string | null = null;
  if (rc.billing_note_id) {
    const { data: bn } = await supabase.from("billing_notes").select("code").eq("id", rc.billing_note_id).single();
    refCode = bn?.code ?? null;
  }

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link href={`/receipts/${rc.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
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
            <div className="text-xl font-bold" style={{ color: "#7d0f15" }}>ใบเสร็จรับเงิน / ใบกำกับภาษี</div>
            <div className="text-xs text-gray-400">Receipt / Tax Invoice</div>
            <table className="text-xs mt-2 ml-auto">
              <tbody>
                <tr><td className="text-gray-500 pr-3 text-left">เลขที่</td><td className="font-mono font-semibold">{rc.code}</td></tr>
                <tr><td className="text-gray-500 pr-3 text-left">วันที่</td><td>{rc.issue_date}</td></tr>
                {refCode && <tr><td className="text-gray-500 pr-3 text-left">อ้างอิงใบวางบิล</td><td className="font-mono">{refCode}</td></tr>}
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
              <th className="p-2 text-left border border-gray-200">รายการ</th>
              <th className="p-2 text-right border border-gray-200" style={{ width: 160 }}>จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border border-gray-200">
                รับชำระเงินตามใบวางบิล{refCode ? ` ${refCode}` : ""}
                {rc.note && <div className="text-xs text-gray-500">{rc.note}</div>}
              </td>
              <td className="p-2 border border-gray-200 text-right tabular-nums">{baht(rc.amount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between items-end mt-4">
          <div className="text-sm text-gray-600">
            วิธีชำระเงิน: <b>{PAYMENT_LABEL[rc.payment_method] ?? rc.payment_method}</b>
          </div>
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ยอดก่อนภาษี</td><td className="text-right tabular-nums">{baht(rc.amount)}</td></tr>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ภาษีมูลค่าเพิ่ม {rc.vat_rate}%</td><td className="text-right tabular-nums">{baht(rc.vat_amt)}</td></tr>
              <tr className="font-bold text-lg" style={{ color: "#7d0f15" }}><td className="pr-10 py-1 border-t text-left">ยอดสุทธิ</td><td className="text-right border-t tabular-nums">฿{baht(rc.net)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm">
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้รับเงิน</div></div>
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้จ่ายเงิน / ลูกค้า</div></div>
        </div>
      </div>
    </div>
  );
}
