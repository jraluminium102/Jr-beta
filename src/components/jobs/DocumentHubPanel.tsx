"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { baht, thDate } from "@/lib/format";
import { Check, ExternalLink, ShieldCheck, ClipboardList, FileText, FileCheck, FilePlus, Banknote } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/primitives";
import DateField from "@/components/ui/DateField";
import type { JobDocument } from "@/lib/database.types";

// ─── types ───────────────────────────────────────────────────────────────────

type DocResponse = { documents: JobDocument[] };

type QuotationSummary = {
  id: number;
  code: string;
  status: string; // "draft" | "sent" | "approved" | "cancelled"
  net: number;
  vat_rate: number;
};

type BillingSummary = {
  id: number;
  code: string;
  status: string; // "unpaid" | "partial" | "paid" | "cancelled"
  total: number;
  paid: number;
  installmentCount: number;
  paidCount: number;
};

type ReceiptSummary = {
  id: number;
  code: string;
  net: number;
  issue_date: string | null;
  is_voided: boolean;
};

type DocSummary = {
  vat_rate: number;
  quotation: QuotationSummary | null;
  billings: BillingSummary[];
  receipts: ReceiptSummary[];
};

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

// ─── badge helpers ────────────────────────────────────────────────────────────

const QUOTE_STATUS: Record<string, { th: string; cls: string }> = {
  draft:    { th: "ร่าง",      cls: "bg-white/12 border-white/20 text-white/70" },
  sent:     { th: "ส่งแล้ว",   cls: "bg-sky-500/25 border-sky-300/30 text-sky-200" },
  approved: { th: "อนุมัติ",   cls: "bg-emerald-500/25 border-emerald-300/30 text-emerald-200" },
};

const BILLING_STATUS: Record<string, { th: string; cls: string }> = {
  unpaid:  { th: "ยังไม่จ่าย", cls: "bg-amber-500/20 border-amber-300/25 text-amber-200" },
  partial: { th: "จ่ายบางส่วน", cls: "bg-sky-500/25 border-sky-300/30 text-sky-200" },
  paid:    { th: "ครบแล้ว",    cls: "bg-emerald-500/25 border-emerald-300/30 text-emerald-200" },
};

function StatusBadge({ map, status }: { map: Record<string, { th: string; cls: string }>; status: string }) {
  const s = map[status] ?? { th: status, cls: "bg-white/12 border-white/20 text-white/70" };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 ${s.cls}`}>
      {s.th}
    </span>
  );
}

// ─── sub-component: DocRow ───────────────────────────────────────────────────

const FLD      = "focusable w-full glass-card rounded-lg px-3 py-2 text-sm text-white outline-none min-h-[40px] placeholder-white/40";
// FLD_DATE deprecated — use DateField component instead

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
      let yearsVal: number | null = null;
      if (docType === "warranty" && s.w_years) {
        const parsed = Number(s.w_years);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          setErrMsg("ปีรับประกันต้องเป็นตัวเลขที่ถูกต้องและมากกว่า 0");
          setSaving(false);
          return;
        }
        yearsVal = parsed;
      }
      const meta =
        docType === "warranty"
          ? { start_date: s.w_start || null, years: yearsVal }
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
          <DateField
            value={s.doc_date}
            onChange={(iso) => set("doc_date", iso)}
            className={FLD}
            aria-label="วันที่เอกสาร"
          />
        </div>

        {showWarranty && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] block mb-1" style={{ color: "var(--t-low)" }}>วันเริ่มรับประกัน</label>
              <DateField
                value={s.w_start}
                onChange={(iso) => set("w_start", iso)}
                className={FLD}
                aria-label="วันเริ่มรับประกัน"
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

// ─── FinanceSection — section การเงินด้านบน ────────────────────────────────────

function FinanceSection({ jobId, summary }: { jobId: string; summary: DocSummary }) {
  const { vat_rate, quotation, billings, receipts } = summary;

  // logic ว่าใบเสนออนุมัติ/ส่งแล้วไหม (เพื่อแสดงปุ่มวางบิล)
  const quoteSentOrApproved =
    quotation && (quotation.status === "sent" || quotation.status === "approved");

  return (
    <div className="glass-card rounded-xl p-3.5 mb-3">
      {/* header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px]" style={{ color: "var(--t-low)" }}>การเงิน</span>
        {vat_rate === 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-300/25 text-amber-200">
            ไม่คิด VAT
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* ── ใบเสนอราคา ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText size={13} className="text-white/50 shrink-0" />
            <span className="text-[12px]" style={{ color: "var(--t-low)" }}>ใบเสนอราคา</span>
          </div>
          {quotation ? (
            <div className="flex items-center justify-between gap-2 bg-white/6 border border-white/10 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-white tnum">{quotation.code}</span>
                <span className="ml-2 text-[12px] text-white/60 tnum">฿{baht(quotation.net)}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge map={QUOTE_STATUS} status={quotation.status} />
                <a
                  href={`/quotations/${quotation.id}`}
                  className="focusable pressable inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/12 border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[28px]"
                >
                  เปิดใบเสนอ <ExternalLink size={11} />
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-white/40">ยังไม่มีใบเสนอราคา</span>
              <a
                href="/quotation-checklist"
                className="focusable pressable inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/12 border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[32px]"
              >
                <FilePlus size={13} />ทำใบเสนอ
              </a>
            </div>
          )}
        </div>

        {/* ── ใบวางบิล ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileCheck size={13} className="text-white/50 shrink-0" />
            <span className="text-[12px]" style={{ color: "var(--t-low)" }}>ใบวางบิล</span>
          </div>
          {billings.length > 0 ? (
            <div className="space-y-1.5">
              {billings.map((bn) => (
                <div key={bn.id} className="bg-white/6 border border-white/10 rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[13px] font-medium text-white tnum">{bn.code}</span>
                      <span className="ml-2 text-[12px] text-white/60 tnum">฿{baht(bn.total)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge map={BILLING_STATUS} status={bn.status} />
                      <a
                        href={`/billing-notes/${bn.id}`}
                        className="focusable pressable inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/12 border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[28px]"
                      >
                        เปิดบิล <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                  {bn.installmentCount > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-white/12 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400/70 transition-all"
                          style={{ width: `${bn.installmentCount > 0 ? (bn.paidCount / bn.installmentCount) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-white/55 tnum shrink-0">
                        จ่าย {bn.paidCount}/{bn.installmentCount} งวด
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : quoteSentOrApproved ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-white/40">ยังไม่มีใบวางบิล</span>
              <a
                href={`/billing-notes/new?quotation=${quotation!.id}`}
                className="focusable pressable inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/12 border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[32px]"
              >
                <FilePlus size={13} />วางบิล
              </a>
            </div>
          ) : (
            <span className="text-[12px] text-white/35">รอใบเสนอก่อน</span>
          )}
        </div>

        {/* ── ใบเสร็จ ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Banknote size={13} className="text-white/50 shrink-0" />
            <span className="text-[12px]" style={{ color: "var(--t-low)" }}>ใบเสร็จ / ใบกำกับภาษี</span>
          </div>
          {receipts.length > 0 ? (
            <div className="space-y-1.5">
              {receipts.map((rc) => (
                <div
                  key={rc.id}
                  className={`flex items-center justify-between gap-2 bg-white/6 border border-white/10 rounded-xl px-3 py-2.5 ${rc.is_voided ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0">
                    <span className={`text-[13px] font-medium tnum ${rc.is_voided ? "line-through text-white/50" : "text-white"}`}>
                      {rc.code}
                    </span>
                    <span className="ml-2 text-[12px] text-white/60 tnum">฿{baht(rc.net)}</span>
                    {rc.issue_date && (
                      <span className="ml-2 text-[11px] text-white/40">{thDate(rc.issue_date)}</span>
                    )}
                    {rc.is_voided && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-300/25 text-rose-300">
                        ยกเลิก
                      </span>
                    )}
                  </div>
                  <a
                    href={`/receipts/${rc.id}`}
                    className="focusable pressable inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-white/12 border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[28px] shrink-0"
                  >
                    เปิด <ExternalLink size={11} />
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-white/35">ยังไม่มีใบเสร็จ</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DocumentHubPanel (main export) ──────────────────────────────────────────

export function DocumentHubPanel({
  jobId,
  canWrite = true,
}: {
  jobId: string;
  /** @deprecated ไม่ใช้แล้ว — ใช้ข้อมูลจริงจาก doc-summary แทน */
  quoteChecklist?: boolean;
  canWrite?: boolean;
}) {
  const qc = useQueryClient();

  // ── query 1: เอกสารประกอบ (job_documents) ──
  const { data, isLoading } = useQuery({
    queryKey: ["job-documents", jobId],
    queryFn:  () => api.get<DocResponse>(`/job-documents?job_id=${jobId}`).then((r) => r.data),
  });

  // ── query 2: สรุปเอกสารการเงิน ──
  const {
    data: docSummaryData,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useQuery({
    queryKey: ["job-doc-summary", jobId],
    queryFn:  () => api.get<DocSummary>(`/jobs/${jobId}/doc-summary`).then((r) => r.data),
  });

  function onSaved() {
    qc.invalidateQueries({ queryKey: ["job-documents", jobId] });
    qc.invalidateQueries({ queryKey: ["job-doc-summary", jobId] });
  }

  const docs     = data?.documents ?? [];
  const boq      = docs.find((d) => d.doc_type === "boq");
  const contract = docs.find((d) => d.doc_type === "contract");
  const warranty = docs.find((d) => d.doc_type === "warranty");

  return (
    <div>
      {/* ─── กลุ่มการเงิน (ข้อมูลจริงจาก doc-summary) ─── */}
      {summaryLoading ? (
        <div className="glass-card rounded-xl p-3.5 mb-3">
          <div className="text-[11px] mb-2" style={{ color: "var(--t-low)" }}>การเงิน</div>
          <div className="py-3"><Spinner label="กำลังโหลด…" /></div>
        </div>
      ) : summaryError || !docSummaryData ? (
        <div className="glass-card rounded-xl p-3.5 mb-3">
          <div className="text-[11px] mb-1" style={{ color: "var(--t-low)" }}>การเงิน</div>
          <p className="text-[12px] text-rose-200/70">โหลดข้อมูลการเงินไม่สำเร็จ</p>
        </div>
      ) : (
        <FinanceSection jobId={jobId} summary={docSummaryData} />
      )}

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
