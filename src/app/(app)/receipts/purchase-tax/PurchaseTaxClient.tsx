"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { THAI_MONTH, monthRange, round2, thaiDate } from "@/lib/sales-tax-report";
import { OUR_TAX_ID, PAY_KINDS, VAT_RATE, taxId13, taxIdValid, type PayKind, type PurchaseReport, type PurchaseRow, type PurchaseView, type Supplier } from "@/lib/purchase-tax";
import { filePages } from "@/lib/bill-pages";

/**
 * รายงานภาษีซื้อรายเดือน — หน้าจอ
 *   สแกนบิลทั้งตั้ง (PDF/รูป) → AI อ่านทีละหน้า → เข้ารายการเป็น "ยังไม่ได้ตรวจ" → คนเทียบกับกระดาษแล้วติ๊ก → ออก Excel
 *   ⚠ ไม่มีปุ่มติ๊ก "ตรวจแล้ว" ทั้งก้อน — ต้องดูทีละใบ ตัวเลขนี้เอาไปยื่นภาษี
 *   ⚠ บิลที่มีปัญหาร้ายแรง (blockers) ติ๊กไม่ได้ ต้องแก้ให้ถูกหรือกด "ไม่ใช้ภาษีซื้อ"
 */

type Data = PurchaseReport & { suppliers: Supplier[] };
type Draft = { id?: string; code: string; date: string; name: string; tax_id: string; branch: string; base: string; vat: string; pay: PayKind; note: string; checked: boolean; vatTouched: boolean; buyerIssue: boolean; buyerOk: boolean };
type Scan = { total: number; done: number; bills: number; failed: number; running: boolean; stopped?: string };

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    return d?.formErrors?.[0] ?? Object.values(d?.fieldErrors ?? {})[0]?.[0] ?? e.message;
  }
  return e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
}
const shiftMonth = (month: string, by: number) => {
  const { y, m0 } = monthRange(month);
  const d = new Date(Date.UTC(y, m0 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
/** ตัวเลขจากช่องกรอก — พิมพ์อย่างอื่นที่ไม่ใช่ตัวเลข = NaN (ห้ามกลายเป็น 0 เงียบ ๆ) */
const toNum = (s: string) => { const t = String(s).replace(/,/g, "").trim(); return t === "" ? NaN : Number(t); };

export default function PurchaseTaxClient({ initialMonth }: { initialMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; lines: string[] } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [filter, setFilter] = useState<"all" | "unchecked" | "warned">("all");
  const [zoom, setZoom] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const oldRowsRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  // ⚠ ล็อก/เดือนล่าสุดเป็น ref — state ใน closure ช้าไป 1 เฟรม (คลิกซ้ำผ่านทั้งคู่ · โหลดเดือนเก่ามาทับ)
  const lock = useRef(false);
  const monthRef = useRef(initialMonth);
  const alive = useRef(true);
  /** คิวบันทึกการแก้ในตาราง (ติ๊ก/วิธีชำระ) — ทีละคำขอ กันบันทึกซ้อนกับตัวเอง */
  const quick = useRef<Promise<void>>(Promise.resolve());
  const quickPending = useRef(0);
  /** รูปตัวอย่างของหน้าที่สแกนในรอบนี้ (อยู่ในแรมของหน้าจอ ไม่ได้เก็บขึ้นระบบ) ref → objectURL · ref มีเวลาที่สแกนต่อท้ายจึงไม่ชนกันข้ามรอบ */
  const previews = useRef(new Map<string, string>());
  const [, bump] = useState(0);

  const load = useCallback(async (m: string) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const { data: d } = await api.get<Data>(`/purchase-tax?m=${m}`);
      if (id === reqId.current) setData(d);
    } catch (e) {
      if (id === reqId.current) { setErr(errText(e)); setData(null); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);
  useEffect(() => { load(month); }, [month, load]);
  const clearPreviews = () => { for (const u of previews.current.values()) URL.revokeObjectURL(u); previews.current.clear(); };
  // ออกจากหน้า (รวมกดลิงก์ในแอป) → หยุดลูปสแกนที่ยังวิ่งอยู่ + คืนแรมรูป
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearPreviews(); }; }, []);
  // กันปิดแท็บ/รีเฟรชระหว่าง AI กำลังอ่าน
  useEffect(() => {
    if (!scan?.running) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [scan?.running]);

  const go = (m: string) => {
    if (lock.current || quickPending.current > 0) return;
    monthRef.current = m;
    clearPreviews();
    setData(null); setErr(null); setNotice(null); setScan(null); setFilter("all"); setMonth(m);
    router.replace(`/receipts/purchase-tax?m=${m}`);
  };
  const { y, m0 } = monthRange(month);
  const monthLabel = `${THAI_MONTH[m0]} ${y + 543}`;

  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setErr(null);
    let failed: string | null = null;
    try { await quick.current; await fn(); } catch (e) { failed = errText(e); }
    try { await load(monthRef.current); } finally { lock.current = false; setBusy(false); }
    if (failed) setErr(failed);
  }

  /** แก้เร็วในตาราง: เห็นผลทันที บันทึกเงียบ ๆ ทีละคำขอ · พลาด = โหลดของจริงกลับมา + บอกเหตุผล */
  function quickPut(id: string, patch: Partial<PurchaseRow> & { buyer_ok?: true }) {
    if (lock.current) return;
    setErr(null);
    setData((d) => d && { ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } as PurchaseView : r)) });
    const m = monthRef.current;
    quickPending.current++;
    quick.current = quick.current.then(async () => {
      let failed: string | null = null;
      try { await api.put("/purchase-tax", { m, row: { id, ...patch } }); } catch (e) { failed = errText(e); }
      quickPending.current--;
      // คิวหมดแล้วค่อยโหลดของจริง (คำเตือน/ยอดรวมคิดที่ server) — ไม่โหลดทุกคลิก
      if (quickPending.current === 0 && alive.current && monthRef.current === m) { await load(m); if (failed) setErr(failed); }
      else if (failed) setErr(failed);
    });
  }

  // ── สแกน: แปลงเป็นหน้า → AI อ่านพร้อมกันทีละ 2 หน้า → บันทึกเข้าเดือนทีละชุด (คิวเดียว กันบันทึกซ้อนกับตัวเอง) ──
  async function onScanFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || lock.current) return;
    lock.current = true; setBusy(true); setErr(null); setNotice(null);
    const m = monthRef.current;
    // เวลาที่สแกนต่อท้ายชื่อหน้า: ชื่อไฟล์จากเครื่องสแกนมักซ้ำ (scan.pdf) — กันรูปตัวอย่าง/ที่มาชนกันข้ามรอบ
    const now = new Date();
    const tag = ` (สแกน ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")})`;
    const st: Scan = { total: files.length, done: 0, bills: 0, failed: 0, running: true };
    const show = () => { if (alive.current) setScan({ ...st }); };
    const counted = new Set<File>();
    let hardFails = 0; // ล้มติดกันด้วยเหตุที่ลองหน้าอื่นก็ไม่หาย (กุญแจ AI/สิทธิ์) → หยุด ไม่ยิงต่ออีกเป็นร้อยหน้า
    let saveChain: Promise<void> = Promise.resolve();
    const save = (rows: Omit<PurchaseRow, "id">[], miss: { ref: string; reason: string } | null) => {
      saveChain = saveChain.then(async () => {
        try {
          await api.post("/purchase-tax", { m, rows, misses: miss ? [miss] : [] });
          st.bills += rows.length; if (miss) st.failed++;
        } catch (er) {
          // บันทึกไม่ผ่าน = บิลหน้านี้ยังไม่เข้า → ลองจดเป็นหน้าที่ไม่ได้บิลไว้ให้คนกลับมาดู
          st.failed++;
          try { await api.post("/purchase-tax", { m, rows: [], misses: [{ ref: miss?.ref ?? rows[0]?.ref ?? "?", reason: `อ่านได้แต่บันทึกไม่สำเร็จ — ${errText(er)}`.slice(0, 290) }] }); } catch { /* จดไม่ได้ก็ยังนับ failed ไว้บนจอ */ }
        }
      });
      return saveChain;
    };
    const readOne = async (blob: Blob, ref: string) => {
      try {
        const fd = new FormData();
        fd.append("file", new File([blob], "page.jpg", { type: "image/jpeg" })); fd.append("ref", ref);
        const res = await fetch("/api/purchase-tax/read", { method: "POST", body: fd, cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.success) {
          if ([401, 403, 404, 503].includes(res.status)) hardFails++; else hardFails = 0;
          throw new Error(j?.error ?? (res.status === 504 ? "AI ใช้เวลานานเกินไป ลองสแกนหน้านี้ใหม่" : `อ่านไม่สำเร็จ (${res.status})`));
        }
        hardFails = 0;
        const rows = j.data.rows as Omit<PurchaseRow, "id">[];
        if (rows.length) {
          if (previews.current.size >= 150) { const k = previews.current.keys().next().value as string; URL.revokeObjectURL(previews.current.get(k)!); previews.current.delete(k); }
          previews.current.set(ref, URL.createObjectURL(blob));
          await save(rows, null);
        } else {
          await save([], { ref, reason: j.data.found === 0 ? "ไม่พบใบกำกับภาษีในหน้านี้" : "เป็นเอกสารที่ไม่ใช่ใบกำกับภาษี" });
        }
      } catch (er) {
        await save([], { ref, reason: errText(er).slice(0, 290) });
      } finally {
        st.done++; show();
      }
    };
    try {
      show();
      const pool = new Set<Promise<void>>();
      outer: for (const f of files) {
        for await (const p of filePages(f, (n) => { if (!counted.has(f)) { counted.add(f); st.total += n - 1; show(); } })) {
          if (!alive.current) break outer;
          if (hardFails >= 3) { st.stopped = "หยุดอ่านกลางทาง: AI ใช้ไม่ได้ติดกันหลายหน้า (ดูเหตุผลในรายการหน้าที่ไม่ได้บิล) — แก้แล้วสแกนใหม่ตั้งแต่หน้าที่ค้าง"; break outer; }
          const ref = p.ref + tag;
          if (p.error !== undefined) { await save([], { ref, reason: p.error }); st.done++; show(); continue; }
          const job = readOne(p.blob, ref).finally(() => pool.delete(job));
          pool.add(job);
          if (pool.size >= 2) await Promise.race(pool);
        }
      }
      await Promise.all(pool);
      await saveChain;
    } finally {
      st.running = false; show();
      if (alive.current) {
        bump((n) => n + 1);
        try { await load(monthRef.current); } finally { lock.current = false; setBusy(false); }
        if (st.bills > 0) setFilter("unchecked");
      } else {
        lock.current = false;
      }
    }
  }

  async function onOldFile(e: React.ChangeEvent<HTMLInputElement>, withRows: boolean) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await run(async () => {
      const fd = new FormData();
      fd.append("m", month); fd.append("file", f); fd.append("rows", withRows ? "1" : "0");
      const res = await fetch("/api/purchase-tax", { method: "POST", body: fd, cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error ?? "นำเข้าไฟล์ไม่สำเร็จ");
      const d = j.data as { suppliers_added: number; suppliers_total: number; rows_added: number; rows_dup: number; problems: string[] };
      setNotice({
        text: `สมุดร้าน: เพิ่ม ${d.suppliers_added} ร้าน (รวม ${d.suppliers_total} ร้าน)${withRows ? ` · บิลเข้าเดือนนี้ ${d.rows_added} ใบ${d.rows_dup ? ` · ซ้ำกับที่มีอยู่ ${d.rows_dup} ใบ (ข้าม)` : ""}` : ""}`,
        lines: d.problems,
      });
    });
  }

  async function download() {
    if (lock.current || !data) return;
    if (data.totals.unchecked > 0 && !window.confirm(`ยังมีบิลที่ไม่ได้ตรวจกับกระดาษจริง ${data.totals.unchecked} ใบ\nไฟล์ที่ได้จะเป็น "ฉบับร่าง" และมีหมายเหตุกำกับใบที่ยังไม่ได้ตรวจ — ดาวน์โหลดต่อ?`)) return;
    lock.current = true; setBusy(true); setErr(null);
    try {
      await quick.current;
      const res = await fetch(`/api/purchase-tax?m=${month}&format=xlsx`, { cache: "no-store" });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? "ดาวน์โหลดไม่สำเร็จ"); }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `รายงานภาษีซื้อ ${monthLabel}${data.totals.unchecked ? " (ร่าง)" : ""}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setErr(errText(e)); } finally { lock.current = false; setBusy(false); }
  }

  const removeRow = (r: PurchaseView) => {
    if (!window.confirm(`ลบบิล ${r.code || "(ไม่มีเลขที่)"} ของ ${r.name}?`)) return;
    run(async () => { await api.del(`/purchase-tax?m=${month}&id=${encodeURIComponent(r.id)}`); });
  };
  const untouchedAi = (data?.rows ?? []).filter((r) => r.src === "ai" && !r.checked && !r.edited).length;
  const removeUnchecked = () => {
    if (!untouchedAi || !window.confirm(`ลบบิลที่ AI อ่านและยังไม่มีใครแก้หรือตรวจ ${untouchedAi} ใบ ของเดือน ${monthLabel}?\n(ใช้ตอนสแกนผิดไฟล์แล้วอยากเริ่มใหม่ · ใบที่แก้ตัวเลขไปแล้วไม่ถูกลบ)`)) return;
    run(async () => { await api.del(`/purchase-tax?m=${month}&src=ai&unchecked=1`); });
  };
  const setNoClaim = (r: PurchaseView) => {
    const reason = window.prompt(`ไม่ใช้ภาษีซื้อของบิล ${r.code || "(ไม่มีเลขที่)"} · ${r.name}\nบิลนี้จะไม่ถูกนับในรายงาน (ยังเก็บไว้ในชีต “ไม่ใช้ภาษีซื้อ”)\n\nเหตุผล:`, r.blockers[0] ?? "");
    if (reason === null) return;
    if (!reason.trim()) { setErr("ต้องใส่เหตุผลที่ไม่ใช้ภาษีซื้อ"); return; }
    run(async () => { await api.put("/purchase-tax", { m: month, row: { id: r.id, no_claim: reason.trim().slice(0, 200) } }); });
  };
  const claimAgain = (r: PurchaseView) => run(async () => { await api.put("/purchase-tax", { m: month, row: { id: r.id, no_claim: "", checked: false } }); });
  const dropMiss = (id: string) => run(async () => { await api.del(`/purchase-tax?m=${month}&miss=${encodeURIComponent(id)}`); });

  const openNew = () => { setErr(null); setDraft({ code: "", date: "", name: "", tax_id: "", branch: "", base: "", vat: "", pay: "", note: "", checked: true, vatTouched: false, buyerIssue: false, buyerOk: false }); };
  const openEdit = (r: PurchaseView) => { setErr(null); setDraft({
    id: r.id, code: r.code, date: r.date, name: r.name, tax_id: r.tax_id, branch: r.branch === "-" || r.branch === "สนญ." ? "" : r.branch,
    base: String(r.base), vat: String(r.vat), pay: r.pay, note: r.note, checked: r.checked, vatTouched: true,
    buyerIssue: r.buyer_tax_id !== undefined && taxId13(r.buyer_tax_id) !== OUR_TAX_ID, buyerOk: false,
  }); };
  async function saveDraft() {
    if (!draft || lock.current) return;
    lock.current = true; setBusy(true); setErr(null);
    let saved = false;
    try {
      await quick.current;
      const base = toNum(draft.base), vat = toNum(draft.vat);
      if (!draft.name.trim()) throw new Error("กรอกชื่อร้าน");
      if (!draft.date) throw new Error("กรอกวันที่บนบิล");
      if (Number.isNaN(base)) throw new Error("ยอดก่อน VAT ต้องเป็นตัวเลข");
      if (Number.isNaN(vat)) throw new Error("VAT ต้องเป็นตัวเลข");
      const row = { code: draft.code.trim(), date: draft.date, name: draft.name.trim(), tax_id: draft.tax_id.trim(), branch: draft.branch.trim(),
        base, vat, pay: draft.pay, note: draft.note.trim(), checked: draft.checked };
      if (draft.id) await api.put("/purchase-tax", { m: month, row: { id: draft.id, ...row, ...(draft.buyerOk ? { buyer_ok: true } : {}) } });
      else await api.post("/purchase-tax", { m: month, rows: [{ ...row, src: "manual" }] });
      saved = true; setDraft(null);
    } catch (e) { setErr(errText(e)); }
    try { if (saved) await load(monthRef.current); } finally { lock.current = false; setBusy(false); }
  }

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return filter === "unchecked" ? all.filter((r) => !r.checked) : filter === "warned" ? all.filter((r) => r.warnings.length > 0) : all;
  }, [data, filter]);

  const btn = "press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold border border-brand/30 bg-white/70 text-brand-dark disabled:opacity-50";
  const mini = "press rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-ink-2 disabled:opacity-50";
  const tab = (k: typeof filter, label: string) => (
    <button type="button" onClick={() => setFilter(k)} className={`press rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === k ? "bg-brand text-white" : "bg-white border border-gray-300 text-ink-2"}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href="/receipts" className="press inline-flex items-center gap-1.5 text-sm text-ink-2"><Icon name="arrowLeft" size={16} /> กลับรายการใบเสร็จ</Link>
          <h1 className="text-xl font-bold text-brand-dark mt-1">รายงานภาษีซื้อ</h1>
          <div className="text-xs text-ink-3">เดือนที่เลือก = เดือนที่เอาภาษีซื้อไปใช้ (บิลเดือนก่อนที่เพิ่งได้รับ ลงเดือนนี้ได้ภายใน 6 เดือน)</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={mini + " !text-sm !px-2.5 !py-1.5"} disabled={busy} onClick={() => go(shiftMonth(month, -1))}>‹ เดือนก่อน</button>
          <span className="font-semibold text-brand-dark text-sm min-w-[130px] text-center">{monthLabel}</span>
          <button type="button" className={mini + " !text-sm !px-2.5 !py-1.5"} disabled={busy} onClick={() => go(shiftMonth(month, 1))}>เดือนถัดไป ›</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-50" disabled={busy || !data} onClick={() => scanRef.current?.click()}>
          <Icon name="camera" size={16} /> ใส่ไฟล์สแกนบิล ให้ AI อ่าน
        </button>
        <input ref={scanRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onScanFiles} />
        <button type="button" className={btn} disabled={busy || !data} onClick={openNew}><Icon name="pencil" size={16} /> เพิ่มบิลเอง</button>
        <button type="button" className={btn} disabled={busy || !data} onClick={download}><Icon name="file" size={16} /> ดาวน์โหลด Excel</button>
        <button type="button" className={mini} disabled={busy} onClick={() => dirRef.current?.click()}>นำเข้าสมุดร้านจากไฟล์รายงานเดิม</button>
        <input ref={dirRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => onOldFile(e, false)} />
        <button type="button" className={mini} disabled={busy} onClick={() => oldRowsRef.current?.click()}>นำบิลจากไฟล์รายงานเดิมเข้าเดือนนี้</button>
        <input ref={oldRowsRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => onOldFile(e, true)} />
        {untouchedAi > 0 && <button type="button" className={mini} disabled={busy} onClick={removeUnchecked}>ลบบิลที่ AI อ่านและยังไม่มีใครแตะ ({untouchedAi})</button>}
        {data && <span className="text-xs text-ink-3">สมุดร้าน {data.suppliers.length} ร้าน</span>}
      </div>

      {err && !draft && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">{notice.text}</div>
          {notice.lines.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">{notice.lines.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        </div>
      )}
      {scan && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${scan.running ? "border-sky-200 bg-sky-50 text-sky-900" : scan.stopped ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          <div className="font-semibold">
            {scan.running ? `AI กำลังอ่าน… ${scan.done}/${scan.total} หน้า` : `อ่านแล้ว ${scan.done} จาก ${scan.total} หน้า`} · ได้บิล {scan.bills} ใบ{scan.failed ? ` · ไม่ได้บิล ${scan.failed} หน้า` : ""}
          </div>
          {scan.running && <div className="mt-1.5 h-1.5 rounded bg-sky-200 overflow-hidden"><div className="h-full bg-sky-600 transition-all" style={{ width: `${scan.total ? (scan.done / scan.total) * 100 : 0}%` }} /></div>}
          {scan.running && <div className="text-xs mt-1">อย่าปิดหรือออกจากหน้านี้จนกว่าจะอ่านครบ (ออกกลางทาง หน้าที่เหลือจะไม่ถูกอ่าน)</div>}
          {scan.stopped && <div className="text-xs mt-1 font-semibold">{scan.stopped}</div>}
          {!scan.running && <div className="text-xs mt-1">นับเทียบกับตั้งกระดาษ: สแกน {scan.total} หน้า ได้บิล {scan.bills} ใบ{scan.failed ? ` · หน้าที่ไม่ได้บิลอยู่ในรายการด้านล่าง หยิบกระดาษหน้านั้นมาดู` : ""} · บิลที่อ่านได้อยู่ในสถานะ “ยังไม่ได้ตรวจ” เทียบกับกระดาษทีละใบแล้วติ๊ก</div>}
        </div>
      )}
      {data && data.misses.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-amber-900">หน้าสแกนที่ไม่ได้บิล {data.misses.length} หน้า — หยิบกระดาษมาดู ถ้าเป็นบิลจริงให้สแกนใหม่หรือกด “เพิ่มบิลเอง”</div>
            <button type="button" className={mini} disabled={busy} onClick={() => { if (window.confirm("ล้างรายการหน้าที่ไม่ได้บิลทั้งหมด? (ทำเมื่อดูครบทุกหน้าแล้ว)")) dropMiss("all"); }}>ล้างทั้งหมด</button>
          </div>
          <ul className="mt-1.5 text-xs space-y-1 text-amber-900">
            {data.misses.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-2 border-t border-amber-200 pt-1">
                <span><b>{x.ref}</b> — {x.reason}</span>
                <button type="button" className={mini} disabled={busy} onClick={() => dropMiss(x.id)}>ดูแล้ว</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["บิลที่ใช้ภาษีซื้อ", `${data.totals.count} ใบ`],
            ["ยอดซื้อก่อน VAT", `${baht(data.totals.base)} บาท`],
            ["ภาษีซื้อ (VAT)", `${baht(data.totals.vat)} บาท`],
            ["รวม", `${baht(data.totals.total)} บาท`],
            ["ยังไม่ได้ตรวจ / มีคำเตือน", `${data.totals.unchecked} / ${data.totals.warned} ใบ`],
          ].map(([k, v]) => (
            <Card key={k} className="p-4"><div className="text-xs text-ink-3">{k}</div><div className="text-lg font-bold text-brand-dark tabular-nums mt-0.5">{v}</div></Card>
          ))}
        </div>
      )}
      {data && data.byPay.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2 px-1">
          {data.byPay.map((p) => <span key={p.label}><span className="text-ink-3">{p.label}</span> <b className="tabular-nums">{baht(p.total)}</b> ({p.count})</span>)}
        </div>
      )}

      <Card className="p-4">
        {data && data.rows.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            {tab("all", `ทั้งหมด ${data.totals.count}`)}{tab("unchecked", `ยังไม่ได้ตรวจ ${data.totals.unchecked}`)}{tab("warned", `มีคำเตือน ${data.totals.warned}`)}
          </div>
        )}
        {!data ? (
          <div className="py-12 text-center text-ink-3 text-sm">
            {loading ? "กำลังโหลด…" : <>โหลดรายงานไม่สำเร็จ <button type="button" className={mini} onClick={() => { setErr(null); load(month); }}>ลองใหม่</button></>}
          </div>
        ) : data.rows.length === 0 ? (
          <div className="py-12 text-center text-ink-3 text-sm">— ยังไม่มีบิลซื้อในเดือนนี้ · กด “ใส่ไฟล์สแกนบิล” เพื่อเริ่ม —</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-ink-3 text-sm">— ไม่มีรายการในตัวกรองนี้ —</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 text-xs">
                  <th className="py-2 font-semibold w-12 text-center">ตรวจแล้ว</th>
                  <th className="font-semibold">เลขที่</th>
                  <th className="font-semibold">วันที่</th>
                  <th className="font-semibold">ร้าน</th>
                  <th className="font-semibold">เลขผู้เสียภาษี</th>
                  <th className="font-semibold">สาขา</th>
                  <th className="font-semibold text-right">ยอดซื้อ</th>
                  <th className="font-semibold text-right">VAT</th>
                  <th className="font-semibold text-right">รวม</th>
                  <th className="font-semibold pl-3">วิธีชำระ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pv = r.ref ? previews.current.get(r.ref) : undefined;
                  const fixedPay = r.pay_label !== r.pay && r.pay_label !== "";
                  const blocked = r.blockers.length > 0;
                  return (
                    <tr key={r.id} className={`border-t border-gray-200/70 align-top ${r.checked ? "" : "bg-amber-50/60"}`}>
                      <td className="py-2 text-center">
                        <input type="checkbox" className="h-4 w-4" checked={r.checked} disabled={busy || (blocked && !r.checked)}
                          title={blocked && !r.checked ? `ติ๊กไม่ได้: ${r.blockers[0]} — แก้ข้อมูลให้ถูก หรือกด “ไม่ใช้ภาษีซื้อ”` : "เทียบกับบิลจริงแล้ว"}
                          onChange={(e) => quickPut(r.id, { checked: e.target.checked })} aria-label="ตรวจกับบิลจริงแล้ว" />
                      </td>
                      <td className="py-2 font-mono text-xs">{r.code || <span className="text-ink-3">—</span>}
                        {r.src === "ai" && <span className="ml-1.5 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-semibold text-sky-800 font-sans">AI</span>}
                      </td>
                      <td className="py-2 whitespace-nowrap">{r.date ? thaiDate(r.date) : <span className="text-red-700">ไม่มี</span>}</td>
                      <td className="py-2">
                        {r.name}
                        {r.warnings.length > 0 && (
                          <ul className="mt-0.5 text-[11px] leading-snug list-disc pl-4">
                            {r.warnings.map((w, i) => <li key={i} className={r.blockers.includes(w) ? "text-red-700 font-semibold" : "text-amber-800"}>{w}</li>)}
                          </ul>
                        )}
                        {r.ref && <div className="text-[11px] text-ink-3 mt-0.5">{r.ref}{pv && <> · <button type="button" className="underline text-brand-dark" onClick={() => setZoom(pv)}>ดูรูป</button></>}</div>}
                      </td>
                      <td className="py-2 font-mono text-xs">{r.tax_id || "0"}</td>
                      <td className="py-2 text-xs">{r.branch}</td>
                      <td className="py-2 text-right tabular-nums">{baht(r.base)}</td>
                      <td className="py-2 text-right tabular-nums">{baht(r.vat)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{baht(r.total)}</td>
                      <td className="py-2 pl-3 text-xs whitespace-nowrap">
                        {fixedPay ? r.pay_label : (
                          <select className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs" value={r.pay} disabled={busy} onChange={(e) => quickPut(r.id, { pay: e.target.value as PayKind })}>
                            <option value="">— เลือก —</option>
                            {PAY_KINDS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap pl-2">
                        <button type="button" className={mini} disabled={busy} onClick={() => openEdit(r)}>แก้</button>{" "}
                        <button type="button" className={mini + (blocked ? " !border-red-300 !text-red-700" : "")} disabled={busy} onClick={() => setNoClaim(r)}>ไม่ใช้ภาษีซื้อ</button>{" "}
                        <button type="button" className={mini} disabled={busy} onClick={() => removeRow(r)}>ลบ</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filter === "all" && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 font-bold">
                    <td colSpan={6} className="py-2.5 text-right pr-3">รวมทั้งสิ้น ({data.totals.count} ใบ)</td>
                    <td className="text-right tabular-nums">{baht(data.totals.base)}</td>
                    <td className="text-right tabular-nums">{baht(data.totals.vat)}</td>
                    <td className="text-right tabular-nums text-brand-dark">{baht(data.totals.total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      {data && data.noClaim.length > 0 && (
        <Card className="p-4">
          <div className="font-semibold text-sm text-ink-2">ไม่ใช้ภาษีซื้อ · {data.noClaim.length} ใบ (ไม่นับในยอดข้างบน)</div>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <tbody>
                {data.noClaim.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200/70 text-ink-2">
                    <td className="py-1.5 font-mono">{r.code || "—"}</td>
                    <td>{r.date ? thaiDate(r.date) : ""}</td>
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums">{baht(r.total)}</td>
                    <td className="pl-3">{r.no_claim}</td>
                    <td className="text-right whitespace-nowrap">
                      <button type="button" className={mini} disabled={busy} onClick={() => claimAgain(r)}>กลับมาใช้ภาษีซื้อ</button>{" "}
                      <button type="button" className={mini} disabled={busy} onClick={() => removeRow(r)}>ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {draft && data && <DraftModal draft={draft} setDraft={setDraft} suppliers={data.suppliers} busy={busy} err={err} onSave={saveDraft} />}
      {zoom && <Modal title="รูปหน้าที่สแกน" wide onClose={() => setZoom(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={zoom} alt="หน้าที่สแกน" className="w-full h-auto rounded-lg border" />
      </Modal>}
    </div>
  );
}

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);
  if (!mounted) return null;
  // ⚠ ต้อง portal ไป body — การ์ดในหน้าใช้ backdrop-filter ทำให้ fixed ข้างในเพี้ยน
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:p-10" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full ${wide ? "max-w-4xl" : "max-w-xl"} rounded-2xl bg-white p-5 shadow-xl`}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-brand-dark">{title}</div>
          <button type="button" onClick={onClose} className="press text-ink-3" aria-label="ปิด"><Icon name="close" size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DraftModal({ draft, setDraft, suppliers, busy, err, onSave }: {
  draft: Draft; setDraft: (d: Draft | null) => void; suppliers: Supplier[]; busy: boolean; err: string | null; onSave: () => void;
}) {
  const inp = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const onBase = (v: string) => {
    const b = toNum(v);
    set({ base: v, ...(draft.vatTouched || Number.isNaN(b) ? {} : { vat: b !== 0 ? String(round2(b * VAT_RATE)) : "" }) });
  };
  // พิมพ์ชื่อตรงกับร้านในสมุด → เติมเลขผู้เสียภาษี/สาขา/วิธีชำระให้ (แก้ทับได้)
  const onName = (v: string) => {
    const s = suppliers.find((x) => x.name === v);
    set(s ? { name: v, tax_id: s.tax_id, branch: s.branch === "สนญ." || s.branch === "-" ? "" : s.branch, pay: draft.pay || s.pay } : { name: v });
  };
  const id = taxId13(draft.tax_id);
  const b = toNum(draft.base), v = toNum(draft.vat);
  const total = round2((Number.isNaN(b) ? 0 : b) + (Number.isNaN(v) ? 0 : v));
  return (
    <Modal title={draft.id ? "แก้บิลซื้อ" : "เพิ่มบิลซื้อ"} onClose={() => setDraft(null)}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-2">ชื่อร้าน (พิมพ์แล้วเลือกจากสมุดร้านได้)
          <input className={inp} list="purchase-suppliers" value={draft.name} onChange={(e) => onName(e.target.value)} />
          <datalist id="purchase-suppliers">{suppliers.map((s) => <option key={s.tax_id + s.branch} value={s.name} />)}</datalist>
        </label>
        <label>เลขผู้เสียภาษีของร้าน
          <input className={inp} inputMode="numeric" value={draft.tax_id} onChange={(e) => set({ tax_id: e.target.value })} />
          {id && !taxIdValid(id) && <span className="text-xs text-red-700">เลขไม่ผ่านตัวตรวจ 13 หลัก เช็คอีกครั้ง</span>}
        </label>
        <label>สาขา (สำนักงานใหญ่เว้นว่าง)<input className={inp} value={draft.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="เช่น 00004" /></label>
        <label>เลขที่ใบกำกับ<input className={inp} value={draft.code} onChange={(e) => set({ code: e.target.value })} /></label>
        <label>วันที่บนบิล<input type="date" className={inp} value={draft.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label>ยอดก่อน VAT (บาท · ใบลดหนี้ใส่ติดลบ)<input className={inp} inputMode="decimal" value={draft.base} onChange={(e) => onBase(e.target.value)} /></label>
        <label>VAT (บาท)<input className={inp} inputMode="decimal" value={draft.vat} onChange={(e) => set({ vat: e.target.value, vatTouched: true })} /></label>
        <div className="text-ink-2 self-end pb-2">รวม <span className="font-bold tabular-nums">{baht(total)}</span> บาท</div>
        <label>วิธีชำระ
          <select className={inp} value={draft.pay} onChange={(e) => set({ pay: e.target.value as PayKind })}>
            <option value="">— เลือก —</option>
            {PAY_KINDS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="col-span-2">หมายเหตุ<input className={inp} value={draft.note} onChange={(e) => set({ note: e.target.value })} /></label>
        {draft.buyerIssue && (
          <label className="col-span-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <input type="checkbox" className="mt-0.5" checked={draft.buyerOk} onChange={(e) => set({ buyerOk: e.target.checked })} />
            <span>AI อ่านว่าบิลนี้ไม่ได้ออกในนามบริษัทเรา (หรือไม่เห็นเลขผู้ซื้อ) — ติ๊กช่องนี้ถ้าดูกระดาษแล้วบิลออกในนามบริษัทและเลขผู้เสียภาษีของเราถูกต้อง</span>
          </label>
        )}
        <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={draft.checked} onChange={(e) => set({ checked: e.target.checked })} /> ตรวจกับบิลจริงแล้ว</label>
      </div>
      {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">{err}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="press rounded-xl border px-4 py-2 text-sm" onClick={() => setDraft(null)}>ยกเลิก</button>
        <button type="button" className="press rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={onSave}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
    </Modal>
  );
}
