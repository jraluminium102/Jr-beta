import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { STAGE_NAMES } from "@/lib/stages";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Statuses that mean the job has moved past deposit — exclude from closure view
const POST_DEPOSIT_STATUSES = [
  "DEPOSITED",
  "IN_PRODUCTION",
  "INSTALLING",
  "COMPLETED",
  "CANCELLED",
] as const;

// ปรับ closure_stage จาก design_state + quote_sent_date (priority order)
// 1. REVISING  → 'revising'
// 2. quote_sent_date != null → 'sent'
// 3. else → 'await'
type ClosureStage = "await" | "sent" | "revising";

function classifyStage(designState: string, quoteSentDate: string | null): ClosureStage {
  if (designState === "REVISING") return "revising";
  if (quoteSentDate != null) return "sent";
  return "await";
}

// Shape of each row returned to the client
export type ClosureRow = {
  id: string;
  job_code: string | null;
  customer_name: string;
  customer_tel: string | null;
  current_stage: number;
  stage_name: string;
  status: string;
  design_state: string;
  remark: string | null;
  quote_sent_date: string | null;
  days_waiting: number | null;
  estimator_name: string | null;
  /** Latest quotation linked to this job */
  quotation_id: number | null;
  quotation_code: string | null;
  net: number | null;
  /** New: closure stage derived from design_state + quote_sent_date */
  closure_stage: ClosureStage;
  /** New: number of design revisions */
  design_revise_count: number;
  /** New: status of the latest quotation (draft/sent/approved/null) */
  quotation_status: string | null;
  /** New: whether a quotation exists at all */
  has_quotation: boolean;
  /** Allowed to send back to designer revision (closure_stage === 'sent') */
  can_revise: boolean;
};

// GET /api/sales-closure — งานที่ยังไม่ post-deposit พร้อม quotation ล่าสุด
// query: ?stage=await|sent|revising (กรองสเตจ), ?my=1 (เฉพาะของฉัน), ?q= (ค้นชื่อ/job_code)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("sales_closure", "read");
  const sb = ctx.supabase as { from: (t: string) => any };
  const url = new URL(req.url);
  const stageF = url.searchParams.get("stage") as ClosureStage | null; // 'await'|'sent'|'revising'|null
  const q = url.searchParams.get("q");
  const myOnly = url.searchParams.get("my") === "1";

  // ดึง jobs ที่ยังไม่ผ่าน deposit — กรอง status ออก POST_DEPOSIT_STATUSES
  let query = sb
    .from("jobs")
    .select(
      [
        "id",
        "job_code",
        "customer_name",
        "customer_tel",
        "current_stage",
        "status",
        "design_state",
        "design_revise_count",
        "remark",
        "quote_sent_date",
        "estimator:estimator_id(id,full_name)",
        "quotations!quotations_job_id_fkey(id, code, net, status, created_at)",
      ].join(",")
    )
    .not("status", "in", `(${POST_DEPOSIT_STATUSES.join(",")})`)
    .order("year", { ascending: false })
    .order("sequence", { ascending: false });

  if (q) query = query.or(`customer_name.ilike.%${q}%,job_code.ilike.%${q}%`);
  if (myOnly) query = query.eq("estimator_id", ctx.user.id);

  const { data: jobs, error } = await query;
  if (error) throw new Error(error.message);

  const canWrite = can(ctx.role, "sales_closure", "write");

  const rows: ClosureRow[] = (jobs ?? []).map((j: Record<string, unknown>) => {
    // PostgREST returns embedded rows as array; pick the latest by created_at
    const quotes = Array.isArray(j.quotations)
      ? (j.quotations as { id: number; code: string; net: number | null; status: string; created_at: string }[])
      : j.quotations
      ? [j.quotations as { id: number; code: string; net: number | null; status: string; created_at: string }]
      : [];

    const latestQ = quotes.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] ?? null;

    const stage = Number(j.current_stage);
    const qsd = (j.quote_sent_date as string | null) ?? null;
    const designState = (j.design_state as string) ?? "NOT_STARTED";
    const daysWaiting = qsd
      ? Math.max(0, Math.floor((Date.now() - new Date(qsd).getTime()) / 86400000))
      : null;
    const est = j.estimator as { id: string | null; full_name: string | null } | null;
    const closureStage = classifyStage(designState, qsd);

    return {
      id: j.id as string,
      job_code: j.job_code as string | null,
      customer_name: j.customer_name as string,
      customer_tel: (j.customer_tel as string | null) ?? null,
      current_stage: stage,
      stage_name: STAGE_NAMES[stage] ?? `ขั้น ${stage}`,
      status: j.status as string,
      design_state: designState,
      design_revise_count: (j.design_revise_count as number) ?? 0,
      remark: (j.remark as string | null) ?? null,
      quote_sent_date: qsd,
      days_waiting: daysWaiting,
      estimator_name: est?.full_name ?? null,
      quotation_id: latestQ?.id ?? null,
      quotation_code: latestQ?.code ?? null,
      quotation_status: latestQ?.status ?? null,
      has_quotation: latestQ != null,
      net: latestQ?.net ?? null,
      closure_stage: closureStage,
      // can_revise เฉพาะ sent (quote ส่งแล้ว, ไม่ใช่ revising แล้ว)
      can_revise: canWrite && closureStage === "sent",
    };
  });

  // คำนวณ counts จากทุกงาน (ก่อนกรอง ?stage) เพื่อให้ chip โชว์เลขครบ
  const counts: Record<ClosureStage, number> = {
    await: rows.filter((r) => r.closure_stage === "await").length,
    sent: rows.filter((r) => r.closure_stage === "sent").length,
    revising: rows.filter((r) => r.closure_stage === "revising").length,
  };

  // กรองตาม ?stage ถ้ามี
  const filtered = stageF ? rows.filter((r) => r.closure_stage === stageF) : rows;

  // net_sum และ waiting_7 จาก 'sent' เท่านั้น (ตาม SDD)
  const sentRows = rows.filter((r) => r.closure_stage === "sent");
  const netSum = sentRows.reduce((s, r) => s + (r.net ?? 0), 0);
  const waiting7 = sentRows.filter((r) => (r.days_waiting ?? 0) > 7).length;

  return ok(filtered, {
    can_write: canWrite,
    counts,
    net_sum: netSum,
    waiting_7: waiting7,
  });
});
