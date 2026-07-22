import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { Card, StatusBadge } from "@/components/ui";
import { FloorWorkBadge } from "@/components/ui/FloorWorkBadge";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import QuotationActions from "./QuotationActions";
import QuotationEditButton from "./QuotationEditButton";
import type { Quotation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function QuotationDetail({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("quotations")
    .select("*, quotation_items(*), job:job_id(floor_work, floor_note)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const q = data as Quotation & { job: { floor_work: string | null; floor_note: string | null } | null };
  const items = (q.quotation_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const c = q.customer_snapshot;
  const writable = canWrite(profile?.role);

  // ตรวจ billing_note active (status != cancelled)
  const { data: activeBnRows } = await supabase
    .from("billing_notes")
    .select("id, code")
    .eq("quotation_id", q.id)
    .neq("status", "cancelled")
    .limit(1);
  const hasActiveBilling = (activeBnRows ?? []).length > 0;
  const activeBillingCode = hasActiveBilling ? (activeBnRows as { id: number; code: string }[])[0].code : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/quotations" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono">{q.code}</h1>
          <FloorWorkBadge floorWork={q.job?.floor_work} floorNote={q.job?.floor_note} />
          <StatusBadge status={q.status} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/quotations/${q.id}/print`} className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark">
            <Icon name="printer" size={16} /> พิมพ์ / PDF
          </Link>
          {q.status === "approved" && writable && !hasActiveBilling && (
            <Link href={`/billing-notes/new?quotation=${q.id}`} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
              <Icon name="banknote" size={16} /> สร้างใบวางบิล
            </Link>
          )}
          {/* ปุ่มแก้ไขใบเสนอ — โชว์เฉพาะเมื่อไม่มีบิล active (วางบิลแล้ว = ยกเลิกบิลเดิมก่อน แล้วแก้/ออกบิลใหม่) */}
          {writable && !hasActiveBilling && q.status !== "cancelled" && (
            <>
              {/* แก้ในเครื่องคิดราคา 4.0 (0093) — โหลดใบ+สูตรกลับเข้าเครื่องคิด แก้ขนาด/option แล้วบันทึกกลับใบเดิม */}
              <Link href={`/calculator40?edit=${q.id}`}
                className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
                <Icon name="calculator" size={16} /> แก้ในเครื่องคิดราคา
              </Link>
              <QuotationEditButton
                quotationId={q.id}
                vatRate={q.vat_rate}
                discountPct={q.discount_pct}
                discountAmt={q.discount_amt}
                discountLabel={(q as { discount_label?: string }).discount_label ?? ""}
                discounts={(q as { discounts?: { label?: string; pct?: number; amt?: number }[] }).discounts ?? []}
                whtRate={q.wht_rate}
                note={q.note}
                items={items}
                revisionNo={Number((q as { revision_no?: number }).revision_no ?? 0)}
                revisionLabel={(q as { revision_label?: string }).revision_label ?? ""}
              />
            </>
          )}
          {writable && (
            <QuotationActions id={q.id} status={q.status} hasActiveBilling={hasActiveBilling} />
          )}
        </div>
      </div>

      {hasActiveBilling && activeBillingCode && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-sm text-amber-800">
          มีใบวางบิล <b className="font-mono">{activeBillingCode}</b> ที่ใช้งานอยู่ —
          ต้องยกเลิกใบวางบิลก่อนจึงจะแก้ไขหรือถอยสถานะใบเสนอได้
        </div>
      )}

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
                    {it.detail && (
                      <div className="text-xs mt-0.5" style={{ lineHeight: 1.5 }}>
                        {it.detail.split("\n").map((ln, li) => {
                          const t = ln.trim();
                          if (!t) return null;
                          if (t === "รายละเอียดงาน") return <div key={li} className="font-semibold" style={{ color: "#b3151d", marginTop: 2 }}>{t}</div>;
                          return <div key={li} className="text-ink-3" style={{ marginLeft: t.startsWith("-") ? 8 : 0 }}>{t}</div>;
                        })}
                      </div>
                    )}
                  </td>
                  <td className="text-center tabular-nums">{baht(it.qty)}</td>
                  <td className="text-right tabular-nums">{baht(it.unit_price)}</td>
                  <td className="text-right p-2 tabular-nums">{baht(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-4">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-8 py-0.5 text-ink-3">ยอดรวมก่อนภาษี</td><td className="text-right tabular-nums">{baht(q.subtotal)}</td></tr>
              {q.discount_amt > 0 && (((q as { discounts?: { label?: string; amt?: number }[] }).discounts?.filter((d) => (Number(d.amt) || 0) > 0).length ?? 0) > 1
                ? (q as { discounts?: { label?: string; amt?: number }[] }).discounts!.filter((d) => (Number(d.amt) || 0) > 0).map((d, i) => (
                    <tr key={i}><td className="pr-8 py-0.5 text-ink-3">ส่วนลด{(d.label ?? "").trim() ? ` (${(d.label ?? "").trim()})` : ` ${q.subtotal > 0 ? Number((((Number(d.amt) || 0) / q.subtotal) * 100).toFixed(2)) : 0}%`}</td><td className="text-right tabular-nums text-brand">-{baht(Number(d.amt) || 0)}</td></tr>
                  ))
                : <tr><td className="pr-8 py-0.5 text-ink-3">ส่วนลด{(q as { discount_label?: string }).discount_label ? ` (${(q as { discount_label?: string }).discount_label})` : (q.discount_pct > 0 ? ` ${q.discount_pct}%` : "")}</td><td className="text-right tabular-nums text-brand">-{baht(q.discount_amt)}</td></tr>)}
              <tr><td className="pr-8 py-0.5 text-ink-3">VAT {q.vat_rate}%</td><td className="text-right tabular-nums">{baht(q.vat_amt)}</td></tr>
              <tr className="font-bold text-brand-dark"><td className="pr-8 py-1 border-t">ยอดรวมสุทธิ</td><td className="text-right border-t tabular-nums">฿{baht(q.total)}</td></tr>
              {q.wht_amt > 0 && (<>
                <tr><td className="pr-8 py-0.5 text-ink-3">หัก ณ ที่จ่าย {q.wht_rate}%</td><td className="text-right tabular-nums text-brand">-{baht(q.wht_amt)}</td></tr>
                <tr className="font-bold text-brand-dark text-lg"><td className="pr-8 py-1">ยอดรับสุทธิ</td><td className="text-right tabular-nums">฿{baht(q.net)}</td></tr>
              </>)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
