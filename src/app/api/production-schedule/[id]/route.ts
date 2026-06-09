import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

type Params = { params: { id: string } };

const patchSchema = z.object({
  kind: z.enum(["job", "adhoc"]),
  produce_date: z.string().nullish(),
  install_date: z.string().nullish(),
  producer_note: z.string().nullish(),
  status: z.string().nullish(),     // adhoc เท่านั้น: QUEUED | DONE
  title: z.string().nullish(),      // adhoc
  customer_name: z.string().nullish(),
});

// PATCH — แก้วัน/ช่าง (งานในระบบ → productions, งานจดเอง → adhoc)
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const b = patchSchema.parse(await req.json());

  if (b.kind === "job") {
    // งานในระบบ: แก้ได้เฉพาะวันผลิต/วันติดตั้ง/ช่าง (สถานะจัดการในหน้างานผลิต)
    const upd: Record<string, unknown> = {};
    if (b.produce_date !== undefined) upd.production_queued = b.produce_date || null;
    if (b.install_date !== undefined) upd.planned_install_date = b.install_date || null;
    if (b.producer_note !== undefined) upd.producer_note = b.producer_note ?? null;
    if (Object.keys(upd).length === 0) return err("ไม่มีข้อมูลให้แก้", 400);
    const { data, error } = await ctx.supabase
      .from("productions").update(upd).eq("id", params.id).select().single();
    if (error || !data) throw new Error(error?.message ?? "แก้ไขไม่สำเร็จ");
    return ok(data);
  }

  // งานจดเอง
  const upd: Record<string, unknown> = {};
  if (b.title !== undefined && b.title) upd.title = b.title;
  if (b.customer_name !== undefined) upd.customer_name = b.customer_name || null;
  if (b.produce_date !== undefined) upd.produce_date = b.produce_date || null;
  if (b.install_date !== undefined) upd.install_date = b.install_date || null;
  if (b.producer_note !== undefined) upd.producer_note = b.producer_note ?? null;
  if (b.status !== undefined && b.status) upd.status = b.status;
  if (Object.keys(upd).length === 0) return err("ไม่มีข้อมูลให้แก้", 400);
  const sb = ctx.supabase as unknown as { from: (t: string) => any };
  const { data, error } = await sb
    .from("adhoc_production_tasks").update(upd).eq("id", params.id).select().single();
  if (error || !data) throw new Error(error?.message ?? "แก้ไขไม่สำเร็จ");
  return ok(data);
});

// DELETE — ลบงานจดเองเท่านั้น (งานในระบบลบจากที่นี่ไม่ได้)
export const DELETE = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as { from: (t: string) => any };
  const { error } = await sb
    .from("adhoc_production_tasks").delete().eq("id", params.id);
  if (error) throw new Error(error.message);
  return ok({ id: params.id });
});
