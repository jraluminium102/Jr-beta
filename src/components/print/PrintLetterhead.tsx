import type { ReactNode } from "react";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";
import { LOGO_BASE64 } from "@/app/(app)/quotations/[id]/print/page";

// หัวเอกสารพิมพ์กลาง (โลโก้จริง + COMPANY + หัวเอกสาร + บล็อกลูกค้า)
// ใช้ดีไซน์เดียวกับใบเสนอราคา — ใช้ร่วมใบวางบิล/ใบเสร็จ
type InfoRow = { label: string; value: ReactNode };
type CustomerSnapshot = {
  name?: string;
  job?: string;
  address?: string;
  tax_id?: string;
  contact_person?: string;
  phone?: string;
};

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
          {/* โลโก้ PNG มีกราฟิก "JR." อยู่แค่ส่วน (173,16)-(599,116) ของแคนวาส 600×223 (ที่เหลือว่าง)
              → crop ด้วย wrapper overflow-hidden ให้โชว์เฉพาะกราฟิก สูง 28px (ไม่งั้นย่อทั้งแคนวาสจะจิ๋วเหมือนเศษ) */}
          <div style={{ width: 118, height: 28, overflow: "hidden", position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_BASE64}
              alt="JR Aluminium"
              style={{ position: "absolute", left: -48, top: -4, width: 166, maxWidth: "none", height: "auto" }}
            />
          </div>
          <div className="mt-1.5 leading-relaxed" style={{ fontSize: 12 }}>
            <span className="font-semibold" style={{ color: "#b3151d" }}>
              {COMPANY.name}
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
      <div className="mb-4" style={{ fontSize: 13 }}>
        <span className="font-bold" style={{ color: "#b3151d" }}>ลูกค้า</span>
        <br />
        <span className="font-medium">
          {c.name}
          {c.job ? ` · ${c.job}` : ""}
        </span>
        {c.address && (
          <>
            <br />
            <span style={{ color: "#4b5563" }}>{c.address}</span>
          </>
        )}
        {c.tax_id && (
          <>
            <br />
            <span style={{ color: "#4b5563" }}>เลขผู้เสียภาษี: {c.tax_id}</span>
          </>
        )}
        {(c.contact_person || c.phone) && (
          <>
            <br />
            <span style={{ color: "#4b5563" }}>
              ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}
            </span>
          </>
        )}
      </div>
    </>
  );
}
