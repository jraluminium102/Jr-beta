import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

export const dynamic = "force-dynamic";

// POST /api/stock/relink  { ref: string, job_id: string }
//   ผูกงานย้อนหลังให้ความเคลื่อนไหวที่ "พิมพ์ชื่อไว้เอง" (ref = ข้อความ) แต่ยังไม่ผูกงานจริง (job_id ว่าง)
//   ตั้ง job_id ให้ทุก move ที่ ref ตรงกัน & ยังไม่ผูก → กลุ่มในสมุดสโตร์กลายเป็นลูกค้าจริง (ไม่ขึ้น "ไม่ผูกลูกค้า")
//   สิทธิ์ stock:write (สโตร์/แอดมิน) · ไม่แตะจำนวน/ต้นทุน (แค่ผูกงาน)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "write");
  const b = await req.json().catch(() => null);
  const ref = (b?.ref ?? "").trim();
  const jobId = (b?.job_id ?? "").trim();
  if (!ref) return err("ต้องระบุข้อความอ้างอิง (ref) ที่จะผูก", 400);
  if (!jobId) return err("ต้องเลือกงานที่จะผูก", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  // กันผูกผิดงาน: ตรวจว่างานมีจริง
  const { data: job, error: jerr } = await sb.from("jobs").select("id").eq("id", jobId).maybeSingle();
  if (jerr) throw new Error(jerr.message);
  if (!job) return err("ไม่พบงานที่เลือก", 404);

  const { data, error } = await sb.from("stock_moves")
    .update({ job_id: jobId })
    .eq("ref", ref)
    .is("job_id", null)
    .select("id");
  if (error) throw new Error(error.message);
  return ok({ linked: (data ?? []).length });
});
