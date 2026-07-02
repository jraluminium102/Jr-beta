import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";
import PrintButton from "@/app/(app)/receipts/[id]/print/PrintButton";

export const dynamic = "force-dynamic";

const MOVE_LABEL: Record<string, string> = { in: "รับเข้า", out: "เบิกออก", adjust: "ปรับยอด" };
const THAI_MONTH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

function parseMonth(m?: string): { y: number; m0: number } {
  const now = new Date();
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mm] = m.split("-").map(Number);
    if (mm >= 1 && mm <= 12) return { y, m0: mm - 1 };
  }
  return { y: now.getFullYear(), m0: now.getMonth() };
}
const pad2 = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m0: number) => `${y}-${pad2(m0 + 1)}`;

type Row = {
  id: number; created_at: string; type: string; qty: number;
  requester: string; ref: string; note: string; total_price: number;
  stock_items: { name: string; category: string; unit: string } | null;
  jobs: { job_code: string | null; customer_name: string } | null;
};

export default async function StockMovesPage({ searchParams }: { searchParams: { m?: string; type?: string } }) {
  // การซ่อนราคาจากฝ่ายสโตร์ยังไม่เปิด — ตอนนี้ทุกคนเห็นราคา (ไว้สร้างแอคเคาท์สโตร์ค่อยกลับมาตั้ง role)
  const canViewCost = true;
  const { y, m0 } = parseMonth(searchParams.m);
  const start = `${y}-${pad2(m0 + 1)}-01`;
  const nextY = m0 === 11 ? y + 1 : y;
  const nextM0 = m0 === 11 ? 0 : m0 + 1;
  const nextStart = `${nextY}-${pad2(nextM0 + 1)}-01`;
  const prevY = m0 === 0 ? y - 1 : y;
  const prevM0 = m0 === 0 ? 11 : m0 - 1;
  const typeFilter = searchParams.type && ["in", "out", "adjust"].includes(searchParams.type) ? searchParams.type : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as unknown as { from: (t: string) => any };
  let query = supabase
    .from("stock_moves")
    .select("id, created_at, type, qty, requester, ref, note, total_price, stock_items(name,category,unit), jobs(job_code,customer_name)")
    .gte("created_at", start).lt("created_at", nextStart)
    .order("created_at", { ascending: true });
  if (typeFilter) query = query.eq("type", typeFilter);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  const sumIn = rows.filter((r) => r.type === "in").reduce((s, r) => s + Number(r.total_price || 0), 0);
  const sumOut = rows.filter((r) => r.type === "out").reduce((s, r) => s + Number(r.total_price || 0), 0);
  const monthLabel = `${THAI_MONTH[m0]} ${y + 543}`;
  const qs = (t: string) => `?m=${key(y, m0)}${t ? `&type=${t}` : ""}`;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/stock" className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับสต๊อก
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {/* กรองประเภท */}
          <div className="flex items-center gap-1 text-xs">
            <Link href={`/stock/moves${qs("")}`} className={`px-2.5 py-1.5 rounded-lg ${!typeFilter ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>ทั้งหมด</Link>
            <Link href={`/stock/moves${qs("in")}`} className={`px-2.5 py-1.5 rounded-lg ${typeFilter === "in" ? "bg-emerald-600 text-white" : "glass-soft text-ink-2"}`}>รับเข้า</Link>
            <Link href={`/stock/moves${qs("out")}`} className={`px-2.5 py-1.5 rounded-lg ${typeFilter === "out" ? "bg-red-600 text-white" : "glass-soft text-ink-2"}`}>เบิกออก</Link>
          </div>
          <Link href={`/stock/moves?m=${key(prevY, prevM0)}${typeFilter ? `&type=${typeFilter}` : ""}`} className="press rounded-lg border px-2.5 py-1.5 text-sm text-ink-2">‹ เดือนก่อน</Link>
          <span className="font-semibold text-brand-dark text-sm min-w-[130px] text-center">{monthLabel}</span>
          <Link href={`/stock/moves?m=${key(nextY, nextM0)}${typeFilter ? `&type=${typeFilter}` : ""}`} className="press rounded-lg border px-2.5 py-1.5 text-sm text-ink-2">เดือนถัดไป ›</Link>
          <PrintButton />
        </div>
      </div>

      {/* กระดาษ A4 แนวนอน */}
      <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "297mm", minHeight: "210mm", padding: "12mm" }}>
        <div className="flex justify-between items-start" style={{ gap: 24, marginBottom: 14 }}>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jr-logo.png" alt="JR Aluminium" style={{ height: 32 }} />
            <div className="mt-1.5" style={{ fontSize: 11, color: "#374151" }}>
              <span className="font-semibold" style={{ color: "#1f2937" }}>{COMPANY.nameFull}</span>
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 19, fontWeight: 700, color: "#b3151d" }}>สมุดการเคลื่อนไหววัสดุ</div>
            <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>
              ประจำเดือน {monthLabel}{typeFilter ? ` · เฉพาะ${MOVE_LABEL[typeFilter]}` : ""}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
              {canViewCost ? `รับเข้า ฿${baht(sumIn)} · เบิกใช้ ฿${baht(sumOut)} · ` : ""}ทั้งหมด {rows.length} รายการ
            </div>
          </div>
        </div>

        <table className="w-full border-collapse" style={{ fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#fdecec", color: "#7d0f15" }}>
              <th className="p-1.5 text-center border border-gray-200" style={{ width: 32 }}>#</th>
              <th className="p-1.5 text-left border border-gray-200" style={{ width: 70 }}>วันที่</th>
              <th className="p-1.5 text-center border border-gray-200" style={{ width: 54 }}>สถานะ</th>
              <th className="p-1.5 text-left border border-gray-200">รายการ</th>
              <th className="p-1.5 text-left border border-gray-200" style={{ width: 80 }}>หมวด</th>
              <th className="p-1.5 text-right border border-gray-200" style={{ width: 70 }}>จำนวน</th>
              <th className="p-1.5 text-left border border-gray-200" style={{ width: 90 }}>ผู้เบิก</th>
              <th className="p-1.5 text-left border border-gray-200">งาน (ลูกค้า)</th>
              {canViewCost && <th className="p-1.5 text-right border border-gray-200" style={{ width: 80 }}>ราคารวม</th>}
              <th className="p-1.5 text-left border border-gray-200" style={{ width: 110 }}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={canViewCost ? 10 : 9} className="p-6 text-center text-gray-400 border border-gray-200">— ไม่มีการเคลื่อนไหวในเดือนนี้ —</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id}>
                <td className="p-1.5 text-center border border-gray-200">{i + 1}</td>
                <td className="p-1.5 border border-gray-200 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
                <td className="p-1.5 text-center border border-gray-200" style={{ color: r.type === "out" ? "#b91c1c" : r.type === "in" ? "#047857" : "#a16207" }}>
                  {MOVE_LABEL[r.type] ?? r.type}
                </td>
                <td className="p-1.5 border border-gray-200">{r.stock_items?.name ?? "—"}</td>
                <td className="p-1.5 border border-gray-200" style={{ color: "#6b7280" }}>{r.stock_items?.category ?? ""}</td>
                <td className="p-1.5 text-right border border-gray-200 tabular-nums">
                  {r.type === "out" ? "−" : r.type === "in" ? "+" : "="}{baht(r.qty)} {r.stock_items?.unit ?? ""}
                </td>
                <td className="p-1.5 border border-gray-200">{r.requester || "—"}</td>
                <td className="p-1.5 border border-gray-200">
                  {r.jobs ? `${r.jobs.job_code || "—"} · ${r.jobs.customer_name}` : (r.ref || "—")}
                </td>
                {canViewCost && <td className="p-1.5 text-right border border-gray-200 tabular-nums">{r.total_price ? baht(r.total_price) : "—"}</td>}
                <td className="p-1.5 border border-gray-200" style={{ color: "#6b7280" }}>{r.note || ""}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && canViewCost && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: "#fafafa" }}>
                <td className="p-1.5 border border-gray-200 text-right" colSpan={8}>รวมมูลค่ารับเข้าเดือนนี้</td>
                <td className="p-1.5 text-right border border-gray-200 tabular-nums" style={{ color: "#047857" }}>฿{baht(sumIn)}</td>
                <td className="border border-gray-200"></td>
              </tr>
              <tr style={{ fontWeight: 700, background: "#fafafa" }}>
                <td className="p-1.5 border border-gray-200 text-right" colSpan={8}>รวมมูลค่าเบิกใช้เดือนนี้</td>
                <td className="p-1.5 text-right border border-gray-200 tabular-nums" style={{ color: "#b91c1c" }}>฿{baht(sumOut)}</td>
                <td className="border border-gray-200"></td>
              </tr>
            </tfoot>
          )}
        </table>

        {canViewCost && (
          <div style={{ marginTop: 18, fontSize: 10, color: "#9ca3af" }}>
            * ราคาต้นทุนตามที่จ่ายจริง (บริษัทไม่จด VAT) · มูลค่าเบิกใช้ = ต้นทุนถัวเฉลี่ย ณ วันเบิก
          </div>
        )}
      </div>
    </div>
  );
}
