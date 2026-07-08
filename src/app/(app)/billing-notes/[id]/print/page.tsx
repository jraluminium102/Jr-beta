import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht } from "@/lib/money";
import { BILLING_STATUS_LABEL, type BillingNote } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import PrintInstallmentFooter from "./PrintInstallmentFooter";
import { PrintLetterhead, DOC_COLORS } from "@/components/print/PrintLetterhead";

export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
  const remaining = grandTotal - totalPaid;

  // สัดส่วนของงวดที่เลือก เทียบยอดทั้งใบ (bn.total = ผลรวมทุกงวด) — ใช้เฉลี่ย ส่วนลด/VAT/หัก ณ ที่จ่าย ลงงวด
  const billTotal = Number(bn.total) || 0;
  const ratio = isSingle && billTotal > 0 ? (Number(selected!.amount) || 0) / billTotal : 1;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href={`/billing-notes/${bn.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {/* กระดาษ A4 */}
      <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "297mm", padding: "16mm" }}>
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
              {/* ยอดแยก (0078) — ส่วนลด/VAT/หัก ณ ที่จ่าย
                  · ทั้งใบ = ยอดจริงของบิล
                  · แยกงวด = เฉลี่ยตามสัดส่วนงวด (×ratio) → footer เหมือนใบใหญ่ แต่เป็นของงวดนี้ · ผลรวมทุกงวด = ใบใหญ่เป๊ะ */}
              {/* ทั้งใบ (รวมทุกงวด) — footer ยอดจริง (คงที่ ไม่แก้) */}
              {!isSingle && (() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const b = bn as any;
                const sub = Number(b.subtotal) || Number(bn.total) || 0;
                if (sub <= 0) return null; // ใบ import เก่าไม่มี breakdown → โชว์แค่ยอด
                const dis = round2(Number(b.discount_amt) || 0), va = round2(Number(b.vat_amt) || 0), wh = round2(Number(b.wht_amt) || 0);
                return (
                  <>
                    <tr><td className="pr-10 py-0.5 text-gray-500 text-left">รวมเป็นเงิน</td><td className="text-right tabular-nums">{baht(sub)}</td></tr>
                    {dis > 0 && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ส่วนลด {Number(b.discount_pct) > 0 ? `${b.discount_pct}%` : ""}</td><td className="text-right tabular-nums">-{baht(dis)}</td></tr>}
                    {va > 0 && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ภาษีมูลค่าเพิ่ม {Number(b.vat_rate) > 0 ? `${b.vat_rate}%` : ""}</td><td className="text-right tabular-nums">{baht(va)}</td></tr>}
                    {wh > 0 && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">หักภาษี ณ ที่จ่าย {Number(b.wht_rate) > 0 ? `${b.wht_rate}%` : ""}</td><td className="text-right tabular-nums">-{baht(wh)}</td></tr>}
                  </>
                );
              })()}
              {/* พิมพ์แยกงวด — footer แก้ inline ได้ตรงนี้ (ค่าตั้งต้น = เฉลี่ยตามสัดส่วน) */}
              {isSingle && (() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const b = bn as any;
                const def = {
                  subtotal: round2((Number(b.subtotal) || 0) * ratio),
                  discount: round2((Number(b.discount_amt) || 0) * ratio),
                  vat: round2((Number(b.vat_amt) || 0) * ratio),
                  wht: round2((Number(b.wht_amt) || 0) * ratio),
                };
                const ov = selected!.footer_override ?? null;
                // ใบเก่าไม่มี breakdown + ไม่เคยตั้งเอง → ไม่โชว์ footer แตกยอด (กันคิด VAT มั่ว)
                if (Number(b.subtotal) <= 0 && !ov) return null;
                return (
                  <PrintInstallmentFooter
                    installmentId={selected!.id!}
                    def={def}
                    current={ov}
                    rates={{ discount_pct: Number(b.discount_pct) || 0, vat_rate: Number(b.vat_rate) || 0, wht_rate: Number(b.wht_rate) || 0 }}
                  />
                );
              })()}
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">รับชำระแล้ว</td><td className="text-right tabular-nums">{baht(totalPaid)}</td></tr>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">คงเหลือ</td><td className="text-right tabular-nums">{baht(remaining)}</td></tr>
              <tr className="font-bold text-lg" style={{ color: "#7d0f15" }}><td className="pr-10 py-1 border-t text-left">{isSingle ? "ยอดงวดนี้" : "ยอดรวมทั้งสิ้น"}</td><td className="text-right border-t tabular-nums">฿{baht(grandTotal)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* พิมพ์แยกงวด + มีหัก ณ ที่จ่าย → กันเข้าใจผิดว่าหักซ้ำทุกงวด (ยอดเฉลี่ยแล้ว รวมทุกงวด = ยอดหักจริงทั้งใบ) */}
        {isSingle && Number((bn as { wht_amt?: number }).wht_amt) > 0 && (
          <div className="mt-4 text-xs text-gray-600">
            * หัก ณ ที่จ่ายด้านบนเป็นสัดส่วนเฉพาะงวดนี้ — รวมทุกงวดเท่ากับยอดหัก ณ ที่จ่ายทั้งใบ (ไม่หักซ้ำ)
          </div>
        )}

        {bn.note && <div className="mt-6 text-xs text-gray-600"><b>หมายเหตุ:</b> {bn.note}</div>}

        <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm">
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้วางบิล</div></div>
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้รับวางบิล / ลูกค้า</div></div>
        </div>
      </div>
    </div>
  );
}
