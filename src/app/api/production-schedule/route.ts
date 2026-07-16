import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { can } from "@/lib/rbac";
import { buildScheduleRows } from "@/lib/production/schedule";

// ── ตารางผลิตสำหรับช่าง (งานในระบบ + งานจดเอง) ──
// ⚠ query อยู่ใน src/lib/production/schedule.ts — "ตัวเดียวกับลิงก์ช่าง /api/chang/<token>"
//   ห้ามเขียน query ซ้ำที่นี่ ไม่งั้น 2 ทางจะหลุดกันเงียบ ๆ อีก (เคยเกิดมาแล้ว)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");
  const rows = await buildScheduleRows(ctx.supabase as unknown as { from: (t: string) => any });
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
