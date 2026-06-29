"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { INST_STATUS } from "@/lib/constants";
import { Spinner } from "@/components/ui/primitives";
import { ShieldCheck } from "@/components/ui/icons";
import { InstallationStepModal } from "@/components/installation/InstallationStepModal";
import type { InstStatus } from "@/lib/database.types";
import type { InstRow } from "@/components/installation/InstallationStepModal";

type InstallationField = {
  id: string;
  status: InstStatus;
  install_scheduled: string | null;
  install_actual: string | null;
  completed_date: string | null;
  warranty_until: string | null;
};
type Row = {
  id: string;
  job_code: string;
  customer_name: string;
  customer_area: string | null;
  status: string;
  installations: InstallationField[];
};

// ISO → วัน/เดือน/ปี ค.ศ. เต็ม เช่น 28/06/2026
const thInstDate = (d: string | null) => {
  if (!d) return null;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
// ครบทุกสถานะ — กันงานที่ถูกตีกลับ/มีปัญหาหายจากบอร์ด
const COLS: InstStatus[] = ["PENDING", "INSTALLING", "PENDING_INSPECT", "REVISING", "COMPLETED", "ISSUE"];

export default function InstallationPage() {
  const [openInst, setOpenInst] = useState<InstRow | null>(null);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["jobs", "inst"], queryFn: () => api.get<Row[]>("/jobs?limit=500") });
  const jobs = (data?.data ?? []).filter((j) => j.installations?.length && j.status !== "CANCELLED");
  const canInstall = (data?.meta?.can_install as boolean) ?? false;

  const openModal = (j: Row) => {
    const inst = j.installations[0];
    if (!inst) return;
    setOpenInst({
      id: inst.id,
      status: inst.status,
      install_scheduled: inst.install_scheduled,
      install_actual: inst.install_actual,
      completed_date: inst.completed_date,
      warranty_until: inst.warranty_until,
      job: { job_code: j.job_code, customer_name: j.customer_name, customer_area: j.customer_area },
    });
  };

  return (
    <div className="p-4 sm:p-6 fade-in">
      <h1 className="text-xl sm:text-2xl font-bold text-white">ติดตั้ง + ส่งงาน</h1>
      <p className="text-sm mb-5" style={{ color: "var(--t-low)" }}>ติดตั้ง → ลูกค้าตรวจ → จบงาน → รับประกัน · แตะการ์ดเพื่อเปลี่ยนสถานะ</p>
      {isLoading ? <Spinner /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COLS.map((col) => {
            const items = jobs.filter((j) => j.installations[0]?.status === col);
            return (
              <div key={col} className="glass-card rounded-2xl p-3">
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-white text-sm font-semibold">{INST_STATUS[col]}</span>
                  <span className="text-[12px] tnum px-1.5 py-0.5 rounded-md bg-white/10" style={{ color: "var(--t-mid)" }}>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((j) => (
                    <button key={j.id} onClick={() => openModal(j)} aria-label={`อัปเดตสถานะ ${j.job_code}`}
                      className="focusable pressable w-full text-left bg-white/9 hover:bg-white/16 border border-white/10 rounded-xl p-3">
                      <div className="text-white text-sm font-medium tnum">{j.job_code}</div>
                      <div className="text-[12px]" style={{ color: "var(--t-mid)" }}>{j.customer_name}</div>
                      {j.installations[0]?.install_scheduled && (
                        <div className="text-[11px] text-sky-200 mt-1.5 tnum">นัดติดตั้ง: {thInstDate(j.installations[0].install_scheduled)}</div>
                      )}
                      {col === "COMPLETED" && <div className="flex items-center gap-1 text-emerald-200 text-[11px] mt-1.5"><ShieldCheck size={12} /> อยู่ในประกัน</div>}
                    </button>
                  ))}
                  {items.length === 0 && <div className="text-[12px] text-center py-4" style={{ color: "rgba(255,255,255,0.35)" }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {openInst && (
        <InstallationStepModal
          inst={openInst}
          canWrite={canInstall}
          onClose={() => setOpenInst(null)}
          onSaved={() => { setOpenInst(null); refetch(); }}
        />
      )}
    </div>
  );
}
