import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// GET /api/customers?q=คำค้น  → รายชื่อลูกค้า
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const supabase = createClient();
  // ค้นเบอร์: ทะเบียนเก็บแบบมีขีด "081-804-8405" — พิมพ์ตัวเลขล้วนต้องเจอด้วย → แทรก % ระหว่างตัวเลข (ขีด/ช่องว่างคั่นได้)
  const digits = q.replace(/[^0-9]/g, "");
  const phoneLoose = digits.length >= 4 ? digits.split("").join("%") : "";
  const build = (withPrev: boolean) => {
    let query = supabase.from("customers").select("*").eq("is_active", true).order("created_at", { ascending: false });
    if (q) {
      const parts = [`name.ilike.%${q}%`, `job.ilike.%${q}%`, `phone.ilike.%${q}%`, `line_id.ilike.%${q}%`];
      if (phoneLoose) parts.push(`phone.ilike.%${phoneLoose}%`);
      if (withPrev) parts.push(`line_id_prev.ilike.%${q}%`);   // ไลน์เดิมที่เคยใช้ (0170)
      query = query.or(parts.join(","));
    }
    return query;
  };

  let { data, error } = await build(true);
  if (error && /line_id_prev/i.test(error.message ?? "")) ({ data, error } = await build(false));   // ยังไม่รัน 0170
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/customers  → เพิ่มลูกค้า
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return fail("ต้องระบุชื่อลูกค้า");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: body.name.trim(),
      job: body.job ?? "",
      address: body.address ?? "",
      tax_id: body.tax_id ?? "",
      line_id: body.line_id ?? "",
      contact_channel: body.contact_channel ?? "LINE",
      phone: body.phone ?? "",
      contact_person: body.contact_person ?? "",
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (error) return fail(error.message, 500);
  return ok(data, 201);
}
