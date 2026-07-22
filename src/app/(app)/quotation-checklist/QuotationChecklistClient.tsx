"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";
import { Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { baht } from "@/lib/money";
import DateField from "@/components/ui/DateField";
import type { ChecklistData, ChecklistItem, ChecklistQuotation, SentHistoryItem } from "@/app/api/quotation-checklist/route";
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

// สะพานไป "สร้างใบเสนอราคาในระบบ" (หน้าออกใบเสนอจริง) — ผูกลูกค้า+งานให้ · autofill หัวบิลจากนามออกบิล
function makeQuoteBridge(item: ChecklistItem) {
  try {
    sessionStorage.setItem("jr_quote_items", JSON.stringify({
      items: [], customer: item.customer_name,
      customer_id: item.customer_id ?? undefined, job_id: item.job_id,
    }));
  } catch { /* ignore */ }
}

function thaiDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${parseInt(d)} ${TH[parseInt(m)]} ${parseInt(y)}`;
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

// ---------- งานพื้น ผรม. (0090) ----------

const FLOOR_META: Record<string, { label: string; cls: string }> = {
  none:     { label: "— ไม่มีงานพื้น",        cls: "bg-gray-100 text-gray-500 border-gray-200" },
  jr:       { label: "งานพื้น · JR ทำ",       cls: "bg-sky-100 text-sky-800 border-sky-300" },
  customer: { label: "งานพื้น · ผรม.ลูกค้า",   cls: "bg-amber-100 text-amber-800 border-amber-300" },
};

function FloorWorkControl({ jobId, floorWork, floorNote, floorQuoteSent, canWrite, onSaved }: {
  jobId: string; floorWork: string; floorNote: string; floorQuoteSent: boolean; canWrite: boolean; onSaved: () => void;
}) {
  const [fw, setFw] = useState(floorWork || "none");
  const [note, setNote] = useState(floorNote || "");
  const [fqs, setFqs] = useState(!!floorQuoteSent);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const m = FLOOR_META[fw] ?? FLOOR_META.none;

  // sync กับข้อมูลที่โหลดมาล่าสุด (เครื่องอื่นแก้ / รีเฟรช) — กันแสดงค่าค้างในเครื่องไม่ตรง DB
  useEffect(() => { setFw(floorWork || "none"); }, [floorWork]);
  useEffect(() => { setNote(floorNote || ""); }, [floorNote]);
  useEffect(() => { setFqs(!!floorQuoteSent); }, [floorQuoteSent]);

  async function save(patch: Record<string, unknown>) {
    setBusy(true); setErr("");
    try {
      const { data } = await api.post<{ floor_work?: string; floor_note?: string; floor_quote_sent?: boolean }>(`/jobs/${jobId}/floor-work`, patch);
      // ยึดค่าที่ DB ยืนยันกลับมา (กันแสดงค่าที่บันทึกไม่ติด)
      if (data) { setFw(data.floor_work ?? "none"); setNote(data.floor_note ?? ""); setFqs(!!data.floor_quote_sent); }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      // revert กลับค่าที่โหลดมาล่าสุด (ไม่ให้ค้างค่าที่ยังไม่ติด)
      setFw(floorWork || "none"); setNote(floorNote || ""); setFqs(!!floorQuoteSent);
    } finally { setBusy(false); }
  }

  if (!canWrite) {
    if (fw === "none") return <span className="text-[11px] text-ink-3">—</span>;
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${m.cls}`}>
          {m.label}{floorNote ? ` · ${floorNote}` : ""}
        </span>
        {fw === "jr" && fqs && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">✓ ส่งใบเสนอพื้นแล้ว</span>}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={fw} disabled={busy}
        onChange={(e) => { const v = e.target.value; setFw(v); if (v === "none") { setNote(""); setFqs(false); } save({ floor_work: v, floor_note: v === "none" ? "" : note }); }}
        aria-label="งานพื้น ผรม."
        className={`text-[11px] rounded-lg border px-1.5 py-1 outline-none ${m.cls}`}>
        <option value="none">— ไม่มีงานพื้น</option>
        <option value="jr">งานพื้น · JR ทำ</option>
        <option value="customer">งานพื้น · ผรม.ลูกค้า</option>
      </select>
      {fw !== "none" && (
        <input value={note} disabled={busy} placeholder="ผรม.ใคร / โน้ต"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (floorNote || "")) save({ floor_note: note }); }}
          className="text-[11px] rounded-lg border border-gray-300 px-1.5 py-1 outline-none w-28" />
      )}
      {fw === "jr" && (
        <label className={`inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer rounded-full px-2 py-1 border ${fqs ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-white text-ink-2 border-gray-300"}`}>
          <input type="checkbox" checked={fqs} disabled={busy}
            onChange={(e) => { setFqs(e.target.checked); save({ floor_quote_sent: e.target.checked }); }} />
          ส่งใบเสนอพื้นแล้ว
        </label>
      )}
      {err && <span className="text-[11px] text-red-600 w-full">⚠ {err}</span>}
    </div>
  );
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
  // ค่าเริ่มต้น "วันที่ส่งใบเสนอ" = วันส่งเดิมของงาน (ถ้าเคยส่งแล้ว) ไม่ใช่วันนี้
  //
  // เดิมตั้งเป็น "วันนี้" เสมอ → กดยืนยันซ้ำงานที่ส่งไปแล้ว = ทับวันส่งจริงด้วยวันที่กดปุ่ม
  // เคยทำข้อมูลเสียจริง 29 งาน (25 งานกลายเป็น 16 มิ.ย. 2569 หมด) — ห้ามเปลี่ยนกลับ
  const [issueDate,  setIssueDate] = useState(job.quote_sent_date ?? new Date().toISOString().slice(0, 10));
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
              {/* max = วันนี้ — วันส่งใบเสนอเป็นอนาคตไม่ได้ (กันพิมพ์วัน/เดือนสลับ เช่น 6/12 แทน 12/6) */}
              <DateField value={issueDate} onChange={(iso) => setIssueDate(iso)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white outline-none focus:border-white/50 focus:bg-white/15"
                aria-label="วันที่ส่งใบเสนอ" />
              {job.quote_sent_date && (
                <p className="mt-1.5 text-xs text-amber-200/90">
                  งานนี้บันทึกว่าส่งไปแล้วเมื่อ {thaiDate(job.quote_sent_date)} — แก้ช่องนี้เฉพาะตอนที่ส่งใบใหม่จริง ๆ
                </p>
              )}
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
  item, onAction, canWrite, onReload,
}: {
  item: ChecklistItem;
  onAction: (job: ChecklistItem, mode: ModalMode, q: ChecklistQuotation | null) => void;
  canWrite: boolean;
  onReload: () => void;
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

      {/* งานพื้น ผรม. */}
      <FloorWorkControl jobId={item.job_id} floorWork={item.floor_work} floorNote={item.floor_note} floorQuoteSent={item.floor_quote_sent} canWrite={canWrite} onSaved={onReload} />

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
        {item.sales_name && (
          <span className="inline-flex items-center gap-1">
            <Icon name="user" size={11} />{item.sales_name}
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
          <Link
            href="/calculator40"
            onClick={() => makeQuoteBridge(item)}
            title="สร้างใบเสนอราคาจริงในระบบ (ผูกลูกค้า/งานให้)"
            className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand text-white px-3 py-2.5 text-sm font-semibold shadow-brand hover:opacity-95 min-h-[44px]">
            <Icon name="file" size={15} /> สร้างใบเสนอในระบบ
          </Link>
          <button
            onClick={() => onAction(item, "step2", q ?? null)}
            title="มาร์ค/แก้ยอดใบเสนอ (นอกระบบ)"
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
  item, todayStr, onAction, canWrite, onHold, onReload,
}: {
  item: ChecklistItem;
  todayStr: string;
  onAction: (job: ChecklistItem, mode: ModalMode, q: ChecklistQuotation | null) => void;
  canWrite: boolean;
  onHold?: (item: ChecklistItem) => void;
  onReload: () => void;
}) {
  const q = item.quotation;
  const designLabel = DESIGN_STATE_LABEL[item.design_state] ?? item.design_state;

  // badge สถานะใบเสนอ
  let quoteBadge: React.ReactNode;
  if (item.stage === "in_design") {
    // ส่งใบเสนอด่วนไปแล้ว (ตอนแบบยังไม่เสร็จ) → โชว์เขียว + เตือนว่าแบบยังทำอยู่
    quoteBadge = item.quote_sent_date ? (
      <div className="space-y-0.5">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300">✓ ส่งด่วนแล้ว</span>
        <div className="text-[10px] text-amber-700 font-medium">แบบยังทำอยู่</div>
        {q && <div className="text-[11px] text-ink-3 tabular-nums">{q.code}{Number(q.net) > 0 ? ` · ฿${baht(q.net)}` : ""}</div>}
      </div>
    ) : item.design_state === "REVISING"
      ? <Badge tone="red">แก้แบบ</Badge>
      : <Badge tone="gray">รอแบบ</Badge>;
  } else if (item.stage === "pending") {
    quoteBadge = <Badge tone="amber">ยังไม่ทำ</Badge>;
  } else if (item.stage === "sent") {
    quoteBadge = (
      <div className="space-y-0.5">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300">✓ ส่งแล้ว</span>
        {q && (
          <div className="text-[11px] text-ink-3 tabular-nums">{q.code}{Number(q.net) > 0 ? ` · ฿${baht(q.net)}` : ""}</div>
        )}
      </div>
    );
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
    <tr className={`border-b border-gray-100 hover:bg-white/60 transition-colors ${item.stage === "sent" ? "bg-emerald-50/50" : ""}`}>
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
        {/* หมายเหตุ "มาจากแก้แบบ" — งานที่ถูกส่งกลับแก้ (รวมที่แก้เสร็จแล้วรอทำใบเสนอใหม่) */}
        {item.revised && (
          <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-100 border border-red-300 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
            <Icon name="refresh" size={10} />
            มาจากแก้แบบ{item.revise_count > 0 ? ` · รอบ ${item.revise_count}` : ""}
          </div>
        )}
        {item.sales_name && (
          <div className="text-xs text-ink-3 mt-0.5 flex items-center gap-1">
            <Icon name="user" size={10} />{item.sales_name}
          </div>
        )}
        {item.customer_area && (
          <div className="text-xs text-ink-3 flex items-center gap-1">
            <Icon name="pin" size={10} />{item.customer_area}
          </div>
        )}
        {/* งานพื้น ผรม. — ติ๊กได้ทุก stage */}
        <div className="mt-1.5">
          <FloorWorkControl jobId={item.job_id} floorWork={item.floor_work} floorNote={item.floor_note} floorQuoteSent={item.floor_quote_sent} canWrite={canWrite} onSaved={onReload} />
        </div>
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
        {item.design_state === "DONE" && item.design_end && (
          <div className="text-[11px] text-emerald-600 tabular-nums mt-0.5">
            เสร็จ {thaiDate(item.design_end)}
          </div>
        )}
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
              <>
                <Link
                  href="/designer"
                  className="press inline-flex items-center gap-1 rounded-lg border border-gray-300/80 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-white/70 min-h-[36px]">
                  <Icon name="ruler" size={12} />
                  ดูบอร์ดแบบ
                </Link>
                <Link
                  href="/calculator40"
                  onClick={() => makeQuoteBridge(item)}
                  title="สร้างใบเสนอราคาจริงในระบบ (ผูกลูกค้า/งานให้)"
                  className="press inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white shadow-brand min-h-[36px]">
                  <Icon name="file" size={12} /> สร้างในระบบ
                </Link>
                {!item.quote_sent_date ? (
                  <button
                    onClick={() => { if (confirm("แบบยังไม่เสร็จ — ยืนยันส่งใบเสนอด่วน?\n(ฝ่ายแบบยังต้องทำแบบต่อ · จะขึ้นป้ายในบอร์ดแบบว่าส่งใบเสนอไปแล้ว)")) onAction(item, "step2", null); }}
                    title="ส่งใบเสนอด่วน — ไม่ต้องรอแบบเสร็จ"
                    className="press inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white min-h-[36px] hover:bg-amber-600">
                    <Icon name="external" size={12} /> ส่งด่วน
                  </button>
                ) : (
                  <button
                    onClick={() => onAction(item, "step2", q ?? null)} aria-label="แก้ยอดใบเสนอ"
                    className="press inline-flex items-center justify-center rounded-lg border border-gray-300/80 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-white/70 min-h-[36px] min-w-[36px]">
                    <Icon name="pencil" size={12} />
                  </button>
                )}
              </>
            )}
            {(item.stage === "pending" || item.stage === "drafted") && (
              <Link
                href="/calculator40"
                onClick={() => makeQuoteBridge(item)}
                title="สร้างใบเสนอราคาจริงในระบบ (ผูกลูกค้า/งานให้)"
                className="press inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white shadow-brand min-h-[36px]">
                <Icon name="file" size={12} /> สร้างในระบบ
              </Link>
            )}
            {item.stage === "pending" && (
              <button
                onClick={() => onAction(item, "step2", null)}
                title="มาร์คว่าทำใบเสนอนอกระบบ+ส่งแล้ว (ไม่สร้างในระบบ)"
                className="press inline-flex items-center gap-1 rounded-lg border border-gray-300/80 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-white/70 min-h-[36px]">
                <Icon name="check" size={12} />
                มาร์คส่งแล้ว
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
            {/* ส่งแล้ว = ไม่ย้ายออก (แค่แถวเขียว) — ทำใบเสนอในระบบ / แก้ยอด / วางบิล */}
            {item.stage === "sent" && (
              <>
                <Link href="/calculator40" onClick={() => makeQuoteBridge(item)}
                  className="press inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white shadow-brand min-h-[36px]">
                  <Icon name="file" size={12} /> สร้างในระบบ
                </Link>
                <button onClick={() => onAction(item, "step2", q ?? null)} aria-label="แก้ยอดใบเสนอ"
                  className="press inline-flex items-center justify-center rounded-lg border border-gray-300/80 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-white/70 min-h-[36px] min-w-[36px]">
                  <Icon name="pencil" size={12} />
                </button>
                {q && (
                  <Link href={`/billing-notes/new?quotation=${q.id}`}
                    className="press inline-flex items-center gap-1 rounded-lg border border-brand px-2.5 py-1.5 text-xs font-semibold text-brand-dark hover:bg-brand/5 min-h-[36px]">
                    <Icon name="banknote" size={12} /> วางบิล
                  </Link>
                )}
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
  item, todayStr, onAction, canWrite, onHold, onReload,
}: {
  item: ChecklistItem;
  todayStr: string;
  onAction: (job: ChecklistItem, mode: ModalMode, q: ChecklistQuotation | null) => void;
  canWrite: boolean;
  onHold?: (item: ChecklistItem) => void;
  onReload: () => void;
}) {
  const q = item.quotation;
  const designLabel = DESIGN_STATE_LABEL[item.design_state] ?? item.design_state;

  return (
    <div className={`glass rounded-2xl p-4 space-y-2.5 ${item.stage === "sent" ? "ring-1 ring-emerald-300 bg-emerald-50/40" : ""}`}>
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
          {/* หมายเหตุ "มาจากแก้แบบ" */}
          {item.revised && (
            <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-100 border border-red-300 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              <Icon name="refresh" size={10} />
              มาจากแก้แบบ{item.revise_count > 0 ? ` · รอบ ${item.revise_count}` : ""}
            </div>
          )}
        </div>
        {/* stage badge */}
        {item.stage === "in_design" && (item.quote_sent_date
          ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300">✓ ส่งด่วนแล้ว · แบบยังทำอยู่</span>
          : item.design_state === "REVISING"
            ? <Badge tone="red">แก้แบบ</Badge>
            : <Badge tone="gray">รอแบบ</Badge>)}
        {item.stage === "pending"   && <Badge tone="amber">ยังไม่ทำใบเสนอ</Badge>}
        {item.stage === "drafted"   && <Badge tone="sky">ร่างใบเสนอ</Badge>}
        {item.stage === "sent"      && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300">✓ ส่งแล้ว</span>}
      </div>

      {/* งานพื้น ผรม. */}
      <FloorWorkControl jobId={item.job_id} floorWork={item.floor_work} floorNote={item.floor_note} floorQuoteSent={item.floor_quote_sent} canWrite={canWrite} onSaved={onReload} />

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
        {item.sales_name && (
          <span className="inline-flex items-center gap-1"><Icon name="user" size={11} />{item.sales_name}</span>
        )}
        <span className="inline-flex items-center gap-1">
          <Icon name="ruler" size={11} />{designLabel} · {item.designer_name ?? "ยังไม่มอบหมาย"}
          {item.design_state === "DONE" && item.design_end && (
            <span className="text-emerald-600 tabular-nums">· เสร็จ {thaiDate(item.design_end)}</span>
          )}
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
            <>
              <Link href="/designer" aria-label="ดูบอร์ดแบบ"
                className="press inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300/70 px-3 py-2.5 text-sm font-semibold text-ink-2 hover:bg-white/60 min-h-[44px] min-w-[44px]">
                <Icon name="ruler" size={15} />
              </Link>
              <Link href="/calculator40" onClick={() => makeQuoteBridge(item)}
                className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-brand min-h-[44px]">
                <Icon name="file" size={15} /> สร้างในระบบ
              </Link>
              {!item.quote_sent_date ? (
                <button onClick={() => { if (confirm("แบบยังไม่เสร็จ — ยืนยันส่งใบเสนอด่วน?\n(ฝ่ายแบบยังต้องทำแบบต่อ)")) onAction(item, "step2", null); }}
                  className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-semibold text-white min-h-[44px] hover:bg-amber-600">
                  <Icon name="external" size={15} /> ส่งด่วน
                </button>
              ) : (
                <button onClick={() => onAction(item, "step2", q ?? null)} aria-label="แก้ยอดใบเสนอ"
                  className="press inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300/70 px-3 py-2.5 text-sm font-semibold text-ink-2 hover:bg-white/60 min-h-[44px] min-w-[44px]">
                  <Icon name="pencil" size={15} />
                </button>
              )}
            </>
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
          {item.stage === "sent" && (
            <>
              <Link href="/calculator40" onClick={() => makeQuoteBridge(item)}
                className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-brand min-h-[44px]">
                <Icon name="file" size={15} /> สร้างในระบบ
              </Link>
              {q && (
                <Link href={`/billing-notes/new?quotation=${q.id}`}
                  className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand px-3 py-2.5 text-sm font-semibold text-brand-dark hover:bg-brand/5 min-h-[44px]">
                  <Icon name="banknote" size={15} /> วางบิล
                </Link>
              )}
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
  const [heldOpen,  setHeldOpen]  = useState(false);
  const [unholdBusy, setUnholdBusy] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hq, setHq] = useState("");   // ค้นหาในประวัติ
  const [floorOnly, setFloorOnly] = useState(false);
  const [sortKey, setSortKey] = useState<"assess" | "delivery" | "name">("assess");
  const [catFilter, setCatFilter] = useState<"all" | "in_design" | "pending" | "drafted" | "sent">("all"); // กรองตามหมวด (กดการ์ดด้านบน)
  const [meta,      setMeta]      = useState<{
    counts: { in_design: number; pending: number; drafted: number; sent: number; held: number };
    overdue: number;
    due_soon: number;
    floor_jr: number;
    floor_customer: number;
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
          floor_jr: Number(res.meta.floor_jr ?? 0),
          floor_customer: Number(res.meta.floor_customer ?? 0),
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
  const history = data?.history ?? [];
  const counts = meta?.counts ?? { in_design: 0, pending: 0, drafted: 0, sent: 0, held: 0 };
  const overdue  = meta?.overdue  ?? 0;
  const dueSoon  = meta?.due_soon ?? 0;
  const floorJr = meta?.floor_jr ?? 0;
  const floorCustomer = meta?.floor_customer ?? 0;
  const historyFiltered = history.filter((h) => {
    if (floorOnly && h.floor_work === "none") return false;
    const q = hq.trim().toLowerCase();
    if (!q) return true;
    return [h.customer_name, h.job_code ?? "", h.floor_note].join(" ").toLowerCase().includes(q);
  });

  // ลิสต์หลัก = active + sent รวมกัน (ส่งแล้วไม่ย้ายออก แค่แถวเขียว) · กรองหมวด (กดการ์ด) แล้วเรียงตามที่เลือก
  const mainList = [...active, ...sent].filter((it) => catFilter === "all" || it.stage === catFilter).sort((a, b) => {
    if (sortKey === "delivery") {
      if (!a.delivery_due && !b.delivery_due) return 0;
      if (!a.delivery_due) return 1;
      if (!b.delivery_due) return -1;
      return a.delivery_due.localeCompare(b.delivery_due);
    }
    if (sortKey === "name") return a.customer_name.localeCompare(b.customer_name, "th");
    return (b.assess_date ?? "").localeCompare(a.assess_date ?? ""); // ประเมินใหม่สุดก่อน
  });

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
          {([
            { key: "in_design", n: counts.in_design, label: "รอแบบ", cls: "bg-purple-50 border-purple-200 text-purple-800", ring: "ring-purple-400", show: true },
            { key: "pending", n: counts.pending, label: "รอทำใบเสนอ", cls: "bg-amber-50 border-amber-200 text-amber-800", ring: "ring-amber-400", show: true },
            { key: "drafted", n: counts.drafted, label: "ร่าง", cls: "bg-sky-50 border-sky-200 text-sky-800", ring: "ring-sky-400", show: counts.drafted > 0 },
            { key: "sent", n: counts.sent, label: "ส่งแล้ว · รอมัดจำ", cls: "bg-emerald-50 border-emerald-200 text-emerald-800", ring: "ring-emerald-400", show: true },
          ] as const).filter((c) => c.show).map((c) => {
            const on = catFilter === c.key;
            return (
              <button key={c.key} type="button"
                onClick={() => setCatFilter((v) => (v === c.key ? "all" : c.key))}
                aria-pressed={on}
                className={`press text-left rounded-2xl border px-4 py-3 transition ${c.cls} ${on ? `ring-2 ${c.ring} shadow-sm` : "opacity-95 hover:opacity-100"}`}>
                <div className="text-2xl font-extrabold tabular-nums">{c.n}</div>
                <div className="text-xs font-medium mt-0.5 leading-tight flex items-center gap-1">{c.label}{on && <span className="text-[10px]">▼ กรองอยู่</span>}</div>
              </button>
            );
          })}
        </div>
      )}
      {catFilter !== "all" && (
        <button type="button" onClick={() => setCatFilter("all")}
          className="press inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 bg-gray-100 text-ink-2 border border-gray-300 hover:bg-gray-200">
          ✕ ล้างตัวกรองหมวด (โชว์ทั้งหมด)
        </button>
      )}

      {/* งานพื้น ผรม. — สรุป */}
      {data && (floorJr > 0 || floorCustomer > 0) && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 bg-sky-100 text-sky-800 border border-sky-200">🧱 งานพื้น JR ทำ · {floorJr}</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 bg-amber-100 text-amber-800 border border-amber-200">🧱 งานพื้น ผรม.ลูกค้า · {floorCustomer}</span>
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

      {/* ตารางหลักใบเสนอราคา (รวม "ส่งแล้ว" · ไม่ซ่อน · แถวเขียว) */}
      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <Icon name="track" size={16} className="text-brand" />
              รายการใบเสนอราคา
              <span className="tabular-nums text-sm font-normal text-ink-3">({mainList.length} รายการ)</span>
            </h2>
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              เรียง:
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as "assess" | "delivery" | "name")}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-brand">
                <option value="assess">เข้าประเมินใหม่สุดก่อน</option>
                <option value="delivery">เดดไลน์ส่งใกล้สุดก่อน</option>
                <option value="name">ชื่อลูกค้า ก-ฮ</option>
              </select>
            </label>
          </div>

          {mainList.length === 0 ? (
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
                    {mainList.map((item) => (
                      <ActiveTableRow
                        key={item.job_id}
                        item={item}
                        todayStr={today}
                        onAction={openModal}
                        canWrite={canWrite}
                        onHold={canWrite ? (i) => setHoldJob(i) : undefined}
                        onReload={load}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {mainList.map((item) => (
                  <ActiveMobileCard
                    key={item.job_id}
                    item={item}
                    todayStr={today}
                    onAction={openModal}
                    canWrite={canWrite}
                    onHold={canWrite ? (i) => setHoldJob(i) : undefined}
                    onReload={load}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ประวัติใบเสนอที่ส่งแล้ว (ถาวร) · ไล่เช็คงานพื้น ── */}
      {data && (
        <div className="space-y-3">
          <button onClick={() => setHistoryOpen((v) => !v)}
            className="press w-full flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 px-4 py-3 text-sm font-semibold hover:bg-sky-100 transition-colors min-h-[44px]">
            <Icon name="clipboard" size={15} />
            <span>ประวัติใบเสนอที่ส่งแล้ว · ไล่เช็คงานพื้น</span>
            <span className="tabular-nums text-xs font-bold bg-white/60 rounded-md px-1.5 py-0.5 ml-1">{history.length}</span>
            <span className="ml-auto"><Icon name={historyOpen ? "chevron-up" : "chevron-down"} size={16} /></span>
          </button>

          {historyOpen && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input value={hq} onChange={(e) => setHq(e.target.value)} placeholder="ค้นหาชื่อลูกค้า / job / ผรม."
                  className="flex-1 min-w-[180px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand" />
                <button onClick={() => setFloorOnly((v) => !v)}
                  className={`press text-xs font-semibold rounded-full px-3 py-2 border min-h-[40px] ${floorOnly ? "bg-brand text-white border-brand" : "bg-white text-ink-2 border-gray-300"}`}>
                  เฉพาะมีงานพื้น
                </button>
              </div>

              {historyFiltered.length === 0 ? (
                <Card className="p-8 text-center text-ink-3 text-sm">{hq || floorOnly ? "ไม่พบรายการ" : "ยังไม่มีประวัติใบเสนอที่ส่งแล้ว"}</Card>
              ) : (
                <div className="glass rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/50 border-b border-gray-100">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">ลูกค้า</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide whitespace-nowrap">ส่งเมื่อ</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-ink-3 uppercase tracking-wide">งานพื้น (ผรม.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyFiltered.map((h: SentHistoryItem) => (
                        <tr key={h.job_id} className="border-b border-gray-100 last:border-0 hover:bg-white/60 transition-colors">
                          <td className="px-3 py-2.5 align-top">
                            <div className="font-semibold text-ink text-sm leading-snug">{h.customer_name}</div>
                            <div className="text-xs text-ink-3 flex flex-wrap gap-x-2">
                              {h.job_code && <span className="font-mono">{h.job_code}</span>}
                              {h.customer_area && <span>· {h.customer_area}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top text-sm text-ink-2 tabular-nums whitespace-nowrap">{thaiDate(h.quote_sent_date)}</td>
                          <td className="px-3 py-2.5 align-top">
                            <FloorWorkControl jobId={h.job_id} floorWork={h.floor_work} floorNote={h.floor_note} floorQuoteSent={h.floor_quote_sent} canWrite={canWrite} onSaved={load} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
