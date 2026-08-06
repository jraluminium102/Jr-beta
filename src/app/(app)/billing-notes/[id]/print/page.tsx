import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht, footerSnapshot } from "@/lib/money";
import { BILLING_STATUS_LABEL, type BillingNote } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import PrintFooterEditor from "./PrintFooterEditor";
import PrintLabelEditor from "./PrintLabelEditor";
import PrintPaymentEditor from "./PrintPaymentEditor";
import { DEFAULT_PAYMENT_NOTE } from "@/lib/constants";
import { PrintLetterhead, DOC_COLORS } from "@/components/print/PrintLetterhead";
import { PrintSignature } from "@/components/print/PrintSignature";

export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// รับเฉพาะ footer_override รูปแบบใหม่ (มี net เป็นตัวเลข) — ของเก่ารูปแบบอื่นถือว่าไม่มี (กันโชว์ ฿0)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validFooter = (o: any) => (o && typeof o.net === "number") ? o : null;

export default async function BillingPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { installment?: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from("billing_notes")
    .select("*, billing_installments(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const bn = data as BillingNote;
  const allInstallments = (bn.billing_installments ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const c = bn.customer_snapshot;

  // พิมพ์แยกงวด: ?installment=<seq> → โชว์เฉพาะงวดนั้น (ยอดรวม = ยอดงวด)
  const selSeq = searchParams?.installment ? Number(searchParams.installment) : null;
  const selected = selSeq != null ? allInstallments.find((i) => i.seq === selSeq) ?? null : null;
  const isSingle = !!selected;
  const installments = selected ? [selected] : allInstallments;

  const totalPaid = installments.reduce((a, i) => a + (Number(i.paid_amount) || 0), 0);
  // ยอดรวมที่โชว์: ทั้งใบ = bn.total (= ผลรวมทุกงวด) · แยกงวด = ยอดงวดนั้น
  const grandTotal = isSingle ? (Number(selected!.amount) || 0) : (Number(bn.total) || 0);

  const billTotal = Number(bn.total) || 0;
  const ratio = isSingle && billTotal > 0 ? (Number(selected!.amount) || 0) / billTotal : 1;

  // ยอด "ยอดรวมทั้งสิ้น/ยอดงวดนี้" ที่โชว์:
  //  · ทั้งใบ = bn.total (แก้ footer = แก้ยอดจริง จึงตรงเสมอ ไม่ต้องพึ่ง footer_override)
  //  · แยกงวด = ถ้ามี footer_override ต่องวด (display-only) ใช้ net นั้น ไม่งั้น = ยอดงวด (แก้บั๊กเดิมที่ไม่สะท้อน net)
  const instFooter = isSingle ? validFooter(selected!.footer_override) : null;
  const effTotal = isSingle ? (instFooter ? Number(instFooter.net) || 0 : grandTotal) : billTotal;
  const effRemaining = round2(effTotal - totalPaid);
  const overpaid = effRemaining < -0.01;                                          // คงเหลือติดลบ (รับเกิน)
  // เตือน (งวดแยก): net ที่แก้ footer ต่องวด ≠ ยอดงวดจริง → ตารางกับท้ายใบไม่ตรง
  const instMismatch = isSingle && !!instFooter && Math.abs(effTotal - (Number(selected!.amount) || 0)) > 0.01;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href={`/billing-notes/${bn.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {/* เตือนเจ้าหน้าที่ (ไม่พิมพ์ลงเอกสาร) — footer แก้มือทำให้ยอดไม่สอดคล้อง (บัญชีสั่งให้เตือน) */}
      {(instMismatch || overpaid) && (
        <div className="no-print mx-auto mt-3 max-w-[210mm] rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>⚠ ตรวจ footer ก่อนส่งลูกค้า</b>
          {instMismatch && <div className="text-xs mt-0.5">ยอดสุทธิที่แก้ footer งวดนี้ (฿{baht(effTotal)}) ไม่ตรงยอดงวดจริง (฿{baht(Number(selected!.amount) || 0)}) — ตารางงวดกับยอดท้ายใบไม่ตรงกัน กด &quot;✎ แก้ footer → ค่าตั้งต้น&quot; เพื่อกลับยอดจริง</div>}
          {overpaid && <div className="text-xs mt-0.5">ยอดสุทธิต่ำกว่ายอดรับชำระแล้ว → คงเหลือติดลบ (เหมือนรับเงินเกิน) โปรดตรวจสอบ</div>}
        </div>
      )}

      {/* กระดาษ A4 */}
      <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "297mm", padding: "16mm", boxSizing: "border-box" }}>
        <PrintLetterhead
          docTitle={isSingle
            ? `ใบวางบิล/ใบแจ้งหนี้ (งวดที่ ${selSeq})`
            : "ใบวางบิล/ใบแจ้งหนี้"}
          docColor={DOC_COLORS.billing}
          infoRows={[
            { label: "เลขที่", value: <span className="font-mono font-semibold">{bn.code}</span> },
            { label: "วันที่", value: bn.issue_date },
            {
              label: "สถานะ",
              value:
                bn.display_status && bn.display_status !== bn.status
                  ? `${BILLING_STATUS_LABEL[bn.display_status]} (ปรับด้วยมือ · ตามการชำระจริง: ${BILLING_STATUS_LABEL[bn.status]})`
                  : BILLING_STATUS_LABEL[bn.status],
            },
          ]}
          customer={c}
        />

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
                  <div><PrintLabelEditor installmentId={it.id!} label={it.label} /></div>
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
              {/* ยอดแยก (0078) — ส่วนลด/VAT/หัก ณ ที่จ่าย
                  · ทั้งใบ = ยอดจริงของบิล
                  · แยกงวด = เฉลี่ยตามสัดส่วนงวด (×ratio) → footer เหมือนใบใหญ่ แต่เป็นของงวดนี้ · ผลรวมทุกงวด = ใบใหญ่เป๊ะ */}
              {/* footer แก้ inline บน PDF (เครื่องคิดจริง) — ใบเต็ม=ค่าจริงบิล · งวดแยก=เฉลี่ยตามสัดส่วน · คิดผ่าน computeTotals */}
              {(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const b = bn as any;
                const dp = Number(b.discount_pct) || 0, vr = Number(b.vat_rate) || 0, wr = Number(b.wht_rate) || 0;
                const dAmt = b.discount_amt != null ? Number(b.discount_amt) || 0 : undefined; // ส่วนลดเป็นจำนวนเงิน (ตัวตั้งจริง · กัน drift)
                if (isSingle) {
                  // งวดแยก = display-only (แก้ footer ต่องวดไม่แตะยอด booked · re-split ทั้งใบทีละงวดไม่ได้)
                  const ov = validFooter(selected!.footer_override);
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const sel = selected as any;
                  // งวด booked (โมเดลค่าแรง 17 ก.ค.) → โชว์ base/vat/wht ของงวดตรง ๆ (WHT อยู่งวดค่าแรงเท่านั้น ไม่เฉลี่ย)
                  if (sel.base_amt != null) {
                    const def = footerSnapshot(Number(sel.base_amt) || 0, 0, Number(sel.vat_rate) || 0, Number(sel.wht_rate) || 0);
                    return <PrintFooterEditor apiUrl={`/api/billing-installments/${selected!.id!}`} suffix=" (งวดนี้)" def={def} current={ov} />;
                  }
                  if (Number(b.subtotal) <= 0 && !ov) return null;
                  // งวดเก่า (ไม่ booked) — ส่วนลด/ภาษีต่องวด = ทั้งใบ × สัดส่วนงวด (บัญชีสั่ง) → ผลรวมทุกงวด = เต็มใบ
                  const def = footerSnapshot((Number(b.subtotal) || 0) * ratio, dp, vr, wr, dAmt != null ? Math.round((dAmt * ratio + Number.EPSILON) * 100) / 100 : undefined);
                  return <PrintFooterEditor apiUrl={`/api/billing-installments/${selected!.id!}`} suffix=" (งวดนี้)" def={def} current={ov} />;
                }
                // ทั้งใบ = แก้ยอดจริง (real): กรอก รวมเป็นเงิน/ส่วนลด/VAT/หัก → คิด total ใหม่ + แตกงวดใหม่ (บิลที่ยังไม่จ่าย)
                const subW = Number(b.subtotal) || Number(bn.total) || 0;
                if (subW <= 0) return null;
                const def = footerSnapshot(subW, dp, vr, wr, dAmt);
                return <PrintFooterEditor real apiUrl={`/api/billing-notes/${bn.id}`} def={def} current={null} />;
              })()}
              {/* ยอดรวมที่โชว์: ใบเต็มถ้าแก้ footer แล้ว → ยอดสุทธิที่คิดใหม่ · คงเหลือติดลบ = แดง (เตือนรับเกิน) */}
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">รับชำระแล้ว</td><td className="text-right tabular-nums">{baht(totalPaid)}</td></tr>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">คงเหลือ</td><td className={`text-right tabular-nums${overpaid ? " text-red-700 font-semibold" : ""}`}>{baht(effRemaining)}</td></tr>
              <tr className="font-bold text-lg" style={{ color: "#7d0f15" }}><td className="pr-10 py-1 border-t text-left">{isSingle ? "ยอดชำระ" : "ยอดรวมทั้งสิ้น"}</td><td className="text-right border-t tabular-nums">฿{baht(effTotal)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* พิมพ์แยกงวด + มีหัก ณ ที่จ่าย → อธิบายวิธีคิดต่องวด (booked = อยู่งวดค่าแรง · legacy = เฉลี่ย) */}
        {isSingle && Number((bn as { wht_amt?: number }).wht_amt) > 0 && (
          <div className="mt-4 text-xs text-gray-600">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(selected as any).base_amt != null
              ? "* หัก ณ ที่จ่ายคิดจากค่าแรง จะปรากฏเฉพาะ “งวดค่าแรง” งวดเดียว (งวดค่าของ/เงินประกันไม่มีหัก)"
              : "* หัก ณ ที่จ่ายด้านบนเป็นสัดส่วนเฉพาะงวดนี้ — รวมทุกงวดเท่ากับยอดหัก ณ ที่จ่ายทั้งใบ (ไม่หักซ้ำ)"}
          </div>
        )}

        {bn.note && <div className="mt-6 text-xs text-gray-600"><b>หมายเหตุ:</b> {bn.note}</div>}

        {/* ช่องทางชำระเงิน (ซ้ายล่าง) — default = เลขบัญชีบริษัท · แก้ต่อใบได้บน PDF (0104) */}
        <div className="mt-6">
          <PrintPaymentEditor
            billId={bn.id}
            value={(bn as { payment_note?: string | null }).payment_note ?? null}
            fallback={DEFAULT_PAYMENT_NOTE}
          />
        </div>

        <PrintSignature customerName={c.name} customerRole="ผู้รับวางบิล" companyRole="ผู้วางบิล" />
      </div>
    </div>
  );
}
