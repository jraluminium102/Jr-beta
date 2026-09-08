import { z } from "zod";
import { requirePermission } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { getTaxLockBefore } from "@/lib/doc-cutoff";

// PATCH /api/receipts/[id]/amounts — แก้ "ยอด" บนใบเสร็จ/ใบกำกับเอง (Canva/FlowAccount)
//   พิมพ์ยอดก่อนภาษี/VAT/หัก ณ ที่จ่าย เองได้ · ไม่คิดใหม่บังคับ ไม่บล็อก (ยกเว้น tax-lock ตามกฎหมาย)
//   amount = ยอดรวม VAT (base+vat) · net = เงินสดรับสุทธิ (amount − wht) — ผูกกันตามโครงเอกสาร
const round2 = (n: number) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const num = z.coerce.number().finite().optional();

const Schema = z.object({
  base_amt: num, vat_rate: num, vat_amt: num, wht_rate: num, wht_amt: num,
  reason: z.string().max(500).optional(),
}).refine(
  (d) => [d.base_amt, d.vat_amt, d.wht_amt, d.vat_rate, d.wht_rate].some((v) => v !== undefined),
  { message: "ไม่มียอดให้แก้" },
);

export const PATCH = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("finance", "write");

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.errors[0].message, 400);

  const { data: rc, error: e } = await ctx.supabase
    .from("receipts")
    .select("id, code, issue_date, is_voided, base_amt, vat_rate, vat_amt, wht_rate, wht_amt, amount, net")
    .eq("id", params.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .single<any>();
  if (e || !rc) return notFound("ไม่พบใบเสร็จ");
  if (rc.is_voided) return err("ใบเสร็จนี้ถูกยกเลิกแล้ว — แก้ไขไม่ได้ (เป็นหลักฐาน)", 409);

  // tax-lock (กฎหมาย) — กันแก้ยอดใบที่อยู่ในเดือนที่ยื่นภาษีปิดแล้ว
  const lockBefore = await getTaxLockBefore();
  if (lockBefore && String(rc.issue_date) < lockBefore) {
    return err(`ใบนี้อยู่ในเดือนที่ยื่นภาษีปิดแล้ว (ก่อน ${lockBefore}) — แก้ยอดไม่ได้`, 409);
  }

  // ค่าที่พิมพ์เอง (ไม่ส่งมา = คงเดิม) · clamp ≥ 0 (เอกสารภาษีไม่มียอดติดลบ) แต่ไม่บล็อก/ไม่เตือนยอดไม่ตรง
  const nn = (v: number) => Math.max(0, round2(v));
  const d = parsed.data;
  const base = nn(d.base_amt !== undefined ? d.base_amt : Number(rc.base_amt ?? (Number(rc.amount) - Number(rc.vat_amt))) || 0);
  const vatRate = d.vat_rate !== undefined ? Math.max(0, Number(d.vat_rate) || 0) : (Number(rc.vat_rate) || 0);
  const vatAmt = nn(d.vat_amt !== undefined ? d.vat_amt : Number(rc.vat_amt) || 0);
  const whtRate = d.wht_rate !== undefined ? Math.max(0, Number(d.wht_rate) || 0) : (Number(rc.wht_rate) || 0);
  const whtAmt = nn(d.wht_amt !== undefined ? d.wht_amt : Number(rc.wht_amt) || 0);
  const amount = round2(base + vatAmt);        // ยอดรวม VAT (ก่อนหัก ณ ที่จ่าย)
  const net = round2(amount - whtAmt);         // เงินสดรับสุทธิ

  const update = {
    base_amt: base, vat_rate: vatRate, vat_amt: vatAmt,
    wht_rate: whtRate, wht_amt: whtAmt, amount, net,
  };
  const { error: uErr } = await ctx.supabase.from("receipts").update(update as never).eq("id", params.id);
  if (uErr) return err(uErr.message, 500);

  // sync finance ledger ให้ตรงยอดใบเสร็จ (กันยอดค้างรับ/AR เพี้ยน) — best-effort เหมือน route แก้วันที่
  //   เคสแยก VAT ยอดรวมไม่เปลี่ยน = ยอดเดิม (no-op) · เปลี่ยนยอดจริง → ledger ตามเอกสาร
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  await sb.from("finance_entries").update({ amount: net }).eq("receipt_id", params.id).eq("is_voided", false);

  await audit({
    userId: ctx.user.id, action: "EDIT_RECEIPT_AMOUNTS", table: "receipts", recordId: params.id,
    oldValue: { base_amt: rc.base_amt, vat_rate: rc.vat_rate, vat_amt: rc.vat_amt, wht_rate: rc.wht_rate, wht_amt: rc.wht_amt, amount: rc.amount, net: rc.net, reason: (d.reason ?? "").trim() || null },
    newValue: update,
  });

  return ok({ ok: true, ...update });
});
