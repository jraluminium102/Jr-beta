"use client";

/**
 * QuoteFormPreview — พรีวิว "ฟอร์มใบเสนอราคาจริง" (A4) แบบสด ในเครื่องคิดราคา 4.0
 * เห็นเหมือนใบที่พิมพ์จริง (หัวบิล JR + ตาราง + ยอด+VAT + เงื่อนไข + ลายเซ็น) และแก้ข้อความได้ inline
 * ใช้ layout เดียวกับ src/app/(app)/quotations/[id]/print/page.tsx (ฟอร์มเดียวกันทุกใบ)
 */
import { Fragment } from "react";
import { baht, computeTotals, type DiscountLine } from "@/lib/money";
import { bahtText } from "@/lib/baht-text";
import { PrintLetterhead, DOC_COLORS, type CustomerSnapshot } from "@/components/print/PrintLetterhead";
import { PrintSignature } from "@/components/print/PrintSignature";
import { DetailLines } from "@/components/print/DetailLines";
import { COMPANY, CONDITIONS_WORK, CONDITIONS_QUOTE } from "@/app/(app)/quotations/[id]/print/quote-constants";
import Icon from "@/components/Icon";

export type PreviewItem = {
  key: number;
  name: string;
  detail: string;
  qty: number;
  unitPrice: number;
  groupLabel?: string;
  locked?: boolean; // รายการค่าบริการ (มาจาก svc) — แก้ราคาไม่ได้ในพรีวิว
};

export default function QuoteFormPreview({
  items, onEdit, onRemove, customer, code, issueDate,
  vatRate, discountPct = 0, discountAmt, discounts, whtRate, editable = true,
}: {
  items: PreviewItem[];
  onEdit: (key: number, patch: Partial<PreviewItem>) => void;
  onRemove: (key: number) => void;
  customer: CustomerSnapshot;
  code?: string;
  issueDate: string;
  vatRate: number;
  discountPct?: number;
  discountAmt?: number; // ยอดรวมส่วนลด (บาท · ตัวตั้งจริง) — ส่งมา = ชนะ % (กัน drift · บัญชีสั่ง)
  discounts?: DiscountLine[]; // ส่วนลดหลายรายการ (0105) — โชว์แยกข้อ
  whtRate: number;
  editable?: boolean;
}) {
  const t = computeTotals({
    items: items.map((it) => ({ qty: it.qty, unit_price: it.unitPrice })),
    vat_rate: vatRate, discount_pct: discountPct, wht_rate: whtRate,
    ...(discountAmt != null && discountAmt > 0 ? { discount_amt: discountAmt } : {}),
  });
  const total = t.wht_amt > 0 ? t.net : t.total;
  const totalLabel = t.wht_amt > 0 ? "ยอดรับสุทธิ" : "จำนวนเงินรวมทั้งสิ้น";

  // input ที่ดูเหมือนข้อความในเอกสาร (โปร่ง ไม่มีขอบ) แต่แก้ได้ — ซ่อนตอนพิมพ์ให้เป็นข้อความล้วน
  const cellInput = "w-full bg-transparent outline-none focus:bg-amber-50/60 rounded px-0.5 print:bg-transparent";

  return (
    <div
      className="qfp-a4 mx-auto bg-white shadow-lg print:shadow-none"
      style={{ width: "210mm", minHeight: "297mm", padding: "16mm", boxSizing: "border-box" }}
    >
      <PrintLetterhead
        docTitle="ใบเสนอราคา"
        docColor={DOC_COLORS.quotation}
        customer={customer}
        infoRows={[
          { label: "เลขที่", value: <span className="font-mono font-semibold">{code || "(ออกอัตโนมัติเมื่อบันทึก)"}</span> },
          { label: "วันที่", value: issueDate },
        ]}
      />

      {/* ตารางรายการ — โครงเดียวกับใบพิมพ์จริง · แก้ชื่อ/รายละเอียด/จำนวน/ราคา ได้ inline */}
      <table className="w-full border-collapse" style={{ fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#fdecec", color: "#7d0f15" }}>
            <th className="p-2 text-center border border-gray-200" style={{ width: "5%" }}>#</th>
            <th className="p-2 text-left border border-gray-200" style={{ width: "53%" }}>รายละเอียด</th>
            <th className="p-2 text-right border border-gray-200" style={{ width: "9%" }}>จำนวน</th>
            <th className="p-2 text-right border border-gray-200" style={{ width: "14%" }}>ราคาต่อหน่วย</th>
            <th className="p-2 text-right border border-gray-200" style={{ width: "14%" }}>ยอดรวม</th>
            {editable && <th className="p-1 border-0 no-print" style={{ width: "5%" }}></th>}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={editable ? 6 : 5} className="p-4 text-center border border-gray-200 text-gray-400" style={{ fontSize: 12 }}>
              ยังไม่มีรายการ — เพิ่มจากเครื่องคิดราคาทางซ้าย
            </td></tr>
          )}
          {items.map((it, i) => {
            const gl = String(it.groupLabel ?? "").trim();
            const prevGl = i > 0 ? String(items[i - 1].groupLabel ?? "").trim() : "";
            const showHeading = gl && gl !== prevGl;
            return (
              <Fragment key={it.key}>
                {showHeading && (
                  <tr>
                    <td colSpan={editable ? 6 : 5} className="p-2 border border-gray-200 font-bold" style={{ background: "#fbf3f3", color: "#7d0f15" }}>{gl}</td>
                  </tr>
                )}
                <tr>
                  <td className="p-2 border border-gray-200 text-center align-top tabular-nums">{i + 1}</td>
                  <td className="p-2 border border-gray-200 align-top">
                    {editable && !it.locked ? (
                      <input value={it.name} onChange={(e) => onEdit(it.key, { name: e.target.value })}
                        placeholder="ชื่อรายการ" className={`font-medium ${cellInput}`} />
                    ) : <div className="font-medium">{it.name}</div>}
                    {editable && !it.locked ? (
                      <textarea value={it.detail} onChange={(e) => onEdit(it.key, { detail: e.target.value })}
                        rows={Math.max(1, (it.detail.match(/\n/g)?.length ?? 0) + 1)}
                        placeholder="รายละเอียด (บรรทัด = บุลเล็ต · บรรทัดว่าง = เว้นวรรค · ขึ้นต้น # = หัวข้อหนาแดง เช่น #หมายเหตุ)"
                        className={`${cellInput} resize-y mt-0.5`} style={{ fontSize: 12, lineHeight: 1.5, color: "#4b5563" }} />
                    ) : (it.detail && <DetailLines text={it.detail} />)}
                  </td>
                  <td className="p-2 border border-gray-200 text-right align-top tabular-nums">
                    {editable && !it.locked ? (
                      <input type="number" min={0} value={it.qty} onChange={(e) => onEdit(it.key, { qty: Number(e.target.value) })}
                        className={`text-right ${cellInput}`} />
                    ) : baht(it.qty)}
                  </td>
                  <td className="p-2 border border-gray-200 text-right align-top tabular-nums">
                    {editable && !it.locked ? (
                      <input type="number" min={0} value={it.unitPrice} onChange={(e) => onEdit(it.key, { unitPrice: Number(e.target.value) })}
                        className={`text-right ${cellInput}`} />
                    ) : baht(it.unitPrice)}
                  </td>
                  <td className="p-2 border border-gray-200 text-right align-top tabular-nums font-medium">{baht(it.qty * it.unitPrice)}</td>
                  {editable && (
                    <td className="p-1 text-center align-top no-print border-0">
                      {!it.locked && <button onClick={() => onRemove(it.key)} title="ลบรายการ" className="text-gray-300 hover:text-red-600"><Icon name="trash" size={14} /></button>}
                    </td>
                  )}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* ยอดเป็นตัวหนังสือ */}
      <div className="mt-2 tabular-nums" style={{ fontSize: 13, color: "#b3151d" }}>({bahtText(total)})</div>

      {/* สรุปยอด */}
      <div className="flex justify-end mt-2">
        <table style={{ fontSize: 13 }}>
          <tbody>
            <tr>
              <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>รวมเป็นเงิน</td>
              <td className="text-right tabular-nums">{baht(t.subtotal)} บาท</td>
            </tr>
            {t.discount_amt > 0 && (
              <>
                {Array.isArray(discounts) && discounts.filter((d) => (Number(d.amt) || 0) > 0).length > 1
                  ? discounts.filter((d) => (Number(d.amt) || 0) > 0).map((d, i) => (
                    <tr key={i}>
                      <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>ส่วนลด {(d.label ?? "").trim() ? `(${(d.label ?? "").trim()})` : (t.subtotal > 0 ? `${Number((((Number(d.amt) || 0) / t.subtotal) * 100).toFixed(2))}%` : "")}</td>
                      <td className="text-right tabular-nums">-{baht(Number(d.amt) || 0)} บาท</td>
                    </tr>
                  ))
                  : (
                    <tr>
                      <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>ส่วนลด {discounts?.length === 1 && (discounts[0].label ?? "").trim() ? `(${(discounts[0].label ?? "").trim()})` : (discountPct > 0 ? `${discountPct}%` : "")}</td>
                      <td className="text-right tabular-nums">-{baht(t.discount_amt)} บาท</td>
                    </tr>
                  )}
                <tr>
                  <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>จำนวนเงินหลังหักส่วนลด</td>
                  <td className="text-right tabular-nums">{baht(t.subtotal - t.discount_amt)} บาท</td>
                </tr>
              </>
            )}
            <tr>
              <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>ภาษีมูลค่าเพิ่ม {vatRate}%</td>
              <td className="text-right tabular-nums">{baht(t.vat_amt)} บาท</td>
            </tr>
            {t.wht_amt > 0 && (
              <tr>
                <td className="pr-10 py-0.5 text-right" style={{ color: "#6b7280" }}>หัก ณ ที่จ่าย {whtRate}%</td>
                <td className="text-right tabular-nums">-{baht(t.wht_amt)} บาท</td>
              </tr>
            )}
            <tr className="font-bold border-t" style={{ color: "#7d0f15" }}>
              <td className="pr-10 py-1 text-right border-t">{totalLabel}</td>
              <td className="text-right tabular-nums border-t">{baht(total)} บาท</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ลายเซ็น — ฟอร์มกลางเดียวกับใบพิมพ์จริง */}
      <PrintSignature customerName={customer.name} customerRole="ผู้สั่งซื้อสินค้า" companyRole="ผู้อนุมัติ" />

      {/* เงื่อนไข */}
      <div className="mt-5" style={{ fontSize: 11.5, lineHeight: 1.65, pageBreakBefore: "always" }}>
        <h4 className="font-bold mb-2" style={{ color: "#b3151d" }}>เงื่อนไขการเข้าทำงาน</h4>
        <ol className="list-decimal ml-5 mb-3 space-y-1">
          {CONDITIONS_WORK.map((cond, idx) => (
            <li key={idx} style={{ color: "#1f2937" }}>
              {cond.split("\n").map((line, li) => <span key={li}>{li > 0 && <br />}{line}</span>)}
            </li>
          ))}
        </ol>
        <h4 className="font-bold mt-2 mb-2" style={{ color: "#b3151d" }}>เงื่อนไขแบบและใบเสนอราคา</h4>
        <ol className="list-none ml-0 mb-3 space-y-1">
          {CONDITIONS_QUOTE.map((cond, idx) => (
            <li key={idx} style={{ color: "#1f2937" }}>
              {cond.split("\n").map((line, li) => (
                <span key={li}>{li > 0 ? <><br /><span className="ml-4">{line}</span></> : line}</span>
              ))}
            </li>
          ))}
        </ol>
        <div className="mt-4 text-center font-semibold" style={{ color: "#b3151d" }}>ขอยืนยันการสั่งซื้อภายใต้เงื่อนไข&nbsp;&nbsp;ขอแสดงความนับถือ</div>
      </div>

      {/* footer */}
      <div className="mt-6 text-center" style={{ fontSize: 10, color: "#6b7280", borderTop: "1px solid #e5e7eb", paddingTop: 4 }}>
        {COMPANY.name} ({COMPANY.branch}) · เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · โทร. {COMPANY.phone}{code ? ` · ${code}` : ""}
      </div>
    </div>
  );
}
