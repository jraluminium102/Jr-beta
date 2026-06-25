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
      .select("id, job_id, status, production_queued, production_due_date, planned_install_date, producer_note, job:job_id(job_code, customer_name, customer_area, status)")
      .in("status", ["QUEUED", "MANUFACTURING", "QC", "READY"]),
    sb
      .from("adhoc_production_tasks")
      .select("*")
      .neq("status", "DONE"),
  ]);

  // ── ดึงชุดงานผลิต (production_sets) ของ job ที่อยู่ในคิว — สำหรับเช็คลิสต์ช่าง ──
  const jobIds = (prods ?? [])
    .map((p: Record<string, unknown>) => p.job_id as string | null)
    .filter((x): x is string => !!x);
  let setsByJob: Record<string, Record<string, unknown>[]> = {};
  if (jobIds.length) {
    const { data: sets } = await sb
      .from("production_sets")
      .select("id, job_id, set_label, seq, design_received, glass_installed, qc_before_glass, qc_after_glass, glass_spec, screen_type, screen_installed, glass_order, mat_equipment, mat_alu_normal, mat_alu_painted, frame_status, measurer_name, measure_actual, must_finish_date, glass_done_date, actual_done_date, install_date, note")
      .in("job_id", jobIds)
      .order("seq", { ascending: true })
      .order("id", { ascending: true });
    setsByJob = (sets ?? []).reduce((acc: Record<string, Record<string, unknown>[]>, s: Record<string, unknown>) => {
      const jid = s.job_id as string;
      (acc[jid] ??= []).push(s);
      return acc;
    }, {});
  }

  // ตัดงานที่ job ถูกยกเลิก
  const jobRows = (prods ?? [])
    .filter((p: Record<string, unknown>) => (p.job as { status?: string } | null)?.status !== "CANCELLED")
    .map((p: Record<string, unknown>) => {
      const job = p.job as { job_code?: string; customer_name?: string; customer_area?: string } | null;
      return {
        kind: "job" as const,
        id: p.id as string,
        job_id: (p.job_id as string | null) ?? null,
        title: job?.customer_name ?? "—",
        subtitle: job?.customer_area ?? null,
        job_code: job?.job_code ?? null,
        customer_area: job?.customer_area ?? null,
        produce_date: (p.production_queued as string | null) ?? null,
        due_date: (p.production_due_date as string | null) ?? null,   // วันกำหนดเสร็จ = หัววันในตาราง
        install_date: (p.planned_install_date as string | null) ?? null,
        producer_note: (p.producer_note as string | null) ?? null,
        status: p.status as string,
        sets: p.job_id ? (setsByJob[p.job_id as string] ?? []) : [],
      };
    });

  const adhocRows = (adhoc ?? []).map((a: Record<string, unknown>) => ({
    kind: "adhoc" as const,
    id: a.id as string,
    // ลูกค้าเป็นชื่อหลัก (bold), ชื่อ/รายละเอียดงานเป็นบรรทัดรอง
    title: (a.customer_name as string) || (a.title as string) || "—",
    // โชว์ชื่องานเป็นบรรทัดรอง เฉพาะเมื่อต่างจากชื่อลูกค้า (กันซ้ำเมื่อ fallback)
    subtitle: (a.title && a.title !== a.customer_name) ? (a.title as string) : null,
    job_code: null,
    customer_area: null,
    produce_date: (a.produce_date as string | null) ?? null,
    due_date: (a.produce_date as string | null) ?? null,   // adhoc ใช้วันที่จดเองเป็นหัววัน
    install_date: (a.install_date as string | null) ?? null,
    producer_note: (a.producer_note as string | null) ?? null,
    customer_name: (a.customer_name as string | null) ?? null,
    status: (a.status as string) ?? "QUEUED",
    job_id: null as string | null,
    sets: [] as Record<string, unknown>[],
  }));

  // เรียงงานด่วนก่อน: ตามวันกำหนดเสร็จ (due_date) ใกล้สุดขึ้นก่อน · ไม่มีวันไปท้าย
  const rows = [...jobRows, ...adhocRows].sort((a, b) =>
    (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99")
  );

  return ok(rows, { can_write: can(ctx.role, "production", "write"), role: ctx.role });
});

const createSchema = z.object({
  customer_name: z.string().min(1, "กรุณาระบุชื่อลูกค้า"),
  title: z.string().nullish(),   // ชื่อ/รายละเอียดงาน (ไม่บังคับ)
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
      title: b.title || b.customer_name,   // ถ้าไม่กรอกชื่องาน ใช้ชื่อลูกค้าแทน (กัน NOT NULL)
      customer_name: b.customer_name,
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
