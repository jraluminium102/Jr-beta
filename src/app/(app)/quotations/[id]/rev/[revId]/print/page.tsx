import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Quotation } from "@/lib/types";
import Icon from "@/components/Icon";
import PrintButton from "../../../print/PrintButton";
import { QuotationDoc } from "../../../print/QuotationDoc";
import { CONDITIONS_WORK, CONDITIONS_QUOTE } from "../../../print/quote-constants";

export const dynamic = "force-dynamic";

// พิมพ์/ดู "ฉบับก่อนแก้" (0093) — โหลด snapshot จาก quotation_revisions แล้ว render ผ่าน QuotationDoc เดิม
//   snapshot = ใบเต็ม + รายการ + สูตร ณ เวลานั้น (รูปแบบเดียวกับ Quotation) → พิมพ์ออกมาเหมือนที่เคยส่งลูกค้า
export default async function RevisionPrintPage({ params }: { params: { id: string; revId: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("quotation_revisions")
    .select("id, quotation_id, label, revision_no, snapshot")
    .eq("id", params.revId)
    .eq("quotation_id", params.id) // กันเปิด rev ของใบอื่นด้วย id มั่ว
    .single();
  if (!data) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rev = data as any;
  const q = (rev.snapshot ?? {}) as Quotation;
  if (!q || !q.customer_snapshot) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyQ = q as any;
  const condWork: string[] = Array.isArray(anyQ.conditions_work) && anyQ.conditions_work.length ? anyQ.conditions_work : CONDITIONS_WORK;
  const condQuote: string[] = Array.isArray(anyQ.conditions_quote) && anyQ.conditions_quote.length ? anyQ.conditions_quote : CONDITIONS_QUOTE;

  const revLabel = String(rev.label ?? "").trim() || `Rev${String(rev.revision_no ?? 0).padStart(2, "0")}`;

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <Link href={`/quotations/${params.id}`} className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="arrowLeft" size={16} /> กลับ
        </Link>
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          📜 ฉบับก่อนแก้ ({revLabel}) — ภาพนิ่งที่เก็บไว้ ไม่ใช่ใบปัจจุบัน
        </div>
        <PrintButton />
      </div>

      <div
        className="qdoc-a4 mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0"
        style={{ width: "210mm", minHeight: "297mm", padding: "16mm" }}
      >
        <QuotationDoc q={q} condWork={condWork} condQuote={condQuote} />
      </div>
    </div>
  );
}
