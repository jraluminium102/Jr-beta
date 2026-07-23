import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { can } from "@/lib/rbac";
import { buildScheduleRows, createAdhocJob } from "@/lib/production/schedule";
import { requireChangOr } from "@/lib/bff/chang-ctx";

// ── ตารางผลิตสำหรับช่าง (งานในระบบ + งานจดเอง) ──
// ⚠ query อยู่ใน src/lib/production/schedule.ts — "ตัวเดียวกับลิงก์ช่าง /api/chang/<token>"
//   ห้ามเขียน query ซ้ำที่นี่ ไม่งั้น 2 ทางจะหลุดกันเงียบ ๆ อีก (เคยเกิดมาแล้ว)
// รับทั้งคนล็อกอิน และ "ช่างผ่านลิงก์" (โทเคน) — ตอบ role=CHANG ให้หน้าเดิมเข้าโหมดช่างเอง
export const GET = withRoute(async (req: Request) => {
  const ctx = await requireChangOr(req, "production", "read");
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

// POST — เพิ่ม "งานจดเอง" (รับทั้งคนล็อกอิน + ช่างผ่านลิงก์ · เจ้าของสั่ง 22 ก.ค.69 ให้ช่างลิงก์เพิ่มได้)
// ⚠ เปลี่ยน 23 ก.ค.69 (เจ้าของสั่ง): งานจดเอง = "งานจริง" (job+production) ไม่ใช่ adhoc_production_tasks อีกต่อไป
//   → กดดูรายละเอียด/เปลี่ยนสถานะ/เช็คลิสต์กระจก/แบบ/QC/ใบตัด ได้ครบเหมือนลูกค้าทั่วไปทุกหน้า
//   status งาน = DEPOSITED (งาน active) แต่ "ไม่ใส่ deposit_amount" → trigger on_deposit สร้าง production ให้ · ไม่สร้าง finance (กันเงินปลอม)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requireChangOr(req, "production", "write");
  const b = createSchema.parse(await req.json());
  const sb = ctx.supabase as unknown as { from: (t: string) => any };
  const uid = ctx.user.id || null;   // ช่างผ่านลิงก์ไม่มี session → created_by = null
  const detail = [b.title, b.producer_note].filter(Boolean).join(" · ");
  const remark = detail || (ctx.isChang && ctx.actorName ? `งานจดเอง โดย ${ctx.actorName}` : "งานจดเอง (เพิ่มในตารางผลิต)");

  // สร้างงานจริง (job+production เข้าคิวผลิต) ผ่าน helper กลาง — ดู createAdhocJob ใน schedule.ts
  //   (อยู่ในไฟล์กลางเพื่อคง parity: route นี้ห้าม query productions ตรง ๆ)
  const job = await createAdhocJob(sb, {
    customer_name: b.customer_name, remark, install_date: b.install_date, produce_date: b.produce_date,
  });

  if (uid) {
    await audit({
      jobId: job.id as string, userId: uid, action: "ADHOC_JOB_CREATED",
      table: "jobs", recordId: job.id as string, newValue: { customer_name: b.customer_name, via: "งานจดเอง" },
    });
  }
  return created(job);
});
