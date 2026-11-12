"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { dayColor } from "@/lib/queue";
import type { QueueSales } from "@/lib/queue";

// สถานะช่อง: "" ว่าง · AM เช้า · PM บ่าย · FULL ทั้งวัน
type St = "" | "AM" | "PM" | "FULL";
const NEXT: Record<St, St> = { "": "AM", AM: "PM", PM: "FULL", FULL: "" };
const LABEL: Record<St, string> = { "": "", AM: "เช้า", PM: "บ่าย", FULL: "ทั้งวัน" };
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const TH_MONTH = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const pad = (n: number) => String(n).padStart(2, "0");
function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
// วัน จ-ส ของเดือน (ข้ามอาทิตย์)
function monthDays(m: string): { iso: string; day: number; dow: number }[] {
  const [y, mo] = m.split("-").map(Number);
  const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const out: { iso: string; day: number; dow: number }[] = [];
  for (let d = 1; d <= n; d++) {
    const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    if (dow !== 0) out.push({ iso: `${m}-${pad(d)}`, day: d, dow });
  }
  return out;
}
function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
const val = (s: St) => (s === "FULL" ? 1 : s ? 0.5 : 0);

// draft key = `${salesId}|${iso}`
function initialDraft(list: QueueSales[]): Record<string, St> {
  const g: Record<string, St> = {};
  list.forEach((s) => {
    const am = new Set<string>();
    const pm = new Set<string>();
    (s.office_overrides ?? []).forEach((o) => {
      if (o.action !== "add") return;
      (o.half === "AM" ? am : pm).add(o.date);
    });
    new Set([...Array.from(am), ...Array.from(pm)]).forEach((d) => {
      g[`${s.id}|${d}`] = am.has(d) && pm.has(d) ? "FULL" : am.has(d) ? "AM" : "PM";
    });
  });
  return g;
}

export function OfficeCalendarModal({
  salesList, month, requiredDays, onClose, onSaved,
}: {
  salesList: QueueSales[];
  month: string;
  requiredDays: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mainSales = useMemo(() => salesList.filter((s) => s.role !== "ASSISTANT"), [salesList]);
  const initial = useMemo(() => initialDraft(mainSales), [mainSales]);
  const [draft, setDraft] = useState<Record<string, St>>(initial);
  const [cur, setCur] = useState(month);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const today = todayIso();

  const days = useMemo(() => monthDays(cur), [cur]);
  const [cy, cm] = cur.split("-").map(Number);

  const setCell = (sid: string, iso: string, st: St) =>
    setDraft((d) => {
      const n = { ...d };
      if (st) n[`${sid}|${iso}`] = st; else delete n[`${sid}|${iso}`];
      return n;
    });

  function copyPrev() {
    const prevM = shiftMonth(cur, -1);
    const valid = new Set(days.map((d) => d.iso));
    setDraft((d) => {
      const n = { ...d };
      mainSales.forEach((s) => {
        // ล้างร่างเดือนนี้ (เฉพาะวันที่ยังแก้ได้) แล้ววางจากเดือนก่อนตามเลขวัน
        days.forEach((x) => { if (x.iso >= today) delete n[`${s.id}|${x.iso}`]; });
        monthDays(prevM).forEach((p) => {
          const st = d[`${s.id}|${p.iso}`];
          const target = `${cur}-${pad(p.day)}`;
          if (st && valid.has(target) && target >= today) n[`${s.id}|${target}`] = st;
        });
      });
      return n;
    });
  }

  async function save() {
    setBusy(true); setErr("");
    // หาคู่ (เซลล์, เดือน) ที่ต่างจากค่าเริ่มต้น
    const changed = new Set<string>();
    const keys = new Set([...Object.keys(initial), ...Object.keys(draft)]);
    keys.forEach((k) => {
      if ((initial[k] ?? "") !== (draft[k] ?? "")) {
        const [sid, iso] = k.split("|");
        changed.add(`${sid}|${iso.slice(0, 7)}`);
      }
    });
    try {
      for (const c of Array.from(changed)) {
        const [sid, m] = c.split("|");
        const out: { date: string; half: "AM" | "PM" }[] = [];
        monthDays(m).forEach((d) => {
          const st = draft[`${sid}|${d.iso}`];
          if (st === "AM" || st === "FULL") out.push({ date: d.iso, half: "AM" });
          if (st === "PM" || st === "FULL") out.push({ date: d.iso, half: "PM" });
        });
        await api.put("/queue/office-month", { sales_id: sid, month: m, days: out });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      <div className="relative w-full max-w-6xl max-h-[92dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h2 className="text-base font-bold text-brand-dark flex items-center gap-2">
            <Icon name="building" size={17} /> ปฏิทินวันออฟฟิศ
          </h2>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => setCur((m) => shiftMonth(m, -1))} aria-label="เดือนก่อน"
              className="press glass-soft rounded-lg w-11 h-11 text-lg font-bold text-ink-2">‹</button>
            <span className="min-w-[9rem] text-center text-sm font-bold text-ink tabular-nums">
              {TH_MONTH[cm]} {cy + 543}
            </span>
            <button onClick={() => setCur((m) => shiftMonth(m, 1))} aria-label="เดือนหน้า"
              className="press glass-soft rounded-lg w-11 h-11 text-lg font-bold text-ink-2">›</button>
          </div>
          <button onClick={copyPrev}
            className="press glass-soft rounded-xl px-3 h-11 text-sm font-semibold text-ink-2">
            ก๊อปจากเดือนก่อน
          </button>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1 ml-auto">
            <Icon name="close" size={17} />
          </button>
        </div>
        <p className="text-xs text-ink-3 mb-4">
          ตั้งเป็นวัน ๆ เอง ไม่ซ้ำอัตโนมัติ · ช่องที่ตั้งจะไม่ถูกเสนอคิว แต่ลงคิวทับเองได้ (ขึ้นเตือน)
        </p>

        <div className="overflow-x-auto">
          <table className="border-collapse text-[13px]">
            <thead>
              <tr className="text-ink-3">
                <th className="px-2 py-1.5 text-left font-semibold sticky left-0 bg-white/80 z-10">เซลล์</th>
                {days.map((d) => {
                  const c = dayColor(d.iso);
                  return (
                    <th key={d.iso} className={`px-0.5 py-1 text-center font-semibold whitespace-nowrap tabular-nums ${c?.row ?? ""} ${d.iso < today ? "opacity-50" : ""}`}>
                      {DOW[d.dow]} {d.day}
                    </th>
                  );
                })}
                <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">สรุป</th>
              </tr>
            </thead>
            <tbody>
              {mainSales.map((s) => {
                const total = days.reduce((a, d) => a + val(draft[`${s.id}|${d.iso}`] ?? ""), 0);
                const lack = Math.max(0, requiredDays - total);
                return (
                  <tr key={s.id}>
                    <td className="px-2 py-1 whitespace-nowrap sticky left-0 bg-white/90 z-10">
                      <div className="font-semibold text-ink-2">{s.name}</div>
                      <div className={`text-[11px] tabular-nums ${lack > 0 ? "text-red-700" : "text-emerald-700"}`}>{total}/{requiredDays} วัน{lack > 0 ? ` · ขาด ${lack}` : " · ครบ"}</div>
                    </td>
                    {days.map((d) => {
                      const st = draft[`${s.id}|${d.iso}`] ?? "";
                      const past = d.iso < today;
                      return (
                        <td key={d.iso} className="p-0.5">
                          <button type="button" disabled={past}
                            title={past ? "วันที่ผ่านไปแล้ว" : "คลิกเพื่อเปลี่ยน"}
                            onClick={() => setCell(s.id, d.iso, NEXT[st])}
                            className={`h-11 min-w-[2.75rem] w-full rounded-md border px-0.5 text-[13px] leading-tight tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                              st === "FULL" ? "bg-brand text-white border-brand font-bold"
                                : st ? "bg-brand/20 text-brand-dark border-brand/40 font-semibold"
                                : "bg-white/50 border-black/10 text-ink-3"
                            } ${past ? "opacity-40 cursor-not-allowed" : "press"}`}>
                            {LABEL[st]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {err && (
          <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>
        )}

        <div className="flex items-center gap-2 mt-5">
          <button onClick={save} disabled={busy}
            className="press inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
            <Icon name="check" size={15} /> {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <button onClick={onClose} className="press rounded-xl px-4 py-2.5 min-h-[44px] text-sm text-ink-2 ml-auto">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}
