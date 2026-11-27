/**
 * ออก Excel รายงานภาษีซื้อ — หน้าตาเดียวกับชีต "ซื้อ" + "สรุป" ที่ธุรการใช้ (ฝั่ง server เท่านั้น)
 * ตัวคิดรายงานอยู่ purchase-tax.ts
 *
 * ⚠ ตำแหน่งคอลัมน์ต้องตรงกับไฟล์เดิมของธุรการ: A–I ตัวเลข · J เว้น · K วิธีชำระ · L หมายเหตุ
 *   (parseOldPurchaseFile อ่านวิธีชำระจากคอลัมน์ K — ไฟล์ที่ระบบออกต้องนำกลับเข้ามาได้เหมือนไฟล์เดิม)
 */
import { S, type Row, type SheetSpec } from "./floor-calc/xlsx-write.ts";
import { THAI_MONTH, monthRange, thaiDate } from "./sales-tax-report.ts";
import type { PurchaseReport, PurchaseView } from "./purchase-tax.ts";

export function buildPurchaseSheets(rep: PurchaseReport, company: { name: string; taxId: string; branch: string }): SheetSpec[] {
  const { y, m0 } = monthRange(rep.month);
  const t = (v: string | number, s: number = S.td): Row[number] => ({ v, s });
  const head = ["ลำดับที่", "เลขที่เอกสาร", "วัน/เดือน/ปี", "ชื่อผู้ประกอบการ", "เลขที่ผู้เสียภาษี", "สาขา", "ยอดซื้อ", "ภาษี มูลค่าเพิ่ม", "รวม", "", "วิธีชำระ", "หมายเหตุ"];
  const widths = [8, 20, 13, 44, 18, 9, 15, 14, 15, 3, 16, 30];
  const draft = rep.totals.unchecked > 0;
  const line = (r: PurchaseView, i: number, last: string): Row => [
    t(i + 1, S.tdC), t(r.code), t(r.date ? thaiDate(r.date) : "", S.tdC), t(r.name), t(r.tax_id || "0", S.tdC), t(r.branch, S.tdC),
    t(r.base, S.num), t(r.vat, S.num), t(r.total, S.num), t(""), t(r.pay_label, S.tdC), t(last),
  ];
  const rows: Row[] = [
    [{ v: draft ? `รายงานภาษี ซื้อ (ฉบับร่าง — ยังไม่ได้ตรวจกับบิลจริง ${rep.totals.unchecked} ใบ)` : "รายงานภาษี ซื้อ", s: S.title }],
    [{ v: "ชื่อบริษัท" }, { v: "" }, { v: company.name }, { v: "" }, { v: "" }, { v: "" }, { v: "ปี" }, { v: y + 543 }],
    [{ v: "เลขที่ประจำตัวผู้เสียภาษี" }, { v: "" }, { v: company.taxId }, { v: "" }, { v: company.branch }, { v: "" }, { v: "เดือน" }, { v: THAI_MONTH[m0] }],
    head.map((h) => ({ v: h, s: S.th })),
  ];
  // ใบที่ยังไม่มีคนตรวจต้องเห็นชัดในไฟล์ — กันเอาตัวเลขที่ AI อ่านไปยื่นโดยไม่ได้เทียบกระดาษ
  rep.rows.forEach((r, i) => rows.push(line(r, i, [r.checked ? "" : "ยังไม่ได้ตรวจกับบิลจริง", r.kind === "debit" ? "ใบเพิ่มหนี้" : "", r.note].filter(Boolean).join(" · "))));
  rows.push([
    t(""), t(""), t(""), t("รวมทั้งสิ้น", S.totalLbl), t(""), t(""),
    t(rep.totals.base, S.totalNum), t(rep.totals.vat, S.totalNum), t(rep.totals.total, S.totalNum), t(""), t(""), t(draft ? `ยังไม่ได้ตรวจ ${rep.totals.unchecked} ใบ` : ""),
  ]);

  const sum: Row[] = [
    [{ v: `สรุปยอดซื้อมี VAT เดือน ${THAI_MONTH[m0]} ${y + 543}${draft ? " (ฉบับร่าง)" : ""}`, s: S.sub }],
    ["วิธีชำระ", "จำนวนใบ", "ยอดก่อน VAT", "ภาษีซื้อ", "รวม"].map((h) => ({ v: h, s: S.th })),
    ...rep.byPay.map((p): Row => [t(p.label), t(p.count, S.tdC), t(p.base, S.num), t(p.vat, S.num), t(p.total, S.num)]),
    [t("ยอดทั้งหมด (ใช้ภาษีซื้อ)", S.totalLbl), t(rep.totals.count, S.tdC), t(rep.totals.base, S.totalNum), t(rep.totals.vat, S.totalNum), t(rep.totals.total, S.totalNum)],
    ...(rep.noClaim.length ? [[
      t("ไม่ใช้ภาษีซื้อ (ไม่รวมในยอดข้างบน)"), t(rep.noClaim.length, S.tdC),
      t(rep.noClaim.reduce((s, r) => s + r.base, 0), S.num), t(rep.noClaim.reduce((s, r) => s + r.vat, 0), S.num), t(rep.noClaim.reduce((s, r) => s + r.total, 0), S.num),
    ] as Row] : []),
  ];
  const sheets: SheetSpec[] = [
    { name: "ซื้อ", rows, widths, merges: ["A1:L1"], heights: { 1: 26 } },
    { name: "สรุป", rows: sum, widths: [34, 12, 18, 16, 18], merges: ["A1:E1"] },
  ];
  if (rep.noClaim.length) {
    const nc: Row[] = [
      [{ v: "บิลที่ไม่ใช้ภาษีซื้อ — ไม่นับในรายงาน เก็บไว้ให้เห็นว่ามีบิลนี้และเหตุผล", s: S.sub }],
      [...head.slice(0, 11), "เหตุผลที่ไม่ใช้"].map((h) => ({ v: h, s: S.th })),
      ...rep.noClaim.map((r, i) => line(r, i, r.no_claim ?? "")),
    ];
    sheets.push({ name: "ไม่ใช้ภาษีซื้อ", rows: nc, widths, merges: ["A1:L1"] });
  }
  return sheets;
}
