import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

// GET /api/issues — list + admin track filters/sort/aggregate
// filters: ?status=&severity=&phase=&owner=&overdue=1 · sort priority desc, due asc
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("issues", "read");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const phase = url.searchParams.get("phase");
  const severity = url.searchParams.get("severity");
  const owner = url.searchParams.get("owner");
  const overdue = url.searchParams.get("overdue") === "1";
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let query = ctx.supabase
    .from("issues")
    .select("*, job:job_id(job_code, customer_name), owner:owner_id(full_name)")
    // track order: ด่วนสุดก่อน, ครบกำหนดใกล้สุดก่อน, ใหม่สุดท้าย
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (phase) query = query.eq("phase", phase);
  if (severity) query = query.eq("severity", severity);
  if (owner) query = query.eq("owner_id", owner);
  if (overdue) query = query.lt("due_date", today).neq("status", "CLOSED");

  const { data, error } = await query;
  if (error) throw dbError(error);
  const rows = data ?? [];

  // ---------- aggregate (แถบสรุปแอดมิน) — นับจากของที่ filter แล้ว ----------
  const open = rows.filter((r) => r.status !== "CLOSED");
  const byStatus = { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 } as Record<string, number>;
  const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0 } as Record<string, number>;
  for (const r of rows) {
    if (r.status in byStatus) byStatus[r.status]++;
    if (r.severity in bySeverity) bySeverity[r.severity]++;
  }
  const overdueCount = open.filter((r) => r.due_date && r.due_date < today).length;
  const urgentCount = open.filter((r) => r.severity === "HIGH" || (r.priority ?? 0) >= 2).length;
  // ค้างนานสุด: อายุ (วัน) ของ open issue เก่าสุด
  let oldestDays = 0;
  for (const r of open) {
    const ref = r.reported_at ?? r.created_at;
    if (!ref) continue;
    const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
    if (days > oldestDays) oldestDays = days;
  }

  // รายชื่อผู้รับผิดชอบ (สำหรับ filter/assign) — authorized แล้วผ่าน issues:read
  const { data: owners } = await ctx.supabase
    .from("profiles").select("id, full_name").eq("is_active", true).order("full_name");

  return ok(rows, {
    can_write: can(ctx.role, "issues", "write"),
    owners: owners ?? [],
    aggregate: {
      total: rows.length,
      open: byStatus.OPEN + byStatus.IN_PROGRESS,
      by_status: byStatus,
      by_severity: bySeverity,
      overdue: overdueCount,
      urgent: urgentCount,
      oldest_days: oldestDays,
    },
  });
});

const createSchema = z.object({
  job_id: z.string().uuid(),
  phase: z.enum(["SALES", "MEASUREMENT", "PRODUCTION", "INSTALLATION", "POST_SALE"]),
  type: z.enum(["WRONG_DESIGN", "CUSTOMER_CHANGES", "MATERIAL_SHORTAGE", "PRODUCTION_DELAY", "INSTALLATION_DELAY", "CUSTOMER_COMPLAINT", "OTHER"]).default("OTHER"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  detail: z.string().min(1, "กรุณาระบุรายละเอียดปัญหา"),
  owner_name: z.string().optional(),
});

// POST /api/issues — แจ้งปัญหาใหม่เอง (issue_code มาจาก trigger)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("issues", "write");
  const body = createSchema.parse(await req.json());
  const { data, error } = await ctx.supabase
    .from("issues")
    .insert({ ...body, reporter_id: ctx.user.id, is_auto_created: false, status: "OPEN" })
    .select()
    .single();
  if (error) throw dbError(error);
  if (!data) throw dbError({ message: "Insert failed" });
  await audit({ jobId: body.job_id, userId: ctx.user.id, action: "ISSUE_CREATED", table: "issues", recordId: data.id });
  return created(data);
});
