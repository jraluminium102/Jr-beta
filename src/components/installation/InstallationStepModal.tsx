"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { INST_STATUS } from "@/lib/constants";
import { thDate } from "@/lib/format";
import { Chip } from "@/components/ui/primitives";
import { X, Check, TriangleAlert, ChevronRight, ShieldCheck } from "@/components/ui/icons";
import DateField from "@/components/ui/DateField";
import type { InstStatus } from "@/lib/database.types";

export type InstRow = {
  id: string;
  status: InstStatus;
  install_scheduled: string | null;
  install_actual: string | null;
  completed_date: string | null;
  warranty_until: string | null;
  job: { job_code: string; customer_name: string; customer_area: string | null } | null;
};

type StepField = { field: string; label: string; type?: "date" | "note"; optional?: boolean };
type Tone = "go" | "warn" | "wait";
type Action = {
  to: InstStatus;
  label: string;
  hint?: string;
  tone: Tone;
  fields?: StepField[];
};

// ── State machine ติดตั้ง ────────────────────────────────────────────────────
const TRANSITIONS: Record<InstStatus, Action[]> = {
  PENDING: [
    {
      to: "INSTALLING",
      label: "เริ่มติดตั้ง",
      hint: "บันทึกวันที่ลงมือติดตั้งจริง",
      tone: "go",
      fields: [{ field: "install_actual", label: "วันติดตั้งจริง" }],
    },
  ],
  INSTALLING: [
    {
      to: "PENDING_INSPECT",
      label: "ติดตั้งเสร็จ — รอลูกค้าตรวจ",
      hint: "ส่งงานให้ลูกค้าตรวจรับ",
      tone: "go",
    },
  ],
  PENDING_INSPECT: [
    {
      to: "COMPLETED",
      label: "ลูกค้าตรวจผ่าน — จบงาน",
      hint: "ระบบจะคำนวณรับประกัน 12 เดือนอัตโนมัติ",
      tone: "go",
      fields: [{ field: "completed_date", label: "วันจบงาน (ลูกค้าตรวจผ่าน)" }],
    },
    {
      to: "REVISING",
      label: "ลูกค้าให้แก้งาน",
      hint: "กลับไปแก้แล้วส่งลูกค้าตรวจใหม่",
      tone: "warn",
    },
  ],
  REVISING: [
    {
      to: "PENDING_INSPECT",
      label: "แก้งานเสร็จแล้ว — ส่งลูกค้าตรวจอีกครั้ง",
      tone: "go",
    },
  ],
  COMPLETED: [],
  ISSUE: [
    {
      to: "INSTALLING",
      label: "เคลียร์ปัญหาแล้ว — กลับไปติดตั้งต่อ",
      tone: "go",
    },
  ],
};

const today = () => new Date().toISOString().slice(0, 10);

const TONE_BTN: Record<Tone, string> = {
  go: "bg-emerald-500 hover:bg-emerald-400 border-emerald-400 text-white",
  warn: "bg-amber-500 hover:bg-amber-400 border-amber-400 text-white",
  wait: "glass-card border-white/15 text-white hover:border-sky-300/50",
};

export function InstallationStepModal({
  inst,
  canWrite,
  onClose,
  onSaved,
}: {
  inst: InstRow;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [problemOpen, setProblemOpen] = useState(false);
  const [problem, setProblem] = useState("");

  const [armed, setArmed] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});

  const actions = TRANSITIONS[inst.status] ?? [];

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const patch = async (body: Record<string, unknown>) => {
    setErr(null);
    setSaving(true);
    try {
      await api.patch(`/installation/${inst.id}`, body);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const clickAction = (a: Action) => {
    if (!a.fields || a.fields.length === 0) {
      patch({ status: a.to });
      return;
    }
    if (armed === a.to) {
      setArmed(null);
      return;
    }
    const init: Record<string, string> = {};
    a.fields.forEach((f) => {
      if (!f.type || f.type === "date") init[f.field] = today();
    });
    setVals(init);
    setArmed(a.to);
    setErr(null);
  };

  const confirmAction = (a: Action) => {
    for (const f of a.fields ?? []) {
      if (!f.optional && !vals[f.field]) {
        setErr(`กรุณากรอก "${f.label}"`);
        return;
      }
    }
    const body: Record<string, unknown> = { status: a.to };
    (a.fields ?? []).forEach((f) => {
      if (vals[f.field]) body[f.field] = vals[f.field];
    });
    patch(body);
  };

  const reportProblem = () => {
    if (!problem.trim()) {
      setErr("กรุณาพิมพ์ปัญหาที่เจอ");
      return;
    }
    patch({ status: "ISSUE", remark: problem });
  };

  const big = "min-h-[54px] rounded-2xl text-base font-semibold";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`อัปเดตงานติดตั้ง ${inst.job?.job_code}`}
    >
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 fade-in max-h-[92dvh] overflow-y-auto">
        {/* header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-white font-bold text-xl tnum">{inst.job?.job_code}</div>
            <div className="text-sm truncate" style={{ color: "var(--t-mid)" }}>
              {inst.job?.customer_name} · {inst.job?.customer_area ?? "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10 shrink-0"
          >
            <X size={22} />
          </button>
        </div>

        {/* สถานะตอนนี้ */}
        <div className="text-center py-2">
          <div className="text-[13px] mb-1.5" style={{ color: "var(--t-low)" }}>
            ตอนนี้อยู่ขั้น
          </div>
          <div className="inline-block scale-125">
            <Chip>{INST_STATUS[inst.status]}</Chip>
          </div>
        </div>

        {!canWrite ? (
          <p className="text-center text-sm mt-4" style={{ color: "var(--t-low)" }}>
            บทบาทนี้ดูได้อย่างเดียว
          </p>
        ) : (
          <>
            {/* ปุ่มเลือกเส้นทาง */}
            {inst.status === "COMPLETED" ? (
              <div className="mt-4 bg-emerald-500/15 border border-emerald-300/30 rounded-2xl p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-emerald-200 font-semibold">
                  <ShieldCheck size={18} /> งานจบสมบูรณ์แล้ว
                </div>
                {inst.warranty_until && (
                  <div className="text-[12px] mt-1" style={{ color: "var(--t-mid)" }}>
                    รับประกันถึง {thDate(inst.warranty_until)}
                  </div>
                )}
              </div>
            ) : actions.length > 0 ? (
              <div className="mt-4 space-y-2.5">
                {actions.map((a) => (
                  <div key={a.to + a.label}>
                    <button
                      onClick={() => clickAction(a)}
                      disabled={saving}
                      className={`focusable pressable w-full ${big} border flex items-center justify-between gap-2 px-4 disabled:opacity-60 ${TONE_BTN[a.tone]}`}
                    >
                      <span className="text-left leading-tight">
                        {a.label}
                        {a.hint && (
                          <span className="block text-[11px] font-normal opacity-80 mt-0.5">
                            {a.hint}
                          </span>
                        )}
                      </span>
                      {a.fields?.length ? (
                        <ChevronRight
                          size={18}
                          className={`shrink-0 transition-transform ${armed === a.to ? "rotate-90" : ""}`}
                        />
                      ) : (
                        <Check size={18} className="shrink-0" />
                      )}
                    </button>

                    {/* ฟอร์มของ action ที่กางอยู่ */}
                    {armed === a.to && a.fields?.length ? (
                      <div className="mt-2 glass-card rounded-2xl p-4 space-y-3 border border-white/10">
                        {a.fields.map((f) => (
                          <div key={f.field}>
                            <label className="block text-[13px] mb-1.5 font-medium text-white">
                              {f.label}
                            </label>
                            {f.type === "note" ? (
                              <textarea
                                value={vals[f.field] ?? ""}
                                onChange={(e) =>
                                  setVals((v) => ({ ...v, [f.field]: e.target.value }))
                                }
                                rows={2}
                                placeholder="ระบุหมายเหตุ (ถ้ามี)"
                                aria-label={f.label}
                                className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none resize-none placeholder-white/40"
                              />
                            ) : (
                              <DateField
                                value={vals[f.field] ?? ""}
                                onChange={(iso) =>
                                  setVals((v) => ({ ...v, [f.field]: iso }))
                                }
                                aria-label={f.label}
                                className="focusable w-full glass-card rounded-xl px-4 py-3 text-base text-white outline-none min-h-[52px]"
                              />
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => confirmAction(a)}
                          disabled={saving}
                          className={`focusable pressable w-full ${big} ${TONE_BTN[a.tone]} border shadow-lg disabled:opacity-60 flex items-center justify-center gap-2`}
                        >
                          {saving ? (
                            <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          ) : (
                            <Check size={22} />
                          )}
                          ยืนยัน → {INST_STATUS[a.to]}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {/* แจ้งปัญหา (ยกเว้น COMPLETED) */}
            {inst.status !== "COMPLETED" &&
              inst.status !== "ISSUE" &&
              (!problemOpen ? (
                <button
                  onClick={() => setProblemOpen(true)}
                  className="focusable pressable w-full mt-3 min-h-[48px] rounded-2xl border border-amber-300/30 bg-amber-500/12 text-amber-100 font-medium flex items-center justify-center gap-2"
                >
                  <TriangleAlert size={18} /> งานนี้มีปัญหา
                </button>
              ) : (
                <div className="mt-3 glass-card rounded-2xl p-4 border border-amber-300/25">
                  <label className="block text-[13px] mb-1.5 font-medium text-amber-100">
                    เจอปัญหาอะไร?
                  </label>
                  <textarea
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    rows={2}
                    placeholder="เช่น กระจกแตก รออะไหล่ ลูกค้าเลื่อนนัด"
                    className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none resize-none placeholder-white/40"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setProblemOpen(false)}
                      className="focusable pressable flex-1 glass-card text-white rounded-xl py-2.5 text-sm min-h-[44px]"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={reportProblem}
                      disabled={saving}
                      className="focusable pressable flex-1 bg-amber-500 hover:bg-amber-400 text-white rounded-xl py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-60"
                    >
                      ส่งแจ้งปัญหา
                    </button>
                  </div>
                </div>
              ))}

            {/* ประวัติ */}
            {(inst.install_scheduled ||
              inst.install_actual ||
              inst.completed_date ||
              inst.warranty_until) && (
              <div className="mt-4 text-[12px] space-y-1" style={{ color: "var(--t-low)" }}>
                {inst.install_scheduled && (
                  <div>
                    นัดติดตั้ง:{" "}
                    <span className="tnum text-white/80">{thDate(inst.install_scheduled)}</span>
                  </div>
                )}
                {inst.install_actual && (
                  <div>
                    ติดตั้งจริง:{" "}
                    <span className="tnum text-white/80">{thDate(inst.install_actual)}</span>
                  </div>
                )}
                {inst.completed_date && (
                  <div>
                    วันจบงาน:{" "}
                    <span className="tnum text-white/80">{thDate(inst.completed_date)}</span>
                  </div>
                )}
                {inst.warranty_until && (
                  <div className="flex items-center gap-1 text-emerald-300">
                    <ShieldCheck size={12} />
                    รับประกันถึง:{" "}
                    <span className="tnum">{thDate(inst.warranty_until)}</span>
                  </div>
                )}
              </div>
            )}

            {err && (
              <p
                role="alert"
                className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2"
              >
                {err}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
