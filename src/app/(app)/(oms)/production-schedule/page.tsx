"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { PROD_STATUS } from "@/lib/constants";
import { Chip, Spinner, EmptyState } from "@/components/ui/primitives";
import { Plus, X, Check, Trash2, CalendarDays } from "@/components/ui/icons";
import type { ProdStatus } from "@/lib/database.types";

type SchedRow = {
  kind: "job" | "adhoc";
  id: string;
  title: string;
  subtitle: string | null;
  job_code: string | null;
  customer_area: string | null;
  customer_name?: string | null;
  produce_date: string | null;
  install_date: string | null;
  producer_note: string | null;
  status: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
// ISO → "จ 28/07/69"
function thHead(d: string | null) {
  if (!d) return "ยังไม่กำหนดวันผลิต";
  const dt = new Date(d + "T00:00:00");
  const [y, m, day] = d.split("-");
  return `${WD[dt.getDay()]}. ${day}/${m}/${(Number(y) + 543) % 100}`;
}
const thShort = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${(Number(y) + 543) % 100}`;
};

export default function ProductionSchedulePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["production-schedule"],
    queryFn: () => api.get<SchedRow[]>("/production-schedule"),
  });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;
  const [addOpen, setAddOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<SchedRow>>>({});

  // จัดกลุ่มตามวันผลิต (ยังไม่กำหนด → ท้ายสุด)
  const groups = useMemo(() => {
    const map = new Map<string, SchedRow[]>();
    for (const r of rows) {
      const key = r.produce_date ?? "zzz";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const v = (r: SchedRow, k: keyof SchedRow) => (draft[r.id]?.[k] ?? r[k] ?? "") as string;

  const save = async (r: SchedRow, patch: Partial<SchedRow>) => {
    setDraft((d) => ({ ...d, [r.id]: { ...d[r.id], ...patch } }));
    setSavingId(r.id);
    try {
      await api.patch(`/production-schedule/${r.id}`, { kind: r.kind, ...patch });
      await refetch();
    } finally {
      setSavingId((s) => (s === r.id ? null : s));
    }
  };

  const markDone = (r: SchedRow) => save(r, { status: "DONE" } as Partial<SchedRow>);
  const del = async (r: SchedRow) => {
    if (!confirm(`ลบงาน "${r.title}" ออกจากตาราง?`)) return;
    setSavingId(r.id);
    try { await api.del(`/production-schedule/${r.id}`); await refetch(); }
    finally { setSavingId((s) => (s === r.id ? null : s)); }
  };

  const dateCls = "glass-card rounded-lg px-2 py-1.5 text-[13px] text-white outline-none tnum min-h-[40px] [&::-webkit-calendar-picker-indicator]:invert disabled:opacity-50";
  const txtCls = "glass-card rounded-lg px-2.5 py-1.5 text-[13px] text-white outline-none placeholder-white/35 min-h-[40px] disabled:opacity-50";

  return (
    <div className="p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2"><CalendarDays size={22} /> ตารางผลิต</h1>
        {canWrite && (
          <button onClick={() => setAddOpen(true)} className="focusable pressable inline-flex items-center gap-1.5 bg-white/90 text-[#1F4E78] rounded-xl px-3.5 py-2 text-sm font-semibold min-h-[40px]">
            <Plus size={16} /> เพิ่มงานผลิต
          </button>
        )}
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--t-low)" }}>ตารางงานสำหรับช่าง · เรียงตามวันผลิต · แก้วัน/ใส่ชื่อช่างได้เลย · งานในระบบดึงจากหน้างานผลิตอัตโนมัติ</p>

      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีงานในตารางผลิต" sub="กด 'เพิ่มงานผลิต' หรือไปลงคิวผลิตในหน้างานผลิต" />
      ) : (
        <div className="space-y-5">
          {groups.map(([dateKey, items]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className={`text-sm font-bold ${dateKey === today() ? "text-emerald-300" : "text-white"}`}>{thHead(items[0].produce_date)}</span>
                {dateKey === today() && <span className="text-[11px] bg-emerald-500/20 text-emerald-200 rounded-md px-1.5 py-0.5">วันนี้</span>}
                <span className="text-[12px] tnum px-1.5 py-0.5 rounded-md bg-white/10" style={{ color: "var(--t-mid)" }}>{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((r) => (
                  <div key={r.id} className="glass-card rounded-2xl p-3 grid grid-cols-2 lg:grid-cols-[1.5fr_1fr_1.2fr_1fr_auto] gap-2 lg:items-center">
                    {/* งาน/ลูกค้า */}
                    <div className="col-span-2 lg:col-span-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-white font-semibold text-sm truncate">{r.title}</span>
                        {r.kind === "job" ? (
                          <span className="text-[10px] tnum bg-sky-500/20 text-sky-200 rounded px-1.5 py-0.5">{r.job_code}</span>
                        ) : (
                          <span className="text-[10px] bg-amber-500/20 text-amber-200 rounded px-1.5 py-0.5">จดเอง</span>
                        )}
                      </div>
                      {r.subtitle && (
                        <div className="text-[12px] truncate" style={{ color: "var(--t-mid)" }}>{r.subtitle}</div>
                      )}
                    </div>

                    {/* วันผลิต */}
                    <label className="block">
                      <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: "var(--t-low)" }}>วันผลิต</span>
                      <input type="date" disabled={!canWrite || savingId === r.id} value={v(r, "produce_date")}
                        onChange={(e) => save(r, { produce_date: e.target.value } as Partial<SchedRow>)} className={`${dateCls} w-full`} aria-label={`วันผลิต ${r.title}`} />
                    </label>

                    {/* ช่างผลิต */}
                    <label className="block">
                      <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: "var(--t-low)" }}>ช่างผลิต</span>
                      <input type="text" disabled={!canWrite} placeholder="ใส่ชื่อช่าง…" value={v(r, "producer_note")}
                        onChange={(e) => setDraft((d) => ({ ...d, [r.id]: { ...d[r.id], producer_note: e.target.value } }))}
                        onBlur={(e) => { if (e.target.value !== (r.producer_note ?? "")) save(r, { producer_note: e.target.value } as Partial<SchedRow>); }}
                        className={`${txtCls} w-full`} aria-label={`ช่างผลิต ${r.title}`} />
                    </label>

                    {/* สถานะ + วันติดตั้ง */}
                    <div className="flex flex-col gap-1">
                      <Chip>{r.kind === "job" ? PROD_STATUS[r.status as ProdStatus] : "งานจดเอง"}</Chip>
                      {r.install_date && <span className="text-[11px] tnum" style={{ color: "var(--t-low)" }}>ติดตั้ง {thShort(r.install_date)}</span>}
                    </div>

                    {/* actions */}
                    <div className="col-span-2 lg:col-span-1 flex items-center gap-1.5 justify-end">
                      {r.kind === "adhoc" && canWrite && (
                        <>
                          <button onClick={() => markDone(r)} disabled={savingId === r.id} className="focusable pressable inline-flex items-center gap-1 bg-emerald-500/90 hover:bg-emerald-400 text-white rounded-lg px-2.5 py-1.5 text-[12px] font-semibold min-h-[36px] disabled:opacity-50"><Check size={13} /> เสร็จ</button>
                          <button onClick={() => del(r)} disabled={savingId === r.id} aria-label="ลบ" className="focusable pressable inline-flex items-center justify-center text-rose-300 hover:bg-rose-500/15 rounded-lg w-9 h-9"><Trash2 size={15} /></button>
                        </>
                      )}
                      {r.kind === "job" && <span className="text-[11px]" style={{ color: "var(--t-low)" }}>จัดการสถานะที่หน้า “ผลิต”</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && <AddModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refetch(); }} />}
    </div>
  );
}

// ── Modal เพิ่มงานผลิต (จดเอง / เลือกจากงานในระบบ) ──
type Candidate = { id: string; status: ProdStatus; job: { job_code: string; customer_name: string } | null };

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<"adhoc" | "job">("adhoc");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // จดเอง
  const [title, setTitle] = useState("");
  const [cust, setCust] = useState("");
  const [pdate, setPdate] = useState(today());
  const [idate, setIdate] = useState("");
  const [producer, setProducer] = useState("");

  // เลือกจากระบบ
  const { data: prodData } = useQuery({ queryKey: ["production", "candidates"], queryFn: () => api.get<Candidate[]>("/production") });
  const NOT_QUEUED: ProdStatus[] = ["PENDING_MEASURE", "MEASURED", "PENDING_MEETING", "REVISING", "PENDING_CONFIRM"];
  const candidates = (prodData?.data ?? []).filter((p) => NOT_QUEUED.includes(p.status));
  const [pickId, setPickId] = useState("");

  const submit = async () => {
    setErr(null); setSaving(true);
    try {
      if (tab === "adhoc") {
        if (!cust.trim()) { setErr("กรุณาระบุชื่อลูกค้า"); setSaving(false); return; }
        await api.post("/production-schedule", { customer_name: cust, title, produce_date: pdate, install_date: idate, producer_note: producer });
      } else {
        if (!pickId) { setErr("กรุณาเลือกงาน"); setSaving(false); return; }
        await api.patch(`/production/${pickId}`, { status: "QUEUED", production_queued: pdate, ...(idate ? { planned_install_date: idate } : {}) });
      }
      onSaved();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); setSaving(false); }
  };

  const inp = "w-full glass-card rounded-xl px-3.5 py-2.5 text-base text-white outline-none placeholder-white/40 min-h-[48px]";
  const dinp = `${inp} tnum [&::-webkit-calendar-picker-indicator]:invert`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      {/* flex-col + header/footer ติดขอบ → ปิด/บันทึกเห็นเสมอแม้เนื้อหายาว */}
      <div className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl fade-in flex flex-col max-h-[88dvh]">
        {/* header (ปิดได้เสมอ) */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-white/10">
          <h2 className="text-white font-bold text-lg">เพิ่มงานผลิต</h2>
          <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-10 h-10 inline-flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10"><X size={20} /></button>
        </div>

        {/* body (scroll) */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* tabs */}
          <div className="flex gap-1.5 glass-card rounded-xl p-1 mb-4">
            {[["adhoc", "จดเอง"], ["job", "เลือกจากงานในระบบ"]].map(([t, l]) => (
              <button key={t} onClick={() => { setTab(t as "adhoc" | "job"); setErr(null); }}
                className={`focusable pressable flex-1 px-3 py-2 rounded-lg text-[13px] font-medium min-h-[40px] ${tab === t ? "bg-white text-[#1F4E78]" : "text-white/70"}`}>{l}</button>
            ))}
          </div>

          {tab === "adhoc" ? (
            <div className="space-y-3">
              <div><label className="block text-[13px] mb-1 text-white">ชื่อลูกค้า *</label>
                <input value={cust} onChange={(e) => setCust(e.target.value)} placeholder="เช่น คุณสมชาย / บ้านทรายทอง" className={inp} autoFocus /></div>
              <div><label className="block text-[13px] mb-1 text-white">ชื่อ/รายละเอียดงาน (ไม่บังคับ)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ซ่อมบานเลื่อน / งานด่วน" className={inp} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[13px] mb-1 text-white">วันผลิต</label>
                  <input type="date" value={pdate} onChange={(e) => setPdate(e.target.value)} className={dinp} /></div>
                <div><label className="block text-[13px] mb-1 text-white">วันติดตั้ง/ส่ง</label>
                  <input type="date" value={idate} onChange={(e) => setIdate(e.target.value)} className={dinp} /></div>
              </div>
              <div><label className="block text-[13px] mb-1 text-white">ช่างผลิต</label>
                <input value={producer} onChange={(e) => setProducer(e.target.value)} placeholder="ชื่อช่าง" className={inp} /></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div><label className="block text-[13px] mb-1 text-white">เลือกงานในระบบ (ยังไม่ลงคิว) *</label>
                <select value={pickId} onChange={(e) => setPickId(e.target.value)} className={`${inp} appearance-none`}>
                  <option value="">— เลือกงาน —</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.job?.job_code} · {c.job?.customer_name} ({PROD_STATUS[c.status]})</option>)}
                </select>
                {candidates.length === 0 && <p className="text-[12px] text-amber-200 mt-1">ไม่มีงานที่ยังไม่ลงคิว — งานที่ลงคิวแล้วอยู่ในตารางด้านนอก</p>}</div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[13px] mb-1 text-white">วันผลิต</label>
                  <input type="date" value={pdate} onChange={(e) => setPdate(e.target.value)} className={dinp} /></div>
                <div><label className="block text-[13px] mb-1 text-white">วันติดตั้ง</label>
                  <input type="date" value={idate} onChange={(e) => setIdate(e.target.value)} className={dinp} /></div>
              </div>
              <p className="text-[12px]" style={{ color: "var(--t-low)" }}>เลือกแล้วงานจะเข้าสถานะ “ลงคิวผลิต” + ใส่วันให้</p>
            </div>
          )}

          {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
        </div>

        {/* footer (ปุ่มเห็นเสมอ) */}
        <div className="flex gap-2 px-5 py-4 shrink-0 border-t border-white/10">
          <button onClick={onClose} className="focusable pressable glass-card text-white rounded-2xl px-5 min-h-[52px] font-medium">ปิด</button>
          <button onClick={submit} disabled={saving} className="focusable pressable flex-1 min-h-[52px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Check size={20} />} บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
