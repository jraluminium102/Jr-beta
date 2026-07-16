import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

const Schema = z.object({
  job_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().optional(),
  appointment_time: z.string().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  off_board: z.boolean().optional(),   // ธงจุดงานนอกบอร์ดพร้อมติดตั้ง (import SetTeam/งานพิเศษ) — 0100
});

// PATCH /api/crew-day/sites/[id] → แก้ชื่อสถานที่/เวลานัด/ผูก(หรือเลิกผูก)งาน/ที่อยู่-เบอร์
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data, error } = await sb.from("crew_team_sites").update(p.data).eq("id", params.id).select("*").single();
  if (error) return err(error.message, 500);
  if (!data) return notFound("ไม่พบจุดนี้");
  return ok(data);
});

// DELETE /api/crew-day/sites/[id] → ลบจุด (ต้อง re-number site_no ฝั่ง client ถ้าต้องการเรียงใหม่)
export const DELETE = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("installation", "write");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { error } = await sb.from("crew_team_sites").delete().eq("id", params.id);
  if (error) return err(error.message, 500);
  return ok({ ok: true });
});
