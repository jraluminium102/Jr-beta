import { dbMessage } from "@/lib/bff/db-error";
import { ok, fail, UNAUTHORIZED, FORBIDDEN } from "@/lib/bff";
import { cutlistActor } from "@/lib/cutlist/actor";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any; rpc: (n: string, a?: unknown) => any };

// GET /api/cutlists/[id] → ใบตัด + ข้อ (เรียงตาม sort_order) + งาน
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const actor = await cutlistActor(req);
  if (!actor) return UNAUTHORIZED();
  const sb = actor.sb as unknown as Sb;
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
  const actor = await cutlistActor(req);
  if (!actor) return UNAUTHORIZED();
  if (!actor.canWrite) return FORBIDDEN();

  const body = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");
  const id = Number(params.id);
  const sb = actor.sb as unknown as Sb;

  const { data: cl } = await sb.from("cutlists").select("id, status").eq("id", id).maybeSingle();
  if (!cl) return fail("ไม่พบใบตัด", 404);

  const head: Record<string, unknown> = {};
  if (body.name !== undefined) head.name = String(body.name).trim();
  if (body.note !== undefined) head.note = String(body.note);
  if (Object.keys(head).length) {
    const { error } = await sb.from("cutlists").update(head).eq("id", id);
    if (error) return fail(dbMessage(error, "บันทึกไม่สำเร็จ"), 500);
  }

  // ปรับรายการตัดสต็อก (ต่างจาก BOQ · 0107) — update แยก + ทน column หาย (กันพังถ้ายังไม่รัน migration)
  if (Array.isArray(body.adjustments)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adj = (body.adjustments as any[]).slice(0, 200).map((a) => ({
      id: String(a?.id ?? ""),
      sid: Number(a?.sid) || 0,
      kind: a?.kind === "hw" ? "hw" : "alu",
      name: String(a?.name ?? "").slice(0, 120),
      unit: String(a?.unit ?? "").slice(0, 20),
      sku: String(a?.sku ?? "").slice(0, 40),
      img: String(a?.img ?? "").slice(0, 500),
      qty: Math.round((Number(a?.qty) || 0) * 100) / 100,   // เลขติดลบ = ลด · บวก = เพิ่ม
      note: String(a?.note ?? "").slice(0, 200),
      fromBoq: !!a?.fromBoq,
    })).filter((a) => a.sid > 0 && a.qty !== 0);
    const { error: adjErr } = await sb.from("cutlists").update({ adjustments: adj }).eq("id", id);
    if (adjErr) {
      // column ยังไม่มี (ยังไม่รัน 0107) → ไม่ล้มทั้งคำขอ · แจ้งเตือน + ให้ผู้ใช้รู้ว่ายังเซฟส่วนปรับไม่ได้
      if (/adjustments|column|schema cache/i.test(adjErr.message ?? "")) {
        return fail("ยังบันทึก 'ปรับรายการ' ไม่ได้ — ผู้ดูแลต้องรัน migration 0107 ก่อน (ส่วนอื่นบันทึกแล้ว)", 409);
      }
      return fail(dbMessage(adjErr, "บันทึกการปรับไม่สำเร็จ"), 500);
    }
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
    // แทนที่ข้อทั้งชุด — delete+insert ตรง (service client ข้าม RLS อยู่แล้ว)
    const directReplace = async () => {
      const { error: dErr } = await sb.from("cutlist_items").delete().eq("cutlist_id", id);
      if (dErr) return fail(dbMessage(dErr, "ลบข้อเดิมไม่สำเร็จ"), 500);
      if (rows.length) {
        const { error: iErr } = await sb.from("cutlist_items").insert(rows.map((r) => ({ ...r, cutlist_id: id })));
        if (iErr) return fail("บันทึกข้อไม่สำเร็จ: " + iErr.message, 500);
      }
      return null;
    };
    // ⚠ ช่างผ่านลิงก์ = service client (ไม่มี session) → RPC replace_cutlist_items มี has_role guard ข้างในที่ session-less ไม่ผ่าน
    //   = เซฟข้อใบตัดไม่ได้ (บั๊กที่เจ้าของเจอ 22 ก.ค.69) → ช่างใช้ delete+insert ตรง · คนล็อกอินยังใช้ RPC atomic
    if (actor.kind === "chang") {
      const bad = await directReplace();
      if (bad) return bad;
    } else {
      const { error: rpcErr } = await sb.rpc("replace_cutlist_items", { p_cl_id: id, p_items: rows });
      if (rpcErr) {
        // RPC ยังไม่มี (0094 เวอร์ชันเก่า) → fallback ทางเดิม
        if (!/replace_cutlist_items|function/i.test(rpcErr.message ?? "")) {
          return fail(dbMessage(rpcErr, "บันทึกข้อไม่สำเร็จ"), 500);
        }
        const bad = await directReplace();
        if (bad) return bad;
      }
    }
  }

  return ok({ ok: true });
}

// DELETE /api/cutlists/[id] — ลบได้เฉพาะใบที่ยังไม่ตัดสต็อก
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const actor = await cutlistActor(req);
  if (!actor) return UNAUTHORIZED();
  if (!actor.canWrite) return FORBIDDEN();
  const id = Number(params.id);
  const sb = actor.sb as unknown as Sb;
  const { data: cl } = await sb.from("cutlists").select("id, status").eq("id", id).maybeSingle();
  if (!cl) return fail("ไม่พบใบตัด", 404);
  if (cl.status === "stock_cut") return fail("ใบนี้ตัดสต็อกไปแล้ว ลบไม่ได้ (มีประวัติการหักผูกอยู่)", 409);
  const { error } = await sb.from("cutlists").delete().eq("id", id);
  if (error) return fail(dbMessage(error, "ลบใบตัดไม่สำเร็จ"), 500);
  return ok({ ok: true });
}
