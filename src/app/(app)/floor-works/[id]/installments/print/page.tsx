import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { baht } from "@/lib/money";
import Icon from "@/components/Icon";
import PrintButton from "@/app/(app)/billing-notes/[id]/print/PrintButton";

export const dynamic = "force-dynamic";

/**
 * ใบเบิกงวดงานพื้น — ลอกโครงจากใบจริงของช่างเพยาว์ (คุณพิทยารัตน์ Rev03)
 *   หัวเรื่อง → มัดจำ/งวด (แต่ละงวดมีลิสต์รายการงาน) → งวดสุดท้าย → บัญชีรับเงิน → ลายเซ็น 2 ฝั่ง
 */
export default async function FloorInstallmentPrintPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) notFound();

  const supabase = createClient();
  const { data } = await supabase
    .from("floor_quotations")
    .select("*, floor_installments(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((q.floor_installments ?? []) as any[]).slice().sort((a, b) => a.seq - b.seq);
  const contractor = q.contractor ?? {};
  const revLabel = q.rev > 0 ? ` (Rev${String(q.rev).padStart(2, "0")})` : "";
  const sum = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const quoteTotal = Number(q.total) || 0;
  const diff = Math.round((quoteTotal - sum + Number.EPSILON) * 100) / 100;

  const today = q.issue_date;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
        <Link href={`/floor-works/${q.id}/installments`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {/* เตือนเจ้าหน้าที่ — ไม่พิมพ์ลงเอกสาร */}
      {Math.abs(diff) >= 0.01 && (
        <div className="no-print mx-auto mt-3 max-w-[210mm] rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>⚠ ผลรวมงวดไม่ตรงใบเสนอ</b> — ใบเสนอ {baht(quoteTotal)} · รวมงวด {baht(sum)} · ต่าง {baht(diff)}
        </div>
      )}

      <div className="mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0"
        style={{ width: "210mm", minHeight: "297mm", padding: "18mm" }}>

        <div className="text-center font-bold" style={{ fontSize: 17 }}>
          ใบเบิกงวดงานพื้น {q.customer_snapshot?.name ?? ""}{revLabel}
        </div>

        <div className="mt-5" style={{ fontSize: 13, lineHeight: 1.9 }}>
          {rows.length === 0 && (
            <div className="text-center text-gray-500 py-10">ยังไม่ได้แบ่งงวด</div>
          )}
          {rows.map((r) => {
            const lines = String(r.work_items ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
            return (
              <div key={r.id ?? r.seq} className="mb-4" style={{ breakInside: "avoid" }}>
                {lines.length > 0 ? (
                  <>
                    <div className="font-semibold">{r.label} มีรายการดังนี้</div>
                    <div className="ml-5">
                      {lines.map((ln, i) => (
                        <div key={i}>{i + 1}. {ln}</div>
                      ))}
                    </div>
                    <div className="mt-1">
                      {r.is_final
                        ? <>งานแล้วเสร็จตามรายการดังกล่าว จึงขอส่งงาน และเก็บเงินส่วนที่เหลือ งวดสุดท้าย <b>{baht(Number(r.amount) || 0)} บาท</b></>
                        : <>งานแล้วเสร็จตามรายการดังกล่าว จึงขอเบิก{r.label} เป็นเงิน <b>{baht(Number(r.amount) || 0)} บาท</b></>}
                    </div>
                  </>
                ) : (
                  <div>
                    <span className="font-semibold">{r.label}</span>{" "}
                    <b>{baht(Number(r.amount) || 0)} บาท</b>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {rows.length > 0 && (
          <div className="flex justify-end mt-4" style={{ breakInside: "avoid" }}>
            <table style={{ fontSize: 13 }}>
              <tbody>
                <tr className="font-bold" style={{ color: "#a8425a", fontSize: 15 }}>
                  <td className="pr-8 py-1 text-right border-t">รวมทุกงวด</td>
                  <td className="text-right tabular-nums border-t">{baht(sum)} บาท</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* บัญชีรับเงิน */}
        <div className="mt-8" style={{ fontSize: 13, lineHeight: 1.8, breakInside: "avoid" }}>
          <div className="font-semibold">ชำระโดย</div>
          <div>ชื่อบัญชี {contractor.name ?? "—"}</div>
          <div>เลขบัญชี {contractor.bank_acc ?? "—"} {contractor.bank_name ?? ""}</div>
          {contractor.phone && <div>เบอร์โทร {contractor.phone}</div>}
        </div>

        {/* ลายเซ็น */}
        <div className="mt-12 flex gap-10 justify-between"
          style={{ fontSize: 13, breakInside: "avoid", pageBreakInside: "avoid" }}>
          {[
            { name: contractor.name ?? "", role: "ผู้รับจ้าง" },
            { name: "", role: "ผู้ว่าจ้าง" },
          ].map((h, i) => (
            <div key={i} className="flex-1 text-center">
              <div className="mb-2">{h.name || ".............................."}</div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>{today}</div>
              <div style={{ borderTop: "1px solid #9ca3af", paddingTop: 4, marginTop: 6 }}>{h.role}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
