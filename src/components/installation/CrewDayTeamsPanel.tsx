"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";
import CrewTeamCard from "./CrewTeamCard";
import CrewHistoryTab from "./CrewHistoryTab";
import CrewStaffTab from "./CrewStaffTab";
import type { CrewDayTeam, CrewPerson } from "@/lib/types";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// วันที่แบบเต็มภาษาไทย (dropdown เลือกวัน — เหมือน SetTeamApp) เช่น "อังคาร 15 กันยายน 2569"
const DOW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MONTH_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const thaiLong = (dateIso: string) => { const d = new Date(dateIso + "T00:00:00"); return `${DOW_FULL[d.getDay()]} ${d.getDate()} ${TH_MONTH_FULL[d.getMonth()]} ${d.getFullYear() + 543}`; };

// จัดทีมช่างรายวัน — ลอกจากเว็บ SetTeamApp (ของจริงเจ้าของใช้ทุกวัน) มาเป็นแท็บใหม่ในหน้าติดตั้ง
// เชื่อมกับปฏิทินรายเดือน (install_assignments, 0086) ด้วยปุ่ม "ดึงจากแผนปฏิทิน" — ทิศทางเดียว ไม่ sync กลับ
export default function CrewDayTeamsPanel({
  date, onDateChange, canWrite,
}: { date: string; onDateChange: (d: string) => void; canWrite: boolean }) {
  const [subtab, setSubtab] = useState<"editor" | "history" | "staff">("editor");
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: teamsData, isLoading, isError, error: teamsError } = useQuery({
    queryKey: ["crew-day", date],
    queryFn: () => api.get<CrewDayTeam[]>(`/crew-day?date=${date}`),
    retry: false, // ตารางยังไม่มี (0097 ยังไม่รัน) retry ไปก็เจอเดิม — โชว์ข้อความเลย
  });
  const teams = useMemo(() => teamsData?.data ?? [], [teamsData]);

  const { data: peopleData } = useQuery({
    queryKey: ["crew-people"],
    queryFn: () => api.get<CrewPerson[]>("/crew-people"),
  });
  const people = peopleData?.data ?? [];
  const leaders = useMemo(() => people.filter((p) => p.is_leader), [people]);
  const members = useMemo(() => people.filter((p) => p.is_member), [people]);

  const refetchDay = () => qc.invalidateQueries({ queryKey: ["crew-day", date] });
  const refetchCounts = () => { qc.invalidateQueries({ queryKey: ["crew-day-counts"] }); qc.invalidateQueries({ queryKey: ["crew-day-counts-month"] }); };

  async function addTeam() {
    setBusy(true);
    try { await api.post("/crew-day/teams", { work_date: date }); await refetchDay(); refetchCounts(); }
    finally { setBusy(false); }
  }
  async function patchTeam(id: string, patch: Record<string, unknown>) {
    await api.patch(`/crew-day/teams/${id}`, patch);
    await refetchDay();
  }
  async function deleteTeam(id: string) {
    setBusy(true);
    try { await api.del(`/crew-day/teams/${id}`); await refetchDay(); refetchCounts(); }
    finally { setBusy(false); }
  }
  async function addSite(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    const nextNo = (team?.crew_team_sites.length ?? 0) + 1;
    if (nextNo > 4) return;
    await api.post("/crew-day/sites", { team_id: teamId, site_no: nextNo });
    await refetchDay();
  }
  async function patchSite(id: string, patch: Record<string, unknown>) {
    await api.patch(`/crew-day/sites/${id}`, patch);
    await refetchDay();
  }
  async function deleteSite(id: string) {
    await api.del(`/crew-day/sites/${id}`);
    await refetchDay();
  }
  async function duplicateTo(from: string, to: string) {
    await api.post("/crew-day/duplicate", { from_date: from, to_date: to });
  }

  async function duplicateFromPrevious() {
    const suggested = iso(addDays(new Date(date + "T00:00:00"), -1));
    const from = prompt("ทำซ้ำจากวันที่ (รูปแบบ YYYY-MM-DD)", suggested);
    if (!from) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { alert("รูปแบบวันที่ไม่ถูกต้อง"); return; }
    setBusy(true);
    try { await duplicateTo(from, date); await refetchDay(); refetchCounts(); }
    catch (e) { alert(e instanceof Error ? e.message : "ทำซ้ำไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  // เด้งงานจากปฏิทินเข้า "จัดทีม" อัตโนมัติ — เปิดวันไหน ดึงแผนวันนั้นมาให้เลย (ครั้งเดียว/วัน, เงียบ)
  //   endpoint กันซ้ำเอง (งานในระบบ=job_id, คิวนอกระบบ=ชื่อ) → เปิดซ้ำไม่สร้างซ้ำ
  const autoPulled = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!canWrite) return;
    if (autoPulled.current.has(date)) return;
    autoPulled.current.add(date);
    (async () => {
      try {
        const r = await api.post<{ created: number }>("/crew-day/import-from-calendar", { work_date: date });
        if (r.data?.created) { refetchDay(); refetchCounts(); }
      } catch { /* เงียบ — วันไม่มีแผน / ตารางยังไม่พร้อม ไม่ต้องรบกวน */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, canWrite]);

  return (
    <div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {([["editor", "จัดทีมวันนี้"], ["history", "ประวัติ"], ["staff", "รายชื่อช่าง"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSubtab(k)}
            className={`px-3 py-2 rounded-xl text-sm font-medium border ${subtab === k ? "bg-white/16 text-white border-white/20" : "bg-white/6 text-white/70 border-white/10"}`}>{l}</button>
        ))}
      </div>

      {subtab === "editor" && (
        <>
          {/* แถบวันที่ — ปฏิทินจริง (คลิกเลือกวันไหนก็ได้ ไม่ต้องเลื่อนหา ไม่ต้องกดทีละวัน) + ปุ่มลัด */}
          <div className="glass-card rounded-2xl p-3 mb-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium shrink-0" style={{ color: "var(--t-mid)" }}>
                <Icon name="calendar" size={16} />วันที่จัดทีม
              </span>
              {/* ป้ายวันไทยเต็ม (อ่านชัด) + ช่องปฏิทินคลิกเลือก (native date picker) */}
              <label className="relative inline-flex items-center rounded-xl overflow-hidden cursor-pointer"
                style={{ background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.18)" }}>
                <span className="pl-3.5 pr-2 py-2 text-sm font-semibold text-white whitespace-nowrap tnum">{thaiLong(date)}</span>
                <span className="px-2.5 py-2 text-white/70" style={{ borderLeft: "1px solid rgba(255,255,255,.15)" }}><Icon name="calendar" size={15} /></span>
                {/* input จริงซ้อนโปร่งใสทับทั้งป้าย — คลิกที่ไหนก็เปิดปฏิทิน */}
                <input type="date" value={date} onChange={(e) => e.target.value && onDateChange(e.target.value)}
                  className="crew-date-input absolute inset-0 opacity-0 cursor-pointer" aria-label="เลือกวันที่จัดทีม" />
              </label>
              {/* ปุ่มลัด — เมื่อวาน / วันนี้ / พรุ่งนี้ */}
              <div className="flex gap-1 shrink-0">
                {([[-1, "เมื่อวาน"], [0, "วันนี้"], [1, "พรุ่งนี้"]] as const).map(([off, lbl]) => {
                  const target = iso(addDays(new Date(), off));
                  const on = date === target;
                  return (
                    <button key={lbl} onClick={() => onDateChange(target)}
                      className="px-2.5 rounded-xl text-xs" style={{ minHeight: 36,
                        background: on ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)",
                        color: on ? "#fff" : "rgba(255,255,255,.6)", fontWeight: on ? 600 : 400 }}>{lbl}</button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <a href={`/installation/crew-teams/print?date=${date}`} target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-white/8 text-white/80 text-sm inline-flex items-center gap-1.5"><Icon name="printer" size={14} />ปริ้น A4</a>
              {canWrite && (
                <>
                  <button disabled={busy} onClick={duplicateFromPrevious} className="px-3 py-2 rounded-xl bg-white/8 text-white/80 text-sm disabled:opacity-50">ทำซ้ำวันก่อนหน้า</button>
                  <button disabled={busy} onClick={addTeam} className="px-3.5 py-2 rounded-xl bg-white/16 text-white text-sm font-medium disabled:opacity-50">+ เพิ่มทีม</button>
                </>
              )}
            </div>
            {/* ปฏิทิน native บนธีมดำ: ทำให้ไอคอนปฏิทินเป็นสีขาว (ค่าเริ่มต้นดำ มองไม่เห็นบนพื้นเข้ม) */}
            <style>{`.crew-date-input::-webkit-calendar-picker-indicator{filter:invert(1);opacity:.01;cursor:pointer}.crew-date-input::-webkit-datetime-edit,.crew-date-input::-webkit-inner-spin-button{color:transparent}`}</style>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-white/50 text-sm">กำลังโหลด...</div>
          ) : isError ? (
            // โหลดไม่ได้ (เช่น 0097 ยังไม่รัน) — บอกตรงๆ ดีกว่าโชว์วันว่างเปล่าให้คนงง
            <div role="alert" className="text-center py-10 px-4 text-sm text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl">
              {teamsError instanceof Error ? teamsError.message : "โหลดข้อมูลจัดทีมไม่สำเร็จ — ลองรีเฟรช"}
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
              {teams.map((t, i) => (
                <CrewTeamCard key={t.id} team={t} index={i + 1} allTeams={teams} leaders={leaders} members={members}
                  canWrite={canWrite} onPatchTeam={patchTeam} onDeleteTeam={deleteTeam}
                  onAddSite={addSite} onPatchSite={patchSite} onDeleteSite={deleteSite} />
              ))}
              {teams.length === 0 && (
                <div className="col-span-full text-center py-10 text-sm" style={{ color: "var(--t-low)" }}>
                  — ยังไม่มีการจัดทีมวันนี้ —{canWrite ? " (งานจากปฏิทินจะเด้งเข้าให้เอง) · กด \"+ เพิ่มทีม\" หรือ \"ทำซ้ำวันก่อนหน้า\" ได้" : ""}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {subtab === "history" && (
        <CrewHistoryTab
          canWrite={canWrite}
          onOpenDate={(d) => { onDateChange(d); setSubtab("editor"); }}
          onDuplicateTo={duplicateTo}
        />
      )}

      {subtab === "staff" && <CrewStaffTab canWrite={canWrite} />}
    </div>
  );
}
