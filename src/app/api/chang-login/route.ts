import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { requireChangOr } from "@/lib/bff/chang-ctx";
import { listStaff, normStaffCode, staffByCode } from "@/lib/chang-staff";

export const dynamic = "force-dynamic";

/**
 * บัญชีช่าง (0161 · เจ้าของสั่ง 21 ต.ค.69) — ใช้ได้เฉพาะคนที่มีลิงก์ช่าง หรือคนล็อกอินออฟฟิศ
 * GET  /api/chang-login              → รายชื่อช่าง [{code, name}] (ออฟฟิศใช้ตอน "เบิกแทนช่าง")
 * POST /api/chang-login {code}       → {code, name} · รหัสไม่มีในระบบ = 404
 */
export const GET = withRoute(async (req: Request) => {
  await requireChangOr(req, "stock", "read");
  return ok(await listStaff());
});

export const POST = withRoute(async (req: Request) => {
  await requireChangOr(req, "stock", "read");
  const b = await req.json().catch(() => ({}));
  const code = normStaffCode(b?.code);
  if (!code) return err("พิมพ์รหัสพนักงาน เช่น 002 หรือ JR002", 400);
  const s = await staffByCode(code);
  if (!s) return err(`ไม่พบรหัส ${code} — ถามแอดมินให้เพิ่มบัญชีก่อน`, 404);
  return ok(s);
});
