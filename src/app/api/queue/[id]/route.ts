import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { resolveMapLink } from "@/lib/queue-geo";

export const dynamic = "force-dynamic";

type Sb = { from: (t: string) => any };
const SELECT = "*, sales:sales_id(id,name,code,team), assistant:assistant_id(id,name,code)";
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// normalize queue_time format เก่า → HH:MM (จุด→โคลอน, ตัดวินาที/ส่วนเกิน)
// กัน entry import เก่า ("10.00"/"9:30:00") กดเสร็จไม่ได้เพราะ TIME_RE เข้ม
function normTime(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s;
}

function clean(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) =>
    [k, k === "queue_time" ? normTime(v) : (v === "" ? null : v)]));
}

const patchSchema = z.object({
  status: z.enum(["PENDING", "PROPOSED", "CONFIRMED", "DONE", "CANCELLED"]).nullish(),
  queue_date: z.string().nullish(),
  queue_time: z.string().regex(TIME_RE, "รูปแบบเวลาต้องเป็น HH:MM").nullish(),
  job_type: z.string().nullish(),
  sales_id: z.string().uuid().nullish(),
  assistant_id: z.string().uuid().nullish(),
  line_contact: z.string().nullish(),
  contact_channel: z.enum(["LINE", "FB"]).optional(),
  customer_name: z.string().min(1).optional(),
  tel: z.string().nullish(),
  address: z.string().nullish(),
  location_url: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  job_size: z.enum(["SINGLE", "MULTI", "FULLDAY"]).nullish(),
  job_count: z.number().int().nullish(),
  assess_fee: z.number().nullish(),
  payment: z.string().nullish(),
  receipt_done: z.boolean().optional(),
  fee_paid: z.boolean().optional(),
  note_admin: z.string().nullish(),
  note_ai: z.string().nullish(),
  target_job_id: z.string().uuid().nullish(),      // (0044) เคลียร์แบบ / ลูกค้าเก่าหน้างานเดิม
  target_customer_id: z.number().int().nullish(),  // (0045) ลูกค้าเก่าหน้างานใหม่
  clear_revise: z.boolean().optional(),            // (0044) toggle "มีแก้ใบเสนอ+แบบ" — ไม่ใช่คอลัมน์ DB
  // (0070) ออกเอกสารในนาม
  bill_choice: z.enum(["SITE", "OTHER_ADDR", "COMPANY"]).optional(),
  bill_kind: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
  bill_name: z.string().nullish(),
  bill_tax_id: z.string().nullish(),
  bill_branch: z.string().nullish(),
  bill_address: z.string().nullish(),
});

const PRE_DEPOSIT = ["LEAD", "PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"];

// ยกเลิก/ลบคิว — เอาคิวออกจริง + เก็บกวาดลูกค้า "ใหม่" ที่ผูกเฉพาะคิวนี้
//   - ก่อนประเมิน (ไม่มีงาน) → ลบคิวจริง · ลูกค้าใหม่ (ไม่มีงาน/คิวอื่น) → ลบจากทะเบียนด้วย
//   - ประเมินแล้ว (มีงาน) → เก็บเป็นประวัติ (soft cancel) กัน orphan งาน/บัญชี
//   - ลูกค้าเก่า (target_customer_id / มีอ้างอิงอื่น) → ไม่แตะทะเบียน
async function removeQueueOnCancel(
  sb: Sb,
  queueId: string,
  opts: { forceDelete?: boolean } = {},
): Promise<{ found: boolean; soft: boolean; removedCustomerId: number | null }> {
  const { data: qrow } = await sb
    .from("queue_entries")
    .select("id, customer_id, target_customer_id, job_id")
    .eq("id", queueId)
    .maybeSingle();
  if (!qrow) return { found: false, soft: false, removedCustomerId: null };
  const q = qrow as { customer_id: number | null; target_customer_id: number | null; job_id: string | null };

  // ประเมินแล้ว (มีงานผูก) + ไม่ได้สั่งลบจริง → soft cancel เก็บเป็นประวัติ
  if (q.job_id && !opts.forceDelete) {
    await sb.from("queue_entries").update({ status: "CANCELLED" }).eq("id", queueId);
    return { found: true, soft: true, removedCustomerId: null };
  }

  // ลบคิวจริง
  await sb.from("queue_entries").delete().eq("id", queueId);

  // เก็บกวาดลูกค้า "ใหม่": ผูกเฉพาะคิวนี้ ไม่มีงาน + ไม่มีคิวอื่นเหลือ (ลูกค้าเก่าไม่แตะ)
  let removedCustomerId: number | null = null;
  const cid = q.customer_id;
  if (cid != null && cid !== q.target_customer_id) {
    const { count: jobCount } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("customer_id", cid);
    const { count: qCount } = await sb.from("queue_entries").select("id", { count: "exact", head: true }).eq("customer_id", cid);
    if ((jobCount ?? 0) === 0 && (qCount ?? 0) === 0) {
      const { error: delErr } = await sb.from("customers").delete().eq("id", cid);
      if (!delErr) removedCustomerId = cid; // FK อื่นค้าง → เก็บลูกค้าไว้ (best-effort)
    }
  }
  return { found: true, soft: false, removedCustomerId };
}

// PATCH /api/queue/[id] — แก้ไขคิว (ADMIN) · updated_at อัปเดตอัตโนมัติด้วย trigger
export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "write");
  const rawBody = patchSchema.parse(clean(await req.json()));
  const sb = ctx.supabase as unknown as Sb;

  // ยกเลิกคิว = เอาออกจริง (ตามที่ต้องการ "ลบออกไปเลย") + เก็บกวาดลูกค้าใหม่
  if (rawBody.status === "CANCELLED") {
    const res = await removeQueueOnCancel(sb, params.id);
    if (!res.found) throw new HttpError(404, "ไม่พบคิวนี้ (อาจถูกลบไปแล้ว)");
    await audit({
      userId: ctx.user.id,
      action: res.soft ? "QUEUE_CANCELLED_KEPT" : "QUEUE_REMOVED",
      table: "queue_entries",
      recordId: params.id,
      newValue: { soft: res.soft, removed_customer_id: res.removedCustomerId },
    });
    return ok({ id: params.id, removed: !res.soft, removed_customer: res.removedCustomerId != null });
  }

  // แยก field ที่ไม่ใช่คอลัมน์ DB ออกก่อน update (กัน DB error)
  const { clear_revise, ...body } = rawBody;

  // resolve พิกัดเมื่อแก้ลิงก์โลเคชั่นแต่ไม่ได้ส่ง lat/lng มาเอง
  if (body.location_url && (body.lat == null || body.lng == null)) {
    const co = await resolveMapLink(body.location_url);
    if (co) { body.lat = co.lat; body.lng = co.lng; }
  }
  const clientSentCoords = typeof body.lat === "number" || typeof body.lng === "number";
  if ((body.location_url === null || body.location_url === "") && !clientSentCoords) {
    body.lat = null;
    body.lng = null;
  }

  const { data, error } = await sb.from("queue_entries")
    .update(body).eq("id", params.id).select(SELECT).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "ไม่พบคิวนี้ (อาจถูกลบไปแล้ว)");

  // แก้ชื่อลูกค้าจากหน้าคิว — ถ้าคิวผูกกับลูกค้าจริงแล้ว (promote แล้ว) ให้แก้ที่
  // customers.name (single source of truth) → trigger 0051 กระจายไปทุกเฟส/เอกสาร
  // (คิวที่ยังไม่ผูกลูกค้า = ชื่ออยู่ที่ queue_entries เฉยๆ ตาม update ด้านบนพอ)
  if (typeof body.customer_name === "string") {
    const cid = (data as { customer_id?: number | null }).customer_id ?? null;
    if (cid != null) {
      const { data: prev } = await sb.from("customers").select("name").eq("id", cid).maybeSingle();
      const oldName = (prev as { name?: string } | null)?.name ?? null;
      if (oldName !== body.customer_name) {
        await sb.from("customers").update({ name: body.customer_name }).eq("id", cid);
        await audit({
          userId: ctx.user.id,
          action: "CUSTOMER_RENAME",
          table: "customers",
          recordId: String(cid),
          oldValue: { name: oldName },
          newValue: { name: body.customer_name },
        });
      }
    }
  }

  // ─── DONE handling ──────────────────────────────────────────────────────────
  if (body.status === "DONE") {
    const jt: string = ((data as { job_type?: string | null }).job_type ?? "").trim();
    const isClearRevise = jt === "เคลียร์แบบ";
    const isAssess = !isClearRevise && (jt === "" || jt === "ประเมินหน้างาน" || jt === "ประเมิน");

    // [BUG-1 Route guard] เคลียร์แบบต้องมี target_job_id ก่อนปิดงาน
    if (isClearRevise) {
      const tid = (data as { target_job_id?: string | null }).target_job_id;
      if (!tid) throw new HttpError(400, "เคลียร์แบบต้องเลือกงานเดิมก่อนปิดงาน");
    }

    // โชว์รูม / อื่นๆ ที่ไม่ใช่ 2 path หลัก → ปิดคิวเฉยๆ
    if (!isClearRevise && !isAssess) {
      return ok(data);
    }

    // เรียก RPC — idempotent ลองใหม่ได้
    const { data: jobId, error: pErr } = await (ctx.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc("promote_queue_to_job", { p_queue_id: params.id });
    if (pErr) throw dbError(pErr);

    if (!jobId) return ok(data, { job_id: null });

    // ─── path เคลียร์แบบ ──────────────────────────────────────────────────
    if (isClearRevise) {
      if (clear_revise !== false) {
        // set design_state = REVISING + bump revise count (ถ้ายังไม่ REVISING)
        // + coalesce design_start = today
        const today = new Date().toISOString().slice(0, 10);
        const { data: jrow } = await sb.from("jobs")
          .select("design_state, design_start, design_revise_count")
          .eq("id", jobId)
          .maybeSingle();
        const jr = jrow as {
          design_state?: string;
          design_start?: string | null;
          design_revise_count?: number;
        } | null;

        const alreadyRevising = jr?.design_state === "REVISING";
        await sb.from("jobs").update({
          design_state: "REVISING",
          design_revise_count: alreadyRevising
            ? (jr?.design_revise_count ?? 0)
            : (jr?.design_revise_count ?? 0) + 1,
          design_start: jr?.design_start ?? today,
          // อย่าล้าง quote_sent_date — งานกลับเข้าใบเสนอตาม flow เดิม
        }).eq("id", jobId);

        await audit({
          jobId,
          userId: ctx.user.id,
          action: "CLEAR_REVISE_QUEUE_DONE",
          table: "jobs",
          recordId: jobId,
          newValue: {
            design_state: "REVISING",
            triggered_by_queue: params.id,
          },
        });
      }
      return ok(data, { job_id: jobId });
    }

    // ─── path ประเมินหน้างาน ──────────────────────────────────────────────
    // assess_date มาจาก promote (queue_date) ผ่าน trigger อยู่แล้ว — ไม่ต้องอัปเดตซ้ำ
    // (เดิม: target_job_id → บันทึก assess_date ใต้งานเดิม ซึ่งผิด เพราะสร้างงานใหม่แล้ว)

    // [0067] เลิก auto-revive — ยกเลิก = อยู่ยกเลิกถาวร (ไม่ปลุกงานที่ยกเลิกกลับมาตอนกดเสร็จ/แก้คิว)
    // ประเมินเสร็จที่ยังไม่มีงาน → _promote_queue_core สร้างใหม่ให้แล้ว (ด้านบน)

    // ─── wiring มัดจำหน้างาน (ฟีเจอร์ A) ────────────────────────────────
    if (body.payment === "มัดจำหน้างาน") {
      // โหลดสถานะปัจจุบัน (อาจเพิ่งเป็น LEAD จาก cancel-revive ข้างบน)
      const { data: jobCurrent } = await sb.from("jobs")
        .select("status").eq("id", jobId).maybeSingle();
      const currentStatus = (jobCurrent as { status?: string } | null)?.status ?? "";

      if (PRE_DEPOSIT.includes(currentStatus)) {
        const today = new Date().toISOString().slice(0, 10);
        const { error: depErr } = await sb.from("jobs").update({
          status: "DEPOSITED",
          deposit_date: today,
          onsite_deposit: true,
          // deposit_amount = null → trigger tg_on_deposit สร้าง production ข้าม finance
        }).eq("id", jobId);

        if (!depErr) {
          await audit({
            jobId,
            userId: ctx.user.id,
            action: "ONSITE_DEPOSIT_QUEUE_DONE",
            table: "jobs",
            recordId: jobId,
            newValue: {
              status: "DEPOSITED",
              deposit_date: today,
              onsite_deposit: true,
              deposit_amount: null,
            },
          });
        }
        // best-effort: ไม่ throw ถ้า deposit update พัง (แจ้ง admin ทีหลังได้)
      }
    }

    // (0070) materialize "นามออกบิล" จากตัวเลือกในคิว (best-effort — ทุกอย่างซิงก์กัน)
    //   COMPANY → สร้างนามบริษัทให้ลูกค้า + ตั้งเป็นนามหลัก (กันซ้ำด้วยชื่อ)
    //   OTHER_ADDR → นามเดิม แต่ตั้งที่อยู่ออกบิล = ที่อยู่อื่น · ที่อยู่หน้างานไปเป็น ship_address บนนามหลัก
    try {
      const bc = (data as { bill_choice?: string }).bill_choice ?? "SITE";
      if (bc !== "SITE") {
        const { data: jr } = await sb.from("jobs").select("customer_id").eq("id", jobId).maybeSingle();
        const cid = (jr as { customer_id?: number | null } | null)?.customer_id ?? null;
        const d = data as { bill_name?: string; bill_tax_id?: string; bill_branch?: string; bill_address?: string; address?: string };
        if (cid && bc === "COMPANY") {
          const billName = (d.bill_name ?? "").trim();
          if (billName) {
            const { data: exist } = await sb.from("billing_profiles").select("id").eq("customer_id", cid).eq("bill_name", billName).maybeSingle();
            if (!exist) {
              await sb.from("billing_profiles").update({ is_default: false }).eq("customer_id", cid).eq("is_default", true);
              await sb.from("billing_profiles").insert({
                customer_id: cid, kind: "COMPANY", bill_name: billName,
                tax_id: (d.bill_tax_id ?? "").trim(), branch: (d.bill_branch ?? "").trim() || "สำนักงานใหญ่",
                address: (d.bill_address ?? "").trim(), ship_address: d.address ?? "",
                contact_person: "", phone: "", is_default: true,
              });
            }
          }
        } else if (cid && bc === "OTHER_ADDR" && (d.bill_address ?? "").trim()) {
          const { data: defP } = await sb.from("billing_profiles").select("id").eq("customer_id", cid).eq("is_default", true).maybeSingle();
          const pid = (defP as { id?: number } | null)?.id;
          if (pid) await sb.from("billing_profiles").update({ address: (d.bill_address ?? "").trim(), ship_address: d.address ?? "" }).eq("id", pid);
        }
      }
    } catch { /* best-effort — ไม่บล็อกการปิดคิว */ }

    return ok(data, { job_id: jobId });
  }

  return ok(data);
});

// DELETE /api/queue/[id] — ลบคิว (ADMIN) · เช็คว่ามีแถวจริงก่อนคืน success
export const DELETE = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "write");
  const sb = ctx.supabase as unknown as Sb;

  // ลบจริงเสมอ (forceDelete) + เก็บกวาดลูกค้าใหม่ที่ผูกเฉพาะคิวนี้
  const res = await removeQueueOnCancel(sb, params.id, { forceDelete: true });
  if (!res.found) throw new HttpError(404, "ไม่พบคิวที่จะลบ");
  await audit({
    userId: ctx.user.id,
    action: "QUEUE_REMOVED",
    table: "queue_entries",
    recordId: params.id,
    newValue: { removed_customer_id: res.removedCustomerId },
  });
  return ok({ id: params.id, removed_customer: res.removedCustomerId != null });
});
