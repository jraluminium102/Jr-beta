"use client";
// ปุ่ม + โมดัล "สถานะกระจกทุกงาน" (ดูอย่างเดียว · เจ้าของสั่ง 5 ต.ค.69)
//   ใช้ร่วมได้ทั้งหน้า /production (งานผลิต · ธีมมืด) และ /production-schedule (ตารางผลิต)
//   ดึงข้อมูลจาก /production-schedule เดิม (buildScheduleRows มี glass_items/glass_order รายชุด) — ไม่เพิ่ม API
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sheet = { spec: string; order: string; installed: string };
const GLASS_WAITING = new Set(["สั่งแล้ว รอของ", "มายังไม่ครบ"]);
const sheetsOfSet = (s: any): Sheet[] => {
  const items = (Array.isArray(s?.glass_items) ? s.glass_items : [])
    .map((i: any) => ({ spec: String(i?.spec ?? "").trim(), order: String(i?.order ?? "").trim(), installed: String(i?.installed ?? "").trim() }))
    .filter((x: Sheet) => x.spec || x.order || x.installed);
  if (items.length) return items;
  const spec = String(s?.glass_spec ?? "").trim(), order = String(s?.glass_order ?? "").trim(), installed = String(s?.glass_installed ?? "").trim();
  return (spec || order || installed) ? [{ spec, order, installed }] : [];
};
const bucketOf = (sh: Sheet): "waiting" | "unordered" | "arrived" | "installed" =>
  sh.installed === "ใส่แล้ว" ? "installed"
    : sh.order === "มาแล้ว" ? "arrived"
      : GLASS_WAITING.has(sh.order) ? "waiting" : "unordered";

type Entry = { customer: string; code: string | null; setLabel: string; spec: string; order: string; hold: boolean };

export default function GlassStatusButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["production-schedule"],
    queryFn: () => api.get<any[]>("/production-schedule"),
    enabled: open,
    refetchInterval: open ? 30000 : false,   // เปิดอยู่ = ดึงใหม่ทุก 30 วิ · ปิดแล้วหยุด
  });
  const rows = (data?.data ?? []) as any[];

  const g: Record<"waiting" | "unordered" | "arrived", Entry[]> = { waiting: [], unordered: [], arrived: [] };
  for (const r of rows) {
    if (r?.kind !== "job") continue;
    for (const s of (r.allSets ?? r.sets ?? [])) {
      for (const sh of sheetsOfSet(s)) {
        const b = bucketOf(sh);
        if (b === "installed") continue;   // ใส่แล้ว = จบ
        g[b].push({ customer: r.title, code: r.job_code, setLabel: String(s?.set_label ?? ""), spec: sh.spec, order: sh.order, hold: !!s?.hold });
      }
    }
  }
  const byC = (a: Entry, b: Entry) => a.customer.localeCompare(b.customer, "th");
  g.waiting.sort(byC); g.unordered.sort(byC); g.arrived.sort(byC);

  const SECS = [
    { key: "waiting" as const, title: "รอกระจก (สั่งแล้ว รอของ)", dot: "🟡", fg: "#c2410c", bg: "#fff7ed", bd: "#f6c99a" },
    { key: "unordered" as const, title: "ยังไม่สั่งกระจก", dot: "⚪", fg: "#4b5563", bg: "#f3f4f6", bd: "#e5e7eb" },
    { key: "arrived" as const, title: "กระจกมาแล้ว (รอใส่)", dot: "🟢", fg: "#227a44", bg: "#e7f6ec", bd: "#b6e3c5" },
  ];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="ดูสถานะกระจกทุกงาน (รอกระจก/ยังไม่สั่ง/มาแล้ว)"
        className={className ?? "focusable inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-semibold min-h-[34px] border"}
        style={className ? undefined : { background: "#fff", color: "#c2410c", borderColor: "#f6c99a" }}>
        🪟 สถานะกระจก
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 sm:p-6" style={{ background: "rgba(0,0,0,.5)" }}
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ background: "#f2f2f7", maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ background: "#fff", borderColor: "#e5e5ea" }}>
              <span className="text-[16px] font-bold" style={{ color: "#1c1c1e" }}>🪟 สถานะกระจกทุกงาน</span>
              <span className="text-[12px] rounded-full px-2 py-0.5" style={{ background: "#f4f4f7", color: "#636366" }}>ดูอย่างเดียว · อัปเดตทุก 30 วิ</span>
              {isFetching && <span className="text-[12px]" style={{ color: "#a1a1a8" }}>⟳</span>}
              <button type="button" onClick={() => refetch()} className="ml-auto focusable rounded-lg px-2.5 py-1.5 text-[13px] font-semibold border" style={{ background: "#fff", color: "#1c1c1e", borderColor: "#e5e5ea" }}>⟳ รีเฟรช</button>
              <button type="button" onClick={() => setOpen(false)} className="focusable rounded-lg px-2.5 py-1.5 text-[13px] font-semibold" style={{ background: "#f4f4f7", color: "#636366" }}>ปิด ✕</button>
            </div>
            <div className="overflow-y-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
              {SECS.map((sec) => {
                const list = g[sec.key];
                return (
                  <div key={sec.key} className="rounded-xl border flex flex-col min-h-0" style={{ background: "#fff", borderColor: sec.bd }}>
                    <div className="px-3 py-2 rounded-t-xl font-bold text-[14px] flex items-center gap-2" style={{ background: sec.bg, color: sec.fg }}>
                      <span>{sec.dot} {sec.title}</span>
                      <span className="ml-auto tnum text-[13px] rounded-full px-2 py-0.5" style={{ background: "#fff", color: sec.fg, border: `1px solid ${sec.bd}` }}>{list.length}</span>
                    </div>
                    <div className="p-2 space-y-1.5 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                      {list.length === 0 ? (
                        <div className="text-[13px] text-center py-4" style={{ color: "#a1a1a8" }}>— ไม่มี —</div>
                      ) : list.map((e, i) => (
                        <div key={i} className="rounded-lg px-2.5 py-2 border" style={{ background: "#f4f4f7", borderColor: "#e5e5ea" }}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[13.5px] font-semibold" style={{ color: "#1c1c1e" }}>{e.customer}</span>
                            {e.code && <span className="tnum text-[10px] rounded px-1 py-0.5" style={{ background: "#fff", color: "#636366", border: "1px solid #e5e5ea" }}>{e.code}</span>}
                            {e.hold && <span className="text-[10px] rounded px-1 py-0.5 font-bold" style={{ background: "#fdecec", color: "#c0392b" }}>พัก</span>}
                          </div>
                          <div className="text-[12.5px] mt-0.5" style={{ color: "#636366" }}>
                            {e.spec || <span style={{ color: "#a1a1a8" }}>(ยังไม่ระบุสเปค)</span>}
                            {e.setLabel && <span style={{ color: "#a1a1a8" }}> · {e.setLabel}</span>}
                            {e.order && <span style={{ color: sec.fg }}> · {e.order}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
