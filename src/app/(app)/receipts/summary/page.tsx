import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";
import PrintButton from "../[id]/print/PrintButton";

export const dynamic = "force-dynamic";

const PAYMENT_LABEL: Record<string, string> = {
  transfer: "โอนเงิน", cash: "เงินสด", cheque: "เช็ค", other: "อื่นๆ",
};

const THAI_MONTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// YYYY-MM → {y, m0(0-based)} · ปลอดภัยกับค่าเพี้ยน (fallback = เดือนปัจจุบัน)
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

export default async function ReceiptSummaryPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const { y, m0 } = parseMonth(searchParams.m);
  // ช่วงวันของเดือน [start, nextStart)
  const start = `${y}-${pad2(m0 + 1)}-01`;
  const nextY = m0 === 11 ? y + 1 : y;
  const nextM0 = m0 === 11 ? 0 : m0 + 1;
  const nextStart = `${nextY}-${pad2(nextM0 + 1)}-01`;
  const prevY = m0 === 0 ? y - 1 : y;
  const prevM0 = m0 === 0 ? 11 : m0 - 1;

  const supabase = createClient();
  // ⚠ ภาษีขาย: ต้องดึงใบเสร็จ "ทุกใบ" ในเดือน (รวม doc_kind='assess' ค่าประเมินหน้างานที่ job_id/quotation_id = null)
  //   ห้าม join jobs/quotations แบบ inner — ใบ assess ไม่มี job/quotation จะหลุด = ยื่นภาษีขายขาด (ผิดกฎหมาย)
  //   query นี้ดึงจาก receipts ตรง ๆ กรองแค่ช่วงวันของเดือน → ครบทุกประเภทโดยธรรมชาติ
  // base_amt/wht_amt (migration 0095) = ฐานก่อน VAT / หัก ณ ที่จ่าย ที่ server ถอดไว้ตอนออกใบ — ห้ามคิดเองหน้าจอ
  //   ⚠ net = เงินรับจริง = base + VAT − WHT → ห้ามใช้ (net − vat) เป็นฐาน เพราะจะต่ำกว่าจริงเท่ายอด WHT
  const cols = "id, code, customer_snapshot, issue_date, amount, base_amt, vat_amt, wht_amt, net, payment_method, is_voided, doc_kind";
  const colsNoKind = "id, code, customer_snapshot, issue_date, amount, base_amt, vat_amt, wht_amt, net, payment_method, is_voided";
  let { data, error } = await supabase
    .from("receipts")
    .select(cols)
    .gte("issue_date", start)
    .lt("issue_date", nextStart)
    .order("issue_date", { ascending: true })
    .order("code", { ascending: true });
  // migration 0115 (doc_kind) ยังไม่รัน → ดึงใหม่โดยไม่เอา doc_kind (ถือว่าทุกใบเป็นงานปกติ · ยอดภาษียังครบ)
  if (error && /doc_kind/i.test(error.message ?? "")) {
    ({ data } = await supabase
      .from("receipts")
      .select(colsNoKind)
      .gte("issue_date", start)
      .lt("issue_date", nextStart)
      .order("issue_date", { ascending: true })
      .order("code", { ascending: true }));
  }

  const rows = (data ?? []) as {
    id: number; code: string; customer_snapshot: { name: string; job: string };
    issue_date: string; amount: number; base_amt: number | null; vat_amt: number;
    wht_amt: number | null; net: number;
    payment_method: string; is_voided: boolean; doc_kind?: string;
  }[];

  // ฐานก่อน VAT ต่อใบ — ใช้ base_amt ที่ถอดไว้ (ถูกเมื่อมี WHT) · ใบ import เก่าที่ base_amt=null (ไม่มี WHT) → net−vat เท่ากันพอดี
  const baseOf = (r: { base_amt: number | null; net: number; vat_amt: number }) =>
    r.base_amt != null ? Number(r.base_amt) : Number(r.net || 0) - Number(r.vat_amt || 0);

  // ยอดรวม — นับเฉพาะใบที่ไม่ถูกยกเลิก (ใบยกเลิกโชว์ขีดฆ่า ไม่รวมยอด)
  //   ยอดรวมนี้ = ภาษีขายทั้งเดือน "รวมทุกประเภท" (งานปกติ + ค่าประเมิน) เสมอ — ตัวที่ใช้ยื่น ภ.พ.30
  const live = rows.filter((r) => !r.is_voided);
  const sumNet = live.reduce((s, r) => s + Number(r.net || 0), 0);
  const sumVat = live.reduce((s, r) => s + Number(r.vat_amt || 0), 0);
  const sumWht = live.reduce((s, r) => s + Number(r.wht_amt || 0), 0);
  const sumBase = live.reduce((s, r) => s + baseOf(r), 0); // ฐาน (มูลค่า) สำหรับ ภ.พ.30 — ไม่ใช่ net−vat
  // แยกยอด "ค่าประเมินหน้างาน" (doc_kind='assess') ไว้ให้บัญชี reconcile — ยอดนี้ "รวมอยู่ใน" ยอดรวมด้านบนแล้ว
  const assess = live.filter((r) => r.doc_kind === "assess");
  const assessNet = assess.reduce((s, r) => s + Number(r.net || 0), 0);
  const assessVat = assess.reduce((s, r) => s + Number(r.vat_amt || 0), 0);
  const assessWht = assess.reduce((s, r) => s + Number(r.wht_amt || 0), 0);
  const assessBase = assess.reduce((s, r) => s + baseOf(r), 0);
  const monthLabel = `${THAI_MONTH[m0]} ${y + 543}`;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* แถบเครื่องมือ — ไม่พิมพ์ */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href="/receipts" className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับรายการใบเสร็จ
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/receipts/summary?m=${key(prevY, prevM0)}`} className="press rounded-lg border px-2.5 py-1.5 text-sm text-ink-2">‹ เดือนก่อน</Link>
          <span className="font-semibold text-brand-dark text-sm min-w-[130px] text-center">{monthLabel}</span>
          <Link href={`/receipts/summary?m=${key(nextY, nextM0)}`} className="press rounded-lg border px-2.5 py-1.5 text-sm text-ink-2">เดือนถัดไป ›</Link>
          <PrintButton />
        </div>
      </div>

      {/* กระดาษ A4 */}
      <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0" style={{ width: "210mm", minHeight: "297mm", padding: "16mm" }}>
        <div className="flex justify-between items-start" style={{ gap: 24, marginBottom: 16 }}>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jr-logo.png" alt="JR Aluminium" style={{ height: 34 }} />
            <div className="mt-1.5" style={{ fontSize: 11, lineHeight: 1.5, color: "#374151" }}>
              <span className="font-semibold" style={{ color: "#1f2937" }}>{COMPANY.nameFull}</span><br />
              เลขประจำตัวผู้เสียภาษี {COMPANY.taxId}
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 20, fontWeight: 700, color: "#b3151d", lineHeight: 1.1 }}>สรุปใบเสร็จรับเงิน</div>
            <div style={{ fontSize: 14, color: "#374151", marginTop: 2 }}>ประจำเดือน {monthLabel}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>ทั้งหมด {rows.length} ใบ (ใช้ได้ {live.length} · ยกเลิก {rows.length - live.length})</div>
          </div>
        </div>

        <table className="w-full border-collapse" style={{ fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#fdecec", color: "#7d0f15" }}>
              <th className="p-2 text-center border border-gray-200" style={{ width: 40 }}>ลำดับ</th>
              <th className="p-2 text-left border border-gray-200">เลขที่</th>
              <th className="p-2 text-left border border-gray-200">วันที่</th>
              <th className="p-2 text-left border border-gray-200">ลูกค้า / งาน</th>
              <th className="p-2 text-center border border-gray-200">วิธีชำระ</th>
              <th className="p-2 text-right border border-gray-200">ก่อน VAT</th>
              <th className="p-2 text-right border border-gray-200">VAT</th>
              <th className="p-2 text-right border border-gray-200">หัก ณ ที่จ่าย</th>
              <th className="p-2 text-right border border-gray-200">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-gray-400 border border-gray-200">— ไม่มีใบเสร็จในเดือนนี้ —</td></tr>
            ) : rows.map((r, i) => {
              const base = baseOf(r);
              const vd = r.is_voided;
              return (
                <tr key={r.id} style={vd ? { color: "#9ca3af", textDecoration: "line-through" } : undefined}>
                  <td className="p-2 text-center border border-gray-200">{i + 1}</td>
                  <td className="p-2 border border-gray-200 font-mono">{r.code}{vd ? " (ยกเลิก)" : ""}</td>
                  <td className="p-2 border border-gray-200">{r.issue_date}</td>
                  <td className="p-2 border border-gray-200">
                    {r.customer_snapshot?.name}
                    {r.customer_snapshot?.job ? <span style={{ color: "#9ca3af" }}> · {r.customer_snapshot.job}</span> : null}
                    {r.doc_kind === "assess" ? (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#92400e", background: "#fef3c7", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>ค่าประเมิน</span>
                    ) : null}
                  </td>
                  <td className="p-2 text-center border border-gray-200">{PAYMENT_LABEL[r.payment_method] ?? r.payment_method}</td>
                  <td className="p-2 text-right border border-gray-200 tabular-nums">{baht(base)}</td>
                  <td className="p-2 text-right border border-gray-200 tabular-nums">{baht(r.vat_amt)}</td>
                  <td className="p-2 text-right border border-gray-200 tabular-nums">{Number(r.wht_amt || 0) > 0 ? baht(Number(r.wht_amt)) : "—"}</td>
                  <td className="p-2 text-right border border-gray-200 tabular-nums">{baht(r.net)}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: "#fafafa" }}>
                <td className="p-2 border border-gray-200 text-right" colSpan={5}>รวม (เฉพาะใบที่ใช้ได้ {live.length} ใบ)</td>
                <td className="p-2 text-right border border-gray-200 tabular-nums">{baht(sumBase)}</td>
                <td className="p-2 text-right border border-gray-200 tabular-nums">{baht(sumVat)}</td>
                <td className="p-2 text-right border border-gray-200 tabular-nums">{sumWht > 0 ? baht(sumWht) : "—"}</td>
                <td className="p-2 text-right border border-gray-200 tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(sumNet)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* reconcile ค่าประเมิน — ยอดนี้ "รวมอยู่ใน" ยอดรวมด้านบนแล้ว (แยกโชว์ให้บัญชีกระทบยอด/แยกรายงานภายในเท่านั้น) */}
        {assess.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 11, color: "#374151", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ fontWeight: 700, color: "#92400e" }}>ในจำนวนนี้เป็น “ค่าประเมินหน้างาน” {assess.length} ใบ</span>
            {" — "}ก่อน VAT {baht(assessBase)} · VAT {baht(assessVat)}{assessWht > 0 ? ` · หัก ณ ที่จ่าย ${baht(assessWht)}` : ""} · สุทธิ ฿{baht(assessNet)}
            <span style={{ color: "#9ca3af" }}> (นับรวมในยอดภาษีขายด้านบนแล้ว — แยกโชว์ไว้กระทบยอดเท่านั้น)</span>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: "#9ca3af" }}>
          พิมพ์เพื่อใช้ประกอบการยื่นภาษี/ปิดยอดรายเดือน · ยอดรวมนับใบเสร็จ/ใบกำกับภาษี “ทุกประเภท” (งานปกติ + ค่าประเมิน) · ไม่นับใบที่ยกเลิก
        </div>
      </div>
    </div>
  );
}
