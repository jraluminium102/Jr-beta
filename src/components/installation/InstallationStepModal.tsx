"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { INST_STATUS } from "@/lib/constants";
import { thDate } from "@/lib/format";
import { Chip } from "@/components/ui/primitives";
import { X, Check, TriangleAlert, ChevronRight, ShieldCheck } from "@/components/ui/icons";
import DateField from "@/components/ui/DateField";
import type { InstStatus } from "@/lib/database.types";

export type InstRow = {
  id: string;
  job_id?: string | null;   // ใช้ดึงชุดผลิต (production_sets) มาติ๊ก "ติดตั้งชุดนี้แล้ว" (0131)
  status: InstStatus;
  install_scheduled: string | null;
  install_actual: string | null;
  completed_date: string | null;
  warranty_until: string | null;
  job: { job_code: string; customer_name: string; customer_area: string | null } | null;
};

// ชุดงานผลิต (subset ที่การ์ดนี้ต้องใช้ — ผลิต/ติดตั้งแยกชุด + hold · 0131)
type ProdSet = {
  id: number; set_label: string;
  install_status?: string | null; hold?: boolean | null; hold_reason?: string | null;
};

// เช็คลิสต์ "ติดตั้งชุดนี้แล้ว" รายชุด — แสดงเฉพาะงานที่มี worksheet (production_sets) แล้ว
function InstallSetsChecklist({ jobId, canWrite, onBlockChange }: {
  jobId: string; canWrite: boolean;
  onBlockChange: (reason: string | null) => void;
}) {
  const qc = useQueryClient();
  const key = ["production-sets", jobId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<ProdSet[]>(`/production-sets?job_id=${jobId}`) });
  const sets = data?.data ?? [];
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (sets.length === 0) { onBlockChange(null); return; }
    const holdCount = sets.filter((s) => s.hold).length;
    const activeNotInstalled = sets.filter((s) => !s.hold && s.install_status !== "INSTALLED").length;
    if (activeNotInstalled > 0) onBlockChange(`ยังติดตั้งไม่ครบ — เหลือ ${activeNotInstalled} ชุดที่ยังไม่ติดตั้ง`);
    else if (holdCount > 0) onBlockChange(`มี ${holdCount} ชุดที่ hold ค้างอยู่ — ปลด hold ก่อนจึงจะปิดงานได้`);
    else onBlockChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, sets.length, sets.map((s) => `${s.id}:${s.install_status}:${s.hold}`).join(",")]);

  if (isLoading || sets.length === 0) return null;

  const toggle = async (s: ProdSet) => {
    if (!canWrite) return;
    const next = s.install_status === "INSTALLED" ? "PENDING" : "INSTALLED";
    setBusyId(s.id);
    try {
      await api.patch(`/production-sets/${s.id}/install-status`, { install_status: next });
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 glass-card rounded-2xl p-4 border border-white/10">
      <div className="text-[13px] font-semibold text-white mb-2">ชุดงาน — ติ๊กที่ติดตั้งแล้ว</div>
      <div className="space-y-1.5">
        {sets.map((s) => {
          const installed = s.install_status === "INSTALLED";
          return (
            <div key={s.id} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border ${installed ? "bg-emerald-500/10 border-emerald-300/25" : "bg-white/5 border-white/10"}`}>
              <div className="min-w-0">
                <div className={`text-[13px] font-medium truncate ${installed ? "text-emerald-200" : "text-white/85"}`}>{s.set_label || "ชุดงาน"}</div>
                {s.hold && (
                  <div className="text-[11px] text-amber-200 truncate">⏸ Hold{s.hold_reason ? `: ${s.hold_reason}` : ""}</div>
                )}
              </div>
              {canWrite ? (
                <button onClick={() => toggle(s)} disabled={busyId === s.id}
                  className={`focusable pressable shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold min-h-[40px] disabled:opacity-50 ${installed ? "bg-emerald-500/20 border border-emerald-300/30 text-emerald-100" : "bg-white/10 border border-white/20 text-white/80"}`}>
                  {busyId === s.id ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : (installed ? <Check size={13} /> : null)}
                  {installed ? "ติดตั้งแล้ว" : "ติดตั้งชุดนี้แล้ว"}
                </button>
              ) : (
                <span className={`shrink-0 text-[12px] ${installed ? "text-emerald-200" : "text-white/50"}`}>{installed ? "ติดตั้งแล้ว" : "ยังไม่ติดตั้ง"}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  // เกตปิดงาน (0131) — ชุดผลิต active ต้องติดตั้งครบ + ห้ามมี hold ค้าง (คำนวณฝั่ง client ให้เห็นทันที · server เช็คซ้ำเสมอ)
  const [installBlock, setInstallBlock] = useState<string | null>(null);

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
    if (a.to === "COMPLETED" && installBlock) {
      setErr(installBlock);
      return;
    }
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

        {/* ชุดงาน — ติ๊กติดตั้งแล้ว (0131) — โชว์เฉพาะงานที่มี worksheet แยกชุด */}
        {inst.job_id && inst.status !== "COMPLETED" && (
          <InstallSetsChecklist jobId={inst.job_id} canWrite={canWrite} onBlockChange={setInstallBlock} />
        )}
        {installBlock && inst.status !== "COMPLETED" && (
          <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-500/12 px-3.5 py-2.5 text-[13px] text-amber-100 flex items-start gap-2">
            <TriangleAlert size={15} className="shrink-0 mt-0.5 text-amber-300" /> {installBlock}
          </div>
        )}

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
