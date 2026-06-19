"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import DateField from "@/components/ui/DateField";
import type { QueueSales } from "@/lib/queue";

type AvailKind = "LEAVE_FULL" | "LEAVE_HALF" | "OFFICE_HALF" | "HOLIDAY";

const KIND_META: Record<AvailKind, string> = {
  LEAVE_FULL:  "ลาทั้งวัน",
  LEAVE_HALF:  "ลาครึ่งวัน",
  OFFICE_HALF: "เช้าอยู่ออฟฟิศ (เลื่อนออกบ่าย)",
  HOLIDAY:     "วันหยุดพิเศษ",
};

type FormState = {
  sales_id: string;
  date: string;
  kind: AvailKind;
  half: "AM" | "PM" | "";
  note: string;
};

function initForm(): FormState {
  return { sales_id: "", date: "", kind: "LEAVE_FULL", half: "", note: "" };
}

export type AvailRow = {
  id: string;
  sales_id: string;
  date: string;
  kind: AvailKind;
  half: string | null;
  note: string | null;
  sales?: { id: string; name: string; code: string } | null;
};

export function LeaveModal({
  salesList,
  onClose,
  onSaved,
}: {
  salesList: QueueSales[];
  onClose: () => void;
  onSaved: (savedDate?: string, savedRecord?: AvailRow) => void;
}) {
  const [f, setF] = useState<FormState>(initForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  // Main sales reps only (no assistants in leave UI — assistants don't have independent schedules)
  const mainSales = salesList.filter((s) => s.role === "MAIN");

  async function save() {
    if (!f.sales_id) { setErr("กรุณาเลือกเซลล์"); return; }
    if (!f.date) { setErr("กรุณาระบุวันที่"); return; }
    if (f.kind === "LEAVE_HALF" && !f.half) { setErr("กรุณาระบุช่วงเวลา (เช้า/บ่าย)"); return; }
    setBusy(true); setErr("");
    try {
      const res = await api.post<AvailRow>("/queue/availability", {
        sales_id: f.sales_id,
        date: f.date,
        kind: f.kind,
        half: f.half || null,
        note: f.note || null,
      });
      // ส่งทั้งวันที่ + record ที่เพิ่งสร้าง → parent เติมเข้า state ทันที (optimistic, กัน race ตอน refetch)
      onSaved(f.date, res.data ?? undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      <div className="relative w-full max-w-md glass rounded-2xl p-5 sm:p-6 fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-brand-dark flex items-center gap-2">
            <Icon name="calendar" size={17} /> บันทึกวันลา / วันหยุด
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1">
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {/* Sales rep selector */}
          <label className="block">
            <span className="text-xs font-medium text-ink-3">เซลล์ *</span>
            <div className="mt-1">
              <select
                value={f.sales_id}
                onChange={(e) => set("sales_id", e.target.value)}
                className={inp}
              >
                <option value="">— เลือกเซลล์ —</option>
                {mainSales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.team === "PHUKET" ? "ภูเก็ต" : "กทม."})
                  </option>
                ))}
              </select>
            </div>
          </label>

          {/* Date picker */}
          <label className="block">
            <span className="text-xs font-medium text-ink-3">วันที่ *</span>
            <div className="mt-1">
              <DateField
                value={f.date}
                onChange={(iso) => set("date", iso)}
                className={inp}
                aria-label="วันที่"
              />
            </div>
          </label>

          {/* Kind selector */}
          <label className="block">
            <span className="text-xs font-medium text-ink-3">ประเภท *</span>
            <div className="mt-1">
              <select
                value={f.kind}
                onChange={(e) => { set("kind", e.target.value as AvailKind); set("half", ""); }}
                className={inp}
              >
                {(Object.keys(KIND_META) as AvailKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_META[k]}</option>
                ))}
              </select>
            </div>
          </label>

          {/* Half-day picker (only shown for LEAVE_HALF) */}
          {f.kind === "LEAVE_HALF" && (
            <label className="block">
              <span className="text-xs font-medium text-ink-3">ช่วงเวลาที่ลา *</span>
              <div className="mt-1 flex gap-2">
                {(["AM", "PM"] as const).map((h) => (
                  <label key={h} className="flex items-center gap-1.5 cursor-pointer text-ink">
                    <input
                      type="radio"
                      name="half"
                      value={h}
                      checked={f.half === h}
                      onChange={() => set("half", h)}
                      className="accent-brand"
                    />
                    {h === "AM" ? "เช้า (AM)" : "บ่าย (PM)"}
                  </label>
                ))}
              </div>
            </label>
          )}

          {/* Optional note */}
          <label className="block">
            <span className="text-xs font-medium text-ink-3">หมายเหตุ</span>
            <div className="mt-1">
              <input
                value={f.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="เช่น ไปงานสัมมนา"
                className={inp}
              />
            </div>
          </label>
        </div>

        {err && (
          <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            {err}
          </p>
        )}

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={save}
            disabled={busy}
            className="press inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60"
          >
            <Icon name="check" size={15} /> {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <button onClick={onClose} className="press rounded-xl px-4 py-2.5 text-sm text-ink-2 ml-auto">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full glass-soft rounded-lg px-3 py-2 outline-none text-sm";
