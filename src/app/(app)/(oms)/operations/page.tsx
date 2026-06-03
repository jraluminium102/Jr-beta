"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { JOB_STATUS } from "@/lib/constants";
import { baht } from "@/lib/format";
import { Chip, StatCard, Spinner } from "@/components/ui/primitives";
import { Clock } from "@/components/ui/icons";

type Dash = {
  jobsByStatus: Record<string, number>;
  totalClosed: number; collected: number; outstanding: number; closeRate: number;
  monthlyRevenue: { month: string; quoted: number; closed: number }[];
  openIssues: number; closedIssues: number;
  overdueJobs: { jobCode: string; customerName: string; days: number }[];
  overdueTotal: number;
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dash>("/dashboard").then((r) => r.data),
  });

  if (isLoading || !data) return <div className="p-6"><Spinner /></div>;
  const maxBar = Math.max(...data.monthlyRevenue.flatMap((m) => [m.quoted, m.closed]), 1);
  const fmtMonth = (s: string) => ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][Number(s.slice(5)) - 1];

  return (
    <div className="p-4 sm:p-6 fade-in">
      <h1 className="text-xl sm:text-2xl font-bold text-white">Dashboard</h1>
      <p className="text-sm mb-5" style={{ color: "var(--t-low)" }}>ภาพรวมงาน · อัพเดท real-time</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatCard label="งานทั้งหมด" value={Object.values(data.jobsByStatus).reduce((a, b) => a + b, 0)} sub="ทั้งระบบ" />
        <StatCard label="ยอดปิดได้ (฿)" value={baht(data.totalClosed)} accent="text-emerald-300" sub={`Close rate ${data.closeRate}%`} />
        <StatCard label="รับแล้ว (฿)" value={baht(data.collected)} accent="text-sky-300" />
        <StatCard label="ค้างรับ (฿)" value={baht(data.outstanding)} accent="text-amber-300" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="glass-card rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="text-white font-semibold">ยอดเสนอ vs ปิดได้</div>
            <div className="text-[11px]" style={{ color: "var(--t-low)" }}>6 เดือนล่าสุด</div>
          </div>
          <div className="flex items-end justify-between gap-2 sm:gap-3 h-44" role="img" aria-label="กราฟยอดเสนอกับยอดปิดได้">
            {data.monthlyRevenue.map((mo) => (
              <div key={mo.month} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex items-end justify-center gap-1 h-36">
                  <div className="w-2.5 sm:w-3 rounded-t-md bg-white/25" style={{ height: `${(mo.quoted / maxBar) * 100 || 1}%` }} title={`เสนอ ${baht(mo.quoted)}`} />
                  <div className="w-2.5 sm:w-3 rounded-t-md bg-emerald-400" style={{ height: `${(mo.closed / maxBar) * 100 || 1}%` }} title={`ปิด ${baht(mo.closed)}`} />
                </div>
                <div className="text-[11px]" style={{ color: "var(--t-low)" }}>{fmtMonth(mo.month)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-[12px]" style={{ color: "var(--t-mid)" }}>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white/25" />ยอดเสนอ</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-400" />ปิดได้</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="text-white font-semibold mb-4">งานตามสถานะ</div>
          <div className="space-y-2.5">
            {Object.keys(JOB_STATUS).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <Chip status={k as keyof typeof JOB_STATUS} />
                <span className="text-white font-semibold text-sm tnum">{data.jobsByStatus[k] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4">
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-white font-semibold"><span className="text-amber-300"><Clock size={18} /></span> งานค้างเกิน 7 วัน</div>
            <span className="text-amber-200 text-[12px] font-semibold tnum">{data.overdueTotal} งาน</span>
          </div>
          <div className="space-y-2">
            {data.overdueJobs.length === 0 && <div className="text-[12px]" style={{ color: "var(--t-low)" }}>ไม่มีงานค้าง 🎉</div>}
            {data.overdueJobs.map((o) => (
              <div key={o.jobCode} className="flex items-center justify-between bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
                <div><span className="text-white text-sm font-medium tnum">{o.jobCode}</span><span className="text-[12px] ml-2" style={{ color: "var(--t-low)" }}>{o.customerName}</span></div>
                <span className="text-rose-200 text-[12px] tnum">ไม่อัพเดท {o.days} วัน</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <div className="text-white font-semibold mb-3">Issues</div>
          <div className="flex gap-3">
            <div className="flex-1 bg-rose-500/18 border border-rose-300/25 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-rose-200 tnum">{data.openIssues}</div>
              <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>เปิดอยู่</div>
            </div>
            <div className="flex-1 bg-emerald-500/18 border border-emerald-300/25 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-emerald-200 tnum">{data.closedIssues}</div>
              <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>ปิดแล้ว</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
