"use client";
// ปุ่ม + โมดัล "สถานะกระจกทุกงาน" (ดูอย่างเดียว · เจ้าของสั่ง 5 ต.ค.69 · รื้อเลย์เอาท์ 5 ต.ค.69)
//   ลำดับที่เจ้าของอยากได้: หัวข้อใหญ่ = ชื่อลูกค้า > งาน (ชุด) > กระจก (สเปค + สถานะ)
//   ดึงข้อมูลจาก /production-schedule เดิม (buildScheduleRows มี glass_items/glass_order รายชุด) — ไม่เพิ่ม API
//   ⚠ ถ้าแก้ UI กระจก แก้ที่นี่ที่เดียว (ใช้ร่วมทั้ง /production และ /production-schedule)
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Bucket = "waiting" | "unordered" | "arrived";
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
// คืน null = ใส่แล้ว (จบ ไม่ต้องตาม)
const bucketOf = (sh: Sheet): Bucket | null =>
  sh.installed === "ใส่แล้ว" ? null
    : sh.order === "มาแล้ว" ? "arrived"
      : GLASS_WAITING.has(sh.order) ? "waiting" : "unordered";

const BK: Record<Bucket, { label: string; dot: string; fg: string; bg: string; bd: string }> = {
  waiting: { label: "รอกระจก", dot: "🟡", fg: "#c2410c", bg: "#fff7ed", bd: "#f6c99a" },
  unordered: { label: "ยังไม่สั่ง", dot: "⚪", fg: "#4b5563", bg: "#f3f4f6", bd: "#e5e7eb" },
  arrived: { label: "มาแล้ว", dot: "🟢", fg: "#227a44", bg: "#e7f6ec", bd: "#b6e3c5" },
};
const ORDER: Bucket[] = ["waiting", "unordered", "arrived"];

type Line = { spec: string; order: string; bucket: Bucket };
type SetGrp = { setLabel: string; hold: boolean; lines: Line[] };
type Cust = { customer: string; code: string | null; sets: SetGrp[] };

export default function GlassStatusButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Bucket | "">("");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["production-schedule"],
    queryFn: () => api.get<any[]>("/production-schedule"),
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });
  const rows = (data?.data ?? []) as any[];

  // จัดกลุ่ม: ลูกค้า → ชุดงาน → กระจก (ตัด "ใส่แล้ว" ออก)
  const custs: Cust[] = [];
  const counts: Record<Bucket, number> = { waiting: 0, unordered: 0, arrived: 0 };
  for (const r of rows) {
    if (r?.kind !== "job") continue;
    const setGrps: SetGrp[] = [];
    for (const s of (r.allSets ?? r.sets ?? [])) {
      const lines: Line[] = [];
      for (const sh of sheetsOfSet(s)) {
        const b = bucketOf(sh);
        if (!b) continue;
        counts[b]++;
        lines.push({ spec: sh.spec, order: sh.order, bucket: b });
      }
      if (lines.length) setGrps.push({ setLabel: String(s?.set_label ?? ""), hold: !!s?.hold, lines });
    }
    if (setGrps.length) custs.push({ customer: String(r.title ?? ""), code: r.job_code ?? null, sets: setGrps });
  }
  custs.sort((a, b) => a.customer.localeCompare(b.customer, "th"));

  // กรองตามสถานะ (แตะชิปด้านบน)
  const vis = filter
    ? custs.map((c) => ({ ...c, sets: c.sets.map((s) => ({ ...s, lines: s.lines.filter((l) => l.bucket === filter) })).filter((s) => s.lines.length) })).filter((c) => c.sets.length)
    : custs;

  const chip = (key: Bucket | "", label: string, n: number, fg: string, bd: string) => {
    const on = filter === key;
    return (
      <button type="button" key={key || "all"} onClick={() => setFilter(on ? "" : key)}
        className="focusable text-[12.5px] rounded-full px-3 py-1.5 font-bold min-h-[34px] inline-flex items-center gap-1.5 transition-all"
        style={on ? { background: fg, color: "#fff", boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${fg}` } : { background: "#fff", color: fg, border: `1px solid ${bd}` }}>
        {label} <span className="tnum">{n}</span>
      </button>
    );
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="ดูสถานะกระจกทุกงาน (ลูกค้า → งาน → กระจก)"
        className={className ?? "focusable inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-semibold min-h-[34px] border"}
        style={className ? undefined : { background: "#fff", color: "#c2410c", borderColor: "#f6c99a" }}>
        🪟 สถานะกระจก
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 sm:p-6" style={{ background: "rgba(0,0,0,.5)" }}
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ background: "#f2f2f7", maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}>
            {/* หัว */}
            <div className="flex items-center gap-2 px-4 py-3 border-b flex-wrap" style={{ background: "#fff", borderColor: "#e5e5ea" }}>
              <span className="text-[16px] font-bold" style={{ color: "#1c1c1e" }}>🪟 สถานะกระจกทุกงาน</span>
              <span className="text-[12px] rounded-full px-2 py-0.5" style={{ background: "#f4f4f7", color: "#636366" }}>ดูอย่างเดียว · อัปเดตทุก 30 วิ</span>
              {isFetching && <span className="text-[12px]" style={{ color: "#a1a1a8" }}>⟳</span>}
              <button type="button" onClick={() => refetch()} className="ml-auto focusable rounded-lg px-2.5 py-1.5 text-[13px] font-semibold border" style={{ background: "#fff", color: "#1c1c1e", borderColor: "#e5e5ea" }}>⟳ รีเฟรช</button>
              <button type="button" onClick={() => setOpen(false)} className="focusable rounded-lg px-2.5 py-1.5 text-[13px] font-semibold" style={{ background: "#f4f4f7", color: "#636366" }}>ปิด ✕</button>
            </div>
            {/* ชิปกรองสถานะ */}
            <div className="flex items-center gap-1.5 flex-wrap px-4 py-2.5 border-b" style={{ background: "#fff", borderColor: "#e5e5ea" }}>
              {chip("", "ทั้งหมด", counts.waiting + counts.unordered + counts.arrived, "#1c1c1e", "#e5e5ea")}
              {ORDER.map((b) => chip(b, `${BK[b].dot} ${BK[b].label}`, counts[b], BK[b].fg, BK[b].bd))}
            </div>
            {/* รายการ: ลูกค้า → ชุด → กระจก */}
            <div className="overflow-y-auto p-3 sm:p-4 space-y-3">
              {vis.length === 0 ? (
                <div className="text-[14px] text-center py-10" style={{ color: "#a1a1a8" }}>— ไม่มีงานกระจกในสถานะนี้ —</div>
              ) : vis.map((c, ci) => (
                <div key={ci} className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "#e5e5ea" }}>
                  {/* หัวข้อใหญ่ = ชื่อลูกค้า */}
                  <div className="px-3.5 py-2.5 flex items-center gap-2 flex-wrap border-b" style={{ background: "#fbfbfd", borderColor: "#ececf1" }}>
                    <span className="text-[16px] font-bold" style={{ color: "#1c1c1e" }}>{c.customer || "(ไม่มีชื่อ)"}</span>
                    {c.code && <span className="tnum text-[11px] rounded px-1.5 py-0.5" style={{ background: "#eef0f2", color: "#5f6b76" }}>{c.code}</span>}
                  </div>
                  {/* งาน (ชุด) → กระจก */}
                  <div className="p-2.5 space-y-2.5">
                    {c.sets.map((s, si) => (
                      <div key={si}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[13px] font-semibold" style={{ color: "#636366" }}>🧩 {s.setLabel || "งาน (ไม่ระบุชุด)"}</span>
                          {s.hold && <span className="text-[10px] rounded px-1 py-0.5 font-bold" style={{ background: "#fdecec", color: "#c0392b" }}>พัก</span>}
                        </div>
                        <div className="space-y-1">
                          {s.lines.map((l, li) => {
                            const m = BK[l.bucket];
                            const extra = l.order && l.order !== "มาแล้ว" && l.order !== m.label ? l.order : "";
                            return (
                              <div key={li} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 border" style={{ background: m.bg, borderColor: m.bd }}>
                                <span className="text-[13.5px]" style={{ color: "#1c1c1e" }}>{l.spec || <span style={{ color: "#a1a1a8" }}>(ยังไม่ระบุสเปคกระจก)</span>}</span>
                                <span className="shrink-0 text-[12px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ background: "#fff", color: m.fg, border: `1px solid ${m.bd}` }}>
                                  {m.dot} {m.label}{extra ? ` · ${extra}` : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
