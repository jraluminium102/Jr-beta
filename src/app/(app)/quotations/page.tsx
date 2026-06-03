import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { Card, StatusBadge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import type { QuotationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function QuotationsPage() {
  const profile = await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("quotations")
    .select("id, code, customer_snapshot, issue_date, status, net")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as {
    id: number; code: string; customer_snapshot: { name: string; job: string };
    issue_date: string; status: QuotationStatus; net: number;
  }[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="file" size={18} />
          </span>
          ใบเสนอราคา
        </h1>
        {canWrite(profile?.role) && (
          <Link href="/quotations/new" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
            <Icon name="plus" size={16} /> สร้างใบเสนอราคา
          </Link>
        )}
      </div>

      <Card className="p-5">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <p>ยังไม่มีใบเสนอราคา</p>
            <Link href="/quotations/new" className="text-brand font-semibold text-sm">+ สร้างใบแรก</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-2 font-semibold">รหัส</th>
                  <th className="font-semibold">ลูกค้า / งาน</th>
                  <th className="font-semibold">วันที่</th>
                  <th className="text-right font-semibold">ยอดสุทธิ</th>
                  <th className="font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200/70 hover:bg-white/50">
                    <td className="py-3">
                      <Link href={`/quotations/${r.id}`} className="font-mono font-semibold text-brand-dark hover:underline">{r.code}</Link>
                    </td>
                    <td>
                      <div className="font-medium">{r.customer_snapshot?.name}</div>
                      <div className="text-xs text-ink-3">{r.customer_snapshot?.job}</div>
                    </td>
                    <td className="text-ink-2">{r.issue_date}</td>
                    <td className="text-right font-semibold">฿{baht(r.net)}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
