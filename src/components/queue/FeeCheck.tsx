"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { dayLabel, thaiDate, type QueueEntry } from "@/lib/queue";
import {
  FEE_BUCKET_TH, FEE_CHECK_FROM, FEE_HIDDEN, FEE_VOID, FEE_WAITING, feeAddDays, feeAskGroups, feeBucket, feeDayNote, feeIsDue, feeIsOpen, feeSum, sortUnpaid, type FeeBucket,
} from "@/lib/fee-check";

/**
 * เช็คค่าประเมินหน้างาน (เจ้าของสั่ง 23 พ.ย.69) — ปุ่มบนหน้าคิวงาน + หน้าต่างรายชื่อ
 *   ดูทีเดียวทุกเดือนตั้งแต่ พ.ย.69: ใครยังไม่จ่าย · ใครส่งเลขบัญชีไปแล้วรอโอน · ใครยังไม่ได้ทำอะไร · ใครจ่ายแล้ว
 *   กดเปลี่ยนสถานะได้จากตรงนี้เลย (เขียนกลับช่อง ชำระ + ติ๊กชำระ ของคิว — ที่เดียวกับในตาราง ไม่มีที่เก็บใหม่)
 *   ⚠ ไม่ส่ง "มัดจำหน้างาน" จากหน้านี้ (ตัวนั้นมีผลกับเงิน/ผลิต ต้องทำในฟอร์มคิวเท่านั้น)
 */

type Tab = "UNPAID" | "TODO" | "WAITING" | "PAID" | "HIDDEN" | "VOID";
// แท็บรอง (ปุ่มเล็กใต้กล่องสรุป) — ซ่อนไว้ / ยกเลิก (เจ้าของ 26 พ.ย.69) · ไม่นับเป็นยอดค้าง แต่กดดูและเอากลับมาได้
const SIDE_TAB: Record<"HIDDEN" | "VOID", { th: string; empty: string }> = {
  HIDDEN: { th: "ซ่อนไว้", empty: "ยังไม่มีคิวที่ซ่อนไว้" },
  VOID: { th: "ยกเลิก", empty: "ยังไม่มีคิวที่ยกเลิกค่าประเมิน" },
};
// ส่งเฉพาะช่องที่เปลี่ยนจริง — ช่องชำระที่ไม่ได้แตะ (เช่น มัดจำหน้างาน) จะไม่ถูกส่งซ้ำไปที่ server
type Patch = { payment?: string | null; fee_paid?: boolean };

const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${TH_MON[m]} ${y}`; };
const baht = (n: number) => `${n.toLocaleString("th-TH")} บาท`;
const fmtTime = (t: string | null) => { const m = String(t ?? "").match(/(\d{1,2})[:.](\d{2})/); return m ? `${m[1].padStart(2, "0")}.${m[2]}` : ""; };
const dateLine = (e: QueueEntry) => (e.queue_date ? `${dayLabel(e.queue_date)} ${thaiDate(e.queue_date)}${fmtTime(e.queue_time) ? ` · ${fmtTime(e.queue_time)} น.` : ""}` : "ยังไม่ลงวัน");

const TILE: Record<"UNPAID" | "TODO" | "WAITING" | "PAID", { th: string; hint: string; on: string; num: string }> = {
  UNPAID:  { th: "ยังไม่จ่ายทั้งหมด", hint: "รวมทุกกลุ่มที่ยังไม่ได้เงิน", on: "border-red-400 bg-red-50", num: "text-red-700" },
  TODO:    { th: "ยังไม่ดำเนินการ", hint: "ยังไม่ได้ส่งเลขบัญชีให้ลูกค้า", on: "border-orange-400 bg-orange-50", num: "text-orange-700" },
  WAITING: { th: "ส่งเลขแล้ว รอโอน", hint: "ช่องชำระ = รอค่าประเมิน", on: "border-amber-400 bg-amber-50", num: "text-amber-700" },
  PAID:    { th: "จ่ายแล้ว", hint: "ติ๊กชำระค่าประเมินแล้ว", on: "border-emerald-400 bg-emerald-50", num: "text-emerald-700" },
};

export function FeeCheckButton({ today, refreshKey, onChanged, onOpenEntry }: {
  today: string;
  /** เปลี่ยนค่า = โหลดตัวเลขบนปุ่มใหม่ (หน้าคิวงานส่งตัวนับที่ขยับทุกครั้งที่โหลดคิว) */
  refreshKey?: number;
  /** มีการแก้ในหน้าต่างนี้ → ให้หน้าคิวงานโหลดตารางใหม่ */
  onChanged?: () => void;
  /** กดชื่อลูกค้า → เปิดฟอร์มคิว */
  onOpenEntry?: (e: QueueEntry) => void;
}) {
  const [rows, setRows] = useState<QueueEntry[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<QueueEntry[]>("/queue/fee-check");
      setRows(res.data ?? []);
      setCanWrite(Boolean(res.meta?.can_write));
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดรายการค่าประเมินไม่สำเร็จ");
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  // ตัวเลขแดง = ยังไม่จ่ายและถึงวันคิวแล้ว (วันนี้ + ที่ผ่านมา) — คิวล่วงหน้าไม่นับ ยังไม่ต้องทวง
  const unpaid = useMemo(() => rows.filter((e) => { const b = feeBucket(e); return feeIsOpen(b) && feeIsDue(e, today); }).length, [rows, today]);

  function close() {
    setOpen(false);
    if (dirty) { setDirty(false); onChanged?.(); }
  }

  return (
    <>
      <button onClick={() => { setOpen(true); load(); }}
        title={`เช็คว่าใครจ่ายค่าประเมินแล้ว / ยังไม่จ่าย (คิวตั้งแต่ ${monthLabel(FEE_CHECK_FROM.slice(0, 7))}) · ตัวเลขแดง = ค้างจ่ายถึงวันนี้ ไม่นับคิวล่วงหน้า`}
        className="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold glass-soft text-ink-2">
        <Icon name="banknote" size={16} /> <span className="hidden sm:inline">เช็คค่าประเมิน</span>
        {loaded && !err && unpaid > 0 && (
          <span className="rounded-full bg-red-600 text-white text-[11px] font-bold min-w-[20px] px-1.5 py-0.5 text-center tabular-nums">{unpaid}</span>
        )}
      </button>
      {/* ปุ่มอยู่ในแถบหัวที่ตรึงบน (มี backdrop-filter) → หน้าต่างต้องย้ายไปเกาะ body ไม่งั้น fixed จะยึดกับแถบหัวแล้วโดนตัด */}
      {open && createPortal(
        <FeeCheckModal rows={rows} setRows={setRows} canWrite={canWrite} today={today} err={err} loaded={loaded} refreshing={loading}
          onReload={load} onDirty={() => setDirty(true)} onClose={close}
          onOpenEntry={onOpenEntry ? (e) => { close(); onOpenEntry(e); } : undefined} />,
        document.body,
      )}
    </>
  );
}

function FeeCheckModal({ rows, setRows, canWrite, today, err, loaded, refreshing, onReload, onDirty, onClose, onOpenEntry }: {
  rows: QueueEntry[]; setRows: React.Dispatch<React.SetStateAction<QueueEntry[]>>;
  canWrite: boolean; today: string; err: string; loaded: boolean;
  /** กำลังดึงรายการล่าสุด — ล็อกปุ่มไว้ก่อน กันผลโหลดเก่ามาทับสิ่งที่เพิ่งกด */
  refreshing: boolean;
  onReload: () => void; onDirty: () => void; onClose: () => void; onOpenEntry?: (e: QueueEntry) => void;
}) {
  const [tab, setTab] = useState<Tab>("UNPAID");
  const [month, setMonth] = useState<string>("");   // "" = ทุกเดือน
  const [salesId, setSalesId] = useState<string>("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; name: string; did: string; prev: Patch } | null>(null);
  const [copied, setCopied] = useState(false);
  // ถามเซลล์ทางไลน์ (เจ้าของ 24 พ.ย.69) — คิวตั้งแต่เมื่อวานเป็นต้นไป ที่ยังไม่ได้ติ๊ก/เลือกอะไรในช่องชำระ
  const [ask, setAsk] = useState(false);
  //   เลือกได้: เฉพาะวันนี้ / ตั้งแต่เมื่อวาน / ย้อนเองถึงวันไหน · ไม่รวมคิวล่วงหน้าเสมอ (เอาไว้ทวง)
  const yesterday = feeAddDays(today, -1);
  const [askMode, setAskMode] = useState<"TODAY" | "YESTERDAY" | "CUSTOM">("YESTERDAY");
  const [askFrom, setAskFrom] = useState(yesterday);
  const [askCopied, setAskCopied] = useState<string | null>(null);   // key ของก้อนที่เพิ่งก๊อป · "*" = ทั้งหมด
  const askStart = askMode === "TODAY" ? today : askMode === "YESTERDAY" ? yesterday : (askFrom || yesterday);
  const askGroups = useMemo(() => feeAskGroups(rows, askStart, today), [rows, askStart, today]);
  const askTotal = askGroups.reduce((s, g) => s + g.rows.length, 0);
  function copyAsk(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => { setAskCopied(key); setTimeout(() => setAskCopied((k) => (k === key ? null : k)), 1600); }).catch(() => alert("คัดลอกไม่สำเร็จ"));
  }

  const checked = useMemo(() => rows.filter((e) => feeBucket(e) !== null), [rows]);
  const months = useMemo(() => [...new Set(checked.map((e) => (e.queue_date ? e.queue_date.slice(0, 7) : "")).filter(Boolean))].sort(), [checked]);
  const salesOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of checked) if (e.sales_id && e.sales?.name) m.set(e.sales_id, e.sales.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [checked]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return checked.filter((e) => {
      if (month && (e.queue_date ?? "").slice(0, 7) !== month) return false;
      if (salesId && e.sales_id !== salesId) return false;
      if (kw && !`${e.customer_name ?? ""} ${e.tel ?? ""} ${e.line_contact ?? ""} ${e.sales?.name ?? ""}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [checked, month, salesId, q]);

  // groups = ยังไม่จ่ายที่ถึงวันคิวแล้ว (วันนี้ + ที่ผ่านมา = ต้องทวง) + จ่ายแล้วทั้งหมด
  // later  = ยังไม่จ่ายแต่ยังไม่ถึงวันคิว / ยังไม่ลงวัน → ไม่สำคัญ ไว้ท้ายรายการ (เจ้าของ 24 พ.ย.69)
  const { groups, later } = useMemo(() => {
    const g: Record<FeeBucket, QueueEntry[]> = { TODO: [], WAITING: [], UNCONFIRMED: [], PAID: [], HIDDEN: [], VOID: [] };
    const l: Record<FeeBucket, QueueEntry[]> = { TODO: [], WAITING: [], UNCONFIRMED: [], PAID: [], HIDDEN: [], VOID: [] };
    // ซ่อน/ยกเลิก/จ่ายแล้ว ไม่แยกล่วงหน้า — อยู่แท็บของตัวเองทั้งหมด
    for (const e of filtered) { const b = feeBucket(e); if (b) (!feeIsOpen(b) || feeIsDue(e, today) ? g : l)[b].push(e); }
    for (const x of [g, l]) { x.TODO = sortUnpaid(x.TODO); x.WAITING = sortUnpaid(x.WAITING); x.UNCONFIRMED = sortUnpaid(x.UNCONFIRMED); }
    g.HIDDEN = sortUnpaid(g.HIDDEN); g.VOID = sortUnpaid(g.VOID);
    g.PAID = [...g.PAID].sort((a, b) => `${b.queue_date ?? ""}${b.queue_time ?? ""}`.localeCompare(`${a.queue_date ?? ""}${a.queue_time ?? ""}`));
    return { groups: g, later: l };
  }, [filtered, today]);
  const unpaidAll = useMemo(() => [...groups.TODO, ...groups.WAITING, ...groups.UNCONFIRMED], [groups]);
  const tileRows: Record<Tab, QueueEntry[]> = { UNPAID: unpaidAll, TODO: groups.TODO, WAITING: groups.WAITING, PAID: groups.PAID, HIDDEN: groups.HIDDEN, VOID: groups.VOID };
  const laterRows: Record<Tab, QueueEntry[]> = { UNPAID: sortUnpaid([...later.TODO, ...later.WAITING, ...later.UNCONFIRMED]), TODO: later.TODO, WAITING: later.WAITING, PAID: [], HIDDEN: [], VOID: [] };
  const lateCount = unpaidAll.filter((e) => feeDayNote(e.queue_date, today).late).length;

  async function save(e: QueueEntry, next: Patch, did: string, keepUndo = true) {
    if (busyId || refreshing) return;
    // prev เก็บเฉพาะช่องที่กำลังจะเปลี่ยน → "เลิกทำ" ก็ส่งกลับเฉพาะช่องนั้น
    const prev: Patch = {};
    if ("payment" in next) prev.payment = e.payment ?? null;
    if ("fee_paid" in next) prev.fee_paid = Boolean(e.fee_paid);
    setBusyId(e.id);
    setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, ...next } : r)));
    try {
      await api.patch(`/queue/${e.id}`, next);
      onDirty();
      setUndo(keepUndo ? { id: e.id, name: e.customer_name, did, prev } : null);
    } catch (ex) {
      setRows((rs) => rs.map((r) => (r.id === e.id ? { ...r, ...prev } : r)));
      alert(ex instanceof Error ? ex.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }
  function undoLast() {
    if (!undo) return;
    const e = rows.find((r) => r.id === undo.id);
    if (e) save(e, undo.prev, "", false);
  }

  function copyList() {
    const line = (e: QueueEntry) =>
      `- ${e.customer_name} · ${e.queue_date ? `${dayLabel(e.queue_date)} ${thaiDate(e.queue_date).replace(/\s\d{4}$/, "")}` : "ยังไม่ลงวัน"}${e.sales?.name ? ` · ${e.sales.name}` : ""} · ${baht(Number(e.assess_fee ?? 0))} · ${feeDayNote(e.queue_date, today).text}`;
    const parts: string[] = [`ค่าประเมินยังไม่จ่าย คิวถึงวันนี้ (ณ ${thaiDate(today)}) ${unpaidAll.length} คิว · ${baht(feeSum(unpaidAll))}`];
    for (const b of ["TODO", "WAITING", "UNCONFIRMED"] as const) {
      if (!groups[b].length) continue;
      parts.push("", `■ ${FEE_BUCKET_TH[b]} (${groups[b].length})`, ...groups[b].map(line));
    }
    navigator.clipboard.writeText(parts.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => alert("คัดลอกไม่สำเร็จ"));
  }

  const chip = (active: boolean) => `press shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${active ? "bg-brand border-brand text-white" : "bg-white border-gray-200 text-ink-2"}`;
  const filtering = Boolean(month || salesId || q.trim());

  const section = (b: FeeBucket, list: QueueEntry[], showHead: boolean) => list.length === 0 ? null : (
    <section key={b} className="mt-3 first:mt-0">
      {showHead && (
        <h3 className="text-xs font-bold text-ink-2 mb-1.5 flex items-center gap-2">
          {FEE_BUCKET_TH[b]} <span className="text-ink-3 font-medium">{list.length} คิว · {baht(feeSum(list))}</span>
        </h3>
      )}
      <div className="rounded-xl border border-gray-200/80 bg-white divide-y divide-gray-100">
        {list.map((e) => <Row key={e.id} e={e} bucket={b} today={today} canWrite={canWrite} busy={busyId === e.id || refreshing} onSave={save} onOpenEntry={onOpenEntry} />)}
      </div>
    </section>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[94dvh] flex flex-col glass rounded-2xl fade-in">
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-gray-200/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-brand-dark flex items-center gap-2"><Icon name="banknote" size={17} /> เช็คค่าประเมิน</h2>
              <p className="text-xs text-ink-3 mt-0.5">คิวที่มีค่าประเมิน ตั้งแต่ {monthLabel(FEE_CHECK_FROM.slice(0, 7))} · ไม่รวมคิวที่ยกเลิก · ตัวเลขยังไม่จ่าย = คิวถึงวันนี้ (คิวล่วงหน้าอยู่ท้ายรายการ)</p>
            </div>
            <button onClick={onClose} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1"><Icon name="close" size={17} /></button>
          </div>

          {/* สรุป 4 กล่อง — กดเพื่อดูรายชื่อกลุ่มนั้น */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {(["UNPAID", "TODO", "WAITING", "PAID"] as const).map((t) => {
              const list = tileRows[t]; const meta = TILE[t]; const active = !ask && tab === t;
              return (
                <button key={t} onClick={() => { setTab(t); setAsk(false); }} aria-pressed={active} title={meta.hint}
                  className={`press text-left rounded-xl border-2 px-3 py-2 transition-colors ${active ? meta.on : "border-gray-200 bg-white"}`}>
                  <div className="text-[11.5px] font-semibold text-ink-2 leading-tight">{meta.th}</div>
                  <div className={`text-2xl font-bold leading-tight tabular-nums ${meta.num}`}>{list.length}<span className="text-xs font-semibold text-ink-3 ml-1">คิว</span></div>
                  <div className="text-[11px] text-ink-3 tabular-nums">{baht(feeSum(list))}</div>
                  {laterRows[t].length > 0 && <div className="text-[10.5px] text-ink-3 leading-tight">ล่วงหน้าอีก {laterRows[t].length} คิว</div>}
                </button>
              );
            })}
          </div>

          {/* ซ่อนไว้ / ยกเลิก — ไม่นับเป็นยอดค้าง กดดูได้ เอากลับมาได้ */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs">
            <span className="text-ink-3">ไม่นับเป็นยอดค้าง:</span>
            {(["HIDDEN", "VOID"] as const).map((t) => {
              const active = !ask && tab === t;
              return (
                <button key={t} onClick={() => { setTab(t); setAsk(false); }} aria-pressed={active}
                  title={t === "HIDDEN" ? "ลูกค้าไม่จ่ายนานมาก น่าจะไม่จ่ายแล้ว — เก็บไว้ดูได้" : "ไม่เก็บค่าประเมินแล้ว เช่น เข้าหน้างานแล้วไม่ทำต่อ"}
                  className={`press rounded-full border px-3 py-1 font-semibold ${active ? "bg-gray-700 border-gray-700 text-white" : "bg-white border-gray-300 text-ink-2"}`}>
                  {SIDE_TAB[t].th} {tileRows[t].length} คิว
                </button>
              );
            })}
          </div>

          {/* กรอง: เดือน · เซลล์ · ค้นชื่อ */}
          <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-0.5">
            <button onClick={() => setMonth("")} className={chip(month === "")}>ทุกเดือน</button>
            {months.map((m) => <button key={m} onClick={() => setMonth(m)} className={chip(month === m)}>{monthLabel(m)}</button>)}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <select value={salesId} onChange={(ev) => setSalesId(ev.target.value)} aria-label="กรองตามเซลล์"
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-ink">
              <option value="">เซลล์ทุกคน</option>
              {salesOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="ค้นชื่อ / เบอร์…" aria-label="ค้นหา"
              className="flex-1 min-w-[140px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs outline-none" />
            <button onClick={copyList} disabled={unpaidAll.length === 0}
              title="คัดลอกรายชื่อคนที่ยังไม่จ่าย คิวถึงวันนี้ ไม่รวมคิวล่วงหน้า (ตามตัวกรองที่เลือก) ไปวางในไลน์"
              className="press inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-50">
              <Icon name="copy" size={13} /> {copied ? "คัดลอกแล้ว" : "ก๊อปรายชื่อยังไม่จ่าย"}
            </button>
            <button onClick={() => setAsk((v) => !v)} aria-pressed={ask}
              title="ทำข้อความถามเซลล์ว่าลูกค้าจ่ายค่าประเมินยัง — ก๊อปไปวางในไลน์"
              className={`press inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${ask ? "border-brand bg-brand text-white" : "border-gray-300 bg-white text-ink-2"}`}>
              <Icon name="copy" size={13} /> ถามเซลล์ทางไลน์
              {askTotal > 0 && <span className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${ask ? "bg-white text-brand" : "bg-red-600 text-white"}`}>{askTotal}</span>}
            </button>
          </div>
        </div>

        {/* ข้อความถามเซลล์ — แยกก้อนตามเซลล์ กดก๊อปแล้วไปวางในไลน์ได้เลย */}
        {ask && (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
            <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">ข้อความถามเซลล์: ลูกค้าจ่ายค่าประเมินยัง</h3>
                <p className="text-xs text-ink-3 mt-0.5">คิวที่มีค่าประเมิน แต่ยังไม่ได้ติ๊กชำระ และยังไม่ได้เลือกอะไรในช่องชำระเลย · ไม่รวมคิวล่วงหน้า</p>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs text-ink-2 font-semibold">
                  <span>เอาคิว</span>
                  <button onClick={() => setAskMode("TODAY")} aria-pressed={askMode === "TODAY"} className={chip(askMode === "TODAY")}>เฉพาะวันนี้</button>
                  <button onClick={() => setAskMode("YESTERDAY")} aria-pressed={askMode === "YESTERDAY"} className={chip(askMode === "YESTERDAY")}>ตั้งแต่เมื่อวาน ถึงวันนี้</button>
                  <button onClick={() => setAskMode("CUSTOM")} aria-pressed={askMode === "CUSTOM"} className={chip(askMode === "CUSTOM")}>ย้อนไปไกลกว่านั้น</button>
                  {askMode === "CUSTOM" && (
                    <label className="flex items-center gap-1.5">
                      ตั้งแต่วันที่
                      <input type="date" value={askFrom} max={today} onChange={(ev) => setAskFrom(ev.target.value)}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-ink font-normal" />
                      ถึงวันนี้
                    </label>
                  )}
                </div>
              </div>
              <button onClick={() => copyAsk("*", askGroups.map((g) => g.text).join("\n\n\n"))} disabled={askTotal === 0}
                className="press inline-flex items-center gap-1.5 rounded-lg border border-brand bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                <Icon name="copy" size={13} /> {askCopied === "*" ? "คัดลอกแล้ว" : `ก๊อปทั้งหมด (${askTotal} คิว)`}
              </button>
            </div>
            {!loaded && <p className="text-center text-ink-3 py-10 text-sm">กำลังโหลด…</p>}
            {loaded && err && <p className="text-center text-red-700 py-10 text-sm">โหลดรายการไม่สำเร็จ: {err}</p>}
            {loaded && !err && askTotal === 0 && <p className="text-center text-ink-3 py-10 text-sm">ไม่มีคิวที่ต้องถาม — ทุกคิวในช่วงวันที่เลือก ติ๊กหรือเลือกช่องชำระแล้ว</p>}
            {loaded && !err && askGroups.map((g) => (
              <section key={g.key || "-"} className="mb-3 rounded-xl border border-gray-200/80 bg-white">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
                  <h4 className="text-sm font-bold text-ink">{g.sales} <span className="text-xs font-medium text-ink-3">{g.rows.length} คิว</span></h4>
                  <button onClick={() => copyAsk(g.key || "-", g.text)}
                    className="press inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-2">
                    <Icon name="copy" size={13} /> {askCopied === (g.key || "-") ? "คัดลอกแล้ว" : "ก๊อปของคนนี้"}
                  </button>
                </div>
                <pre className="px-3 py-2 text-[13px] leading-relaxed text-ink whitespace-pre-wrap break-words font-sans">{g.text}</pre>
              </section>
            ))}
          </div>
        )}


        <div className={`flex-1 overflow-y-auto px-4 sm:px-6 py-3 ${ask ? "hidden" : ""}`}>
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2 mb-3 flex items-center justify-between gap-2">
              <span>โหลดรายการไม่สำเร็จ: {err}</span>
              <button onClick={onReload} className="press underline font-semibold shrink-0">ลองใหม่</button>
            </div>
          )}
          {!loaded && <p className="text-center text-ink-3 py-10 text-sm">กำลังโหลด…</p>}

          {loaded && !err && tab === "UNPAID" && lateCount > 0 && (
            <p className="text-xs text-red-700 font-semibold mb-2">เข้าหน้างานไปแล้วแต่ยังไม่ได้ค่าประเมิน {lateCount} คิว — ขึ้นไว้บนสุดของแต่ละกลุ่ม</p>
          )}

          {loaded && !err && tab === "UNPAID" && (
            <>
              {section("TODO", groups.TODO, true)}
              {section("WAITING", groups.WAITING, true)}
              {section("UNCONFIRMED", groups.UNCONFIRMED, true)}
            </>
          )}
          {loaded && !err && tab === "TODO" && section("TODO", groups.TODO, false)}
          {loaded && !err && tab === "WAITING" && section("WAITING", groups.WAITING, false)}
          {loaded && !err && tab === "PAID" && section("PAID", groups.PAID, false)}
          {loaded && !err && tab === "HIDDEN" && groups.HIDDEN.length > 0 && (
            <p className="text-xs text-ink-3 mb-2">ลูกค้าไม่จ่ายนานมากจนน่าจะไม่จ่ายแล้ว — ไม่นับเป็นยอดค้าง ไม่อยู่ในข้อความทวง · ถ้าลูกค้าจ่ายภายหลังกด โอนแล้ว / จ่ายสดแล้ว ได้เลย</p>
          )}
          {loaded && !err && tab === "HIDDEN" && section("HIDDEN", groups.HIDDEN, false)}
          {loaded && !err && tab === "VOID" && groups.VOID.length > 0 && (
            <p className="text-xs text-ink-3 mb-2">ไม่เก็บค่าประเมินแล้ว — ไม่นับเป็นยอดค้าง · ยกเลิกเฉพาะค่าประเมิน คิวและงานของลูกค้ายังอยู่เหมือนเดิม</p>
          )}
          {loaded && !err && tab === "VOID" && section("VOID", groups.VOID, false)}

          {loaded && !err && tileRows[tab].length === 0 && (
            <p className={`text-center text-ink-3 text-sm ${laterRows[tab].length > 0 ? "py-5" : "py-10"}`}>
              {tab === "HIDDEN" || tab === "VOID" ? SIDE_TAB[tab].empty : tab === "PAID" ? "ยังไม่มีคิวที่จ่ายแล้ว" : tab === "UNPAID" ? "คิวถึงวันนี้ ไม่มีใครค้างค่าประเมิน" : `คิวถึงวันนี้ ไม่มีในกลุ่ม "${TILE[tab].th}"`}
              {filtering ? " (ตามตัวกรองที่เลือก)" : ""}
            </p>
          )}

          {/* คิวล่วงหน้า / ยังไม่ลงวัน — ยังไม่ต้องทวง ไว้ท้ายสุด */}
          {loaded && !err && laterRows[tab].length > 0 && (
            <section className="mt-5 pt-3 border-t border-dashed border-gray-300">
              <h3 className="text-xs font-bold text-ink-3 mb-1.5 flex items-center gap-2 flex-wrap">
                คิวล่วงหน้า (ยังไม่ถึงวัน) — ยังไม่ต้องทวง
                <span className="font-medium">{laterRows[tab].length} คิว · {baht(feeSum(laterRows[tab]))}</span>
              </h3>
              <div className="rounded-xl border border-gray-200/80 bg-gray-50 divide-y divide-gray-100">
                {laterRows[tab].map((e) => <Row key={e.id} e={e} bucket={feeBucket(e) ?? "TODO"} today={today} canWrite={canWrite} busy={busyId === e.id || refreshing} onSave={save} onOpenEntry={onOpenEntry} />)}
              </div>
            </section>
          )}
        </div>

        {/* แถบเลิกทำ — กดผิดย้อนได้ทันที */}
        {undo && (
          <div className="px-4 sm:px-6 py-2 border-t border-gray-200/70 bg-emerald-50/80 text-sm flex items-center justify-between gap-3 rounded-b-2xl">
            <span className="text-emerald-800 min-w-0 truncate">บันทึกแล้ว: <b>{undo.name}</b> → {undo.did}</span>
            <button onClick={undoLast} disabled={busyId !== null || refreshing} className="press shrink-0 font-semibold text-emerald-800 underline disabled:opacity-50">เลิกทำ</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ e, bucket, today, canWrite, busy, onSave, onOpenEntry }: {
  e: QueueEntry; bucket: FeeBucket; today: string; canWrite: boolean; busy: boolean;
  onSave: (e: QueueEntry, next: Patch, did: string) => void; onOpenEntry?: (e: QueueEntry) => void;
}) {
  const note = feeDayNote(e.queue_date, today);
  const btn = "press rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50";
  const paidBtns = (
    <>
      <button disabled={busy} onClick={() => onSave(e, { payment: "โอน", fee_paid: true }, "โอนแล้ว")}
        className={`${btn} border-emerald-500 bg-emerald-600 text-white`}>โอนแล้ว</button>
      <button disabled={busy} onClick={() => onSave(e, { payment: "จ่ายสด", fee_paid: true }, "จ่ายสดแล้ว")}
        className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-800`}>จ่ายสดแล้ว</button>
    </>
  );
  // ซ่อน / ยกเลิก — ปุ่มรอง (ไม่เด่น) ของคิวที่ยังไม่จ่าย · เขียนลงช่องชำระของคิว เอากลับมาได้จากแท็บ ซ่อนไว้ / ยกเลิก
  const hideBtn = (
    <button disabled={busy} onClick={() => onSave(e, { payment: FEE_HIDDEN, fee_paid: false }, "ซ่อนไว้ (ไม่นับเป็นยอดค้าง)")}
      title="ลูกค้าไม่จ่ายนานมาก น่าจะไม่จ่ายแล้ว — ย้ายไปแท็บ ซ่อนไว้"
      className={`${btn} border-gray-300 bg-white text-ink-3`}>ซ่อน</button>
  );
  const voidBtn = (
    <button disabled={busy} onClick={() => onSave(e, { payment: FEE_VOID, fee_paid: false }, "ยกเลิก ไม่เก็บค่าประเมิน")}
      title="ไม่เก็บค่าประเมินแล้ว (เช่น เข้าหน้างานแล้วไม่ทำต่อ) — ย้ายไปแท็บ ยกเลิก"
      className={`${btn} border-red-200 bg-white text-red-700`}>ยกเลิก</button>
  );
  const restoreBtn = (
    <button disabled={busy} onClick={() => onSave(e, { payment: null, fee_paid: false }, "เอากลับมาเป็นยังไม่จ่าย")}
      className={`${btn} border-gray-300 bg-white text-ink-2`}>เอากลับมาทวง</button>
  );
  return (
    <div className={`flex items-center gap-x-3 gap-y-2 flex-wrap px-3 py-2.5 ${busy ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="flex items-center gap-2 flex-wrap">
          {onOpenEntry ? (
            <button onClick={() => onOpenEntry(e)} title="เปิดฟอร์มคิวนี้" className="text-sm font-bold text-ink hover:text-brand hover:underline text-left break-words">{e.customer_name}</button>
          ) : <span className="text-sm font-bold text-ink break-words">{e.customer_name}</span>}
          {e.sales?.name && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">{e.sales.name}</span>}
          {bucket !== "PAID" && bucket !== "VOID" && (
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${note.late && bucket !== "HIDDEN" ? "bg-red-100 text-red-700" : "bg-gray-100 text-ink-3"}`}>{note.text}</span>
          )}
        </div>
        <div className="text-xs text-ink-3 mt-0.5 tabular-nums">
          {dateLine(e)} · <b className="text-ink-2">{baht(Number(e.assess_fee ?? 0))}</b>
          {e.tel ? ` · ${e.tel}` : ""}
          {bucket === "PAID" && e.payment ? ` · ${e.payment}` : ""}
          {bucket === "UNCONFIRMED" && <span className="text-amber-700 font-semibold"> · ช่องชำระ: {e.payment}</span>}
        </div>
      </div>
      {canWrite && (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {bucket === "TODO" && (
            <>
              <button disabled={busy} onClick={() => onSave(e, { payment: FEE_WAITING, fee_paid: false }, "ส่งเลขแล้ว รอโอน")}
                className={`${btn} border-amber-300 bg-amber-50 text-amber-800`}>ส่งเลขแล้ว</button>
              {paidBtns}
              {hideBtn}{voidBtn}
            </>
          )}
          {bucket === "WAITING" && (
            <>
              {paidBtns}
              <button disabled={busy} onClick={() => onSave(e, { payment: null, fee_paid: false }, "กลับเป็นยังไม่ดำเนินการ")}
                className={`${btn} border-gray-200 bg-white text-ink-3`}>ยังไม่ได้ส่ง</button>
              {hideBtn}{voidBtn}
            </>
          )}
          {bucket === "UNCONFIRMED" && (
            <>
              <button disabled={busy} onClick={() => onSave(e, { fee_paid: true }, "จ่ายแล้ว")}
                className={`${btn} border-emerald-500 bg-emerald-600 text-white`}>จ่ายแล้ว</button>
              <button disabled={busy} onClick={() => onSave(e, { payment: FEE_WAITING, fee_paid: false }, "ส่งเลขแล้ว รอโอน")}
                className={`${btn} border-amber-300 bg-amber-50 text-amber-800`}>ยังรอโอน</button>
              {hideBtn}{voidBtn}
            </>
          )}
          {bucket === "HIDDEN" && <>{paidBtns}{restoreBtn}{voidBtn}</>}
          {bucket === "VOID" && restoreBtn}
          {bucket === "PAID" && (
            <button disabled={busy} onClick={() => onSave(e, e.payment === "โอน" || e.payment === "จ่ายสด" ? { payment: null, fee_paid: false } : { fee_paid: false }, "แก้เป็นยังไม่จ่าย")}
              className={`${btn} border-gray-200 bg-white text-ink-3`}>แก้เป็นยังไม่จ่าย</button>
          )}
        </div>
      )}
    </div>
  );
}
