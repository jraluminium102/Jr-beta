import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok as okR, err, notFound } from "@/lib/bff/response";

// GET /api/receipts/[id]  → ใบเสร็จเดี่ยว
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}

// PATCH /api/receipts/[id]  → แก้ "ข้อความ" บนใบเสร็จ/ใบกำกับ (รายการ/หมายเหตุ) — ไม่แตะยอด/VAT (เอกสารภาษี)
// guard: block ใบ void (เป็นหลักฐาน) · whitelist item_desc/note · audit เต็ม
const PatchSchema = z.object({
  item_desc: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
}).refine((d) => d.item_desc !== undefined || d.note !== undefined, { message: "ไม่มีข้อมูลให้แก้" });

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);

  const { data: rc, error: e } = await ctx.supabase
    .from("receipts")
    .select("id, is_voided, item_desc, note")
    .eq("id", params.id)
    .single<{ id: number; is_voided: boolean | null; item_desc: string | null; note: string | null }>();
  if (e || !rc) return notFound("ไม่พบใบเสร็จ");
  if (rc.is_voided) return err("ใบเสร็จนี้ถูกยกเลิกแล้ว — แก้ไขไม่ได้ (เป็นหลักฐาน)", 409);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  if (parsed.data.item_desc !== undefined) update.item_desc = parsed.data.item_desc.trim();
  if (parsed.data.note !== undefined) update.note = parsed.data.note.trim();

  const { error: uErr } = await ctx.supabase.from("receipts").update(update as never).eq("id", params.id);
  if (uErr) return err(uErr.message, 500);

  await audit({
    userId: ctx.user.id,
    action: "EDIT_RECEIPT_TEXT",
    table: "receipts",
    recordId: params.id,
    oldValue: { item_desc: rc.item_desc, note: rc.note },
    newValue: update,
  });

  return okR({ ok: true, ...update });
});
