import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

type Params = { params: { id: string } };
const schema = z.object({
  role: z.enum(["ADMIN","SALES","DESIGNER","PRODUCTION","INSTALLER","ACCOUNTING","VIEWER","CHANG","STORE"]).optional(),
  is_active: z.boolean().optional(),
});

// PATCH /api/users/:id — admin: เปลี่ยน role / เปิด-ปิดผู้ใช้
export const PATCH = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("users", "write");
  const body = schema.parse(await req.json());

  // ── กันล็อกตัวเอง/ล็อกทั้งระบบออก (บทเรียน 24 ก.ค.: ปิดบัญชีตัวเอง = API 401 ทั้งเว็บ แก้คืนผ่าน UI ไม่ได้) ──
  const deactivating = body.is_active === false;
  const demoting = !!body.role && body.role !== "ADMIN";
  if (params.id === ctx.user.id) {
    if (deactivating) throw new HttpError(400, "ปิดใช้งานบัญชีตัวเองไม่ได้ (กันล็อกตัวเองออกจากระบบ)");
    if (demoting) throw new HttpError(400, "ถอดสิทธิ์แอดมินของตัวเองไม่ได้");
  }
  // กันเหลือ "แอดมินที่ใช้งานได้" 0 คน (ปิด/ลดสิทธิ์แอดมินคนสุดท้าย)
  if (deactivating || demoting) {
    const { data: tgt } = await ctx.supabase.from("profiles").select("role, is_active").eq("id", params.id).single();
    if (tgt?.role === "ADMIN" && tgt?.is_active) {
      const { count } = await ctx.supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "ADMIN").eq("is_active", true);
      if ((count ?? 0) <= 1) throw new HttpError(400, "ต้องมีแอดมินที่ใช้งานได้อย่างน้อย 1 คน — ปิด/ลดสิทธิ์คนนี้ไม่ได้");
    }
  }

  const { data, error } = await ctx.supabase
    .from("profiles").update(body).eq("id", params.id).select().single();
  if (error || !data) throw new Error(error?.message ?? "Update failed");

  await audit({
    userId: ctx.user.id, action: "USER_UPDATED",
    table: "profiles", recordId: params.id, newValue: body,
  });
  return ok(data);
});
