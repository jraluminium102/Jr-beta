/**
 * verify-purchase-tax — เทสตัวคิดรายงานภาษีซื้อ (src/lib/purchase-tax.ts) ด้วยข้อมูลสมมติ
 *   รัน: node --experimental-strip-types scripts/verify-purchase-tax.mts
 * ต้องผ่านทุกข้อก่อนแก้ไฟล์นั้น — ตัวเลขในรายงานนี้เอาไปยื่นภาษีจริง (ส่วนที่เรียก AI ไม่อยู่ในเทสนี้)
 */
import { readXlsx } from "../src/lib/floor-calc/xlsx-read.ts";
import { writeXlsx, type Row } from "../src/lib/floor-calc/xlsx-write.ts";
import * as P from "../src/lib/purchase-tax.ts";
import { buildPurchaseSheets } from "../src/lib/purchase-tax-xlsx.ts";
import { reportBranch } from "../src/lib/sales-tax-report.ts";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`✗ ${name}\n    ได้    ${JSON.stringify(got)}\n    ต้องได้ ${JSON.stringify(want)}`); }
};
const has = (name: string, list: string[], re: RegExp, want = true) => eq(name, list.some((w) => re.test(w)), want);

// เลขสมมติที่ผ่านตัวตรวจ 13 หลัก (คำนวณหลักสุดท้ายเอง)
const mk = (d12: string) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(d12[i]) * (13 - i); return d12 + String((11 - (s % 11)) % 10); };
const A = mk("010555000001"), B = mk("010555000002"), C = mk("010353000003");
const SUP: P.Supplier[] = [
  { name: "บริษัท เอ อลูมิเนียม จำกัด", tax_id: A, branch: "สนญ.", pay: "เครดิต" },
  { name: "บริษัท บี ปิโตรเลียม จำกัด", tax_id: B, branch: "01721", pay: "โอน" },
];
const row = (o: Partial<P.PurchaseRow>): P.PurchaseRow => ({ id: "r" + Math.random(), code: "IV001", date: "2026-10-05", name: "บริษัท เอ อลูมิเนียม จำกัด", tax_id: A, branch: "", base: 1000, vat: 70, pay: "เครดิต", note: "", src: "manual", checked: true, ...o });
const ctx: P.RowCheckCtx = { month: "2026-10", suppliers: SUP };
const W = (o: Partial<P.PurchaseRow>, c = ctx) => P.rowIssues(row(o), c).warnings;
const BL = (o: Partial<P.PurchaseRow>, c = ctx) => P.rowIssues(row(o), c).blockers;

// ── 1) เลขผู้เสียภาษี ──
eq("เลขบริษัทเราผ่านตัวตรวจ", P.taxIdValid(P.OUR_TAX_ID), true);
eq("เลข 12 หลัก (Excel ตัด 0 หน้า) เติมเป็น 13", P.taxId13("105560023352"), "0105560023352");
eq("อ่านผิด 1 หลัก → ไม่ผ่าน", P.taxIdValid("0105560023353"), false);
eq("สลับ 2 หลัก → ไม่ผ่าน", P.taxIdValid("0105560023532"), false);
eq("ว่าง/0 = ไม่มี", [P.taxId13(""), P.taxId13("0")], ["", ""]);
eq("มีขีด", P.taxIdValid("0-1055-60023-35-2"), true);
eq("AI พ่วงสาขามาในช่องเลข → เอาเลข 13 หลักชุดแรก", P.pickTaxId(`${A} สาขา 00004`), A);
eq("เลขมีขีด/ช่องว่างคั่น", P.pickTaxId("0-1055-60023-35-2"), "0105560023352");
eq("เลขยาวเกินและไม่มีชุด 13 หลัก → ว่าง (ไม่ต่อเลขมั่ว)", P.pickTaxId("12345 678901234567890 x"), "1234567890123");
eq("ไม่มีเลข", P.pickTaxId("ไม่ระบุ"), "");

// ── 2) วิธีชำระที่โชว์ + สาขา ──
eq("บิลเดือนนี้ = วิธีชำระของบิล", P.payLabel({ base: 100, date: "2026-10-05", pay: "โอน" }, "2026-10"), "โอน");
eq("บิลเดือนก่อน = ยอดเดือน ก.ค.", P.payLabel({ base: 100, date: "2026-07-20", pay: "โอน" }, "2026-10"), "ยอดเดือน ก.ค.");
eq("ข้ามปี = ยอดเดือน ธ.ค.", P.payLabel({ base: 100, date: "2025-12-20", pay: "" }, "2026-01"), "ยอดเดือน ธ.ค.");
eq("ยอดติดลบ = ใบลดหนี้", P.payLabel({ base: -100, date: "2026-10-05", pay: "เครดิต" }, "2026-10"), "ใบลดหนี้");
eq("สาขา 00000 / 0 = สำนักงานใหญ่", [reportBranch(A, "สาขา 00000"), reportBranch(A, "0"), reportBranch(A, "สาขาที่ 4")], ["สนญ.", "สนญ.", "00004"]);

// ── 3) ตัวตรวจต่อแถว: คำเตือน กับ ตัวบล็อก ──
eq("แถวปกติ ไม่มีคำเตือน", P.rowIssues(row({}), ctx), { warnings: [], blockers: [] });
has("เลขไม่ผ่านตัวตรวจ (เตือน)", W({ tax_id: "0105550000019" }), /ไม่ผ่านตัวตรวจ/);
has("เลขเป็นของบริษัทเรา", W({ tax_id: P.OUR_TAX_ID }), /บริษัทเราเอง/);
has("VAT เพี้ยน 99 บาทบนบิลแสน → เตือน", W({ base: 100000, vat: 7099 }), /7%/);
has("VAT 8 จากฐาน 100 → ไม่เกิน 1 บาท ไม่เตือน", W({ base: 100, vat: 8 }), /7%/, false);
has("VAT เพี้ยนสตางค์ ไม่เตือน", W({ base: 934.58, vat: 65.42 }), /7%/, false);
has("บิลหลังเดือนที่ยื่น = บล็อก", BL({ date: "2026-11-02" }), /หลังเดือนที่ยื่น/);
has("บิลเก่า 6 เดือนพอดี ยังใช้ได้", BL({ date: "2026-04-30" }), /เกิน 6 เดือน/, false);
has("บิลเก่า 7 เดือน = บล็อก", BL({ date: "2026-03-31" }), /เกิน 6 เดือน/);
has("ใบลดหนี้เก่า 7 เดือน ไม่บล็อก (ไม่มีกรอบ 6 เดือน)", BL({ date: "2026-03-31", base: -100, vat: -7 }), /เกิน 6 เดือน/, false);
has("ไม่มี VAT = บล็อก", BL({ vat: 0 }), /ไม่มี VAT/);
has("ไม่มีวันที่ = บล็อก", BL({ date: "" }), /ไม่มีวันที่/);
has("ใบกำกับอย่างย่อ = บล็อก", BL({ kind: "abbr" }), /อย่างย่อ/);
has("ไม่ได้ออกในนามเรา = บล็อก", BL({ buyer_tax_id: C }), /ไม่ได้ออกในนามบริษัทเรา/);
has("ไม่เห็นเลขผู้ซื้อ = เตือน", W({ buyer_tax_id: "" }), /ไม่เห็นเลขผู้เสียภาษีของผู้ซื้อ/);
eq("ไม่เห็นเลขผู้ซื้อ ไม่ใช่ตัวบล็อก", BL({ buyer_tax_id: "" }), []);
eq("ผู้ซื้อ = เรา ไม่เตือน", P.rowIssues(row({ buyer_tax_id: P.OUR_TAX_ID }), ctx).warnings, []);
eq("กรอกเอง/นำเข้า (ไม่มีข้อมูลผู้ซื้อ) ไม่เตือนเรื่องผู้ซื้อ", W({}).some((w) => /ผู้ซื้อ/.test(w)), false);
has("ใบเพิ่มหนี้ = เตือน", W({ kind: "debit" }), /ใบเพิ่มหนี้/);
has("ร้านใหม่", W({ tax_id: C, name: "ร้านใหม่" }), /ร้านใหม่/);
has("สาขาใหม่ของร้านเดิม", W({ branch: "00009" }), /สาขานี้ของร้านยังไม่มีในสมุด/);
has("ยังไม่เลือกวิธีชำระ", W({ pay: "" }), /วิธีชำระ/);
has("บิลเดือนก่อนไม่ต้องเลือกวิธีชำระ", W({ pay: "", date: "2026-09-10" }), /วิธีชำระ/, false);
has("ธงชั่วคราวจากตอนอ่าน ติดมาด้วย", W({ ai_flags: ["AI อ่านไม่ชัด: วันที่"] }), /AI อ่านไม่ชัด/);
// ⚠ คำเตือนเรื่องผู้ซื้อ/ชนิดเอกสาร ต้องอยู่แม้ธงชั่วคราวถูกล้าง (ตอนติ๊กตรวจ/แก้ช่องอื่น)
has("ล้างธงชั่วคราวแล้ว คำเตือนผู้ซื้อยังอยู่", BL({ buyer_tax_id: C, ai_flags: [] }), /ไม่ได้ออกในนามบริษัทเรา/);

// ── 4) กุญแจกันบิลซ้ำ ──
eq("IV-0012 = iv0012 = IV 12", [P.normCode("IV-0012"), P.normCode("iv0012"), P.normCode("IV 0012")], ["IV0012", "IV0012", "IV0012"]);
eq("0012 = 12", [P.normCode("0012"), P.normCode("12")], ["12", "12"]);
eq("เลขล้วนเป็นศูนย์ไม่หาย", P.normCode("000"), "0");
eq("ไม่มีเลขผู้เสียภาษี/เลขที่ → ใช้ชื่อ+วัน+ยอด", P.billKeys({ tax_id: "", code: "", name: "META PLATFORMS", date: "2026-10-02", base: 3713.05, vat: 259.91 }), ["~metaplatforms|2026-10-02|3972.96"]);
eq("คนละร้าน วันและยอดเท่ากัน ไม่ชนกัน", P.billKeys({ tax_id: "", code: "", name: "GOOGLE", date: "2026-10-02", base: 3713.05, vat: 259.91 })[0] === "~metaplatforms|2026-10-02|3972.96", false);

// ── 5) รายงาน: ยอดรวม · บิลซ้ำ · ไม่ใช้ภาษีซื้อ · สรุปตามวิธีชำระ ──
const store: P.PurchaseStore = { rows: [
  row({ id: "1", code: "IV001", base: 1000, vat: 70, pay: "เครดิต" }),
  row({ id: "2", code: "iv-001", base: 1000, vat: 70, pay: "เครดิต" }),                      // เลขเดียวกันเขียนต่างกัน = ซ้ำ
  row({ id: "3", code: "T-9", tax_id: B, name: "บริษัท บี ปิโตรเลียม จำกัด", branch: "01721", base: 934.58, vat: 65.42, pay: "โอน", checked: false, src: "ai" }),
  row({ id: "4", code: "IV-OLD", date: "2026-07-15", base: 500, vat: 35, pay: "" }),
  row({ id: "5", code: "CN1", base: -200, vat: -14 }),
  row({ id: "6", code: "IV777", base: 300, vat: 21, pay: "สด" }),
  row({ id: "7", code: "SLIP1", tax_id: B, name: "บริษัท บี ปิโตรเลียม จำกัด", branch: "01721", base: 934.58, vat: 65.42, pay: "โอน", kind: "abbr", no_claim: "ใบกำกับภาษีอย่างย่อ" }),
], misses: [{ id: "m1", ref: "scan.pdf หน้า 9", reason: "ไม่พบใบกำกับภาษีในหน้านี้", at: "2026-11-27T00:00:00Z" }] };
const other = new Map([[P.billKeys(row({ code: "IV777" }))[0], "2026-09"]]);
let rep = P.buildPurchaseReport("2026-10", store, SUP, other);
eq("ยอดรวมนับเฉพาะใบที่ใช้ภาษีซื้อ", [rep.totals.count, rep.totals.base, rep.totals.vat, rep.totals.total], [6, 3534.58, 247.42, 3782]);
eq("ใบไม่ใช้ภาษีซื้อแยกออก ไม่มีคำเตือน", rep.noClaim.map((r) => [r.id, r.no_claim, r.warnings.length]), [["7", "ใบกำกับภาษีอย่างย่อ", 0]]);
eq("หน้าที่ไม่ได้บิลติดไปกับรายงาน", rep.misses.length, 1);
eq("ยังไม่ได้ตรวจ", rep.totals.unchecked, 1);
eq("บิลซ้ำในเดือน = บล็อกทั้งสองใบ", rep.rows.filter((r) => r.blockers.some((w) => /ซ้ำกับอีกใบ/.test(w))).map((r) => r.id).sort(), ["1", "2"]);
has("บิลที่ลงเดือนอื่นแล้ว = บล็อก", rep.rows.find((r) => r.id === "6")!.blockers, /ลงไว้ในเดือน ก\.ย\. 2569/);
eq("สรุปตามวิธีชำระ เรียง สด·เครดิต·โอน·ยอดเดือน·ใบลดหนี้", rep.byPay.map((p) => [p.label, p.count, p.base, p.vat, p.total]),
  [["สด", 1, 300, 21, 321], ["เครดิต", 2, 2000, 140, 2140], ["โอน", 1, 934.58, 65.42, 1000], ["ยอดเดือน ก.ค.", 1, 500, 35, 535], ["ใบลดหนี้", 1, -200, -14, -214]]);
eq("ผลรวมสรุป = ยอดรวมรายงาน", [P.round2(rep.byPay.reduce((s, p) => s + p.base, 0)), P.round2(rep.byPay.reduce((s, p) => s + p.vat, 0))], [rep.totals.base, rep.totals.vat]);
// ตั้งใบซ้ำใบหนึ่งเป็น "ไม่ใช้" → อีกใบหายบล็อก
const st2 = { rows: store.rows.map((r) => (r.id === "2" ? { ...r, no_claim: "สแกนซ้ำ" } : r)) };
rep = P.buildPurchaseReport("2026-10", st2, SUP, other);
eq("ตั้งใบซ้ำเป็นไม่ใช้ → อีกใบไม่ติดซ้ำแล้ว", rep.rows.find((r) => r.id === "1")!.blockers, []);

// ── 6) ผลจาก AI → แถวร่าง ──
const bill = (o: Partial<P.AiBill>): P.AiBill => ({ doc_type: "tax_invoice", doc_no: "RE6905/034", date: "2026-05-23", seller_name: "บริษัท เอ อลูมิเนียม จก.", seller_tax_id: A, seller_branch: "สำนักงานใหญ่", buyer_tax_id: P.OUR_TAX_ID, base: 10000, vat: 700, total: 10700, is_copy: false, unclear: [], ...o });
let r = P.aiBillToRow(bill({}), SUP, "scan.pdf หน้า 1")!;
eq("เจอในสมุด → ใช้ชื่อ/วิธีชำระของสมุด", [r.name, r.pay, r.checked, r.src, r.ref, r.kind, r.buyer_tax_id, r.ai_flags], ["บริษัท เอ อลูมิเนียม จำกัด", "เครดิต", false, "ai", "scan.pdf หน้า 1", "invoice", P.OUR_TAX_ID, []]);
r = P.aiBillToRow(bill({ seller_branch: "00004" }), SUP, "x")!;
eq("สาขาบนบิลไม่ตรงสมุด → ใช้สาขาจากบิล (ชื่อยังเอาจากสมุด)", [r.branch, r.name], ["00004", "บริษัท เอ อลูมิเนียม จำกัด"]);
has("แล้วตัวตรวจเตือนสาขาใหม่", P.rowIssues({ id: "x", ...r }, { month: "2026-05", suppliers: SUP }).warnings, /สาขานี้ของร้านยังไม่มีในสมุด/);
r = P.aiBillToRow(bill({ seller_tax_id: C, seller_name: "ร้านซี" }), SUP, "x")!;
eq("ไม่เจอในสมุด → ใช้ชื่อบนบิล ไม่มีวิธีชำระ", [r.name, r.pay], ["ร้านซี", ""]);
r = P.aiBillToRow(bill({ date: "2569-05-23" }), SUP, "x")!;
eq("AI หลุดปี พ.ศ. → แปลงเป็น ค.ศ.", r.date, "2026-05-23");
r = P.aiBillToRow(bill({ date: "อ่านไม่ออก" }), SUP, "x")!;
eq("วันที่อ่านไม่ออก → ว่าง (ตัวตรวจบล็อก)", r.date, "");
r = P.aiBillToRow(bill({ doc_type: "credit_note", base: 200, vat: 14, total: 214 }), SUP, "x")!;
eq("ใบลดหนี้ → ยอดติดลบ + ชนิด credit", [r.base, r.vat, r.kind], [-200, -14, "credit"]);
has("ใบลดหนี้ → เตือนให้เช็คว่าเป็นส่วนที่ลด", r.ai_flags!, /ส่วนที่ลด/);
r = P.aiBillToRow(bill({ doc_type: "credit_note", base: -200, vat: -14, total: -214 }), SUP, "x")!;
eq("ใบลดหนี้ที่ AI ส่งติดลบมา → ไม่กลับเป็นบวก ไม่เตือนยอดไม่ลงตัว", [r.base, r.vat, r.ai_flags!.some((f) => /ไม่เท่ากับยอดรวม/.test(f))], [-200, -14, false]);
r = P.aiBillToRow(bill({ doc_type: "abbreviated_tax_invoice", base: null, vat: null, total: 1000, buyer_tax_id: "" }), SUP, "x")!;
eq("ใบกำกับอย่างย่อ → ตั้งไม่ใช้ภาษีซื้อให้เลย", [r.kind, r.no_claim], ["abbr", "ใบกำกับภาษีอย่างย่อ"]);
r = P.aiBillToRow(bill({ base: null, vat: null, total: 1000 }), SUP, "x")!;
eq("เห็นแต่ยอดรวม → ถอดให้ แต่บอกว่าระบบถอดเอง", [r.base, r.vat, r.ai_flags!.some((f) => /ระบบถอด/.test(f))], [934.58, 65.42, true]);
r = P.aiBillToRow(bill({ buyer_tax_id: C }), SUP, "x")!;
has("ไม่ได้ออกในนามเรา → บล็อก (จากข้อมูลในแถว ไม่ใช่ธง)", P.rowIssues({ id: "x", ...r }, { month: "2026-05", suppliers: SUP }).blockers, /ไม่ได้ออกในนามบริษัทเรา/);
r = P.aiBillToRow(bill({ base: 10000, vat: 700, total: 10900 }), SUP, "x")!;
has("ยอดไม่ลงตัว → เตือน ไม่แก้ตัวเลข", r.ai_flags!, /ไม่เท่ากับยอดรวมบนบิล/);
eq("ตัวเลขคงตามที่อ่าน", [r.base, r.vat], [10000, 700]);
r = P.aiBillToRow(bill({ base: null, vat: 700, total: 10700 }), SUP, "x")!;
eq("ไม่มีฐาน → รวม − VAT + บอก", [r.base, r.ai_flags!.some((f) => /ไม่เห็นยอดก่อน VAT/.test(f))], [10000, true]);
r = P.aiBillToRow(bill({ is_copy: true }), SUP, "x")!;
has("สำเนา → เตือน", r.ai_flags!, /สำเนา/);
r = P.aiBillToRow(bill({ unclear: Array.from({ length: 25 }, (_, i) => "ช่อง " + i), doc_no: "X".repeat(100) }), SUP, "x")!;
eq("ธงเยอะ/ข้อความยาว → ตัดให้พอดี (ไม่งั้นทั้งหน้าบันทึกไม่ผ่าน)", [r.ai_flags!.length <= 15, r.code.length <= 60], [true, true]);
eq("เอกสารที่ไม่ใช่ใบกำกับ → ไม่สร้างแถว", P.aiBillToRow(bill({ doc_type: "other" }), SUP, "x"), null);
r = P.aiBillToRow(bill({ seller_tax_id: "", seller_name: "บริษัท เอ อลูมิเนียม จำกัด" }), SUP, "x")!;
has("อ่านเลขไม่ได้ แต่ชื่อตรงสมุด → บอกเลขในสมุด ไม่เติมให้เอง", r.ai_flags!, new RegExp(A));
eq("ไม่เติมเลขให้เอง", r.tax_id, "");
r = P.aiBillToRow(bill({ seller_tax_id: `${A} สาขา 00004` }), SUP, "x")!;
eq("เลขพ่วงสาขา → ได้เลข 13 หลัก", r.tax_id, A);

// ── 7) ไฟล์รายงานเดิมของธุรการ → สมุดร้าน + บิล ──
const c = (v: string | number) => ({ v });
const H = ["ลำดับที่", "เลขที่เอกสาร", "วัน/เดือน/ปี", "ชื่อผู้ประกอบการ", "เลขที่ผู้เสียภาษี", "สาขา", "ยอดขาย", "ภาษี มูลค่าเพิ่ม", "รวม"].map(c);
const buy: Row[] = [
  [c("รายงานภาษี ซื้อ")], [c("ชื่อบริษัท")], [c("เลขที่ประจำตัวผู้เสียภาษี")], H,
  [c(1), c("RVV26-07-009"), c(244532), c("บริษัท เอ อลูมิเนียม จำกัด"), c(A.slice(1)), c("สนญ."), c(10974.3), c(768.201), c(11742.501), c(0), c("ยอดเดือน ก.ค.")],
  [c(2), c("P6910/0001"), c(244623), c("บริษัท เอ อลูมิเนียม จำกัด"), c(A.slice(1)), c("สนญ."), c(1000), c(70), c(1070), c(0), c("เครดิต")],
  [c(3), c("730940"), c(244653), c("บริษัท บี ปิโตรเลียม จำกัด"), c(B.slice(1)), c("01721"), c(934.58), c(65.4206), c(1000.0006), c(0), c("โอน")],
  [c(4), c(""), c(244624), c("META PLATFORMS IRELAND LIMITED"), c(""), c(""), c(3713.05), c(259.9135), c(3972.9635), c(0), c("โอน")],
  [c(5), c("577231"), c("12/110/2569"), c("บริษัท บี ปิโตรเลียม จำกัด"), c(B.slice(1)), c("01721"), c(934.58), c(65.42), c(1000), c(0), c("โอน")],
  [c(6), c("CN-1"), c(244625), c("บริษัท เอ อลูมิเนียม จำกัด"), c(A.slice(1)), c("สนญ."), c(500), c(35), c(535), c(0), c("ใบลดหนี้")],
  [c(7), c("NOVAT"), c(244626), c("บริษัท เอ อลูมิเนียม จำกัด"), c(A.slice(1)), c("สนญ."), c(100), c(""), c(""), c(0), c("โอน")],
  [c(8), c("BAD"), c(244626), c("ร้านเลขผิด"), c("1055500130822"), c("สนญ."), c(100), c(7), c(107), c(0), c("โอน")],
  [c(""), c(""), c(""), c("รวม"), c(""), c(""), c(17556.51)],
];
const dirSheet: Row[] = [[c("")], [c("บริษัท เอ อลูมิเนียม จำกัด"), c(A.slice(1)), c("สนญ.")], [c("บริษัท ซี จำกัด"), c(C.slice(1)), c("สนญ.")]];
const old = P.parseOldPurchaseFile(readXlsx(writeXlsx([{ name: "ซื้อ", rows: buy }, { name: "ขาย", rows: [H] }, { name: "ชื่อบริษัท", rows: dirSheet }])));
eq("บิลจากชีตซื้อ (รวมแถวไม่มีเลขที่เอกสาร ไม่เอาแถวรวม)", old.rows.slice(0, 4).map((x) => [x.code, x.date, x.base, x.vat, x.pay, x.checked]),
  [["RVV26-07-009", "2026-07-02", 10974.3, 768.2, "", true], ["P6910/0001", "2026-10-01", 1000, 70, "เครดิต", true], ["730940", "2026-10-31", 934.58, 65.42, "โอน", true], ["", "2026-10-02", 3713.05, 259.91, "โอน", true]]);
eq("เขียนว่าใบลดหนี้แต่ยอดบวก → กลับติดลบ + ยังไม่ถือว่าตรวจ", old.rows.filter((x) => x.code === "CN-1").map((x) => [x.base, x.vat, x.checked, x.kind]), [[-500, -35, false, "credit"]]);
eq("ไฟล์ไม่มีช่อง VAT → คิดให้ + ยังไม่ถือว่าตรวจ", old.rows.filter((x) => x.code === "NOVAT").map((x) => [x.vat, x.checked]), [[7, false]]);
eq("วันที่พิมพ์ผิดในไฟล์ → แจ้ง ไม่นำเข้า", [old.problems.length, /12\/110\/2569/.test(old.problems[0] ?? "")], [1, true]);
let mg = P.mergeSuppliers([], old.suppliers);
eq("สมุดร้าน: เลขไม่ผ่านตัวตรวจไม่เข้าสมุด", mg.list.map((s) => [s.name, s.tax_id, s.branch, s.pay]).sort(),
  [["บริษัท ซี จำกัด", C, "สนญ.", ""], ["บริษัท บี ปิโตรเลียม จำกัด", B, "01721", "โอน"], ["บริษัท เอ อลูมิเนียม จำกัด", A, "สนญ.", "เครดิต"]].sort());
mg = P.mergeSuppliers(SUP.map((s) => ({ ...s, pay: "" as P.PayKind })), old.suppliers);
eq("รวมสมุดร้าน: เพิ่มเฉพาะร้านใหม่ + เติมวิธีชำระให้ร้านเดิม", [mg.added, mg.list.length, mg.changed, mg.list.find((s) => s.tax_id === A)?.pay], [1, 3, true, "เครดิต"]);
eq("ไม่มีอะไรใหม่ → changed false", P.mergeSuppliers(mg.list, mg.list).changed, false);
eq("เลขบริษัทเราไม่เข้าสมุด", P.mergeSuppliers([], [{ name: "เรา", tax_id: P.OUR_TAX_ID, branch: "", pay: "" }]).added, 0);
eq("หาร้านด้วยเลข (ไม่สนชื่อ)", P.findSupplier(SUP, A.slice(1), "ชื่ออะไรก็ได้")?.name, "บริษัท เอ อลูมิเนียม จำกัด");
eq("เลขไม่ตรงกับร้านไหน → ไม่ตกไปจับด้วยชื่อ", P.findSupplier(SUP, C, "บริษัท เอ อลูมิเนียม จำกัด"), null);
eq("ไม่เดาชื่อคล้าย", P.findSupplier(SUP, "", "บริษัท เอ อลูมิเนียม"), null);

// ── 8) Excel ที่ออก: ตำแหน่งคอลัมน์ตรงไฟล์เดิม + นำกลับเข้ามาได้ ──
rep = P.buildPurchaseReport("2026-10", store, SUP, other);
const back = readXlsx(writeXlsx(buildPurchaseSheets(rep, { name: "บริษัท ทดสอบ จำกัด", taxId: "0100000000000", branch: "สำนักงานใหญ่" })));
eq("ชีต", back.map((s) => s.name), ["ซื้อ", "สรุป", "ไม่ใช้ภาษีซื้อ"]);
const sh = back[0].rows;
has("หัวไฟล์บอกว่าเป็นฉบับร่างเมื่อยังมีใบไม่ได้ตรวจ", [sh[0][0]], /ฉบับร่าง/);
eq("จำนวนแถวข้อมูล", sh.length - 5, rep.rows.length);
eq("แถวรวม", sh[sh.length - 1].slice(6, 9).map(Number), [rep.totals.base, rep.totals.vat, rep.totals.total]);
eq("วิธีชำระอยู่คอลัมน์ K (ตรงไฟล์เดิม)", sh.slice(4, -1).map((x) => x[10]).sort(), ["ยอดเดือน ก.ค.", "สด", "เครดิต", "เครดิต", "โอน", "ใบลดหนี้"].sort());
eq("ใบที่ยังไม่ตรวจมีหมายเหตุในไฟล์ (คอลัมน์ L)", sh.filter((x) => /ยังไม่ได้ตรวจกับบิลจริง/.test(x[11] ?? "")).length, 1);
eq("ชีตสรุป: ยอดที่ใช้ภาษีซื้อ + แถวไม่ใช้", [Number(back[1].rows.find((x) => /ยอดทั้งหมด/.test(x[0]))![3]), back[1].rows.some((x) => /ไม่ใช้ภาษีซื้อ/.test(x[0]))], [rep.totals.vat, true]);
eq("ชีตไม่ใช้ภาษีซื้อ มีเหตุผล", back[2].rows[2][11], "ใบกำกับภาษีอย่างย่อ");
const re = P.parseOldPurchaseFile(back);
eq("นำไฟล์ที่ออกกลับเข้ามา: จำนวน/ยอด/วิธีชำระ ไม่เพี้ยน", [re.rows.length, P.round2(re.rows.reduce((s, x) => s + x.base, 0)), re.rows.filter((x) => x.pay === "เครดิต").length, re.rows.filter((x) => x.pay === "โอน").length],
  [rep.rows.length, rep.totals.base, 2, 1]);

console.log(`\n${fail ? "✗" : "✓"} verify-purchase-tax: ผ่าน ${pass} · ไม่ผ่าน ${fail}`);
process.exit(fail ? 1 : 0);
