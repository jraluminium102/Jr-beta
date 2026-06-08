"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { PROD_STATUS } from "@/lib/constants";
import { Chip, EmptyState } from "@/components/ui/primitives";
import { Check } from "@/components/ui/icons";
import type { ProdStatus } from "@/lib/database.types";
import type { ProdRow } from "./ProductionStepModal";

type QRow = ProdRow & { production_queued: string | null; planned_install_date: string | null };

// แปลง ISO → DD/MM/พ.ศ.(2หลัก)
const th = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${(Number(y) + 543) % 100}`;
};

// ตารางคิวผลิตสำหรับช่าง — ดูง่าย แก้วันที่/ใส่ชื่อช่างได้ในที่เดียว
// แสดงงานที่ลงคิวแล้ว (QUEUED) + กำลังผลิต (MANUFACTURING) เรียงตามวันเริ่มผลิต
export function ProductionQueueTable({ rows, canWrite, onChanged }: {
  rows: QRow[]; canWrite: boolean; onChanged: () => void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  // local override เพื่อให้พิมพ์/เลือกแล้วเห็นทันที (optimistic)
  const [draft, setDraft] = useState<Record<string, Partial<QRow>>>({});

  const queue = rows
    .filter((r) => r.status === "QUEUED" || r.status === "MANUFACTURING")
    .sort((a, b) => (a.production_queued ?? "9999").localeCompare(b.production_queued ?? "9999"));

  const val = (r: QRow, k: keyof QRow) => (draft[r.id]?.[k] ?? r[k] ?? "") as string;

  const save = async (r: QRow, patch: Partial<QRow>) => {
    setDraft((d) => ({ ...d, [r.id]: { ...d[r.id], ...patch } }));
    setSavingId(r.id);
    try {
      await api.patch(`/production/${r.id}`, patch);
      setSavedId(r.id);
      setTimeout(() => setSavedId((s) => (s === r.id ? null : s)), 1500);
      onChanged();
    } finally {
      setSavingId((s) => (s === r.id ? null : s));
    }
  };

  const advance = (r: QRow) => {
    if (r.status === "QUEUED") save(r, { status: "MANUFACTURING" } as Partial<QRow>);
    else if (r.status === "MANUFACTURING") save(r, { status: "QC", production_done: new Date().toISOString().slice(0, 10) } as Partial<QRow>);
  };

  if (queue.length === 0)
    return <EmptyState title="ยังไม่มีงานในคิวผลิต" sub="งานจะเข้าคิวเมื่อกด 'ลงคิวผลิต' ในการ์ดงาน" />;

  const dateCls = "glass-card rounded-lg px-2 py-2 text-[13px] text-white outline-none tnum w-full min-h-[42px] [&::-webkit-calendar-picker-indicator]:invert disabled:opacity-60";
  const txtCls = "glass-card rounded-lg px-2.5 py-2 text-[13px] text-white outline-none w-full min-h-[42px] placeholder-white/35 disabled:opacity-60";

  return (
    <div className="space-y-2">
      {/* หัวตาราง (เฉพาะจอใหญ่) */}
      <div className="hidden lg:grid grid-cols-[1.4fr_1.1fr_1.1fr_1.3fr_1fr_auto] gap-2 px-3 text-[12px] font-semibold" style={{ color: "var(--t-low)" }}>
        <span>งาน / ลูกค้า</span><span>วันเริ่มผลิต</span><span>วันติดตั้ง (นัด)</span><span>ช่างผลิต</span><span>สถานะ</span><span></span>
      </div>

      {queue.map((r) => (
        <div key={r.id} className="glass-card rounded-2xl p-3 grid grid-cols-2 lg:grid-cols-[1.4fr_1.1fr_1.1fr_1.3fr_1fr_auto] gap-2 lg:items-center">
          {/* งาน/ลูกค้า */}
          <div className="col-span-2 lg:col-span-1 min-w-0">
            <div className="text-white font-semibold tnum text-sm">{r.job?.job_code}</div>
            <div className="text-[12px] truncate" style={{ color: "var(--t-mid)" }}>{r.job?.customer_name} · {r.job?.customer_area ?? "—"}</div>
          </div>

          {/* วันเริ่มผลิต */}
          <label className="block">
            <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: "var(--t-low)" }}>วันเริ่มผลิต</span>
            <input type="date" disabled={!canWrite || savingId === r.id} value={val(r, "production_queued")}
              onChange={(e) => save(r, { production_queued: e.target.value } as Partial<QRow>)} className={dateCls} aria-label={`วันเริ่มผลิต ${r.job?.job_code}`} />
          </label>

          {/* วันติดตั้ง */}
          <label className="block">
            <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: "var(--t-low)" }}>วันติดตั้ง (นัด)</span>
            <input type="date" disabled={!canWrite || savingId === r.id} value={val(r, "planned_install_date")}
              onChange={(e) => save(r, { planned_install_date: e.target.value } as Partial<QRow>)} className={dateCls} aria-label={`วันติดตั้ง ${r.job?.job_code}`} />
          </label>

          {/* ช่างผลิต */}
          <label className="block">
            <span className="lg:hidden block text-[11px] mb-0.5" style={{ color: "var(--t-low)" }}>ช่างผลิต</span>
            <input type="text" disabled={!canWrite} placeholder="ใส่ชื่อช่าง…" value={val(r, "producer_note")}
              onChange={(e) => setDraft((d) => ({ ...d, [r.id]: { ...d[r.id], producer_note: e.target.value } }))}
              onBlur={(e) => { const v = e.target.value; if (v !== (r.producer_note ?? "")) save(r, { producer_note: v } as Partial<QRow>); }}
              className={txtCls} aria-label={`ช่างผลิต ${r.job?.job_code}`} />
          </label>

          {/* สถานะ */}
          <div className="flex items-center gap-1.5">
            <Chip>{PROD_STATUS[r.status as ProdStatus]}</Chip>
            {savedId === r.id && <span className="text-emerald-300 text-[11px] flex items-center gap-0.5"><Check size={12} /> บันทึก</span>}
          </div>

          {/* ปุ่มไปขั้นต่อไป */}
          {canWrite && (
            <button onClick={() => advance(r)} disabled={savingId === r.id}
              className="col-span-2 lg:col-span-1 focusable pressable bg-white/90 text-[#1F4E78] rounded-xl px-3 py-2 text-[13px] font-semibold min-h-[42px] disabled:opacity-60 whitespace-nowrap">
              {r.status === "QUEUED" ? "เริ่มผลิต →" : "ผลิตเสร็จ → QC"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
