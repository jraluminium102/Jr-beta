import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { STAGE_NAMES } from "@/lib/stages";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Stages 3-8: ตั้งแต่ฝ่ายแบบวาดแบบ → ลูกค้ามัดจำ (ขยายจาก 5-7 เพื่อ hub ติดตามงาน)
const CLOSURE_STAGES = [3, 4, 5, 6, 7, 8] as const;
// Statuses that mean the job has moved past deposit — exclude from closure view
const POST_DEPOSIT_STATUSES = ["DEPOSITED", "IN_PRODUCTION", "INSTALLING", "COMPLETED", "CANCELLED"] as const;

// Shape of each row returned to the client
export type ClosureRow = {
  id: string;
  job_code: string | null;
  customer_name: string;
  customer_tel: string | null;       // ไว้ไล่โทรปิดการขาย
  current_stage: number;
  stage_name: string;
  status: string;
  design_state: string;
  remark: string | null;             // โน้ตเซลล์ / สถานะติดตามคร่าวๆ
  quote_sent_date: string | null;    // วันส่งใบเสนอ
  days_waiting: number | null;       // กี่วันแล้วที่รอ (จากวันส่งใบเสนอ)
  estimator_name: string | null;     // ผู้รับผิดชอบ
  /** Latest quotation linked to this job */
  quotation_id: number | null;
  quotation_code: string | null;
  net: number | null;
  /** Allowed to send back to designer revision (เฉพาะ stage 5/6) */
  can_revise: boolean;
};

// GET /api/sales-closure — jobs ปิดการขาย (stage 3-8) พร้อม quotation ล่าสุด
// query: ?stage=N (กรองขั้นเดียว), ?my=1 (เฉพาะของฉัน), ?q= (ค้นชื่อ/job_code)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("sales_closure", "read");
  const sb = ctx.supabase as { from: (t: string) => any };
  const url = new URL(req.url);
  const stageF = url.searchParams.get("stage");
  const q = url.searchParams.get("q");
  const myOnly = url.searchParams.get("my") === "1";

  // Fetch jobs at closure stages OR with quote_sent_date set (safety net for stage drift)
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
        "remark",
        "quote_sent_date",
        "estimator:estimator_id(id,full_name)",
        // PostgREST: embed ผ่าน FK quotations.job_id ให้ชัด (ไม่งั้นใบเสนอ job_id=null resolve ไม่เจอ ขึ้น '—')
        "quotations!quotations_job_id_fkey(id, code, net, created_at)",
      ].join(",")
    )
    .or(`current_stage.in.(${CLOSURE_STAGES.join(",")}),quote_sent_date.not.is.null`)
    .not("status", "in", `(${POST_DEPOSIT_STATUSES.join(",")})`)
    .order("year", { ascending: false })
    .order("sequence", { ascending: false });

  if (q) query = query.or(`customer_name.ilike.%${q}%,job_code.ilike.%${q}%`);
  if (myOnly) query = query.eq("estimator_id", ctx.user.id);

  const { data: jobs, error } = await query;
  if (error) throw new Error(error.message);

  // Determine whether the caller has write permission (for showing action buttons)
  const canWrite = can(ctx.role, "sales_closure", "write");

  const rows: ClosureRow[] = (jobs ?? []).map((j: Record<string, unknown>) => {
    // PostgREST returns embedded rows as array; pick the latest by created_at
    const quotes = Array.isArray(j.quotations)
      ? (j.quotations as { id: number; code: string; net: number | null; created_at: string }[])
      : j.quotations
      ? [j.quotations as { id: number; code: string; net: number | null; created_at: string }]
      : [];

    const latestQ = quotes.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0] ?? null;

    const stage = Number(j.current_stage);
    const qsd = (j.quote_sent_date as string | null) ?? null;
    const daysWaiting = qsd
      ? Math.max(0, Math.floor((Date.now() - new Date(qsd).getTime()) / 86400000))
      : null;
    const est = j.estimator as { id: string | null; full_name: string | null } | null;

    return {
      id: j.id as string,
      job_code: j.job_code as string | null,
      customer_name: j.customer_name as string,
      customer_tel: (j.customer_tel as string | null) ?? null,
      current_stage: stage,
      stage_name: STAGE_NAMES[stage] ?? `ขั้น ${stage}`,
      status: j.status as string,
      design_state: j.design_state as string,
      remark: (j.remark as string | null) ?? null,
      quote_sent_date: qsd,
      days_waiting: daysWaiting,
      estimator_name: est?.full_name ?? null,
      quotation_id: latestQ?.id ?? null,
      quotation_code: latestQ?.code ?? null,
      net: latestQ?.net ?? null,
      // ส่งแก้แบบเฉพาะ stage 5/6 (stage 7 ส่งใบเสนอแล้ว + RPC ไม่มี loop 7→x)
      can_revise: canWrite && (stage === 5 || stage === 6),
    };
  });

  // กรอง stage เดียวถ้าส่ง ?stage=
  const filtered = stageF ? rows.filter((r) => r.current_stage === Number(stageF)) : rows;

  const netSum = filtered.reduce((s, r) => s + (r.net ?? 0), 0);
  const waiting7 = filtered.filter((r) => (r.days_waiting ?? 0) > 7).length;
  return ok(filtered, { can_write: canWrite, net_sum: netSum, waiting_7: waiting7 });
});

