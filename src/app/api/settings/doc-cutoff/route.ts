import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { getDocCutoff, setDocCutoff } from "@/lib/doc-cutoff";

// GET /api/settings/doc-cutoff → วันตัดเอกสารทดสอบปัจจุบัน
export const GET = withRoute(async () => {
  await requirePermission("settings", "read");
  return ok({ cutoff: await getDocCutoff() });
});

const Schema = z.object({
  // "" = ล้างวันตัด (โชว์ทุกเอกสาร) · YYYY-MM-DD = เอกสารก่อนวันนี้ = ทดสอบ
  cutoff: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็น YYYY-MM-DD")]),
});

// POST /api/settings/doc-cutoff { cutoff } → ตั้งวันตัด (ADMIN/บัญชี เท่านั้น)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("settings", "write");
  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return err(p.error.errors[0].message, 400);
  await setDocCutoff(p.data.cutoff);
  await audit({ userId: ctx.user.id, action: "SET_DOC_CUTOFF", table: "app_config", newValue: { cutoff: p.data.cutoff } });
  return ok({ cutoff: p.data.cutoff });
});
