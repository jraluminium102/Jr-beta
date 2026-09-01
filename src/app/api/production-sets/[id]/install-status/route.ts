import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

type Params = { params: { id: string } };
type Sb = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const schema = z.object({ install_status: z.enum(["PENDING", "INSTALLED"]) });

// PATCH /api/production-sets/[id]/install-status
//   ติ๊ก "ติดตั้งชุดนี้แล้ว" รายชุด จากหน้าติดตั้ง (0131)
//   ⚠ แยก endpoint จาก /production-sets/:id หลัก เพราะ INSTALLER ไม่มีสิทธิ์ production:write
//     แต่ต้องติ๊กชุดที่ติดตั้งแล้วได้ → gate ด้วย installation:write แทน
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("installation", "write");
  const body = schema.parse(await req.json());
  const installed = body.install_status === "INSTALLED";
  const actor = ctx.profile?.full_name ?? ctx.user.email ?? "ไม่ทราบ";
  const nowIso = new Date().toISOString();

  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb
    .from("production_sets")
    .update({
      install_status: body.install_status,
      installed_by: installed ? actor : null,
      installed_at: installed ? nowIso : null,
    })
    .eq("id", params.id)
    .select("id, job_id, set_label, install_status, installed_by, installed_at, hold")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return err("ไม่พบชุดงานนี้", 404);

  // ⚠ production_sets.id เป็น bigint ไม่ใช่ uuid — audit_logs.record_id เป็น uuid เท่านั้น จึงไม่ส่ง recordId (เก็บ id ไว้ใน new_value แทน)
  await audit({
    jobId: data.job_id, userId: ctx.user.id, action: "SET_INSTALL_STATUS",
    table: "production_sets",
    newValue: { set_id: params.id, install_status: body.install_status, by: actor },
  });
  return ok(data);
});
