import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { baht } from "@/lib/money";
import Icon from "@/components/Icon";
import PrintButton from "@/app/(app)/billing-notes/[id]/print/PrintButton";
import { groupItems, DEFAULT_FOOTER_NOTES } from "@/lib/floor-calc/engine.mjs";

export const dynamic = "force-dynamic";

/**
 * ใบเสนอราคางานพื้น — ลอกฟอร์มช่างเพยาว์จากใบจริง (เจ้าของสั่ง "ออกตามไฟล์ตัวอย่าง")
 *
 * ต่างจากใบเสนออลูมิเนียมของ JR ทุกจุด:
 *   · หัวเรื่อง "เอกสารแสดงปริมาณและราคางานสถาปัตย์" ไม่มีหัวบิล/โลโก้ JR
 *   · คอลัมน์แยก ค่าวัสดุ/ค่าแรง/ราคางาน (เว้นว่างได้ พิมพ์ "-")
 *   · แบ่งหมวด แต่ละหมวดมียอดรวมของตัวเอง · เลขข้อเริ่ม 1 ใหม่ทุกหมวด
 *   · ไม่มี VAT — ยอดโดยรวม = ผลบวกรายการตรง ๆ
 *   · หมายเหตุประจำ 4 บรรทัดท้ายใบ
 */
export default async function FloorPrintPage({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) notFound();

  const supabase = createClient();
  const { data } = await supabase
    .from("floor_quotations")
    .select("*, floor_quotation_items(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = data as any;
  const groups = groupItems(q.floor_quotation_items ?? []);
  const multi = groups.length > 1;
  const revLabel = q.rev > 0 ? ` (Rev${String(q.rev).padStart(2, "0")})` : "";
  const contractor = q.contractor ?? {};
  const total = Number(q.total) || 0;

  const th = "border border-gray-400 px-1.5 py-1 text-center font-semibold";
  const td = "border border-gray-400 px-1.5 py-1 align-top";
  const dash = (v: unknown) => (v == null || v === "" ? "-" : baht(Number(v)));

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
        <Link href={`/floor-works/${q.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      <div className="qdoc-a4 mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0"
        style={{ width: "210mm", minHeight: "297mm", padding: "14mm" }}>

        {/* ── หัวเอกสาร (ฟอร์มช่าง) ── */}
        <div className="text-center font-bold" style={{ fontSize: 17 }}>
          เอกสารแสดงปริมาณและราคางานสถาปัตย์
        </div>
        <div className="mt-3" style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>
            <span className="font-semibold">รายการงาน</span> {q.customer_snapshot?.name ?? "—"}
            {revLabel && <span className="font-semibold">{revLabel}</span>}
            {q.customer_snapshot?.address ? ` ${q.customer_snapshot.address}` : ""}
          </div>
          <div className="flex justify-between">
            <span>วันที่ {q.issue_date}</span>
            <span>{contractor.phone ?? ""}</span>
          </div>
        </div>

        {/* ── ตารางรายการ ── */}
        <table className="w-full mt-3 border-collapse" style={{ fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#faedf0", color: "#a8425a" }}>
              <th className={th} style={{ width: "5%" }} rowSpan={2}>ลำดับ</th>
              <th className={th} rowSpan={2}>รายการ</th>
              <th className={th} style={{ width: "7%" }} rowSpan={2}>ปริมาณ</th>
              <th className={th} style={{ width: "7%" }} rowSpan={2}>หน่วย</th>
              <th className={th} colSpan={3}>ราคา/หน่วย/บาท</th>
              <th className={th} style={{ width: "12%" }} rowSpan={2}>ราคารวมสุทธิ<br />(บาท)</th>
              <th className={th} style={{ width: "9%" }} rowSpan={2}>หมายเหตุ</th>
            </tr>
            <tr style={{ background: "#faedf0", color: "#a8425a" }}>
              <th className={th} style={{ width: "9%" }}>ค่าวัสดุ</th>
              <th className={th} style={{ width: "9%" }}>ค่าแรง</th>
              <th className={th} style={{ width: "10%" }}>ราคางาน</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g: { label: string; items: Record<string, unknown>[]; subtotal: number }, gi: number) => (
              <FloorGroup key={gi} g={g} multi={multi} td={td} dash={dash} />
            ))}
          </tbody>
        </table>

        {/* ── หมายเหตุท้ายใบ ── */}
        <div className="mt-3" style={{ fontSize: 10, lineHeight: 1.7, color: "#374151", breakInside: "avoid" }}>
          {DEFAULT_FOOTER_NOTES.map((n: string, i: number) => (
            <div key={i}>{i === 0 ? "หมายเหตุ: " : ""}{n}</div>
          ))}
          {String(q.note ?? "").trim() && <div className="mt-1">{q.note}</div>}
        </div>

        {/* ── ยอดรวม ── */}
        <div className="flex justify-end mt-3" style={{ breakInside: "avoid" }}>
          <table style={{ fontSize: 12 }}>
            <tbody>
              {multi && groups.map((g: { label: string; subtotal: number }, i: number) => (
                <tr key={i}>
                  <td className="pr-8 py-0.5 text-right" style={{ color: "#6b7280" }}>
                    ยอดรวม {g.label || "(ไม่มีหมวด)"}
                  </td>
                  <td className="text-right tabular-nums">{baht(g.subtotal)} บาท</td>
                </tr>
              ))}
              <tr className="font-bold" style={{ color: "#a8425a", fontSize: 14 }}>
                <td className="pr-8 py-1 text-right border-t">ยอดโดยรวมสุทธิ</td>
                <td className="text-right tabular-nums border-t">{baht(total)} บาท</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── ลายเซ็น ── */}
        <div className="mt-14 flex gap-10 justify-between"
          style={{ fontSize: 12, breakInside: "avoid", pageBreakInside: "avoid" }}>
          {[
            { name: contractor.name ?? "ผู้รับจ้าง", role: "ผู้รับจ้าง" },
            { name: q.customer_snapshot?.name ?? "ลูกค้า", role: "ผู้ว่าจ้าง" },
          ].map((h, i) => (
            <div key={i} className="flex-1 text-center">
              <div className="mb-12">{h.name}</div>
              <div style={{ borderTop: "1px solid #9ca3af", paddingTop: 4 }}>{h.role}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>วันที่ ........./........./.........</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 1 หมวด = แถวหัวข้อ (ถ้ามีหลายหมวด) + รายการ (เลขเริ่ม 1 ใหม่ทุกหมวด) + ยอดรวมหมวด */
function FloorGroup({ g, multi, td, dash }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g: { label: string; items: any[]; subtotal: number };
  multi: boolean;
  td: string;
  dash: (v: unknown) => string;
}) {
  return (
    <>
      {g.label && (
        <tr style={{ breakAfter: "avoid", pageBreakAfter: "avoid" }}>
          <td colSpan={9} className="border border-gray-400 px-1.5 py-1 font-bold"
            style={{ background: "#fdf3f5", color: "#a8425a" }}>{g.label}</td>
        </tr>
      )}
      {g.items.map((it, i) => (
        <tr key={i}>
          <td className={`${td} text-center tabular-nums`}>{i + 1}</td>
          <td className={td} style={{ whiteSpace: "pre-wrap" }}>{it.name}</td>
          <td className={`${td} text-right tabular-nums`}>{baht(Number(it.qty) || 0)}</td>
          <td className={`${td} text-center`}>{it.unit}</td>
          <td className={`${td} text-right tabular-nums`}>{dash(it.material_price)}</td>
          <td className={`${td} text-right tabular-nums`}>{dash(it.labor_price)}</td>
          <td className={`${td} text-right tabular-nums`}>{baht(Number(it.unit_price) || 0)}</td>
          <td className={`${td} text-right tabular-nums`}>{baht(Number(it.line_total) || 0)}</td>
          <td className={`${td} text-center`} style={{ fontSize: 10 }}>{it.remark || ""}</td>
        </tr>
      ))}
      {multi && (
        <tr>
          <td colSpan={7} className="border border-gray-400 px-1.5 py-1 text-right font-semibold">
            ยอดโดยรวม {g.label || "(ไม่มีหมวด)"}
          </td>
          <td className="border border-gray-400 px-1.5 py-1 text-right tabular-nums font-semibold">{baht(g.subtotal)}</td>
          <td className="border border-gray-400" />
        </tr>
      )}
    </>
  );
}
