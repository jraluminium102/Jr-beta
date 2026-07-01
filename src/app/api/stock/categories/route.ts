import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// สโตร์/ผลิต จัดการหมวดได้ด้วย (ไม่ใช่แค่ ADMIN/SALES/ACCOUNTING)
const WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
type Sb = { from: (t: string) => any };

// GET /api/stock/categories → หมวดวัสดุ (เรียงตาม sort_order → ชื่อ)
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  const sb = createClient() as unknown as Sb;
  const { data, error } = await sb
    .from("stock_categories").select("*").eq("is_active", true)
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/stock/categories → เพิ่มหมวด
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!WRITE.includes(profile.role)) return FORBIDDEN();
  const body = await req.json().catch(() => null);
  const name = (body?.name ?? "").toString().trim();
  if (!name) return fail("ต้องระบุชื่อหมวด");
  const sb = createClient() as unknown as Sb;
  const { data, error } = await sb.from("stock_categories")
    .insert({ name, sort_order: Number(body?.sort_order) || 0 })
    .select("*").single();
  if (error) return fail(error.message.includes("duplicate") ? "มีหมวดนี้แล้ว" : error.message, 500);
  return ok(data, 201);
}
