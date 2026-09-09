import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { regenSetsFromQuotation } from "@/lib/production/regen-sets";

export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

const schema = z.object({ job_id: z.string().uuid() });

// POST /api/production-sets/from-quotation { job_id }
//   "ดึงจากใบเสนอ" — สร้าง 1 ชุด/ข้อ (ที่เป็นงานจริง) + เติมสเปคจากข้อความในใบเสนอ (แก้ได้)
//   ไม่ทับของเดิม: ข้ามข้อที่มีชุดชื่อเดียวกันอยู่แล้ว (กดซ้ำได้ ดึงเฉพาะข้อใหม่)
//   ตอน Rev ใบเสนอ ระบบจะ regen แบบ replace ให้เองอัตโนมัติ (ดู quotations/[id] PATCH)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  const { job_id } = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  const r = await regenSetsFromQuotation(sb, job_id, ctx.user.id, { replace: false });
  if (r.reason === "no_quotation") return ok({ created: 0, skipped: 0, reason: "no_quotation" });
  return ok({ created: r.created, skipped: r.skipped });
});
