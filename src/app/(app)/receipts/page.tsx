import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@/lib/database.types";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { getDocCutoff } from "@/lib/doc-cutoff";
import { TestDocsToggle } from "@/components/TestDocsToggle";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = {
  transfer: "โอนเงิน", cash: "เงินสด", cheque: "เช็ค", other: "อื่นๆ",
};

export default async function ReceiptsPage({ searchParams }: { searchParams?: { includeTest?: string } }) {
  const profile = await getProfile();
  const includeTest = searchParams?.includeTest === "1";
  const cutoff = includeTest ? "" : await getDocCutoff();
  const supabase = createClient();
  let rq = supabase
    .from("receipts")
    .select("id, code, customer_snapshot, issue_date, net, payment_method, is_voided")
    // เรียงตามเลขที่ (รันนัมเบอร์) จากมากไปน้อย — เดือนล่าสุด + เลขใหม่สุดขึ้นก่อน
    //   (เดิมเรียง created_at → ใบ backdate/ยกเลิกที่สร้างทีหลังลอยขึ้นบน เลขสลับ) · code = INV<พ.ศ.><เดือน><run4>
    .order("code", { ascending: false });
  if (cutoff) rq = rq.gte("issue_date", cutoff);
  const { data } = await rq;

  const rows = (data ?? []) as {
    id: number; code: string; customer_snapshot: { name: string; job: string };
    issue_date: string; net: number; payment_method: string; is_voided: boolean;
  }[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="receipt" size={18} />
          </span>
          ใบเสร็จ / ใบกำกับภาษี
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <TestDocsToggle cutoff={cutoff} includeTest={includeTest} basePath="/receipts" />
          <Link href="/receipts/summary" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">
            <Icon name="calendar" size={16} /> สรุปรายเดือน
          </Link>
          {profile && can(profile.role as Role, "finance", "write") && (
            <Link href="/receipts/new-standalone" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">
              <Icon name="plus" size={16} /> ออกใบใหม่ (ไม่ผูกงาน)
            </Link>
          )}
          {canWrite(profile?.role) && (
            <Link href="/receipts/new" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
              <Icon name="plus" size={16} /> สร้างใบเสร็จ
            </Link>
          )}
        </div>
      </div>

      <Card className="p-5">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <p>ยังไม่มีใบเสร็จ</p>
            <Link href="/receipts/new" className="text-brand font-semibold text-sm">+ สร้างใบแรก</Link>
          </div>
        ) : (
          <>
            {/* มือถือ: card layout */}
            <div className="md:hidden space-y-2">
              {rows.map((r) => (
                <Link key={r.id} href={`/receipts/${r.id}`} className={`block glass-soft rounded-xl p-3.5 ${r.is_voided ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-mono font-semibold ${r.is_voided ? "text-ink-3 line-through" : "text-brand-dark"}`}>{r.code}</span>
                    {r.is_voided
                      ? <span className="text-[10px] font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5">ยกเลิกแล้ว</span>
                      : <span className="text-xs text-ink-3">{PAYMENT_LABEL[r.payment_method] ?? r.payment_method}</span>}
                  </div>
                  <div className={`font-medium mt-1 ${r.is_voided ? "line-through text-ink-3" : ""}`}>{r.customer_snapshot?.name}</div>
                  {r.customer_snapshot?.job && <div className="text-xs text-ink-3">{r.customer_snapshot.job}</div>}
                  <div className="flex items-center justify-between mt-1.5 text-sm">
                    <span className="text-ink-3">{r.issue_date}</span>
                    <span className={`font-bold ${r.is_voided ? "line-through text-ink-3" : "text-brand-dark"}`}>฿{baht(r.net)}</span>
                  </div>
                </Link>
              ))}
            </div>
            {/* เดสก์ท็อป: ตาราง */}
            <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="py-2 font-semibold">รหัส</th>
                  <th className="font-semibold">ลูกค้า / งาน</th>
                  <th className="font-semibold">วันที่</th>
                  <th className="text-right font-semibold">ยอดสุทธิ</th>
                  <th className="font-semibold">วิธีชำระ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-gray-200/70 hover:bg-white/50 ${r.is_voided ? "opacity-55" : ""}`}>
                    <td className="py-3">
                      <Link href={`/receipts/${r.id}`} className={`font-mono font-semibold hover:underline ${r.is_voided ? "text-ink-3 line-through" : "text-brand-dark"}`}>{r.code}</Link>
                      {r.is_voided && <span className="ml-2 inline-block text-[10px] font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5 no-underline align-middle">ยกเลิกแล้ว</span>}
                    </td>
                    <td>
                      <div className={`font-medium ${r.is_voided ? "line-through text-ink-3" : ""}`}>{r.customer_snapshot?.name}</div>
                      <div className="text-xs text-ink-3">{r.customer_snapshot?.job}</div>
                    </td>
                    <td className="text-ink-2">{r.issue_date}</td>
                    <td className={`text-right font-semibold ${r.is_voided ? "line-through text-ink-3" : ""}`}>฿{baht(r.net)}</td>
                    <td className="text-ink-2">{PAYMENT_LABEL[r.payment_method] ?? r.payment_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
