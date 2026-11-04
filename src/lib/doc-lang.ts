/**
 * ภาษาของเอกสารพิมพ์ — ใบเสนอราคาออกเป็นภาษาอังกฤษได้ (เจ้าของสั่ง 2 พ.ย.69 · อ้างอิง QT2026070056 K.Steve Rev04)
 *   เลือกด้วย ?lang=en ที่หน้าพิมพ์ (ไม่เก็บลง DB — ใบเดียวพิมพ์ได้ทั้ง 2 ภาษา)
 *   ข้อความ "ของระบบ" ทุกจุดในใบดึงจากตารางนี้ · เนื้อหาที่เซลล์พิมพ์เอง (ชื่อรายการ/รายละเอียด/หมายเหตุ) พิมพ์ตามที่กรอก
 */
export type DocLang = "th" | "en";

export const docLangOf = (v: unknown): DocLang => (String(v ?? "").toLowerCase() === "en" ? "en" : "th");

const TH = {
  quotation: "ใบเสนอราคา",
  original: "ต้นฉบับ",
  docNo: "เลขที่",
  date: "วันที่",
  contact: "ผู้ติดต่อ",
  phone: "เบอร์โทร",
  contactOther: "ติดต่อ",
  customer: "ลูกค้า",
  taxId: "เลขประจำตัวผู้เสียภาษี",
  tel: "โทร.",
  job: "งาน",
  headOffice: "สำนักงานใหญ่",
  branchPrefix: "สาขาที่",
  colNo: "#",
  colDesc: "รายละเอียด",
  colQty: "จำนวน",
  colUnitPrice: "ราคาต่อหน่วย",
  colAmount: "ยอดรวม",
  subtotal: "รวมเป็นเงิน",
  discount: "ส่วนลด",
  afterDiscount: "จำนวนเงินหลังหักส่วนลด",
  vat: "ภาษีมูลค่าเพิ่ม",
  wht: "หัก ณ ที่จ่าย",
  grandTotal: "จำนวนเงินรวมทั้งสิ้น",
  netReceive: "ยอดรับสุทธิ",
  currency: "บาท",
  note: "หมายเหตุ",
  onBehalf: "ในนาม",
  buyer: "ผู้สั่งซื้อสินค้า",
  approver: "ผู้อนุมัติ",
  sigDate: "วันที่",
  condWork: "เงื่อนไขการเข้าทำงาน",
  condQuote: "เงื่อนไขแบบและใบเสนอราคา",
  confirm: "ขอยืนยันการสั่งซื้อภายใต้เงื่อนไข  ขอแสดงความนับถือ",
  signLine: "ลงนาม ............................................... ผู้สั่งซื้อ",
  signDate: "วันที่ ........../........../.......... (สำหรับลูกค้า)",
};
export type DocText = typeof TH;

const EN: DocText = {
  quotation: "Quotation",
  original: "Original",
  docNo: "No.",
  date: "Date",
  contact: "Contact",
  phone: "Phone",
  contactOther: "Contact",
  customer: "Customer",
  taxId: "Tax ID",
  tel: "Tel.",
  job: "Project",
  headOffice: "Head Office",
  branchPrefix: "Branch",
  colNo: "#",
  colDesc: "Description",
  colQty: "Qty",
  colUnitPrice: "Unit Price",
  colAmount: "Amount",
  subtotal: "Subtotal",
  discount: "Discount",
  afterDiscount: "Amount after discount",
  vat: "VAT",
  wht: "Withholding tax",
  grandTotal: "Grand Total",
  netReceive: "Net Amount",
  currency: "THB",
  note: "Note",
  onBehalf: "For",
  buyer: "Purchaser",
  approver: "Authorized by",
  sigDate: "Date",
  condWork: "Terms for Work Execution",
  condQuote: "Terms for Designs and Quotations",
  confirm: "We hereby confirm this order under the terms above.  Yours sincerely,",
  signLine: "Signed ............................................... Purchaser",
  signDate: "Date ........../........../.......... (for customer)",
};

export const DOC_TEXT: Record<DocLang, DocText> = { th: TH, en: EN };
export const docText = (lang?: DocLang | null): DocText => DOC_TEXT[lang === "en" ? "en" : "th"];

/** ชื่อ/ที่อยู่บริษัทภาษาอังกฤษ — ⚠ สะกดตามที่ใช้ในเอกสารเดิม ถ้าเจ้าของมีตัวสะกดทางการให้แก้ที่นี่ที่เดียว */
export const COMPANY_EN = {
  name: "JR. Aluminium and Glass Co., Ltd.",
  nameFull: "JR. Aluminium and Glass Co., Ltd.",
  branch: "Head Office",
  address: "13 Soi Phutthabucha 26/1, Bang Mot, Thung Khru, Bangkok 10140",
};

/** ป้ายสาขาลูกค้า: "สำนักงานใหญ่" → "Head Office" · "สาขาที่ 00001" → "Branch 00001" · อื่น ๆ คงเดิม */
export function branchLabel(branch: string | undefined | null, lang: DocLang): string {
  const b = String(branch ?? "").trim();
  if (!b || lang === "th") return b;
  if (/^สำนักงานใหญ่$/.test(b)) return EN.headOffice;
  const m = b.match(/^สาขา(?:ที่)?\s*(\S+)$/);
  return m ? `${EN.branchPrefix} ${m[1]}` : b;
}

/**
 * เงื่อนไขท้ายใบภาษาอังกฤษ — ถอดตรงจากใบปะหลังที่เคยออกให้ลูกค้า (QT2026070056 Rev04 หน้าสุดท้าย)
 *   แก้ข้อความที่นี่ที่เดียว · ใบภาษาอังกฤษใช้ชุดนี้เสมอ (เงื่อนไขที่แก้รายใบเป็นภาษาไทย จึงไม่เอามาปน)
 */
export const CONDITIONS_WORK_EN: string[] = [
  "Electricity and water are the client's responsibility to provide.",
  "For sites involving the dismantling of aluminum, the following details apply:\n2.1 No cement work, cracks, or chipped marks will be fixed.\n2.2 There might be loud noise during cement cutting.\n2.3 A significant amount of dust may be generated during the cutting process.",
  "Worksite entry permissions and deposits required before starting the work are arranged by the customer. (If unforeseen circumstances arise after the work has started, preventing its continuation, the company reserves the right to charge based on actual costs.)",
  "Any items beyond the quoted prices will be considered additional work and will require a new quotation before proceeding.",
  "Warranty Conditions: The installation is guaranteed for 1 year, covering issues such as misaligned panels, panels not sliding smoothly, water leaks, and other installation-related defects, starting from the date the work is handed over. The contractor is not liable for any damage caused by ground subsidence, improper usage, accidents, or natural disasters, including water leakage or seepage resulting from pre-existing conditions such as cracked or damaged original concrete walls, skirting boards, or roofing. The client agrees not to make any claims or seek compensation from the contractor in such cases.",
];

export const CONDITIONS_QUOTE_EN: string[] = [
  "1) If the client wishes to change the material colors, equipment, or design, they must notify through the official LINE or Facebook channels. Modifications can be made before the quotation deadline.",
  "2) For 3D designs, an additional fee will apply (two packages are available). Clients may provide reference designs; if none are provided, the company will design based on its standard 2D designs.\n2.1) For project costs exceeding THB 200,000, the 3D design fee can be used as a full discount.\n2.2) For project costs below THB 200,000, the 3D design fee cannot be discounted.\n2.3) 3D designs can be revised up to three times.",
  "3) If the client wishes for the company to purchase and install electrical devices (e.g., sockets, switches, light fixtures with bulbs, ventilation fans, etc.), the designs and brands will follow the company's specifications.",
  "4) If the client requests the company to procure paint for lightweight wall panels and finishing work, the colors will align with the company's standard selections. These may closely match the existing paint but might not be identical.",
  "5) For flush floor thresholds, measurements from the 2D plans must be provided to the contractor for execution before the company's technicians conduct the site measurements.",
  "6) Once the final measurements are made and the floor threshold is completed, no adjustments to designs or dimensions will be possible. For example, changes to tiled surfaces, ceilings, plastering, and other related works are excluded from post-measurement revisions.",
];
