"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiError } from "@/lib/api";
import { X, TriangleAlert } from "@/components/ui/icons";
import type { ClosureRow } from "@/app/api/sales-closure/route";

// ─── Modal shell: portal ออก body (กัน fixed ถูก contain ใน glass-card ที่มี backdrop-filter
//     → popup เด้งไม่เต็มจอ) + ปิดด้วย Escape ───────────────────────────────────
function ModalShell({
  title, icon, accent, onClose, children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <div className="relative w-full max-w-sm glass-dark rounded-3xl p-6 fade-in">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${accent}`}>{icon}</span>
            <h2 className="text-base font-bold text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด"
            className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10 shrink-0">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function JobInfo({ job }: { job: ClosureRow }) {
  return (
    <div className="glass-card rounded-xl px-4 py-3 mb-4 space-y-1">
      <div className="text-[12px]" style={{ color: "var(--t-low)" }}>งาน</div>
      <div className="text-white font-semibold tnum">{job.job_code ?? "—"} · {job.customer_name}</div>
      <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>
        ขั้นปัจจุบัน: {job.stage_name}{job.customer_tel ? ` · โทร ${job.customer_tel}` : ""}
      </div>
    </div>
  );
}

function Buttons({ busy, onClose, onConfirm, confirmText, tone }: {
  busy: boolean; onClose: () => void; onConfirm: () => void; confirmText: string; tone: string;
}) {
  return (
    <div className="flex gap-2.5 mt-4">
      <button type="button" onClick={onClose} disabled={busy}
        className="focusable pressable flex-1 rounded-xl py-2.5 text-sm font-medium glass-card text-white/70 hover:text-white min-h-[44px] disabled:opacity-50">
        ยกเลิก
      </button>
      <button type="button" onClick={onConfirm} disabled={busy}
        className={`focusable pressable flex-1 rounded-xl py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-60 ${tone}`}>
        {busy ? "กำลังบันทึก…" : confirmText}
      </button>
    </div>
  );
}

// ─── ส่งแก้แบบ ────────────────────────────────────────────────────────────────
function ReviseModal({ job, onClose, onDone }: { job: ClosureRow; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handleRevise = async () => {
    setBusy(true); setErr(null);
    try {
      await api.patch(`/designer/${job.id}`, { state: "REVISING", note: "ส่งแก้แบบจากหน้าปิดการขาย" });
      if (job.current_stage === 6) {
        await api.post(`/jobs/${job.id}/advance`, { to: 5, note: "ส่งแก้แบบ — ย้อนกลับขั้น 5" });
      }
      onDone();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่"); setBusy(false); }
  };
  return (
    <ModalShell title="ยืนยันส่งแก้แบบ?" icon={<TriangleAlert size={18} />} accent="bg-amber-400/20 text-amber-300" onClose={onClose}>
      <JobInfo job={job} />
      <ul className="text-[13px] space-y-1.5 mb-2" style={{ color: "var(--t-mid)" }}>
        <li>• ตั้งสถานะงานแบบเป็น <span className="text-amber-300 font-medium">REVISING</span> (นับรอบแก้)</li>
        <li>• งานเข้าบอร์ด Designer ทันที</li>
        {job.current_stage === 6 && <li>• ย้อนขั้นกลับไป <span className="text-sky-300 font-medium">ขั้น 5 (ทำใบเสนอราคา)</span></li>}
      </ul>
      {err && <div className="mb-1 rounded-xl bg-rose-500/20 border border-rose-300/30 px-4 py-2.5 text-sm text-rose-200">{err}</div>}
      <Buttons busy={busy} onClose={onClose} onConfirm={handleRevise} confirmText="ยืนยัน ส่งแก้แบบ" tone="bg-amber-400/90 hover:bg-amber-400 text-amber-950" />
    </ModalShell>
  );
}

// ─── โน้ต / สถานะติดตาม (เก็บใน jobs.remark) ───────────────────────────────────
function NoteModal({ job, onClose, onDone }: { job: ClosureRow; onClose: () => void; onDone: () => void }) {
  const [val, setVal] = useState(job.remark ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.patch(`/jobs/${job.id}`, { remark: val }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); setBusy(false); }
  };
  return (
    <ModalShell title="โน้ต / สถานะติดตาม" icon={<span className="text-base">📝</span>} accent="bg-sky-400/20 text-sky-300" onClose={onClose}>
      <JobInfo job={job} />
      <p className="text-[12px] mb-2" style={{ color: "var(--t-mid)" }}>
        บันทึกความคืบหน้าการไล่โทรปิดการขาย เช่น “โทรแล้ว รอลูกค้าตัดสินใจ”, “นัดโทรอีกครั้งศุกร์นี้”
      </p>
      <textarea value={val} onChange={(e) => setVal(e.target.value)} rows={4} autoFocus
        placeholder="พิมพ์โน้ต/สถานะ…"
        className="w-full glass-card rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder-white/35 resize-none" />
      {err && <div className="mt-2 rounded-xl bg-rose-500/20 border border-rose-300/30 px-4 py-2.5 text-sm text-rose-200">{err}</div>}
      <Buttons busy={busy} onClose={onClose} onConfirm={save} confirmText="บันทึกโน้ต" tone="bg-sky-400/90 hover:bg-sky-400 text-sky-950" />
    </ModalShell>
  );
}

// ─── ลูกค้ายกเลิกงาน → cascade ยกเลิกใบเสนอ (server) ───────────────────────────
function CancelModal({ job, onClose, onDone }: { job: ClosureRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const doCancel = async () => {
    if (!reason.trim()) { setErr("กรุณาระบุเหตุผลที่ลูกค้ายกเลิก"); return; }
    setBusy(true); setErr(null);
    try { await api.patch(`/jobs/${job.id}`, { status: "CANCELLED", cancel_reason: reason.trim() }); onDone(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "ยกเลิกงานไม่สำเร็จ"); setBusy(false); }
  };
  return (
    <ModalShell title="ลูกค้ายกเลิกงาน?" icon={<TriangleAlert size={18} />} accent="bg-rose-400/20 text-rose-300" onClose={onClose}>
      <JobInfo job={job} />
      <ul className="text-[13px] space-y-1.5 mb-3" style={{ color: "var(--t-mid)" }}>
        <li>• งานจะเปลี่ยนเป็น <span className="text-rose-300 font-medium">ยกเลิก</span> และหายจากหน้านี้</li>
        <li>• ใบเสนอราคาที่ผูกอยู่ (ร่าง/ส่งแล้ว) จะถูก<span className="text-rose-300 font-medium">ยกเลิกอัตโนมัติ</span></li>
        <li>• ย้อนกลับยาก — โปรดยืนยันกับลูกค้าก่อน</li>
      </ul>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
        placeholder="เหตุผลที่ลูกค้ายกเลิก (จำเป็น) เช่น ลูกค้าเปลี่ยนใจ / ราคาสูงไป"
        className="w-full glass-card rounded-xl px-3 py-2.5 text-sm text-white outline-none placeholder-white/35 resize-none" />
      {err && <div className="mt-2 rounded-xl bg-rose-500/20 border border-rose-300/30 px-4 py-2.5 text-sm text-rose-200">{err}</div>}
      <Buttons busy={busy} onClose={onClose} onConfirm={doCancel} confirmText="ยืนยันยกเลิกงาน" tone="bg-rose-500/90 hover:bg-rose-500 text-white" />
    </ModalShell>
  );
}

// ─── Action buttons (rendered per row; แสดงเฉพาะ canWrite จากฝั่ง page) ─────────
export function ClosureActions({ job, onRevised }: { job: ClosureRow; onRevised: () => void }) {
  const [modal, setModal] = useState<null | "revise" | "note" | "cancel">(null);
  const close = () => setModal(null);
  const done = () => { setModal(null); onRevised(); };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 justify-center">
        <button type="button" onClick={() => setModal("note")}
          className="focusable pressable inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-medium bg-sky-400/15 hover:bg-sky-400/25 text-sky-200 border border-sky-300/20 min-h-[36px] transition">
          📝 โน้ต{job.remark ? " ✓" : ""}
        </button>
        {job.can_revise && (
          <button type="button" onClick={() => setModal("revise")}
            className="focusable pressable inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-medium bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 border border-amber-300/20 min-h-[36px] transition"
            aria-label={`ส่งงาน ${job.job_code ?? ""} แก้แบบ`}>
            <TriangleAlert size={13} /> ส่งแก้แบบ
          </button>
        )}
        <button type="button" onClick={() => setModal("cancel")}
          className="focusable pressable inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-[12px] font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-300/20 min-h-[36px] transition"
          aria-label={`ยกเลิกงาน ${job.job_code ?? ""}`}>
          ยกเลิกงาน
        </button>
      </div>

      {modal === "revise" && <ReviseModal job={job} onClose={close} onDone={done} />}
      {modal === "note" && <NoteModal job={job} onClose={close} onDone={done} />}
      {modal === "cancel" && <CancelModal job={job} onClose={close} onDone={done} />}
    </>
  );
}
