import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "./PrintButton";
import { QuotationDoc } from "./QuotationDoc";
import { CONDITIONS_WORK, CONDITIONS_QUOTE } from "./quote-constants";
import { CONDITIONS_WORK_EN, CONDITIONS_QUOTE_EN, docLangOf } from "@/lib/doc-lang";

export const dynamic = "force-dynamic";

export default async function PrintPage({ params, searchParams }: { params: { id: string }; searchParams?: { lang?: string } }) {
  // ?lang=en = ใบเสนอราคาภาษาอังกฤษ (ป้ายระบบ + ใบปะหลังเงื่อนไขอังกฤษ · เจ้าของสั่ง 2 พ.ย.69)
  const lang = docLangOf(searchParams?.lang);
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
  // ภาษาอังกฤษ = ใช้ชุดมาตรฐานอังกฤษเสมอ (เงื่อนไขที่แก้รายใบเป็นภาษาไทย แปลอัตโนมัติไม่ได้)
  const condWork: string[] = lang === "en" ? CONDITIONS_WORK_EN
    : Array.isArray(anyQ.conditions_work) && anyQ.conditions_work.length ? anyQ.conditions_work : CONDITIONS_WORK;
  const condQuote: string[] = lang === "en" ? CONDITIONS_QUOTE_EN
    : Array.isArray(anyQ.conditions_quote) && anyQ.conditions_quote.length ? anyQ.conditions_quote : CONDITIONS_QUOTE;

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
        <div className="flex items-center gap-2">
          {/* สลับภาษาเอกสาร — ไทย / English (ใบเดียวพิมพ์ได้ทั้ง 2 ภาษา) */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 text-sm font-semibold">
            <Link href={`/quotations/${q.id}/print`} className={`px-3 py-2 ${lang === "th" ? "bg-brand text-white" : "text-ink-2"}`}>ไทย</Link>
            <Link href={`/quotations/${q.id}/print?lang=en`} className={`px-3 py-2 ${lang === "en" ? "bg-brand text-white" : "text-ink-2"}`}>English</Link>
          </div>
          <PrintButton />
        </div>
      </div>

      {/* A4 paper — qdoc-a4: ตอนพิมพ์ปิด padding บน-ล่าง (thead/tfoot ของ .qdoc จัดขอบทุกหน้าแทน) */}
      <div
        className="qdoc-a4 mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0"
        style={{ width: "210mm", minHeight: "297mm", padding: "16mm", boxSizing: "border-box" }}
      >
        <QuotationDoc q={q} condWork={condWork} condQuote={condQuote} lang={lang} />
      </div>
    </div>
  );
}
