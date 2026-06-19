"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X } from "@/components/ui/icons";

// ค่ามาตรฐาน (ตาม Excel ทีมผลิต)
const MAT = ["", "เบิกสต๊อกทั้งหมด", "สั่งแล้ว รอของ", "ของมาแล้ว"];
const GLASS_ORDER = ["", "สั่งแล้ว รอของ", "มาแล้ว"];
const INSTALLED = ["", "ใส่แล้ว", "ยังไม่ใส่"];
const SCREEN_INST = ["", "มาแล้ว", "ใส่แล้ว", "ใส่ไม่ครบ"];
const QC = ["", "ผ่าน", "ไม่ผ่าน"];
const DESIGN_RECV = ["", "ได้รับแบบ", "ได้แบบไม่ครบ", "ยังไม่ได้รับแบบ"];

type SetRow = { id: number; job_id: string } & Record<string, any>;

const fieldCls =
  "w-full bg-white/8 text-white text-[12px] px-2 py-1.5 rounded-lg border border-white/12 focus:border-sky-300/60 outline-none disabled:opacity-60";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] mb-0.5" style={{ color: "var(--t-low)" }}>{label}</span>
      {children}
    </label>
  );
}

export function ProductionSetsSection({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const key = ["production-sets", jobId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<SetRow[]>(`/production-sets?job_id=${jobId}`) });
  const sets = data?.data ?? [];
  const [busy, setBusy] = useState(false);

  async function save(id: number, field: string, value: any) {
    try { await api.patch(`/production-sets/${id}`, { [field]: value === "" ? null : value }); } catch { /* keep typed value */ }
  }
  async function add() {
    setBusy(true);
    try { await api.post("/production-sets", { job_id: jobId, set_label: `ชุด ${sets.length + 1}` }); qc.invalidateQueries({ queryKey: key }); }
    finally { setBusy(false); }
  }
  async function del(id: number) {
    if (!confirm("ลบชุดงานนี้?")) return;
    await api.del(`/production-sets/${id}`); qc.invalidateQueries({ queryKey: key });
  }

  // helper สร้าง field
  const txt = (s: SetRow, f: string) => <input defaultValue={s[f] ?? ""} disabled={!canWrite} onBlur={(e) => e.target.value !== String(s[f] ?? "") && save(s.id, f, e.target.value)} className={fieldCls} />;
  const date = (s: SetRow, f: string) => <input type="date" defaultValue={s[f] ?? ""} disabled={!canWrite} onBlur={(e) => save(s.id, f, e.target.value)} className={fieldCls + " [&::-webkit-calendar-picker-indicator]:invert"} />;
  const sel = (s: SetRow, f: string, opts: string[]) => (
    <select defaultValue={s[f] ?? ""} disabled={!canWrite} onChange={(e) => save(s.id, f, e.target.value)} className={fieldCls + " [&>option]:text-black"}>
      {opts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
    </select>
  );

  return (
    <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold text-white">รายละเอียดผลิต (ชุดงาน)</span>
        {canWrite && (
          <button onClick={add} disabled={busy} className="focusable pressable inline-flex items-center gap-1 text-[12px] bg-sky-500/80 hover:bg-sky-400 text-white rounded-lg px-2.5 py-1.5 min-h-[34px] disabled:opacity-50"><Plus size={13} /> เพิ่มชุด</button>
        )}
      </div>

      {isLoading ? (
        <div className="text-[12px] py-2" style={{ color: "var(--t-low)" }}>กำลังโหลด…</div>
      ) : sets.length === 0 ? (
        <div className="text-[12px] py-2" style={{ color: "var(--t-low)" }}>ยังไม่มีชุดงาน — กด "เพิ่มชุด" เพื่อเริ่มกรอกแผนผลิต</div>
      ) : (
        <div className="space-y-3">
          {sets.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <input defaultValue={s.set_label ?? ""} disabled={!canWrite} placeholder="ชื่อชุด เช่น ชุด 1,4,5"
                  onBlur={(e) => e.target.value !== String(s.set_label ?? "") && save(s.id, "set_label", e.target.value)}
                  className="flex-1 bg-transparent text-white text-[13px] font-semibold border-b border-white/15 focus:border-sky-300/60 outline-none px-1 py-1" />
                {canWrite && <button onClick={() => del(s.id)} aria-label="ลบชุด" className="text-white/40 hover:text-rose-300 p-1"><X size={15} /></button>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <F label="แบบถึงผลิต">{sel(s, "design_received", DESIGN_RECV)}</F>
                <F label="วันวัดจริง">{date(s, "measure_actual")}</F>
                <F label="คนวัด">{txt(s, "measurer_name")}</F>
                <F label="โครง/โรงงาน">{txt(s, "frame_status")}</F>

                <F label="อุปกรณ์">{sel(s, "mat_equipment", MAT)}</F>
                <F label="อลู ปกติ">{sel(s, "mat_alu_normal", MAT)}</F>
                <F label="อลู อบสี">{sel(s, "mat_alu_painted", MAT)}</F>
                <F label="QC ก่อนสั่งกระจก">{sel(s, "qc_before_glass", QC)}</F>

                <div className="col-span-2"><F label="สเปคกระจก">{txt(s, "glass_spec")}</F></div>
                <F label="สั่งกระจก">{sel(s, "glass_order", GLASS_ORDER)}</F>
                <F label="ใส่กระจก">{sel(s, "glass_installed", INSTALLED)}</F>

                <F label="มุ้ง">{txt(s, "screen_type")}</F>
                <F label="ใส่มุ้ง">{sel(s, "screen_installed", SCREEN_INST)}</F>
                <F label="QC หลังใส่กระจก">{sel(s, "qc_after_glass", QC)}</F>
                <F label="ต้องผลิตเสร็จ">{date(s, "must_finish_date")}</F>

                <F label="ใส่กระจกเสร็จ">{date(s, "glass_done_date")}</F>
                <F label="เสร็จจริง">{date(s, "actual_done_date")}</F>
                <F label="วันติดตั้ง">{date(s, "install_date")}</F>
                <div className="col-span-2 sm:col-span-1"><F label="หมายเหตุ">{txt(s, "note")}</F></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
