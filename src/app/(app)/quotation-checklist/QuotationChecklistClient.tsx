"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";
import { Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { baht } from "@/lib/money";
import type { ChecklistData, ChecklistItem, ChecklistQuotation } from "@/app/api/quotation-checklist/route";

// ---------- types ----------

type PostBody = {
  job_id: string;
  total: number;
  ext_ref?: string;
  ext_link?: string;
  issue_date?: string;
  step: 1 | 2;
};

// ---------- helpers ----------

const DESIGN_STATE_LABEL: Record<string, string> = {
  NOT_STARTED: "ยังไม่เริ่ม", DRAWING: "กำลังเขียน",
  PENDING_CUSTOMER: "รอลูกค้า", REVISING: "แก้ไข", DONE: "เสร็จแล้ว",
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
  const [extRef,     setExtRef]   = useState(parsed.ext_ref);
  const [extLink,    setExtLink]  = useState(parsed.ext_link);
  const [issueDate,  setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving,     setSaving]   = useState(false);
  const [errMsg,     setErrMsg]   = useState("");
  const totalRef = useRef<HTMLInputElement>(null);

  useEffect(() => { totalRef.current?.focus(); }, []);
  // กัน scroll ขณะ modal เปิด
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg("");
    const t = parseFloat(total);
    if (!t || t <= 0) { setErrMsg("กรุณากรอกยอดรวมที่ถูกต้อง"); return; }

    setSaving(true);
    try {
      const body: PostBody = {
        job_id: job.job_id, total: t,
        ext_ref: extRef || undefined, ext_link: extLink || undefined,
        issue_date: issueDate || undefined,
        step: mode === "step1" ? 1 : 2,
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
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
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
          {/* ยอดรวม */}
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-white/85">
              ยอดรวม (รวม VAT แล้ว)
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              ref={totalRef}
              type="number" step="1" min="1" required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="เช่น 120000"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/35 outline-none focus:border-white/50 focus:bg-white/15 tabular-nums"
            />
            {total && parseFloat(total) > 0 && (
              <p className="text-[11px] text-white/50 mt-1 tabular-nums">
                ≈ ก่อน VAT ฿{baht(Math.round((parseFloat(total) / 1.07) * 100) / 100)}
                {" · "}VAT ฿{baht(Math.round(parseFloat(total) - Math.round((parseFloat(total) / 1.07) * 100) / 100))}
              </p>
            )}
          </div>

          {/* เลขใบเสนอนอกระบบ */}
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-white/85">เลขใบเสนอ (นอกระบบ)</label>
            <input
              type="text"
              value={extRef} onChange={(e) => setExtRef(e.target.value)}
              placeholder="เช่น QT2025-001"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/35 outline-none focus:border-white/50 focus:bg-white/15"
            />
          </div>

          {/* ลิงก์ไฟล์ */}
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-white/85">ลิงก์ไฟล์ใบเสนอ</label>
            <input
              type="url"
              value={extLink} onChange={(e) => setExtLink(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/35 outline-none focus:border-white/50 focus:bg-white/15"
            />
          </div>

          {/* วันที่ส่ง (step 2) */}
          {mode === "step2" && (
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-white/85">วันที่ส่งใบเสนอ</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 text-white outline-none focus:border-white/50 focus:bg-white/15 tabular-nums"
              />
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

// ---------- Job Card ----------

function JobCard({
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
        {q && (
          <Badge tone={q.status === "draft" ? "gray" : q.status === "sent" ? "sky" : "emerald"}>
            {q.status === "draft" ? "ร่าง" : q.status === "sent" ? "ส่งแล้ว" : "อนุมัติ"}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
        {item.customer_area && (
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" size={11} />
            {item.customer_area}
          </span>
        )}
        {item.assess_date && (
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" size={11} />
            {thaiDate(item.assess_date)}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Icon name="ruler" size={11} />
          {DESIGN_STATE_LABEL[item.design_state] ?? item.design_state}
          {item.design_end ? ` (${thaiDate(item.design_end)})` : ""}
        </span>
      </div>

      {/* ข้อมูลใบเสนอ */}
      {q && (
        <div className="rounded-xl bg-gray-50/80 border border-gray-200/70 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-brand-dark font-semibold">{q.code}</span>
            <span className="tabular-nums text-sm font-bold text-ink">฿{baht(q.net)}</span>
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

      {/* Actions */}
      {canWrite && (
        <div className="flex gap-2 pt-0.5">
          {!q && (
            <button
              onClick={() => onAction(item, "step1", null)}
              className="press flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-brand min-h-[44px]">
              <Icon name="check" size={15} />
              ทำใบเสนอแล้ว
            </button>
          )}
          {q?.status === "draft" && (
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
          {(q?.status === "sent" || q?.status === "approved") && (
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

// ---------- Lane ----------

function Lane({
  title, tone, icon, items, children,
}: {
  title: string;
  tone: string;
  icon: string;
  items: ChecklistItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${tone}`}>
        <Icon name={icon} size={15} />
        <span className="font-semibold text-sm">{title}</span>
        <span className="tabular-nums text-xs font-bold ml-auto bg-white/40 rounded-md px-1.5 py-0.5">
          {items.length}
        </span>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-center text-ink-3 text-sm py-8">ไม่มีรายการ</p>
        ) : children}
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export default function QuotationChecklistClient() {
  const [data,     setData]     = useState<ChecklistData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [errMsg,   setErrMsg]   = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [modal,    setModal]    = useState<ModalState | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErrMsg("");
    try {
      const res = await api.get<ChecklistData>("/quotation-checklist");
      setData(res.data);
      // ผู้ใช้ที่โหลด GET ได้แล้ว — canWrite ตรวจจาก role ฝั่ง server
      // เราใช้วิธีลอง POST เมื่อกด; ถ้าได้ข้อมูล = ผ่าน auth → แสดงปุ่มให้ทุกคนที่มีสิทธิ์ read
      // (handler POST ใช้ requirePermission("jobs","write") ซึ่งให้ ADMIN/SALES)
      // หน้านี้จึงแสดงปุ่มเสมอ แล้วให้ server reject ถ้าไม่มีสิทธิ์
      setCanWrite(true);
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

  const pending = data?.pending ?? [];
  const drafted = data?.drafted ?? [];
  const sent    = data?.sent    ?? [];

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

      {/* Metric bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "รอทำใบเสนอ",        count: pending.length, color: "text-amber-700  bg-amber-50  border-amber-200" },
          { label: "ทำแล้ว · รอส่ง",    count: drafted.length, color: "text-sky-700    bg-sky-50    border-sky-200" },
          { label: "ส่งแล้ว · รอมัดจำ", count: sent.length,   color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
        ].map((m) => (
          <div key={m.label} className={`rounded-2xl border px-4 py-3 ${m.color}`}>
            <div className={`text-2xl font-extrabold tabular-nums`}>{m.count}</div>
            <div className="text-xs font-medium mt-0.5 leading-tight">{m.label}</div>
          </div>
        ))}
      </div>

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

      {/* 3-lane board */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Lane title="รอทำใบเสนอ" tone="bg-amber-50 border border-amber-200 text-amber-800" icon="clipboard" items={pending}>
            {pending.map((item) => (
              <JobCard key={item.job_id} item={item} onAction={openModal} canWrite={canWrite} />
            ))}
          </Lane>

          <Lane title="ทำแล้ว · รอส่ง" tone="bg-sky-50 border border-sky-200 text-sky-800" icon="file" items={drafted}>
            {drafted.map((item) => (
              <JobCard key={item.job_id} item={item} onAction={openModal} canWrite={canWrite} />
            ))}
          </Lane>

          <Lane title="ส่งแล้ว · รอมัดจำ" tone="bg-emerald-50 border border-emerald-200 text-emerald-800" icon="check" items={sent}>
            {sent.map((item) => (
              <JobCard key={item.job_id} item={item} onAction={openModal} canWrite={canWrite} />
            ))}
          </Lane>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal state={modal} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}
