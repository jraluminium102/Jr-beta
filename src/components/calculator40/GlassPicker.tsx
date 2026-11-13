"use client";
// ช่องเลือกกระจกแบบพิมพ์ค้นหาได้ (เจ้าของ 13 พ.ย.69: "ดรอปดาวกระจก อยากให้เสิร์ชหากระจกได้ มันเยอะแล้ว")
//   ใช้แทน <select> กระจกทุกจุดในคิดราคา 4.0 — หน้าคิดราคา · ห้องกระจก (รายบาน/รายด้าน) · ผสมบาน · กระจกช่องแสง
//   ค้นหา: แยกคำด้วยช่องว่าง ทุกคำต้องเจอในชื่อโชว์หรือค่าที่เก็บ (ไม่สนช่องว่าง/จุด) เช่น "ใส6" · "เทมเปอร์ 10" · "ชา"
//   Enter = เลือกตัวแรกที่เจอ · ↑↓ = เลื่อน · Esc = ปิด
import { useEffect, useMemo, useRef, useState } from "react";
import { glassCanonical, glassDisplayName, filterGlassGroups } from "@/lib/calculator40/glass-catalog.mjs";

export type GlassGroup = { cat: string; items: { value: string; label: string }[] };

export default function GlassPicker({ value, onChange, groups, emptyLabel, size = "md", className = "", disabled = false, ariaLabel = "กระจก" }: {
  value: string;
  onChange: (v: string) => void;
  groups: GlassGroup[];
  /** มีค่า = มีตัวเลือก "ว่าง" (เช่น ตามบาน/ตามด้าน) อยู่บนสุด */
  emptyLabel?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const canon = value ? glassCanonical(value) : "";
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const cur = value ? all.find((it) => it.value === canon || it.value === value) : null;
  const shown = value ? (cur?.label ?? glassDisplayName(value)) : (emptyLabel ?? "—");

  const filtered = useMemo(() => filterGlassGroups(groups, q) as GlassGroup[], [groups, q]);
  // ตัวเลือกแบบแบน (รวม "ว่าง" ถ้ามี และไม่ได้พิมพ์ค้นหา) — ใช้กับปุ่มลูกศร/Enter
  const flat = useMemo(() => [
    ...(emptyLabel != null && !q.trim() ? [{ value: "", label: emptyLabel }] : []),
    ...filtered.flatMap((g) => g.items),
  ], [filtered, emptyLabel, q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    setTimeout(() => input.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => {
    if (!open) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const pick = (v: string) => { onChange(v); setOpen(false); setQ(""); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); setQ(""); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, Math.max(flat.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[hi]) pick(flat[hi].value); }
  };

  const sm = size === "sm";
  let idx = 0;
  const row = (it: { value: string; label: string }) => {
    const i = idx++;
    const sel = it.value === (cur?.value ?? (value ? canon : ""));
    return (
      <button key={(it.value || "__empty") + i} type="button" data-idx={i}
        onMouseEnter={() => setHi(i)} onClick={() => pick(it.value)}
        className={"w-full text-left px-3 py-1.5 rounded-md " + (sm ? "text-xs " : "text-sm ") +
          (i === hi ? "bg-brand/10 text-brand-dark " : "text-ink-1 ") + (sel ? "font-semibold" : "")}>
        {sel ? "✓ " : ""}{it.label}
      </button>
    );
  };

  return (
    <div ref={wrap} className={"relative " + className}>
      <button type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={(sm ? "min-h-[32px] px-2 py-1 text-xs " : "min-h-[44px] px-3 py-2 text-sm ") +
          "w-full glass-soft rounded-lg outline-none text-left flex items-center justify-between gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40 disabled:cursor-not-allowed"}>
        <span className="truncate">{shown}</span>
        <span className="text-ink-3 shrink-0" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 min-w-full w-max max-w-[min(92vw,420px)] rounded-xl border border-line bg-white shadow-lg p-2">
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="พิมพ์ค้นหา เช่น ใส 6 · เทมเปอร์ · ชา · ลามิเนต"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          <div ref={list} role="listbox" className="mt-2 max-h-72 overflow-y-auto">
            {emptyLabel != null && !q.trim() && row({ value: "", label: emptyLabel })}
            {filtered.map((g) => (
              <div key={g.cat}>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-ink-3 tracking-wide">{g.cat}</div>
                {g.items.map(row)}
              </div>
            ))}
            {flat.length === 0 && <div className="px-3 py-3 text-sm text-ink-3">ไม่เจอกระจก "{q}" — ลองพิมพ์คำสั้นลง</div>}
          </div>
        </div>
      )}
    </div>
  );
}
