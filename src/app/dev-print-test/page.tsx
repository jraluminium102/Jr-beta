import { notFound } from "next/navigation";
import type { Quotation, QuotationItem } from "@/lib/types";
import { QuotationDoc } from "@/app/(app)/quotations/[id]/print/QuotationDoc";
import { CONDITIONS_WORK, CONDITIONS_QUOTE } from "@/app/(app)/quotations/[id]/print/quote-constants";

/**
 * หน้าทดสอบการแบ่งหน้าตอนพิมพ์ใบเสนอราคา (dev เท่านั้น — production คืน 404)
 *
 * ใช้ตรวจว่า "หัวบิลไปทุกหน้า" + "กล่องยอดรวมไม่โดนตัดครึ่ง" จริงไหม
 * โดยไม่ต้องมีฐานข้อมูล — ใส่ข้อมูลปลอมจำนวนแถวตามต้องการ
 *
 *   npm run dev
 *   node scripts/verify-quote-print.mjs      ← พิมพ์เป็น PDF แล้วตรวจให้
 *
 * ?items=30   จำนวนรายการ (มาก = หลายหน้า)
 * ?tall=1     ทำให้รายการสุดท้ายยาว ดันกล่องยอดรวมไปคาบเกี่ยวรอยต่อหน้า
 */
export const dynamic = "force-dynamic";

function makeItems(n: number, tall: boolean): QuotationItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `ประตูบานเลื่อน SlimLux 2 บาน (ชุดที่ ${i + 1})`,
    detail:
      i % 3 === 0
        ? "ขนาด 2400 x 2200 มม.\nอลูมิเนียมสีอบขาว · กระจกเขียวตัดแสง 6 มม.\nพร้อมมุ้งลวดกรอบอลูมิเนียม"
        : "ขนาด 1800 x 2200 มม. · สีดำ · กระจกใส 6 มม.",
    qty: 1,
    unit_price: 28500 + i * 137,
    line_total: 28500 + i * 137,
    sort_order: i,
  })).map((it, i, arr) =>
    // รายการสุดท้ายยาวพิเศษ → ดันกล่องยอดรวมไปชนรอยต่อหน้าพอดี (เคสที่เคยพัง)
    tall && i === arr.length - 1
      ? { ...it, detail: Array.from({ length: 14 }, (_, k) => `รายละเอียดบรรทัดที่ ${k + 1} ของชุดสุดท้าย`).join("\n") }
      : it
  );
}

export default function PrintTestPage({
  searchParams,
}: {
  searchParams: { items?: string; tall?: string };
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const n = Math.min(200, Math.max(1, Number(searchParams.items) || 30));
  const items = makeItems(n, searchParams.tall === "1");
  const subtotal = items.reduce((s, it) => s + it.line_total, 0);
  const vat_amt = Math.round(subtotal * 0.07 * 100) / 100;

  const q: Quotation = {
    id: 999,
    code: "QT2569070099",
    customer_id: 1,
    customer_snapshot: {
      name: "บริษัท ทดสอบการพิมพ์ จำกัด (สำนักงานใหญ่)",
      job: "บ้านพักอาศัย 2 ชั้น ซอยทดสอบ 12",
      address: "เลขที่ 123/45 หมู่บ้านตัวอย่าง ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10250",
      tax_id: "0105500000000",
      line_id: "testline",
      phone: "081-234-5678",
      contact_person: "คุณทดสอบ",
    },
    issue_date: "2026-07-16",
    status: "draft",
    vat_rate: 7,
    discount_pct: 0,
    wht_rate: 0,
    subtotal,
    discount_amt: 0,
    vat_amt,
    total: subtotal + vat_amt,
    wht_amt: 0,
    net: subtotal + vat_amt,
    note: "ทดสอบการแบ่งหน้า — หน้านี้ไม่มีในระบบจริง",
    created_at: "2026-07-16T00:00:00Z",
    updated_at: "2026-07-16T00:00:00Z",
    quotation_items: items,
  };

  return (
    <div className="min-h-dvh bg-gray-100 print:bg-white">
      <div
        className="qdoc-a4 mx-auto my-6 bg-white shadow-lg print:shadow-none print:my-0"
        style={{ width: "210mm", minHeight: "297mm", padding: "16mm" }}
      >
        <QuotationDoc q={q} condWork={CONDITIONS_WORK} condQuote={CONDITIONS_QUOTE} />
      </div>
    </div>
  );
}
