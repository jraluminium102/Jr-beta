"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { thDate } from "@/lib/format";
import { Tag } from "@/components/ui/primitives";
import { X, Check } from "@/components/ui/icons";
import type { IssueStatus, IssueType, IssuePhase } from "@/lib/database.types";

export type IssueRow = {
  id: string; issue_code: string; phase: IssuePhase; type: IssueType; detail: string;
  owner_name: string | null; is_auto_created: boolean; status: IssueStatus;
  resolution: string | null; reported_at: string; resolved_at: string | null;
  job: { job_code: string; customer_name: string } | null;
};

const PHASE_TH: Record<string, string> = { SALES: "ขาย", MEASUREMENT: "วัดจริง", PRODUCTION: "ผลิต", INSTALLATION: "ติดตั้ง", POST_SALE: "หลังขาย" };
const TYPES: { v: IssueType; th: string }[] = [
  { v: "WRONG_DESIGN", th: "แบบผิด" }, { v: "CUSTOMER_CHANGES", th: "ลูกค้าปรับเยอะ" },
  { v: "MATERIAL_SHORTAGE", th: "วัสดุขาด" }, { v: "PRODUCTION_DELAY", th: "ผลิตเลท" },
  { v: "INSTALLATION_DELAY", th: "ติดตั้งช้า" }, { v: "CUSTOMER_COMPLAINT", th: "ลูกค้าไม่พอใจ" }, { v: "OTHER", th: "อื่นๆ" },
];
const STATUSES: { v: IssueStatus; th: string; cls: string }[] = [
  { v: "OPEN", th: "เปิด", cls: "bg-rose-500/25 text-rose-100 border-rose-300/40" },
  { v: "IN_PROGRESS", th: "กำลังแก้", cls: "bg-amber-500/25 text-amber-100 border-amber-300/40" },
  { v: "CLOSED", th: "ปิด", cls: "bg-emerald-500/25 text-emerald-100 border-emerald-300/40" },
];

export function IssueDrawer({ issue, canWrite, onClose, onChanged }: {
  issue: IssueRow; canWrite: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [type, setType] = useState<IssueType>(issue.type);
  const [resolution, setResolution] = useState(issue.resolution ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const dirty = status !== issue.status || type !== issue.type || resolution !== (issue.resolution ?? "");

  const save = async () => {
    setErr(null);
    if (status === "CLOSED" && !resolution.trim()) { setErr("ต้องระบุวิธีแก้ก่อนปิด issue"); return; }
    setSaving(true);
    try {
      await api.patch(`/issues/${issue.id}`, { status, type, resolution: resolution || undefined });
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`รายละเอียด issue ${issue.issue_code}`}>
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md h-[100dvh] glass overflow-y-auto slide-in sm:rounded-l-3xl">
        <div className="sticky top-0 glass px-5 sm:px-6 py-4 flex items-center justify-between z-10 sm:rounded-tl-3xl">
          <div className="min-w-0">
            <div className="text-white font-bold text-base tnum truncate">{issue.job?.job_code}</div>
            <div className="text-[12px] truncate" style={{ color: "var(--t-mid)" }}>{issue.job?.customer_name}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="focusable pressable w-11 h-11 inline-flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10"><X size={20} /></button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag>{PHASE_TH[issue.phase] ?? issue.phase}</Tag>
            {issue.is_auto_created && <Tag tone="sky">auto</Tag>}
            <span className="text-[11px] tnum" style={{ color: "var(--t-low)" }}>แจ้งเมื่อ {thDate(issue.reported_at)}</span>
          </div>

          <div>
            <div className="text-[12px] mb-1.5" style={{ color: "var(--t-low)" }}>รายละเอียดปัญหา</div>
            <div className="glass-card rounded-xl px-3.5 py-3 text-sm" style={{ color: "var(--t-hi)" }}>{issue.detail}</div>
            {issue.owner_name && <div className="text-[12px] mt-2" style={{ color: "var(--t-low)" }}>ผู้รับผิดชอบ: {issue.owner_name}</div>}
          </div>

          {/* Type */}
          <div>
            <label className="text-[12px] mb-1.5 block" style={{ color: "var(--t-low)" }}>ประเภทปัญหา</label>
            <select value={type} disabled={!canWrite} onChange={(e) => setType(e.target.value as IssueType)} aria-label="ประเภทปัญหา"
              className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] disabled:opacity-60 [&>option]:text-gray-800">
              {TYPES.map((t) => <option key={t.v} value={t.v}>{t.th}</option>)}
            </select>
          </div>

          {/* Status segmented */}
          <div>
            <label className="text-[12px] mb-1.5 block" style={{ color: "var(--t-low)" }}>สถานะ</label>
            <div className="flex gap-2" role="radiogroup" aria-label="สถานะ issue">
              {STATUSES.map((s) => (
                <button key={s.v} role="radio" aria-checked={status === s.v} disabled={!canWrite} onClick={() => setStatus(s.v)}
                  className={`focusable pressable flex-1 rounded-xl px-2 py-2.5 text-[13px] font-medium border min-h-[44px] transition disabled:opacity-60 ${status === s.v ? s.cls : "bg-white/8 text-white/60 border-white/12"}`}>
                  {s.th}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="text-[12px] mb-1.5 block" style={{ color: "var(--t-low)" }} htmlFor="res">
              วิธีแก้ {status === "CLOSED" && <span className="text-rose-300">* (จำเป็นเมื่อปิด)</span>}
            </label>
            <textarea id="res" value={resolution} disabled={!canWrite} onChange={(e) => setResolution(e.target.value)} rows={3}
              className="focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none placeholder-white/40 resize-none disabled:opacity-60"
              placeholder="อธิบายว่าแก้ปัญหาอย่างไร" />
            {issue.resolved_at && <div className="text-[11px] mt-1.5 tnum" style={{ color: "var(--t-low)" }}>ปิดเมื่อ {thDate(issue.resolved_at)}</div>}
          </div>

          {err && <p role="alert" className="text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}

          {canWrite ? (
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="focusable pressable flex-1 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px]">ปิด</button>
              <button onClick={save} disabled={saving || !dirty} className="focusable pressable flex-1 bg-white text-[#1F4E78] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/90 min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" /> : <Check size={16} />} บันทึก
              </button>
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--t-low)" }}>บทบาทนี้ดูได้อย่างเดียว</p>
          )}
        </div>
      </div>
    </div>
  );
}
