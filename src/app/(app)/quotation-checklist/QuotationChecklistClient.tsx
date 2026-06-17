"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";
import { Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { baht } from "@/lib/money";
import DateField from "@/components/ui/DateField";
import type { ChecklistData, ChecklistItem, ChecklistQuotation } from "@/app/api/quotation-checklist/route";
import { HoldModal } from "@/components/jobs/HoldModal";

// ---------- types ----------

type PostBody = {
  job_id: string;
  total: number;
  ext_ref?: string;
  ext_link?: string;
  issue_date?: string;
  step: 1 | 2;
  vat_rate: 0 | 7;
};

// ---------- helpers ----------

const DESIGN_STATE_LABEL: Record<string, string> = {
  NOT_STARTED:      "ยังไม่เริ่ม",
  DRAWING:          "กำลังเขียนแบบ",
  PENDING_CUSTOMER: "รอเซลล์ตรวจแบบ",
  REVISING:         "กำลังแก้ไข",
  DONE:             "เสร็จแล้ว",
};

function thaiDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${parseInt(d)} ${TH[parseInt(m)]} ${parseInt(y) + 543}`;
}

function parseNoteExt(note: string) {
  const refM  = note.match(/เลขนอกระบบ: ([^|]+)/);
  const linkM = note.match(/ไฟล์: (.+)$/);
  return {
    ext_ref:  refM?.[1]?.trim()  ?? "",
    ext_link: linkM?.[1]?.trim() ?? "",
  };
}

/** คำนวณจำนวนวัน (calendar days) จาก delivery_due - วันนี้ — ใช้ UTC กัน timezone offset */
function daysRemaining(deliveryDue: string | null, todayIso: string): number | null {
  if (!deliveryDue) return null;
  const parseUTC = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diff = Math.round((parseUTC(deliveryDue) - parseUTC(todayIso)) / 86400000);
  return diff;
}

function DaysRemainingBadge({ deliveryDue, todayIso }: { deliveryDue: string | null; todayIso: string }) {
  const diff = daysRemaining(deliveryDue, todayIso);
  if (diff === null) return <span className="text-ink-3">—</span>;
  if (diff < 0)  return <span className="font-bold text-red-600 tabular-nums">เลย {Math.abs(diff)} วัน</span>;
  if (diff === 0) return <span className="font-bold text-red-600">วันนี้</span>;
  if (diff <= 2) return <span className="font-semibold text-orange-600 tabular-nums">เหลือ {diff} วัน</span>;
  return <span className="text-ink-2 tabular-nums">เหลือ {diff} วัน</span>;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Modal ----------

type ModalMode = "step1" | "step2";
type ModalState = { job: ChecklistItem; mode: ModalMode; q: ChecklistQuotation | null };

function Modal({
  state, onClose, onSaved,
}: {
  state: ModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { job, mode, q } = state;
  const parsed = q ? parseNoteExt(q.note) : { ext_ref: "", ext_link: "" };

  const [total,      setTotal]    = useState(q ? String(q.net) : "");
  const [noVat,      setNoVat]    = useState(q != null ? q.vat_rate === 0 : false);
  const [extRef,     setExtRef]   = useState(parsed.ext_ref);
  const [extLink,    setExtLink]  = useState(parsed.ext_link);
  const [issueDate,  setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving,     setSaving]   = useState(false);
  const [errMsg,     setErrMsg]   = useState("");
  const totalRef = useRef<HTMLInputElement>(null);

  useEffect(() => { totalRef.current?.focus(); }, []);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg("");
    const t = Math.round(parseFloat(total) * 100) / 100;
    if (!t || t <= 0) { setErrMsg("กรุณากรอกยอดรวมที่ถูกต้อง"); return; }

    setSaving(true);
    try {
      const body: PostBody = {
        job_id: job.job_id, total: t,
        ext_ref: extRef || undefined, ext_link: extLink || undefined,
        issue_date: issueDate || undefined,
        step: mode === "step1" ? 1 : 2,
        vat_rate: noVat ? 0 : 7,
      };
      await api.post("/quotations/quick", body);
      onSaved();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-dark relative w-full max-w-md rounded-2xl p-6 text-white shadow-2xl">
        <button
          onClick={onClose} aria-label="ปิด"
          className="press absolute right-4 top-4 w-9 h-9 rounded-lg inline-flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">
          <Icon name="close" size={18} />
        </button>

        <h2 className="text-base font-bold mb-1">
          {mode === "step1" ? "บันทึกใบเสนอราคา" : "ยืนยันส่งใบเสนอราคา"}
        </h2>
        <p className="text-white/60 text-sm mb-5">
          {job.customer_name}
          {job.job_code ? ` · ${job.job_code}` : ""}
          {job.customer_area ? ` · ${job.customer_area}` : ""}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-white/85">
              {noVat ? "ยอดรวม (ไม่มี VAT)" : "ยอดรวม (รวม VAT แล้ว)"}
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              ref={totalRef}
              type="number" step="0.01" min="0.01" inputMode="decimal" required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="เช่น 120000"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/35 outline-none focus:border-white/50 focus:bg-white/15 tabular-nums"
            />
            {total && parseFloat(total) > 0 && (() => {
              const t = parseFloat(total);
              const vatAmt   = noVat ? 0 : Math.round((t * 7) / 107 * 100) / 100;
              const beforeVat = Math.round((t - vatAmt) * 100) / 100;
              return (
                <p className="text-[11px] text-white/50 mt-1 tabular-nums">
                  ก่อน VAT ฿{baht(beforeVat)}
                  {" · "}VAT ฿{baht(vatAmt)}
                  {noVat && <span className="ml-1 text-amber-300/80">(ไม่มี VAT)</span>}
                </p>
              );
            })()}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none group">
            <div className={`relative w-10 h-6 rounded-full transition-colors ${noVat ? "bg-amber-500" : "bg-white/20"}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${noVat ? "translate-x-5" : "translate-x-1"}`} />
              <input type="checkbox" checked={noVat} onChange={(e) => setNoVat(e.target.checked)}
                className="sr-only" aria-label="ไม่คิด VAT" />
            </div>
            <span className="text-sm font-semibold text-white/85">
              ไม่คิด VAT
              <span className="ml-1.5 text-[11px] font-normal text-white/50">(ลูกค้าไม่เอาใบกำกับ)</span>
            </span>
          </label>

          <div>
            <label className="block text-sm font-semibold mb-1.5 text-white/85">เลขใบเสนอ (นอกระบบ)</label>
            <input type="text" value={extRef} onChange={(e) => setExtRef(e.target.value)}
              placeholder="เช่น QT2025-001"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/35 outline-none focus:border-white/50 focus:bg-white/15" />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5 text-white/85">ลิงก์ไฟล์ใบเสนอ</label>
            <input type="url" value={extLink} onChange={(e) => setExtLink(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/35 outline-none focus:border-white/50 focus:bg-white/15" />
          </div>

          {mode === "step2" && (
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-white/85">วันที่ส่งใบเสนอ</label>
              <DateField value={issueDate} onChange={(iso) => setIssueDate(iso)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white outline-none focus:border-white/50 focus:bg-white/15"
                aria-label="วันที่ส่งใบเสนอ" />
            </div>
          )}

          {errMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-red-900/40 border border-red-500/30 px-3.5 py-2.5 text-sm text-red-200">
              <Icon name="warn" size={16} className="shrink-0 mt-0.5" />
              <span>{errMsg}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="press flex-1 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/10 min-h-[44px]">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving}
              className="press flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-brand disabled:opacity-60 min-h-[44px] inline-flex items-center justify-center gap-2">
              {saving && <Icon name="refresh" size={14} className="animate-spin" />}
              {mode === "step1" ? "บันทึกใบเสนอ" : "ยืนยันส่งแล้ว"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof window !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}

// ---------- Sent Job Card (ส่งแล้ว รอมัดจำ) ----------

function SentJobCard({
  item, onAction, canWrite,
}: {
  item: ChecklistItem;
  onAction: (job: ChecklistItem, mode: ModalMode, q: ChecklistQuotation | null) => void;
  canWrite: boolean;
}) {
  const q = item.quotation;
  const parsed = q ? parseNoteExt(q.note) : null;

  return (
    <div className="glass rounded-2xl p-4 space-y-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{item.customer_name}</div>
          {item.job_code && (
            <div className="text-xs text-ink-3 font-mono mt-0.5">{item.job_code}</div>
          )}
        </div>
        <Badge tone="sky">ส่งแล้ว</Badge>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
        {item.customer_area && (
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" size={11} />{item.customer_area}
          </span>
        )}
        {item.assess_date && (
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" size={11} />{thaiDate(item.assess_date)}
          </span>
        )}
        {item.estimator_name && (
          <span className="inline-flex items-center gap-1">
            <Icon name="user" size={11} />{item.estimator_name}
          </span>
        )}
      </div>

      {q && (
        <div className="rounded-xl bg-gray-50/80 border border-gray-200/70 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-brand-dark font-semibold">{q.code}</span>
            {Number(q.net) > 0
              ? <span className="tabular-nums text-sm font-bold text-ink">฿{baht(q.net)}</span>
              : <span className="text-xs font-semibold text-amber-600">รอใส่ยอด</span>}
          </div>
          {parsed?.ext_ref && (
            <div className="text-xs text-ink-3">
              <span className="font-medium text-ink-2">เลขนอกระบบ:</span> {parsed.ext_ref}
            </div>
          )}
          {parsed?.ext_link && (
            <a href={parsed.ext_link} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
              <Icon name="external" size={11} /> เปิดไฟล์ใบเสนอ
            </a>
          )}
        </div>
      )}

      {canWrite && (
        <div className="flex gap-2 pt-0.5">
          <button
            onClick={() => onAction(item, "step2", q ?? null)}
            title="แก้ยอด/รายละเอียดใบเสนอ"
            className="press inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300/70 px-3 py-2.5 text-sm font-semibold text-ink-2 hover:bg-white/60 min-h-[44px] min-w-[44px]">
            <Icon name="pencil" size={15} />
          </button>
          {q && (
            <Link
              href={`/billing-notes/new?quotation=${q.id}`}
              className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand px-3 py-2.5 text-sm font-semibold text-brand-dark hover:bg-brand/5 min-h-[44px]">
              <Icon name="banknote" size={15} />
              วางบิล
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Active Table Row (desktop) ----------

function ActiveTableRow({
  item, todayStr, onAction, canWrite, onHold,
}: {
  item: ChecklistItem;
  todayStr: string;
  onAction: (job: ChecklistItem, mode: ModalMode, q: ChecklistQuotation | null) => void;
  canWrite: boolean;
  onHold?: (item: ChecklistItem) => void;
}) {
  const q = item.quotation;
  const designLabel = DESIGN_STATE_LABEL[item.design_state] ?? item.design_state;

  // badge สถานะใบเสนอ
  let quoteBadge: React.ReactNode;
  if (item.stage === "in_design") {
    quoteBadge = <Badge tone="gray">รอแบบ</Badge>;
  } else if (item.stage === "pending") {
    quoteBadge = <Badge tone="amber">ยังไม่ทำ</Badge>;
  } else {
    // drafted
    quoteBadge = (
      <div className="space-y-0.5">
        <Badge tone="sky">ร่าง</Badge>
        {q && (
          <div className="text-[11px] text-ink-3 tabular-nums">
            {q.code}{Number(q.net) > 0 ? ` · ฿${baht(q.net)}` : ""}
          </div>
        )}
      </div>
    );
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-white/60 transition-colors">
      {/* ลูกค้า/เซลล์ */}
      <td className="px-3 py-3 align-top">
        <div className="font-semibold text-ink text-sm leading-snug">{item.customer_name}</div>
        {item.job_code && (
          <div className="text-xs text-ink-3 font-mono">{item.job_code}</div>
        )}
        {/* (0044) ป้ายมัดจำหน้างาน · ด่วน */}
        {item.onsite_deposit && (
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Icon name="warn" size={10} />
            มัดจำหน้างาน · ด่วน
          </div>
        )}
        {item.estimator_name && (
          <div className="text-xs text-ink-3 mt-0.5 flex items-center gap-1">
            <Icon name="user" size={10} />{item.estimator_name}
          </div>
        )}
        {item.customer_area && (
          <div className="text-xs text-ink-3 flex items-center gap-1">
            <Icon name="pin" size={10} />{item.customer_area}
          </div>
        )}
      </td>

      {/* วันประเมิน */}
      <td className="px-3 py-3 align-top text-sm text-ink-2 tabular-nums whitespace-nowrap">
        {thaiDate(item.assess_date)}
      </td>

      {/* กำหนดส่งลูกค้า */}
      <td className="px-3 py-3 align-top text-sm text-ink-2 tabular-nums whitespace-nowrap">
        {thaiDate(item.delivery_due)}
      </td>

      {/* เหลือ */}
      <td className="px-3 py-3 align-top text-sm whitespace-nowrap">
        <DaysRemainingBadge deliveryDue={item.delivery_due} todayIso={todayStr} />
      </td>

      {/* สถานะแบบ + ผู้ออกแบบ */}
      <td className="px-3 py-3 align-top">
        <div className="text-xs font-medium text-ink-2">{designLabel}</div>
        <div className="text-xs text-ink-3 mt-0.5">
          {item.designer_name ?? "ยังไม่มอบหมาย"}
        </div>
      </td>

      {/* ใบเสนอ */}
      <td className="px-3 py-3 align-top">
        {quoteBadge}
      </td>

      {/* ดำเนินการ */}
      <td className="px-3 py-3 align-top">
        {canWrite && (
          <div className="flex gap-1.5 flex-wrap">
            {item.stage === "in_design" && (
              <Link
                href="/designer"
                className="press inline-flex items-center gap-1 rounded-lg border border-gray-300/80 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-white/70 min-h-[36px]">
                <Icon name="ruler" size={12} />
                ดูบอร์ดแบบ
              </Link>
            )}
            {item.stage === "pending" && (
              <button
                onClick={() => onAction(item, "step2", null)}
                className="press inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white shadow-brand min-h-[36px]">
                <Icon name="check" size={12} />
                ทำใบเสนอ·ส่งแล้ว
              </button>
            )}
            {item.stage === "drafted" && q && (
              <>
                <button
                  onClick={() => onAction(item, "step1", q)}
                  className="press inline-flex items-center justify-center rounded-lg border border-gray-300/80 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-white/70 min-h-[36px] min-w-[36px]">
                  <Icon name="pencil" size={12} />
                </button>
                <button
                  onClick={() => onAction(item, "step2", q)}
                  className="press inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white shadow-brand min-h-[36px]">
                  <Icon name="external" size={12} />
                  ส่งแล้ว
                </button>
              </>
            )}
            {/* ปุ่ม พักงาน (ทุก stage active) */}
            {onHold && (
              <button
                onClick={() => onHold(item)}
                className="press inline-flex items-center gap-1 rounded-lg border border-amber-300/80 px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 min-h-[36px]"
                aria-label={`พักงาน ${item.job_code ?? ""}`}
              >
                พักงาน
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ---------- Active Mobile Card ----------

function ActiveMobileCard({
  item, todayStr, onAction, canWrite, onHold,
}: {
  item: ChecklistItem;
  todayStr: string;
  onAction: (job: ChecklistItem, mode: ModalMode, q: ChecklistQuotation | null) => void;
  canWrite: boolean;
  onHold?: (item: ChecklistItem) => void;
}) {
  const q = item.quotation;
  const designLabel = DESIGN_STATE_LABEL[item.design_state] ?? item.design_state;

  return (
    <div className="glass rounded-2xl p-4 space-y-2.5">
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{item.customer_name}</div>
          {item.job_code && (
            <div className="text-xs text-ink-3 font-mono mt-0.5">{item.job_code}</div>
          )}
          {/* (0044) ป้ายมัดจำหน้างาน · ด่วน */}
          {item.onsite_deposit && (
            <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              <Icon name="warn" size={10} />
              มัดจำหน้างาน · ด่วน
            </div>
          )}
        </div>
        {/* stage badge */}
        {item.stage === "in_design" && <Badge tone="gray">รอแบบ</Badge>}
        {item.stage === "pending"   && <Badge tone="amber">ยังไม่ทำใบเสนอ</Badge>}
        {item.stage === "drafted"   && <Badge tone="sky">ร่างใบเสนอ</Badge>}
      </div>

      {/* เดดไลน์ (เด่น) */}
      <div className="flex items-center justify-between rounded-xl bg-gray-50/70 border border-gray-200/60 px-3 py-2">
        <div className="text-xs text-ink-3">กำหนดส่งลูกค้า</div>
        <div className="text-right">
          <div className="text-sm font-semibold text-ink tabular-nums">{thaiDate(item.delivery_due)}</div>
          <div className="text-xs mt-0.5">
            <DaysRemainingBadge deliveryDue={item.delivery_due} todayIso={todayStr} />
          </div>
        </div>
      </div>

      {/* meta */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
        {item.customer_area && (
          <span className="inline-flex items-center gap-1"><Icon name="pin" size={11} />{item.customer_area}</span>
        )}
        {item.assess_date && (
          <span className="inline-flex items-center gap-1"><Icon name="calendar" size={11} />ประเมิน {thaiDate(item.assess_date)}</span>
        )}
        {item.estimator_name && (
          <span className="inline-flex items-center gap-1"><Icon name="user" size={11} />{item.estimator_name}</span>
        )}
        <span className="inline-flex items-center gap-1">
          <Icon name="ruler" size={11} />{designLabel} · {item.designer_name ?? "ยังไม่มอบหมาย"}
        </span>
      </div>

      {/* ใบเสนอ (ถ้ามี) */}
      {q && (
        <div className="rounded-xl bg-gray-50/80 border border-gray-200/70 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-brand-dark font-semibold">{q.code}</span>
            {Number(q.net) > 0
              ? <span className="tabular-nums text-sm font-bold text-ink">฿{baht(q.net)}</span>
              : <span className="text-xs font-semibold text-amber-600">รอใส่ยอด</span>}
          </div>
        </div>
      )}

      {/* Actions */}
      {canWrite && (
        <div className="flex gap-2 pt-0.5">
          {item.stage === "in_design" && (
            <Link href="/designer"
              className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300/70 px-3 py-2.5 text-sm font-semibold text-ink-2 hover:bg-white/60 min-h-[44px]">
              <Icon name="ruler" size={15} />
              ดูบอร์ดแบบ
            </Link>
          )}
          {item.stage === "pending" && (
            <button
              onClick={() => onAction(item, "step2", null)}
              className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-brand min-h-[44px]">
              <Icon name="check" size={15} />
              ทำใบเสนอ · ส่งแล้ว
            </button>
          )}
          {item.stage === "drafted" && q && (
            <>
              <button
                onClick={() => onAction(item, "step1", q)}
                className="press inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300/70 px-3 py-2.5 text-sm font-semibold text-ink-2 hover:bg-white/60 min-h-[44px] min-w-[44px]">
                <Icon name="pencil" size={15} />
              </button>
              <button
                onClick={() => onAction(item, "step2", q)}
                className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-brand min-h-[44px]">
                <Icon name="external" size={15} />
                ส่งให้ลูกค้าแล้ว
              </button>
            </>
          )}
          {/* ปุ่ม พักงาน (ทุก stage active) */}
          {onHold && (
            <button
              onClick={() => onHold(item)}
              className="press inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300/80 px-3 py-2.5 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 min-h-[44px]"
              aria-label={`พักงาน ${item.job_code ?? ""}`}
            >
              พักงาน
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Main Component ----------

export default function QuotationChecklistClient() {
  const [data,      setData]      = useState<ChecklistData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [errMsg,    setErrMsg]    = useState("");
  const [canWrite,  setCanWrite]  = useState(false);
  const [modal,     setModal]     = useState<ModalState | null>(null);
  const [holdJob,   setHoldJob]   = useState<ChecklistItem | null>(null);
  const [sentOpen,  setSentOpen]  = useState(false);
  const [heldOpen,  setHeldOpen]  = useState(false);
  const [unholdBusy, setUnholdBusy] = useState<string | null>(null);
  const [meta,      setMeta]      = useState<{
    counts: { in_design: number; pending: number; drafted: number; sent: number; held: number };
    overdue: number;
    due_soon: number;
  } | null>(null);

  const today = todayIso();

  const load = useCallback(async () => {
    setLoading(true); setErrMsg("");
    try {
      const res = await api.get<ChecklistData>("/quotation-checklist");
      setData(res.data);
      setCanWrite(res.meta?.can_write === true);
      if (res.meta) {
        setMeta({
          counts: (res.meta.counts as { in_design: number; pending: number; drafted: number; sent: number; held: number }) ?? { in_design: 0, pending: 0, drafted: 0, sent: 0, held: 0 },
          overdue:  Number(res.meta.overdue  ?? 0),
          due_soon: Number(res.meta.due_soon ?? 0),
        });
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openModal(job: ChecklistItem, mode: ModalMode, q: ChecklistQuotation | null) {
    setModal({ job, mode, q });
  }
  function handleSaved() {
    setModal(null);
    load();
  }

  async function unholdItem(item: ChecklistItem) {
    setUnholdBusy(item.job_id);
    try {
      const res = await fetch(`/api/jobs/${item.job_id}/unhold`, { method: "POST" });
      const json = await res.json() as { success: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "ดึงงานกลับไม่สำเร็จ");
      await load();
    } catch (e) {
      // show via reload errMsg
      setErrMsg(e instanceof Error ? e.message : "ดึงงานกลับไม่สำเร็จ");
    } finally {
      setUnholdBusy(null);
    }
  }

  const active = data?.active ?? [];
  const sent   = data?.sent   ?? [];
  const held   = data?.held   ?? [];
  const counts = meta?.counts ?? { in_design: 0, pending: 0, drafted: 0, sent: 0, held: 0 };
  const overdue  = meta?.overdue  ?? 0;
  const dueSoon  = meta?.due_soon ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="clipboard" size={18} />
          </span>
          ใบเสนอราคา · เช็คลิสต์
          <span className="text-[11px] font-normal text-white bg-amber-500 rounded-full px-2 py-0.5">
            ชั่วคราว
          </span>
        </h1>
        <button onClick={load} disabled={loading}
          className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-brand-dark disabled:opacity-60">
          <Icon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">รีเฟรช</span>
        </button>
      </div>

      {/* แถบเตือนเดดไลน์ */}
      {(overdue > 0 || dueSoon > 0) && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
          overdue > 0
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-orange-50 border-orange-200 text-orange-700"
        }`}>
          <Icon name="warn" size={16} className="shrink-0" />
          <span>
            {overdue > 0 && <span>เลยกำหนดส่ง <span className="tabular-nums font-bold">{overdue}</span> งาน</span>}
            {overdue > 0 && dueSoon > 0 && <span className="mx-1.5 opacity-40">·</span>}
            {dueSoon > 0 && <span>ใกล้ครบกำหนด (≤2 วัน) <span className="tabular-nums font-bold">{dueSoon}</span> งาน</span>}
          </span>
        </div>
      )}

      {/* Metric bar */}
      {data && (
        <div className={`grid gap-3 ${counts.drafted > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          <div className="rounded-2xl border px-4 py-3 bg-purple-50 border-purple-200 text-purple-800">
            <div className="text-2xl font-extrabold tabular-nums">{counts.in_design}</div>
            <div className="text-xs font-medium mt-0.5 leading-tight">รอแบบ</div>
          </div>
          <div className="rounded-2xl border px-4 py-3 bg-amber-50 border-amber-200 text-amber-800">
            <div className="text-2xl font-extrabold tabular-nums">{counts.pending}</div>
            <div className="text-xs font-medium mt-0.5 leading-tight">รอทำใบเสนอ</div>
          </div>
          {counts.drafted > 0 && (
            <div className="rounded-2xl border px-4 py-3 bg-sky-50 border-sky-200 text-sky-800">
              <div className="text-2xl font-extrabold tabular-nums">{counts.drafted}</div>
              <div className="text-xs font-medium mt-0.5 leading-tight">ร่าง</div>
            </div>
          )}
          <div className="rounded-2xl border px-4 py-3 bg-emerald-50 border-emerald-200 text-emerald-800">
            <div className="text-2xl font-extrabold tabular-nums">{counts.sent}</div>
            <div className="text-xs font-medium mt-0.5 leading-tight">ส่งแล้ว · รอมัดจำ</div>
          </div>
        </div>
      )}

      {/* Error */}
      {errMsg && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <span>{errMsg}</span>
          <button onClick={load} className="press font-semibold underline shrink-0">ลองใหม่</button>
        </div>
      )}

      {/* Loading (first load) */}
      {loading && !data && (
        <Card className="p-12 text-center text-ink-3">กำลังโหลด…</Card>
      )}

      {/* ตารางหลัก "งานก่อนส่งลูกค้า" */}
      {data && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Icon name="track" size={16} className="text-brand" />
            งานก่อนส่งลูกค้า
            <span className="tabular-nums text-sm font-normal text-ink-3">({active.length} รายการ)</span>
          </h2>

          {active.length === 0 ? (
            <Card className="p-10 text-center text-ink-3 text-sm">ไม่มีงานในไปป์ไลน์</Card>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block glass rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">ลูกค้า / เซลล์</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide whitespace-nowrap">วันประเมิน</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide whitespace-nowrap">กำหนดส่งลูกค้า</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">เหลือ</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide whitespace-nowrap">สถานะแบบ / ผู้ออกแบบ</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">ใบเสนอ</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((item) => (
                      <ActiveTableRow
                        key={item.job_id}
                        item={item}
                        todayStr={today}
                        onAction={openModal}
                        canWrite={canWrite}
                        onHold={canWrite ? (i) => setHoldJob(i) : undefined}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {active.map((item) => (
                  <ActiveMobileCard
                    key={item.job_id}
                    item={item}
                    todayStr={today}
                    onAction={openModal}
                    canWrite={canWrite}
                    onHold={canWrite ? (i) => setHoldJob(i) : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ส่งแล้ว · รอมัดจำ (collapsible) */}
      {data && (
        <div className="space-y-3">
          <button
            onClick={() => setSentOpen((v) => !v)}
            className="press w-full flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm font-semibold hover:bg-emerald-100 transition-colors min-h-[44px]">
            <Icon name="check" size={15} />
            <span>ส่งแล้ว · รอมัดจำ</span>
            <span className="tabular-nums text-xs font-bold bg-white/60 rounded-md px-1.5 py-0.5 ml-1">
              {sent.length}
            </span>
            <span className="ml-auto">
              <Icon name={sentOpen ? "chevron-up" : "chevron-down"} size={16} />
            </span>
          </button>

          {sentOpen && (
            <div className="space-y-3">
              {sent.length === 0 ? (
                <Card className="p-8 text-center text-ink-3 text-sm">ไม่มีรายการ</Card>
              ) : (
                sent.map((item) => (
                  <SentJobCard
                    key={item.job_id}
                    item={item}
                    onAction={openModal}
                    canWrite={canWrite}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Section พัก (HOLD) ── */}
      {data && held.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setHeldOpen((v) => !v)}
            className="press w-full flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm font-semibold hover:bg-amber-100 transition-colors min-h-[44px] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            aria-expanded={heldOpen}
          >
            <Icon name="warn" size={15} />
            <span>พัก (HOLD)</span>
            <span className="tabular-nums text-xs font-bold bg-white/60 rounded-md px-1.5 py-0.5 ml-1">
              {held.length}
            </span>
            <span className="ml-auto">
              <Icon name={heldOpen ? "chevron-up" : "chevron-down"} size={16} />
            </span>
          </button>

          {heldOpen && (
            <div className="glass rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-50/60 border-b border-amber-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">Job / ลูกค้า</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-amber-800">เหตุผล</th>
                    {canWrite && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {held.map((item) => (
                    <tr key={item.job_id} className="border-b border-gray-100 last:border-0 hover:bg-amber-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink tnum text-sm">{item.job_code ?? "—"}</div>
                        <div className="text-xs text-ink-2 mt-0.5">{item.customer_name}</div>
                        {item.customer_area && (
                          <div className="text-xs text-ink-3 flex items-center gap-1 mt-0.5">
                            <Icon name="pin" size={10} />{item.customer_area}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-3 max-w-[200px]">
                        {item.on_hold_reason ?? "—"}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => unholdItem(item)}
                            disabled={unholdBusy === item.job_id}
                            className="press inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold bg-brand text-white shadow-brand hover:bg-brand/90 min-h-[36px] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand/40"
                            aria-label={`เอางาน ${item.job_code ?? ""} กลับมาทำ`}
                          >
                            {unholdBusy === item.job_id ? "กำลังดึงกลับ…" : "เอากลับมาทำ"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal state={modal} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}

      {/* HoldModal */}
      {holdJob && (
        <HoldModal
          jobId={holdJob.job_id}
          jobCode={holdJob.job_code}
          customerName={holdJob.customer_name}
          zone="light"
          onDone={async () => { setHoldJob(null); await load(); }}
          onClose={() => setHoldJob(null)}
        />
      )}
    </div>
  );
}
