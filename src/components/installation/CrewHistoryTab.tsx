"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

type Row = { work_date: string; team_count: number };
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const thDate = (dateIso: string) => {
  const d = new Date(dateIso + "T00:00:00");
  return `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
};

// ลิสต์ประวัติการจัดทีมตามวัน + จำนวนทีม + แก้ไข/ทำซ้ำ/PDF
export default function CrewHistoryTab({ onOpenDate, onDuplicateTo, canWrite }: {
  onOpenDate: (date: string) => void;
  onDuplicateTo: (from: string, to: string) => Promise<void>;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["crew-day-counts"], queryFn: () => api.get<Row[]>("/crew-day/counts") });
  const rows = data?.data ?? [];

  async function dup(from: string) {
    const to = prompt(`ทำซ้ำวัน ${thDate(from)} ไปวันที่ (รูปแบบ YYYY-MM-DD)`);
    if (!to) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) { alert("รูปแบบวันที่ไม่ถูกต้อง ต้องเป็น YYYY-MM-DD"); return; }
    setBusy(from);
    try {
      await onDuplicateTo(from, to);
      qc.invalidateQueries({ queryKey: ["crew-day-counts"] });
      alert("ทำซ้ำสำเร็จ");
    } catch (e) { alert(e instanceof Error ? e.message : "ทำซ้ำไม่สำเร็จ"); }
    finally { setBusy(null); }
  }

  if (isLoading) return <div className="text-center py-10 text-white/50 text-sm">กำลังโหลด...</div>;
  if (rows.length === 0) return <div className="text-center py-10 text-sm" style={{ color: "var(--t-low)" }}>— ยังไม่มีประวัติการจัดทีม —</div>;

  return (
    <div className="glass-card rounded-2xl overflow-hidden overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: 480 }}>
        <thead>
          <tr className="text-left" style={{ color: "var(--t-low)" }}>
            <th className="px-3 py-2 font-normal">วันที่</th>
            <th className="px-3 py-2 font-normal text-center">จำนวนทีม</th>
            <th className="px-3 py-2 font-normal text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.work_date} className="border-t border-white/8">
              <td className="px-3 py-2.5 text-white tnum">{thDate(r.work_date)}</td>
              <td className="px-3 py-2.5 text-center tnum text-white">{r.team_count}</td>
              <td className="px-3 py-2.5">
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => onOpenDate(r.work_date)} className="px-2.5 py-1.5 rounded-lg bg-white/8 text-white/80 text-xs">แก้ไข</button>
                  {canWrite && (
                    <button disabled={busy === r.work_date} onClick={() => dup(r.work_date)} className="px-2.5 py-1.5 rounded-lg bg-white/8 text-white/80 text-xs disabled:opacity-50">ทำซ้ำ</button>
                  )}
                  <a href={`/installation/crew-teams/print?date=${r.work_date}`} target="_blank" rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-white/8 text-white/80 text-xs inline-flex items-center gap-1"><Icon name="printer" size={12} />PDF</a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
