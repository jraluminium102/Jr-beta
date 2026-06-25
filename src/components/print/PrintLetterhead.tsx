import type { ReactNode } from "react";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";

// หัวเอกสารพิมพ์กลาง (โลโก้จริง + COMPANY + หัวเอกสาร + บล็อกลูกค้า)
// ใช้ดีไซน์เดียวกับใบเสนอราคา — ใช้ร่วมใบวางบิล/ใบเสร็จ
type InfoRow = { label: string; value: ReactNode };
export type CustomerSnapshot = {
  name?: string;
  job?: string;
  address?: string;
  tax_id?: string;
  contact_person?: string;
  phone?: string;
};

// บล็อกข้อมูลลูกค้า/ผู้ซื้อ — ฟอร์มบัญชีไทย (ชื่อ → ที่อยู่ → เลขประจำตัวผู้เสียภาษี)
// ใช้ร่วมทุกเอกสาร (ใบเสนอราคา/ใบวางบิล/ใบเสร็จ) ผ่าน export เดียว — กันรูปแบบเพี้ยนกัน
// หมายเหตุ: ไม่พิมพ์ "—" แทนที่อยู่/เลขภาษีที่ว่าง (ใบกำกับภาษีต้องครบจริง) — ใบเสร็จเตือนเจ้าหน้าที่แยก
export function PrintCustomerBlock({ c }: { c: CustomerSnapshot }) {
  return (
    <div className="mb-4" style={{ fontSize: 13 }}>
      <span className="font-bold" style={{ color: "#b3151d" }}>ลูกค้า</span>
      <div className="mt-0.5" style={{ lineHeight: 1.55 }}>
        <div className="font-semibold" style={{ color: "#1f2937" }}>{c.name || "—"}</div>
        {c.address && <div style={{ color: "#374151" }}>{c.address}</div>}
        {c.tax_id && <div style={{ color: "#374151" }}>เลขประจำตัวผู้เสียภาษี {c.tax_id}</div>}
        {c.job && <div style={{ color: "#6b7280", fontSize: 12 }}>งาน: {c.job}</div>}
        {(c.contact_person || c.phone) && (
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            ผู้ติดต่อ {c.contact_person || "—"} · โทร {c.phone || "—"}
          </div>
        )}
      </div>
    </div>
  );
}

/** เช็คความครบของข้อมูลผู้ซื้อสำหรับใบกำกับภาษีเต็มรูป (ม.86/4) — เลขภาษีรับเลขบัตร ปชช.13 หลักได้ */
export function taxInvoiceMissing(c: CustomerSnapshot): string[] {
  const miss: string[] = [];
  if (!c.tax_id || c.tax_id.replace(/\D/g, "").length < 13) miss.push("เลขประจำตัวผู้เสียภาษี/บัตรประชาชน (13 หลัก) ของผู้ซื้อ");
  if (!c.address) miss.push("ที่อยู่ผู้ซื้อ");
  return miss;
}

export function PrintLetterhead({
  docTitle,
  docSubtitle,
  infoRows,
  customer,
}: {
  docTitle: string;
  docSubtitle?: string;
  infoRows: InfoRow[];
  customer: CustomerSnapshot;
}) {
  const c = customer;
  return (
    <>
      {/* ===== Header — โลโก้ + บริษัท (ซ้าย) · ชื่อเอกสาร + เลขที่/วันที่ (ขวา) ===== */}
      <div className="flex justify-between items-start pb-4 mb-4" style={{ borderBottom: "4px solid #b3151d" }}>
        <div>
          {/* โลโก้จริงจากไฟล์ /jr-logo.png (crop ขอบขาวออกแล้ว 980×345) — ใช้ตรงๆ ไม่ต้อง CSS-crop */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jr-logo.png" alt="JR Aluminium" style={{ height: 34 }} />
          <div className="mt-1.5 leading-relaxed" style={{ fontSize: 12 }}>
            <span className="font-semibold" style={{ color: "#b3151d" }}>
              {COMPANY.nameFull}
            </span>{" "}
            ({COMPANY.branch})<br />
            {COMPANY.address}<br />
            เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · โทร. {COMPANY.phone}<br />
            {COMPANY.website}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold" style={{ color: "#7d0f15" }}>{docTitle}</div>
          {docSubtitle && <div className="text-xs text-gray-400">{docSubtitle}</div>}
          <table className="mt-2 ml-auto" style={{ fontSize: 12 }}>
            <tbody>
              {infoRows.map((r, i) => (
                <tr key={i}>
                  <td className="text-right pr-3" style={{ color: "#6b7280" }}>{r.label}</td>
                  <td>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Customer block ===== */}
      <PrintCustomerBlock c={c} />
    </>
  );
}
