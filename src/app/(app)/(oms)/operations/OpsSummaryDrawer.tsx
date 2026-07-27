"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { baht, thDate } from "@/lib/format";
import { X } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/primitives";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Summary = {
  job: { deposit_amount?: number; deposit_date?: string | null; net_amount?: number; status?: string; current_stage?: number; job_code?: string; customer_name?: string } | null;
  quotations: { id: number; code: string; issue_date: string; net: number | null; total: number | null; status: string }[];
  install: { status?: string; completed_date?: string | null; install_actual?: string | null; install_scheduled?: string | null } | null;
  materials: { name: string; sku: string | null; unit: string; qty: number }[];
  cutlists: { id: string; code: string | null; name: string | null; status: string; stock_cut_at: string | null }[];
};

const nqty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-3 border-b border-white/8 last:border-0">
      <span className="w-5 text-center text-base shrink-0 leading-6">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] mb-1" style={{ color: "var(--t-low)" }}>{label}</div>
        <div className="text-sm text-white/90">{children}</div>
      </div>
    </div>
  );
}

// สรุปงาน (BOQ/ใบเสนอ/มัดจำ/ติดตั้ง) โซนเข้ม — เปิดจากภาพรวมงาน แท็บงานจบแล้ว
export default function OpsSummaryDrawer({
  jobId, jobCode, customerName, onClose,
}: { jobId: string; jobCode: string | null; customerName: string; onClose: () => void }) {
  const [d, setD] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const { data } = useQuery({
    queryKey: ["ops-summary", jobId],
    queryFn: () => api.get<Summary>(`/jobs/${jobId}/summary`).then((r) => r.data),
  });
  useEffect(() => { if (data !== undefined) { setD((data ?? null) as Summary | null); setLoading(false); } }, [data]);

  const j = d?.job;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="สรุปงาน">
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md h-[100dvh] glass overflow-y-auto slide-in sm:rounded-l-3xl">
        <div className="sticky top-0 glass px-5 sm:px-6 py-4 flex items-center justify-between z-10 sm:rounded-tl-3xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-lg tnum">{jobCode ?? "—"}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-300/25">🏁 จบงานแล้ว</span>
            </div>
            <div className="text-sm truncate" style={{ color: "var(--t-mid)" }}>{customerName}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10 shrink-0"><X size={20} /></button>
        </div>

        <div className="p-5 sm:p-6">
          {loading ? <div className="pt-6"><Spinner /></div> : !d ? (
            <div className="text-sm text-center py-8" style={{ color: "var(--t-low)" }}>โหลดสรุปงานไม่สำเร็จ</div>
          ) : (
            <div className="glass-card rounded-2xl px-4">
              <Row icon="💰" label="มัดจำ">
                {j?.deposit_date
                  ? <>{thDate(j.deposit_date)}{j.deposit_amount != null && <> · <b className="text-emerald-300">฿{baht(Number(j.deposit_amount))}</b></>}</>
                  : <span style={{ color: "var(--t-low)" }}>ยังไม่มัดจำ</span>}
              </Row>

              <Row icon="🧾" label={`ใบเสนอราคา${d.quotations.length ? ` (${d.quotations.length})` : ""}`}>
                {d.quotations.length ? (
                  <div className="space-y-1.5">
                    {d.quotations.map((q) => {
                      const amt = q.net ?? q.total;
                      return (
                        <a key={q.id} href={`/quotations/${q.id}`} className="press flex items-baseline justify-between gap-2 hover:text-sky-300">
                          <span className="font-mono text-sky-300">{q.code}</span>
                          <span className="tabular-nums shrink-0" style={{ color: "var(--t-mid)" }}>{amt != null ? `฿${baht(Number(amt))} ` : ""}<span className="text-[11px]" style={{ color: "var(--t-low)" }}>{thDate(q.issue_date)}</span></span>
                        </a>
                      );
                    })}
                  </div>
                ) : <span style={{ color: "var(--t-low)" }}>—</span>}
              </Row>

              <Row icon="🔧" label="ติดตั้ง">
                {d.install?.completed_date
                  ? <span className="text-emerald-300 font-medium">✓ ติดตั้งเสร็จ · จบงาน {thDate(d.install.completed_date)}</span>
                  : d.install?.install_actual
                    ? <>ติดตั้งแล้ว {thDate(d.install.install_actual)}</>
                    : d.install?.install_scheduled
                      ? <span style={{ color: "var(--t-low)" }}>นัดติดตั้ง {thDate(d.install.install_scheduled)}</span>
                      : <span style={{ color: "var(--t-low)" }}>—</span>}
              </Row>

              <Row icon="📦" label={`ของที่ใช้ในงาน (BOQ)${d.materials.length ? ` · ${d.materials.length} รายการ` : ""}`}>
                {d.materials.length ? (
                  <div className="space-y-1">
                    {d.materials.map((m, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-2">
                        <span className="truncate">{m.name}{m.sku ? <span className="text-[11px]" style={{ color: "var(--t-low)" }}> · {m.sku}</span> : ""}</span>
                        <span className="tabular-nums shrink-0" style={{ color: "var(--t-mid)" }}>{nqty(m.qty)} {m.unit}</span>
                      </div>
                    ))}
                  </div>
                ) : d.cutlists.length ? <span style={{ color: "var(--t-low)" }}>มีใบตัด {d.cutlists.length} ใบ (ยังไม่ตัดสต็อก)</span>
                  : <span style={{ color: "var(--t-low)" }}>—</span>}
                {d.cutlists.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.cutlists.map((c) => (
                      <a key={c.id} href={`/cutlist/${c.id}`} className="press text-[11px] px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-200 border border-sky-300/20">✂️ {c.code || c.name || "ใบตัด"}</a>
                    ))}
                  </div>
                )}
              </Row>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
