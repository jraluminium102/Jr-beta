import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { baht, backoutVat, splitLaborMaterial, WHT_LABOR_RATE } from "@/lib/money";
import { BILLING_STATUS_LABEL, type BillingNote } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import { PrintLetterhead, DOC_COLORS } from "@/components/print/PrintLetterhead";

export const dynamic = "force-dynamic";

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

  // export แยกงวด: ?installment=<seq> → โชว์เฉพาะงวดนั้น (ยอดรวม = ยอดงวด)
  const selSeq = searchParams?.installment ? Number(searchParams.installment) : null;
  const selected = selSeq != null ? allInstallments.find((i) => i.seq === selSeq) ?? null : null;
  const isSingle = !!selected;
  const installments = selected ? [selected] : allInstallments;

  const totalPaid = installments.reduce((a, i) => a + (Number(i.paid_amount) || 0), 0);
  // ยอดรวมที่โชว์: ทั้งใบ = bn.total · แยกงวด = ยอดงวดนั้น
  const grandTotal = isSingle ? (Number(selected!.amount) || 0) : (Number(bn.total) || 0);
  const remaining = grandTotal - totalPaid;

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
        <PrintLetterhead
          docTitle={isSingle ? `ใบวางบิล/ใบแจ้งหนี้ (งวดที่ ${selSeq})` : "ใบวางบิล/ใบแจ้งหนี้"}
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
              {/* ยอดแยก (0078) — โชว์เฉพาะทั้งใบ ถ้ามี breakdown */}
              {!isSingle && (() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const b = bn as any;
                const sub = Number(b.subtotal) || Number(bn.total) || 0, dis = Number(b.discount_amt) || 0, va = Number(b.vat_amt) || 0, wh = Number(b.wht_amt) || 0;
                if (sub <= 0) return null;
                return (
                  <>
                    <tr><td className="pr-10 py-0.5 text-gray-500 text-left">รวมเป็นเงิน</td><td className="text-right tabular-nums">{baht(sub)}</td></tr>
                    {dis > 0 && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ส่วนลด {b.discount_pct > 0 ? `${b.discount_pct}%` : ""}</td><td className="text-right tabular-nums">-{baht(dis)}</td></tr>}
                    {va > 0 && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ภาษีมูลค่าเพิ่ม {b.vat_rate}%</td><td className="text-right tabular-nums">{baht(va)}</td></tr>}
                    {wh > 0 && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">หักภาษี ณ ที่จ่าย {b.wht_rate}%</td><td className="text-right tabular-nums">-{baht(wh)}</td></tr>}
                  </>
                );
              })()}
              {/* พิมพ์แยกงวด — ถอด VAT ออกจากยอดงวด (back-out) + แยกค่าของ/ค่าแรง ถ้ามี labor_ratio (บัญชี approve) */}
              {isSingle && (() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const b = bn as any;
                const vatRate = Number(b.vat_rate) || 0;
                const sub = Number(b.subtotal) || 0;
                // ใบ import เก่า/ไม่รู้ว่ามี VAT ไหม → โชว์แค่ยอดงวดนี้ ไม่ถอด VAT มั่ว
                if (sub <= 0) return null;
                const { base, vat } = backoutVat(grandTotal, vatRate);
                const laborRatio = b.labor_ratio == null ? null : Number(b.labor_ratio);
                const split = laborRatio == null ? null : splitLaborMaterial(base, laborRatio);
                return (
                  <>
                    {split && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ค่าวัสดุ/ค่าของ (งวดนี้)</td><td className="text-right tabular-nums">{baht(split.material)}</td></tr>}
                    {split && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ค่าแรง/ค่าบริการ (งวดนี้)</td><td className="text-right tabular-nums">{baht(split.labor)}</td></tr>}
                    <tr><td className="pr-10 py-0.5 text-gray-500 text-left">{split ? "รวมยอดก่อน VAT (งวดนี้)" : "ยอดก่อน VAT (งวดนี้)"}</td><td className="text-right tabular-nums">{baht(base)}</td></tr>
                    {vat > 0 && <tr><td className="pr-10 py-0.5 text-gray-500 text-left">ภาษีมูลค่าเพิ่ม {vatRate}% (งวดนี้)</td><td className="text-right tabular-nums">{baht(vat)}</td></tr>}
                  </>
                );
              })()}
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">รับชำระแล้ว</td><td className="text-right tabular-nums">{baht(totalPaid)}</td></tr>
              <tr><td className="pr-10 py-0.5 text-gray-500 text-left">คงเหลือ</td><td className="text-right tabular-nums">{baht(remaining)}</td></tr>
              <tr className="font-bold text-lg" style={{ color: "#7d0f15" }}><td className="pr-10 py-1 border-t text-left">{isSingle ? "ยอดงวดนี้" : "ยอดรวมทั้งสิ้น"}</td><td className="text-right border-t tabular-nums">฿{baht(grandTotal)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* พิมพ์แยกงวด — บรรทัดหัก ณ ที่จ่าย (เป็นข้อมูลให้ลูกค้าหักถูก ไม่หักออกจากยอด) */}
        {isSingle && (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b = bn as any;
          const laborRatio = b.labor_ratio == null ? null : Number(b.labor_ratio);
          // มี labor_ratio → หัก ณ ที่จ่าย 3% เฉพาะ "ค่าแรง" ของงวดนี้
          if (laborRatio != null && Number(b.subtotal) > 0) {
            const { base } = backoutVat(grandTotal, Number(b.vat_rate) || 0);
            const { labor } = splitLaborMaterial(base, laborRatio);
            const whtLabor = Math.round((labor * WHT_LABOR_RATE) / 100);
            return (
              <div className="mt-4 text-xs text-gray-600">
                * ลูกค้าที่เป็นนิติบุคคลหักภาษี ณ ที่จ่าย {WHT_LABOR_RATE}% เฉพาะค่าแรง/ค่าบริการ (งวดนี้ = ฿{baht(labor)} × {WHT_LABOR_RATE}% = ฿{baht(whtLabor)}) — เป็นข้อมูลประกอบ ยอดเรียกเก็บไม่หักออก
              </div>
            );
          }
          // ไม่มี labor split แต่ใบมีหัก ณ ที่จ่ายระดับใบ → อ้างอิงยอดทั้งสัญญา กันหักซ้ำรายงวด
          if (Number(b.wht_amt) > 0) {
            return (
              <div className="mt-4 text-xs text-gray-600">
                * หัก ณ ที่จ่ายคิดจากยอดรวมทั้งสัญญา ({b.wht_rate}% = ฿{baht(Number(b.wht_amt) || 0)}) — ดูใบวางบิลเต็ม ไม่หักซ้ำรายงวด
              </div>
            );
          }
          return null;
        })()}

        {bn.note && <div className="mt-6 text-xs text-gray-600"><b>หมายเหตุ:</b> {bn.note}</div>}

        <div className="grid grid-cols-2 gap-8 mt-16 text-center text-sm">
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้วางบิล</div></div>
          <div><div className="border-t border-gray-400 pt-2 mx-6">ผู้รับวางบิล / ลูกค้า</div></div>
        </div>
      </div>
    </div>
  );
}
