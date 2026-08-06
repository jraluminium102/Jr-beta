import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht } from "@/lib/money";
import type { Receipt } from "@/lib/types";
import Icon from "@/components/Icon";
import ReceiptPrintControls from "./ReceiptPrintControls";
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

  const placeholder = `รับชำระเงินตามใบวางบิล${refCode ? ` ${refCode}` : ""}`;
  const itemDesc = (rc as { item_desc?: string }).item_desc ?? "";

  // เอกสาร A4 1 ชุด — copyLabel = "ต้นฉบับ"/"สำเนา" (มุมขวา) · cls คุมการพิมพ์ · itemCell = ช่องรายการ (ต้นฉบับแก้ได้ · สำเนาอ่านอย่างเดียว)
  const Doc = (copyLabel: string, cls: string, itemCell: React.ReactNode) => (
    <div className={`rc-doc ${cls} mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0`} style={{ width: "210mm", minHeight: "297mm", padding: "16mm", boxSizing: "border-box" }}>
      <PrintLetterhead
        docTitle="ใบเสร็จรับเงิน/ใบกำกับภาษี"
        docColor={DOC_COLORS.receipt}
        copyLabel={copyLabel}
        infoRows={[
          { label: "เลขที่", value: <span className="font-mono font-semibold">{rc.code}</span> },
          { label: "วันที่", value: rc.issue_date },
          ...(refCode ? [{ label: "อ้างอิงใบวางบิล", value: <span className="font-mono">{refCode}</span> }] : []),
        ]}
        customer={c}
      />

      <table className="w-full text-sm mt-5 border-collapse">
        <thead>
          <tr style={{ background: "#faedf0", color: "#a8425a" }}>
            <th className="p-2 text-left border border-[#f0dde3]">รายการ</th>
            <th className="p-2 text-right border border-[#f0dde3]" style={{ width: 160 }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 border border-[#f0dde3]">{itemCell}</td>
            <td className="p-2 border border-[#f0dde3] text-right tabular-nums">{baht(rcBase)}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex justify-between items-end mt-4">
        <div className="text-sm text-gray-600">
          วิธีชำระเงิน: <b>{PAYMENT_LABEL[rc.payment_method] ?? rc.payment_method}</b>
        </div>
        <table className="text-sm">
          <tbody>
            <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ยอดก่อนภาษี</td><td className="text-right tabular-nums">{baht(rcBase)}</td></tr>
            <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ภาษีมูลค่าเพิ่ม {rc.vat_rate}%</td><td className="text-right tabular-nums">{baht(rc.vat_amt)}</td></tr>
            <tr className="font-bold text-lg" style={{ color: "#a8425a" }}><td className="pr-10 py-1 border-t text-left">จำนวนเงินรวมทั้งสิ้น</td><td className="text-right border-t tabular-nums">฿{baht(rcGross)}</td></tr>
            {rcWht > 0 && (
              <>
                <tr><td className="pr-10 py-0.5 text-gray-500 text-left">หักภาษี ณ ที่จ่าย {rcWhtRate}%</td><td className="text-right tabular-nums">-{baht(rcWht)}</td></tr>
                <tr className="font-bold"><td className="pr-10 py-1 border-t text-left">เงินสดรับสุทธิ</td><td className="text-right border-t tabular-nums">฿{baht(rc.net)}</td></tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs italic" style={{ color: "#6b7280" }}>
        หมายเหตุ: เอกสารฉบับนี้จะสมบูรณ์เมื่อบริษัทได้รับชำระเงินเรียบร้อยแล้ว
      </div>

      <PrintSignature customerName={c.name} customerRole="ผู้จ่ายเงิน" companyRole="ผู้รับเงิน" />
    </div>
  );

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* คุมการพิมพ์ ต้นฉบับ/สำเนา/ทั้ง 2 (บนจอเห็นทั้งคู่ = พรีวิว · พิมพ์ตามโหมด) */}
      <style>{`@media print {
        .rc-copy { display: none; }
        html[data-print-mode="copy"] .rc-orig { display: none; }
        html[data-print-mode="copy"] .rc-copy { display: block; }
        html[data-print-mode="both"] .rc-copy { display: block; break-before: page; }
      }`}</style>

      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-2">
        <Link href={`/receipts/${rc.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <ReceiptPrintControls />
      </div>

      {/* เตือนเจ้าหน้าที่ (ไม่พิมพ์ลงเอกสาร) — ใบกำกับภาษีเต็มรูปยังขาดข้อมูลผู้ซื้อ */}
      {taxMissing.length > 0 && (
        <div className="no-print mx-auto mt-4 max-w-[210mm] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>⚠ ใบกำกับภาษีเต็มรูปยังไม่สมบูรณ์</b> — ขาด: {taxMissing.join(" · ")}
          <div className="text-xs mt-0.5">แก้หัวเอกสาร (ข้อมูลลูกค้า) ให้ครบก่อนส่งให้ลูกค้านิติบุคคล มิฉะนั้นลูกค้านำไปเครดิตภาษีซื้อไม่ได้</div>
        </div>
      )}

      {/* ต้นฉบับ (แก้ข้อความได้) + สำเนา (อ่านอย่างเดียว) — บนจอโชว์คู่เป็นพรีวิว · ป้าย "สำเนา" คั่นบนจอ */}
      {Doc("ต้นฉบับ", "rc-orig", (
        <ReceiptTextEditor receiptId={rc.id} itemDesc={itemDesc} note={rc.note ?? ""} placeholder={placeholder} />
      ))}
      <div className="no-print mx-auto max-w-[210mm] text-center text-xs text-ink-3 -mt-2 mb-1">— สำเนา (มุมขวาเป็น &quot;สำเนา&quot;) —</div>
      {Doc("สำเนา", "rc-copy", (
        <span className="block">
          <span>{itemDesc.trim() ? itemDesc : placeholder}</span>
          {(rc.note ?? "").trim() && <span className="block text-xs text-gray-500">{rc.note}</span>}
        </span>
      ))}
    </div>
  );
}
