"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X } from "@/components/ui/icons";

// ค่ามาตรฐาน (ตาม Excel ทีมผลิต)
const GLASS_ORDER = ["", "รอวัด", "สั่งแล้ว รอของ", "มาแล้ว", "วัดแล้ว", "มายังไม่ครบ"];
const SCREEN_TYPE = ["", "มุ้งจีบ", "มุ้ง JR", "มุ้งจีบ+มุ้ง JR", "มุ้งนิรภัย"];
const INSTALLED = ["", "ใส่แล้ว", "ยังไม่ใส่"];
const SCREEN_INST = ["", "มาแล้ว", "ใส่แล้ว", "ใส่ไม่ครบ"];
const QC = ["", "ผ่าน", "ไม่ผ่าน"];
const DESIGN_RECV = ["", "ได้รับแบบ", "ได้แบบไม่ครบ", "ยังไม่ได้รับแบบ"];

// timestamptz → "24/06/2026 14:30" (ค.ศ. เต็ม)
function fmtWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

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
  // ประวัติสเปคกระจก (เลือกจากที่เคยบันทึก) — datalist
  const { data: specRes } = useQuery({ queryKey: ["glass-specs"], queryFn: () => api.get<string[]>("/production-sets/glass-specs"), staleTime: 60_000 });
  const glassSpecHistory = specRes?.data ?? [];
  const [busy, setBusy] = useState(false);
  const [editKeys, setEditKeys] = useState<Record<string, boolean>>({}); // ช่อง mark ที่กด "แก้" override อยู่

  async function save(id: number, field: string, value: any) {
    try {
      await api.patch(`/production-sets/${id}`, { [field]: value === "" ? null : value });
      qc.invalidateQueries({ queryKey: key }); // refetch → เห็นค่าล่าสุด/ใครกด (กัน stale ทับ)
    } catch { /* keep typed value */ }
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
  // สเปคกระจก — พิมพ์เอง หรือเลือกจากประวัติ (datalist)
  const glassSpec = (s: SetRow) => (
    <input list="glass-spec-history" defaultValue={s.glass_spec ?? ""} disabled={!canWrite} placeholder="พิมพ์ / เลือกจากประวัติ"
      onBlur={(e) => e.target.value !== String(s.glass_spec ?? "") && save(s.id, "glass_spec", e.target.value)}
      className={fieldCls + " placeholder-white/30"} />
  );

  // ช่องที่ "ช่างกดเอง" — โชว์ read-only + ใครกด/เมื่อไหร่ · กด "แก้" เพื่อ override (กันเขียนทับช่างโดยไม่ตั้งใจ)
  const DONE_VALS: Record<string, string> = { design_received: "ได้รับแบบ", glass_installed: "ใส่แล้ว", qc_before_glass: "ผ่าน", qc_after_glass: "ผ่าน" };
  const markRO = (s: SetRow, f: string, byF: string, atF: string, opts: string[]) => {
    const key = `${s.id}.${f}`;
    if (canWrite && editKeys[key]) {
      return (
        <div className="flex items-center gap-1">
          <select defaultValue={s[f] ?? ""} onChange={(e) => save(s.id, f, e.target.value)} className={fieldCls + " [&>option]:text-black"}>
            {opts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
          <button type="button" onClick={() => setEditKeys((k) => ({ ...k, [key]: false }))} className="text-[10px] text-emerald-300 shrink-0 px-1">เสร็จ</button>
        </div>
      );
    }
    const val = (s[f] ?? "") as string;
    const done = val === DONE_VALS[f];
    const by = s[byF] as string | null;
    const at = s[atF] as string | null;
    return (
      <div className="w-full bg-white/5 rounded-lg border border-white/10 px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[12px] ${done ? "text-emerald-200 font-medium" : "text-white/55"}`}>{val || "— ยังไม่กด —"}</span>
          {canWrite && <button type="button" onClick={() => setEditKeys((k) => ({ ...k, [key]: true }))} className="text-[10px] text-sky-300/80 underline shrink-0">แก้</button>}
        </div>
        {by && <div className="text-[9px] mt-0.5" style={{ color: "var(--t-low)" }}>โดย {by}{at ? ` · ${fmtWhen(at)}` : ""}</div>}
      </div>
    );
  };

  return (
    <div className="mt-3 glass-card rounded-2xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold text-white">รายละเอียดผลิต (ชุดงาน)</span>
        {canWrite && (
          <button onClick={add} disabled={busy} className="focusable pressable inline-flex items-center gap-1 text-[12px] bg-sky-500/80 hover:bg-sky-400 text-white rounded-lg px-2.5 py-1.5 min-h-[34px] disabled:opacity-50"><Plus size={13} /> เพิ่มชุด</button>
        )}
      </div>

      {/* ประวัติสเปคกระจก (ใช้ร่วมทุกชุด) */}
      <datalist id="glass-spec-history">
        {glassSpecHistory.map((g) => <option key={g} value={g} />)}
      </datalist>

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
                <F label="แบบถึงผลิต 👷 (ช่างกด)">{markRO(s, "design_received", "design_received_by", "design_received_at", DESIGN_RECV)}</F>
                <F label="วันวัดจริง">{date(s, "measure_actual")}</F>
                <F label="คนวัด">{txt(s, "measurer_name")}</F>
                <F label="โครง/โรงงาน">{txt(s, "frame_status")}</F>

                <F label="อุปกรณ์">{txt(s, "mat_equipment")}</F>
                <F label="อลู ปกติ">{txt(s, "mat_alu_normal")}</F>
                <F label="อลู อบสี">{txt(s, "mat_alu_painted")}</F>
                <F label="QC ก่อนใส่กระจก 👷 (ช่างกด)">{markRO(s, "qc_before_glass", "qc_before_by", "qc_before_at", QC)}</F>

                <div className="col-span-2"><F label="สเปคกระจก">{glassSpec(s)}</F></div>
                <F label="สั่งกระจก">{sel(s, "glass_order", GLASS_ORDER)}</F>
                <F label="ใส่กระจก 👷 (ช่างกด)">{markRO(s, "glass_installed", "glass_installed_by", "glass_installed_at", INSTALLED)}</F>

                <F label="มุ้ง">{sel(s, "screen_type", SCREEN_TYPE)}</F>
                <F label="ใส่มุ้ง">{sel(s, "screen_installed", SCREEN_INST)}</F>
                <F label="QC หลังใส่กระจก 👷 (ช่างกด)">{markRO(s, "qc_after_glass", "qc_after_by", "qc_after_at", QC)}</F>
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
