"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";
import type { JobSearchResult } from "@/app/api/jobs/search/route";
import type { SiteInfo } from "@/app/api/jobs/[id]/site-info/route";

// สถานที่ทำงาน 1 จุด — ค้นชื่อลูกค้า/งานจากระบบ (autocomplete) หรือพิมพ์เอง (เช่น "โรงงาน","ลากลับบ้าน")
// เลือกจากระบบได้ → ดึงที่อยู่หน้างาน+เบอร์ลูกค้ามาโชว์/ลง PDF ด้วย (ต้นฉบับไม่มี — "ดีกว่าต้นฉบับ")
export default function CrewSiteRow({
  site, canWrite, onPatch, onDelete,
}: {
  site: { id: string; site_no: number; job_id: string | null; customer_name: string; appointment_time: string; address: string | null; phone: string | null; off_board?: boolean };
  canWrite: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [text, setText] = useState(site.customer_name);
  const [apptTime, setApptTime] = useState(site.appointment_time);
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // sync ค่าจากภายนอก (ทำซ้ำ/ดึงจากปฏิทิน แก้ prop ใหม่)
  useEffect(() => { setText(site.customer_name); }, [site.customer_name]);
  useEffect(() => { setApptTime(site.appointment_time); }, [site.appointment_time]);

  function handleTextChange(v: string) {
    setText(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length < 1) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await api.get<JobSearchResult[]>(`/jobs/search?q=${encodeURIComponent(v.trim())}`);
        if (!ctrl.signal.aborted) { setResults(r.data ?? []); setOpen(true); }
      } catch { /* เงียบ — พิมพ์เองได้เสมอ */ }
    }, 300);
  }

  async function pick(j: JobSearchResult) {
    setOpen(false);
    setText(j.customer_name);
    setBusy(true);
    try {
      const info = await api.get<SiteInfo>(`/jobs/${j.id}/site-info`);
      onPatch(site.id, {
        job_id: j.id, customer_name: j.customer_name,
        address: info.data.address ?? j.customer_area ?? null,
        phone: info.data.tel ?? j.customer_tel ?? null,
      });
    } catch {
      onPatch(site.id, { job_id: j.id, customer_name: j.customer_name, address: j.customer_area ?? null, phone: j.customer_tel ?? null });
    } finally { setBusy(false); }
  }

  function unlink() {
    onPatch(site.id, { job_id: null, address: null, phone: null });
  }
  function commitText() {
    if (text.trim() !== site.customer_name) onPatch(site.id, { customer_name: text.trim() });
  }
  function commitAppt() {
    if (apptTime.trim() !== site.appointment_time) onPatch(site.id, { appointment_time: apptTime.trim() });
  }

  return (
    <div className="rounded-lg p-2 bg-white/6 border border-white/10 relative">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] w-4 h-4 flex items-center justify-center rounded bg-white/10 shrink-0" style={{ color: "var(--t-low)" }}>{site.site_no}</span>
        <div className="relative flex-1 min-w-0">
          <input
            value={text} disabled={!canWrite}
            onChange={(e) => handleTextChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => { setTimeout(() => setOpen(false), 150); commitText(); }}
            placeholder="ค้นชื่อลูกค้า/งาน หรือพิมพ์เอง เช่น โรงงาน"
            className="w-full bg-transparent text-white text-[13px] outline-none placeholder:text-white/30"
          />
          {open && results.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl overflow-hidden border border-white/15 max-h-48 overflow-y-auto shadow-lg" style={{ background: "#22242c" }}>
              {results.map((r) => (
                <button key={r.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}
                  className="w-full text-left px-2.5 py-2 text-[12.5px] text-white/90 hover:bg-white/10 border-b border-white/5 last:border-0">
                  <div className="font-medium">{r.customer_name}</div>
                  {r.customer_area && <div className="text-[11px]" style={{ color: "var(--t-low)" }}>{r.customer_area}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
        {site.job_id && canWrite && (
          <button type="button" onClick={unlink} title="เลิกผูกงาน (คงชื่อไว้)" className="text-white/40 hover:text-white/70 p-1 shrink-0">
            <Icon name="close" size={13} />
          </button>
        )}
        {canWrite && (
          <button type="button" onClick={() => onDelete(site.id)} title="ลบจุดนี้" className="text-red-300/70 hover:text-red-300 p-1 shrink-0">
            <Icon name="trash" size={13} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1 pl-6 flex-wrap">
        <input
          value={apptTime} disabled={!canWrite}
          onChange={(e) => setApptTime(e.target.value)}
          onBlur={commitAppt}
          placeholder="เวลานัด"
          className="w-20 bg-white/8 rounded-md px-1.5 py-0.5 text-[11px] text-white outline-none placeholder:text-white/30"
        />
        {/* ธง ⚑ นอกบอร์ดพร้อมติดตั้ง (import SetTeam/งานพิเศษ) — กดสลับได้ */}
        <button type="button" disabled={!canWrite}
          onClick={() => canWrite && onPatch(site.id, { off_board: !site.off_board })}
          title={site.off_board ? "งานนอกบอร์ดพร้อมติดตั้ง (กดเอาธงออก)" : "ทำเครื่องหมายว่างานนอกบอร์ดพร้อมติดตั้ง"}
          className="text-[10.5px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 disabled:opacity-60"
          style={site.off_board
            ? { background: "rgba(239,159,39,.18)", color: "#fcd38a", border: "1px solid rgba(239,159,39,.4)" }
            : { background: "rgba(255,255,255,.06)", color: "var(--t-low)", border: "1px solid rgba(255,255,255,.12)" }}>
          ⚑{site.off_board ? " นอกบอร์ด" : ""}
        </button>
        {(site.address || site.phone) && (
          <span className="text-[11px] truncate" style={{ color: "var(--t-low)" }}>
            {site.address}{site.address && site.phone ? " · " : ""}{site.phone}
          </span>
        )}
      </div>
      {busy && <div className="text-[10px] mt-0.5 pl-6" style={{ color: "var(--t-low)" }}>กำลังดึงที่อยู่หน้างาน…</div>}
    </div>
  );
}
