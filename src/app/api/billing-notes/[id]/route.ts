import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { err, notFound } from "@/lib/bff/response";
import { suggestInstallments, computeTotals, footerSnapshot, backoutVat } from "@/lib/money";

// GET /api/billing-notes/[id]  → ใบวางบิล + งวดชำระ
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("billing_notes")
    .select("*, billing_installments(*)")
    .eq("id", params.id)
    .order("sort_order", { foreignTable: "billing_installments", ascending: true })
    .single();
  if (error) return fail(error.message, 404);
  return ok(data);
}

// ──────────────────────────────────────────────────────────────────
// PATCH /api/billing-notes/[id]  → แก้ยอดบิล + re-split งวดใหม่
// รับได้ 2 โหมด:
//   (A) { total }                         → override ยอดตรงๆ (เดิม)
//   (B) { discount_pct, vat_rate, wht_rate } → แก้ footer (คิดใหม่จาก subtotal ของบิล) net→total
// Guard: ห้ามแก้ถ้ามีงวด paid หรือมี receipt/finance_entry ผูกอยู่
// ──────────────────────────────────────────────────────────────────
const PatchSchema = z.object({
  total: z.number({ invalid_type_error: "ยอดต้องเป็นตัวเลข" }).positive("ยอดต้องมากกว่า 0").optional(),
  subtotal: z.number().min(0).optional(),   // ยอดก่อนภาษีที่กรอกเอง (footer editor คิดใหม่จริง) — ใช้แทน subtotal ใบเสนอ
  discount_pct: z.number().min(0, "ส่วนลดต้อง ≥ 0").max(100, "ส่วนลดต้องอยู่ 0–100%").optional(),
  vat_rate: z.number().min(0).max(100).optional(),
  wht_rate: z.number().min(0).max(100).optional(),
  labor_ratio: z.number().min(0, "% ค่าแรงต้อง ≥ 0").max(100, "% ค่าแรงต้องอยู่ 0–100").nullable().optional(),
});

export const PATCH = withRoute(
  async (req: Request, { params }: { params: { id: string } }) => {
    const ctx = await requirePermission("finance", "write");

    const body = await req.json().catch(() => ({}));

    // โหมด C = footer override (display-only) — แก้ footer ใบเต็มบน PDF · ไม่ re-split ไม่กระทบยอด/งวด · ทำได้แม้จ่ายแล้ว
    // รับ "ค่าตั้งต้น" (subtotal + %) แล้วคิด snapshot ด้วย computeTotals (server-authoritative)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (body && typeof body === "object" && "footer_override" in (body as any)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (body as any).footer_override;
      // ⚠ ห้ามเชื่อ client เรื่องอัตราภาษี (กฎเดียวกับ POST /api/receipts) — footer นี้ display-only ไม่แตะยอด booked
      //   ปล่อยให้ตั้ง VAT ต่างจากใบ = ใบที่ส่งลูกค้าขัดกับใบกำกับที่ออกตามมา · UI ล็อกแล้วแต่ต้องบังคับที่ server ด้วย
      // fail-closed: อ่านอัตราไม่ได้ = ไม่เขียน (ห้ามเดา 0 — เดาผิดคือ VAT หายจากใบที่ส่งลูกค้า)
      let ovVat = 0, ovWht = 0;
      if (raw != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cur } = await (ctx.supabase as any)
          .from("billing_notes").select("vat_rate, wht_rate").eq("id", params.id).single();
        if (!cur) return err("อ่านอัตราภาษีของใบวางบิลไม่ได้ — ลองใหม่", 500);
        ovVat = Number(cur.vat_rate) || 0;
        ovWht = Number(cur.wht_rate) || 0;
      }
      const value =
        raw == null ? null : footerSnapshot(raw.subtotal, raw.discount_pct, ovVat, ovWht);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ovErr } = await (ctx.supabase as any)
        .from("billing_notes").update({ footer_override: value }).eq("id", params.id);
      if (ovErr && /footer_override/i.test(ovErr.message ?? "")) return err("ยังไม่ได้รัน migration 0085 (footer ใบเต็ม) — รันก่อนใช้งาน", 400);
      if (ovErr) return err(ovErr.message, 500);
      return ok({ ok: true, footer_override: value });
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.errors[0].message, 400);

    // โหมด B = แก้ footer (มี field ภาษี/ส่วนลด หรือ subtotal ที่กรอกเอง อย่างน้อย 1 ตัว) · ไม่งั้นโหมด A = แก้ยอดตรง
    const isBreakdownMode =
      parsed.data.subtotal != null || parsed.data.discount_pct != null || parsed.data.vat_rate != null || parsed.data.wht_rate != null;
    if (!isBreakdownMode && parsed.data.total == null) return err("ต้องระบุยอดใหม่ หรือ ส่วนลด/VAT", 400);
    const bnId = params.id;

    // 1) ดึงใบวางบิล + งวดปัจจุบัน (subtotal ใช้เป็นฐานโหมด B)
    // ดึง breakdown เดิมด้วย (ใช้ rollback ให้ครบถ้า RPC fail — บัญชีเตือน footer ต้องตรง total เสมอ)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bn, error: bnErr } = await (ctx.supabase as any)
      .from("billing_notes")
      .select("id, total, subtotal, discount_pct, discount_amt, vat_rate, vat_amt, wht_rate, wht_amt, has_tax_breakdown, vat_rate_set, labor_ratio, quotation_id, status, billing_installments(id, status, paid_amount)")
      .eq("id", bnId)
      .single();
    if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
    if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว แก้ยอดไม่ได้", 409);

    // breakdown เดิม (สำหรับ rollback) — คืนให้ครบทุกคอลัมน์ ไม่ใช่แค่ total
    const oldBreakdown = {
      subtotal: Number(bn.subtotal) || 0, discount_pct: Number(bn.discount_pct) || 0, discount_amt: Number(bn.discount_amt) || 0,
      vat_rate: Number(bn.vat_rate) || 0, vat_amt: Number(bn.vat_amt) || 0, wht_rate: Number(bn.wht_rate) || 0, wht_amt: Number(bn.wht_amt) || 0,
      has_tax_breakdown: !!bn.has_tax_breakdown, labor_ratio: bn.labor_ratio == null ? null : Number(bn.labor_ratio),
    };

    // คำนวณ newTotal + breakdown ตามโหมด
    let newTotal: number;
    let breakdown: Record<string, number | boolean | null>;
    if (isBreakdownMode) {
      // กันยอด booked เพี้ยน (บัญชีสั่ง 13ก.ค.): บิลที่ส่วนลดเป็น "จำนวนเงิน" (pct×subtotal ≠ discount_amt เป๊ะ)
      // mode B คิด footer ใหม่จาก % → total/งวดจะ drift · ยังไม่รองรับส่วนลดบาทในโหมดคิดใหม่ → กั้นไว้
      // แก้ส่วนลด/ยอดที่ "ใบเสนอราคา" แล้วออกบิลใหม่แทน (flow หลักสืบจำนวนเงินถูกต้องอยู่แล้ว)
      const cSub = Number(bn.subtotal) || 0, cAmt = Number(bn.discount_amt) || 0, cPct = Number(bn.discount_pct) || 0;
      const pctRecomp = Math.round((cSub * cPct) / 100 * 100) / 100;
      if (cAmt > 0 && cSub > 0 && pctRecomp !== cAmt) {
        return err("ใบนี้ใช้ส่วนลดแบบจำนวนเงิน — แก้ส่วนลด/ยอดที่ใบเสนอราคาแล้วออกบิลใหม่ (แก้ footer โหมดคิดยอดใหม่ยังไม่รองรับส่วนลดจำนวนเงิน)", 409);
      }
      // ฐานยอดก่อน VAT:
      //  1) subtotal ที่กรอกเองจาก footer editor (คิดใหม่จริง) มาก่อน — เจ้าของแก้ราคาบน PDF ได้ตรงๆ
      //  2) ถ้าไม่ได้ส่งมา → ใช้ subtotal จากใบเสนอต้นทาง (กัน VAT ทับ · bn.subtotal อาจ flatten 0078)
      let sub = Number(parsed.data.subtotal) || 0;
      if (sub <= 0 && bn.quotation_id) {
        const { data: q } = await ctx.supabase
          .from("quotations").select("subtotal").eq("id", bn.quotation_id)
          .single<{ subtotal: number | null }>();
        sub = Number(q?.subtotal) || 0;
      }
      if (sub <= 0) {
        return err("ยังไม่มียอดก่อนภาษี — กรอก 'รวมเป็นเงิน' ในช่อง footer ก่อน หรือใช้ 'แก้ยอดบิล'", 409);
      }
      const disc = Number(parsed.data.discount_pct) || 0;
      const vat = Number(parsed.data.vat_rate) || 0;
      const wht = Number(parsed.data.wht_rate) || 0;
      const bt = computeTotals({ items: [{ qty: 1, unit_price: sub }], vat_rate: vat, discount_pct: disc, wht_rate: wht });
      newTotal = bt.net;
      breakdown = {
        subtotal: bt.subtotal, discount_pct: disc, discount_amt: bt.discount_amt,
        vat_rate: vat, vat_amt: bt.vat_amt, wht_rate: wht, wht_amt: bt.wht_amt,
        has_tax_breakdown: true, vat_rate_set: true, // ผู้ใช้ยืนยันอัตรา VAT เอง → ใบเสร็จใช้ค่านี้ (0095)
      };
      // labor_ratio ปรับได้พร้อมกัน (null = ล้างการแยกค่าแรง/ค่าของ) — ตั้งเฉพาะเมื่อส่งมา
      // ⚠ ใช้ร่วมกับหัก ณ ที่จ่ายระดับใบ (wht>0) ไม่ได้ → บังคับ null (ยอดงวดหลัง WHT ทำถอด VAT เพี้ยน)
      if (parsed.data.labor_ratio !== undefined) breakdown.labor_ratio = wht > 0 ? null : parsed.data.labor_ratio;
    } else {
      // ── โหมด A: แก้ยอดตรง (flat) ──
      // ⚠ ใบที่มีหัก ณ ที่จ่าย: ยอด flat ที่กรอกคือ "ก่อนหัก WHT" หรือ "เงินที่โอนจริงหลังหัก"? — ไม่มีทางรู้
      //   เดาผิด = VAT บนใบกำกับผิดทันที → ปฏิเสธดีกว่าเดา (บัญชีสั่ง · pattern เดียวกับ guard ส่วนลดบาทข้างบน)
      if ((Number(bn.wht_rate) || 0) > 0) {
        return err("ใบนี้มีหัก ณ ที่จ่าย — แก้ยอดตรงไม่ได้ (ระบบแยกไม่ออกว่ายอดที่กรอกรวมหัก ณ ที่จ่ายแล้วหรือยัง) ใช้ 'แก้ VAT / ส่วนลด' หรือแก้ที่ใบเสนอราคาแทน", 409);
      }
      newTotal = Math.round((parsed.data.total! + Number.EPSILON) * 100) / 100; // round2
      // ยอด flat = "ยอดรวม VAT แล้ว" → ถอด VAT ตามอัตราที่ใบเคยยืนยันไว้ (subtotal + vat = total เป๊ะ)
      // ⚠ carry forward vat_rate_set: เดิมล้างเป็น false → ใบเสร็จ fallback jobs.vat_rate → VAT 7% กลับมาเงียบๆ
      //   ทั้งที่ผู้ใช้เพิ่งติ๊ก VAT ออก (บัญชี P0) · has_tax_breakdown ต้อง false เพราะ subtotal ไม่ตรงใบเสนอแล้ว
      const keepSet = !!oldBreakdown.has_tax_breakdown || !!(bn as { vat_rate_set?: boolean }).vat_rate_set;
      const keepRate = keepSet ? Number(oldBreakdown.vat_rate) || 0 : 0;
      const flat = backoutVat(newTotal, keepRate);
      breakdown = {
        subtotal: flat.base, discount_pct: 0, discount_amt: 0,
        vat_rate: keepRate, vat_amt: flat.vat, wht_rate: 0, wht_amt: 0,
        has_tax_breakdown: false, vat_rate_set: keepSet,
      };
    }
    if (newTotal <= 0) return err("ยอดสุทธิต้องมากกว่า 0", 400);

    const installments = bn.billing_installments ?? [];
    const instIds = installments.map((i) => i.id);

    // 2) guard: มีงวด paid หรือ receipt/finance_entry ผูกอยู่
    const hasPaidInstallment = installments.some(
      (i) => i.status === "paid" || (Number(i.paid_amount) || 0) > 0
    );
    if (hasPaidInstallment) {
      return err("มีการชำระแล้ว แก้ยอดไม่ได้ ต้องยกเลิกบิลออกใหม่", 409);
    }
    if (instIds.length > 0) {
      const [{ count: rcCount }, { count: feCount }] = await Promise.all([
        ctx.supabase
          .from("receipts")
          .select("id", { count: "exact", head: true })
          .in("installment_id", instIds),
        ctx.supabase
          .from("finance_entries")
          .select("id", { count: "exact", head: true })
          .in("billing_installment_id", instIds),
      ]);
      if ((rcCount ?? 0) > 0 || (feCount ?? 0) > 0) {
        return err("มีการชำระแล้ว แก้ยอดไม่ได้ ต้องยกเลิกบิลออกใหม่", 409);
      }
    }

    const oldTotal = Number(bn.total) || 0;

    // 3) อัปเดต total + breakdown ก่อน (RPC อ่าน total ใหม่ → งวดตรง · footer ตรง total เสมอ)
    let { error: upErr } = await ctx.supabase
      .from("billing_notes")
      .update({ total: newTotal, ...breakdown })
      .eq("id", bnId);
    // กันพัง: ถ้า 0078/0079/0081 (ยอดแยก) ยังไม่รัน → อัปเดตแค่ total (ยอดยังถูก)
    if (upErr && /subtotal|discount_amt|vat_amt|wht_amt|discount_pct|vat_rate|wht_rate|has_tax_breakdown|vat_rate_set|labor_ratio/i.test(upErr.message ?? "")) {
      ({ error: upErr } = await ctx.supabase.from("billing_notes").update({ total: newTotal }).eq("id", bnId));
    }
    if (upErr) return err("อัปเดตยอดไม่สำเร็จ: " + upErr.message, 500);

    // 4) re-split งวดผ่าน RPC replace_billing_installments (1 txn → constraint ผ่าน)
    const plan = suggestInstallments(newTotal);
    const items = plan.map((p) => ({
      seq: p.seq,
      label: p.label,
      amount: p.amount,
      due_date: null,
    }));

    const sb = ctx.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ error: { message: string } | null }>;
    };
    const { error: rpcErr } = await sb.rpc("replace_billing_installments", {
      p_bn_id: Number(bnId),
      p_items: items,
    });
    if (rpcErr) {
      // rollback total + breakdown ให้ครบถ้า RPC ล้มเหลว (best-effort) — footer ต้องตรง total เดิม
      let { error: rbErr } = await ctx.supabase
        .from("billing_notes")
        .update({ total: oldTotal, ...oldBreakdown })
        .eq("id", bnId);
      if (rbErr) ({ error: rbErr } = await ctx.supabase.from("billing_notes").update({ total: oldTotal }).eq("id", bnId));
      return err("re-split งวดไม่สำเร็จ: " + rpcErr.message, 500);
    }

    // 5) audit
    await audit({
      userId: ctx.user.id,
      action: isBreakdownMode ? "UPDATE_BILLING_BREAKDOWN" : "UPDATE_BILLING_TOTAL",
      table: "billing_notes",
      recordId: bnId,
      oldValue: { total: oldTotal },
      newValue: { total: newTotal, ...(breakdown ?? {}), installments: items },
    });

    return ok({ ok: true, total: newTotal, installments: items });
  }
);
