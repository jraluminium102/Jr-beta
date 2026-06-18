import { z } from "zod";
import { getContext, Http } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const schema = z.object({
  slot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  set: z.boolean(), // true = ติ๊ก (ลงวันนี้) · false = untick (ล้าง)
});

// POST /api/jobs/:id/followup — ติ๊ก/ยกเลิก วันที่ตามฟีดแบคลูกค้า (ครั้งที่ 1-3)
// Guard: ADMIN || sales_closure:write (เหมือนหน้าปิดการขาย)
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await getContext();
  if (!ctx) throw Http.unauthorized();
  if (!(ctx.role === "ADMIN" || can(ctx.role, "sales_closure", "write"))) throw Http.forbidden();

  const { slot, set } = schema.parse(await req.json());
  const col = `followup_${slot}`; // whitelist: slot ผ่าน zod แล้ว (1|2|3) — ปลอดภัย
  const value = set ? new Date().toISOString().slice(0, 10) : null;

  // cast: Database type ไม่มีคอลัมน์ followup_* (เพิ่ม 0048) — pattern เดียวกับ route อื่น
  const sb = ctx.supabase as unknown as { from: (t: string) => any };
  const { data, error } = await sb
    .from("jobs")
    .update({ [col]: value })
    .eq("id", params.id)
    .select("id, followup_1, followup_2, followup_3")
    .single();

  if (error) throw dbError(error);
  if (!data) return notFound("ไม่พบงานนี้");

  await audit({
    jobId: params.id,
    userId: ctx.user.id,
    action: "JOB_FOLLOWUP",
    table: "jobs",
    recordId: params.id,
    newValue: { [col]: value },
  });

  return ok(data);
});
