import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// GET /api/crew-people            → รายชื่อที่เปิดใช้งาน (ใช้ในหน้าจัดทีมรายวัน — chip เลือกหัวหน้า/ลูกทีม)
// GET /api/crew-people?all=1      → รวมที่ปิดใช้งานด้วย (ใช้ในหน้าจัดการรายชื่อ)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "read");
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("all") === "1";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  let q = sb.from("crew_people").select("*").order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return err(error.message, 500);
  return ok(data ?? []);
});

const Schema = z.object({
  name: z.string().min(1, "ต้องระบุชื่อ"),
  is_leader: z.boolean().optional().default(false),
  is_member: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
});

// POST /api/crew-people → เพิ่มคนใหม่ (หน้าจัดการรายชื่อ)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const { data, error } = await sb.from("crew_people").insert(p.data).select("*").single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message ?? "")) return err("มีชื่อนี้อยู่แล้ว", 409);
    return err(error.message, 500);
  }
  return ok(data);
});
