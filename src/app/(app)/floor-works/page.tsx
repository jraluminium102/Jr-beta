import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { baht } from "@/lib/money";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-gray-100 text-gray-700" },
  sent: { label: "ส่งลูกค้า", cls: "bg-sky-100 text-sky-800" },
  accepted: { label: "ตกลงแล้ว", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "ยกเลิก", cls: "bg-red-100 text-red-800" },
};

export default async function FloorWorksPage() {
  const profile = await getProfile();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("floor_quotations")
    .select("id, code, customer_snapshot, issue_date, rev, status, total, calc")
    .order("issue_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(300);

  const missingTable = !!error && /floor_quotation|does not exist|schema cache/i.test(error.message ?? "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-ink">คิดราคางานพื้น</h1>
          <p className="text-sm text-ink-3">งานพื้น / งานผู้รับเหมา — ออกใบเสนอตามฟอร์มช่าง + ใบเบิกงวด</p>
        </div>
        {canWrite(profile?.role) && (
          <Link href="/floor-works/new" className="press rounded-xl bg-brand text-white font-semibold px-4 py-2.5 text-sm inline-flex items-center gap-1.5">
            <Icon name="plus" size={16} /> คิดราคาใหม่
          </Link>
        )}
      </div>

      {missingTable && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>ยังไม่ได้รัน migration</b> — เปิดไฟล์ <code>supabase/migrations/0120_floor_works.sql</code> แล้วรันใน Supabase SQL Editor ก่อนใช้งานหน้านี้
        </div>
      )}
      {error && !missingTable && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error.message}</div>
      )}

      {!error && rows.length === 0 && (
        <div className="card p-10 text-center text-ink-3">
          ยังไม่มีใบเสนอราคางานพื้น — กด “คิดราคาใหม่” เพื่อเริ่ม
        </div>
      )}

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#faedf0", color: "#a8425a" }}>
                <th className="p-2.5 text-left">เลขที่</th>
                <th className="p-2.5 text-left">ลูกค้า</th>
                <th className="p-2.5 text-center">วันที่</th>
                <th className="p-2.5 text-center">ขนาด</th>
                <th className="p-2.5 text-center">เข็ม</th>
                <th className="p-2.5 text-right">ยอดรวม</th>
                <th className="p-2.5 text-center">สถานะ</th>
                <th className="p-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] ?? STATUS.draft;
                const c = r.calc ?? {};
                return (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/70">
                    <td className="p-2.5 font-mono font-semibold whitespace-nowrap">
                      <Link href={`/floor-works/${r.id}`} className="text-brand hover:underline">{r.code}</Link>
                      {r.rev > 0 && <span className="ml-1 text-xs text-ink-3">Rev{String(r.rev).padStart(2, "0")}</span>}
                    </td>
                    <td className="p-2.5">{r.customer_snapshot?.name ?? "—"}</td>
                    <td className="p-2.5 text-center whitespace-nowrap tabular-nums">{r.issue_date}</td>
                    <td className="p-2.5 text-center whitespace-nowrap tabular-nums text-ink-2">
                      {c.width && c.length ? `${c.width} × ${c.length} ม.` : "—"}
                    </td>
                    <td className="p-2.5 text-center tabular-nums text-ink-2">{c.piles ?? "—"}</td>
                    <td className="p-2.5 text-right tabular-nums font-semibold">{baht(Number(r.total) || 0)}</td>
                    <td className="p-2.5 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="p-2.5 text-right whitespace-nowrap">
                      <Link href={`/floor-works/${r.id}/print`} target="_blank"
                        className="press text-xs text-ink-2 hover:text-brand px-1.5">พิมพ์</Link>
                      <Link href={`/floor-works/${r.id}/installments`}
                        className="press text-xs text-ink-2 hover:text-brand px-1.5">งวด</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
