import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht } from "@/lib/money";
import type { Receipt } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import ReceiptTextEditor from "./ReceiptTextEditor";
import { PrintLetterhead, taxInvoiceMissing, DOC_COLORS } from "@/components/print/PrintLetterhead";
import { PrintSignature } from "@/components/print/PrintSignature";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = {
  transfer: "โอนเงิน", cash: "เงินสด", cheque: "เช็ค", other: "อื่นๆ",
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
  // ยอดแยกบนใบ = snapshot ณ วันออก (0095) — ห้ามคำนวณใหม่ เอกสารภาษีต้องพิมพ์ออกมาเหมือนเดิมเสมอ
  // ใบเก่าก่อน 0095 (base_amt = null) → fallback amount − vat_amt (ใบเก่า wht = 0 อยู่แล้ว จึงตรงพอดี)
  const rcAny = rc as Receipt & { base_amt?: number | null; wht_amt?: number | null; wht_rate?: number | null };
  const rcBase = rcAny.base_amt != null ? Number(rcAny.base_amt) : rc.amount - rc.vat_amt;
  const rcWht = Number(rcAny.wht_amt) || 0;
  const rcWhtRate = Number(rcAny.wht_rate) || 0;
  const rcGross = Math.round((rcBase + rc.vat_amt) * 100) / 100; // จำนวนเงินรวมทั้งสิ้น (ก่อนหัก ณ ที่จ่าย)
  // ใบกำกับภาษีเต็มรูป (ม.86/4) ต้องมีที่อยู่ + เลขภาษีผู้ซื้อครบ — เตือนเจ้าหน้าที่ก่อนพิมพ์ (ไม่พิมพ์ลงเอกสาร)
  const taxMissing = taxInvoiceMissing(c);

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

      {/* เตือนเจ้าหน้าที่ (ไม่พิมพ์ลงเอกสาร) — ใบกำกับภาษีเต็มรูปยังขาดข้อมูลผู้ซื้อ */}
      {taxMissing.length > 0 && (
        <div className="no-print mx-auto mt-4 max-w-[210mm] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>⚠ ใบกำกับภาษีเต็มรูปยังไม่สมบูรณ์</b> — ขาด: {taxMissing.join(" · ")}
          <div className="text-xs mt-0.5">แก้หัวเอกสาร (ข้อมูลลูกค้า) ให้ครบก่อนส่งให้ลูกค้านิติบุคคล มิฉะนั้นลูกค้านำไปเครดิตภาษีซื้อไม่ได้</div>
        </div>
      )}

      {/* กระดาษ A4 */}
      <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "297mm", padding: "16mm" }}>
        <PrintLetterhead
          docTitle="ใบเสร็จรับเงิน/ใบกำกับภาษี"
          docColor={DOC_COLORS.receipt}
          infoRows={[
            { label: "เลขที่", value: <span className="font-mono font-semibold">{rc.code}</span> },
            { label: "วันที่", value: rc.issue_date },
            ...(refCode ? [{ label: "อ้างอิงใบวางบิล", value: <span className="font-mono">{refCode}</span> }] : []),
          ]}
          customer={c}
        />

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
                <ReceiptTextEditor
                  receiptId={rc.id}
                  itemDesc={(rc as { item_desc?: string }).item_desc ?? ""}
                  note={rc.note ?? ""}
                  placeholder={`รับชำระเงินตามใบวางบิล${refCode ? ` ${refCode}` : ""}`}
                />
              </td>
              <td className="p-2 border border-gray-200 text-right tabular-nums">{baht(rcBase)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between items-end mt-4">
          <div className="text-sm text-gray-600">
            วิธีชำระเงิน: <b>{PAYMENT_LABEL[rc.payment_method] ?? rc.payment_method}</b>
          </div>
          {/* ลำดับตามที่บัญชีกำหนด: ส่วนภาษี (ฐาน→VAT→รวมทั้งสิ้น) จบก่อน แล้วหัก ณ ที่จ่ายเป็น memo ใต้เส้น
              ม.86/4(5) บังคับแสดงจำนวนภาษีแยกจากราคาให้ชัดแจ้ง → ห้ามให้ WHT มาทำให้ฐาน/VAT กำกวม */}
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ยอดก่อนภาษี</td><td className="text-right tabular-nums">{baht(rcBase)}</td></tr>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ภาษีมูลค่าเพิ่ม {rc.vat_rate}%</td><td className="text-right tabular-nums">{baht(rc.vat_amt)}</td></tr>
              <tr className="font-bold text-lg" style={{ color: "#7d0f15" }}><td className="pr-10 py-1 border-t text-left">จำนวนเงินรวมทั้งสิ้น</td><td className="text-right border-t tabular-nums">฿{baht(rcGross)}</td></tr>
              {rcWht > 0 && (
                <>
                  <tr><td className="pr-10 py-0.5 text-gray-500 text-left">หักภาษี ณ ที่จ่าย {rcWhtRate}%</td><td className="text-right tabular-nums">-{baht(rcWht)}</td></tr>
                  <tr className="font-bold"><td className="pr-10 py-1 border-t text-left">เงินสดรับสุทธิ</td><td className="text-right border-t tabular-nums">฿{baht(rc.net)}</td></tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* หมายเหตุ — เอกสารสมบูรณ์เมื่อรับชำระเงินเรียบร้อย */}
        <div className="mt-4 text-xs italic" style={{ color: "#6b7280" }}>
          หมายเหตุ: เอกสารฉบับนี้จะสมบูรณ์เมื่อบริษัทได้รับชำระเงินเรียบร้อยแล้ว
        </div>

        <PrintSignature customerName={c.name} customerRole="ผู้จ่ายเงิน" companyRole="ผู้รับเงิน" />
      </div>
    </div>
  );
}
