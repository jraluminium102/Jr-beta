import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { Card, StatusBadge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import QuotationActions from "./QuotationActions";
import type { Quotation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function QuotationDetail({ params }: { params: { id: string } }) {
  const profile = await getProfile();
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
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/quotations" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono">{q.code}</h1>
          <StatusBadge status={q.status} />
        </div>
        <div className="flex gap-2">
          <Link href={`/quotations/${q.id}/print`} className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark">
            <Icon name="printer" size={16} /> พิมพ์ / PDF
          </Link>
          {q.status === "approved" && canWrite(profile?.role) && (
            <Link href={`/billing-notes/new?quotation=${q.id}`} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
              <Icon name="banknote" size={16} /> สร้างใบวางบิล
            </Link>
          )}
          {canWrite(profile?.role) && <QuotationActions id={q.id} status={q.status} />}
        </div>
      </div>

      <Card className="p-6">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-medium text-ink-3 mb-1">ลูกค้า</div>
            <div className="font-semibold">{c.name}</div>
            <div className="text-ink-2">{c.job}</div>
            <div className="text-xs text-ink-3 mt-1">{c.address}</div>
            {c.tax_id && <div className="text-xs text-ink-3">เลขผู้เสียภาษี: {c.tax_id}</div>}
          </div>
          <div className="sm:text-right">
            <div className="text-xs text-ink-3">วันที่ออก: <b className="text-ink">{q.issue_date}</b></div>
            <div className="text-xs text-ink-3">ผู้ติดต่อ: {c.contact_person || "—"}</div>
            <div className="text-xs text-ink-3">โทร: {c.phone || "—"} · Line: {c.line_id || "—"}</div>
          </div>
        </div>

        <div className="overflow-x-auto mt-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-brand-soft text-brand-dark">
                <th className="p-2 rounded-l-lg">#</th>
                <th>รายการ</th>
                <th className="text-center">จำนวน</th>
                <th className="text-right">ราคา/หน่วย</th>
                <th className="text-right p-2 rounded-r-lg">รวม</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id} className="border-b border-gray-100">
                  <td className="p-2">{i + 1}</td>
                  <td>
                    <div className="font-medium">{it.name}</div>
                    {it.detail && <div className="text-xs text-ink-3">{it.detail}</div>}
                  </td>
                  <td className="text-center">{baht(it.qty)}</td>
                  <td className="text-right">{baht(it.unit_price)}</td>
                  <td className="text-right p-2">{baht(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-4">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-8 py-0.5 text-ink-3">ยอดรวมก่อนภาษี</td><td className="text-right">{baht(q.subtotal)}</td></tr>
              {q.discount_amt > 0 && <tr><td className="pr-8 py-0.5 text-ink-3">ส่วนลด {q.discount_pct}%</td><td className="text-right text-brand">-{baht(q.discount_amt)}</td></tr>}
              <tr><td className="pr-8 py-0.5 text-ink-3">VAT {q.vat_rate}%</td><td className="text-right">{baht(q.vat_amt)}</td></tr>
              <tr className="font-bold text-brand-dark"><td className="pr-8 py-1 border-t">ยอดรวมสุทธิ</td><td className="text-right border-t">฿{baht(q.total)}</td></tr>
              {q.wht_amt > 0 && (<>
                <tr><td className="pr-8 py-0.5 text-ink-3">หัก ณ ที่จ่าย {q.wht_rate}%</td><td className="text-right text-brand">-{baht(q.wht_amt)}</td></tr>
                <tr className="font-bold text-brand-dark text-lg"><td className="pr-8 py-1">ยอดรับสุทธิ</td><td className="text-right">฿{baht(q.net)}</td></tr>
              </>)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
