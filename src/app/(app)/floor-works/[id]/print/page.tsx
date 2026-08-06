import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import Icon from "@/components/Icon";
import PrintButton from "@/app/(app)/billing-notes/[id]/print/PrintButton";
import { FloorQuoteSheet } from "@/components/floor/FloorQuoteSheet";

export const dynamic = "force-dynamic";

/**
 * พิมพ์ใบเสนอราคางานพื้น (ฟอร์มช่าง)
 *
 * ⭐ ใช้ <FloorQuoteSheet> ตัวเดียวกับหน้าแก้ไข — ต่างแค่ editable
 *    ที่เห็นตอนแก้ = ที่พิมพ์ออกมา เป๊ะเสมอ ไม่ต้องไล่แก้ 2 ที่
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((q.floor_quotation_items ?? []) as any[])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
        <Link href={`/floor-works/${q.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
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
