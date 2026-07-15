"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";
import CrewTeamCard from "./CrewTeamCard";
import CrewHistoryTab from "./CrewHistoryTab";
import CrewStaffTab from "./CrewStaffTab";
import type { CrewDayTeam, CrewPerson } from "@/lib/types";

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const thDate = (dateIso: string) => { const d = new Date(dateIso + "T00:00:00"); return `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`; };

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
  async function importFromCalendar() {
    setBusy(true);
    try {
      const r = await api.post<{ created: number; message?: string }>("/crew-day/import-from-calendar", { work_date: date });
      await refetchDay(); refetchCounts();
      if (!r.data.created) alert(r.data.message || "ไม่มีรายการนำเข้าใหม่ (นำเข้าครบแล้ว หรือปฏิทินไม่มีแผนวันนี้)");
    } catch (e) { alert(e instanceof Error ? e.message : "ดึงจากปฏิทินไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

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
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={() => onDateChange(iso(addDays(new Date(date + "T00:00:00"), -1)))} className="px-3 py-1.5 rounded-lg bg-white/8 text-white text-sm" style={{ minHeight: 36 }}>‹</button>
              <span className="text-white text-sm font-medium tnum" style={{ minWidth: 150, textAlign: "center" }}>{thDate(date)}</span>
              <button onClick={() => onDateChange(iso(addDays(new Date(date + "T00:00:00"), 1)))} className="px-3 py-1.5 rounded-lg bg-white/8 text-white text-sm" style={{ minHeight: 36 }}>›</button>
              <button onClick={() => onDateChange(iso(new Date()))} className="px-3 py-1.5 rounded-lg bg-white/8 text-white/70 text-xs" style={{ minHeight: 36 }}>วันนี้</button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <a href={`/installation/crew-teams/print?date=${date}`} target="_blank" rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-white/8 text-white/80 text-sm inline-flex items-center gap-1.5"><Icon name="printer" size={14} />ปริ้น A4</a>
              {canWrite && (
                <>
                  <button disabled={busy} onClick={importFromCalendar} className="px-3 py-2 rounded-xl bg-white/8 text-white/80 text-sm disabled:opacity-50">ดึงจากแผนปฏิทิน</button>
                  <button disabled={busy} onClick={duplicateFromPrevious} className="px-3 py-2 rounded-xl bg-white/8 text-white/80 text-sm disabled:opacity-50">ทำซ้ำวันก่อนหน้า</button>
                  <button disabled={busy} onClick={addTeam} className="px-3.5 py-2 rounded-xl bg-white/16 text-white text-sm font-medium disabled:opacity-50">+ เพิ่มทีม</button>
                </>
              )}
            </div>
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
                  — ยังไม่มีการจัดทีมวันนี้ —{canWrite ? " กด \"+ เพิ่มทีม\" หรือ \"ดึงจากแผนปฏิทิน\" / \"ทำซ้ำวันก่อนหน้า\"" : ""}
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
