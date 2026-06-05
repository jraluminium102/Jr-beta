"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { thDate } from "@/lib/format";
import { Spinner } from "@/components/ui/primitives";
import { ChevronRight, Check } from "@/components/ui/icons";
import {
  PHASE_TH, TYPE_TH, STATUS_TH, SEVERITY_TH, dueBadge, type IssueTrackRow,
} from "@/components/issues/IssueTrackTable";
import type { IssueStatus } from "@/lib/database.types";

type Owner = { id: string; full_name: string };
type Update = { id: number; note: string; new_status: IssueStatus | null; created_at: string; author: { full_name: string } | null };

const PRIORITY_OPTS: [number, string][] = [[0, "ปกติ"], [1, "ติดตาม"], [2, "ด่วน"], [3, "ด่วนมาก"]];
const fieldCls = "focusable w-full glass-card rounded-xl px-3.5 py-2.5 text-sm text-white outline-none min-h-[44px] disabled:opacity-60 [&>option]:text-gray-800";
const lbl = "block text-[12px] mb-1.5";

export function IssueDetail({ issueId }: { issueId: string }) {
  const issueQ = useQuery({ queryKey: ["issue", issueId], queryFn: () => api.get<IssueTrackRow>(`/issues/${issueId}`) });
  const updatesQ = useQuery({ queryKey: ["issue-updates", issueId], queryFn: () => api.get<Update[]>(`/issues/${issueId}/updates`) });

  const issue = issueQ.data?.data;
  const canWrite = (issueQ.data?.meta?.can_write as boolean) ?? false;
  const owners = (issueQ.data?.meta?.owners as Owner[]) ?? [];
  const updates = updatesQ.data?.data ?? [];

  if (issueQ.isLoading) return <Spinner />;
  if (!issue) return <div className="glass-card rounded-2xl p-8 text-center text-sm" style={{ color: "var(--t-mid)" }}>ไม่พบ issue</div>;

  const closed = issue.status === "CLOSED";
  const due = dueBadge(issue.due_date, closed);
  const sev = SEVERITY_TH[issue.severity] ?? SEVERITY_TH.MEDIUM;
  const refetchAll = () => { issueQ.refetch(); updatesQ.refetch(); };

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--t-low)" }}>
        <Link href="/issues" className="focusable hover:text-white">ระบบปัญหางาน</Link>
        <ChevronRight size={14} />
        <span className="text-white/80 tnum">{issue.job?.job_code ?? issue.issue_code}</span>
      </div>

      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-lg tnum">{issue.job?.job_code ?? "—"}</span>
              {issue.is_auto_created && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-400/20 text-sky-100 border border-sky-300/25">auto</span>}
            </div>
            <div className="text-sm mt-0.5" style={{ color: "var(--t-low)" }}>{issue.job?.customer_name}</div>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border ${STATUS_TH[issue.status][0]}`}>{STATUS_TH[issue.status][1]}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-white/12 text-white/85 border-white/15">{PHASE_TH[issue.phase] ?? issue.phase}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-white/12 text-white/85 border-white/15">{TYPE_TH[issue.type] ?? issue.type}</span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border ${sev[0]}`}>{sev[1]}</span>
          {due && <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border tnum ${due.cls}`}>{due.text}</span>}
          <span className="text-[11px] tnum" style={{ color: "var(--t-low)" }}>แจ้งเมื่อ {thDate(issue.reported_at)}</span>
        </div>

        <div className="mt-4">
          <div className="text-[12px] mb-1.5" style={{ color: "var(--t-low)" }}>รายละเอียดปัญหา</div>
          <div className="glass-soft rounded-xl px-3.5 py-3 text-sm" style={{ color: "var(--t-hi)" }}>{issue.detail}</div>
        </div>

        {issue.resolution && (
          <div className="mt-3">
            <div className="text-[12px] mb-1.5" style={{ color: "var(--t-low)" }}>วิธีแก้ {issue.resolved_at && <span className="tnum">· ปิดเมื่อ {thDate(issue.resolved_at)}</span>}</div>
            <div className="glass-soft rounded-xl px-3.5 py-3 text-sm" style={{ color: "var(--t-hi)" }}>{issue.resolution}</div>
          </div>
        )}
      </div>

      {/* assign / track controls */}
      {canWrite && <AssignPanel issue={issue} owners={owners} onSaved={refetchAll} />}

      {/* timeline */}
      <div className="glass-card rounded-2xl p-5 sm:p-6">
        <h2 className="text-white font-semibold mb-3">ความคืบหน้า</h2>
        {updatesQ.isLoading ? <Spinner label="กำลังโหลด timeline…" /> : (
          <Timeline updates={updates} />
        )}
        {canWrite && !closed && <AddUpdateForm issueId={issueId} onAdded={refetchAll} />}
        {canWrite && !closed && <CloseForm issueId={issueId} onClosed={refetchAll} />}
      </div>
    </div>
  );
}

// ---------- assign owner / due / priority ----------
function AssignPanel({ issue, owners, onSaved }: { issue: IssueTrackRow; owners: Owner[]; onSaved: () => void }) {
  const [ownerId, setOwnerId] = useState(issue.owner_id ?? "");
  const [due, setDue] = useState(issue.due_date ?? "");
  const [priority, setPriority] = useState(issue.priority ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = ownerId !== (issue.owner_id ?? "") || due !== (issue.due_date ?? "") || priority !== (issue.priority ?? 0);

  const save = async () => {
    setErr(null); setSaving(true);
    try {
      await api.patch(`/issues/${issue.id}`, { owner_id: ownerId || null, due_date: due || null, priority });
      onSaved();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6">
      <h2 className="text-white font-semibold mb-3">มอบหมาย / จัดลำดับ</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="own">ผู้รับผิดชอบ</label>
          <select id="own" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={fieldCls}>
            <option value="">— ยังไม่มอบหมาย —</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="due">ครบกำหนด</label>
          <input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${fieldCls} tnum`} />
        </div>
        <div>
          <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="pri">ลำดับความสำคัญ</label>
          <select id="pri" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={fieldCls}>
            {PRIORITY_OPTS.map(([v, th]) => <option key={v} value={v}>{th}</option>)}
          </select>
        </div>
      </div>
      {err && <p role="alert" className="mt-3 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
      <div className="flex justify-end mt-3">
        <button onClick={save} disabled={saving || !dirty} className="focusable pressable bg-white text-[#B3151D] rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/90 min-h-[44px] disabled:opacity-50 flex items-center gap-2">
          {saving ? <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" /> : <Check size={16} />} บันทึก
        </button>
      </div>
    </div>
  );
}

// ---------- timeline list ----------
function Timeline({ updates }: { updates: Update[] }) {
  if (updates.length === 0) return <p className="text-[13px]" style={{ color: "var(--t-low)" }}>ยังไม่มีความคืบหน้า</p>;
  return (
    <ol className="space-y-3">
      {updates.map((u) => (
        <li key={u.id} className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="w-2 h-2 rounded-full bg-white/50" />
            <span className="w-px flex-1 bg-white/12 mt-1" />
          </div>
          <div className="flex-1 pb-1">
            <div className="text-sm" style={{ color: "var(--t-hi)" }}>{u.note}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]" style={{ color: "var(--t-low)" }}>
              <span className="tnum">{thDate(u.created_at)}</span>
              {u.author?.full_name && <span>· {u.author.full_name}</span>}
              {u.new_status && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_TH[u.new_status][0]}`}>→ {STATUS_TH[u.new_status][1]}</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------- เพิ่มความคืบหน้า (ไม่ปิดงาน) ----------
function AddUpdateForm({ issueId, onAdded }: { issueId: string; onAdded: () => void }) {
  const [note, setNote] = useState("");
  const [markProgress, setMarkProgress] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!note.trim()) { setErr("กรุณาระบุความคืบหน้า"); return; }
    setSaving(true);
    try {
      await api.post(`/issues/${issueId}/updates`, { note, new_status: markProgress ? "IN_PROGRESS" : undefined });
      setNote(""); setMarkProgress(false); onAdded();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="note">เพิ่มความคืบหน้า</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        className={`${fieldCls} resize-none`} placeholder="เช่น โทรนัดช่างเข้าหน้างานพรุ่งนี้" />
      <label className="flex items-center gap-2 mt-2 text-[13px] text-white/80 cursor-pointer">
        <input type="checkbox" checked={markProgress} onChange={(e) => setMarkProgress(e.target.checked)} className="focusable w-4 h-4 accent-[#B3151D]" />
        ตั้งสถานะเป็น “กำลังแก้”
      </label>
      {err && <p role="alert" className="mt-2 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
      <div className="flex justify-end mt-2">
        <button onClick={submit} disabled={saving} className="focusable pressable glass-card text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-white/20 min-h-[44px] disabled:opacity-50 flex items-center gap-2">
          {saving && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />} เพิ่ม
        </button>
      </div>
    </div>
  );
}

// ---------- ปิดงาน (ต้องมี resolution) ----------
function CloseForm({ issueId, onClosed }: { issueId: string; onClosed: () => void }) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setErr(null);
    if (!resolution.trim()) { setErr("ต้องระบุวิธีแก้ก่อนปิด issue"); return; }
    setSaving(true);
    try {
      // ปิดผ่าน timeline → log + sync status + resolution ในที่เดียว
      await api.post(`/issues/${issueId}/updates`, { note: `ปิดงาน: ${resolution}`, new_status: "CLOSED", resolution });
      onClosed();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "ปิดไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  if (!open) {
    return (
      <div className="mt-3">
        <button onClick={() => setOpen(true)} className="focusable pressable w-full bg-emerald-500/20 text-emerald-100 border border-emerald-300/30 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-500/30 min-h-[44px]">
          ปิดงาน (แก้เสร็จแล้ว)
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 glass-soft rounded-xl p-4">
      <label className={lbl} style={{ color: "var(--t-low)" }} htmlFor="res">วิธีแก้ <span className="text-rose-300">* (จำเป็นเมื่อปิด)</span></label>
      <textarea id="res" value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3}
        className={`${fieldCls} resize-none`} placeholder="อธิบายว่าแก้ปัญหาอย่างไร" />
      {err && <p role="alert" className="mt-2 text-[13px] text-rose-200 bg-rose-500/15 border border-rose-300/25 rounded-xl px-3 py-2">{err}</p>}
      <div className="flex gap-2 mt-2">
        <button onClick={() => setOpen(false)} className="focusable pressable flex-1 glass-card text-white rounded-xl px-4 py-2.5 text-sm hover:bg-white/20 min-h-[44px]">ยกเลิก</button>
        <button onClick={submit} disabled={saving} className="focusable pressable flex-1 bg-emerald-500/30 text-emerald-50 border border-emerald-300/40 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-500/40 min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Check size={16} />} ยืนยันปิด
        </button>
      </div>
    </div>
  );
}
