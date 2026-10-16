import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { fail } from "@/lib/bff";
import { regenSetsFromQuotation, listQuotationPullOptions } from "@/lib/production/regen-sets";

export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

const schema = z.object({
  job_id: z.string().uuid(),
  // ใบที่จะดึง (ต้องเป็นใบของงานนี้) — ไม่ส่ง = ระบบเลือก (ใบที่มีบิล/มัดจำ · ไม่งั้นล่าสุด)
  quotation_id: z.number().int().positive().nullish(),
  // add = เพิ่มเฉพาะข้อใหม่ (ค่าเริ่มต้น) · replace = ลบชุด auto ทั้งหมดแล้วดึงใบนี้ใหม่ (คงชุดเพิ่มมือ)
  mode: z.enum(["add", "replace"]).optional(),
  // add เท่านั้น: ยืนยันเพิ่มทับทั้งที่ชุดเดิมมาจากใบอื่น (ปกติ API จะคืน other_quotation ให้ถามก่อน)
  force: z.boolean().optional(),
});

// GET /api/production-sets/from-quotation?job_id= → ใบเสนอทุกใบของงาน + จำนวนข้อ + ใบต้นทางชุดปัจจุบัน + ใบที่แนะนำ
//   ให้หน้าผลิต "ให้ผู้ใช้เลือกใบ" เมื่องานมีหลายใบ (16 ต.ค.69 — เลิกเดาให้)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "read");
  const jobId = new URL(req.url).searchParams.get("job_id") ?? "";
  if (!z.string().uuid().safeParse(jobId).success) return fail("job_id ไม่ถูกต้อง");
  const sb = ctx.supabase as unknown as Sb;
  return ok(await listQuotationPullOptions(sb, jobId));
});

// POST /api/production-sets/from-quotation { job_id, quotation_id?, mode?, force? }
//   "ดึงจากใบเสนอ" — สร้าง 1 ชุด/ข้อ (ที่เป็นงานจริง) + เติมสเปคจากข้อความในใบเสนอ (แก้ได้)
//   add: ไม่ทับของเดิม — ข้ามข้อที่มีชุดชื่อเดียวกันอยู่แล้ว (กดซ้ำได้ ดึงเฉพาะข้อใหม่)
//        ⚠ ถ้าชุด auto เดิมมาจาก "ใบอื่น" คืน reason other_quotation (+current/target) ให้หน้าจอถามก่อน ไม่ปนเงียบ ๆ
//   replace: ใช้ตอนผู้ใช้เลือก "แทนที่" · (ตอน Rev ใบเสนอ ระบบ regen แบบ replace ให้เองอยู่แล้ว ดู quotations/[id] PATCH)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const body = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  const r = await regenSetsFromQuotation(sb, body.job_id, ctx.user.id, {
    replace: body.mode === "replace",
    quotationId: body.quotation_id ?? null,
    force: body.force === true,
  });
  if (r.reason === "bad_quotation") return fail("ใบเสนอที่เลือกไม่ใช่ใบของงานนี้ (หรือถูกยกเลิกแล้ว)", 409);
  return ok(r);
});
