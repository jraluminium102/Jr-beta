"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { thDate } from "@/lib/format";
import { Spinner } from "@/components/ui/primitives";
import DateField from "@/components/ui/DateField";

type PO = {
  id: string; job_id: string; material: string; title: string; status: "PENDING" | "ORDERED" | "RECEIVED";
  supplier: string | null; order_date: string | null; expected_date: string | null; received_date: string | null; note: string | null;
};

const MAT: Record<string, string> = { ALUM: "อลูมิเนียม", GLASS: "กระจก", HARDWARE: "อุปกรณ์", OTHER: "อื่นๆ" };
const ST: Record<string, { th: string; cls: string }> = {
  PENDING: { th: "รอสั่ง", cls: "bg-slate-500/25 text-slate-100 border-slate-300/30" },
  ORDERED: { th: "สั่งแล้ว", cls: "bg-amber-500/25 text-amber-100 border-amber-300/30" },
  RECEIVED: { th: "ของเข้าแล้ว", cls: "bg-emerald-500/25 text-emerald-100 border-emerald-300/30" },
};
const today = () => new Date().toISOString().slice(0, 10);

export function MaterialsPanel({ jobId }: { jobId: string }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["po", jobId], queryFn: () => api.get<PO[]>(`/purchase-orders?job_id=${jobId}`) });
  const rows = data?.data ?? [];
  const canWrite = (data?.meta?.can_write as boolean) ?? false;

  const [adding, setAdding] = useState(false);
  const [material, setMaterial] = useState("ALUM");
  const [title, setTitle] = useState("");
  const [supplier, setSupplier] = useState("");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await api.post("/purchase-orders", { job_id: jobId, material, title, supplier: supplier || null, expected_date: expected || null });
      setAdding(false); setTitle(""); setSupplier(""); setExpected(""); setMaterial("ALUM");
      refetch();
    } finally { setBusy(false); }
  }
  async function advance(po: PO) {
    const patch = po.status === "PENDING" ? { status: "ORDERED", order_date: today() }
      : po.status === "ORDERED" ? { status: "RECEIVED", received_date: today() } : null;
    if (!patch) return;
    await api.patch(`/purchase-orders/${po.id}`, patch); refetch();
  }

  const fld = "focusable w-full glass-card rounded-lg px-3 py-2 text-sm text-white outline-none min-h-[40px] placeholder-white/40 [&>option]:text-gray-800";

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/80">ใบสั่งของ {rows.length} รายการ</span>
        {canWrite && !adding && <button onClick={() => setAdding(true)} className="focusable pressable text-[13px] bg-white text-[#1F4E78] rounded-lg px-3 py-1.5 font-semibold min-h-[36px]">+ เปิดใบสั่งของ</button>}
      </div>

      {adding && (
        <div className="glass-card rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={material} onChange={(e) => setMaterial(e.target.value)} className={fld}>{Object.entries(MAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <DateField value={expected} onChange={(iso) => setExpected(iso)} aria-label="กำหนดของเข้า" className={fld} />
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="รายละเอียด (เช่น เส้นอลู 2 นิ้ว 20 เส้น)" className={fld} />
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="ร้าน/ซัพพลายเออร์" className={fld} />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="focusable pressable flex-1 glass-card text-white rounded-lg px-3 py-2 text-sm min-h-[40px]">ยกเลิก</button>
            <button onClick={add} disabled={busy} className="focusable pressable flex-1 bg-emerald-500/90 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 min-h-[40px]">บันทึก</button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding && <div className="text-center py-8 text-[13px]" style={{ color: "var(--t-low)" }}>ยังไม่มีใบสั่งของ</div>}

      {rows.map((po) => {
        const late = po.status !== "RECEIVED" && po.expected_date && new Date(po.expected_date) < new Date(today());
        return (
          <div key={po.id} className="glass-card rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-white text-sm font-medium">{MAT[po.material] ?? po.material}{po.title ? ` · ${po.title}` : ""}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${ST[po.status].cls}`}>{ST[po.status].th}</span>
            </div>
            <div className="text-[12px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: "var(--t-low)" }}>
              {po.supplier && <span>ร้าน: {po.supplier}</span>}
              {po.expected_date && <span className={late ? "text-rose-300 font-medium" : ""}>กำหนดเข้า: {thDate(po.expected_date)}{late ? " ⚠ เลย" : ""}</span>}
              {po.received_date && <span className="text-emerald-300">รับ: {thDate(po.received_date)}</span>}
            </div>
            {canWrite && po.status !== "RECEIVED" && (
              <button onClick={() => advance(po)} className="focusable pressable mt-2 text-[12px] bg-white/15 text-white rounded-lg px-3 py-1.5 min-h-[34px]">
                {po.status === "PENDING" ? "→ ทำเครื่องหมายสั่งแล้ว" : "→ ของเข้าแล้ว"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
