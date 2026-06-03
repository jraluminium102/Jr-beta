import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import BillingActions from "./BillingActions";
import { BILLING_STATUS_LABEL, type BillingNote, type BillingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<BillingStatus, "gray" | "amber" | "emerald" | "red"> = {
  unpaid: "gray", partial: "amber", paid: "emerald", cancelled: "red",
};

export default async function BillingNoteDetail({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("billing_notes")
    .select("*, billing_installments(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const bn = data as BillingNote & { quotations?: { code: string } | null };
  const installments = (bn.billing_installments ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const c = bn.customer_snapshot;
  const writable = canWrite(profile?.role);

  // ดึงรหัสใบเสนออ้างอิง (ถ้ามี)
  let refCode: string | null = null;
  if (bn.quotation_id) {
    const { data: q } = await supabase.from("quotations").select("code").eq("id", bn.quotation_id).single();
    refCode = q?.code ?? null;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/billing-notes" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono">{bn.code}</h1>
          <Badge tone={STATUS_TONE[bn.status]} dot>{BILLING_STATUS_LABEL[bn.status]}</Badge>
        </div>
        <div className="flex gap-2">
          <Link href={`/billing-notes/${bn.id}/print`} className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark">
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
            <div className="text-xs text-ink-3">วันที่ออก: <b className="text-ink">{bn.issue_date}</b></div>
            <div className="text-xs text-ink-3">อ้างอิงใบเสนอ: {refCode ? <b className="text-ink font-mono">{refCode}</b> : "—"}</div>
            <div className="text-xs text-ink-3">ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}</div>
            <div className="text-base font-bold text-brand-dark mt-1">ยอดรวม ฿{baht(bn.total)}</div>
          </div>
        </div>

        <div className="overflow-x-auto mt-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-brand-soft text-brand-dark">
                <th className="p-2 rounded-l-lg">งวด</th>
                <th>รายละเอียด</th>
                <th className="text-right">ยอด</th>
                <th className="text-center">กำหนดชำระ</th>
                <th className="text-center">สถานะ</th>
                {writable && <th className="text-right p-2 rounded-r-lg">รับชำระ</th>}
              </tr>
            </thead>
            <tbody>
              {installments.map((it) => (
                <tr key={it.id} className="border-b border-gray-100">
                  <td className="p-2">{it.seq}</td>
                  <td>
                    <div className="font-medium">{it.label}</div>
                    {it.status === "paid" && (
                      <div className="text-xs text-emerald-700">รับแล้ว ฿{baht(it.paid_amount)} · {it.paid_date}</div>
                    )}
                  </td>
                  <td className="text-right font-semibold">฿{baht(it.amount)}</td>
                  <td className="text-center text-ink-2">{it.due_date || "—"}</td>
                  <td className="text-center">
                    <Badge tone={it.status === "paid" ? "emerald" : "gray"} dot>
                      {it.status === "paid" ? "ชำระแล้ว" : "รอชำระ"}
                    </Badge>
                  </td>
                  {writable && (
                    <td className="text-right p-2">
                      {it.status === "paid" ? (
                        <span className="text-xs text-ink-3">—</span>
                      ) : (
                        <BillingActions billingNoteId={bn.id} installmentId={it.id!} amount={it.amount} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {bn.note && <div className="mt-5 text-xs text-ink-3"><b>หมายเหตุ:</b> {bn.note}</div>}
      </Card>
    </div>
  );
}
