"use client";
import { useState, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { INST_STATUS } from "@/lib/constants";
import { Spinner } from "@/components/ui/primitives";
import { InstallationStepModal } from "@/components/installation/InstallationStepModal";
import CrewDayTeamsPanel from "@/components/installation/CrewDayTeamsPanel";
import Icon from "@/components/Icon";
import type { InstStatus } from "@/lib/database.types";
import type { InstRow } from "@/components/installation/InstallationStepModal";
import type { InstallAssignment } from "@/lib/types";

// ── หน้าติดตั้ง v2 (0089): ปฏิทินทั้งเดือน · ไม่มีทีม A/B/C — การ์ด = ลูกค้า+หัวหน้าช่าง (พิมพ์อิสระ)
//    สีการ์ดอัตโนมัติ: หัวหน้าคนเดียวกัน = สีเดียวกัน · กดการ์ดดู ลูกน้อง/หมายเหตุ/แก้ไข ──
const LEAD_COLORS = [
  { bg: "rgba(29,158,117,.16)", text: "#7fe0c6", border: "rgba(29,158,117,.4)", dot: "#1d9e75" },
  { bg: "rgba(127,119,221,.16)", text: "#c4bdf6", border: "rgba(127,119,221,.4)", dot: "#7f77dd" },
  { bg: "rgba(216,90,48,.16)", text: "#f0997b", border: "rgba(216,90,48,.4)", dot: "#d85a30" },
  { bg: "rgba(55,138,221,.16)", text: "#93c5fd", border: "rgba(55,138,221,.4)", dot: "#378add" },
  { bg: "rgba(212,83,126,.16)", text: "#ed93b1", border: "rgba(212,83,126,.4)", dot: "#d4537e" },
  { bg: "rgba(239,159,39,.16)", text: "#fcd38a", border: "rgba(239,159,39,.4)", dot: "#ef9f27" },
  { bg: "rgba(99,153,34,.18)", text: "#a7e08a", border: "rgba(99,153,34,.4)", dot: "#639922" },
  { bg: "rgba(226,75,74,.16)", text: "#fca5a5", border: "rgba(226,75,74,.4)", dot: "#e24b4a" },
];
const GRAY = { bg: "rgba(255,255,255,.08)", text: "rgba(255,255,255,.65)", border: "rgba(255,255,255,.18)", dot: "#888780" };
function leadColor(lead: string) {
  const s = (lead || "").trim();
  if (!s) return GRAY;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return LEAD_COLORS[h % LEAD_COLORS.length];
}

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function startOfWeek(d: Date) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); } // จันทร์
const jobName = (j: { customer_name?: string; code?: string; job_code?: string } | undefined) => j?.customer_name || j?.code || j?.job_code || "—";
const jobCode = (j: { code?: string; job_code?: string } | undefined) => j?.code || j?.job_code || "";
const jobArea = (j: { customer_area?: string; address?: string } | undefined) => j?.customer_area || j?.address || "";
const leadOf = (a: InstallAssignment) => (a.lead_name || "").trim();

type Plan = { assignments: InstallAssignment[]; ready: { id: string; job_id: string; jobs: Record<string, unknown> }[] };

export default function InstallationPage() {
  const [tab, setTab] = useState<"cal" | "crew" | "tmr" | "status">("cal");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [detail, setDetail] = useState<InstallAssignment | null>(null);
  const [addAt, setAddAt] = useState<{ date: string; job_id?: string } | null>(null);
  const [openInst, setOpenInst] = useState<InstRow | null>(null);
  const [busy, setBusy] = useState(false);
  // จัดทีมช่างรายวัน (แท็บใหม่) — วันที่ที่กำลังดู/แก้ไข เชื่อมกับปฏิทินเดือนผ่าน badge ในช่องวัน
  const [crewDate, setCrewDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });

  // ตารางเดือน: เริ่มจันทร์ก่อน/ในวันที่ 1 → ครบสัปดาห์สุดท้ายของเดือน
  const gridStart = useMemo(() => startOfWeek(month), [month]);
  const gridDays = useMemo(() => {
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const n = Math.ceil((Math.round((last.getTime() - gridStart.getTime()) / 86400000) + 1) / 7) * 7;
    return Array.from({ length: n }, (_, i) => addDays(gridStart, i));
  }, [gridStart, month]);
  const from = iso(gridDays[0]); const to = iso(gridDays[gridDays.length - 1]);
  const today = iso(new Date());
  const tomorrow = iso(addDays(new Date(), 1));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["install-plan", from, to],
    queryFn: () => api.get<Plan>(`/install-plan?from=${from}&to=${to}`),
  });
  const plan = data?.data;
  const asg = useMemo(() => plan?.assignments ?? [], [plan]);
  const ready = plan?.ready ?? [];
  const canWrite = (data?.meta?.can_install as boolean) ?? true;

  // จำนวนทีม + ชื่อลูกค้าที่จัดทีมรายวันไว้ (เดือนที่กำลังดู) — ทำ badge + รายชื่อบนปฏิทิน
  const { data: crewCountsData } = useQuery({
    queryKey: ["crew-day-counts-month", from, to],
    queryFn: () => api.get<{ work_date: string; team_count: number; customers: string[] }[]>(`/crew-day/counts?from=${from}&to=${to}`),
  });
  const crewCountsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of crewCountsData?.data ?? []) m.set(r.work_date, r.team_count);
    return m;
  }, [crewCountsData]);
  // ชื่อลูกค้าจาก "จัดทีมรายวัน" ต่อวัน — โชว์บนปฏิทินด้วย ไม่งั้นลูกค้าที่เพิ่มในรายวันจะไม่โผล่เลย
  const crewCustsByDate = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of crewCountsData?.data ?? []) m.set(r.work_date, r.customers ?? []);
    return m;
  }, [crewCountsData]);
  function jumpToCrewDay(ds: string) { setCrewDate(ds); setTab("crew"); }

  const byDate = useMemo(() => {
    const m = new Map<string, InstallAssignment[]>();
    for (const a of asg) { const l = m.get(a.date) || []; l.push(a); m.set(a.date, l); }
    return m;
  }, [asg]);
  // รายชื่อหัวหน้าช่างที่เคยพิมพ์ (autocomplete)
  const leadNames = useMemo(() => [...new Set(asg.map(leadOf).filter(Boolean))].sort(), [asg]);
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

  // ── ข้อความส่ง LINE (พรุ่งนี้ · จัดกลุ่มตามหัวหน้าช่าง) ──
  function lineText() {
    const dd = addDays(new Date(), 1);
    let t = `📋 แผนติดตั้งพรุ่งนี้ (${DOW[dd.getDay()]} ${dd.getDate()}/${dd.getMonth() + 1})\n`;
    const leads = [...new Set(tmrAsg.map(leadOf))];
    for (const ld of leads) {
      const items = tmrAsg.filter((a) => leadOf(a) === ld);
      t += `\n▸ ${ld || "— ยังไม่จัดช่าง —"}\n`;
      for (const a of items) {
        t += `  • ${jobName(a.jobs)}${a.day_no ? ` (วันที่ ${a.day_no}/${a.day_total || "?"})` : ""}${jobArea(a.jobs) ? ` · ${jobArea(a.jobs)}` : ""}`;
        if (a.crew) t += `\n    ลูกน้อง: ${a.crew}`;
        if (a.note) t += `\n    ⚠ ${a.note}`;
        t += "\n";
      }
    }
    if (!tmrAsg.length) t += "\n— ยังไม่มีงานลงพรุ่งนี้ —\n";
    return t;
  }
  function copyLine() { navigator.clipboard?.writeText(lineText()); }

  // สถานะบอร์ด (แท็บสถานะ)
  const { data: jobsData, refetch: refetchJobs } = useQuery({
    queryKey: ["jobs", "inst"], enabled: tab === "status",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => api.get<any[]>("/jobs?limit=500"),
  });

  const monthLabel = `${TH_MONTH[month.getMonth()]} ${month.getFullYear() + 543}`;
  const shiftMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">แผนติดตั้ง</h1>
          <p className="text-sm" style={{ color: "var(--t-low)" }}>ปฏิทินทั้งเดือน · การ์ด = ลูกค้า + หัวหน้าช่าง · กดการ์ดดูลูกน้อง/หมายเหตุ</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {([["cal", "ปฏิทินเดือน"], ["crew", "จัดทีมรายวัน"], ["tmr", "พรุ่งนี้"], ["status", "สถานะงาน"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border ${tab === k ? "bg-white/16 text-white border-white/20" : "bg-white/6 text-white/70 border-white/10"}`}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "cal" && (
        <>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={() => shiftMonth(-1)} className="px-3 py-1.5 rounded-lg bg-white/8 text-white text-sm">‹</button>
              <span className="text-white text-sm font-medium" style={{ minWidth: 130, textAlign: "center" }}>{monthLabel}</span>
              <button onClick={() => shiftMonth(1)} className="px-3 py-1.5 rounded-lg bg-white/8 text-white text-sm">›</button>
              <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="px-3 py-1.5 rounded-lg bg-white/8 text-white/70 text-xs">เดือนนี้</button>
            </div>
            {canWrite && (
              <button onClick={() => setAddAt({ date: today })} className="px-3.5 py-2 rounded-xl bg-white/16 text-white text-sm font-medium">+ ลงคิวติดตั้ง</button>
            )}
          </div>

          {/* งานพร้อมติดตั้ง รอจัดคิว */}
          <div className="glass-card rounded-2xl p-3 mb-3">
            <div className="text-xs mb-2" style={{ color: "var(--t-low)" }}>พร้อมติดตั้ง (ผลิตเสร็จ รอจัดคิว) · {ready.length} งาน — แตะเพื่อลงคิว</div>
            <div className="flex gap-2 flex-wrap">
              {ready.map((r) => (
                <button key={r.id} disabled={!canWrite}
                  onClick={() => setAddAt({ date: today, job_id: r.job_id })}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white/9 border border-white/12 text-white disabled:opacity-50">
                  {jobName(r.jobs)}{jobArea(r.jobs) ? ` · ${jobArea(r.jobs)}` : ""}
                </button>
              ))}
              {ready.length === 0 && <span className="text-xs" style={{ color: "var(--t-low)" }}>— ไม่มีงานรอจัดคิว —</span>}
            </div>
          </div>

          {isLoading ? <Spinner /> : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: 640 }}>
                <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: "repeat(7,1fr)" }}>
                  {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((d, i) => (
                    <div key={d} className="text-center text-[11px] py-0.5" style={{ color: i === 6 ? "#fca5a5" : "var(--t-low)" }}>{d}</div>
                  ))}
                </div>
                <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7,1fr)" }}>
                  {gridDays.map((d) => {
                    const ds = iso(d);
                    const inMonth = d.getMonth() === month.getMonth();
                    const isToday = ds === today;
                    const items = byDate.get(ds) || [];
                    const crewCount = crewCountsByDate.get(ds) ?? 0;
                    // ลูกค้าจากจัดทีมรายวัน ที่ยังไม่ได้โชว์อยู่ในแผนปฏิทิน (กันชื่อซ้ำ 2 บรรทัด)
                    const planNames = new Set(items.map((a) => jobName(a.jobs).trim()));
                    const crewOnly = (crewCustsByDate.get(ds) ?? []).filter((n) => !planNames.has(n.trim()));
                    return (
                      <div key={ds}
                        className="rounded-lg p-1 flex flex-col"
                        style={{
                          minHeight: 76,
                          background: isToday ? "rgba(55,138,221,.12)" : inMonth ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.02)",
                          border: isToday ? "1px solid rgba(55,138,221,.5)" : "1px solid rgba(255,255,255,.06)",
                          opacity: inMonth ? 1 : 0.45,
                        }}>
                        <div className="flex items-center justify-between gap-1">
                          <div className="text-[10px] pl-0.5" style={{ color: isToday ? "#93c5fd" : "var(--t-low)", fontWeight: isToday ? 600 : 400 }}>{d.getDate()}</div>
                          {inMonth && (
                            <button onClick={() => jumpToCrewDay(ds)}
                              className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded leading-none focusable"
                              style={crewCount ? { background: "rgba(255,255,255,.16)", color: "#fff" } : { color: "rgba(255,255,255,.25)" }}
                              title={crewCount ? `จัดทีมช่างแล้ว ${crewCount} ทีม — ดู/แก้ไข` : "ยังไม่จัดทีมช่างวันนี้ — กดเพื่อจัด"}>
                              <Icon name="users" size={8} />{crewCount || ""}
                            </button>
                          )}
                        </div>
                        <div className="space-y-0.5 flex-1">
                          {items.map((a) => {
                            const c = leadColor(leadOf(a));
                            return (
                              <button key={a.id} onClick={() => setDetail(a)}
                                className="w-full text-left rounded-md px-1 py-0.5 leading-tight"
                                style={{ background: c.bg, border: `0.5px solid ${a.note ? "rgba(239,159,39,.6)" : c.border}` }}>
                                <div className="text-[10.5px] font-medium truncate" style={{ color: "#fff" }}>{jobName(a.jobs)}{a.note ? " ⚠" : ""}</div>
                                <div className="text-[9.5px] truncate" style={{ color: c.text }}>
                                  {leadOf(a) || "— ยังไม่จัดช่าง"}{a.day_no && a.day_total ? ` · วัน ${a.day_no}/${a.day_total}` : ""}
                                </div>
                              </button>
                            );
                          })}
                          {/* ลูกค้าที่มีเฉพาะใน "จัดทีมรายวัน" — เส้นประ = ยังไม่มีในแผนปฏิทิน (คนละที่มา ต้องแยกให้เห็น)
                              กดแล้วเด้งไปแท็บรายวันของวันนั้น */}
                          {crewOnly.map((n) => (
                            <button key={n} onClick={() => jumpToCrewDay(ds)}
                              className="w-full text-left rounded-md px-1 py-0.5 leading-tight"
                              style={{ background: "rgba(255,255,255,.05)", border: "0.5px dashed rgba(255,255,255,.28)" }}
                              title={`${n} — จัดทีมช่างไว้ในแผนรายวัน (ยังไม่มีในแผนเดือน)`}>
                              <div className="text-[10.5px] truncate" style={{ color: "rgba(255,255,255,.82)" }}>{n}</div>
                              <div className="text-[9.5px] truncate" style={{ color: "var(--t-low)" }}>ทีมรายวัน</div>
                            </button>
                          ))}
                        </div>
                        {canWrite && inMonth && (
                          <button onClick={() => setAddAt({ date: ds })}
                            className="w-full text-[11px] text-white/20 hover:text-white/60 rounded-md leading-4">+</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* legend หัวหน้าช่างในเดือนนี้ */}
                {leadNames.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2.5">
                    {leadNames.map((ld) => {
                      const c = leadColor(ld);
                      return (
                        <span key={ld} className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1.5"
                          style={{ background: c.bg, color: c.text, border: `0.5px solid ${c.border}` }}>
                          <span style={{ width: 7, height: 7, borderRadius: 9, background: c.dot, display: "inline-block" }} />{ld}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "crew" && (
        <CrewDayTeamsPanel date={crewDate} onDateChange={setCrewDate} canWrite={canWrite} />
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
            {[...new Set(tmrAsg.map(leadOf))].map((ld) => {
              const items = tmrAsg.filter((a) => leadOf(a) === ld);
              const c = leadColor(ld);
              return (
                <div key={ld || "-"} className="glass-card rounded-2xl p-3">
                  <div className="text-white text-sm font-medium flex items-center gap-1.5 mb-1">
                    <span style={{ width: 8, height: 8, borderRadius: 9, background: c.dot, display: "inline-block" }} />
                    {ld || "— ยังไม่จัดช่าง —"}
                  </div>
                  {items.map((a) => (
                    <div key={a.id} className="text-[13px] text-white/90 mt-1.5 border-t border-white/10 pt-1.5">
                      <b>{jobName(a.jobs)}</b>{a.day_no ? ` (วันที่ ${a.day_no}/${a.day_total || "?"})` : ""}
                      {jobArea(a.jobs) && <div className="text-[12px]" style={{ color: "var(--t-low)" }}>{jobArea(a.jobs)}</div>}
                      {a.crew && <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>ลูกน้อง: {a.crew}</div>}
                      {a.note && <div className="text-[12px] text-amber-300">⚠ {a.note}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
            {tmrAsg.length === 0 && <div className="text-sm text-center py-8" style={{ color: "var(--t-low)" }}>— ยังไม่มีงานลงพรุ่งนี้ —</div>}
          </div>
        </div>
      )}

      {tab === "status" && <StatusBoard data={jobsData} onOpen={setOpenInst} refetch={refetchJobs} />}

      {addAt && (
        <AddAssignModal ready={ready} initial={addAt} busy={busy} leadNames={leadNames}
          onClose={() => setAddAt(null)} onSave={saveAssign} />
      )}

      {detail && (
        <DetailDrawer a={detail} busy={busy} leadNames={leadNames}
          onClose={() => setDetail(null)} onPatch={patchAssign} onDelete={delAssign} />
      )}

      {openInst && (
        <InstallationStepModal inst={openInst} canWrite={canWrite}
          onClose={() => setOpenInst(null)} onSaved={() => { setOpenInst(null); refetchJobs(); }} />
      )}
    </div>
  );
}

// ── modal ลงคิวติดตั้ง (เลือกช่วงวันได้ — งานหลายวันสร้างวันละแถวอัตโนมัติ) ──
function AddAssignModal({ ready, initial, busy, leadNames, onClose, onSave }: {
  ready: { job_id: string; jobs: Record<string, unknown> }[];
  initial: { date: string; job_id?: string }; busy: boolean; leadNames: string[];
  onClose: () => void; onSave: (b: Record<string, unknown>) => void;
}) {
  const [jobId, setJobId] = useState(initial.job_id || ready[0]?.job_id || "");
  const [date, setDate] = useState(initial.date);
  const [dateTo, setDateTo] = useState(initial.date);
  const [lead, setLead] = useState("");
  const [crew, setCrew] = useState("");
  const [note, setNote] = useState("");
  const nDays = useMemo(() => {
    if (!dateTo || dateTo <= date) return 1;
    return Math.min(14, Math.round((new Date(dateTo + "T00:00:00").getTime() - new Date(date + "T00:00:00").getTime()) / 86400000) + 1);
  }, [date, dateTo]);
  return (
    <Modal title="ลงคิวติดตั้ง" onClose={onClose}>
      <label className="lbl">งาน (พร้อมติดตั้ง)</label>
      <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="inp">
        {ready.map((r) => <option key={r.job_id} value={r.job_id}>{jobName(r.jobs)} {jobArea(r.jobs) ? `· ${jobArea(r.jobs)}` : ""}</option>)}
        {ready.length === 0 && <option value="">— ไม่มีงานรอจัดคิว —</option>}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="lbl">วันแรก</label><input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (dateTo < e.target.value) setDateTo(e.target.value); }} className="inp" /></div>
        <div><label className="lbl">ถึงวัน (งานหลายวัน)</label><input type="date" value={dateTo} min={date} onChange={(e) => setDateTo(e.target.value)} className="inp" /></div>
      </div>
      {nDays > 1 && <div className="text-[11px] mt-1 text-amber-300">งาน {nDays} วัน — ระบบลงการ์ด &quot;วัน 1/{nDays} … {nDays}/{nDays}&quot; ให้อัตโนมัติ</div>}
      <label className="lbl">หัวหน้าช่าง (พิมพ์เอง · เลือกจากที่เคยพิมพ์ได้)</label>
      <input value={lead} onChange={(e) => setLead(e.target.value)} placeholder="เช่น ช่างต้น" className="inp" list="lead-names" />
      <datalist id="lead-names">{leadNames.map((n) => <option key={n} value={n} />)}</datalist>
      <label className="lbl">ลูกน้อง (พิมพ์ชื่อ คั่นด้วย ,)</label>
      <input value={crew} onChange={(e) => setCrew(e.target.value)} placeholder="เช่น สมพงษ์, ตูน" className="inp" />
      <label className="lbl">หมายเหตุ</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น นัด 9 โมง ยกกระจกใหญ่" className="inp" />
      <button disabled={busy || !jobId}
        onClick={() => onSave({ job_id: jobId, date, date_to: nDays > 1 ? dateTo : undefined, lead_name: lead.trim(), crew, note })}
        className="w-full mt-3 py-2.5 rounded-xl bg-white/16 text-white font-medium disabled:opacity-50">
        ลงคิว{nDays > 1 ? ` ${nDays} วัน` : ""}
      </button>
    </Modal>
  );
}

// ── drawer รายละเอียด/แก้ ──
function DetailDrawer({ a, busy, leadNames, onClose, onPatch, onDelete }: {
  a: InstallAssignment; busy: boolean; leadNames: string[];
  onClose: () => void; onPatch: (id: string, b: Record<string, unknown>) => void; onDelete: (id: string) => void;
}) {
  const [lead, setLead] = useState(a.lead_name || "");
  const [date, setDate] = useState(a.date);
  const [crew, setCrew] = useState(a.crew || "");
  const [note, setNote] = useState(a.note || "");
  return (
    <Modal title={jobName(a.jobs)} onClose={onClose}>
      <div className="text-xs mb-2" style={{ color: "var(--t-low)" }}>
        {jobCode(a.jobs)} {jobArea(a.jobs) ? `· ${jobArea(a.jobs)}` : ""}
        {a.day_no && a.day_total ? ` · วันที่ ${a.day_no}/${a.day_total} ของงาน` : ""}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="lbl">หัวหน้าช่าง</label>
          <input value={lead} onChange={(e) => setLead(e.target.value)} className="inp" placeholder="พิมพ์ชื่อ" list="lead-names-edit" />
          <datalist id="lead-names-edit">{leadNames.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
        <div><label className="lbl">วันที่</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="inp" /></div>
      </div>
      <label className="lbl">ลูกน้อง</label>
      <input value={crew} onChange={(e) => setCrew(e.target.value)} className="inp" placeholder="พิมพ์ชื่อ คั่นด้วย ," />
      <label className="lbl">หมายเหตุ (ถ้ามี → การ์ดขึ้นป้ายเตือน ⚠)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="inp" placeholder="เช่น กระจกแตก 1 บาน รอสั่งใหม่" />
      <div className="flex gap-2 mt-3">
        <button disabled={busy} onClick={() => onDelete(a.id)} className="px-3 py-2.5 rounded-xl bg-red-500/20 text-red-200 text-sm">เอาออกจากคิว</button>
        <button disabled={busy} onClick={() => onPatch(a.id, { lead_name: lead.trim(), date, crew, note })}
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
