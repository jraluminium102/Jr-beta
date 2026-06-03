import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

// GET /api/customers?q=คำค้น  → รายชื่อลูกค้า
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const supabase = createClient();
  let query = supabase
    .from("customers")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (q) query = query.or(`name.ilike.%${q}%,job.ilike.%${q}%,phone.ilike.%${q}%,line_id.ilike.%${q}%`);

  const { data, error } = await query;
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
      phone: body.phone ?? "",
      contact_person: body.contact_person ?? "",
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (error) return fail(error.message, 500);
  return ok(data, 201);
}
