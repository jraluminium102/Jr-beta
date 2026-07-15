"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CrewPerson } from "@/lib/types";

// หน้าจัดการรายชื่อช่าง — เพิ่มคนใหม่ + ปิด/เปิดใช้งาน แยกหัวหน้าทีม/สมาชิก (คนเดียวเป็นได้ทั้งสอง)
export default function CrewStaffTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["crew-people-all"], queryFn: () => api.get<CrewPerson[]>("/crew-people?all=1") });
  const people = data?.data ?? [];
  const leaders = people.filter((p) => p.is_leader);
  const members = people.filter((p) => p.is_member);

  const [name, setName] = useState("");
  const [asLeader, setAsLeader] = useState(false);
  const [asMember, setAsMember] = useState(true);
  const [busy, setBusy] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["crew-people-all"] });
    qc.invalidateQueries({ queryKey: ["crew-people"] });
  }

  async function add() {
    if (!name.trim()) return;
    if (!asLeader && !asMember) { alert("ต้องเลือกอย่างน้อย 1 บทบาท (หัวหน้าทีม/ลูกทีม)"); return; }
    setBusy(true);
    try {
      await api.post("/crew-people", { name: name.trim(), is_leader: asLeader, is_member: asMember });
      setName(""); setAsLeader(false); setAsMember(true);
      invalidate();
    } catch (e) { alert(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function toggleActive(p: CrewPerson) {
    await api.patch(`/crew-people/${p.id}`, { is_active: !p.is_active });
    invalidate();
  }

  if (isLoading) return <div className="text-center py-10 text-white/50 text-sm">กำลังโหลด...</div>;

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="glass-card rounded-2xl p-3.5">
          <div className="text-white text-sm font-medium mb-2">เพิ่มคนใหม่</div>
          <div className="flex flex-wrap gap-2 items-center">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ"
              className="flex-1 min-w-[140px] bg-white/8 border border-white/12 rounded-lg px-2.5 py-2 text-white text-sm outline-none placeholder:text-white/30" />
            <label className="flex items-center gap-1.5 text-white/80 text-sm py-2"><input type="checkbox" checked={asLeader} onChange={(e) => setAsLeader(e.target.checked)} />หัวหน้าทีมได้</label>
            <label className="flex items-center gap-1.5 text-white/80 text-sm py-2"><input type="checkbox" checked={asMember} onChange={(e) => setAsMember(e.target.checked)} />ลูกทีมได้</label>
            <button disabled={busy || !name.trim()} onClick={add} className="px-3.5 py-2.5 rounded-xl bg-white/16 text-white text-sm font-medium disabled:opacity-50">+ เพิ่ม</button>
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl p-3.5">
        <div className="text-white text-sm font-medium mb-2">หัวหน้าทีม ({leaders.filter((p) => p.is_active).length} ใช้งานอยู่)</div>
        <div className="flex flex-wrap gap-1.5">
          {leaders.map((p) => <PersonChip key={p.id} p={p} canWrite={canWrite} onToggle={() => toggleActive(p)} />)}
          {leaders.length === 0 && <span className="text-[12px]" style={{ color: "var(--t-low)" }}>— ยังไม่มี —</span>}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-3.5">
        <div className="text-white text-sm font-medium mb-2">สมาชิก ({members.filter((p) => p.is_active).length} ใช้งานอยู่)</div>
        <div className="flex flex-wrap gap-1.5">
          {members.map((p) => <PersonChip key={p.id} p={p} canWrite={canWrite} onToggle={() => toggleActive(p)} />)}
          {members.length === 0 && <span className="text-[12px]" style={{ color: "var(--t-low)" }}>— ยังไม่มี —</span>}
        </div>
      </div>
    </div>
  );
}

function PersonChip({ p, canWrite, onToggle }: { p: CrewPerson; canWrite: boolean; onToggle: () => void }) {
  return (
    <button type="button" disabled={!canWrite} onClick={onToggle}
      className="px-2.5 py-1.5 rounded-full text-xs font-medium border disabled:opacity-70"
      style={p.is_active
        ? { background: "rgba(255,255,255,.10)", color: "rgba(255,255,255,.9)", borderColor: "rgba(255,255,255,.18)" }
        : { background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.35)", borderColor: "rgba(255,255,255,.08)", textDecoration: "line-through" }}
      title={canWrite ? (p.is_active ? "กดเพื่อปิดใช้งาน" : "กดเพื่อเปิดใช้งาน") : undefined}>
      {p.name}
    </button>
  );
}
