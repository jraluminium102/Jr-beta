import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { err, notFound } from "@/lib/bff/response";
import {
  suggestInstallments, computeTotals, footerSnapshot, backoutVat,
  planRevUnpaidInstallments, planRevUnpaidInstallmentsLabor,
} from "@/lib/money";
import { classifyLockedInstallments, type InstallmentForLock } from "@/lib/billing";

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
  // ── Rev ใบวางบิลได้แม้ชำระแล้ว (24 ส.ค.69) — แยก flow จาก edit ก่อนจ่ายเดิมโดยสิ้นเชิง ──
  //   rev:true = ข้าม guard "ห้ามแก้ถ้าจ่ายแล้ว" แล้วใช้ replace_unpaid_installments (0126) แทน
  //   (ตรึงงวด locked ไว้ + re-split เฉพาะที่เหลือ) — ต้องระบุ reason เสมอ (บังคับ audit trail)
  rev: z.boolean().optional(),
  reason: z.string().max(500).optional(),
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
      // ⚠ เคย ignore อัตราจาก client (15 ก.ค.69) → ถอยคืนวันเดียวกัน ด้วยเหตุผลเดียวกับ footer ต่องวด
      //   (ตั้งภาษีต่างจากใบ = flow จริงของร้าน · ดู api/billing-installments/[id]/route.ts)
      const value =
        raw == null ? null : footerSnapshot(raw.subtotal, raw.discount_pct, raw.vat_rate, raw.wht_rate);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ovErr } = await (ctx.supabase as any)
        .from("billing_notes").update({ footer_override: value }).eq("id", params.id);
      if (ovErr && /footer_override/i.test(ovErr.message ?? "")) return err("ยังไม่ได้รัน migration 0085 (footer ใบเต็ม) — รันก่อนใช้งาน", 400);
      if (ovErr) return err(ovErr.message, 500);
      return ok({ ok: true, footer_override: value });
    }

    // ช่องทางชำระ (payment_note) — ข้อความ display-only ท้ายใบ · แก้ได้เสมอ (ไม่กระทบยอด/งวด · ไม่ re-split)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (body && typeof body === "object" && "payment_note" in (body as any)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pn = String((body as any).payment_note ?? "").slice(0, 800);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: pErr } = await (ctx.supabase as any)
        .from("billing_notes").update({ payment_note: pn }).eq("id", params.id);
      if (pErr && /payment_note/i.test(pErr.message ?? "")) return err("ยังไม่ได้รัน migration 0104 (ช่องทางชำระ) — รันก่อนใช้งาน", 400);
      if (pErr) return err(pErr.message, 500);
      return ok({ ok: true, payment_note: pn });
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.errors[0].message, 400);

    // โหมด B = แก้ footer (มี field ภาษี/ส่วนลด หรือ subtotal ที่กรอกเอง อย่างน้อย 1 ตัว) · ไม่งั้นโหมด A = แก้ยอดตรง
    const isBreakdownMode =
      parsed.data.subtotal != null || parsed.data.discount_pct != null || parsed.data.vat_rate != null || parsed.data.wht_rate != null;
    if (!isBreakdownMode && parsed.data.total == null) return err("ต้องระบุยอดใหม่ หรือ ส่วนลด/VAT", 400);
    const bnId = params.id;

    // Rev หลังชำระแล้ว (24 ส.ค.69) — ต้องระบุเหตุผลเสมอ (บังคับ audit trail)
    const rev = parsed.data.rev === true;
    const revReason = (parsed.data.reason ?? "").trim();
    // 0127 — แก้ได้แม้ชำระ/มีใบเสร็จ · เก็บไว้เตือนบนหน้าจอแทนการบล็อก
    const confirmBelowPaid = (body as Record<string, unknown>)?.confirm_below_paid === true;
    let warnPaidSum = 0, warnLinkedDocs = 0;
    if (rev && revReason.length < 5) {
      return err("Rev (แก้แม้ชำระแล้ว) ต้องระบุเหตุผล อย่างน้อย 5 ตัวอักษร", 400);
    }

    // 1) ดึงใบวางบิล + งวดปัจจุบัน (subtotal ใช้เป็นฐานโหมด B) + ฟิลด์ภาษี booked ต่องวด (0102/0117 — ใช้คำนวณ Rev บิลค่าแรง)
    // ดึง breakdown เดิมด้วย (ใช้ rollback ให้ครบถ้า RPC fail — บัญชีเตือน footer ต้องตรง total เสมอ)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bn, error: bnErr } = await (ctx.supabase as any)
      .from("billing_notes")
      .select("id, total, subtotal, discount_pct, discount_amt, vat_rate, vat_amt, wht_rate, wht_amt, has_tax_breakdown, vat_rate_set, labor_ratio, labor_amt, quotation_id, status, billing_installments(id, seq, label, amount, status, paid_amount, base_amt, kind)")
      .eq("id", bnId)
      .single();
    if (bnErr || !bn) return notFound("ไม่พบใบวางบิล");
    if (bn.status === "cancelled") return err("ใบวางบิลถูกยกเลิกแล้ว แก้ยอดไม่ได้", 409);
    const isLaborBill = bn.labor_amt != null;
    // 🔴 บิลค่าแรง (หัก ณ ที่จ่ายเฉพาะค่าแรง · ภาษี booked ต่องวด) — ต้องผ่านโหมด B + Rev เท่านั้น (มีทาง re-split
    //    แบบ tax-aware ทางเดียว คือ planRevUnpaidInstallmentsLabor — ทำได้แม้ยังไม่จ่ายก็ได้ แค่ต้องใช้ path นี้เสมอ)
    if (isLaborBill && !isBreakdownMode) {
      return err("ใบวางบิลค่าแรง (หัก ณ ที่จ่ายเฉพาะค่าแรง) แก้ยอดตรง (flat) ไม่ได้ — ใช้ 'แก้ VAT / ส่วนลด' แบบ Rev แทน", 409);
    }
    if (isLaborBill && !rev) {
      return err("ใบวางบิลค่าแรง (หัก ณ ที่จ่ายเฉพาะค่าแรง) แก้ยอด/ส่วนลด/VAT ต้องผ่านโหมด Rev (ระบุเหตุผล) เท่านั้น — กันภาษีต่องวดเพี้ยน", 409);
    }

    // breakdown เดิม (สำหรับ rollback) — คืนให้ครบทุกคอลัมน์ ไม่ใช่แค่ total
    const oldBreakdown = {
      subtotal: Number(bn.subtotal) || 0, discount_pct: Number(bn.discount_pct) || 0, discount_amt: Number(bn.discount_amt) || 0,
      vat_rate: Number(bn.vat_rate) || 0, vat_amt: Number(bn.vat_amt) || 0, wht_rate: Number(bn.wht_rate) || 0, wht_amt: Number(bn.wht_amt) || 0,
      has_tax_breakdown: !!bn.has_tax_breakdown, labor_ratio: bn.labor_ratio == null ? null : Number(bn.labor_ratio),
    };

    // คำนวณ newTotal + breakdown ตามโหมด
    let newTotal: number;
    let breakdown: Record<string, number | boolean | null>;
    // labor bill เท่านั้น: เป้าหมายฐาน material/labor (ก่อน VAT) ใหม่ทั้งใบ — ใช้วางแผน Rev ต่อ (planRevUnpaidInstallmentsLabor)
    let laborTargets: { material: number; labor: number } | null = null;
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
      // บิลค่าแรง: ส่ง labor_amount เดิม (bn.labor_amt) เข้า computeTotals → WHT คิดเฉพาะค่าแรง (ตรงกับตอนสร้างบิล)
      const bt = computeTotals({
        items: [{ qty: 1, unit_price: sub }], vat_rate: vat, discount_pct: disc, wht_rate: wht,
        ...(isLaborBill ? { labor_amount: Number(bn.labor_amt) || 0 } : {}),
      });
      newTotal = bt.net;
      breakdown = {
        subtotal: bt.subtotal, discount_pct: disc, discount_amt: bt.discount_amt,
        vat_rate: vat, vat_amt: bt.vat_amt, wht_rate: wht, wht_amt: bt.wht_amt,
        has_tax_breakdown: true, vat_rate_set: true, // ผู้ใช้ยืนยันอัตรา VAT เอง → ใบเสร็จใช้ค่านี้ (0095)
      };
      if (isLaborBill) {
        // labor_amt ที่แท้จริง (clamp ตาม after_discount) + labor_ratio derive ไว้โชว์ (สูตรเดียวกับตอนสร้างบิล POST /billing-notes)
        breakdown.labor_amt = bt.labor_amt;
        breakdown.labor_ratio = bt.after_discount > 0 ? Math.round((bt.labor_amt / bt.after_discount) * 10000) / 100 : null;
        laborTargets = { material: bt.material_amt, labor: bt.labor_amt };
      } else if (parsed.data.labor_ratio !== undefined) {
        // labor_ratio ปรับได้พร้อมกัน (null = ล้างการแยกค่าแรง/ค่าของ) — ตั้งเฉพาะเมื่อส่งมา
        // ⚠ ใช้ร่วมกับหัก ณ ที่จ่ายระดับใบ (wht>0) ไม่ได้ → บังคับ null (ยอดงวดหลัง WHT ทำถอด VAT เพี้ยน)
        breakdown.labor_ratio = wht > 0 ? null : parsed.data.labor_ratio;
      }
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

    const installments = (bn.billing_installments ?? []) as InstallmentForLock[];
    const instIds = installments.map((i) => i.id);

    // 2) guard: มีงวด paid หรือ receipt/finance_entry ผูกอยู่ — ข้ามถ้า rev:true (ใช้ locked-aware re-split แทน)
    let lockedSum = 0, paidLocked = 0, lockedMaterialBase = 0, lockedLaborBase = 0, lockedUnknownBase = 0;
    if (rev) {
      const li = await classifyLockedInstallments(ctx.supabase, installments);
      lockedSum = li.lockedSum; paidLocked = li.paidLocked;
      lockedMaterialBase = li.lockedMaterialBase; lockedLaborBase = li.lockedLaborBase; lockedUnknownBase = li.lockedUnknownBase;
    } else {
      const hasPaidInstallment = installments.some(
        (i) => i.status === "paid" || (Number(i.paid_amount) || 0) > 0
      );
      // ชำระแล้ว — ไม่บล็อกแล้ว (เจ้าของสั่ง 1 ก.ย.69 · 0127 "ห้ามฟิก")
      //   แต่ "เงินที่รับมาจริง" เป็นความจริงที่แก้ย้อนไม่ได้ → ถ้ายอดใหม่ต่ำกว่าเงินที่รับมาแล้ว
      //   ให้กดยืนยันอีกครั้งก่อน (confirm_below_paid) ไม่ใช่ปล่อยผ่านเงียบ ๆ
      //   ⚠ guard นี้มีทิศทางเดียว (ต่ำกว่าเท่านั้น) — ห้ามเปลี่ยนเป็น abs() (บทเรียนเก่า deposit guard)
      if (hasPaidInstallment) {
        const paidSum = installments.reduce((s2, i) => s2 + (Number(i.paid_amount) || 0), 0);
        if (Number(newTotal) < paidSum && !confirmBelowPaid) {
          return err(`ยอดใหม่ (${newTotal}) ต่ำกว่าเงินที่รับมาแล้ว (${paidSum}) — ถ้าตั้งใจจริง กดยืนยันอีกครั้ง`, 409);
        }
        warnPaidSum = paidSum;
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
        // มีใบเสร็จ/รายการเงินผูกอยู่ — แก้ได้ แต่ติดธงไว้ให้หน้าจอเตือนว่าต้องไล่เช็คเอกสารตาม (0127)
        if ((rcCount ?? 0) > 0 || (feCount ?? 0) > 0) warnLinkedDocs = (rcCount ?? 0) + (feCount ?? 0);
      }
    }

    const oldTotal = Number(bn.total) || 0;

    // 3) อัปเดต total + breakdown ก่อน (RPC อ่าน total ใหม่ → งวดตรง · footer ตรง total เสมอ)
    //    หมายเหตุ rev: RPC (0126) จะคำนวณ total ใหม่เองจาก locked+items อีกชั้น (ควรตรงค่านี้เป๊ะโดยสร้างจาก
    //    plan เดียวกัน) — เขียนไว้ก่อนเพื่อ footer สอดคล้องทันทีแม้ RPC fail กลางทาง (มี rollback ด้านล่าง)
    let { error: upErr } = await ctx.supabase
      .from("billing_notes")
      .update({ total: newTotal, ...breakdown })
      .eq("id", bnId);
    // กันพัง: ถ้า 0078/0079/0081 (ยอดแยก) ยังไม่รัน → อัปเดตแค่ total (ยอดยังถูก)
    if (upErr && /subtotal|discount_amt|vat_amt|wht_amt|discount_pct|vat_rate|wht_rate|has_tax_breakdown|vat_rate_set|labor_ratio|labor_amt/i.test(upErr.message ?? "")) {
      ({ error: upErr } = await ctx.supabase.from("billing_notes").update({ total: newTotal }).eq("id", bnId));
    }
    if (upErr) return err("อัปเดตยอดไม่สำเร็จ: " + upErr.message, 500);

    const sb = ctx.supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    let items: { seq?: number; label: string; amount: number; due_date: string | null }[];
    let overpaid = 0;
    let taxWarning = false;

    if (!rev) {
      // 4a) แก้ก่อนจ่าย (เดิม) — re-split ทั้งชุดผ่าน replace_billing_installments (1 txn → constraint ผ่าน)
      const plan = suggestInstallments(newTotal, Number(breakdown.vat_rate) || 0);  // ส่ง VAT → label บรรทัดย่อย "ค่าวัสดุ (รวมVat)"
      items = plan.map((p) => ({ seq: p.seq, label: p.label, amount: p.amount, due_date: null }));
      const { error: rpcErr } = await sb.rpc("replace_billing_installments", { p_bn_id: Number(bnId), p_items: items });
      if (rpcErr) {
        let { error: rbErr } = await ctx.supabase.from("billing_notes").update({ total: oldTotal, ...oldBreakdown }).eq("id", bnId);
        if (rbErr) ({ error: rbErr } = await ctx.supabase.from("billing_notes").update({ total: oldTotal }).eq("id", bnId));
        return err("re-split งวดไม่สำเร็จ: " + rpcErr.message, 500);
      }
    } else {
      // 4b) Rev — ตรึงงวด locked ไว้ + re-split เฉพาะที่เหลือ ผ่าน replace_unpaid_installments (0126)
      const revPlan = isLaborBill
        ? planRevUnpaidInstallmentsLabor({
            targetMaterialBase: laborTargets!.material, targetLaborBase: laborTargets!.labor,
            lockedMaterialBase, lockedLaborBase, lockedUnknownBase, lockedSum, paidLocked,
            vatRate: Number(breakdown.vat_rate) || 0, whtRate: Number(breakdown.wht_rate) || 0,
            newTotalTarget: newTotal,
          })
        : planRevUnpaidInstallments({
            newTotalTarget: newTotal, lockedSum, paidLocked, vatRate: Number(breakdown.vat_rate) || 0,
          });
      const { data: rpcData, error: rpcErr } = await sb.rpc("replace_unpaid_installments", {
        p_bn_id: Number(bnId), p_items: revPlan.items, p_expected_locked_sum: lockedSum,
      });
      if (rpcErr) {
        let { error: rbErr } = await ctx.supabase.from("billing_notes").update({ total: oldTotal, ...oldBreakdown }).eq("id", bnId);
        if (rbErr) ({ error: rbErr } = await ctx.supabase.from("billing_notes").update({ total: oldTotal }).eq("id", bnId));
        const status = /LOCKED_CHANGED/.test(rpcErr.message) ? 409 : 500;
        return err("Rev งวดไม่สำเร็จ: " + rpcErr.message, status);
      }
      items = revPlan.items;
      overpaid = revPlan.overpaid;
      taxWarning = revPlan.taxWarning;
      // RPC เป็นผู้ตัดสิน total จริง (คำนวณสดจาก locked+items ในทรานแซกชันเดียวกัน) — sync ให้ตรงถ้าต่างจากที่เขียนไว้ก่อนหน้า (ไม่ควรเกิด แต่กันไว้)
      const rpcTotal = rpcData && typeof rpcData === "object" ? Number((rpcData as Record<string, unknown>).new_total) : NaN;
      if (Number.isFinite(rpcTotal) && Math.abs(rpcTotal - newTotal) > 0.01) {
        await ctx.supabase.from("billing_notes").update({ total: rpcTotal }).eq("id", bnId);
        newTotal = rpcTotal;
      }
    }

    // 5) audit
    await audit({
      userId: ctx.user.id,
      action: rev ? "REVISE_BILLING_AFTER_PAYMENT" : (isBreakdownMode ? "UPDATE_BILLING_BREAKDOWN" : "UPDATE_BILLING_TOTAL"),
      table: "billing_notes",
      recordId: bnId,
      oldValue: { total: oldTotal, ...(rev ? { locked_sum: lockedSum, paid_locked: paidLocked } : {}) },
      newValue: {
        total: newTotal, ...(breakdown ?? {}), installments: items,
        ...(rev ? { reason: revReason, overpaid, tax_warning: taxWarning } : {}),
      },
    });

    return ok({ ok: true, total: newTotal, installments: items, ...(rev ? { overpaid, taxWarning } : {}),
      ...(warnPaidSum ? { warnPaidSum } : {}), ...(warnLinkedDocs ? { warnLinkedDocs } : {}) });
  }
);
