import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { requireChangOr } from "@/lib/bff/chang-ctx";
import { buildScheduleRows } from "@/lib/production/schedule";

export const dynamic = "force-dynamic";

/**
 * GET /api/alu-picks/jobs → งานที่อยู่ในตารางผลิต (ชุดเดียวกับที่ช่างเห็นบนลิงก์ช่าง — ใช้ buildScheduleRows ตัวเดียวกัน)
 *   ช่างกดชื่อลูกค้าจากตรงนี้ตอนเบิก · เรียงตามวันกำหนดเสร็จ
 */
export const GET = withRoute(async (req: Request) => {
  // สิทธิ์ "stock" (ไม่ใช่ production) — role สโตร์ไม่มี production แต่ต้องเห็นรายชื่องานตอนเบิกแทนช่าง
  const ctx = await requireChangOr(req, "stock", "read");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await buildScheduleRows(ctx.supabase as unknown as { from: (t: string) => any });
  const jobs = rows
    .filter((r) => r.kind === "job" && r.job_id)
    .map((r) => ({
      job_id: r.job_id as string, title: r.title, job_code: r.job_code, subtitle: r.subtitle,
      due_date: r.due_date, install_date: r.install_date, status: r.status,
    }))
    // กำลังทำอยู่ขึ้นก่อน (ผลิตเสร็จแล้ว READY ไว้ท้าย) แล้วเรียงวันกำหนดเสร็จ
    .sort((a, b) => (Number(a.status === "READY") - Number(b.status === "READY")) || String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")));
  return ok(jobs);
});
