import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { can } from "@/lib/rbac";
import { toArray } from "@/lib/bff/normalize";

const FINANCE_COLS = ["net_amount", "vat_amount", "total_amount", "deposit_amount", "discount_amount"];

// GET /api/jobs — list (filter status, search, page)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("jobs", "read");
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));
  const from = (page - 1) * limit;

  // Build filter string for .or() separately to avoid type reassignment issues
  const orFilter = q
    ? `customer_name.ilike.%${q}%,job_code.ilike.%${q}%`
    : null;

  // Use the Supabase client as any to avoid complex generic chain type issues
  // (Supabase's PostgrestFilterBuilder generics are overly complex for conditional chaining)
  const sb = ctx.supabase as { from: (table: string) => any };

  let query = sb
    .from("jobs")
    .select(
      "*, estimator:estimator_id(full_name), designer:designer_id(full_name), productions(status,status_updated_at), installations(status), issues(id,status)",
      { count: "exact" }
    )
    .order("year", { ascending: false })
    .order("sequence", { ascending: false })
    .range(from, from + limit - 1);

  if (statusFilter) query = query.eq("status", statusFilter);
  if (orFilter) query = query.or(orFilter);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  const showFinance = can(ctx.role, "jobs:finance_fields", "read");
  const rows = (data ?? []).map((j: Record<string, unknown>) => {
    const issues = (j.issues as { status: string }[] | null) ?? [];
    const openIssues = issues.filter((i) => i.status !== "CLOSED").length;
    const out: Record<string, unknown> = { ...j, open_issues: openIssues, issues: undefined };
    // productions/installations เป็นความสัมพันธ์ 1:1 → PostgREST คืน object เดี่ยว
    // normalize เป็น array เสมอ เพื่อให้ frontend (board) อ่าน .length / [0] ได้
    out.productions = toArray(j.productions);
    out.installations = toArray(j.installations);
    if (!showFinance) FINANCE_COLS.forEach((c) => delete out[c]);
    return out;
  });

  return ok(rows, { total: count ?? 0, page, limit, can_finance: showFinance });
});

const createSchema = z.object({
  customer_name: z.string().min(1, "กรุณาระบุชื่อลูกค้า"),
  customer_tel: z.string().optional(),
  customer_area: z.string().optional(),
  channel: z.enum(["LINE", "FACEBOOK", "INSTAGRAM", "OTHER"]),
  assess_date: z.string().min(1, "กรุณาระบุวันเข้าประเมิน"),
  estimator_id: z.string().uuid().optional(),
});

// POST /api/jobs — create
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("jobs", "write");
  const body = createSchema.parse(await req.json());

  const { data, error } = await ctx.supabase
    .from("jobs")
    .insert({ ...body, status: "PENDING_QUOTE" })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");

  await audit({
    jobId: data.id,
    userId: ctx.user.id,
    action: "JOB_CREATED",
    table: "jobs",
    recordId: data.id,
    newValue: { job_code: data.job_code, customer_name: data.customer_name },
  });
  return created(data);
});
