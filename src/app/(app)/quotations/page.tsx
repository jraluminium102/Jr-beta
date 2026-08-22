import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { Card, StatusBadge } from "@/components/ui";
import { FloorWorkBadge } from "@/components/ui/FloorWorkBadge";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { getDocCutoff } from "@/lib/doc-cutoff";
import { TestDocsToggle } from "@/components/TestDocsToggle";
import type { QuotationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function QuotationsPage({ searchParams }: { searchParams?: { includeTest?: string } }) {
  const profile = await getProfile();
  const includeTest = searchParams?.includeTest === "1";
  const cutoff = includeTest ? "" : await getDocCutoff();
  const supabase = createClient();
  let q = supabase
    .from("quotations")
    .select("id, code, customer_snapshot, issue_date, status, net, job_id, jobs:job_id(job_code, floor_work, floor_note)")
    .order("created_at", { ascending: false });
  if (cutoff) q = q.gte("issue_date", cutoff);
  const { data } = await q;

  const rows = (data ?? []) as {
    id: number; code: string; customer_snapshot: { name: string; job: string };
    issue_date: string; status: QuotationStatus; net: number;
    job_id: string | null; jobs: { job_code: string | null; floor_work: string | null; floor_note: string | null } | null;
  }[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="file" size={18} />
          </span>
          ใบเสนอราคา
          <span className="text-xs font-normal text-ink-3">(เริ่มจากการคิดราคาเสมอ)</span>
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <TestDocsToggle cutoff={cutoff} includeTest={includeTest} basePath="/quotations" />
          {canWrite(profile?.role) && (
            <Link href="/quotations/new?manual=1" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark glass-soft">
              <Icon name="pencil" size={16} /> พิมพ์ใบเสนอเอง (นอกระบบ)
            </Link>
          )}
          {canWrite(profile?.role) && (
            <Link href="/calculator40" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
              <Icon name="calculator" size={16} /> คิดราคา + สร้างใบเสนอ
            </Link>
          )}
        </div>
      </div>

      <Card className="p-5">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <p>ยังไม่มีใบเสนอราคา</p>
            <div className="flex items-center justify-center gap-3 mt-1">
              <Link href="/calculator40" className="text-brand font-semibold text-sm">+ คิดราคา + สร้างใบแรก</Link>
              <span className="text-ink-3">·</span>
              <Link href="/quotations/new?manual=1" className="text-brand font-semibold text-sm">พิมพ์เอง (นอกระบบ)</Link>
            </div>
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link href={`/quotations/${r.id}`} className="font-mono font-semibold text-brand-dark hover:underline">{r.code}</Link>
                        <FloorWorkBadge floorWork={r.jobs?.floor_work} floorNote={r.jobs?.floor_note} />
                      </div>
                    </td>
                    <td>
                      <div className="font-medium">{r.customer_snapshot?.name}</div>
                      <div className="text-xs text-ink-3">{r.customer_snapshot?.job}</div>
                      {r.job_id ? (
                        <span className="inline-block mt-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">
                          ผูกงาน {r.jobs?.job_code ?? "JB"}
                        </span>
                      ) : (
                        <span className="inline-block mt-0.5 text-[10px] font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5" title="ใบเสนอนี้ไม่ผูกกับงานลูกค้า — บิล/การเงิน/สถิติจะตามไม่เจอ">
                          ⚠ ยังไม่ผูกงาน (เสี่ยงตกหล่น)
                        </span>
                      )}
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
