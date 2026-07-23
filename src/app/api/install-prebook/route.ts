import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// POST /api/install-prebook — "จองคิวติดตั้งล่วงหน้า" สำหรับงานที่ยังผลิตไม่เสร็จ (เจ้าของสั่ง 23 ก.ค.69)
//   = set productions.planned_install_date (ฟิลด์เดียว) → โชว์ทั้งหน้าติดตั้ง (overlay จองจากผลิต) + หน้าผลิต
//   → วันติดตั้งลิงก์สองทางเองโดยธรรมชาติ (แก้ที่ไหนก็ตรงกัน · trigger 0024 sync installations ให้)
//   date = null → ยกเลิกการจอง
const Schema = z.object({
  production_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  const { data, error } = await sb
    .from("productions")
    .update({ planned_install_date: p.data.date })
    .eq("id", p.data.production_id)
    .select("id, job_id, planned_install_date")
    .single();
  if (error) return err("บันทึกวันจองไม่สำเร็จ: " + error.message, 500);

  await audit({
    jobId: data?.job_id ?? null, userId: ctx.user.id, action: "INSTALL_PREBOOK",
    table: "productions", recordId: p.data.production_id, newValue: { planned_install_date: p.data.date },
  });
  return ok(data);
});
