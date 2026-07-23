"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

export type StockJob = {
  id: string;
  job_code: string | null;
  customer_name: string;
  tel4: string;
  locator: string;
  stage_label: string;
};

// ตัวเลือกงาน (เฉพาะงานในขั้นตอนผลิต–ติดตั้ง มีมัดจำ ยังไม่จบ) + กันชื่อซ้ำด้วย บ้านเลขที่·เขต·เบอร์ท้าย
//   ยังพิมพ์ชื่อเองได้ (ไม่ผูก) ผ่านช่อง "อ้างอิง" แยกต่างหาก — ตัวนี้ทำหน้าที่ผูกงานจริงอย่างเดียว
export default function JobPicker({ value, onPick, compact, all, initialQuery, autoOpen }: {
  value: StockJob | null;
  onPick: (j: StockJob | null) => void;
  compact?: boolean;
  all?: boolean;            // ค้นทุกงาน (ผูกย้อนหลัง) แทนเฉพาะงานผลิต–ติดตั้ง
  initialQuery?: string;    // ข้อความค้นเริ่มต้น (เช่น ชื่อที่พิมพ์ไว้)
  autoOpen?: boolean;
}) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [hits, setHits] = useState<StockJob[]>([]);
  const [open, setOpen] = useState(!!autoOpen);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // โหลดรายการงานที่เข้าเงื่อนไข (เปิดช่อง = เห็นเลย · พิมพ์ = กรอง)
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stock/jobs?q=${encodeURIComponent(q.trim())}${all ? "&all=1" : ""}`);
        const j = await r.json().catch(() => null);
        setHits((j?.data ?? []) as StockJob[]);
      } finally { setLoading(false); }
    }, q.trim() ? 250 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, open, all]);

  if (value) return (
    <div className="flex items-center justify-between glass-soft rounded-lg px-3 py-2 text-sm">
      <span className="truncate">
        <b className="text-brand-dark">{value.job_code || "—"}</b> · {value.customer_name}
        {value.locator ? <span className="text-ink-3"> · {value.locator}</span> : ""}
        {value.stage_label ? <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">{value.stage_label}</span> : ""}
      </span>
      <button onClick={() => onPick(null)} aria-label="เอาออก" className="text-ink-3 hover:text-red-600 shrink-0 ml-2"><Icon name="trash" size={14} /></button>
    </div>
  );

  return (
    <div className="relative">
      {!compact && <label className="block text-xs font-medium text-ink-3 mb-1">ผูกงาน (เฉพาะงานที่กำลังผลิต–ติดตั้ง · ไม่บังคับ)</label>}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="แตะเพื่อดูงาน หรือพิมพ์ชื่อ/เบอร์…"
        className="w-full glass-soft rounded-lg px-3 py-2 text-sm outline-none"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-ink-3">กำลังโหลด…</div>}
          {!loading && hits.length === 0 && <div className="px-3 py-3 text-xs text-ink-3">— ไม่พบงานในขั้นตอนผลิต–ติดตั้ง (พิมพ์ชื่อในช่องอ้างอิงด้านล่างแทนได้) —</div>}
          {hits.map((h) => (
            <button key={h.id} onClick={() => { onPick(h); setOpen(false); setQ(""); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-brand/5 border-b border-black/5 last:border-0">
              <div className="flex items-baseline gap-1.5">
                <b className="text-brand-dark">{h.job_code || "—"}</b>
                <span className="text-ink-1">{h.customer_name}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 shrink-0">{h.stage_label}</span>
              </div>
              {(h.locator || h.tel4) && (
                <div className="text-[11px] text-ink-3 mt-0.5">
                  {h.locator}{h.locator && h.tel4 ? " · " : ""}{h.tel4 ? `☎ …${h.tel4}` : ""}
                </div>
              )}
            </button>
          ))}
          <button onClick={() => setOpen(false)} className="w-full text-center px-3 py-1.5 text-[11px] text-ink-3 hover:bg-black/5 border-t border-black/5">ปิด</button>
        </div>
      )}
    </div>
  );
}
