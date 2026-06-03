"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import {
  isoToSheetDate, validateBooking, buildQueueRow,
  type LeaveEntry, type QuotaEntry, type Sheet,
} from "@/lib/queue";

const STATUS_OPTIONS = ["จัดแล้ว (admin)", "รอยืนยัน", "ติดต่อแล้ว", "ยกเลิก"];
const TIME_OPTIONS = ["10:00", "14:00", "อื่นๆ"];

export function AddQueueModal({
  queue, leave, quota, salesList, sheetUrl, onClose,
}: {
  queue: Sheet;
  leave: LeaveEntry[];
  quota: QuotaEntry[];
  salesList: string[];
  sheetUrl: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(STATUS_OPTIONS[0]);
  const [sales, setSales] = useState(salesList[0] ?? "");
  const [jobType, setJobType] = useState(""); // "" = ประเมินหน้างาน
  const [iso, setIso] = useState("");
  const [time, setTime] = useState("10:00");
  const [timeCustom, setTimeCustom] = useState("");
  const [customer, setCustomer] = useState("");
  const [tel, setTel] = useState("");
  const [channel, setChannel] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const { thai: dateThai, dow } = useMemo(() => isoToSheetDate(iso), [iso]);
  const finalTime = time === "อื่นๆ" ? timeCustom.trim() : time;

  const check = useMemo(() => {
    if (!sales || !dateThai) return { errors: [], warnings: [] };
    return validateBooking({ sales, dateThai, time: finalTime }, { leave, quota, queue });
  }, [sales, dateThai, finalTime, leave, quota, queue]);

  const fields: Record<string, string> = {
    status, dow, dateThai, time: finalTime, jobType, sales, channel,
    customer: customer.trim(), tel: tel.trim(), address: address.trim(),
    location: location.trim(), noteAdmin: note.trim(),
  };
  const row = useMemo(() => buildQueueRow(queue.headers, fields), [queue.headers, JSON.stringify(fields)]);

  const missing: string[] = [];
  if (!sales) missing.push("เซลล์");
  if (!iso) missing.push("วันที่");
  if (!finalTime) missing.push("เวลา");
  if (!customer.trim()) missing.push("ชื่อลูกค้า");

  const canBuild = missing.length === 0 && check.errors.length === 0;

  async function copyRow() {
    try {
      await navigator.clipboard.writeText(row.join("\t")); // TSV — วางในชีตได้เต็มแถว
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
            <Icon name="calendar" size={18} /> เพิ่มคิวงาน
          </h2>
          <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink-1 rounded-lg p-1">
            <Icon name="logout" size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="เซลล์ *">
            <select value={sales} onChange={(e) => setSales(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 outline-none">
              {salesList.length === 0 && <option value="">—</option>}
              {salesList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="ประเภทงาน">
            <select value={jobType} onChange={(e) => setJobType(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 outline-none">
              <option value="">ประเมินหน้างาน</option>
              <option value="โชว์รูม">โชว์รูม</option>
            </select>
          </Field>

          <Field label="วันที่ *">
            <input type="date" value={iso} onChange={(e) => setIso(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 outline-none" />
            {dateThai && <span className="text-[11px] text-ink-3 mt-1 block">{dow} {dateThai}</span>}
          </Field>
          <Field label="เวลา *">
            <select value={time} onChange={(e) => setTime(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 outline-none">
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {time === "อื่นๆ" && (
              <input value={timeCustom} onChange={(e) => setTimeCustom(e.target.value)} placeholder="เช่น 11:30"
                className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none" />
            )}
          </Field>

          <Field label="ชื่อลูกค้า *" wide>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="คุณ…" className="w-full glass-soft rounded-lg px-3 py-2 outline-none" />
          </Field>
          <Field label="เบอร์โทร">
            <input value={tel} onChange={(e) => setTel(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 outline-none" />
          </Field>
          <Field label="ช่องทาง (Line/FB/IG)">
            <input value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 outline-none" />
          </Field>
          <Field label="ที่อยู่" wide>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full glass-soft rounded-lg px-3 py-2 outline-none resize-none" />
          </Field>
          <Field label="โลเคชั่น (ลิงก์แผนที่)" wide>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="https://maps.app.goo.gl/…" className="w-full glass-soft rounded-lg px-3 py-2 outline-none" />
          </Field>
          <Field label="หมายเหตุ admin" wide>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 outline-none" />
          </Field>
          <Field label="สถานะระบบ">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 outline-none">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {/* ผลตรวจตามตรรกะชีต */}
        {check.errors.map((e, i) => (
          <p key={`e${i}`} role="alert" className="mt-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 flex items-start gap-2">
            <span className="shrink-0"><Icon name="warn" size={15} /></span>{e}
          </p>
        ))}
        {check.warnings.map((w, i) => (
          <p key={`w${i}`} className="mt-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 flex items-start gap-2">
            <span className="shrink-0"><Icon name="info" size={15} /></span>{w}
          </p>
        ))}
        {missing.length > 0 && (
          <p className="mt-2 text-xs text-ink-3">ต้องกรอก: {missing.join(", ")}</p>
        )}

        <div className="mt-5 rounded-xl bg-sky-50 border border-sky-100 px-3.5 py-3 text-xs text-sky-900">
          ชีตนี้แชร์แบบ <b>ดูได้อย่างเดียว</b> — เพิ่มคิวด้วยการกด “คัดลอกแถว” แล้วเปิดชีตไปวางต่อท้ายแถวสุดท้าย
          (สูตรโควตา/สถิติเซลล์จะอัปเดตอัตโนมัติเอง)
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={copyRow} disabled={!canBuild}
            className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-50">
            <Icon name={copied ? "check" : "file"} size={16} /> {copied ? "คัดลอกแล้ว!" : "คัดลอกแถว (วางในชีต)"}
          </button>
          <a href={sheetUrl} target="_blank" rel="noopener noreferrer"
            className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold glass-soft text-brand-dark">
            <Icon name="external" size={16} /> เปิดชีต
          </a>
          <button onClick={onClose} className="press rounded-xl px-4 py-2.5 text-sm text-ink-2 ml-auto">ปิด</button>
        </div>

        {/* preview แถวที่จะวาง */}
        {canBuild && (
          <details className="mt-3 text-xs text-ink-3">
            <summary className="cursor-pointer select-none">ดูข้อมูลแถวที่จะวาง</summary>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {queue.headers.map((h, i) => (
                <div key={i} className="contents">
                  <span className="text-ink-3">{h}</span>
                  <span className="text-ink-1 break-words">{row[i] || "—"}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
