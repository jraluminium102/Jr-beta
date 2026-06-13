import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { CHECKLIST_MARKER } from "@/lib/checklist-marker";

export const dynamic = "force-dynamic";

export type ChecklistQuotation = {
  id: number;
  code: string;
  net: number;
  status: string;
  note: string;
};

export type ChecklistItem = {
  job_id: string;
  job_code: string | null;
  customer_name: string;
  customer_area: string | null;
  assess_date: string | null;
  design_state: string;
  design_end: string | null;
  quotation: ChecklistQuotation | null;
};

export type ChecklistData = {
  pending:  ChecklistItem[];
  drafted:  ChecklistItem[];
  sent:     ChecklistItem[];
};

/**
 * GET /api/quotation-checklist
 *
 * คืน 3 เลน:
 *  pending  — design_state=DONE, status in (LEAD,PENDING_QUOTE), ยังไม่มีใบเช็คลิสต์ active
 *  drafted  — มีใบเช็คลิสต์ status='draft'
 *  sent     — มีใบเช็คลิสต์ status in ('sent','approved')
 */
export const GET = withRoute(async () => {
  // ตรวจสิทธิ์ก่อน (jobs:read = ทุก role ยกเว้น VIEWER ที่ไม่มี jobs write)
  const ctx = await requirePermission("jobs", "read");

  // ใช้ createClient() ตรงๆ (untyped) เพราะ Database type ไม่มี quotations/customers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any;

  // BUG-06: คำนวณ can_write จาก role จริง (ADMIN/SALES/DESIGNER มี jobs:write)
  // ส่งกลับใน meta เพื่อให้ client ใช้ตัดสิน แทนการ set canWrite=true เสมอ
  const canWrite = can(ctx.role, "jobs", "write");

  // โหลด jobs ที่ design_state=DONE และ status ไม่ใช่ COMPLETED/CANCELLED
  const { data: jobs, error: jErr } = await sb
    .from("jobs")
    .select("id, job_code, customer_name, customer_area, assess_date, design_state, design_end, status")
    .eq("design_state", "DONE")
    .not("status", "in", "(COMPLETED,CANCELLED)")
    .order("assess_date", { ascending: false })
    .limit(500);
  if (jErr) throw new Error(jErr.message);

  type JobRow = {
    id: string;
    job_code: string | null;
    customer_name: string;
    customer_area: string | null;
    assess_date: string | null;
    design_state: string;
    design_end: string | null;
    status: string;
  };

  const jobRows = (jobs ?? []) as JobRow[];

  if (jobRows.length === 0) {
    return ok<ChecklistData>({ pending: [], drafted: [], sent: [] }, { can_write: canWrite });
  }

  const jobIds = jobRows.map((j) => j.id);

  // โหลดใบเสนอราคาที่มี marker ทั้งหมดของ jobs เหล่านี้ (ยกเว้น cancelled)
  const { data: quotations, error: qErr } = await sb
    .from("quotations")
    .select("id, code, net, status, note, job_id")
    .in("job_id", jobIds)
    .ilike("note", `${CHECKLIST_MARKER}%`)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (qErr) throw new Error(qErr.message);

  type QuotRow = { id: number; code: string; net: number; status: string; note: string; job_id: string };

  // map: job_id → ใบเช็คลิสต์ล่าสุด (เรียง created_at desc แล้ว → ตัวแรกของแต่ละ job_id)
  const qMap = new Map<string, ChecklistQuotation>();
  for (const q of (quotations ?? []) as QuotRow[]) {
    if (!qMap.has(q.job_id)) {
      qMap.set(q.job_id, { id: q.id, code: q.code, net: q.net, status: q.status, note: q.note });
    }
  }

  const pending:  ChecklistItem[] = [];
  const drafted:  ChecklistItem[] = [];
  const sent:     ChecklistItem[] = [];

  for (const j of jobRows) {
    const q = qMap.get(j.id) ?? null;
    const item: ChecklistItem = {
      job_id:        j.id,
      job_code:      j.job_code,
      customer_name: j.customer_name,
      customer_area: j.customer_area,
      assess_date:   j.assess_date,
      design_state:  j.design_state,
      design_end:    j.design_end,
      quotation:     q,
    };

    if (!q) {
      // ไม่มีใบเช็คลิสต์ active → pending (เฉพาะ LEAD / PENDING_QUOTE)
      if (["LEAD", "PENDING_QUOTE"].includes(j.status)) {
        pending.push(item);
      }
    } else if (q.status === "draft") {
      drafted.push(item);
    } else if (["sent", "approved"].includes(q.status)) {
      sent.push(item);
    }
  }

  return ok<ChecklistData>({ pending, drafted, sent }, { can_write: canWrite });
});
