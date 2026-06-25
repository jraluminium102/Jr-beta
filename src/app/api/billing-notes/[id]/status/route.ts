import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";

// PATCH /api/billing-notes/[id]/status — override ป้ายสถานะที่โชว์บนเอกสาร (display-only)
// ไม่กระทบยอด/งวด/VAT/finance_entries — แค่ป้ายที่แสดง · null = กลับไปอัตโนมัติ
// อนุญาตเฉพาะ unpaid/partial/paid (ยกเลิกต้องผ่าน void) — มี audit log
const Schema = z.object({
  display_status: z.union([z.enum(["unpaid", "partial", "paid"]), z.null()]),
});

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);
  const { display_status } = parsed.data;

  const { data: bn, error: e } = await ctx.supabase
    .from("billing_notes")
    .select("id, status, display_status")
    .eq("id", params.id)
    .single<{ id: number; status: string; display_status: string | null }>();
  if (e || !bn) return notFound("ไม่พบใบวางบิล");
  if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว", 409);

  // กันบิดเบือน: โชว์สถานะ "สูงกว่าความจริง" ไม่ได้ (เช่น โชว์ ชำระครบ ทั้งที่ยังรับเงินไม่ครบ)
  // อนุญาตเท่ากับหรือต่ำกว่าสถานะจริง (conservative) — สถานะจริงคำนวณจากการชำระอยู่แล้ว
  const RANK: Record<string, number> = { unpaid: 0, partial: 1, paid: 2 };
  const LABEL: Record<string, string> = { unpaid: "ยังไม่ชำระ", partial: "ชำระบางส่วน", paid: "ชำระครบ" };
  if (display_status && (RANK[display_status] ?? 0) > (RANK[bn.status] ?? 0)) {
    return err(
      `ตั้งสถานะ "${LABEL[display_status]}" ไม่ได้ เพราะการชำระจริงยังเป็น "${LABEL[bn.status] ?? bn.status}" — ปรับให้สูงกว่าความจริงไม่ได้ (ถ้ารับเงินแล้วให้ออกใบเสร็จ/บันทึกชำระ)`,
      409
    );
  }

  const { error: uErr } = await ctx.supabase
    .from("billing_notes")
    .update({ display_status } as never)
    .eq("id", params.id);
  if (uErr) return err(uErr.message, 500);

  await audit({
    userId: ctx.user.id,
    action: "EDIT_BILLING_DISPLAY_STATUS",
    table: "billing_notes",
    recordId: params.id,
    oldValue: { display_status: bn.display_status },
    newValue: { display_status },
  });

  return ok({ ok: true });
});
