import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { BILLING_STATUS_LABEL, type BillingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<BillingStatus, "gray" | "amber" | "emerald" | "red"> = {
  unpaid: "gray", partial: "amber", paid: "emerald", cancelled: "red",
};

export default async function BillingNotesPage() {
  const profile = await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("billing_notes")
    .select("id, code, customer_snapshot, issue_date, total, status, created_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as {
    id: number; code: string; customer_snapshot: { name: string; job: string };
    issue_date: string; total: number; status: BillingStatus;
  }[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="banknote" size={18} />
          </span>
          ใบวางบิล
        </h1>
        {canWrite(profile?.role) && (
          <Link href="/billing-notes/new" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
            <Icon name="plus" size={16} /> สร้างใบวางบิล
          </Link>
        )}
      </div>

      <Card className="p-5">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <p>ยังไม่มีใบวางบิล</p>
            {canWrite(profile?.role) && (
              <Link href="/billing-notes/new" className="text-brand font-semibold text-sm">+ สร้างใบแรก</Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-2 font-semibold">รหัส</th>
                  <th className="font-semibold">ลูกค้า / งาน</th>
                  <th className="font-semibold">วันที่</th>
                  <th className="text-right font-semibold">ยอดรวม</th>
                  <th className="font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200/70 hover:bg-white/50">
                    <td className="py-3">
                      <Link href={`/billing-notes/${r.id}`} className="font-mono font-semibold text-brand-dark hover:underline">{r.code}</Link>
                    </td>
                    <td>
                      <div className="font-medium">{r.customer_snapshot?.name}</div>
                      <div className="text-xs text-ink-3">{r.customer_snapshot?.job}</div>
                    </td>
                    <td className="text-ink-2">{r.issue_date}</td>
                    <td className="text-right font-semibold">฿{baht(r.total)}</td>
                    <td><Badge tone={STATUS_TONE[r.status]} dot>{BILLING_STATUS_LABEL[r.status]}</Badge></td>
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
