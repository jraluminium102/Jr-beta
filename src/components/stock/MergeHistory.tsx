"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";

type Row = {
  id: number;
  at: string;
  by: string;
  keep: { id?: number; name?: string; sku?: string; unit_cost?: number } | null;
  removed: { id?: number; name?: string; sku?: string }[];
  result: { newSku?: string | null; newName?: string | null; pricedTo?: number | null; boqMoved?: number };
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function MergeHistory({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/stock/merge/history")
      .then((r) => r.json())
      .then((j) => { if (alive) { if (Array.isArray(j?.data)) setRows(j.data); else setErr(j?.error ?? "โหลดไม่สำเร็จ"); } })
      .catch(() => alive && setErr("โหลดไม่สำเร็จ"));
    return () => { alive = false; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-brand-dark text-lg">🕘 ประวัติการรวมรายการซ้ำ</h3>
          <button onClick={onClose} aria-label="ปิด" className="text-ink-3 hover:text-ink-1"><Icon name="close" size={20} /></button>
        </div>
        <p className="text-xs text-ink-3 mb-3">ทุกครั้งที่รวมถูกบันทึกไว้ — ใคร/เมื่อไหร่/รวมตัวไหนเข้าตัวไหน/ย้ายรหัส-ชื่อ/ราคา</p>

        {err && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        {!rows && !err && <p className="text-sm text-ink-3 py-4 text-center">กำลังโหลด…</p>}
        {rows && rows.length === 0 && <p className="text-sm text-ink-3 py-6 text-center">ยังไม่เคยมีการรวมรายการ</p>}

        <div className="space-y-2">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold text-brand-dark">
                  {r.removed.length} ตัว → “{r.keep?.name ?? `#${r.result.newName ?? ""}`}”
                </span>
                <span className="text-[11px] text-ink-3 shrink-0">{fmt(r.at)} · {r.by}</span>
              </div>
              <div className="text-[12px] text-ink-2">
                <span className="text-ink-3">ยุบ:</span>{" "}
                {r.removed.map((x) => `${x.name ?? "?"}${x.sku ? ` [${x.sku}]` : ""}`).join(" · ") || "—"}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {r.result.newSku && <span className="text-[11px] rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">ย้ายรหัส → {r.result.newSku}</span>}
                {r.result.newName && <span className="text-[11px] rounded-full px-2 py-0.5 bg-sky-100 text-sky-700">เปลี่ยนชื่อ → {r.result.newName}</span>}
                {r.result.pricedTo != null && <span className="text-[11px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">ตั้งราคา ฿{baht(r.result.pricedTo)}</span>}
                {!!r.result.boqMoved && <span className="text-[11px] rounded-full px-2 py-0.5 bg-black/5 text-ink-2">ย้าย BOQ {r.result.boqMoved} แถว</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
