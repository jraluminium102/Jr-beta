import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import { QuotationDoc } from "./QuotationDoc";
import { CONDITIONS_WORK, CONDITIONS_QUOTE } from "./quote-constants";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const q = data as Quotation;
  // เงื่อนไขท้ายใบ: ใช้ค่าที่แก้ต่อใบถ้ามี (0076) มิฉะนั้นค่ามาตรฐาน
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyQ = q as any;
  const condWork: string[] = Array.isArray(anyQ.conditions_work) && anyQ.conditions_work.length ? anyQ.conditions_work : CONDITIONS_WORK;
  const condQuote: string[] = Array.isArray(anyQ.conditions_quote) && anyQ.conditions_quote.length ? anyQ.conditions_quote : CONDITIONS_QUOTE;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      {/* toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
        <Link
          href={`/quotations/${q.id}`}
          className="press inline-flex items-center gap-1.5 text-sm text-ink-2"
        >
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <PrintButton />
      </div>

      {/* A4 paper — qdoc-a4: ตอนพิมพ์ปิด padding บน-ล่าง (thead/tfoot ของ .qdoc จัดขอบทุกหน้าแทน) */}
      <div
        className="qdoc-a4 mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0"
        style={{ width: "210mm", minHeight: "297mm", padding: "16mm" }}
      >
        <QuotationDoc q={q} condWork={condWork} condQuote={condQuote} />
      </div>
    </div>
  );
}
