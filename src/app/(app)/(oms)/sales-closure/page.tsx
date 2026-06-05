"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { baht } from "@/lib/format";
import { Spinner, EmptyState, StatCard } from "@/components/ui/primitives";
import { ClosureActions } from "@/components/sales-closure/ClosureActions";
import type { ClosureRow } from "@/app/api/sales-closure/route";

// Stage badge colours — 5=sky, 6=amber, 7=violet
const STAGE_CHIP: Record<number, string> = {
  5: "bg-sky-500/20 text-sky-100 border-sky-300/25",
  6: "bg-amber-500/20 text-amber-100 border-amber-300/25",
  7: "bg-violet-500/20 text-violet-100 border-violet-300/25",
};

// Design-state badge colours
const DESIGN_CHIP: Record<string, string> = {
  NOT_STARTED:      "bg-slate-500/20 text-slate-100 border-slate-300/25",
  DRAWING:          "bg-sky-500/20 text-sky-100 border-sky-300/25",
  PENDING_CUSTOMER: "bg-teal-500/20 text-teal-100 border-teal-300/25",
  REVISING:         "bg-amber-500/20 text-amber-100 border-amber-300/25",
  DONE:             "bg-emerald-500/20 text-emerald-100 border-emerald-300/25",
};
const DESIGN_TH: Record<string, string> = {
  NOT_STARTED: "ยังไม่เริ่ม", DRAWING: "กำลังวาด", PENDING_CUSTOMER: "รอลูกค้า",
  REVISING: "แก้แบบ", DONE: "เสร็จแล้ว",
};

function StageBadge({ stage, name }: { stage: number; name: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border tnum ${STAGE_CHIP[stage] ?? "bg-white/10 text-white/80 border-white/20"}`}>
      {stage} · {name}
    </span>
  );
}

function DesignBadge({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${DESIGN_CHIP[state] ?? "bg-white/10 text-white/80 border-white/20"}`}>
      {DESIGN_TH[state] ?? state}
    </span>
  );
}

export default function SalesClosurePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sales-closure"],
    queryFn: () => api.get<ClosureRow[]>("/sales-closure"),
    refetchOnWindowFocus: true,
  });

  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;

  // Quick stats
  const total = rows.length;
  const stage5 = rows.filter((r) => r.current_stage === 5).length;
  const stage6 = rows.filter((r) => r.current_stage === 6).length;
  const stage7 = rows.filter((r) => r.current_stage === 7).length;
  const withQuote = rows.filter((r) => r.quotation_id !== null).length;

  return (
    <div className="p-4 sm:p-6 fade-in">
      {/* Page title */}
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">รอปิดการขาย</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--t-low)" }}>
          งานขั้น 5–7 (ทำใบเสนอ / เจรจา / ส่งใบเสนอ) · ยังไม่ยกเลิก
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="ทั้งหมด" value={total} sub="งานรอปิด" />
        <StatCard label="ทำใบเสนอราคา" value={stage5} sub="ขั้น 5" accent="text-sky-300" />
        <StatCard label="เจรจาราคา" value={stage6} sub="ขั้น 6" accent="text-amber-300" />
        <StatCard label="ส่งใบเสนอแล้ว" value={stage7} sub="ขั้น 7" accent="text-violet-300" />
      </div>

      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="ไม่มีงานในขั้นนี้" sub="เมื่องานเข้าขั้น 5–7 จะปรากฏที่นี่" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-[12px] border-b border-white/12"
                    style={{ color: "var(--t-mid)" }}
                  >
                    <th className="text-left font-medium px-4 py-3">Job ID</th>
                    <th className="text-left font-medium px-4 py-3">ลูกค้า</th>
                    <th className="text-left font-medium px-4 py-3">ขั้น</th>
                    <th className="text-left font-medium px-4 py-3">แบบ</th>
                    <th className="text-left font-medium px-4 py-3">ใบเสนอ</th>
                    <th className="text-right font-medium px-4 py-3">ยอดสุทธิ</th>
                    {canWrite && <th className="text-center font-medium px-4 py-3">ดำเนินการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-white/6 hover:bg-white/8 transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium tnum">
                        {row.job_code ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white/90">{row.customer_name}</td>
                      <td className="px-4 py-3">
                        <StageBadge stage={row.current_stage} name={row.stage_name} />
                      </td>
                      <td className="px-4 py-3">
                        <DesignBadge state={row.design_state} />
                      </td>
                      <td className="px-4 py-3 tnum" style={{ color: "var(--t-mid)" }}>
                        {row.quotation_code ?? <span style={{ color: "var(--t-low)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tnum text-white/90">
                        {row.net != null ? `${baht(row.net)} ฿` : <span style={{ color: "var(--t-low)" }}>—</span>}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3 text-center">
                          <ClosureActions job={row} onRevised={refetch} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="glass-card rounded-2xl p-4 space-y-2.5">
                {/* Top: Job ID + stage */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-white font-semibold tnum text-sm">{row.job_code ?? "—"}</div>
                    <div className="text-white/80 text-sm mt-0.5">{row.customer_name}</div>
                  </div>
                  <StageBadge stage={row.current_stage} name={row.stage_name} />
                </div>

                {/* Middle: design + quote */}
                <div className="flex flex-wrap items-center gap-2">
                  <DesignBadge state={row.design_state} />
                  {row.quotation_code && (
                    <span className="text-[12px] tnum" style={{ color: "var(--t-mid)" }}>
                      {row.quotation_code}
                    </span>
                  )}
                  {row.net != null && (
                    <span className="text-[12px] tnum ml-auto" style={{ color: "var(--t-mid)" }}>
                      {baht(row.net)} ฿
                    </span>
                  )}
                </div>

                {/* Action */}
                {canWrite && (
                  <div className="pt-0.5">
                    <ClosureActions job={row} onRevised={refetch} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer note */}
          <p className="text-[12px] mt-4" style={{ color: "var(--t-low)" }}>
            {withQuote} จาก {total} งานมีใบเสนอราคา · ปุ่ม "ส่งแก้แบบ" เห็นเฉพาะ SALES/ADMIN
          </p>
        </>
      )}
    </div>
  );
}
