import type { ReactNode } from "react";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";

// หัวเอกสารพิมพ์กลาง — ดีไซน์แนว FlowAccount (สามเหลี่ยมมุม + label สีตามเอกสาร + บล็อกผู้ติดต่อ)
// ใช้ร่วม ใบเสนอราคา/ใบวางบิล/ใบเสร็จ — ฟอร์มเดียวกันทุกใบ
type InfoRow = { label: string; value: ReactNode };
export type CustomerSnapshot = {
  name?: string;
  job?: string;
  address?: string;
  tax_id?: string;
  branch?: string;   // (0069) สำนักงานใหญ่/สาขาที่ NNNNN — โชว์เฉพาะนิติบุคคล
  kind?: string;     // INDIVIDUAL | COMPANY
  contact_person?: string;
  phone?: string;
};

// สีประจำชนิดเอกสาร (แนว FlowAccount) — ส่งเข้ามาต่อเอกสาร
export const DOC_COLORS = {
  quotation: "#E8850C", // ใบเสนอราคา — ส้ม
  billing: "#7C3AED",   // ใบวางบิล — ม่วง
  receipt: "#0F9D58",   // ใบเสร็จ/ใบกำกับภาษี — เขียว
  warranty: "#b3151d",  // ใบรับประกัน — แดง (แบรนด์)
} as const;

/** เช็คความครบของข้อมูลผู้ซื้อสำหรับใบกำกับภาษีเต็มรูป (ม.86/4) — เลขภาษีรับเลขบัตร ปชช.13 หลักได้ */
export function taxInvoiceMissing(c: CustomerSnapshot): string[] {
  const miss: string[] = [];
  if (!c.tax_id || c.tax_id.replace(/\D/g, "").length < 13) miss.push("เลขประจำตัวผู้เสียภาษี/บัตรประชาชน (13 หลัก) ของผู้ซื้อ");
  if (!c.address) miss.push("ที่อยู่ผู้ซื้อ");
  return miss;
}

// บล็อกข้อมูลลูกค้า/ผู้ซื้อ — โชว์ (สำนักงานใหญ่/สาขา) เฉพาะนิติบุคคล
export function PrintCustomerBlock({ c, color }: { c: CustomerSnapshot; color?: string }) {
  return (
    <div style={{ fontSize: 13, marginTop: 14 }}>
      <span className="font-bold" style={{ color: color ?? "#b3151d" }}>ลูกค้า</span>
      <div className="mt-0.5" style={{ lineHeight: 1.55 }}>
        <div className="font-semibold" style={{ color: "#1f2937" }}>
          {c.name || "—"}
          {c.kind === "COMPANY" && c.branch ? <span style={{ fontWeight: 400 }}> ({c.branch})</span> : null}
        </div>
        {c.address && <div style={{ color: "#374151" }}>{c.address}</div>}
        {c.tax_id && <div style={{ color: "#374151" }}>เลขประจำตัวผู้เสียภาษี {c.tax_id}</div>}
        {c.job && <div style={{ color: "#6b7280", fontSize: 12 }}>งาน: {c.job}</div>}
      </div>
    </div>
  );
}

export function PrintLetterhead({
  docTitle,
  docColor = "#b3151d",
  copyLabel = "ต้นฉบับ",
  pageNo = 1,
  infoRows,
  contactRows,
  customer,
}: {
  docTitle: string;
  docColor?: string;
  copyLabel?: string;
  pageNo?: number;
  infoRows: InfoRow[];
  contactRows?: InfoRow[];
  customer: CustomerSnapshot;
}) {
  const c = customer;
  // แถวข้อมูลติดต่อ — ถ้าไม่ส่งมา ใช้ผู้ติดต่อ/เบอร์จาก snapshot
  const contacts: InfoRow[] = contactRows ?? [
    ...(c.contact_person ? [{ label: "ผู้ติดต่อ", value: c.contact_person }] : []),
    ...(c.phone ? [{ label: "เบอร์โทร", value: c.phone }] : []),
  ];
  const LabelTable = ({ rows }: { rows: InfoRow[] }) => (
    <table style={{ fontSize: 12, marginLeft: "auto", borderCollapse: "collapse" }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ color: docColor, textAlign: "right", paddingRight: 14, paddingTop: 2, paddingBottom: 2, whiteSpace: "nowrap", verticalAlign: "top" }}>{r.label}</td>
            <td style={{ color: "#1f2937", textAlign: "left", paddingTop: 2, paddingBottom: 2 }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div style={{ position: "relative", marginBottom: 18 }}>
      {/* สามเหลี่ยมมุมขวาบน + เลขหน้า */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, borderTop: `62px solid ${docColor}`, borderLeft: "62px solid transparent" }} />
      <div style={{ position: "absolute", top: 8, right: 8, color: "#fff", fontSize: 13, fontWeight: 700 }}>{pageNo}</div>

      <div className="flex justify-between items-start" style={{ gap: 24 }}>
        {/* ซ้าย: โลโก้ + บริษัท + ลูกค้า */}
        <div style={{ flex: 1, maxWidth: "56%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jr-logo.png" alt="JR Aluminium" style={{ height: 38 }} />
          <div className="mt-1.5" style={{ fontSize: 12, lineHeight: 1.5 }}>
            <span className="font-semibold" style={{ color: "#1f2937" }}>{COMPANY.nameFull}</span> ({COMPANY.branch})<br />
            {COMPANY.address}<br />
            เลขประจำตัวผู้เสียภาษี {COMPANY.taxId}<br />
            โทร. {COMPANY.phone}<br />
            {COMPANY.website}
          </div>
          <PrintCustomerBlock c={c} color={docColor} />
        </div>

        {/* ขวา: ชื่อเอกสาร + ต้นฉบับ + ข้อมูลเอกสาร + ผู้ติดต่อ */}
        <div className="text-right" style={{ minWidth: "40%" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: docColor, lineHeight: 1.1 }}>{docTitle}</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>{copyLabel}</div>
          <div style={{ borderTop: `1px solid ${docColor}33`, paddingTop: 8 }}>
            <LabelTable rows={infoRows} />
          </div>
          {contacts.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <LabelTable rows={contacts} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
