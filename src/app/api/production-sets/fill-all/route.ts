import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// POST /api/production-sets/fill-all  { job_id, field, value }
//   "ใส่วันที่ทีเดียว → เติมทุกชุด" — ออฟฟิศกรอกวันที่/คนวัดครั้งเดียว ให้ทุกชุดของงานนี้ตามหมด
//   (แก้รายชุดทีหลังได้ตามปกติ) · sync วันหลักกลับไป productions ด้วย เพื่อให้หัววันในตารางช่างตรง
const FIELDS = ["measure_actual", "measurer_name", "must_finish_date", "glass_done_date", "actual_done_date", "install_date"] as const;
// map ช่องชุด → ช่อง productions (ระดับงาน) ที่ตารางผลิต/ช่างใช้
const PROD_SYNC: Partial<Record<(typeof FIELDS)[number], string>> = {
  measure_actual: "measure_actual",
  measurer_name: "measurer_name",
  must_finish_date: "production_due_date",
  install_date: "planned_install_date",
};

const schema = z.object({
  job_id: z.string().uuid(),
  field: z.enum(FIELDS),
  value: z.string().nullish(),
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const { job_id, field, value } = schema.parse(await req.json());
  const v = value === "" ? null : value ?? null;
  const sb = ctx.supabase as unknown as Sb;

  const { data, error } = await sb
    .from("production_sets")
    .update({ [field]: v })
    .eq("job_id", job_id)
    .select("id");
  if (error) throw dbError(error);

  // sync ระดับงาน (productions) — non-fatal ถ้าไม่มีแถว/คอลัมน์
  const prodCol = PROD_SYNC[field];
  if (prodCol) {
    await sb.from("productions").update({ [prodCol]: v }).eq("job_id", job_id);
  }

  return ok({ updated: (data ?? []).length });
});
