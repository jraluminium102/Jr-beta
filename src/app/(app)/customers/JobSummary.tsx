"use client";

import { useEffect, useState } from "react";
import { thDate } from "@/lib/format";
import { baht } from "@/lib/money";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Summary = {
  job: { deposit_amount?: number; deposit_date?: string | null; net_amount?: number; status?: string; current_stage?: number } | null;
  quotations: { id: number; code: string; issue_date: string; net: number | null; total: number | null; status: string }[];
  install: { status?: string; completed_date?: string | null; install_actual?: string | null; install_scheduled?: string | null } | null;
  materials: { name: string; sku: string | null; unit: string; qty: number }[];
  cutlists: { id: string; code: string | null; name: string | null; status: string; stock_cut_at: string | null }[];
};

const nqty = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 py-2.5 border-b border-black/[0.06] last:border-0">
      <span className="w-5 text-center text-[15px] shrink-0 leading-6">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-ink-3 mb-0.5">{label}</div>
        <div className="text-sm text-ink-1">{children}</div>
      </div>
    </div>
  );
}

// การ์ด "สรุปงาน" — รวม มัดจำ/ใบเสนอ/ติดตั้ง/ของที่ใช้ ต่อ 1 งาน (ดึงสด)
export default function JobSummary({ jobId }: { jobId: string }) {
  const [d, setD] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/jobs/${jobId}/summary`)
      .then((r) => r.json())
      .then((j: Any) => { if (alive) setD((j?.data ?? null) as Summary | null); })
      .catch(() => { if (alive) setD(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [jobId]);

  if (loading) return <div className="mt-1 rounded-xl bg-white border border-black/[0.08] px-3 py-3 text-xs text-ink-3">กำลังโหลดสรุปงาน…</div>;
  if (!d) return <div className="mt-1 rounded-xl bg-white border border-black/[0.08] px-3 py-3 text-xs text-ink-3">โหลดสรุปงานไม่สำเร็จ</div>;

  const j = d.job;
  const done = j?.status === "COMPLETED";

  return (
    <div className="mt-1 rounded-xl bg-white border border-black/[0.08] px-3.5 shadow-sm">
      <Row icon="💰" label="มัดจำ">
        {j?.deposit_date
          ? <>{thDate(j.deposit_date)}{j.deposit_amount != null && <> · <b className="text-emerald-700">฿{baht(Number(j.deposit_amount))}</b></>}</>
          : <span className="text-ink-3">ยังไม่มัดจำ</span>}
      </Row>

      <Row icon="🧾" label={`ใบเสนอราคา${d.quotations.length ? ` (${d.quotations.length})` : ""}`}>
        {d.quotations.length ? (
          <div className="space-y-1">
            {d.quotations.map((q) => {
              const amt = q.net ?? q.total;
              return (
                <a key={q.id} href={`/quotations/${q.id}`} className="press flex items-baseline justify-between gap-2 hover:text-brand-dark">
                  <span className="font-mono text-brand-dark">{q.code}</span>
                  <span className="text-ink-2 tabular-nums shrink-0">{amt != null ? `฿${baht(Number(amt))} ` : ""}<span className="text-ink-3 text-[11px]">{thDate(q.issue_date)}</span></span>
                </a>
              );
            })}
          </div>
        ) : <span className="text-ink-3">—</span>}
      </Row>

      <Row icon="🔧" label="ติดตั้ง">
        {d.install?.completed_date
          ? <span className="text-emerald-700 font-medium">✓ ติดตั้งเสร็จ · จบงาน {thDate(d.install.completed_date)}</span>
          : d.install?.install_actual
            ? <>ติดตั้งแล้ว {thDate(d.install.install_actual)}</>
            : d.install?.install_scheduled
              ? <span className="text-ink-3">นัดติดตั้ง {thDate(d.install.install_scheduled)}</span>
              : <span className="text-ink-3">ยังไม่ติดตั้ง</span>}
      </Row>

      <Row icon="📦" label={`ของที่ใช้ในงาน${d.materials.length ? ` (${d.materials.length})` : ""}`}>
        {d.materials.length ? (
          <div className="space-y-0.5">
            {d.materials.slice(0, 12).map((m, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{m.name}{m.sku ? <span className="text-ink-3 text-[11px]"> · {m.sku}</span> : ""}</span>
                <span className="tabular-nums text-ink-2 shrink-0">{nqty(m.qty)} {m.unit}</span>
              </div>
            ))}
            {d.materials.length > 12 && <div className="text-[11px] text-ink-3">…อีก {d.materials.length - 12} รายการ</div>}
          </div>
        ) : d.cutlists.length ? <span className="text-ink-3">มีใบตัด {d.cutlists.length} ใบ (ยังไม่ตัดสต็อก)</span>
          : <span className="text-ink-3">—</span>}
        {d.cutlists.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {d.cutlists.map((c) => (
              <a key={c.id} href={`/cutlist/${c.id}`} className="press text-[11px] px-1.5 py-0.5 rounded bg-brand/[0.08] text-brand-dark border border-brand/15">✂️ {c.code || c.name || "ใบตัด"}</a>
            ))}
          </div>
        )}
      </Row>

      {done && <div className="pb-2.5 -mt-1 text-[11px] text-emerald-700 font-medium">🏁 งานนี้จบแล้ว</div>}
    </div>
  );
}
