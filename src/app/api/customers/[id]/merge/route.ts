import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { audit } from "@/lib/bff/handler";

// POST /api/customers/[id]/merge  { into: number }
// รวมลูกค้าซ้ำ: ย้ายงาน/คิว/ใบเสนอ/นามออกบิลของ [id] (ตัวลบ) ไปอยู่ใต้ `into` (ตัวที่เก็บ) แล้วลบ [id] ออกจากทะเบียน
//   ทำใน RPC merge_customers (0171) ทรานแซกชันเดียว · ADMIN เท่านั้น (RPC เช็ค has_role เอง → ต้องเรียกด้วย client ของผู้ใช้ ห้าม service client)
//   เอกสารที่ออกไปแล้วคงนามเดิมต่อใบ · งาน/คิวที่ย้ายมาใช้ชื่อตัวที่เก็บ (ชื่อในผลิต = ชื่อทะเบียน)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (profile.role !== "ADMIN") return FORBIDDEN();

  const body = await req.json().catch(() => ({}));
  const removeId = Number(params.id);
  const keepId = Number(body?.into);
  if (!Number.isFinite(removeId) || !Number.isFinite(keepId)) return fail("ต้องระบุลูกค้าที่จะรวมเข้า (into)");
  if (removeId === keepId) return fail("เลือกลูกค้าคนเดียวกัน — รวมไม่ได้");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const { data, error } = await supabase.rpc("merge_customers", { p_keep: keepId, p_remove: removeId }) as { data: unknown; error: { message?: string } | null };
  if (error) {
    const m = error.message ?? "";
    if (/forbidden/i.test(m)) return FORBIDDEN();
    if (/keep_not_found|remove_not_found/i.test(m)) return fail("ไม่พบลูกค้าที่เลือก (อาจถูกลบไปแล้ว — รีเฟรชหน้า)", 404);
    if (/function .*merge_customers|schema cache/i.test(m)) return fail("ยังไม่ได้รัน SQL 0171 (merge_customers) ในฐานข้อมูล", 503);
    return fail("รวมลูกค้าไม่สำเร็จ: " + m, 500);
  }

  await audit({
    userId: profile.id,
    action: "CUSTOMER_MERGE",
    table: "customers",
    recordId: String(keepId),
    oldValue: { removed_id: removeId },
    newValue: (data ?? {}) as Record<string, unknown>,
  });

  return ok(data);
}
