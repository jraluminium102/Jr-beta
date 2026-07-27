"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn, baht, thDate } from "@/lib/format";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import {
  ClipboardList, Clock, Factory, Wrench, Banknote, PackageCheck,
  ChevronRight, Search, ExternalLink,
} from "@/components/ui/icons";
import OpsSummaryDrawer from "./OpsSummaryDrawer";

// ─── Response shapes (mirror /api/operations) ────────────────────────────────
type PhaseJob = {
  id: string; job_code: string | null; customer_name: string; customer_tel: string | null;
  customer_area: string | null; current_stage: number; stage_name: string; on_hold: boolean; days: number;
};
type PhaseBucket = { count: number; jobs: PhaseJob[] };
type Ops = {
  assess: { bkk: number; south: number; total: number };
  followup: { total: number; byMonth: { month: string; count: number; net: number | null }[] };
  phases: { awaitProd: PhaseBucket; producing: PhaseBucket; installing: PhaseBucket };
  completed: { count: number };
};
type CompletedRow = {
  id: string; job_code: string | null; customer_name: string; customer_tel: string | null;
  customer_area: string | null; net: number | null; deposit_date: string | null; completed_date: string | null;
};

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function monthLabel(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  return `${TH_MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 1: รอเข้าประเมิน (นับอย่างเดียว — กดไม่ได้)
// ══════════════════════════════════════════════════════════════════════════════
function AssessSection({ assess }: { assess: Ops["assess"] }) {
  const tone = assess.total >= 15 ? "text-rose-300" : assess.total >= 6 ? "text-amber-300" : "text-emerald-300";
  const toneWord = assess.total >= 15 ? "คิวแน่นมาก" : assess.total >= 6 ? "คิวปานกลาง" : "คิวว่าง";
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sky-300"><ClipboardList size={18} /></span>
        <h2 className="text-white font-semibold">ลูกค้ารอเข้าประเมิน</h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/55 border border-white/15">ดูจำนวนอย่างเดียว</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4 sm:p-5">
          <div className="text-[12px] font-medium" style={{ color: "var(--t-low)" }}>รวมทั้งหมด</div>
          <div className={cn("text-3xl font-bold mt-1.5 tnum", tone)}>{assess.total}</div>
          <div className="text-[12px] mt-1.5" style={{ color: "var(--t-low)" }}>{toneWord}</div>
        </div>
        <div className="glass-card rounded-2xl p-4 sm:p-5">
          <div className="text-[12px] font-medium" style={{ color: "var(--t-low)" }}>สาขา กทม.</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1.5 tnum text-white">{assess.bkk}</div>
          <div className="text-[12px] mt-1.5" style={{ color: "var(--t-low)" }}>คิวรอประเมิน</div>
        </div>
        <div className="glass-card rounded-2xl p-4 sm:p-5">
          <div className="text-[12px] font-medium" style={{ color: "var(--t-low)" }}>สาขาภาคใต้</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1.5 tnum text-white">{assess.south}</div>
          <div className="text-[12px] mt-1.5" style={{ color: "var(--t-low)" }}>ภูเก็ต/13 จังหวัดใต้</div>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 2: รอติดตามงาน (ส่งใบเสนอแล้ว ยังไม่มัดจำ) — แยกเดือน + ลิงก์ติดตามงาน
// ══════════════════════════════════════════════════════════════════════════════
function FollowupSection({ fu }: { fu: Ops["followup"] }) {
  const maxCount = Math.max(1, ...fu.byMonth.map((m) => m.count));
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-violet-300"><Clock size={18} /></span>
          <h2 className="text-white font-semibold">รอติดตามงาน (ส่งใบเสนอแล้ว ยังไม่มัดจำ)</h2>
        </div>
        <a href="/follow-up" className="focusable pressable inline-flex items-center gap-1 text-[12px] text-sky-300 hover:underline shrink-0">
          เปิดหน้าติดตามงาน <ExternalLink size={13} />
        </a>
      </div>
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-bold text-white tnum">{fu.total}</span>
          <span className="text-sm" style={{ color: "var(--t-low)" }}>ราย รอลูกค้าตัดสินใจ</span>
        </div>
        {fu.byMonth.length === 0 ? (
          <div className="text-[12px]" style={{ color: "var(--t-low)" }}>ยังไม่มีงานที่ส่งใบเสนอ</div>
        ) : (
          <div className="space-y-2.5">
            <div className="text-[11px] mb-1" style={{ color: "var(--t-low)" }}>แยกตามเดือนที่ส่งใบเสนอ (กดเพื่อไปติดตาม)</div>
            {fu.byMonth.map((m) => (
              <a
                key={m.month}
                href="/follow-up"
                className="focusable press flex items-center gap-3 group"
                title={`ไปหน้าติดตามงาน — ${monthLabel(m.month)}`}
              >
                <span className="text-[12px] w-20 shrink-0 tabular-nums" style={{ color: "var(--t-mid)" }}>{monthLabel(m.month)}</span>
                <div className="flex-1 h-6 rounded-lg bg-white/6 overflow-hidden relative">
                  <div className="h-full rounded-lg bg-violet-400/50 group-hover:bg-violet-400/70 transition-all" style={{ width: `${Math.round((m.count / maxCount) * 100)}%` }} />
                  <span className="absolute left-2 top-0 h-6 flex items-center text-[12px] font-semibold text-white tnum">{m.count}</span>
                </div>
                <span className="text-[11px] w-24 text-right shrink-0 tabular-nums" style={{ color: "var(--t-low)" }}>{m.net != null ? `฿${baht(m.net)}` : ""}</span>
                <ChevronRight size={14} className="text-white/30 group-hover:text-white/70 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 3-5: Pipeline phase cards (expandable)
// ══════════════════════════════════════════════════════════════════════════════
function PhaseCard({
  icon, iconTone, title, sub, bucket, href, hrefLabel,
}: {
  icon: React.ReactNode; iconTone: string; title: string; sub: string;
  bucket: PhaseBucket; href: string; hrefLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focusable pressable w-full text-left px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors"
      >
        <span className={cn("shrink-0", iconTone)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-white font-semibold text-sm">{title}</div>
          <div className="text-[11px]" style={{ color: "var(--t-low)" }}>{sub}</div>
        </div>
        <span className="text-2xl font-bold text-white tnum shrink-0">{bucket.count}</span>
        <ChevronRight size={18} className={cn("text-white/40 shrink-0 transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-4 border-t border-white/8 pt-3">
          {bucket.jobs.length === 0 ? (
            <div className="text-[12px] py-2" style={{ color: "var(--t-low)" }}>ไม่มีงานในเฟสนี้</div>
          ) : (
            <>
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {bucket.jobs.map((j) => (
                  <a
                    key={j.id}
                    href={href}
                    className="focusable press flex items-center gap-2 rounded-xl px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/8"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-[13px] font-medium tnum">{j.job_code ?? "—"}</span>
                        <span className="text-white/85 text-[13px] truncate">{j.customer_name}</span>
                        {j.on_hold && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 shrink-0">พัก</span>}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: "var(--t-low)" }}>
                        {j.stage_name}{j.customer_area ? ` · ${j.customer_area}` : ""}
                      </div>
                    </div>
                    <span className={cn("text-[11px] tnum shrink-0", j.days > 7 ? "text-amber-300" : "text-white/45")}>
                      {j.days} วัน
                    </span>
                    <ChevronRight size={14} className="text-white/30 shrink-0" />
                  </a>
                ))}
              </div>
              <a href={href} className="focusable press inline-flex items-center gap-1 mt-3 text-[12px] text-sky-300 hover:underline">
                {hrefLabel} <ChevronRight size={13} />
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 6: งานจบแล้ว — คลัง data + BOQ (search + drawer)
// ══════════════════════════════════════════════════════════════════════════════
function CompletedSection({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState<{ id: string; job_code: string | null; customer_name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ops-completed", q],
    queryFn: () => api.get<CompletedRow[]>(`/operations/completed${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    enabled: open,
    staleTime: 30_000,
  });
  const rows = data?.data ?? [];

  return (
    <section>
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focusable pressable w-full text-left px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors"
        >
          <span className="text-emerald-300 shrink-0"><PackageCheck size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-white font-semibold text-sm">งานที่จบแล้ว 🏁</div>
            <div className="text-[11px]" style={{ color: "var(--t-low)" }}>คลังข้อมูลย้อนหลัง — กดดูใบเสนอ / มัดจำ / วันติดตั้ง / ของที่ใช้ (BOQ)</div>
          </div>
          <span className="text-2xl font-bold text-white tnum shrink-0">{count}</span>
          <ChevronRight size={18} className={cn("text-white/40 shrink-0 transition-transform", open && "rotate-90")} />
        </button>

        {open && (
          <div className="px-4 sm:px-5 pb-4 border-t border-white/8 pt-3">
            <label className="glass-card rounded-xl flex items-center gap-2.5 px-3.5 py-2.5 mb-3 min-h-[44px] focusable" style={{ color: "var(--t-mid)" }}>
              <Search size={18} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า / Job ID"
                aria-label="ค้นหางานจบแล้ว"
                className="bg-transparent outline-none text-sm text-white placeholder-white/45 w-full"
              />
            </label>

            {isLoading ? <Spinner /> : rows.length === 0 ? (
              <EmptyState title={q ? "ไม่พบงานที่ค้นหา" : "ยังไม่มีงานที่จบ"} />
            ) : (
              <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setDrawer({ id: r.id, job_code: r.job_code, customer_name: r.customer_name })}
                    className="focusable press w-full text-left flex items-center gap-2 rounded-xl px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/8"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-[13px] font-medium tnum">{r.job_code ?? "—"}</span>
                        <span className="text-white/85 text-[13px] truncate">{r.customer_name}</span>
                      </div>
                      <div className="text-[11px] truncate" style={{ color: "var(--t-low)" }}>
                        {r.completed_date ? `จบงาน ${thDate(r.completed_date)}` : r.deposit_date ? `มัดจำ ${thDate(r.deposit_date)}` : ""}
                        {r.customer_area ? ` · ${r.customer_area}` : ""}
                      </div>
                    </div>
                    {r.net != null && <span className="text-[12px] tnum shrink-0" style={{ color: "var(--t-mid)" }}>฿{baht(r.net)}</span>}
                    <ChevronRight size={14} className="text-white/30 shrink-0" />
                  </button>
                ))}
                {rows.length >= 400 && (
                  <div className="text-[11px] text-center pt-2" style={{ color: "var(--t-low)" }}>
                    แสดงล่าสุด 400 รายการ — พิมพ์ค้นหาชื่อ/Job ID เพื่อเจาะจงงานเก่า
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {drawer && (
        <OpsSummaryDrawer
          jobId={drawer.id}
          jobCode={drawer.job_code}
          customerName={drawer.customer_name}
          onClose={() => setDrawer(null)}
        />
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Page
// ══════════════════════════════════════════════════════════════════════════════
export default function OperationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["operations"],
    queryFn: () => api.get<Ops>("/operations").then((r) => r.data),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return <div className="p-6"><Spinner label="กำลังโหลดภาพรวมงาน…" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 fade-in space-y-6 sm:space-y-7 max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">ภาพรวมงาน</h1>
        <p className="text-sm" style={{ color: "var(--t-low)" }}>
          สถานะลูกค้าตลอดสายงาน — ตั้งแต่รอประเมิน จนจบงาน
        </p>
      </div>

      <AssessSection assess={data.assess} />
      <FollowupSection fu={data.followup} />

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-orange-300"><Factory size={18} /></span>
          <h2 className="text-white font-semibold">งานในสายผลิต–ติดตั้ง</h2>
          <span className="text-[11px]" style={{ color: "var(--t-low)" }}>(กดเพื่อดูรายชื่อลูกค้า)</span>
        </div>
        <div className="space-y-3">
          <PhaseCard
            icon={<Banknote size={20} />} iconTone="text-emerald-300"
            title="เฟสรอผลิต (พึ่งมัดจำ)" sub="มัดจำแล้ว ยังไม่เข้าระบบช่าง"
            bucket={data.phases.awaitProd} href="/production" hrefLabel="ไปหน้าผลิต"
          />
          <PhaseCard
            icon={<Factory size={20} />} iconTone="text-orange-300"
            title="เฟสผลิต" sub="วัดจริง · ประชุมแบบ · สั่งของ · ผลิต · QC"
            bucket={data.phases.producing} href="/production" hrefLabel="ไปหน้าผลิต"
          />
          <PhaseCard
            icon={<Wrench size={20} />} iconTone="text-violet-300"
            title="เฟสติดตั้ง" sub="รอติดตั้ง · เข้าติดตั้ง · ตรวจรับ"
            bucket={data.phases.installing} href="/installation" hrefLabel="ไปหน้าติดตั้ง"
          />
        </div>
      </section>

      <CompletedSection count={data.completed.count} />
    </div>
  );
}
