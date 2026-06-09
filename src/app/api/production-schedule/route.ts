import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

// ── ตารางผลิตสำหรับช่าง — รวม 2 แหล่ง ──
// 1) งานในระบบ: productions ที่ status = QUEUED / MANUFACTURING (วันผลิตมาจากหน้างานผลิต)
// 2) งานจดเอง: adhoc_production_tasks (ช่างเพิ่มเอง ไม่ผ่าน flow ใบเสนอ)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");
  // adhoc_production_tasks ยังไม่อยู่ใน generated Database types → cast เพื่อเลี่ยง TS error
  const sb = ctx.supabase as unknown as { from: (t: string) => any };

  const [{ data: prods }, { data: adhoc }] = await Promise.all([
    ctx.supabase
      .from("productions")
      .select("id, status, production_queued, planned_install_date, producer_note, job:job_id(job_code, customer_name, customer_area, status)")
      .in("status", ["QUEUED", "MANUFACTURING"]),
    sb
      .from("adhoc_production_tasks")
      .select("*")
      .neq("status", "DONE"),
  ]);

  // ตัดงานที่ job ถูกยกเลิก
  const jobRows = (prods ?? [])
    .filter((p: Record<string, unknown>) => (p.job as { status?: string } | null)?.status !== "CANCELLED")
    .map((p: Record<string, unknown>) => {
      const job = p.job as { job_code?: string; customer_name?: string; customer_area?: string } | null;
      return {
        kind: "job" as const,
        id: p.id as string,
        title: job?.customer_name ?? "—",
        job_code: job?.job_code ?? null,
        customer_area: job?.customer_area ?? null,
        produce_date: (p.production_queued as string | null) ?? null,
        install_date: (p.planned_install_date as string | null) ?? null,
        producer_note: (p.producer_note as string | null) ?? null,
        status: p.status as string,
      };
    });

  const adhocRows = (adhoc ?? []).map((a: Record<string, unknown>) => ({
    kind: "adhoc" as const,
    id: a.id as string,
    title: (a.title as string) ?? "—",
    job_code: null,
    customer_area: null,
    produce_date: (a.produce_date as string | null) ?? null,
    install_date: (a.install_date as string | null) ?? null,
    producer_note: (a.producer_note as string | null) ?? null,
    customer_name: (a.customer_name as string | null) ?? null,
    status: (a.status as string) ?? "QUEUED",
  }));

  const rows = [...jobRows, ...adhocRows].sort((a, b) =>
    (a.produce_date ?? "9999-99-99").localeCompare(b.produce_date ?? "9999-99-99")
  );

  return ok(rows, { can_write: can(ctx.role, "production", "write") });
});

const createSchema = z.object({
  title: z.string().min(1, "กรุณาระบุชื่องาน"),
  customer_name: z.string().nullish(),
  produce_date: z.string().nullish(),
  install_date: z.string().nullish(),
  producer_note: z.string().nullish(),
});

// POST — เพิ่มงานผลิตแบบจดเอง
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const b = createSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as { from: (t: string) => any };

  const { data, error } = await sb
    .from("adhoc_production_tasks")
    .insert({
      title: b.title,
      customer_name: b.customer_name || null,
      produce_date: b.produce_date || null,
      install_date: b.install_date || null,
      producer_note: b.producer_note || null,
      status: "QUEUED",
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "เพิ่มงานไม่สำเร็จ");

  await audit({
    jobId: null, userId: ctx.user.id, action: "ADHOC_PRODUCTION_CREATED",
    table: "adhoc_production_tasks", recordId: data.id as string, newValue: { title: b.title },
  });
  return created(data);
});
