import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

type Sb = { from: (t: string) => any };

// GET /api/billing-profiles?customer_id=123 → นามออกบิลของลูกค้า (นามหลักก่อน)
export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  const cid = Number(new URL(req.url).searchParams.get("customer_id"));
  if (!cid) return fail("ต้องระบุลูกค้า");
  const sb = createClient() as unknown as Sb;
  const { data, error } = await sb
    .from("billing_profiles")
    .select("*")
    .eq("customer_id", cid)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("id", { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data);
}

// POST /api/billing-profiles → เพิ่มนามออกบิล
export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!canWrite(profile.role)) return FORBIDDEN();
  const body = await req.json().catch(() => null);
  const cid = Number(body?.customer_id);
  if (!cid) return fail("ต้องระบุลูกค้า");
  if (!body?.bill_name?.trim()) return fail("ต้องระบุชื่อที่ออกบิล");
  const kind = body.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL";
  const sb = createClient() as unknown as Sb;

  // ลูกค้ายังไม่มีนามเลย → บังคับเป็นนามหลัก · ถ้าขอเป็นนามหลัก → ปลดนามหลักเดิมก่อน (partial unique)
  const { count } = await sb.from("billing_profiles").select("id", { count: "exact", head: true }).eq("customer_id", cid);
  const isDefault = !!body.is_default || (count ?? 0) === 0;
  if (isDefault) {
    await sb.from("billing_profiles").update({ is_default: false }).eq("customer_id", cid).eq("is_default", true);
  }

  const { data, error } = await sb.from("billing_profiles").insert({
    customer_id: cid,
    kind,
    bill_name: body.bill_name.trim(),
    tax_id: (body.tax_id ?? "").trim(),
    branch: (body.branch ?? "").trim() || "สำนักงานใหญ่",
    address: body.address ?? "",
    ship_address: body.ship_address ?? "",
    contact_person: body.contact_person ?? "",
    phone: body.phone ?? "",
    is_default: isDefault,
  }).select("*").single();
  if (error) return fail(error.message, 500);
  return ok(data);
}
