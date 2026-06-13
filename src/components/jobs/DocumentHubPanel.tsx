"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Check, ExternalLink, ShieldCheck, ClipboardList, FileText } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/primitives";
import type { JobDocument } from "@/lib/database.types";

// ─── types ───────────────────────────────────────────────────────────────────

type DocResponse = { documents: JobDocument[] };

type DocState = {
  doc_no:    string;
  file_link: string;
  doc_date:  string;
  done:      boolean;
  // warranty only
  w_start:   string;
  w_years:   string;
};

const EMPTY_STATE: DocState = {
  doc_no: "", file_link: "", doc_date: "", done: false, w_start: "", w_years: "",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function docToState(doc: JobDocument | undefined): DocState {
  if (!doc) return { ...EMPTY_STATE };
  const m = (doc.meta ?? {}) as { start_date?: string; years?: number };
  return {
    doc_no:    doc.doc_no    ?? "",
    file_link: doc.file_link ?? "",
    doc_date:  doc.doc_date  ?? "",
    done:      doc.done,
    w_start:   m.start_date  ?? "",
    w_years:   m.years != null ? String(m.years) : "",
  };
}

function isDirty(s: DocState, doc: JobDocument | undefined): boolean {
  return JSON.stringify(s) !== JSON.stringify(docToState(doc));
}

// ─── sub-component: DocRow ───────────────────────────────────────────────────

const FLD      = "focusable w-full glass-card rounded-lg px-3 py-2 text-sm text-white outline-none min-h-[40px] placeholder-white/40";
const FLD_DATE = `${FLD} [&::-webkit-calendar-picker-indicator]:invert`;

type DocRowProps = {
  label:        string;
  icon:         React.ReactNode;
  jobId:        string;
  docType:      "boq" | "contract" | "warranty";
  doc:          JobDocument | undefined;
  onSaved:      () => void;
  showWarranty?: boolean;
};

function DocRow({ label, icon, jobId, docType, doc, onSaved, showWarranty }: DocRowProps) {
  const [s, setS]       = useState<DocState>(() => docToState(doc));
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const set = (k: keyof DocState, v: string | boolean) => setS((p) => ({ ...p, [k]: v }));
  const dirty = isDirty(s, doc);

  async function save() {
    setErrMsg(null); setSaving(true);
    try {
      const meta =
        docType === "warranty"
          ? { start_date: s.w_start || null, years: s.w_years ? Number(s.w_years) : null }
          : {};
      await api.post("/job-documents", {
        job_id:    jobId,
        doc_type:  docType,
        doc_no:    s.doc_no    || null,
        file_link: s.file_link || null,
        doc_date:  s.doc_date  || null,
        done:      s.done,
        meta,
      });
      onSaved();
    } catch (e) {
      setErrMsg(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card rounded-xl p-3.5 space-y-2.5">
      {/* header row: ชื่อ + checkbox done */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-white/70">
          {icon}
          <span className="text-sm font-semibold text-white">{label}</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none min-h-[28px]">
          <input
            type="checkbox"
            checked={s.done}
            onChange={(e) => set("done", e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-400 focusable"
          />
          <span className={`text-[12px] ${s.done ? "text-emerald-300" : "text-white/55"}`}>
            {s.done ? "ทำแล้ว" : "ยังไม่ทำ"}
          </span>
        </label>
      </div>

      {/* form fields */}
      <div className="space-y-2">
        <div>
          <label className="text-[11px] block mb-1" style={{ color: "var(--t-low)" }}>เลขเอกสาร</label>
          <input
            value={s.doc_no}
            onChange={(e) => set("doc_no", e.target.value)}
            placeholder="เช่น QT2025-001"
            className={FLD}
          />
        </div>

        <div>
          <label className="text-[11px] block mb-1" style={{ color: "var(--t-low)" }}>ลิงก์ไฟล์</label>
          <div className="flex gap-1.5">
            <input
              value={s.file_link}
              onChange={(e) => set("file_link", e.target.value)}
              placeholder="https://drive.google.com/..."
              className={`${FLD} flex-1`}
            />
            {s.file_link && (
              <a
                href={s.file_link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="เปิดไฟล์"
                className="focusable pressable inline-flex items-center justify-center w-10 h-10 glass-card rounded-lg text-white/70 hover:text-white shrink-0"
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>
        </div>

        <div>
          <label className="text-[11px] block mb-1" style={{ color: "var(--t-low)" }}>วันที่เอกสาร</label>
          <input
            type="date"
            value={s.doc_date}
            onChange={(e) => set("doc_date", e.target.value)}
            className={FLD_DATE}
          />
        </div>

        {showWarranty && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: "var(--t-low)" }}>วันเริ่มรับประกัน</label>
              <input
                type="date"
                value={s.w_start}
                onChange={(e) => set("w_start", e.target.value)}
                className={FLD_DATE}
              />
            </div>
            <div>
              <label className="text-[11px] block mb-1" style={{ color: "var(--t-low)" }}>ปีรับประกัน</label>
              <input
                inputMode="numeric"
                value={s.w_years}
                onChange={(e) => set("w_years", e.target.value)}
                placeholder="เช่น 1"
                className={FLD}
              />
            </div>
          </div>
        )}
      </div>

      {errMsg && (
        <p role="alert" className="text-[12px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-lg px-3 py-2">
          {errMsg}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="focusable pressable w-full bg-white/15 hover:bg-white/25 border border-white/20 text-white rounded-lg px-3 py-2 text-[13px] font-semibold disabled:opacity-40 min-h-[40px] flex items-center justify-center gap-1.5 transition-colors"
      >
        {saving ? (
          <>
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            กำลังบันทึก…
          </>
        ) : (
          <><Check size={14} />บันทึก</>
        )}
      </button>
    </div>
  );
}

// ─── ReadOnlyDocRow ───────────────────────────────────────────────────────────

function ReadOnlyDocRow({ label, doc }: { label: string; doc: JobDocument | undefined }) {
  return (
    <div className="flex items-center gap-2 glass-card rounded-xl px-3 py-2.5">
      <span className="text-[13px] text-white/80 flex-1">{label}</span>
      {doc?.done ? (
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-300/30 text-emerald-200 flex items-center gap-1">
          <Check size={11} />ทำแล้ว
        </span>
      ) : (
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/60">
          ยังไม่ทำ
        </span>
      )}
      {doc?.file_link && (
        <a
          href={doc.file_link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="เปิดไฟล์"
          className="focusable ml-1 text-white/60 hover:text-white/90"
        >
          <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

// ─── DocumentHubPanel (main export) ──────────────────────────────────────────

export function DocumentHubPanel({
  jobId,
  quoteChecklist,
  canWrite = true,
}: {
  jobId: string;
  /** true ถ้างานส่งใบเสนอแล้ว (job.quote_sent_date != null) */
  quoteChecklist?: boolean;
  canWrite?: boolean;
}) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["job-documents", jobId],
    queryFn:  () => api.get<DocResponse>(`/job-documents?job_id=${jobId}`).then((r) => r.data),
  });

  function onSaved() {
    qc.invalidateQueries({ queryKey: ["job-documents", jobId] });
  }

  const docs     = data?.documents ?? [];
  const boq      = docs.find((d) => d.doc_type === "boq");
  const contract = docs.find((d) => d.doc_type === "contract");
  const warranty = docs.find((d) => d.doc_type === "warranty");

  return (
    <div>
      {/* ─── กลุ่มการเงิน (สถานะอ่านจาก job) ─── */}
      <div className="glass-card rounded-xl p-3.5 mb-3">
        <div className="text-[11px] mb-2" style={{ color: "var(--t-low)" }}>การเงิน</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-white/80">ใบเสนอราคา</span>
            {quoteChecklist ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-300/30 text-emerald-200 flex items-center gap-1">
                <Check size={11} />ส่งแล้ว
              </span>
            ) : (
              <a
                href={`/quotation-checklist`}
                className="focusable text-[11px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/60 hover:text-white/90 hover:bg-white/15 inline-flex items-center gap-1 transition-colors min-h-[28px]"
              >
                ทำใบเสนอ <ExternalLink size={11} />
              </a>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-white/80">ใบวางบิล / ใบเสร็จ</span>
            <a
              href="/billing-notes"
              className="focusable text-[11px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/60 hover:text-white/90 hover:bg-white/15 inline-flex items-center gap-1 transition-colors min-h-[28px]"
            >
              ดูในหน้าบัญชี <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </div>

      {/* ─── เอกสารประกอบ ─── */}
      <div className="text-[11px] mb-2" style={{ color: "var(--t-low)" }}>เอกสารประกอบ</div>

      {isLoading ? (
        <div className="py-4"><Spinner /></div>
      ) : canWrite ? (
        <div className="space-y-2.5">
          <DocRow
            label="BOQ"
            icon={<ClipboardList size={15} />}
            jobId={jobId}
            docType="boq"
            doc={boq}
            onSaved={onSaved}
          />
          <DocRow
            label="เอกสารลูกค้า / สัญญา"
            icon={<FileText size={15} />}
            jobId={jobId}
            docType="contract"
            doc={contract}
            onSaved={onSaved}
          />
          <DocRow
            label="ใบรับประกัน"
            icon={<ShieldCheck size={15} className="text-emerald-300" />}
            jobId={jobId}
            docType="warranty"
            doc={warranty}
            onSaved={onSaved}
            showWarranty
          />
        </div>
      ) : (
        <div className="space-y-2">
          <ReadOnlyDocRow label="BOQ"                    doc={boq} />
          <ReadOnlyDocRow label="เอกสารลูกค้า / สัญญา" doc={contract} />
          <ReadOnlyDocRow label="ใบรับประกัน"           doc={warranty} />
        </div>
      )}
    </div>
  );
}
