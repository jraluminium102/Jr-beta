"use client";
import { useMemo, useState, type ReactNode } from "react";
import Icon from "@/components/Icon";
import CrewSiteRow from "./CrewSiteRow";
import type { CrewDayTeam, CrewPerson } from "@/lib/types";

// การ์ดทีมช่าง 1 ทีม/วัน — เวลาเริ่มงาน(พิมพ์อิสระ) + สถานที่ 1-4 จุด + หัวหน้า/สมาชิก(chip) + หมายเหตุ
export default function CrewTeamCard({
  team, index, allTeams, leaders, members, canWrite,
  onPatchTeam, onDeleteTeam, onAddSite, onPatchSite, onDeleteSite,
}: {
  team: CrewDayTeam; index: number; allTeams: CrewDayTeam[];
  leaders: CrewPerson[]; members: CrewPerson[]; canWrite: boolean;
  onPatchTeam: (id: string, patch: Record<string, unknown>) => void;
  onDeleteTeam: (id: string) => void;
  onAddSite: (teamId: string) => void;
  onPatchSite: (id: string, patch: Record<string, unknown>) => void;
  onDeleteSite: (id: string) => void;
}) {
  const [note, setNote] = useState(team.note);

  // ใครถูกทีมอื่น (วันเดียวกัน) จองแล้ว — กันจัดซ้ำ (ต้นฉบับไม่มี ทำให้ดีกว่า)
  const claimedElsewhere = useMemo(() => {
    const m = new Map<string, number>();
    allTeams.forEach((t, i) => {
      if (t.id === team.id) return;
      t.member_ids.forEach((id) => { if (!m.has(id)) m.set(id, i + 1); });
    });
    return m;
  }, [allTeams, team.id]);

  const remainingIds = useMemo(() => {
    const claimed = new Set<string>();
    allTeams.forEach((t) => { if (t.id !== team.id) t.member_ids.forEach((id) => claimed.add(id)); });
    return members.filter((m) => !claimed.has(m.id)).map((m) => m.id);
  }, [allTeams, members, team.id]);

  function toggleMember(id: string) {
    const has = team.member_ids.includes(id);
    // เพิ่มคนที่ทีมอื่นจองแล้ว → ถามยืนยันก่อน (QA: สีเตือนอย่างเดียวมองข้ามง่าย ช่างคนเดียวโดนส่ง 2 ที่จริง)
    if (!has) {
      const claimedTeamNo = claimedElsewhere.get(id);
      if (claimedTeamNo && !confirm(`คนนี้ถูกจัดอยู่ทีม ${claimedTeamNo} แล้ว — เลือกซ้ำใส่ทีมนี้ด้วยจริงไหม?`)) return;
    }
    const next = has ? team.member_ids.filter((x) => x !== id) : [...team.member_ids, id];
    onPatchTeam(team.id, { member_ids: next });
  }

  const sites = team.crew_team_sites ?? [];

  return (
    <div className="glass-card rounded-2xl p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white font-semibold text-sm shrink-0">ทีม {index}</span>
          {team.leader?.name && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 truncate" style={{ color: "var(--t-mid)" }}>{team.leader.name}</span>
          )}
        </div>
        {canWrite && (
          <button onClick={() => { if (confirm(`ลบทีม ${index} ออกจากวันนี้? (สถานที่ในทีมจะหายด้วย)`)) onDeleteTeam(team.id); }}
            className="text-red-300/70 hover:text-red-300 p-1.5 rounded-lg shrink-0" aria-label="ลบทีม" style={{ minWidth: 32, minHeight: 32 }}>
            <Icon name="trash" size={15} />
          </button>
        )}
      </div>

      {/* สถานที่ทำงาน 1-4 จุด — ช่องแรกของการ์ด
          (เอา "เวลาเริ่มงาน" ระดับทีมออกแล้ว 16 ก.ค.2569 ตามเจ้าของสั่ง — เวลานัดอยู่รายจุดใน CrewSiteRow พอ
           คอลัมน์ crew_day_teams.start_time ยังอยู่ใน DB แต่ไม่ใช้แล้ว ไม่ต้องลบ) */}
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px]" style={{ color: "var(--t-low)" }}>สถานที่ทำงาน</label>
        <span className="text-[10.5px] tnum px-1.5 py-0.5 rounded bg-white/8" style={{ color: "var(--t-low)" }}>{sites.length}/4</span>
      </div>
      <div className="space-y-1.5 mb-1.5">
        {sites.map((s) => (
          <CrewSiteRow key={s.id} site={s} canWrite={canWrite} onPatch={onPatchSite} onDelete={onDeleteSite} />
        ))}
        {sites.length === 0 && <div className="text-[11px] text-center py-2" style={{ color: "var(--t-low)" }}>— ยังไม่มีสถานที่ —</div>}
      </div>
      {canWrite && sites.length < 4 && (
        <button onClick={() => onAddSite(team.id)} className="w-full text-[12px] py-2 rounded-lg bg-white/6 hover:bg-white/10 text-white/70 mb-3">+ เพิ่มสถานที่</button>
      )}

      {/* หัวหน้าทีม — chip เลือก 1 คน */}
      <label className="block text-[11px] mb-1 mt-1" style={{ color: "var(--t-low)" }}>หัวหน้าทีม (ถ้ามี)</label>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <Chip active={!team.leader_id} onClick={() => onPatchTeam(team.id, { leader_id: null })} disabled={!canWrite}>ไม่ระบุ</Chip>
        {leaders.map((l) => (
          <Chip key={l.id} active={team.leader_id === l.id} onClick={() => onPatchTeam(team.id, { leader_id: l.id })} disabled={!canWrite}>{l.name}</Chip>
        ))}
      </div>

      {/* สมาชิกทีม — chip เลือกได้หลายคน + ปุ่มลัด "ทั้งหมดที่เหลือ" */}
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px]" style={{ color: "var(--t-low)" }}>สมาชิกทีม ({team.member_ids.length})</label>
        {canWrite && (
          <button onClick={() => onPatchTeam(team.id, { member_ids: remainingIds })}
            className="text-[11px] px-2 py-1 rounded-full bg-white/10 text-white/80 hover:bg-white/16">ทั้งหมดที่เหลือ</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {members.map((m) => {
          const active = team.member_ids.includes(m.id);
          const claimedTeamNo = claimedElsewhere.get(m.id);
          return (
            <Chip key={m.id} active={active} warn={!active && !!claimedTeamNo} onClick={() => toggleMember(m.id)} disabled={!canWrite}
              title={claimedTeamNo ? `ทีม ${claimedTeamNo} จองไว้แล้ว — เลือกซ้ำได้ถ้าตั้งใจ` : undefined}>
              {m.name}{!active && claimedTeamNo ? ` (ทีม ${claimedTeamNo})` : ""}
            </Chip>
          );
        })}
        {members.length === 0 && <span className="text-[11px]" style={{ color: "var(--t-low)" }}>— ยังไม่มีรายชื่อ ไปเพิ่มที่แท็บ &quot;รายชื่อช่าง&quot; —</span>}
      </div>

      {/* หมายเหตุ */}
      <label className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>หมายเหตุ</label>
      <textarea
        value={note} disabled={!canWrite} rows={2}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => { if (note.trim() !== team.note) onPatchTeam(team.id, { note: note.trim() }); }}
        placeholder="เช่น รอลูกน้องอีกคน, งานใหญ่ต้องรถกระเช้า"
        className="w-full bg-white/8 border border-white/12 rounded-lg px-2.5 py-2 text-white text-[12.5px] outline-none placeholder:text-white/30"
      />
    </div>
  );
}

function Chip({ active, warn, disabled, onClick, title, children }: {
  active: boolean; warn?: boolean; disabled?: boolean; onClick: () => void; title?: string; children: ReactNode;
}) {
  // เลือกแล้ว = เขียว emerald เต็ม + ✓ (เจ้าของแจ้ง 18 ก.ค.2569: เดิมขาวจาง 22% บน glass-card ดูไม่ออกว่าเลือกไปแล้ว)
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className="pressable focusable inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border disabled:opacity-50"
      style={active
        ? { background: "#16a34a", color: "#fff", borderColor: "#22c55e", boxShadow: "0 1px 4px rgba(22,163,74,.45)" }
        : warn
          ? { background: "rgba(239,159,39,.12)", color: "#fcd38a", borderColor: "rgba(239,159,39,.35)" }
          : { background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.68)", borderColor: "rgba(255,255,255,.14)" }}>
      {active && <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>✓</span>}
      {children}
    </button>
  );
}
