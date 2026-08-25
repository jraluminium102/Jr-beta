// แอพรวม: ใช้ role_t ชุดเดียว (ตรงกับ public.profiles + @/lib/database.types Role)
export type UserRole =
  | "ADMIN" | "SALES" | "DESIGNER" | "PRODUCTION" | "INSTALLER" | "ACCOUNTING" | "VIEWER" | "CHANG" | "STORE";
export type QuotationStatus = "draft" | "sent" | "approved" | "cancelled";
export type BillingStatus = "unpaid" | "partial" | "paid" | "cancelled";
export type InstallmentStatus = "pending" | "paid";
export type ProductionStatus =
  | "queued" | "measuring" | "manufacturing" | "qc" | "ready" | "installed" | "done" | "cancelled";
export type StockMoveType = "in" | "out" | "adjust";

type CustomerSnapshot = Pick<
  Customer, "name" | "job" | "address" | "tax_id" | "line_id" | "phone" | "contact_person"
> & { branch?: string; kind?: string; contact_channel?: string };  // (0069) นามออกบิล: kind=INDIVIDUAL/COMPANY, branch=สนญ./สาขา (optional เผื่อใบเก่า)

// footer ใบวางบิล (display-only) — snapshot ที่คิดแล้วด้วย computeTotals: เก็บทั้ง % และยอด + สุทธิ
// คิดจาก subtotal + discount_pct + vat_rate + wht_rate (server recompute เสมอ กันเลขเพี้ยน)
export interface InstallmentFooter {
  subtotal: number;
  discount_pct: number;
  discount_amt: number;
  vat_rate: number;
  vat_amt: number;
  wht_rate: number;
  wht_amt: number;
  net: number;
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

// หน้าติดตั้งใหม่ (ปฏิทินคิวช่าง) — 0086
export interface InstallTeam {
  id: string;
  name: string;
  lead_name: string;
  color: string;       // red|blue|green|amber|purple|teal
  sort_order: number;
  is_active: boolean;
}
export interface InstallAssignment {
  id: string;
  job_id: string | null;    // null = คิวนอกระบบ (งานพิเศษ ใช้ custom_title แทน) — 0100
  custom_title?: string | null;  // ชื่องานพิเศษที่พิมพ์เอง (คิวนอกระบบ)
  team_id: string | null;   // เลิกใช้ (0089) — คงไว้เพื่อข้อมูลเก่า
  lead_name?: string;       // หัวหน้าช่าง (พิมพ์อิสระ · 0089) — สีการ์ดปฏิทินอิงชื่อนี้
  date: string;        // ISO YYYY-MM-DD
  crew: string;
  day_no: number | null;
  day_total: number | null;
  note: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs?: any;          // joined job (code/customer_name/customer_area)
}

// จัดทีมช่างรายวัน (0097) — ลอกจากเว็บ SetTeamApp ที่เจ้าของใช้จริง
// ต่างจาก InstallTeam/InstallAssignment (0086, ปฏิทินรายเดือน "1 งาน→หลายวัน"):
// อันนี้คือ "1 วัน→หลายทีม→หลายสถานที่/ทีม" ใช้จัดหน้างานละเอียด + ปริ้นฟอร์มให้ช่าง
export interface CrewPerson {
  id: string;
  name: string;
  is_leader: boolean;
  is_member: boolean;
  is_active: boolean;
  sort_order: number;
}
export interface CrewTeamSite {
  id: string;
  team_id: string;
  site_no: number;             // 1-4
  job_id: string | null;       // ผูกงานจากระบบ (ไม่บังคับ — พิมพ์เองได้ เช่น "โรงงาน","ลากลับบ้าน")
  customer_name: string;
  appointment_time: string;    // เวลานัด (ข้อความสั้น พิมพ์อิสระ)
  address: string | null;      // snapshot ที่อยู่หน้างาน (ดึงจากงานตอนเลือก)
  phone: string | null;        // snapshot เบอร์ลูกค้า
  off_board?: boolean;         // ธง ⚑ จุดงานนอกบอร์ดพร้อมติดตั้ง (import SetTeam/งานพิเศษ) — 0100
}
export interface CrewDayTeam {
  id: string;
  work_date: string;           // ISO YYYY-MM-DD
  sort_order: number;
  start_time: string;          // เวลาเริ่มงาน พิมพ์อิสระ (ห้ามเป็น time picker — ของจริงพิมพ์ "6.30","ตี4","000")
  leader_id: string | null;
  leader?: { id: string; name: string } | null;
  member_ids: string[];
  note: string;
  crew_team_sites: CrewTeamSite[];
}

export interface Receipt {
  id: number;
  code: string;
  billing_note_id: number | null;
  installment_id: number | null;
  customer_snapshot: CustomerSnapshot;
  issue_date: string;
  amount: number;      // เงินสดที่รับจริง (= net เสมอ) — ต้องกระทบยอดกับ finance_entries ได้
  vat_rate: number;
  vat_amt: number;
  base_amt?: number | null; // ฐานก่อน VAT ณ วันออกใบ (snapshot 0095) · null = ใบเก่า → fallback amount − vat_amt
  wht_rate?: number;        // หัก ณ ที่จ่าย (0095) — memo ใต้ "จำนวนเงินรวมทั้งสิ้น" ไม่ลดฐาน VAT
  wht_amt?: number;
  net: number;         // เงินสดรับสุทธิ · จำนวนเงินรวมทั้งสิ้น = base_amt + vat_amt (= net + wht_amt)
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
  color?: string;             // 0106 — สีวัสดุ (แยกจากชื่อ)
  unit_cost: number;          // ต้นทุนต่อหน่วยฐาน (ต่อเส้น/ชิ้น) ล่าสุด
  is_weight_based: boolean;   // true = อลู คิดต่อโล
  is_stocked?: boolean;       // 0125 — false = ของสั่งตามงาน (ไม่ได้สต็อกไว้) ใช้เป็นราคาอย่างเดียว ไม่หักสต็อก
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
  is_voided?: boolean;   // 0087 — ยกเลิกรายการ (soft void) + recompute
  void_reason?: string | null;
  voided_at?: string | null;
  edited_at?: string | null;
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
  line_id: string;            // ชื่อ/handle ที่ใช้ติดต่อ (ชื่อคอลัมน์เก่า — ไม่ได้แปลว่าเป็น LINE เสมอ)
  contact_channel?: string;   // (0122) LINE | FB | IG | OTHER — หัวเอกสารพิมพ์ป้ายตามช่องนี้
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
  discount_amt: number;            // ยอดรวมส่วนลดทั้งหมด (บาท) — ตัวตั้งจริง (billing ใช้ต่อ)
  discount_label?: string;         // หัวข้อส่วนลด (0092) — โชว์เมื่อมีข้อเดียว
  discounts?: { label?: string; pct?: number; amt?: number }[]; // ส่วนลดหลายรายการ (0105 · breakdown โชว์แยกข้อ)
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
  STORE: "สโตร์ (ไม่เห็นราคา)",
};
