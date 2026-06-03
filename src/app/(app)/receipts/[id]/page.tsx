import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import type { Receipt } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = {
  transfer: "โอนเงิน", cash: "เงินสด", cheque: "เช็ค",
};

export default async function ReceiptDetail({ params }: { params: { id: string } }) {
  await getProfile();
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
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/receipts" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono">{rc.code}</h1>
          <Badge tone="emerald" dot>{PAYMENT_LABEL[rc.payment_method] ?? rc.payment_method}</Badge>
        </div>
        <div className="flex gap-2">
          <Link href={`/receipts/${rc.id}/print`} className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark">
            <Icon name="printer" size={16} /> พิมพ์ / PDF
          </Link>
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
            <div className="text-xs text-ink-3">วันที่ออก: <b className="text-ink">{rc.issue_date}</b></div>
            <div className="text-xs text-ink-3">อ้างอิงใบวางบิล: {refCode ? <b className="text-ink font-mono">{refCode}</b> : "—"}</div>
            <div className="text-xs text-ink-3">วิธีชำระ: {PAYMENT_LABEL[rc.payment_method] ?? rc.payment_method}</div>
            <div className="text-xs text-ink-3">ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}</div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-8 py-0.5 text-ink-3 tabular-nums">ยอดก่อนภาษี</td><td className="text-right tabular-nums">{baht(rc.amount)}</td></tr>
              <tr><td className="pr-8 py-0.5 text-ink-3">VAT {rc.vat_rate}%</td><td className="text-right tabular-nums">{baht(rc.vat_amt)}</td></tr>
              <tr className="font-bold text-brand-dark text-lg"><td className="pr-8 py-1 border-t">ยอดสุทธิ</td><td className="text-right border-t tabular-nums">฿{baht(rc.net)}</td></tr>
            </tbody>
          </table>
        </div>

        {rc.note && <div className="mt-5 text-xs text-ink-3"><b>หมายเหตุ:</b> {rc.note}</div>}
      </Card>
    </div>
  );
}
