import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";

export const dynamic = "force-dynamic";

const CUT_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

// GET /api/cutlists/[id] → ใบตัด + ข้อ (เรียงตาม sort_order) + งาน
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  const sb = createClient() as unknown as Sb;
  const { data, error } = await sb
    .from("cutlists")
    .select("*, cutlist_items(*), jobs:job_id(job_code, customer_name)")
    .eq("id", Number(params.id))
    .single();
  if (error || !data) return fail("ไม่พบใบตัด", 404);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data as any).cutlist_items = ((data as any).cutlist_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);
  return ok(data);
}

// PATCH /api/cutlists/[id] → แก้ชื่อ/โน้ต และ/หรือ แทนที่ข้อทั้งชุด { name?, note?, items? }
// ใบที่ตัดสต็อกแล้ว: แก้ข้อไม่ได้ (ยอดหักไปแล้ว จะไม่ตรง) — แก้ได้แค่ชื่อ/โน้ต
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!CUT_WRITE.includes(profile.role)) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  const id = Number(params.id);
  const sb = createClient() as unknown as Sb;

  const { data: cl } = await sb.from("cutlists").select("id, status").eq("id", id).maybeSingle();
  if (!cl) return fail("ไม่พบใบตัด", 404);

  const head: Record<string, unknown> = {};
  if (body.name !== undefined) head.name = String(body.name).trim();
  if (body.note !== undefined) head.note = String(body.note);
  if (Object.keys(head).length) {
    const { error } = await sb.from("cutlists").update(head).eq("id", id);
    if (error) return fail(error.message, 500);
  }

  if (Array.isArray(body.items)) {
    if (cl.status === "stock_cut") {
      return fail("ใบนี้ตัดสต็อกไปแล้ว — แก้ข้อไม่ได้ (ยอดที่หักจะไม่ตรง) สร้างใบใหม่แทน", 409);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (body.items as any[]).map((it, i) => ({
      spec_id: String(it.spec_id ?? ""),
      label: String(it.label ?? "").slice(0, 200),
      input: it.input ?? {},
      sets: Math.max(1, Math.round(Number(it.sets) || 1)),
      sort_order: i,
    })).filter((r) => r.spec_id);
    // replace ทั้งชุดแบบ atomic ผ่าน RPC (0094 · delete+insert txn เดียว — QA MEDIUM: กันข้อหายถ้า insert ล้มหลัง delete)
    const { error: rpcErr } = await sb.rpc("replace_cutlist_items", { p_cl_id: id, p_items: rows });
    if (rpcErr) {
      // RPC ยังไม่มี (0094 เวอร์ชันเก่า) → fallback ทางเดิม
      if (!/replace_cutlist_items|function/i.test(rpcErr.message ?? "")) {
        return fail("บันทึกข้อไม่สำเร็จ: " + rpcErr.message, 500);
      }
      const { error: dErr } = await sb.from("cutlist_items").delete().eq("cutlist_id", id);
      if (dErr) return fail("ลบข้อเดิมไม่สำเร็จ: " + dErr.message, 500);
      if (rows.length) {
        const { error: iErr } = await sb.from("cutlist_items").insert(rows.map((r) => ({ ...r, cutlist_id: id })));
        if (iErr) return fail("บันทึกข้อไม่สำเร็จ: " + iErr.message, 500);
      }
    }
  }

  return ok({ ok: true });
}

// DELETE /api/cutlists/[id] — ลบได้เฉพาะใบที่ยังไม่ตัดสต็อก
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  if (!CUT_WRITE.includes(profile.role)) return FORBIDDEN();
  const id = Number(params.id);
  const sb = createClient() as unknown as Sb;
  const { data: cl } = await sb.from("cutlists").select("id, status").eq("id", id).maybeSingle();
  if (!cl) return fail("ไม่พบใบตัด", 404);
  if (cl.status === "stock_cut") return fail("ใบนี้ตัดสต็อกไปแล้ว ลบไม่ได้ (มีประวัติการหักผูกอยู่)", 409);
  const { error } = await sb.from("cutlists").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return ok({ ok: true });
}
