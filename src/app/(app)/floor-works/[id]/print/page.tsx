import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import Icon from "@/components/Icon";
import PrintButton from "@/app/(app)/billing-notes/[id]/print/PrintButton";
import { FloorQuoteSheet } from "@/components/floor/FloorQuoteSheet";
import FloorPrintTitle from "@/components/floor/FloorPrintTitle";
import { quoteFileName } from "@/lib/floor-calc/engine.mjs";

export const dynamic = "force-dynamic";

/**
 * พิมพ์ใบเสนอราคางานพื้น (ฟอร์มช่าง)
 *
 * ⭐ ใช้ <FloorQuoteSheet> ตัวเดียวกับหน้าแก้ไข — ต่างแค่ editable
 *    ที่เห็นตอนแก้ = ที่พิมพ์ออกมา เป๊ะเสมอ ไม่ต้องไล่แก้ 2 ที่
 */
export default async function FloorPrintPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams?: { auto?: string };
}) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((q.floor_quotation_items ?? []) as any[])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const fileName = quoteFileName(q.customer_snapshot?.name, q.rev);

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* ชื่อไฟล์ PDF ที่ Chrome จะเสนอตอนกด "บันทึกเป็น PDF" · ?auto=1 = เปิดไดอะล็อกให้เลย */}
      <FloorPrintTitle title={fileName} auto={searchParams?.auto === "1"} />

      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href={`/floor-works/${q.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-ink-3">
            ชื่อไฟล์ที่จะได้: <b className="text-ink-2">{fileName}.pdf</b>
          </span>
          <a href={`/api/floor-quotations/${q.id}/xlsx`}
            className="press rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium">
            โหลด Excel
          </a>
          <PrintButton />
        </div>
      </div>

      {/* บอกวิธีเซฟเป็นไฟล์ — ไดอะล็อกของ Chrome เปิดมาเป็น "เครื่องพิมพ์" เสมอ เว็บสั่งเปลี่ยนไม่ได้ */}
      <div className="no-print mx-auto mt-3 max-w-[210mm] rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        อยากได้เป็นไฟล์ PDF → กดปุ่มพิมพ์ แล้วในช่อง <b>“ปลายทาง / Destination”</b> เลือก <b>“บันทึกเป็น PDF”</b>
        <span className="text-xs block mt-0.5 text-sky-800">
          Chrome จำค่านี้ไว้ให้ครั้งต่อไป · ถ้าอยากได้ไฟล์ทันทีไม่ต้องผ่านไดอะล็อก ใช้ปุ่ม “โหลด Excel” ได้เลย
        </span>
      </div>

      <div className="my-6 print:my-0">
        <FloorQuoteSheet
          customer={q.customer_snapshot ?? {}}
          issueDate={q.issue_date}
          revLabel={q.rev > 0 ? ` (Rev${String(q.rev).padStart(2, "0")})` : ""}
          contractor={q.contractor ?? {}}
          note={q.note}
          items={items}
        />
      </div>
    </div>
  );
}
