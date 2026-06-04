// Hand-maintained schema types for JR OMS.
// Run `npm run db:types` after schema changes to regenerate from Supabase.

// ─── Domain Enums ─────────────────────────────────────────────────────────────
export type Role = "ADMIN" | "SALES" | "DESIGNER" | "PRODUCTION" | "INSTALLER" | "ACCOUNTING" | "VIEWER";
export type Channel = "LINE" | "FACEBOOK" | "INSTAGRAM" | "OTHER";
export type JobStatus = "PENDING_QUOTE" | "QUOTE_SENT" | "PENDING_DECISION" | "DEPOSITED" | "CANCELLED" | "COMPLETED";
export type ProdStatus = "PENDING_MEASURE" | "MEASURED" | "PENDING_MEETING" | "REVISING" | "PENDING_CONFIRM" | "QUEUED" | "MANUFACTURING" | "QC" | "READY" | "ISSUE";
export type InstStatus = "PENDING" | "INSTALLING" | "PENDING_INSPECT" | "REVISING" | "COMPLETED" | "ISSUE";
export type InspectResult = "PASSED" | "MINOR_FIX" | "REJECTED";
export type QcResult = "PASSED" | "FAILED";
export type IssueStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";
export type IssuePhase = "SALES" | "MEASUREMENT" | "PRODUCTION" | "INSTALLATION" | "POST_SALE";
export type IssueType = "WRONG_DESIGN" | "CUSTOMER_CHANGES" | "MATERIAL_SHORTAGE" | "PRODUCTION_DELAY" | "INSTALLATION_DELAY" | "CUSTOMER_COMPLAINT" | "OTHER";
export type PaymentType = "DEPOSIT" | "INSTALLMENT_2" | "INSTALLMENT_3" | "FINAL";
export type PaymentChannel = "TRANSFER" | "CASH" | "CHEQUE";
// Acct enums
export type QuotationStatus = "draft" | "sent" | "approved" | "cancelled";
export type BillingStatus = "unpaid" | "partial" | "paid" | "cancelled";
export type InstallmentStatus = "pending" | "paid";
export type ProductionOrderStatus = "queued" | "measuring" | "manufacturing" | "qc" | "ready" | "installed" | "done" | "cancelled";
export type StockMoveType = "in" | "out" | "adjust";

// ─── Row types — OMS ──────────────────────────────────────────────────────────
export interface Profile {
  id: string; email: string | null; full_name: string | null; avatar_url: string | null;
  role: Role; is_active: boolean; created_at: string; updated_at: string;
}
export interface Job {
  id: string; job_code: string | null; year: number; sequence: number;
  customer_name: string; customer_tel: string | null; customer_area: string | null;
  channel: Channel; assess_date: string;
  estimator_id: string | null; designer_id: string | null;
  design_start: string | null; design_end: string | null; quote_sent_date: string | null;
  discount_amount: number | null; net_amount: number | null; vat_amount: number | null; total_amount: number | null;
  status: JobStatus; deposit_amount: number | null; deposit_date: string | null;
  cancel_reason: string | null; remark: string | null; created_at: string; updated_at: string;
}
export interface Production {
  id: string; job_id: string; status: ProdStatus;
  planned_install_date: string | null; measure_scheduled: string | null; measure_actual: string | null;
  measurer_id: string | null; meeting_after_measure: string | null; design_revision_done: string | null;
  quote_revision_done: string | null; customer_confirmed: string | null; production_queued: string | null;
  alum_order_date: string | null; glass_order_date: string | null; production_done: string | null;
  qc_result: QcResult | null; qc_date: string | null; qc_note: string | null;
  notes: string | null; status_updated_at: string | null; remark: string | null;
  created_at: string; updated_at: string;
}
export interface Installation {
  id: string; job_id: string; status: InstStatus;
  install_scheduled: string | null; install_actual: string | null; lead_installer_id: string | null;
  inspect_date: string | null; inspect_result: InspectResult | null; inspect_note: string | null;
  revision_done: string | null; completed_date: string | null; warranty_until: string | null;
  problem1: string | null; responsible1: string | null; problem2: string | null; responsible2: string | null;
  problem3: string | null; responsible3: string | null; problem4: string | null; responsible4: string | null;
  remark: string | null; created_at: string; updated_at: string;
}
export interface Issue {
  id: string; issue_code: string | null; job_id: string; phase: IssuePhase; type: IssueType;
  detail: string; is_auto_created: boolean; reporter_id: string | null; reported_at: string;
  owner_id: string | null; owner_name: string | null; resolved_at: string | null; resolution: string | null;
  status: IssueStatus; created_at: string; updated_at: string;
}
export interface FinanceEntry {
  id: string; job_id: string; payment_date: string; amount: number; type: PaymentType;
  channel: PaymentChannel; note: string | null; is_auto_created: boolean;
  is_voided: boolean; void_reason: string | null; voided_at: string | null; voided_by: string | null;
  created_at: string; updated_at: string;
}
interface AuditLog {
  id: number; job_id: string | null; user_id: string | null; action: string;
  table_name: string; record_id: string | null; old_value: unknown; new_value: unknown; created_at: string;
}

// ─── Row types — Acct/Doc ─────────────────────────────────────────────────────
export interface Customer {
  id: number; name: string; job: string; address: string; tax_id: string;
  line_id: string; phone: string; contact_person: string; is_active: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface Quotation {
  id: number; code: string; customer_id: number | null; customer_snapshot: Record<string, unknown>;
  issue_date: string; status: QuotationStatus;
  vat_rate: number; discount_pct: number; wht_rate: number;
  subtotal: number; discount_amt: number; vat_amt: number; total: number; wht_amt: number; net: number;
  note: string; created_by: string | null; created_at: string; updated_at: string;
}
export interface QuotationItem {
  id: number; quotation_id: number; name: string; detail: string;
  qty: number; unit_price: number; line_total: number; sort_order: number;
}
export interface BillingNote {
  id: number; code: string; quotation_id: number | null; customer_snapshot: Record<string, unknown>;
  issue_date: string; total: number; status: BillingStatus; note: string;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface BillingInstallment {
  id: number; billing_note_id: number; seq: number; label: string; amount: number;
  due_date: string | null; status: InstallmentStatus; paid_amount: number;
  paid_date: string | null; sort_order: number;
}
export interface Receipt {
  id: number; code: string; billing_note_id: number | null; installment_id: number | null;
  customer_snapshot: Record<string, unknown>; issue_date: string;
  amount: number; vat_rate: number; vat_amt: number; net: number;
  payment_method: string; note: string; created_by: string | null; created_at: string;
}
export interface ProductionOrder {
  id: number; code: string; quotation_id: number | null; customer_snapshot: Record<string, unknown>;
  items: unknown[]; status: ProductionOrderStatus; measure_date: string | null;
  due_date: string | null; note: string; created_by: string | null; created_at: string; updated_at: string;
}
export interface Warranty {
  id: number; code: string; quotation_id: number | null; customer_snapshot: Record<string, unknown>;
  items: unknown[]; issue_date: string; warranty_months: number; expires_date: string | null;
  coverage: string; note: string; created_by: string | null; created_at: string;
}
export interface StockItem {
  id: number; sku: string; name: string; category: string; unit: string;
  qty_on_hand: number; min_qty: number; note: string; is_active: boolean;
  created_at: string; updated_at: string;
}
export interface StockMove {
  id: number; stock_item_id: number; type: StockMoveType; qty: number;
  ref: string; note: string; created_by: string | null; created_at: string;
}
export interface DocumentSequence {
  doc_type: string; last_seq: number; last_ym: string;
}

// ─── Supabase Database type ────────────────────────────────────────────────────
type Tbl<R, I = Partial<R>, U = Partial<R>> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: {
    foreignKeyName: string;
    columns: string[];
    isOneToOne: boolean;
    referencedRelation: string;
    referencedColumns: string[];
  }[];
};

export interface Database {
  public: {
    Tables: {
      // OMS tables
      profiles:           Tbl<Profile>;
      jobs:               Tbl<Job>;
      productions:        Tbl<Production>;
      installations:      Tbl<Installation>;
      issues:             Tbl<Issue>;
      finance_entries:    Tbl<FinanceEntry>;
      audit_logs:         Tbl<AuditLog>;
      job_sequence:       Tbl<{ year: number; last_seq: number }>;
      // Acct/Doc tables
      customers:              Tbl<Customer>;
      quotations:             Tbl<Quotation>;
      quotation_items:        Tbl<QuotationItem>;
      billing_notes:          Tbl<BillingNote>;
      billing_installments:   Tbl<BillingInstallment>;
      receipts:               Tbl<Receipt>;
      production_orders:      Tbl<ProductionOrder>;
      warranties:             Tbl<Warranty>;
      stock_items:            Tbl<StockItem>;
      stock_moves:            Tbl<StockMove>;
      document_sequences:     Tbl<DocumentSequence>;
    };
    Views: Record<string, never>;
    Functions: {
      next_document_code: {
        Args: { p_doc_type: string };
        Returns: string;
      };
    };
    Enums: {
      role_t:             Role;
      channel_t:          Channel;
      job_status_t:       JobStatus;
      prod_status_t:      ProdStatus;
      inst_status_t:      InstStatus;
      issue_status_t:     IssueStatus;
      payment_type_t:     PaymentType;
      quotation_status:   QuotationStatus;
      billing_status:     BillingStatus;
      installment_status: InstallmentStatus;
      production_status:  ProductionOrderStatus;
      stock_move_type:    StockMoveType;
    };
    CompositeTypes: Record<string, never>;
  };
}
