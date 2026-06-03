"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Search, X } from "@/components/ui/icons";
import type { IssuePhase, IssueType } from "@/lib/database.types";

type JobOpt = { id: string; job_code: string; customer_name: string };

const PHASES: { v: IssuePhase; th: string }[] = [
  { v: "SALES", th: "ขาย" }, { v: "MEASUREMENT", th: "วัดจริง" }, { v: "PRODUCTION", th: "ผลิต" },
  { v: "INSTALLATION", th: "ติดตั้ง" }, { v: "POST_SALE", th: "หลังขาย" },
];
const TYPES: { v: IssueType; th: string }[] = [
  { v: "CUSTOMER_COMPLAINT", th: "ลูกค้าไม่พอใจ" }, { v: "CUSTOMER_CHANGES", th: "ลูกค้าปรับเยอะ" },
  { v: "WRONG_DESIGN", th: "แบบผิด" }, { v: "MATERIAL_SHORTAGE", th: "วัสดุขาด" },
  { v: "PRODUCTION_DELAY", th: "ผลิตเลท" }, { v: "INSTALLATION_DELAY", th: "ติดตั้งช้า" }, { v: "OTHER", th: "อื่นๆ" },
];

export function CreateIssueModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [jobId, setJobId] = useState("");
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<IssuePhase>("INSTALLATION");
  const [type, setType] = useState<IssueType>("CUSTOMER_COMPLAINT");
  const [detail, setDetail] = useState("");
  const [owner, setOwner] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const { data: jobs } = useQuery({ queryKey: ["jobs", "issue-picker"], queryFn: () => api.get<JobOpt[]>("/jobs?limit=100").then((r) => r.data) });
  const filtered = useMemo(() => {
    const list = jobs ?? [];
    if (!q) return list;
    return list.filter((j) => j.customer_name.includes(q) || j.job_code.toLowerCase().includes(q.toLowerCase()));
  }, [jobs, q]);
  const selected = (jobs ?? []).find((j) => j.id === jobId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!jobId) { setErr("กรุณาเลือกงาน"); return; }
    if (!detail.trim()) { setErr("กรุณาระบุรายละเอียดปัญหา"); return; }
    setSaving(true);
    try {
      await api.post("/issues", { job_id: jobId, phase, type, detail, owner_name: owner || undefined });
      onSaved();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const field = "focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] placeholder-white/40 [&>option]:text-gray-800";
  const lbl = "block text-[12px] mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="แจ้งปัญหาใหม่">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md glass rounded-3xl p-6 fade-in max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">แจ้งปัญหาใหม่</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10"><X size={20} /></button>
        </div>

        {/* job picker */}
        <div className="mb-3">
          <label className={lbl} style={{ color: "var(--t-low)" }}>เลือกงาน <span className="text-rose-300">*</span></label>
          {jobId && selected ? (
            <div className="flex items-center justify-between glass-card rounded-xl px-3.5 py-2.5">
              <span className="text-white text-sm font-medium tnum">{selected.job_code} · {selected.customer_name}</span>
              <button type="button" onClick={() => setJobId("")} className="focusable text-[12px] text-sky-200 hover:underline">เปลี่ยน</button>
            </div>
          ) : (
            <>
              <div className="glass-card rounded-xl flex items-center gap-2.5 px-3.5 py-2.5 min-h-[44px] focusable mb-2" style={{ color: "var(--t-mid)" }}>
                <Search size={18} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / Job ID" aria-label="ค้นหางาน" className="bg-transparent outline-none text-sm text-white placeholder-white/45 w-full" />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {filtered.length === 0 && <div className="text-[12px] px-1 py-2" style={{ color: "var(--t-low)" }}>ไม่พบงาน</div>}
                {filtered.map((j) => (
                  <button type="button" key={j.id} onClick={() => setJobId(j.id)}
                    className="focusable pressable w-full text-left bg-white/8 hover:bg-white/16 border border-white/10 rounded-xl px-3 py-2.5">
                    <span className="text-white text-sm font-medium tnum">{j.job_code}</span><span className="text-[12px] ml-2" style={{ color: "var(--t-low)" }}>{j.customer_name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="ph">Phase</label>
            <select id="ph" value={phase} onChange={(e) => setPhase(e.target.value as IssuePhase)} className={field}>
              {PHASES.map((p) => <option key={p.v} value={p.v}>{p.th}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="ty">ประเภท</label>
            <select id="ty" value={type} onChange={(e) => setType(e.target.value as IssueType)} className={field}>
              {TYPES.map((t) => <option key={t.v} value={t.v}>{t.th}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="dt">รายละเอียดปัญหา <span className="text-rose-300">*</span></label>
          <textarea id="dt" value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} className={`${field} resize-none`} placeholder="เช่น ลูกค้าโทรมาแจ้งว่าบานเลื่อนฝืด" />
        </div>
        <div className="mb-1">
          <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="ow">ผู้รับผิดชอบ (ถ้ามี)</label>
          <input id="ow" value={owner} onChange={(e) => setOwner(e.target.value)} className={field} placeholder="ชื่อผู้รับผิดชอบ" />
        </div>

        {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="focusable pressable flex-1 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px]">ยกเลิก</button>
          <button type="submit" disabled={saving} className="focusable pressable flex-1 bg-white text-[#1F4E78] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/90 min-h-[44px] disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />} แจ้งปัญหา
          </button>
        </div>
      </form>
    </div>
  );
}
