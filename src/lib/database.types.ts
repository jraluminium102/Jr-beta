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

// ─── Row types ────────────────────────────────────────────────────────────────
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

// ─── Supabase Database type (must include Relationships/Views/CompositeTypes) ─
// @supabase/supabase-js v2 GenericTable requires Relationships field.
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
      profiles:        Tbl<Profile>;
      jobs:            Tbl<Job>;
      productions:     Tbl<Production>;
      installations:   Tbl<Installation>;
      issues:          Tbl<Issue>;
      finance_entries: Tbl<FinanceEntry>;
      audit_logs:      Tbl<AuditLog>;
      job_sequence:    Tbl<{ year: number; last_seq: number }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      role_t:         Role;
      channel_t:      Channel;
      job_status_t:   JobStatus;
      prod_status_t:  ProdStatus;
      inst_status_t:  InstStatus;
      issue_status_t: IssueStatus;
      payment_type_t: PaymentType;
    };
    CompositeTypes: Record<string, never>;
  };
}
