import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { regenSetsFromQuotation, currentAutoQuotations } from "@/lib/production/regen-sets";

export const dynamic = "force-dynamic";
type Params = { params: { id: string } };
type Sb = { from: (t: string) => any };

/**
 * Rev. หลังมัดจำ (0169)
 *   GET  /api/jobs/[id]/rev-review            → ประวัติรีวิว Rev ของงาน (ล่าสุดก่อน)
 *   POST /api/jobs/[id]/rev-review            → ฝ่ายผลิต "รับทราบ" {review_id, note?, sets?: "regen"|"keep"}
 *        sets=regen → ดึงชุดผลิตใหม่จากใบเสนอ Rev ล่าสุด (แทนที่ชุด auto · สถานะผลิตของชุดรีเซ็ต) ก่อนปิดรีวิว
 */
export const GET = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb.from("job_rev_reviews").select("*").eq("job_id", params.id).order("created_at", { ascending: false }).limit(20);
  if (error) return ok([]);   // ยังไม่รัน 0169
  return ok(data ?? []);
});

const ackSchema = z.object({
  review_id: z.number().int().positive(),
  note: z.string().max(300).optional(),
  sets: z.enum(["regen", "keep"]).optional(),
});

export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as Sb;
  const body = ackSchema.parse(await req.json().catch(() => ({})));

  const { data: rv, error: rErr } = await sb.from("job_rev_reviews").select("id, job_id, quotation_id, rev_no, ack_at, sets_regen").eq("id", body.review_id).maybeSingle();
  if (rErr) return err(/job_rev_reviews/.test(rErr.message ?? "") ? "ยังไม่ได้รัน migration 0169 (Rev หลังมัดจำ)" : "อ่านรายการ Rev ไม่สำเร็จ: " + rErr.message, 400);
  if (!rv || rv.job_id !== params.id) return notFound("ไม่พบรายการ Rev ของงานนี้");
  if (rv.ack_at) return err("รายการนี้รับทราบไปแล้ว", 409);

  // ดึงชุดใหม่: ชุดต้องมาจากใบนี้ใบเดียว — replace ลบ "ทุก" ชุด auto ถ้าระหว่างรอมีคนดึงใบอื่นเข้ามา จะลบของใบนั้นเงียบ ๆ (QA MED-5)
  if (body.sets === "regen") {
    const cur = await currentAutoQuotations(sb, params.id);
    const others = cur.filter((c) => c.id !== Number(rv.quotation_id));
    if (others.length) return err(`ชุดผลิตของงานนี้มีที่ดึงจากใบเสนออื่นด้วย (${others.map((c) => c.code).join(", ")}) — เคลียร์ชุดที่หน้าผลิตก่อน แล้วค่อยดึงใหม่`, 409);
  }

  // claim ก่อน (ปิดได้คนเดียว · กดซ้ำ/2 คนพร้อมกัน → คนหลัง 409 และไม่ regen ซ้ำ) แล้วค่อย regen · regen พัง = ถอน claim (QA MED-4)
  const ackRow = {
    ack_at: new Date().toISOString(), ack_by: ctx.user.id, ack_by_name: ctx.profile.full_name ?? "",
    ack_note: String(body.note ?? "").trim().slice(0, 300), ack_sets: body.sets ?? "",
  };
  const { data: won, error: uErr } = await sb.from("job_rev_reviews").update(ackRow).eq("id", body.review_id).is("ack_at", null).select("id");
  if (uErr) return err("บันทึกรับทราบไม่สำเร็จ: " + uErr.message, 500);
  if (!(won ?? []).length) return err("รายการนี้เพิ่งถูกรับทราบโดยคนอื่น — โหลดหน้าใหม่", 409);

  let regen: unknown = null;
  if (body.sets === "regen") {
    try {
      const res = await regenSetsFromQuotation(sb, params.id, ctx.user.id, { replace: true, quotationId: Number(rv.quotation_id) });
      if (res.reason) {
        await sb.from("job_rev_reviews").update({ ack_at: null, ack_by: null, ack_by_name: "", ack_note: "", ack_sets: "" }).eq("id", body.review_id).eq("ack_by", ctx.user.id);
        const why: Record<string, string> = { empty_quotation: "ใบเสนอ Rev นี้ไม่มีข้อที่มีรายละเอียดงาน ดึงชุดไม่ได้", bad_quotation: "ใบเสนอไม่ใช่ของงานนี้/ถูกยกเลิก", no_quotation: "งานไม่มีใบเสนอ", other_quotation: "ชุดผลิตมาจากใบอื่น" };
        return err(`ดึงชุดผลิตใหม่ไม่ได้: ${why[res.reason] ?? res.reason} — ยังไม่ปิดรายการ Rev`, 422);
      }
      regen = res;
    } catch (e) {
      await sb.from("job_rev_reviews").update({ ack_at: null, ack_by: null, ack_by_name: "", ack_note: "", ack_sets: "" }).eq("id", body.review_id).eq("ack_by", ctx.user.id);
      return err("ดึงชุดผลิตใหม่ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)) + " — ยังไม่ปิดรายการ Rev", 500);
    }
  }
  // Rev ก่อนหน้าของงานเดียวกันที่ยังค้าง → ปิดพร้อมกัน (ตรวจของล่าสุดแล้ว = รู้ครบ · กันป้ายเด้งกลับ QA MED-6)
  await sb.from("job_rev_reviews").update({ ...ackRow, ack_note: `ปิดพร้อม Rev${rv.rev_no}` }).eq("job_id", params.id).is("ack_at", null);

  await audit({ jobId: params.id, userId: ctx.user.id, action: "JOB_REV_ACK", table: "job_rev_reviews", recordId: String(body.review_id),
    newValue: { rev_no: rv.rev_no, sets: body.sets ?? "", note: body.note ?? "", by: ctx.profile.full_name ?? "" } });
  return ok({ id: body.review_id, regen });
});
