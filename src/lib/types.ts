// แอพรวม: ใช้ role_t ชุดเดียว (ตรงกับ public.profiles + @/lib/database.types Role)
export type UserRole =
  | "ADMIN" | "SALES" | "DESIGNER" | "PRODUCTION" | "INSTALLER" | "ACCOUNTING" | "VIEWER" | "CHANG";
export type QuotationStatus = "draft" | "sent" | "approved" | "cancelled";
export type BillingStatus = "unpaid" | "partial" | "paid" | "cancelled";
export type InstallmentStatus = "pending" | "paid";
export type ProductionStatus =
  | "queued" | "measuring" | "manufacturing" | "qc" | "ready" | "installed" | "done" | "cancelled";
export type StockMoveType = "in" | "out" | "adjust";

type CustomerSnapshot = Pick<
  Customer, "name" | "job" | "address" | "tax_id" | "line_id" | "phone" | "contact_person"
> & { branch?: string; kind?: string };  // (0069) นามออกบิล: kind=INDIVIDUAL/COMPANY, branch=สนญ./สาขา (optional เผื่อใบเก่า)

// footer ใบวางบิลพิมพ์แยกงวด — ยอดแตก (display-only) · null field = ใช้ค่าเฉลี่ยตามสัดส่วน
export interface InstallmentFooter {
  subtotal: number;
  discount: number;
  vat: number;
  wht: number;
}

export interface BillingInstallment {
  id?: number;
  billing_note_id?: number;
  seq: number;
  label: string;
  amount: number;
  due_date: string | null;
  status: InstallmentStatus;
  paid_amount: number;
  paid_date: string | null;
  sort_order: number;
  footer_override?: InstallmentFooter | null; // แก้ footer งวดนี้ทับค่าเฉลี่ย (จำไว้) · null = เฉลี่ยอัตโนมัติ
}

export interface BillingNote {
  id: number;
  code: string;
  quotation_id: number | null;
  customer_snapshot: CustomerSnapshot;
  issue_date: string;
  total: number;
  status: BillingStatus;
  display_status?: BillingStatus | null; // override ป้ายสถานะบนเอกสาร (null = อัตโนมัติ) — ไม่กระทบยอดเงิน
  note: string;
  created_at: string;
  updated_at: string;
  billing_installments?: BillingInstallment[];
  footer_override?: InstallmentFooter | null; // แก้ footer ใบเต็มทับ (display-only) · null = ใช้ค่าจริงจากคอลัมน์
}

export interface Receipt {
  id: number;
  code: string;
  billing_note_id: number | null;
  installment_id: number | null;
  customer_snapshot: CustomerSnapshot;
  issue_date: string;
  amount: number;
  vat_rate: number;
  vat_amt: number;
  net: number;
  payment_method: string;
  note: string;
  created_at: string;
}

export interface ProductionItem {
  name: string;
  detail: string;
  qty: number;
}

export interface ProductionOrder {
  id: number;
  code: string;
  quotation_id: number | null;
  customer_snapshot: CustomerSnapshot;
  items: ProductionItem[];
  status: ProductionStatus;
  measure_date: string | null;
  due_date: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Warranty {
  id: number;
  code: string;
  quotation_id: number | null;
  customer_snapshot: CustomerSnapshot;
  items: ProductionItem[];
  issue_date: string;
  warranty_months: number;
  expires_date: string | null;
  coverage: string;
  note: string;
  created_at: string;
}

export interface StockItem {
  id: number;
  sku: string;
  name: string;
  category: string;
  category_id: number | null;
  unit: string;
  qty_on_hand: number;
  min_qty: number;
  note: string;
  is_active: boolean;
  // 0073 — ต้นทุน/น้ำหนัก/รูป/ร้าน
  image_url: string;
  supplier: string;
  unit_cost: number;          // ต้นทุนต่อหน่วยฐาน (ต่อเส้น/ชิ้น) ล่าสุด
  is_weight_based: boolean;   // true = อลู คิดต่อโล
  weight_per_unit: number;    // กก. ต่อ 1 หน่วย
  price_per_kg: number;       // ราคาต่อโลล่าสุด
  created_at: string;
  updated_at: string;
}

export interface StockCategory {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface StockPrice {
  id: number;
  stock_item_id: number;
  price_per_kg: number | null;
  unit_cost: number;
  effective_date: string;
  supplier: string;
  note: string;
  created_at: string;
}

export interface StockMove {
  id: number;
  stock_item_id: number;
  type: StockMoveType;
  qty: number;
  ref: string;
  note: string;
  // 0073 — ผู้เบิก/งาน/ต้นทุน/รูป
  requester: string;
  job_id: string | null;
  unit_cost: number;
  total_price: number;
  image_url: string;
  created_at: string;
}

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  unpaid: "ยังไม่ชำระ", partial: "ชำระบางส่วน", paid: "ชำระครบ", cancelled: "ยกเลิก",
};
export const PRODUCTION_STATUS_LABEL: Record<ProductionStatus, string> = {
  queued: "เข้าคิว", measuring: "วัดหน้างาน", manufacturing: "กำลังผลิต", qc: "ตรวจ QC",
  ready: "พร้อมติดตั้ง", installed: "ติดตั้งแล้ว", done: "จบงาน", cancelled: "ยกเลิก",
};

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface Customer {
  id: number;
  name: string;
  job: string;
  address: string;
  tax_id: string;
  line_id: string;
  phone: string;
  contact_person: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuotationItem {
  id?: number;
  quotation_id?: number;
  name: string;
  detail: string;
  qty: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
}

export interface Quotation {
  id: number;
  code: string;
  customer_id: number | null;
  customer_snapshot: Pick<Customer, "name" | "job" | "address" | "tax_id" | "line_id" | "phone" | "contact_person">;
  issue_date: string;
  status: QuotationStatus;
  vat_rate: number;
  discount_pct: number;
  wht_rate: number;
  subtotal: number;
  discount_amt: number;
  vat_amt: number;
  total: number;
  wht_amt: number;
  net: number;
  note: string;
  created_at: string;
  updated_at: string;
  quotation_items?: QuotationItem[];
}

export const STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "ร่าง",
  sent: "ส่งลูกค้า",
  approved: "อนุมัติ",
  cancelled: "ยกเลิก",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "แอดมิน/เจ้าของ",
  SALES: "เซลล์",
  DESIGNER: "ดีไซเนอร์",
  PRODUCTION: "ฝ่ายผลิต",
  INSTALLER: "ช่างติดตั้ง",
  ACCOUNTING: "บัญชี",
  VIEWER: "ดูอย่างเดียว",
  CHANG: "ช่างผลิต",
};
