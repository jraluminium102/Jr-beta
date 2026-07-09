"use client";
import { useState, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { INST_STATUS } from "@/lib/constants";
import { Spinner } from "@/components/ui/primitives";
import { InstallationStepModal } from "@/components/installation/InstallationStepModal";
import type { InstStatus } from "@/lib/database.types";
import type { InstRow } from "@/components/installation/InstallationStepModal";
import type { InstallTeam, InstallAssignment } from "@/lib/types";

// ── สีทีม (ธีมมืด) ──
const TEAM_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  red: { bg: "rgba(226,75,74,.16)", text: "#fca5a5", border: "rgba(226,75,74,.4)", dot: "#e24b4a" },
  blue: { bg: "rgba(55,138,221,.16)", text: "#93c5fd", border: "rgba(55,138,221,.4)", dot: "#378add" },
  green: { bg: "rgba(99,153,34,.18)", text: "#a7e08a", border: "rgba(99,153,34,.4)", dot: "#639922" },
  amber: { bg: "rgba(239,159,39,.16)", text: "#fcd38a", border: "rgba(239,159,39,.4)", dot: "#ef9f27" },
  purple: { bg: "rgba(127,119,221,.16)", text: "#c4bdf6", border: "rgba(127,119,221,.4)", dot: "#7f77dd" },
  teal: { bg: "rgba(29,158,117,.16)", text: "#7fe0c6", border: "rgba(29,158,117,.4)", dot: "#1d9e75" },
};
const tc = (c: string) => TEAM_COLORS[c] || TEAM_COLORS.red;

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function startOfWeek(d: Date) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); } // จันทร์
const jobName = (j: { customer_name?: string; code?: string; job_code?: string } | undefined) => j?.customer_name || j?.code || j?.job_code || "—";
const jobCode = (j: { code?: string; job_code?: string } | undefined) => j?.code || j?.job_code || "";
const jobArea = (j: { customer_area?: string; address?: string } | undefined) => j?.customer_area || j?.address || "";

type Plan = { teams: InstallTeam[]; assignments: InstallAssignment[]; ready: { id: string; job_id: string; jobs: Record<string, unknown> }[] };

export default function InstallationPage() {
  const [tab, setTab] = useState<"cal" | "tmr" | "status">("cal");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [detail, setDetail] = useState<InstallAssignment | null>(null);
  const [addAt, setAddAt] = useState<{ date: string; team_id: string } | null>(null);
  const [openInst, setOpenInst] = useState<InstRow | null>(null);
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(anchor, i)), [anchor]);
  const from = iso(days[0]); const to = iso(days[5]);
  const tomorrow = iso(addDays(new Date(), 1));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["install-plan", from, to],
    queryFn: () => api.get<Plan>(`/install-plan?from=${from}&to=${to}`),
  });
  const plan = data?.data;
  const teams = plan?.teams ?? [];
  const asg = plan?.assignments ?? [];
  const ready = plan?.ready ?? [];
  const canWrite = (data?.meta?.can_install as boolean) ?? true;

  // สถานะบอร์ด (แท็บสถานะ)
  const { data: jobsData, refetch: refetchJobs } = useQuery({
    queryKey: ["jobs", "inst"], enabled: tab === "status",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api.get<any[]>("/jobs?limit=500"),
  });

  const cellAsg = (teamId: string, d: string) => asg.filter((a) => a.team_id === teamId && a.date === d);
  const tmrAsg = asg.filter((a) => a.date === tomorrow);

  async function saveAssign(body: Record<string, unknown>) {
    setBusy(true);
    try { await api.post("/install-assignments", body); await refetch(); setAddAt(null); }
    finally { setBusy(false); }
  }
  async function patchAssign(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try { const r = await api.patch<InstallAssignment>(`/install-assignments/${id}`, body); setDetail(r.data); await refetch(); }
    finally { setBusy(false); }
  }
  async function delAssign(id: string) {
    setBusy(true);
    try { await api.del(`/install-assignments/${id}`); setDetail(null); await refetch(); }
    finally { setBusy(false); }
  }

  function lineText() {
    const dd = addDays(new Date(), 1);
    let t = `📋 แผนติดตั้งพรุ่งนี้ (${DOW[dd.getDay()]} ${dd.getDate()}/${dd.getMonth() + 1})\n`;
    for (const tm of teams) {
      const items = tmrAsg.filter((a) => a.team_id === tm.id);
      if (!items.length) continue;
      t += `\n▸ ${tm.name}${tm.lead_name ? ` — ${tm.lead_name}` : ""}\n`;
      for (const a of items) {
        t += `  • ${jobName(a.jobs)}${a.day_no ? ` (วันที่ ${a.day_no}/${a.day_total || "?"})` : ""}${jobArea(a.jobs) ? ` · ${jobArea(a.jobs)}` : ""}${a.crew ? `\n    ช่าง: ${tm.lead_name}${a.crew ? ", " + a.crew : ""}` : ""}${a.note ? `\n    ⚠ ${a.note}` : ""}\n`;
      }
    }
    if (!tmrAsg.length) t += "\n— ยังไม่มีงานลงพรุ่งนี้ —\n";
    return t;
  }
  function copyLine() { navigator.clipboard?.writeText(lineText()); }

  const weekLabel = `${days[0].getDate()}/${days[0].getMonth() + 1} – ${days[5].getDate()}/${days[5].getMonth() + 1}`;

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">แผนติดตั้ง</h1>
          <p className="text-sm" style={{ color: "var(--t-low)" }}>วางคิวช่างแบบปฏิทิน · ดูงานพร้อมติดตั้ง · ส่งแผนให้ช่าง</p>
        </div>
        <div className="flex gap-1.5">
          {([["cal", "ปฏิทินสัปดาห์"], ["tmr", "พรุ่งนี้"], ["status", "สถานะงาน"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border ${tab === k ? "bg-white/16 text-white border-white/20" : "bg-white/6 text-white/70 border-white/10"}`}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "cal" && (
        <>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setAnchor(addDays(anchor, -7))} className="px-3 py-1.5 rounded-lg bg-white/8 text-white text-sm">‹</button>
              <span className="text-white text-sm font-medium tnum">{weekLabel}</span>
              <button onClick={() => setAnchor(addDays(anchor, 7))} className="px-3 py-1.5 rounded-lg bg-white/8 text-white text-sm">›</button>
              <button onClick={() => setAnchor(startOfWeek(new Date()))} className="px-3 py-1.5 rounded-lg bg-white/8 text-white/70 text-xs">สัปดาห์นี้</button>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-3 mb-3">
            <div className="text-xs mb-2" style={{ color: "var(--t-low)" }}>พร้อมติดตั้ง (ผลิตเสร็จ รอจัดคิว) · {ready.length} งาน — แตะเพื่อจัดลงทีม</div>
            <div className="flex gap-2 flex-wrap">
              {ready.map((r) => (
                <button key={r.id} disabled={!canWrite}
                  onClick={() => setAddAt({ date: from, team_id: teams[0]?.id || "" })}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white/9 border border-white/12 text-white disabled:opacity-50">
                  {jobName(r.jobs)}{jobArea(r.jobs) ? ` · ${jobArea(r.jobs)}` : ""}
                </button>
              ))}
              {ready.length === 0 && <span className="text-xs" style={{ color: "var(--t-low)" }}>— ไม่มีงานรอจัดคิว —</span>}
            </div>
          </div>

          {isLoading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: 720 }}>
                <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: "88px repeat(6,1fr)" }}>
                  <div className="text-xs" style={{ color: "var(--t-low)" }}>ทีม \ วัน</div>
                  {days.map((d) => (
                    <div key={iso(d)} className={`text-center text-xs py-1 rounded-lg ${iso(d) === iso(new Date()) ? "bg-white/12 text-white" : ""}`} style={{ color: iso(d) === iso(new Date()) ? undefined : "var(--t-mid)" }}>
                      {DOW[d.getDay()]} {d.getDate()}
                    </div>
                  ))}
                </div>
                {teams.map((tm) => {
                  const col = tc(tm.color);
                  return (
                    <div key={tm.id} className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: "88px repeat(6,1fr)" }}>
                      <div className="flex flex-col justify-center px-1 py-1.5 leading-tight">
                        <span className="text-white text-sm flex items-center gap-1.5"><span style={{ width: 8, height: 8, borderRadius: 9, background: col.dot, display: "inline-block" }} />{tm.name}</span>
                        <span className="text-[11px]" style={{ color: "var(--t-low)" }}>{tm.lead_name || "—"}</span>
                      </div>
                      {days.map((d) => {
                        const items = cellAsg(tm.id, iso(d));
                        return (
                          <div key={iso(d)} className="rounded-lg bg-white/5 p-1 space-y-1" style={{ minHeight: 46 }}>
                            {items.map((a) => (
                              <button key={a.id} onClick={() => setDetail(a)}
                                className="w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded-md"
                                style={{ background: col.bg, color: col.text, border: `0.5px solid ${a.note ? "var(--warn,#ef9f27)" : col.border}`, outline: a.note ? "1.5px solid rgba(239,159,39,.5)" : "none" }}>
                                {jobName(a.jobs)}{a.day_no ? ` ${a.day_no}/${a.day_total || "?"}` : ""}{a.note ? " ⚠" : ""}
                              </button>
                            ))}
                            {canWrite && (
                              <button onClick={() => setAddAt({ date: iso(d), team_id: tm.id })}
                                className="w-full text-[11px] text-white/25 hover:text-white/60 rounded-md py-0.5">+</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {teams.length === 0 && <div className="text-sm text-center py-6" style={{ color: "var(--t-low)" }}>ยังไม่มีทีม — รัน migration 0086 (seed ทีม A/B/C)</div>}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "tmr" && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <span className="text-white text-sm">แผนพรุ่งนี้ · {(() => { const d = addDays(new Date(), 1); return `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; })()}</span>
            <div className="flex gap-2">
              <button onClick={copyLine} className="px-3 py-2 rounded-xl bg-white/12 text-white text-sm">คัดลอกส่ง LINE</button>
              <button onClick={() => window.print()} className="px-3 py-2 rounded-xl bg-white/8 text-white/80 text-sm">ปริ้น A4</button>
            </div>
          </div>
          <div id="tmr-print" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            {teams.map((tm) => {
              const items = tmrAsg.filter((a) => a.team_id === tm.id);
              const col = tc(tm.color);
              return (
                <div key={tm.id} className="glass-card rounded-2xl p-3">
                  <div className="text-white text-sm font-medium flex items-center gap-1.5 mb-1"><span style={{ width: 8, height: 8, borderRadius: 9, background: col.dot, display: "inline-block" }} />{tm.name} — {tm.lead_name || "—"}</div>
                  {items.length === 0 ? <div className="text-xs" style={{ color: "var(--t-low)" }}>— ว่าง —</div> : items.map((a) => (
                    <div key={a.id} className="text-[13px] text-white/90 mt-1.5 border-t border-white/10 pt-1.5">
                      <b>{jobName(a.jobs)}</b>{a.day_no ? ` (วันที่ ${a.day_no}/${a.day_total || "?"})` : ""}
                      {jobArea(a.jobs) && <div className="text-[12px]" style={{ color: "var(--t-low)" }}>{jobArea(a.jobs)}</div>}
                      {a.crew && <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>ช่าง: {tm.lead_name}{a.crew ? ", " + a.crew : ""}</div>}
                      {a.note && <div className="text-[12px] text-amber-300">⚠ {a.note}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "status" && <StatusBoard data={jobsData} onOpen={setOpenInst} refetch={refetchJobs} />}

      {/* เพิ่ม assignment */}
      {addAt && (
        <AddAssignModal ready={ready} teams={teams} initial={addAt} busy={busy}
          onClose={() => setAddAt(null)} onSave={saveAssign} />
      )}

      {/* รายละเอียด assignment */}
      {detail && (
        <DetailDrawer a={detail} teams={teams} busy={busy}
          onClose={() => setDetail(null)} onPatch={patchAssign} onDelete={delAssign} />
      )}

      {openInst && (
        <InstallationStepModal inst={openInst} canWrite={canWrite}
          onClose={() => setOpenInst(null)} onSaved={() => { setOpenInst(null); refetchJobs(); }} />
      )}
    </div>
  );
}

// ── modal เพิ่มการเข้าติดตั้ง ──
function AddAssignModal({ ready, teams, initial, busy, onClose, onSave }: {
  ready: { job_id: string; jobs: Record<string, unknown> }[]; teams: InstallTeam[];
  initial: { date: string; team_id: string }; busy: boolean;
  onClose: () => void; onSave: (b: Record<string, unknown>) => void;
}) {
  const [jobId, setJobId] = useState(ready[0]?.job_id || "");
  const [teamId, setTeamId] = useState(initial.team_id);
  const [date, setDate] = useState(initial.date);
  const [crew, setCrew] = useState("");
  const [dayNo, setDayNo] = useState(""); const [dayTotal, setDayTotal] = useState("");
  return (
    <Modal title="จัดงานลงคิว" onClose={onClose}>
      <label className="lbl">งาน (พร้อมติดตั้ง)</label>
      <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="inp">
        {ready.map((r) => <option key={r.job_id} value={r.job_id}>{jobName(r.jobs)} {jobArea(r.jobs) ? `· ${jobArea(r.jobs)}` : ""}</option>)}
        {ready.length === 0 && <option value="">— ไม่มีงานรอจัดคิว —</option>}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="lbl">ทีม</label>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="inp">
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.lead_name ? ` (${t.lead_name})` : ""}</option>)}
          </select></div>
        <div><label className="lbl">วันที่</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="inp" /></div>
      </div>
      <label className="lbl">ลูกน้องช่าง (พิมพ์ชื่อ คั่นด้วย ,)</label>
      <input value={crew} onChange={(e) => setCrew(e.target.value)} placeholder="เช่น สมพงษ์, ตูน" className="inp" />
      <div className="grid grid-cols-2 gap-2">
        <div><label className="lbl">วันที่เท่าไหร่</label><input type="number" min={1} value={dayNo} onChange={(e) => setDayNo(e.target.value)} placeholder="เช่น 1" className="inp" /></div>
        <div><label className="lbl">ทั้งหมดกี่วัน</label><input type="number" min={1} value={dayTotal} onChange={(e) => setDayTotal(e.target.value)} placeholder="เช่น 3" className="inp" /></div>
      </div>
      <button disabled={busy || !jobId || !teamId} onClick={() => onSave({ job_id: jobId, team_id: teamId, date, crew, day_no: dayNo ? Number(dayNo) : null, day_total: dayTotal ? Number(dayTotal) : null })}
        className="w-full mt-3 py-2.5 rounded-xl bg-white/16 text-white font-medium disabled:opacity-50">จัดลงคิว</button>
    </Modal>
  );
}

// ── drawer รายละเอียด/แก้ ──
function DetailDrawer({ a, teams, busy, onClose, onPatch, onDelete }: {
  a: InstallAssignment; teams: InstallTeam[]; busy: boolean;
  onClose: () => void; onPatch: (id: string, b: Record<string, unknown>) => void; onDelete: (id: string) => void;
}) {
  const [teamId, setTeamId] = useState(a.team_id || "");
  const [date, setDate] = useState(a.date);
  const [crew, setCrew] = useState(a.crew || "");
  const [note, setNote] = useState(a.note || "");
  return (
    <Modal title={jobName(a.jobs)} onClose={onClose}>
      <div className="text-xs mb-2" style={{ color: "var(--t-low)" }}>{jobCode(a.jobs)} {jobArea(a.jobs) ? `· ${jobArea(a.jobs)}` : ""}</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="lbl">ทีม</label>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="inp">
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.lead_name ? ` (${t.lead_name})` : ""}</option>)}
          </select></div>
        <div><label className="lbl">วันที่</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="inp" /></div>
      </div>
      <label className="lbl">ลูกน้องช่าง</label>
      <input value={crew} onChange={(e) => setCrew(e.target.value)} className="inp" placeholder="พิมพ์ชื่อ คั่นด้วย ," />
      <label className="lbl">โน้ต / ปัญหา (ถ้ามี → มีป้ายเตือน ⚠)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="inp" placeholder="เช่น กระจกแตก 1 บาน รอสั่งใหม่" />
      <div className="flex gap-2 mt-3">
        <button disabled={busy} onClick={() => onDelete(a.id)} className="px-3 py-2.5 rounded-xl bg-red-500/20 text-red-200 text-sm">ลบออกจากคิว</button>
        <button disabled={busy} onClick={() => onPatch(a.id, { team_id: teamId || null, date, crew, note })}
          className="flex-1 py-2.5 rounded-xl bg-white/16 text-white font-medium disabled:opacity-50">บันทึก</button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.6)" }} role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl p-4" style={{ background: "#1a1c22", border: "0.5px solid rgba(255,255,255,.14)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="ปิด" className="text-white/60 text-lg px-2">×</button>
        </div>
        {children}
      </div>
      <style>{`.lbl{display:block;font-size:11px;color:var(--t-low);margin:8px 0 3px}.inp{width:100%;background:rgba(255,255,255,.08);border:0.5px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 10px;color:#fff;font-size:14px;outline:none}.inp::placeholder{color:rgba(255,255,255,.35)}`}</style>
    </div>
  );
}

// ── แท็บสถานะงาน (บอร์ดเดิม) ──
const COLS: InstStatus[] = ["PENDING", "INSTALLING", "PENDING_INSPECT", "REVISING", "COMPLETED", "ISSUE"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatusBoard({ data, onOpen, refetch }: { data: any; onOpen: (r: InstRow) => void; refetch: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs = ((data?.data ?? []) as any[]).filter((j) => j.installations?.length && j.status !== "CANCELLED");
  void refetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const open = (j: any) => { const inst = j.installations[0]; if (!inst) return; onOpen({ id: inst.id, status: inst.status, install_scheduled: inst.install_scheduled, install_actual: inst.install_actual, completed_date: inst.completed_date, warranty_until: inst.warranty_until, job: { job_code: j.job_code, customer_name: j.customer_name, customer_area: j.customer_area } }); };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {COLS.map((c) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = jobs.filter((j: any) => j.installations[0]?.status === c);
        return (
          <div key={c} className="glass-card rounded-2xl p-3">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-white text-sm font-semibold">{INST_STATUS[c]}</span>
              <span className="text-[12px] tnum px-1.5 py-0.5 rounded-md bg-white/10" style={{ color: "var(--t-mid)" }}>{items.length}</span>
            </div>
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {items.map((j: any) => (
                <button key={j.id} onClick={() => open(j)} className="focusable pressable w-full text-left bg-white/9 hover:bg-white/16 border border-white/10 rounded-xl p-3">
                  <div className="text-white text-sm font-medium tnum">{j.job_code}</div>
                  <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>{j.customer_name}</div>
                </button>
              ))}
              {items.length === 0 && <div className="text-[12px] text-center py-4" style={{ color: "rgba(255,255,255,0.35)" }}>—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
