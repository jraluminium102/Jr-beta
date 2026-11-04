import type { ReactNode } from "react";
import { COMPANY } from "@/app/(app)/quotations/[id]/print/quote-constants";
import { COMPANY_EN, branchLabel, docText, type DocLang } from "@/lib/doc-lang";

// หัวเอกสารพิมพ์กลาง — ดีไซน์แนว FlowAccount (สามเหลี่ยมมุม + label สีตามเอกสาร + บล็อกผู้ติดต่อ)
// ใช้ร่วม ใบเสนอราคา/ใบวางบิล/ใบเสร็จ — ฟอร์มเดียวกันทุกใบ
type InfoRow = { label: string; value: ReactNode };
export type CustomerSnapshot = {
  name?: string;
  job?: string;
  address?: string;
  postal_code?: string;  // (0077) รหัสไปรษณีย์ — ต่อท้ายที่อยู่บนหัวเอกสาร
  tax_id?: string;
  branch?: string;   // (0069) สำนักงานใหญ่/สาขาที่ NNNNN — โชว์เฉพาะนิติบุคคล
  kind?: string;     // INDIVIDUAL | COMPANY
  line_id?: string;          // ชื่อ/handle ที่ใช้ติดต่อ (ชื่อคอลัมน์เก่า — ไม่ได้แปลว่าเป็น LINE เสมอ)
  contact_channel?: string;  // (0122) LINE | FB | IG | OTHER — หัวเอกสารพิมพ์ป้ายตามช่องนี้
  contact_person?: string;
  phone?: string;
};

/**
 * ป้ายช่องทางติดต่อที่พิมพ์ลงเอกสาร
 *
 * ⚠ เดิม hardcode "LINE:" ตายตัว → หน้าจัดคิวเลือก FB แต่เอกสารยังขึ้น LINE
 *   (บั๊กที่เจ้าของแจ้ง 6 ส.ค.2569) · ไม่มีค่า = ถือว่า LINE เหมือนเดิม (ใบเก่าไม่เปลี่ยนหน้าตา)
 */
export const CONTACT_CHANNEL_LABEL: Record<string, string> = {
  LINE: "LINE", FB: "Facebook", FACEBOOK: "Facebook", IG: "Instagram", INSTAGRAM: "Instagram", OTHER: "ติดต่อ",
};
export const channelLabel = (ch?: string | null, lang: DocLang = "th") => {
  const key = String(ch ?? "").trim().toUpperCase();
  if (key === "OTHER") return docText(lang).contactOther;
  return CONTACT_CHANNEL_LABEL[key] ?? "LINE";
};

// สกินพิมพ์ "ละมุน" (เจ้าของเลือก 5 ส.ค.2569) — โทนโรสมนนุ่ม อ่านชัด
// ⭐ ตำแหน่ง/เลย์เอาท์ตัวหนังสือคงเดิมทุกจุด เปลี่ยนเฉพาะสี/เส้น/พื้นหลัง (ห้ามย้ายตำแหน่ง)
export const PRINT_THEME = {
  rose: "#a8425a",      // สีหลัก — ชื่อเอกสาร/ป้ายลูกค้า/หัวคอลัมน์/ยอดรวม
  blush: "#faedf0",     // พื้นแถบหัวคอลัมน์
  blushSoft: "#fdf3f5", // พื้นบล็อกลูกค้า/หัวข้อชุด
  line: "#f0dde3",      // เส้นขอบตารางรายการ (แทน gray-200)
  lineHead: "#f2dce2",  // เส้นคั่นหัวเอกสาร
  mut: "#6d616a",       // ตัวหนังสือรอง (label) — เข้มพออ่านชัด
} as const;

// สกินน้ำเงินฟ้า — ใบเสร็จ (เจ้าของ 21 ต.ค.69 "ใบเสร็จ อยากเปลี่ยนสีเอกสาร เอาเป็นน้ำเงินฟ้าแบบสวย ๆ")
//   คีย์เดียวกับ PRINT_THEME ทุกตัว → สลับทั้งชุดได้ · ตำแหน่ง/เลย์เอาท์เหมือนเดิมทุกจุด
export type PrintTheme = { [K in keyof typeof PRINT_THEME]: string } & { copy: string };
export const PRINT_THEME_ROSE: PrintTheme = { ...PRINT_THEME, copy: "#b58e99" };
export const PRINT_THEME_BLUE: PrintTheme = {
  rose: "#1f5fa6",      // สีหลัก น้ำเงินฟ้า
  blush: "#e6f0fa",     // พื้นหัวคอลัมน์
  blushSoft: "#f2f7fd", // พื้นบล็อกลูกค้า
  line: "#d5e3f2",      // เส้นตาราง
  lineHead: "#d3e2f3",  // เส้นคั่นหัวเอกสาร
  mut: "#5c6a7b",       // ตัวหนังสือรอง
  copy: "#7f9dc2",      // ป้าย ต้นฉบับ/สำเนา
};

// สีหัวเอกสาร — ใบเสนอ/ใบวางบิล/ใบรับประกัน โรสละมุน · ใบเสร็จ น้ำเงินฟ้า
const BRAND = PRINT_THEME.rose;
export const DOC_COLORS = {
  quotation: BRAND,
  billing: BRAND,
  receipt: PRINT_THEME_BLUE.rose,
  warranty: BRAND,
} as const;

/** เช็คความครบของข้อมูลผู้ซื้อสำหรับใบกำกับภาษีเต็มรูป (ม.86/4) — เลขภาษีรับเลขบัตร ปชช.13 หลักได้ */
export function taxInvoiceMissing(c: CustomerSnapshot): string[] {
  const miss: string[] = [];
  if (!c.tax_id || c.tax_id.replace(/\D/g, "").length < 13) miss.push("เลขประจำตัวผู้เสียภาษี/บัตรประชาชน (13 หลัก) ของผู้ซื้อ");
  if (!c.address) miss.push("ที่อยู่ผู้ซื้อ");
  // นิติบุคคล (ม.86/4) ต้องระบุ "สำนักงานใหญ่/สาขาที่ ###" ของผู้ซื้อด้วย — ไม่งั้นผู้ซื้อเครดิตภาษีซื้ออาจถูกทัก
  if (c.kind === "COMPANY" && !c.branch) miss.push("สำนักงานใหญ่/สาขา ของผู้ซื้อ (นิติบุคคล)");
  return miss;
}

// บล็อกข้อมูลลูกค้า/ผู้ซื้อ — โชว์ (สำนักงานใหญ่/สาขา) เฉพาะนิติบุคคล
// สกินละมุน: การ์ดชมพูนวลมีแถบโรสซ้าย (ตำแหน่ง/เนื้อหาเดิม แต่งกรอบอย่างเดียว)
export function PrintCustomerBlock({ c, color, theme = PRINT_THEME_ROSE, lang = "th" }: { c: CustomerSnapshot; color?: string; theme?: PrintTheme; lang?: DocLang }) {
  const t = docText(lang);
  return (
    <div style={{ fontSize: 13, marginTop: 14, borderLeft: `3px solid ${color ?? theme.rose}`, background: theme.blushSoft, borderRadius: "0 12px 12px 0", padding: "10px 16px" }}>
      <span className="font-bold" style={{ color: color ?? theme.rose }}>{t.customer}</span>
      {/* word-break: keep-all → ตัดบรรทัดเฉพาะช่องว่าง คำไทย (กรุงเทพมหานคร / (สำนักงานใหญ่) / ชื่อเขต-แขวง) ไม่ถูกตัดกลางคำ */}
      <div className="mt-0.5" style={{ lineHeight: 1.55, wordBreak: "keep-all" }}>
        <div className="font-semibold" style={{ color: "#1f2937" }}>
          {c.name || "—"}
          {c.kind === "COMPANY" && c.branch ? <span style={{ fontWeight: 400 }}> ({branchLabel(c.branch, lang)})</span> : null}
        </div>
        {c.address && <div style={{ color: "#374151" }}>{c.address}{c.postal_code ? ` ${c.postal_code}` : ""}</div>}
        {c.tax_id && <div style={{ color: "#374151" }}>{t.taxId} {c.tax_id}</div>}
        {c.job && <div style={{ color: "#6b7280", fontSize: 12 }}>{t.job}: {c.job}</div>}
      </div>
    </div>
  );
}

export function PrintLetterhead({
  docTitle,
  docColor = PRINT_THEME.rose,
  copyLabel = "ต้นฉบับ",
  pageNo = 1,
  infoRows,
  contactRows,
  customer,
  hideCustomer = false,
  theme = PRINT_THEME_ROSE,
  lang = "th",
}: {
  docTitle: string;
  docColor?: string;
  copyLabel?: string;
  pageNo?: number;
  infoRows: InfoRow[];
  contactRows?: InfoRow[];
  customer: CustomerSnapshot;
  /**
   * ไม่ต้องใส่บล็อกลูกค้าในหัวบิล — ผู้เรียกจะวาง <PrintCustomerBlock> เองข้างล่าง
   *
   * ใช้กับเอกสารที่ยาวข้ามหน้าได้ (ใบเสนอราคา): หัวบิลต้องพิมพ์ซ้ำทุกหน้าผ่าน <thead>
   * แต่ Chrome ยอมพิมพ์ thead ซ้ำ "เฉพาะหัวที่สูงไม่เกิน 25% ของหน้า (~74mm บน A4)"
   * — วัดจริงแล้วหัวเต็ม (มีบล็อกลูกค้า) = 76mm → เกิน → หัวหายตั้งแต่หน้า 2
   * ตัดบล็อกลูกค้าออกเหลือ ~40mm จึงซ้ำได้ · บล็อกลูกค้าไปอยู่หน้าแรกหน้าเดียวพอ
   * (ดู scripts/verify-quote-print.mjs — วัดเพดานนี้ไว้แล้ว)
   */
  hideCustomer?: boolean;
  /** ชุดสีเอกสาร (ตั้งต้น โรสละมุน · ใบเสร็จ = PRINT_THEME_BLUE) */
  theme?: PrintTheme;
  /** ภาษาของป้ายในหัวเอกสาร + บล็อกบริษัท (en = ใบเสนอราคาภาษาอังกฤษ) */
  lang?: DocLang;
}) {
  const c = customer;
  const t = docText(lang);
  const co = lang === "en"
    ? { nameFull: COMPANY_EN.nameFull, branch: COMPANY_EN.branch, address: COMPANY_EN.address }
    : { nameFull: COMPANY.nameFull, branch: COMPANY.branch, address: COMPANY.address };
  // แถวผู้ติดต่อ — โชว์แพลตฟอร์มที่คุย (LINE) + ชื่อ · แล้วเบอร์โทร
  const who = c.contact_person || "";
  const contacts: InfoRow[] = contactRows ?? [
    ...(c.line_id
      ? [{ label: t.contact, value: (who ? who + " · " : "") + channelLabel(c.contact_channel, lang) + ": " + c.line_id }]
      : who ? [{ label: t.contact, value: who }] : []),
    ...(c.phone ? [{ label: t.phone, value: c.phone }] : []),
  ];
  void pageNo;
  const LabelTable = ({ rows }: { rows: InfoRow[] }) => (
    <table style={{ fontSize: 12, marginLeft: "auto", borderCollapse: "collapse" }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ color: theme.mut, textAlign: "right", paddingRight: 14, paddingTop: 2, paddingBottom: 2, whiteSpace: "nowrap", verticalAlign: "top" }}>{r.label}</td>
            <td style={{ color: "#1f2937", textAlign: "left", paddingTop: 2, paddingBottom: 2 }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    // สกินละมุน: เส้นคั่นชมพูนวลใต้หัวเอกสาร (สูงขึ้น ~3mm — thead รวมยังต่ำกว่าเพดาน 74.25mm ที่ Chrome ยอมซ้ำ)
    <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${theme.lineHead}` }}>
      <div className="flex justify-between items-start" style={{ gap: 24 }}>
        {/* ซ้าย: โลโก้ + บริษัท + ลูกค้า */}
        <div style={{ flex: 1, maxWidth: "56%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jr-logo.png" alt="JR Aluminium" style={{ height: 38 }} />
          <div className="mt-1.5" style={{ fontSize: 12, lineHeight: 1.5 }}>
            <span className="font-semibold" style={{ color: "#1f2937" }}>{co.nameFull}</span> ({co.branch})<br />
            {co.address}<br />
            {t.taxId} {COMPANY.taxId}<br />
            {t.tel} {COMPANY.phone}<br />
            {COMPANY.website}
          </div>
          {!hideCustomer && <PrintCustomerBlock c={c} color={docColor} theme={theme} lang={lang} />}
        </div>

        {/* ขวา: ชื่อเอกสาร + ต้นฉบับ + ข้อมูลเอกสาร + ผู้ติดต่อ */}
        <div className="text-right" style={{ minWidth: "40%" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: docColor, lineHeight: 1.1 }}>{docTitle}</div>
          <div style={{ fontSize: 12, color: theme.copy, marginBottom: 8 }}>{copyLabel}</div>
          <div style={{ borderTop: `1px solid ${theme.lineHead}`, paddingTop: 8 }}>
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
