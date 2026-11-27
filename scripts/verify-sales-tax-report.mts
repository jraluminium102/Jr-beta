/**
 * verify-sales-tax-report — เทสตัวคิดรายงานภาษีขาย (src/lib/sales-tax-report.ts) ด้วยข้อมูลสมมติ
 *   รัน: node --experimental-strip-types scripts/verify-sales-tax-report.mts
 * ต้องผ่านทุกข้อก่อนแก้ไฟล์นั้น — ตัวเลขในรายงานนี้เอาไปยื่นภาษีจริง
 */
import { readXlsx } from "../src/lib/floor-calc/xlsx-read.ts";
import { writeXlsx, type Row } from "../src/lib/floor-calc/xlsx-write.ts";
import * as T from "../src/lib/sales-tax-report.ts";
import { buildSalesSheets } from "../src/lib/sales-tax-report-xlsx.ts";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`✗ ${name}\n    ได้    ${JSON.stringify(got)}\n    ต้องได้ ${JSON.stringify(want)}`); }
};
const rc = (no: number, date: string, name: string, base: number, o: Record<string, unknown> = {}) => {
  const vat = o.vat_amt != null ? Number(o.vat_amt) : T.round2(base * 0.07);
  return { id: no, code: `INV25691000${String(no).padStart(2, "0")}`, issue_date: date, customer_snapshot: { name, tax_id: "", branch: "สำนักงานใหญ่" },
    amount: T.round2(base + vat), vat_amt: vat, base_amt: base as number | null, is_voided: false, ...o };
};
const ex = (id: string, code: string, date: string, name: string, base: number, o: Partial<T.ExtraRow> = {}): T.ExtraRow =>
  ({ id, code, date, name, tax_id: "", branch: "", base, vat: T.round2(base * 0.07), note: "", ...o });

// ── 1) ฐานภาษี ──
eq("ฐาน = base_amt เมื่อมี", T.receiptToRow(rc(1, "2026-10-01", "ก", 1000)).base, 1000);
eq("ใบมีหัก ณ ที่จ่าย: ฐานไม่ขาด (amount เป็นเงินรับจริง)", T.receiptToRow({ ...rc(1, "2026-10-01", "ก", 10000), amount: 10400 }).base, 10000);
eq("ใบเก่าไม่มี base_amt: amount − vat", T.receiptToRow({ ...rc(1, "2026-10-01", "ก", 1000), base_amt: null, amount: 1070 }).base, 1000);
eq("รวม = ฐาน + VAT", T.receiptToRow(rc(1, "2026-10-01", "ก", 1869.16)).total, 2000);

// ── 2) เลขผู้เสียภาษี / สาขา ──
eq("ไม่มีเลข → สาขา -", T.reportBranch("", "สำนักงานใหญ่"), "-");
eq("สำนักงานใหญ่ → สนญ.", T.reportBranch("0105555092627", "สำนักงานใหญ่"), "สนญ.");
eq("สาขาที่ 4 → 00004", T.reportBranch("0105534050071", "สาขาที่ 00004"), "00004");
eq("เลข 0 = ไม่มี", T.cleanTaxId("0"), "");
eq("เลขมีขีด", T.cleanTaxId("0-1055-55092-62-7"), "0105555092627");

// ── 3) รวมรายงาน ──
const receipts = [
  rc(1, "2026-10-02", "ห้างหุ้นส่วนจำกัด นนท์ธารา", 26600),
  rc(2, "2026-10-05", "คุณสิทธิชล", 11200),
  rc(3, "2026-10-06", "คุณเอ", 5000, { vat_amt: 0, amount: 5000 }),     // ไม่มี VAT
  rc(4, "2026-10-07", "คุณบี", 9000, { is_voided: true }),               // ยกเลิก
  rc(5, "2026-10-08", "คุณแอน", 44000),
  rc(6, "2026-10-09", "คุณซี", 1869.16),
];
const extra: T.TaxExtra = { rows: [
  ex("a", "INV2026100006", "2026-10-02", "ห้างหุ้นส่วนจำกัด นนท์ธารา", 26600),
  ex("b", "INV2026100013", "2026-10-05", "คุณสิทธิชล  จินตรุ่งเรืองชัย", 11200),
  ex("c", "INV2026100060", "2026-10-08", "คุณรักรัตน์ พรเจริญ", 44000),   // ชื่อไม่ตรง วันตรง
  ex("d", "INV2026100020", "2026-10-20", "คุณดี", 1869.16),               // ยอดเท่าใบ 6 แต่คนละคน คนละวัน
  ex("e", "INV2026100033", "2026-10-10", "ยกเลิก", 0, { voided: true, vat: 0 }),
], skip: {} };
let rep = T.buildReport("2026-10", receipts, extra);
eq("นับ: ระบบ 4 (มี VAT ไม่ยกเลิก) + FlowAccount 4", rep.totals.count, 8);
eq("ไม่มี VAT แยกออก", rep.noVat.map((r) => r.code), ["INV2569100003"]);
eq("ใบยกเลิกอยู่ในรายงาน ยอด 0", rep.rows.filter((r) => r.voided).map((r) => [r.code, r.base, r.total]), [["INV2569100004", 0, 0], ["INV2026100033", 0, 0]]);
eq("เรียงวันที่แล้วเลขที่", rep.rows.slice(0, 2).map((r) => r.code), ["INV2026100006", "INV2569100001"]);
eq("คู่ซ้ำ: 3 คู่ (ไม่จับใบ 2,000 คนละคนคนละวัน)", rep.pairs.map((p) => [p.system, p.extra, p.sure]),
  [["s:INV2569100001", "x:a", true], ["s:INV2569100002", "x:b", true], ["s:INV2569100005", "x:c", false]]);
const before = rep.totals.base;

extra.skip = { "s:INV2569100001": "x:a", "x:b": "s:INV2569100002" };
rep = T.buildReport("2026-10", receipts, extra);
eq("ตัดซ้ำ 2 คู่ → เหลือ 6 ใบ", rep.totals.count, 6);
eq("ยอดลดเท่าใบที่ตัด", T.round2(before - rep.totals.base), 37800);
eq("รายการไม่นับ บอกคู่", rep.skipped.map((r) => [r.code, r.twin]), [["INV2569100001", "INV2026100006"], ["INV2026100013", "INV2569100002"]]);
eq("คู่ที่ตั้งแล้วไม่ถูกเสนอซ้ำ", rep.pairs.length, 1);
eq("ยอดรวม = ผลบวกแถว", rep.totals.total, T.round2(rep.rows.reduce((s, r) => s + r.total, 0)));

// คู่หาย (ใบ FlowAccount ถูกลบ) → ใบในระบบต้องกลับมานับเอง ห้ามหายเงียบ
rep = T.buildReport("2026-10", receipts, { rows: extra.rows.filter((r) => r.id !== "a"), skip: extra.skip });
eq("คู่ถูกลบ → ใบกลับมานับ", rep.rows.some((r) => r.code === "INV2569100001"), true);
// คู่ถูกยกเลิก → เหมือนกัน
rep = T.buildReport("2026-10", receipts.map((r) => (r.id === 2 ? { ...r, is_voided: true } : r)), extra);
eq("ใบที่นับแทนถูกยกเลิก → ใบที่เคยไม่นับกลับมา", rep.rows.some((r) => r.code === "INV2026100013" && !r.voided), true);
// skip ชี้กันเป็นวง → ไม่มีใบไหนหาย
rep = T.buildReport("2026-10", receipts, { rows: extra.rows, skip: { "s:INV2569100001": "x:a", "x:a": "s:INV2569100001" } });
eq("ชี้กันเป็นวง → นับทั้งคู่ (ไม่หาย)", rep.rows.filter((r) => r.code === "INV2569100001" || r.code === "INV2026100006").length, 2);

// ── 4) วันที่ในไฟล์ ──
eq("31/10/2569", T.parseFileDate("31/10/2569"), "2026-10-31");
eq("1/10/2026", T.parseFileDate("1/10/2026"), "2026-10-01");
eq("เลขวัน Excel ปี พ.ศ. (244623)", T.parseFileDate("244623"), "2026-10-01");
eq("เลขวัน Excel ค.ศ. (46296)", T.parseFileDate("46296"), "2026-10-01");
eq("31/02 ไม่มีจริง", T.parseFileDate("31/02/2026"), null);
eq("ข้อความ", T.parseFileDate("ยกเลิก"), null);

// ── 5) อ่านไฟล์ — หัวแบบไฟล์ที่พิมพ์เอง และแบบ FlowAccount ──
const c = (v: string | number) => ({ v });
const hand: Row[] = [
  [c("รายงานภาษี ขาย")], [c("ชื่อบริษัท")], [c("เลขที่ประจำตัวผู้เสียภาษี")],
  ["ลำดับที่", "เลขที่เอกสาร", "วัน/เดือน/ปี", "ชื่อผู้ประกอบการ", "เลขที่ผู้เสียภาษี", "สาขา", "ยอดขาย", "ภาษี มูลค่าเพิ่ม", "รวม"].map(c),
  [c(1), c(" INV2026100001"), c(244623), c("คุณหนึ่ง"), c(0), c("-"), c(1869.16), c(130.8412), c(2000.0012)],
  [c(2), c("INV2026100002"), c(244624), c("บริษัท สอง จำกัด"), c("105555092627"), c("สนญ."), c(47600), c(3332.0000000000005), c(50932)],
  [c(3), c("INV2026100003"), c(""), c("ยกเลิก"), c(""), c(""), c(""), c(0), c(0)],
  [c(4), c("INV2026100004"), c(244258), c("คุณข้ามปี"), c(0), c("-"), c(1000), c(70), c(1070)],
  [c(""), c(""), c(""), c("รวมทั้งหมด"), c(""), c(""), c(50469.16), c(3462.84), c(53932)],
];
const buy: Row[] = [hand[3], [c(1), c("RVV26-07-009"), c(244623), c("บริษัท ร้านค้า จำกัด"), c("105567195612"), c("สนญ."), c(10974.3), c(768.2), c(11742.5)]];
let imp = T.parseSalesImport(readXlsx(writeXlsx([{ name: "ซื้อ", rows: buy }, { name: "ขาย", rows: hand }])), "2026-10");
eq("เลือกชีตขาย ไม่ใช่ชีตซื้อ", imp.sheet, "ขาย");
eq("ไฟล์พิมพ์เอง: 3 ใบ (รวมใบยกเลิก)", imp.rows.map((r) => [r.code, r.date, r.base, r.vat, !!r.voided]),
  [["INV2026100001", "2026-10-01", 1869.16, 130.84, false], ["INV2026100002", "2026-10-02", 47600, 3332, false], ["INV2026100003", "2026-10-02", 0, 0, true]]);
eq("เลขผู้เสียภาษี 12 หลักในไฟล์ (Excel ตัด 0 หน้า) เก็บตามไฟล์", imp.rows[1].tax_id, "105555092627");
eq("ใบวันที่ข้ามเดือน: ไม่นำเข้า + แจ้ง", [imp.otherMonth, imp.problems.length, /INV2026100004/.test(imp.problems[0] ?? "")], [1, 1, true]);

const fa: Row[] = [
  [c("รายงานเอกสาร")], [c("")], [c("")], [c("")], [c("")],
  ["ลำดับ", "เลขที่เอกสาร", "วัน/เดือน/ปี", "ชื่อลูกค้า", "ชื่อโปรเจ็ค", "เลขผู้เสียภาษี", "สนง./สาขา", "มูลค่า", "VAT", "ยอดรวมสุทธิ", "สกุลเงิน", "สถานะ"].map(c),
  [c(1), c("INV2026100001"), c("01/10/2026"), c("คุณหนึ่ง"), c(""), c(""), c(""), c("1,869.16"), c("130.84"), c("2,000.00"), c("THB"), c("เก็บเงินแล้ว")],
  [c(2), c("INV2026100002"), c("02/10/2026"), c("บริษัท สอง จำกัด"), c("งาน"), c("0105555092627"), c("สำนักงานใหญ่"), c("47,600.00"), c("3,332.00"), c("50,932.00"), c("THB"), c("เก็บเงินแล้ว")],
  [c(3), c("INV2026100003"), c("03/10/2026"), c("คุณสาม"), c(""), c(""), c(""), c("500.00"), c("35.00"), c("535.00"), c("THB"), c("ยกเลิก")],
  [c(4), c("INV2026100005"), c("04/10/2026"), c("คุณไม่มีแวต"), c(""), c(""), c(""), c("500.00"), c("0.00"), c("500.00"), c("THB"), c("เก็บเงินแล้ว")],
];
imp = T.parseSalesImport(readXlsx(writeXlsx([{ name: "Sheet1", rows: fa }])), "2026-10");
eq("ไฟล์ FlowAccount: หัวแถว 6 · มูลค่า ≠ ภาษีมูลค่าเพิ่ม", imp.rows.map((r) => [r.code, r.date, r.base, r.vat, !!r.voided]),
  [["INV2026100001", "2026-10-01", 1869.16, 130.84, false], ["INV2026100002", "2026-10-02", 47600, 3332, false], ["INV2026100003", "2026-10-03", 0, 0, true]]);
eq("ใบไม่มี VAT ไม่นำเข้า + แจ้ง", imp.problems.some((p) => /INV2026100005/.test(p) && /ไม่มี VAT/.test(p)), true);
let threw = "";
try { T.parseSalesImport(readXlsx(writeXlsx([{ name: "x", rows: [[c("อะไรก็ไม่รู้")]] }])), "2026-10"); } catch (e) { threw = (e as Error).message; }
eq("ไฟล์ไม่มีตาราง → แจ้งชัด", /ไม่พบตาราง/.test(threw), true);

// ── 5.1) เคสจากผลตรวจ 27 พ.ย.69 (ตัวตรวจบัญชี + ตัวทดสอบ) ──
const H = (...h: string[]) => h.map(c);
const one = (head: Row, row: Row, name = "Sheet1") => T.parseSalesImport(readXlsx(writeXlsx([{ name, rows: [head, row] }])), "2026-10");
// "มูลค่ารวม" = ยอดรวม ไม่ใช่ฐาน
imp = one(H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "มูลค่ารวม", "ภาษีมูลค่าเพิ่ม"), [c("A1"), c("01/10/2026"), c("ก"), c("107,000.00"), c("7,000.00")]);
eq("มูลค่ารวม ไม่ถูกอ่านเป็นฐาน", [imp.rows[0]?.base, imp.rows[0]?.vat], [100000, 7000]);
// ไฟล์มีแค่ยอดรวม → ถอดเอง
imp = one(H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "รวม"), [c("A1"), c("01/10/2026"), c("ก"), c(2140)]);
eq("มีแค่ยอดรวม → ถอดฐาน/VAT", [imp.rows[0]?.base, imp.rows[0]?.vat], [2000, 140]);
imp = one(H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "ยอดขาย", "รวม"), [c("A1"), c("01/10/2026"), c("ก"), c(2000), c(2140)]);
eq("มีฐาน+รวม ไม่มี VAT → VAT = รวม − ฐาน", imp.rows[0]?.vat, 140);
imp = one(H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "ยอดขาย", "ภาษีมูลค่าเพิ่ม", "รวม"), [c("A1"), c("01/10/2026"), c("ก"), c(""), c(140), c(2140)]);
eq("ช่องฐานว่าง → รวม − VAT", imp.rows[0]?.base, 2000);
// ตัวเลขน่าสงสัย = นำเข้า + เตือน
imp = one(H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "ยอดขาย", "ภาษีมูลค่าเพิ่ม", "รวม"), [c("A1"), c("01/10/2026"), c("ก"), c(100), c(7), c(999)]);
eq("ฐาน+VAT ≠ รวม → เตือน", [imp.rows.length, imp.warnings.length], [1, 1]);
imp = one(H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "ยอดขาย", "ภาษีมูลค่าเพิ่ม"), [c("A1"), c("01/10/2026"), c("ก"), c(10000), c(70)]);
eq("VAT ไม่ใช่ 7% → เตือน", [imp.rows.length, imp.warnings.length], [1, 1]);
// ใบลดหนี้
imp = one(H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "ยอดขาย", "ภาษีมูลค่าเพิ่ม", "รวม"), [c("CN1"), c("01/10/2026"), c("ก"), c("(100.00)"), c("(7.00)"), c("(107.00)")]);
eq("ใบลดหนี้ (ยอดในวงเล็บ) นำเข้าเป็นยอดติดลบ", [imp.rows[0]?.base, imp.rows[0]?.vat, imp.rows[0]?.note], [-100, -7, "ใบลดหนี้"]);
// ฉบับร่างไม่นำเข้า
imp = one(H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "มูลค่า", "VAT", "สถานะ"), [c("A1"), c("01/10/2026"), c("ก"), c(100), c(7), c("ร่าง")]);
eq("ฉบับร่างไม่นำเข้า + แจ้ง", [imp.rows.length, imp.problems.length], [0, 1]);
// ชีตขายว่าง → ใช้ชีตถัดไป
imp = T.parseSalesImport(readXlsx(writeXlsx([
  { name: "ขาย", rows: [H("เลขที่เอกสาร", "วันที่", "ยอดขาย")] },
  { name: "ข้อมูล", rows: [H("เลขที่เอกสาร", "วันที่", "ชื่อลูกค้า", "ยอดขาย", "ภาษีมูลค่าเพิ่ม"), [c("A1"), c("01/10/2026"), c("ก"), c(100), c(7)]] },
])), "2026-10");
eq("ชีตขายไม่มีข้อมูล → ลองชีตถัดไป", [imp.sheet, imp.rows.length], ["ข้อมูล", 1]);
// วันที่เพิ่ม
eq("31/10/2026 10:00", T.parseFileDate("31/10/2026 10:00"), "2026-10-31");
eq("31/10/26", T.parseFileDate("31/10/26"), "2026-10-31");
eq("31/10/69 (พ.ศ. ย่อ)", T.parseFileDate("31/10/69"), "2026-10-31");
eq("ช่องว่างไม่ใช่ศูนย์", Number.isNaN(T.fileNum("")), true);
// ชื่อ: ไม่ตัดกลางคำ · คำสามัญไม่นับเป็นชื่อตรง
eq("ไม่ตัด นาง/คุณ กลางคำ", T.nameTokens("บริษัท สมนาง คุณภาพ จำกัด"), ["สมนาง", "คุณภาพ"]);
eq("คุณสมชาย → สมชาย", T.nameTokens("คุณสมชาย ใจดี"), ["สมชาย", "ใจดี"]);
let rp = T.buildReport("2026-10", [rc(1, "2026-10-01", "บริษัท สยาม อลูมิเนียม จำกัด", 2000)], { rows: [ex("z", "FA1", "2026-10-03", "บริษัท เอเชีย อลูมิเนียม จำกัด", 2000)], skip: {} });
eq("คำสามัญตรงกัน → เสนอคู่ได้ แต่ไม่มั่นใจ", rp.pairs.map((p) => p.sure), [false]);
rp = T.buildReport("2026-10", [rc(1, "2026-10-01", "คุณสมชาย ใจดี", 2000)], { rows: [ex("z", "FA1", "2026-10-06", "คุณสมชาย รักดี", 2000)], skip: {} });
eq("ชื่อตัวตรงแต่ห่าง 5 วัน → ไม่มั่นใจ", rp.pairs.map((p) => p.sure), [false]);
// คู่ยอดไม่เท่า: นับใบยอดน้อยกว่าไม่ได้ (ยอดขายหาย) · นับใบยอดมากกว่าได้
const big = rc(1, "2026-10-01", "ก", 100000), small = ex("z", "FA1", "2026-10-01", "ก", 2000);
rp = T.buildReport("2026-10", [big], { rows: [small], skip: { "s:INV2569100001": "x:z" } });
eq("ไม่นับใบ 107,000 เพราะซ้ำกับใบ 2,140 → คู่ไม่มีผล ใบกลับมานับ", [rp.totals.count, rp.skipped.length, Object.keys(rp.skip).length], [2, 0, 0]);
rp = T.buildReport("2026-10", [big], { rows: [small], skip: { "x:z": "s:INV2569100001" } });
eq("ไม่นับใบ 2,140 เพราะซ้ำกับใบ 107,000 → ได้", [rp.totals.count, rp.skipped.map((r) => [r.twin, r.twinTotal])], [1, [["INV2569100001", 107000]]]);
eq("ข้อความบอกเหตุผล", /ยอดขายจะหาย/.test(T.pairProblem(T.receiptToRow(big), T.extraToRow(small)) ?? ""), true);
eq("ต่างไม่เกิน 1 บาท (เศษปัด) ได้", T.pairProblem(T.receiptToRow(rc(1, "2026-10-01", "ก", 201844.62, { vat_amt: 14129.12 })), T.extraToRow(ex("z", "FA", "2026-10-01", "ก", 201843.93, { vat: 14129.07 }))), null);
// คู่กับใบไม่มี VAT ของระบบ → ไม่ได้ (ใบนั้นไม่อยู่ในรายงาน)
eq("นับแทนด้วยใบไม่มี VAT ไม่ได้", T.pairProblem(T.extraToRow(ex("z", "FA", "2026-10-06", "ก", 5000)), T.receiptToRow(rc(3, "2026-10-06", "ก", 5000, { vat_amt: 0, amount: 5000 }))) !== null, true);
// ใบที่นับแทนถูกใช้ 2 คู่ → คู่ที่สองไม่มีผล
rp = T.buildReport("2026-10", [rc(1, "2026-10-01", "ก", 1000), rc(2, "2026-10-01", "ก", 1000)], { rows: [ex("z", "FA1", "2026-10-01", "ก", 1000)], skip: { "s:INV2569100001": "x:z", "s:INV2569100002": "x:z" } });
eq("ใบเดียวนับแทนได้ใบเดียว", [rp.skipped.length, rp.totals.count], [1, 2]);
// ใบลดหนี้ลดยอดรวม · ไม่ถูกเสนอเป็นคู่ซ้ำ
rp = T.buildReport("2026-10", [rc(1, "2026-10-01", "ก", 1000)], { rows: [ex("cn", "CN1", "2026-10-02", "ก", -100, { vat: -7 })], skip: {} });
eq("ใบลดหนี้หักยอดรวม", [rp.totals.base, rp.totals.vat, rp.pairs.length], [900, 63, 0]);
// เลขกระโดด + เลขซ้ำข้ามแหล่ง + ใบ VAT 0 ที่ยกเลิก
rp = T.buildReport("2026-10", [rc(1, "2026-10-01", "ก", 1000), rc(4, "2026-10-02", "ข", 1000), rc(5, "2026-10-02", "ค", 500, { vat_amt: 0, amount: 500, is_voided: true })],
  { rows: [ex("d1", "INV2569100004", "2026-10-02", "ข", 1000)], skip: {} });
eq("เลขกระโดด", rp.gaps, ["INV2569100002", "INV2569100003"]);
eq("เลขที่ตรงกับใบในระบบ → เตือน", rp.sameCode, ["INV2569100004"]);
eq("ใบ VAT 0 ที่ยกเลิก อยู่กลุ่มไม่มี VAT ไม่ขึ้นชีตหลัก", [rp.noVat.length, rp.rows.some((r) => r.code === "INV2569100005")], [1, false]);

// ── 6) ไฟล์ที่ออก อ่านกลับแล้วยอดตรง ──
extra.skip = { "s:INV2569100001": "x:a" };
rep = T.buildReport("2026-10", receipts, extra);
const back = readXlsx(writeXlsx(buildSalesSheets(rep, { name: "บริษัท ทดสอบ จำกัด", taxId: "0100000000000", branch: "สำนักงานใหญ่" })));
eq("ชีต", back.map((s) => s.name), ["ขาย", "ไม่นับ (ซ้ำ)", "ไม่มี VAT"]);
const sale = back[0].rows;
eq("หัวตารางแถว 4", sale[3].slice(0, 9), ["ลำดับที่", "เลขที่เอกสาร", "วัน/เดือน/ปี", "ชื่อผู้ประกอบการ", "เลขที่ผู้เสียภาษี", "สาขา", "ยอดขาย", "ภาษี มูลค่าเพิ่ม", "รวม"]);
eq("จำนวนแถวข้อมูล = ใบในรายงาน", sale.length - 5, rep.rows.length);
eq("แถวรวมท้ายตาราง", sale[sale.length - 1].slice(6, 9).map(Number), [rep.totals.base, rep.totals.vat, rep.totals.total]);
eq("วันที่เป็น พ.ศ.", sale[4][2], "02/10/2569");
eq("นำไฟล์ที่ออกกลับเข้ามาอ่านได้ ยอดเท่าเดิม", T.round2(T.parseSalesImport(back, "2026-10").rows.reduce((s, r) => s + r.base, 0)), rep.totals.base);

console.log(`\n${fail ? "✗" : "✓"} verify-sales-tax-report: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
