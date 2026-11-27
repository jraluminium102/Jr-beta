/**
 * ออก Excel รายงานภาษีขาย — หน้าตาเดียวกับชีต "ขาย" ที่ธุรการใช้ยื่น (ฝั่ง server เท่านั้น · ใช้ node:zlib ผ่าน xlsx-write)
 * ตัวคิดรายงานอยู่ sales-tax-report.ts
 */
import { S, type Row, type SheetSpec } from "./floor-calc/xlsx-write.ts";
import { THAI_MONTH, monthRange, thaiDate, type TaxReport, type TaxRow } from "./sales-tax-report.ts";

const money2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildSalesSheets(rep: TaxReport, company: { name: string; taxId: string; branch: string }): SheetSpec[] {
  const { y, m0 } = monthRange(rep.month);
  const t = (v: string | number, s: number = S.td): Row[number] => ({ v, s });
  const head = ["ลำดับที่", "เลขที่เอกสาร", "วัน/เดือน/ปี", "ชื่อผู้ประกอบการ", "เลขที่ผู้เสียภาษี", "สาขา", "ยอดขาย", "ภาษี มูลค่าเพิ่ม", "รวม", "หมายเหตุ"];
  const widths = [8, 20, 13, 44, 18, 9, 15, 14, 15, 22];

  const rows: Row[] = [
    [{ v: "รายงานภาษี ขาย", s: S.title }],
    [{ v: "ชื่อบริษัท" }, { v: "" }, { v: company.name }, { v: "" }, { v: "" }, { v: "" }, { v: "ปี" }, { v: y + 543 }],
    [{ v: "เลขที่ประจำตัวผู้เสียภาษี" }, { v: "" }, { v: company.taxId }, { v: "" }, { v: company.branch }, { v: "" }, { v: "เดือน" }, { v: THAI_MONTH[m0] }],
    head.map((h) => ({ v: h, s: S.th })),
  ];
  rep.rows.forEach((r, i) => rows.push([
    t(i + 1, S.tdC), t(r.code), t(thaiDate(r.date), S.tdC), t(r.name), t(r.tax_id || "0", S.tdC), t(r.branch, S.tdC),
    t(r.base, S.num), t(r.vat, S.num), t(r.total, S.num), t(r.note),
  ]));
  rows.push([
    t(""), t(""), t(""), t("รวมทั้งหมด", S.totalLbl), t(""), t(""),
    t(rep.totals.base, S.totalNum), t(rep.totals.vat, S.totalNum), t(rep.totals.total, S.totalNum), t(""),
  ]);

  const sheets: SheetSpec[] = [{ name: "ขาย", rows, widths, merges: ["A1:J1"], heights: { 1: 26 } }];

  const side = (name: string, title: string, list: (TaxRow & { twin?: string })[], lastHead: string) => {
    const rs: Row[] = [
      [{ v: title, s: S.sub }],
      [...head.slice(0, 9), lastHead].map((h) => ({ v: h, s: S.th })),
    ];
    list.forEach((r, i) => rs.push([
      t(i + 1, S.tdC), t(r.code), t(thaiDate(r.date), S.tdC), t(r.name), t(r.tax_id || "0", S.tdC), t(r.branch, S.tdC),
      t(r.base, S.num), t(r.vat, S.num), t(r.total, S.num), t(r.twin ?? r.note),
    ]));
    sheets.push({ name, rows: rs, widths, merges: ["A1:J1"] });
  };
  if (rep.skipped.length) side("ไม่นับ (ซ้ำ)", "ใบที่ไม่นับในรายงาน เพราะเป็นเงินก้อนเดียวกับอีกใบ",
    rep.skipped.map((r) => ({ ...r, twin: `${r.twin} (${money2(r.twinTotal)})` })), "ซ้ำกับเลขที่ (ยอดรวม)");
  if (rep.noVat.length) side("ไม่มี VAT", "ใบเสร็จในระบบที่ไม่มี VAT — ไม่ใช่ใบกำกับภาษี ไม่เข้ารายงานภาษีขาย", rep.noVat, "หมายเหตุ");
  return sheets;
}
