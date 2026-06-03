import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import type { Warranty } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WarrantyDetail({ params }: { params: { id: string } }) {
  await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("warranties")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const w = data as Warranty & { quotation_id: number | null };
  const items = w.items ?? [];
  const c = w.customer_snapshot;

  // ดึงรหัสใบเสนออ้างอิง (ถ้ามี)
  let refCode: string | null = null;
  if (w.quotation_id) {
    const { data: q } = await supabase.from("quotations").select("code").eq("id", w.quotation_id).single();
    refCode = q?.code ?? null;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/warranties" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono">{w.code}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/warranties/${w.id}/print`} className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark">
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
            <div className="text-xs text-ink-3">อ้างอิงใบเสนอ: {refCode ? <b className="text-ink font-mono">{refCode}</b> : "—"}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs text-ink-3">วันที่ออก: <b className="text-ink">{w.issue_date}</b></div>
            <div className="text-xs text-ink-3">ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}</div>
            <div className="inline-flex flex-col items-start sm:items-end gap-0.5 mt-2 rounded-xl px-3 py-2 bg-brand-soft">
              <span className="text-xs text-ink-3">ระยะประกัน <b className="text-brand-dark">{w.warranty_months} เดือน</b></span>
              <span className="text-sm font-bold" style={{ color: "#7d0f15" }}>หมดประกัน {w.expires_date ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto mt-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-brand-soft text-brand-dark">
                <th className="p-2 rounded-l-lg">#</th>
                <th>รายการที่รับประกัน</th>
                <th className="text-right p-2 rounded-r-lg">จำนวน</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="p-2">{i + 1}</td>
                  <td>
                    <div className="font-medium">{it.name}</div>
                    {it.detail && <div className="text-xs text-ink-3">{it.detail}</div>}
                  </td>
                  <td className="text-right p-2">{baht(it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {w.coverage && (
          <div className="mt-5 text-sm">
            <div className="text-xs font-medium text-ink-3 mb-1">เงื่อนไขการรับประกัน</div>
            <p className="text-ink-2 whitespace-pre-line">{w.coverage}</p>
          </div>
        )}

        {w.note && <div className="mt-4 text-xs text-ink-3"><b>หมายเหตุ:</b> {w.note}</div>}
      </Card>
    </div>
  );
}
