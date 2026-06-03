import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, StatusBadge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import type { QuotationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();

  const [{ count: custCount }, { count: qCount }, { data: recent }] = await Promise.all([
    supabase.from("customers").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("quotations").select("*", { count: "exact", head: true }),
    supabase
      .from("quotations")
      .select("id, code, customer_snapshot, issue_date, status, net")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const rows = (recent ?? []) as {
    id: number; code: string; customer_snapshot: { name: string; job: string };
    issue_date: string; status: QuotationStatus; net: number;
  }[];

  const approved = rows.filter((r) => r.status === "approved").length;
  const draft = rows.filter((r) => r.status === "draft").length;

  const kpis = [
    { label: "ลูกค้าทั้งหมด", val: custCount ?? 0, icon: "users", color: "#4b4f5a", money: false },
    { label: "ใบเสนอราคาทั้งหมด", val: qCount ?? 0, icon: "file", color: "#b3151d", money: false },
    { label: "อนุมัติแล้ว (ล่าสุด)", val: approved, icon: "check", color: "#0f7a38", money: false },
    { label: "ร่าง (ล่าสุด)", val: draft, icon: "warn", color: "#b45309", money: false },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="dashboard" size={18} />
          </span>
          Dashboard
        </h1>
        <Link href="/quotations/new" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
          <Icon name="plus" size={16} /> สร้างใบเสนอราคา
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-3">{k.label}</span>
              <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ background: k.color + "1a", color: k.color }}>
                <Icon name={k.icon} size={16} />
              </span>
            </div>
            <div className="text-2xl font-extrabold mt-2" style={{ color: k.color }}>
              {k.money ? "฿" + baht(k.val) : k.val}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h3 className="font-bold text-brand-dark mb-3">ใบเสนอราคาล่าสุด</h3>
        {rows.length === 0 ? (
          <div className="text-center py-10 text-ink-3">
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
