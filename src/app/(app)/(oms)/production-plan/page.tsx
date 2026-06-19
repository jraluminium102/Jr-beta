"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import { Plus, X } from "@/components/ui/icons";

// ── ค่ามาตรฐาน dropdown (ตาม Excel ทีมผลิต) ──
const MAT = ["", "เบิกสต๊อกทั้งหมด", "สั่งแล้ว รอของ", "ของมาแล้ว"];
const GLASS_ORDER = ["", "สั่งแล้ว รอของ", "มาแล้ว"];
const INSTALLED = ["", "ใส่แล้ว", "ยังไม่ใส่"];
const SCREEN_INST = ["", "มาแล้ว", "ใส่แล้ว", "ใส่ไม่ครบ"];
const QC = ["", "ผ่าน", "ไม่ผ่าน"];
const DESIGN_RECV = ["", "ได้รับแบบ", "ได้แบบไม่ครบ", "ยังไม่ได้รับแบบ"];

type ColType = "text" | "date" | "select";
type Col = { key: string; label: string; type: ColType; opts?: string[]; w?: string };
const COLS: Col[] = [
  { key: "set_label", label: "ชุด", type: "text", w: "w-20" },
  { key: "measure_actual", label: "วันวัดจริง", type: "date" },
  { key: "measurer_name", label: "คนวัด", type: "text", w: "w-16" },
  { key: "design_received", label: "แบบถึงผลิต", type: "select", opts: DESIGN_RECV },
  { key: "must_finish_date", label: "ต้องเสร็จ", type: "date" },
  { key: "glass_done_date", label: "ใส่กระจกเสร็จ", type: "date" },
  { key: "actual_done_date", label: "เสร็จจริง", type: "date" },
  { key: "qc_before_glass", label: "QC ก่อนสั่งกระจก", type: "select", opts: QC },
  { key: "glass_spec", label: "สเปคกระจก", type: "text", w: "w-44" },
  { key: "mat_equipment", label: "อุปกรณ์", type: "select", opts: MAT },
  { key: "mat_alu_normal", label: "อลูปกติ", type: "select", opts: MAT },
  { key: "mat_alu_painted", label: "อลูอบสี", type: "select", opts: MAT },
  { key: "frame_status", label: "โครง", type: "text", w: "w-28" },
  { key: "glass_order", label: "สั่งกระจก", type: "select", opts: GLASS_ORDER },
  { key: "glass_installed", label: "ใส่กระจก", type: "select", opts: INSTALLED },
  { key: "screen_type", label: "มุ้ง", type: "text", w: "w-24" },
  { key: "screen_installed", label: "ใส่มุ้ง", type: "select", opts: SCREEN_INST },
  { key: "qc_after_glass", label: "QC หลังใส่", type: "select", opts: QC },
  { key: "install_date", label: "วันติดตั้ง", type: "date" },
  { key: "note", label: "หมายเหตุ", type: "text", w: "w-44" },
];

type Job = { job_code: string | null; customer_name: string; customer_area: string | null; status: string };
type SetRow = { id: number; job_id: string; job: Job | null } & Record<string, any>;

const inputCls =
  "w-full bg-white/5 text-white text-[12px] px-1.5 py-1 rounded border border-white/10 focus:border-sky-300/60 outline-none disabled:opacity-60 tabular-nums";

function Cell({ row, col, canWrite, save }: { row: SetRow; col: Col; canWrite: boolean; save: (id: number, f: string, v: any) => void }) {
  const v = row[col.key] ?? "";
  if (col.type === "select") {
    return (
      <select defaultValue={v} disabled={!canWrite} onChange={(e) => save(row.id, col.key, e.target.value)}
        className={inputCls + " [&>option]:text-black"}>
        {(col.opts ?? []).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
    );
  }
  return (
    <input type={col.type === "date" ? "date" : "text"} defaultValue={v} disabled={!canWrite}
      step={col.type === "date" ? undefined : undefined}
      onBlur={(e) => { if (e.target.value !== String(v)) save(row.id, col.key, e.target.value); }}
      className={inputCls + " [&::-webkit-calendar-picker-indicator]:invert"} />
  );
}

export default function ProductionPlanPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["production-sets"], queryFn: () => api.get<SetRow[]>("/production-sets") });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  async function save(id: number, field: string, value: any) {
    try { await api.patch(`/production-sets/${id}`, { [field]: value === "" ? null : value }); }
    catch { setErr("บันทึกไม่สำเร็จ — ลองใหม่"); setTimeout(() => setErr(""), 3000); }
  }
  async function del(id: number) {
    if (!confirm("ลบชุดงานนี้?")) return;
    await api.del(`/production-sets/${id}`);
    qc.invalidateQueries({ queryKey: ["production-sets"] });
  }

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-white">แผนผลิต (worksheet)</h1>
        <div className="flex items-center gap-2">
          <Link href="/production" className="focusable pressable inline-flex items-center gap-1.5 px-3 py-2 rounded-xl glass-card border border-white/15 text-white text-[13px] min-h-[40px]">ตารางงานช่าง</Link>
          {canWrite && (
            <button onClick={() => setAdding(true)} className="focusable pressable inline-flex items-center gap-1.5 bg-white text-[#1F4E78] rounded-xl px-3.5 py-2 text-sm font-semibold min-h-[40px]"><Plus size={17} /> เพิ่มชุด</button>
          )}
        </div>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--t-low)" }}>คลิกช่องเพื่อแก้ · บันทึกอัตโนมัติ · 1 แถว = 1 ชุดงาน</p>
      {err && <div className="mb-3 rounded-xl border border-rose-300/30 bg-rose-500/15 px-3 py-2 text-[13px] text-rose-100">{err}</div>}

      {adding && <AddSetRow onClose={() => setAdding(false)} onAdded={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["production-sets"] }); }} />}

      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีชุดงานในแผนผลิต" sub="กด 'เพิ่มชุด' เพื่อดึงงานในผลิตเข้ามา" />
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-[11px] border-b border-white/15" style={{ color: "var(--t-mid)" }}>
                  <th className="text-left font-medium px-2 py-2 sticky left-0 bg-[#1a2942] z-10 min-w-[150px]">ลูกค้า</th>
                  {COLS.map((c) => <th key={c.key} className="text-left font-medium px-1.5 py-2 whitespace-nowrap">{c.label}</th>)}
                  {canWrite && <th className="px-1.5 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/6 hover:bg-white/5">
                    <td className="px-2 py-1 sticky left-0 bg-[#1a2942] z-10 align-top">
                      <div className="text-white text-[12px] font-medium leading-tight">{r.job?.customer_name ?? "—"}</div>
                      <div className="text-[10px] tnum" style={{ color: "var(--t-low)" }}>{r.job?.job_code}</div>
                    </td>
                    {COLS.map((c) => (
                      <td key={c.key} className={`px-1 py-1 align-top ${c.w ?? "w-24"}`}><Cell row={r} col={c} canWrite={canWrite} save={save} /></td>
                    ))}
                    {canWrite && (
                      <td className="px-1 py-1 align-top">
                        <button onClick={() => del(r.id)} aria-label="ลบ" className="focusable text-white/40 hover:text-rose-300 p-1"><X size={15} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ฟอร์มเพิ่มชุด: เลือกงานในผลิต ──
type ProdJob = { id: string; job: { job_code: string | null; customer_name: string } | null; status: string };
function AddSetRow({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { data } = useQuery({ queryKey: ["production"], queryFn: () => api.get<ProdJob[]>("/production") });
  const jobs = (data?.data ?? []).filter((p) => p.job);
  const [jobId, setJobId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!jobId) return;
    setBusy(true);
    try { await api.post("/production-sets", { job_id: jobId, set_label: label }); onAdded(); }
    finally { setBusy(false); }
  }
  return (
    <div className="mb-3 glass-card rounded-2xl p-3 border border-sky-300/20 flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>งานในผลิต</label>
        <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputCls + " [&>option]:text-black min-h-[40px]"}>
          <option value="">— เลือกงาน —</option>
          {jobs.map((p) => <option key={p.id} value={p.id}>{p.job?.job_code} · {p.job?.customer_name}</option>)}
        </select>
      </div>
      <div className="w-32">
        <label className="block text-[11px] mb-1" style={{ color: "var(--t-low)" }}>ชื่อชุด</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น ชุด 1,4,5" className={inputCls + " min-h-[40px]"} />
      </div>
      <button onClick={add} disabled={!jobId || busy} className="focusable pressable bg-sky-500 hover:bg-sky-400 text-white rounded-xl px-4 py-2 text-sm font-semibold min-h-[40px] disabled:opacity-50">เพิ่ม</button>
      <button onClick={onClose} className="focusable pressable glass-card text-white/80 rounded-xl px-3 py-2 text-sm min-h-[40px]">ยกเลิก</button>
    </div>
  );
}
