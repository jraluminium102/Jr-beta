import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canWrite } from "@/lib/auth";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht, isNoVatBill, type BillVatSource } from "@/lib/money";
import BillingActions from "./BillingActions";
import { VoidBillingNoteButton, InstallmentEditor, EditBillingTotalButton, EditBillingBreakdownButton, IssueReceiptButton, EditBillingStatusButton, EditBillingDateButton } from "./BillingFinanceActions";
import { EditDocHeaderModal } from "@/components/finance/EditDocHeaderModal";
import LinkToSystemPanel, { type LinkableQuotation } from "./LinkToSystemPanel";
import EnsureJobButton from "./EnsureJobButton";
import { BILLING_STATUS_LABEL, type BillingNote, type BillingStatus } from "@/lib/types";
import { can } from "@/lib/rbac";
import { revWarning } from "@/lib/doc-revision";
import AckRevisionButton from "./AckRevisionButton";
import type { Role } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<BillingStatus, "gray" | "amber" | "emerald" | "red"> = {
  unpaid: "gray", partial: "amber", paid: "emerald", cancelled: "red",
};

export default async function BillingNoteDetail({ params }: { params: { id: string } }) {
  const profile = await getProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("billing_notes")
    .select("*, billing_installments(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();

  const bn = data as BillingNote & { quotations?: { code: string } | null };
  const installments = (bn.billing_installments ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const c = bn.customer_snapshot;
  const writable = canWrite(profile?.role);
  const canVoid = can((profile?.role ?? "VIEWER") as Role, "finance", "void");
  const isCancelled = bn.status === "cancelled";
  // บิลค่าแรง (labor_amt ตั้งไว้ · ภาษี booked ต่องวด) — ซ่อนปุ่มแก้ยอด/VAT/งวด (re-split จะทำภาษีต่องวดเพี้ยน)
  const laborBill = (bn as unknown as { labor_amt?: number | null }).labor_amt != null;
  // ป้ายสถานะที่แสดง: ใช้ override ถ้ามี (display_status) ไม่งั้นใช้สถานะจริง
  const effStatus: BillingStatus = (bn.display_status ?? bn.status) as BillingStatus;
  const statusOverridden = !!bn.display_status && bn.display_status !== bn.status;
  // มีงวดจ่ายแล้ว/ล็อกอยู่ไหม — true = ปุ่มแก้ยอด/VAT/งวด ทำงานผ่านโหมด Rev (24 ส.ค.69 · แก้แม้ชำระแล้วได้ ไม่ต้อง void ก่อน)
  const hasAnyPayment = installments.some(
    (i) => i.status === "paid" || (Number(i.paid_amount) || 0) > 0
  );
  // เงินที่รับจริงจากงวดที่จ่ายแล้ว — ใช้เตือน "รับเกิน" ก่อนบันทึก Rev (preview ฝั่ง client · server ตัดสินจริง)
  const paidLocked = installments.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);

  // ดึงใบเสนออ้างอิง — รหัส + ยอดก่อนภาษี(subtotal จริง) ใช้เป็นฐานปุ่ม "แก้ VAT/ส่วนลด"
  let refCode: string | null = null;
  let quoteRev = 0;
  let quoteBase: { subtotal: number; discount_pct: number; vat_rate: number; wht_rate: number } | null = null;
  if (bn.quotation_id) {
    // + revision_no สำหรับป้าย "อ้าง Rev เก่า" (0127) — เผื่อ 0093 ยังไม่รัน → ถอยไป select แบบเดิม
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = null;
    const r1 = await supabase
      .from("quotations").select("code, subtotal, discount_pct, vat_rate, wht_rate, revision_no")
      .eq("id", bn.quotation_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .single<any>();
    if (r1.error) {
      const r2 = await supabase
        .from("quotations").select("code, subtotal, discount_pct, vat_rate, wht_rate")
        .eq("id", bn.quotation_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .single<any>();
      q = r2.data;
    } else q = r1.data;
    quoteRev = Number(q?.revision_no) || 0;
    refCode = q?.code ?? null;
    if (q && Number(q.subtotal) > 0) {
      quoteBase = {
        subtotal: Number(q.subtotal) || 0,
        discount_pct: Number(q.discount_pct) || 0,
        vat_rate: Number(q.vat_rate) || 0,
        wht_rate: Number(q.wht_rate) || 0,
      };
    }
  }
  // ── ใบวางบิล "นอกระบบ" (0124): ออกก่อนมีใบเสนอ → ยังไม่มี quotation_id
  //    โชว์แผงผูกเข้าระบบ + ลิสต์ใบเสนอที่ผูกได้ (ไม่ cancelled · ยังไม่มีบิล active ใบอื่น)
  //    ⚠ ใบเก่าก่อนมีฟีเจอร์นี้ก็ quotation_id = null ได้ (ใบ import) — เกณฑ์เดียวกันคือ "ยังไม่ผูก" จึงเสนอให้ผูกได้เหมือนกัน
  //    ยกเว้นใบค่าประเมิน (doc_kind='assess') ที่ตั้งใจไม่ผูกงาน
  const isAssess = String((bn as unknown as { doc_kind?: string }).doc_kind ?? "work") === "assess";
  const unlinked = !bn.quotation_id && !isAssess && !isCancelled;
  let linkable: LinkableQuotation[] = [];
  if (unlinked && writable) {
    const [{ data: qs }, { data: usedRows }] = await Promise.all([
      supabase.from("quotations")
        .select("id, code, net, job_id, customer_snapshot")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("billing_notes")
        .select("quotation_id").neq("status", "cancelled").not("quotation_id", "is", null),
    ]);
    const used = new Set(((usedRows ?? []) as { quotation_id: number | null }[]).map((r) => r.quotation_id));
    linkable = ((qs ?? []) as LinkableQuotation[]).filter((q) => !used.has(q.id));
  }

  // ค่าเริ่มต้นในฟอร์มแก้: ถ้าบิลเคยแก้ footer แล้ว (มี breakdown จริง) ใช้ค่าบิล · ไม่งั้นใช้ค่าจากใบเสนอ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bnAny = bn as any;
  const editDefaults = quoteBase && Number(bnAny.has_tax_breakdown)
    ? { discount_pct: Number(bnAny.discount_pct) || 0, vat_rate: Number(bnAny.vat_rate) || 0, wht_rate: Number(bnAny.wht_rate) || 0 }
    : quoteBase
    ? { discount_pct: quoteBase.discount_pct, vat_rate: quoteBase.vat_rate, wht_rate: quoteBase.wht_rate }
    : null;

  // งาน No-VAT (ยืนยันชัดจากใบวางบิลเอง) → รับชำระแล้ว "แค่ติ๊กว่าชำระ" พอ ไม่ต้องออกใบเสร็จ/ใบกำกับภาษี
  //  - รู้ชัดว่า No-VAT เมื่อบิลมียอดแยกจริง (has_tax_breakdown) หรือแก้ footer แล้ว และ vat_rate = 0
  //  - ใบเก่า/ใบ import ที่ไม่มียอดแยก (vat_rate=0 แต่ยอดอาจรวม VAT อยู่) → ไม่ถือเป็น No-VAT ยังออกใบเสร็จได้ตามเดิม
  // ⚠ สูตรเดียวกับ POST /api/receipts + หน้าสร้างใบเสร็จ (money.ts) — ห้ามคิดเองซ้ำ ไม่งั้นใบเสร็จไม่ตรงใบที่ส่งลูกค้า
  const noVatBill = isNoVatBill(bnAny as BillVatSource);

  // ใบเสร็จที่ผูกกับแต่ละงวด (ไม่นับใบที่ void) — โชว์ลิงก์ "ดูใบเสร็จ"
  const { data: rcs } = await supabase
    .from("receipts")
    .select("id, code, installment_id")
    .eq("billing_note_id", bn.id)
    .eq("is_voided", false);
  const receiptByInst = new Map<number, { id: number; code: string }>();
  (rcs ?? []).forEach((r) => {
    const rr = r as { id: number; code: string; installment_id: number | null };
    if (rr.installment_id != null) receiptByInst.set(Number(rr.installment_id), { id: Number(rr.id), code: rr.code });
  });

  // ป้ายเตือน "ใบนี้อ้าง Rev เก่า" (0127) — เตือนอย่างเดียว ไม่ล็อกอะไรทั้งสิ้น
  const rw = revWarning(bn as unknown as { source_revision_no?: number | null; ack_revision_no?: number | null }, quoteRev);

  return (
    <div className="space-y-5">
      {rw.show && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-300 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold text-amber-900">{rw.text}</span>
          {refCode && (
            <span className="text-xs text-amber-800">
              (ใบเสนอ <span className="font-mono">{refCode}</span> ถูกแก้หลังออกบิลใบนี้ — ยอดในบิลไม่ได้เปลี่ยนตามให้)
            </span>
          )}
          {writable && <AckRevisionButton id={bn.id} />}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/billing-notes" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono">{bn.code}</h1>
          <Badge tone={STATUS_TONE[effStatus]} dot>{BILLING_STATUS_LABEL[effStatus]}</Badge>
          {statusOverridden && <span className="text-[11px] text-amber-700" title={`สถานะจริง: ${BILLING_STATUS_LABEL[bn.status]}`}>(แก้เอง)</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/billing-notes/${bn.id}/print`} className="press inline-flex items-center gap-1.5 glass-soft rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark">
            <Icon name="printer" size={16} /> พิมพ์ / PDF
          </Link>
          {/* ใบวางบิลยังไม่มีงาน (ใบเสนอนอกระบบพิมพ์เอง ลูกค้าใหม่) → ผูกงาน + ดันเข้าผลิต */}
          {writable && !isCancelled && !isAssess && !(bn as unknown as { job_id?: string | null }).job_id && (
            <EnsureJobButton billingNoteId={bn.id} />
          )}
          {/* บิลค่าแรง (หัก ณ ที่จ่ายเฉพาะค่าแรง · ภาษี booked ต่องวด) — แก้ยอดตรง (flat) ไม่ได้เสมอ (กำกวม WHT)
              ต้องแก้ผ่าน "แก้ VAT/ส่วนลด" (โหมด B) เท่านั้น — Rev หลังชำระแล้วได้แล้ว (24 ส.ค.69, ไม่ต้อง void ก่อน) */}
          {writable && !isCancelled && !laborBill && (
            <EditBillingTotalButton
              billingNoteId={bn.id}
              currentTotal={bn.total}
              hasAnyPayment={hasAnyPayment}
              paidLocked={paidLocked}
            />
          )}
          {/* แก้ VAT/ส่วนลด (footer) — โผล่ถ้าใบเสนอต้นทางมียอดก่อนภาษีจริง · Rev หลังชำระแล้วได้ (บังคับเหตุผล) */}
          {writable && !isCancelled && quoteBase && editDefaults && (
            <EditBillingBreakdownButton
              billingNoteId={bn.id}
              subtotal={quoteBase.subtotal}
              discount_pct={editDefaults.discount_pct}
              vat_rate={editDefaults.vat_rate}
              wht_rate={editDefaults.wht_rate}
              hasAnyPayment={hasAnyPayment}
              paidLocked={paidLocked}
              forceRev={laborBill}
            />
          )}
          {writable && !isCancelled && !laborBill && (
            <InstallmentEditor
              billingNoteId={bn.id}
              total={bn.total}
              initialInstallments={installments}
              hasAnyPayment={hasAnyPayment}
            />
          )}
          {writable && !isCancelled && laborBill && (
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">บิลค่าแรง — แก้งวดตรงไม่ได้ ใช้ &quot;แก้ VAT / ส่วนลด&quot; แทน</span>
          )}
          {writable && !isCancelled && (
            <EditDocHeaderModal endpoint={`/api/billing-notes/${bn.id}/header`} snapshot={c} />
          )}
          {writable && !isCancelled && (
            <EditBillingStatusButton billingNoteId={bn.id} current={bn.display_status ?? null} />
          )}
          {canVoid && !isCancelled && (
            <VoidBillingNoteButton billingNoteId={bn.id} billingNoteCode={bn.code} />
          )}
        </div>
      </div>

      {isCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-sm text-red-800">
          <b>ใบวางบิลนี้ถูกยกเลิกแล้ว</b> — ออกใบวางบิลใหม่จากใบเสนอราคาได้หากต้องการ
        </div>
      )}

      {unlinked && writable && (
        <LinkToSystemPanel billingNoteId={bn.id} billTotal={Number(bn.total) || 0} quotations={linkable} />
      )}

      <Card className="p-6">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-medium text-ink-3 mb-1">ลูกค้า</div>
            <div className="font-semibold">{c.name}</div>
            <div className="text-ink-2">{c.job}</div>
            <div className="text-xs text-ink-3 mt-1">{c.address}</div>
            {c.tax_id && <div className="text-xs text-ink-3">เลขผู้เสียภาษี: {c.tax_id}</div>}
          </div>
          <div className="sm:text-right">
            <div className="text-xs text-ink-3 inline-flex items-center gap-1 sm:justify-end">
              วันที่ออก: <b className="text-ink">{bn.issue_date}</b>
              {writable && !isCancelled && bn.status !== "paid" && (
                <EditBillingDateButton billingNoteId={bn.id} currentDate={bn.issue_date} currentCode={bn.code} />
              )}
            </div>
            <div className="text-xs text-ink-3">อ้างอิงใบเสนอ: {refCode ? <b className="text-ink font-mono">{refCode}</b> : "—"}</div>
            <div className="text-xs text-ink-3">ผู้ติดต่อ: {c.contact_person || "—"} · โทร {c.phone || "—"}</div>
            <div className="text-base font-bold text-brand-dark mt-1">ยอดรวม ฿{baht(bn.total)}</div>
          </div>
        </div>

        <div className="overflow-x-auto mt-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-brand-soft text-brand-dark">
                <th className="p-2 rounded-l-lg">งวด</th>
                <th>รายละเอียด</th>
                <th className="text-right">ยอด</th>
                <th className="text-center">กำหนดชำระ</th>
                <th className="text-center">สถานะ</th>
                {writable && !isCancelled && <th className="text-right p-2 rounded-r-lg">รับชำระ</th>}
              </tr>
            </thead>
            <tbody>
              {installments.map((it) => (
                <tr key={it.id} className="border-b border-gray-100">
                  <td className="p-2">{it.seq}</td>
                  <td>
                    <div className="font-medium whitespace-pre-line">{it.label}</div>
                    {it.status === "paid" && (
                      <div className="text-xs text-emerald-700">รับแล้ว ฿{baht(it.paid_amount)} · {it.paid_date}</div>
                    )}
                    <div className="flex items-center gap-3 mt-0.5">
                      <Link
                        href={`/billing-notes/${bn.id}/print?installment=${it.seq}`}
                        className="press inline-flex items-center gap-1 text-xs text-brand-dark/70 hover:text-brand-dark"
                      >
                        <Icon name="printer" size={12} /> PDF งวดนี้
                      </Link>
                      {(() => {
                        const rc = receiptByInst.get(it.id!);
                        return rc ? (
                          <Link href={`/receipts/${rc.id}/print`} className="press inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800">
                            <Icon name="receipt" size={12} /> ใบเสร็จ {rc.code}
                          </Link>
                        ) : null;
                      })()}
                    </div>
                  </td>
                  <td className="text-right font-semibold tabular-nums">฿{baht(it.amount)}</td>
                  <td className="text-center text-ink-2">{it.due_date || "—"}</td>
                  <td className="text-center">
                    <Badge tone={it.status === "paid" ? "emerald" : "gray"} dot>
                      {it.status === "paid" ? "ชำระแล้ว" : "รอชำระ"}
                    </Badge>
                  </td>
                  {writable && !isCancelled && (
                    <td className="text-right p-2">
                      {it.status === "paid" ? (
                        // จ่ายแล้ว → ออกใบเสร็จได้ (ถ้ายังไม่เคยออก) · ออกแล้ว = โชว์ลิงก์ฝั่งซ้าย
                        receiptByInst.has(it.id!) ? (
                          <span className="text-xs text-emerald-700">ออกใบเสร็จแล้ว ✓</span>
                        ) : noVatBill ? (
                          // บิล No-VAT → แค่ติ๊กว่าชำระ ไม่ต้องออกใบเสร็จ/ใบกำกับภาษี
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <Icon name="check" size={13} /> ชำระแล้ว
                          </span>
                        ) : (
                          <IssueReceiptButton billingNoteId={bn.id} installmentId={it.id!} amount={it.amount} />
                        )
                      ) : (
                        // ยังไม่จ่าย → บันทึกชำระอย่างเดียว (ออกใบเสร็จงวดยังไม่จ่ายไม่ได้)
                        <BillingActions billingNoteId={bn.id} installmentId={it.id!} amount={it.amount} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ยอดแยก (0078) — โชว์ทุกใบ · ถ้าเคยแก้ footer ใบเต็มบน PDF (footer_override) โชว์ค่านั้น */}
        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b = bn as any;
          const ov = (b.footer_override && typeof b.footer_override.net === "number") ? b.footer_override : null;
          const sub = ov ? Number(ov.subtotal) || 0 : (Number(b.subtotal) || Number(bn.total) || 0);
          const disPct = ov ? Number(ov.discount_pct) || 0 : (Number(b.discount_pct) || 0);
          const dis = ov ? Number(ov.discount_amt) || 0 : (Number(b.discount_amt) || 0);
          const vaRate = ov ? Number(ov.vat_rate) || 0 : (Number(b.vat_rate) || 0);
          const va = ov ? Number(ov.vat_amt) || 0 : (Number(b.vat_amt) || 0);
          const whRate = ov ? Number(ov.wht_rate) || 0 : (Number(b.wht_rate) || 0);
          const wh = ov ? Number(ov.wht_amt) || 0 : (Number(b.wht_amt) || 0);
          const netShown = ov ? (Number(ov.net) || 0) : Number(bn.total) || 0;
          if (sub <= 0 && !ov) return null;
          return (
            <div className="mt-5 flex justify-end">
              <div className="w-full sm:w-72 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-ink-3">รวมเป็นเงิน</span><span className="tabular-nums">฿{baht(sub)}</span></div>
                {dis > 0 && <div className="flex justify-between"><span className="text-ink-3">ส่วนลด {disPct > 0 ? `${disPct}%` : ""}</span><span className="tabular-nums text-red-700">-฿{baht(dis)}</span></div>}
                {va > 0 && <div className="flex justify-between"><span className="text-ink-3">ภาษีมูลค่าเพิ่ม {vaRate > 0 ? `${vaRate}%` : ""}</span><span className="tabular-nums">฿{baht(va)}</span></div>}
                {wh > 0 && <div className="flex justify-between"><span className="text-ink-3">หักภาษี ณ ที่จ่าย {whRate > 0 ? `${whRate}%` : ""}</span><span className="tabular-nums text-red-700">-฿{baht(wh)}</span></div>}
                <div className="flex justify-between font-bold border-t border-gray-300/70 pt-1"><span className="text-ink">ยอดชำระสุทธิ</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(netShown)}</span></div>
                <div className="text-[11px] text-ink-3 pt-0.5">
                  แก้ footer (ส่วนลด/VAT/หัก ณ ที่จ่าย) ได้ที่หน้า <b>พิมพ์ / PDF</b> {ov ? "· แก้แล้ว ✎" : ""}
                </div>
              </div>
            </div>
          );
        })()}

        {bn.note && <div className="mt-5 text-xs text-ink-3"><b>หมายเหตุ:</b> {bn.note}</div>}
      </Card>
    </div>
  );
}
