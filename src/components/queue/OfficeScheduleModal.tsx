"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import type { QueueSales } from "@/lib/queue";

// วันทำงาน จ-ส (weekday 0=อา..6=ส) · อาทิตย์ปฏิทินไม่แสดง
const WDAYS = [
  { wd: 1, th: "จันทร์" }, { wd: 2, th: "อังคาร" }, { wd: 3, th: "พุธ" },
  { wd: 4, th: "พฤหัส" }, { wd: 5, th: "ศุกร์" }, { wd: 6, th: "เสาร์" },
];
const HALVES = [
  { h: "AM" as const, th: "เช้า" },
  { h: "PM" as const, th: "บ่าย" },
];

export function OfficeScheduleModal({
  salesList, onClose, onSaved,
}: {
  salesList: QueueSales[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const mainSales = useMemo(() => salesList.filter((s) => s.role !== "ASSISTANT"), [salesList]);

  // grid["<wd>-<half>"] = sales_id ("" = ว่าง)
  const [grid, setGrid] = useState<Record<string, string>>(() => {
    const g: Record<string, string> = {};
    mainSales.forEach((s) => (s.office_slots ?? []).forEach((o) => { g[`${o.weekday}-${o.half}`] = s.id; }));
    return g;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const setCell = (key: string, salesId: string) => setGrid((g) => ({ ...g, [key]: salesId }));

  // นับครึ่งวัน/เซลล์
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    Object.values(grid).forEach((sid) => { if (sid) c[sid] = (c[sid] ?? 0) + 1; });
    return c;
  }, [grid]);

  async function save() {
    setBusy(true); setErr("");
    const slots = Object.entries(grid)
      .filter(([, sid]) => sid)
      .map(([key, sid]) => {
        const [wd, half] = key.split("-");
        return { sales_id: sid, weekday: Number(wd), half: half as "AM" | "PM" };
      });
    try {
      await api.post("/queue/office-schedule", { slots });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-brand-dark flex items-center gap-2">
            <Icon name="building" size={17} /> ตั้งวันอยู่ออฟฟิศประจำ
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1">
            <Icon name="close" size={17} />
          </button>
        </div>
        <p className="text-xs text-ink-3 mb-4">
          แต่ละช่องเลือกได้ 1 เซลล์ — เซลล์เดียวกันลงได้หลายช่อง · กติกา: ห้าม 2 เซลล์อยู่ออฟฟิศช่วงเดียวกันของวันเดียวกัน (ระบบกันให้อัตโนมัติ)
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-ink-3 text-xs">
                <th className="px-2 py-1.5 text-left font-semibold">ช่วง</th>
                {WDAYS.map((d) => (
                  <th key={d.wd} className="px-1.5 py-1.5 text-center font-semibold">{d.th}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HALVES.map((half) => (
                <tr key={half.h}>
                  <td className="px-2 py-1.5 font-semibold text-ink-2 whitespace-nowrap">{half.th}</td>
                  {WDAYS.map((d) => {
                    const key = `${d.wd}-${half.h}`;
                    return (
                      <td key={key} className="px-1 py-1">
                        <select
                          value={grid[key] ?? ""}
                          onChange={(e) => setCell(key, e.target.value)}
                          className="w-full glass-soft rounded-lg px-1.5 py-1.5 text-xs outline-none">
                          <option value="">—</option>
                          {mainSales.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* สรุปจำนวนครึ่งวัน/เซลล์ */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {mainSales.filter((s) => counts[s.id]).map((s) => {
            const n = counts[s.id];
            const ok4 = n === 4;
            return (
              <span key={s.id}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${ok4 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                <span className="font-semibold">{s.name}</span> {n} ครึ่งวัน{ok4 ? "" : " (เป้า 4)"}
              </span>
            );
          })}
        </div>

        {err && (
          <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>
        )}

        <div className="flex items-center gap-2 mt-5">
          <button onClick={save} disabled={busy}
            className="press inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
            <Icon name="check" size={15} /> {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <button onClick={onClose} className="press rounded-xl px-4 py-2.5 text-sm text-ink-2 ml-auto">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}
