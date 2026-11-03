"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { withNickname } from "@/lib/production/nickname";
import { statusTh, type RevPending } from "@/lib/production/rev-review";
import { summarizeRevChanges } from "@/lib/quotation-diff";

/**
 * "Rev. หลังมัดจำ — รอฝ่ายผลิตตรวจ" (0169 · เจ้าของ 3 พ.ย.69)
 *   สถานะพิเศษแยกจากวงจรผลิต: งานยังอยู่เฟสเดิม (รีมาร์คไว้) แต่โผล่ในกล่องนี้จนกว่าฝ่ายผลิตกด "รับทราบ"
 *   การ์ด: ใคร Rev อะไร เมื่อไร · อะไรเปลี่ยน · ชุดผลิต/ใบปะหน้าอัปเดตให้แล้วหรือรอตัดสิน · ลิงก์ไปดู
 */
type RowLike = {
  id: string; job_id: string; status: string; measure_scheduled?: string | null; nickname?: string | null;
  rev_pending?: RevPending | null; rev_pending_count?: number;
  cover_sheet_exists?: boolean; cover_sheet_rev_stale?: boolean; drawing_exists?: boolean; drawing_rev_stale?: boolean;
  job?: { job_code?: string | null; customer_name?: string | null } | null;
};

const SETS_TH: Record<string, { text: string; tone: string }> = {
  auto: { text: "ชุดผลิตดึงใหม่ให้แล้ว", tone: "bg-emerald-500/20 text-emerald-100 border-emerald-300/30" },
  deferred: { text: "ชุดผลิตยังไม่ดึง — กำลังผลิตอยู่ รอคุณตัดสิน", tone: "bg-rose-500/25 text-rose-100 border-rose-300/40" },
  skipped: { text: "ชุดผลิตมาจากใบเสนอใบอื่น — ไม่แตะ", tone: "bg-amber-500/20 text-amber-100 border-amber-300/30" },
  none: { text: "งานยังไม่มีชุดผลิตจากใบเสนอ", tone: "bg-white/10 text-white/70 border-white/15" },
  error: { text: "ดึงชุดผลิตอัตโนมัติไม่สำเร็จ — ดึงเองที่หน้าชุดงาน", tone: "bg-rose-500/25 text-rose-100 border-rose-300/40" },
};
const COVER_TH: Record<string, { text: string; tone: string }> = {
  auto: { text: "ใบปะหน้าอัปเดตตาม Rev ให้แล้ว", tone: "bg-emerald-500/20 text-emerald-100 border-emerald-300/30" },
  manual: { text: "ใบปะหน้ามีแก้มือ — ต้องเปิดดูเอง", tone: "bg-rose-500/25 text-rose-100 border-rose-300/40" },
  none: { text: "ยังไม่มีใบปะหน้า", tone: "bg-white/10 text-white/70 border-white/15" },
};

const thWhen = (iso: string) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export function RevBadge({ revNo, pending, dark = true }: { revNo?: number; pending?: boolean; dark?: boolean }) {
  if (!revNo && !pending) return null;
  if (pending) {
    return <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${dark ? "bg-rose-500/30 border-rose-300/50 text-rose-50" : "bg-rose-100 border-rose-300 text-rose-800"}`}>⚠ Rev{revNo ?? ""} รอตรวจ</span>;
  }
  return <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${dark ? "bg-sky-500/25 border-sky-300/35 text-sky-100" : "bg-sky-100 border-sky-300 text-sky-800"}`}>Rev{revNo}</span>;
}

export default function RevReviewPanel({ rows, canWrite, onChanged, onOpen }: {
  rows: RowLike[]; canWrite: boolean; onChanged: () => void; onOpen: (r: RowLike) => void;
}) {
  const pending = rows.filter((r) => r.rev_pending);
  const [busy, setBusy] = useState<string>("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  if (!pending.length) return null;

  async function ack(r: RowLike, sets: "regen" | "keep" | "") {
    const p = r.rev_pending!;
    if (sets === "regen" && !window.confirm(`ดึงชุดผลิตใหม่จากใบเสนอ Rev${p.rev_no} ของ "${r.job?.customer_name ?? ""}"?\n\nชุดที่ดึงจากใบเสนอทั้งหมดจะถูกแทนที่ (สถานะผลิต/ของที่ติ๊กไว้ของชุดพวกนั้นรีเซ็ต) · ชุดที่เพิ่มมือคงไว้`)) return;
    if (sets === "keep" && p.sets_regen === "deferred" && !window.confirm("ไม่ดึงชุดใหม่ — ชุดผลิตจะยังเป็นสเปคเดิมก่อน Rev คุณจะไปแก้ชุดเองใช่ไหม?")) return;
    setBusy(r.job_id);
    try {
      await api.post(`/jobs/${r.job_id}/rev-review`, { review_id: p.id, note: note[r.job_id] ?? "", ...(sets ? { sets } : {}) });
      onChanged();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "รับทราบไม่สำเร็จ");
      onChanged();   // 409 (คนอื่นปิดแล้ว) → โหลดใหม่ให้ป้ายตรงกับจริง
    } finally { setBusy(""); }
  }

  return (
    <div className="mb-5 rounded-2xl p-3.5" style={{ background: "rgba(244,63,94,.12)", border: "1px solid rgba(244,63,94,.4)" }}>
      <button type="button" onClick={() => setCollapsed((v) => !v)} className="w-full flex items-center gap-2 text-left">
        <span className="text-lg">⚠️</span>
        <span className="text-white font-bold text-[15px]">Rev. หลังมัดจำ — รอฝ่ายผลิตตรวจ</span>
        <span className="text-[12px] font-bold rounded-full px-2 py-0.5 bg-rose-500/40 text-rose-50 border border-rose-300/40 tabular-nums">{pending.length}</span>
        <span className="text-[12px] ml-auto" style={{ color: "var(--t-low)" }}>{collapsed ? "▸ แสดง" : "▾ ซ่อน"}</span>
      </button>
      {!collapsed && (
        <>
          <p className="text-[12.5px] mt-1 mb-3" style={{ color: "var(--t-mid)" }}>
            ใบเสนอราคาถูกแก้หลังลูกค้ามัดจำแล้ว — งานยังอยู่เฟสเดิมในบอร์ดด้านล่าง แต่ต้องมีคนเช็คว่าของที่ต้องเตรียม/ผลิตเปลี่ยนไหม แล้วกด "รับทราบ" ป้ายถึงจะหาย
          </p>
          <div className="grid gap-2.5">
            {pending.map((r) => {
              const p = r.rev_pending!;
              const lines = summarizeRevChanges(p.summary);
              const sets = SETS_TH[p.sets_regen] ?? SETS_TH.none;
              const cover = COVER_TH[p.cover_sync] ?? COVER_TH.none;
              const isBusy = busy === r.job_id;
              return (
                <div key={r.id} className="rounded-xl p-3" style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.1)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => onOpen(r)} className="text-white text-[16px] font-bold leading-tight hover:underline text-left">
                      {withNickname(r.job?.customer_name, r.nickname)}
                    </button>
                    <span className="tnum text-[11px]" style={{ color: "var(--t-low)" }}>{r.job?.job_code}</span>
                    <RevBadge revNo={p.rev_no} pending />
                    {(r.rev_pending_count ?? 1) > 1 && <span className="text-[11px]" style={{ color: "var(--t-low)" }}>(+ Rev ก่อนหน้าอีก {(r.rev_pending_count ?? 1) - 1} ยังไม่รับทราบ)</span>}
                  </div>
                  <div className="text-[12.5px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: "var(--t-mid)" }}>
                    <span>งานอยู่เฟส: <b className="text-white">{statusTh(p.from_status || r.status)}</b>{p.from_status && p.from_status !== r.status ? ` (ตอนนี้ ${statusTh(r.status)})` : ""}</span>
                    <span>Rev โดย {p.created_by_name || "—"} · {thWhen(p.created_at)}</span>
                  </div>
                  <div className="mt-2 rounded-lg px-2.5 py-2 text-[13px] leading-snug" style={{ background: "rgba(255,255,255,.06)", color: "#fde7ea" }}>
                    <div className="font-semibold mb-0.5">อะไรเปลี่ยน</div>
                    {lines.length ? lines.map((l, i) => <div key={i}>{l}</div>) : <div style={{ color: "var(--t-low)" }}>รายการ/สเปคไม่เปลี่ยน (อาจแก้หัวใบ/ส่วนลด/หมายเหตุ)</div>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`text-[11.5px] rounded-full px-2 py-0.5 border ${sets.tone}`}>{sets.text}</span>
                    <span className={`text-[11.5px] rounded-full px-2 py-0.5 border ${cover.tone}`}>{cover.text}</span>
                    {r.drawing_exists && <span className={`text-[11.5px] rounded-full px-2 py-0.5 border ${r.drawing_rev_stale ? COVER_TH.manual.tone : COVER_TH.auto.tone}`}>{r.drawing_rev_stale ? "แบบช่างสแตมป์สเปคอ้าง Rev เก่า — ต้องดู" : "แบบช่างตรง Rev"}</span>}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2 items-center">
                    <Link href={`/quotations?job=${r.job_id}`} className="text-[12.5px] font-semibold rounded-lg px-2.5 py-1.5 bg-white/10 text-white hover:bg-white/15">ดูใบเสนอ</Link>
                    <Link href={`/cover-sheet/${r.job_id}`} className="text-[12.5px] font-semibold rounded-lg px-2.5 py-1.5 bg-white/10 text-white hover:bg-white/15">ใบปะหน้า{p.cover_sync === "manual" ? " ⚠" : ""}</Link>
                    {canWrite && (
                      <>
                        <input value={note[r.job_id] ?? ""} onChange={(e) => setNote((n) => ({ ...n, [r.job_id]: e.target.value }))} placeholder="โน้ตตอนรับทราบ (ไม่บังคับ)"
                          className="flex-1 min-w-[160px] rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white/10 text-white placeholder:text-white/40 outline-none border border-white/15 focus:border-white/40" />
                        {p.sets_regen === "deferred" ? (
                          <>
                            <button type="button" disabled={isBusy} onClick={() => ack(r, "regen")} className="press rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "#e11d48" }}>ดึงชุดผลิตใหม่ + รับทราบ</button>
                            <button type="button" disabled={isBusy} onClick={() => ack(r, "keep")} className="press rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white bg-white/15 disabled:opacity-50">ไม่ดึง แก้ชุดเอง + รับทราบ</button>
                          </>
                        ) : (
                          <button type="button" disabled={isBusy} onClick={() => ack(r, "")} className="press rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: "#16a34a" }}>✓ ตรวจแล้ว รับทราบ</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
