import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import type { Role } from "@/lib/database.types";

const VALID = ["none", "jr", "customer"];

// POST /api/jobs/[id]/floor-work → ติ๊กงานพื้น ผรม. ต่อ job (หน้าเช็คลิสต์ใบเสนอราคา)
// body (ส่งคีย์ไหนอัปเดตคีย์นั้น): { floor_work?, floor_note?, floor_quote_sent? }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!can(profile.role as Role, "jobs", "write")) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("payload ไม่ถูกต้อง");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd: Record<string, any> = {};
  if ("floor_work" in body) {
    const fw = String(body.floor_work ?? "");
    if (!VALID.includes(fw)) return fail("floor_work ไม่ถูกต้อง");
    upd.floor_work = fw;
    // ล้างงานพื้น (none) → ล้างโน้ต + ยกเลิกติ๊กส่งใบเสนองานพื้น
    if (fw === "none") { upd.floor_note = ""; upd.floor_quote_sent = false; }
  }
  if ("floor_note" in body) upd.floor_note = String(body.floor_note ?? "").slice(0, 300);
  if ("floor_quote_sent" in body) upd.floor_quote_sent = !!body.floor_quote_sent;
  if (Object.keys(upd).length === 0) return fail("ไม่มีข้อมูลให้แก้");

  const sb = createClient();
  // .select().maybeSingle() → รู้ว่าเขียนติดจริงกี่แถว (RLS บล็อก/ไม่พบงาน = 0 แถว = error=null เงียบ ๆ ถ้าไม่ select)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any)
    .from("jobs").update(upd).eq("id", params.id)
    .select("id, floor_work, floor_note, floor_quote_sent").maybeSingle();
  if (error && /floor_work|floor_note|floor_quote_sent/i.test(error.message ?? "")) return fail("ยังไม่ได้รัน migration 0090/0091 — รันก่อนใช้งาน", 400);
  if (error) return fail(error.message, 500);
  if (!data) return fail("บันทึกงานพื้นไม่ติด — ไม่พบงานนี้ หรือไม่มีสิทธิ์แก้ (RLS)", 409);
  return ok(data);
}
