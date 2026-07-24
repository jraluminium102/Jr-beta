import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, created, err } from "@/lib/bff/response";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { createServiceClient } from "@/lib/supabase/admin";
import { usernameToEmail } from "@/lib/login-id";

// GET /api/users — admin: รายชื่อผู้ใช้ + role
export const GET = withRoute(async () => {
  const ctx = await requirePermission("users", "read");
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, is_active, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  // is_self = แถวของ user ที่กำลังดู → UI ปิดปุ่มเปลี่ยน role/ปิดใช้งานของตัวเอง (กันล็อกตัวเอง)
  const rows = (data ?? []).map((u) => ({ ...u, is_self: u.id === ctx.user.id }));
  return ok(rows);
});

// POST /api/users — admin: สร้างบัญชีใหม่ (auth user + role) ในเว็บเลย ไม่ต้องเข้า Supabase dashboard
//   ใช้ service client (สร้าง auth user ได้) · trigger on_auth_user_created สร้าง profile ให้ → upsert role/ชื่อ ทับให้ชัวร์
const createSchema = z.object({
  username: z.string().trim().optional(),   // ชื่อผู้ใช้ (ไม่ต้องมีอีเมลจริง) → อีเมลภายใน username@jr.local
  email: z.string().trim().optional(),      // หรือ อีเมลจริง (ถ้ามี)
  password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัว"),
  full_name: z.string().trim().min(1, "ต้องระบุชื่อ"),
  role: z.enum(["ADMIN", "SALES", "DESIGNER", "PRODUCTION", "INSTALLER", "ACCOUNTING", "VIEWER", "CHANG", "STORE"]),
});

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return err("ยังไม่ได้เข้าสู่ระบบ", 401);
  if (!can(profile.role, "users", "write")) return err("ไม่มีสิทธิ์ (เฉพาะแอดมิน)", 403);

  const body = await req.json().catch(() => null);
  const p = createSchema.safeParse(body);
  if (!p.success) return err(p.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
  const { username, password, full_name, role } = p.data;
  // อีเมลจริงถ้ากรอกมี @ · ไม่งั้นสร้างจากชื่อผู้ใช้ (username@jr.local)
  const rawEmail = (p.data.email ?? "").trim();
  const email = rawEmail.includes("@") ? rawEmail.toLowerCase() : usernameToEmail(username ?? "");
  if (!email) return err("ต้องระบุชื่อผู้ใช้ (ภาษาอังกฤษ/ตัวเลข เช่น store1) หรืออีเมล", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;
  const { data: c, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message ?? "") ? "อีเมลนี้มีบัญชีแล้ว" : error.message;
    return err(msg, 400);
  }
  const uid = c?.user?.id;
  if (!uid) return err("สร้างผู้ใช้ไม่สำเร็จ", 500);

  // trigger สร้าง profile (VIEWER) แล้ว → upsert role/ชื่อ ทับ (กัน race + ตั้ง role ให้ตรง)
  const { error: upErr } = await admin.from("profiles").upsert({ id: uid, email, full_name, role }, { onConflict: "id" });
  if (upErr) return err("สร้างบัญชีแล้วแต่ตั้ง role ไม่สำเร็จ: " + upErr.message, 500);

  return created({ id: uid, email, full_name, role });
}
