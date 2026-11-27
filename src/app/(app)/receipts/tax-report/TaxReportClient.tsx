"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import { PAIR_EQUAL, THAI_MONTH, monthRange, pairProblem, round2, thaiDate, type TaxReport, type TaxRow } from "@/lib/sales-tax-report";

/**
 * รายงานภาษีขายรายเดือน — หน้าจอ
 *   ใบในระบบมาเอง · ใบ FlowAccount นำเข้าไฟล์หรือกรอกเอง · ใบที่เป็นเงินก้อนเดียวกัน (มี 2 เลข) ให้เลือกนับใบเดียว
 *   ⚠ "ไม่นับ" ต้องชี้คู่ที่ซ้ำเสมอ — ไม่มีปุ่มเอาใบออกจากรายงานเฉย ๆ (ดูหัวไฟล์ sales-tax-report.ts)
 */

const SRC_LABEL = { system: "ระบบเรา", extra: "FlowAccount" } as const;

function errText(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    const first = d?.formErrors?.[0] ?? Object.values(d?.fieldErrors ?? {})[0]?.[0];
    return first ?? e.message;
  }
  return e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
}

const shiftMonth = (month: string, by: number) => {
  const { y, m0 } = monthRange(month);
  const d = new Date(Date.UTC(y, m0 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

type Draft = { id?: string; code: string; date: string; name: string; tax_id: string; branch: string; base: string; vat: string; note: string; voided: boolean; vatTouched: boolean };

export default function TaxReportClient({ initialMonth, canEdit }: { initialMonth: string; canEdit: boolean }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [rep, setRep] = useState<TaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; bad: boolean; problems: string[]; warnings: string[] } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pairFor, setPairFor] = useState<TaxRow | null>(null);
  const [showNoVat, setShowNoVat] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  // ⚠ ล็อก/เดือนล่าสุดต้องเป็น ref — state ใน closure ช้าไป 1 เฟรม (คลิก 2 ทีติดกันผ่านทั้งคู่ · เปลี่ยนเดือนระหว่างบันทึกแล้วโหลดเดือนเก่ามาทับ)
  const lock = useRef(false);
  const monthRef = useRef(initialMonth);

  const load = useCallback(async (m: string) => {
    const id = ++reqId.current;
    setLoading(true); setErr(null);
    try {
      const { data } = await api.get<TaxReport>(`/receipts/tax-report?m=${m}`);
      if (id === reqId.current) setRep(data);
    } catch (e) {
      if (id === reqId.current) { setErr(errText(e)); setRep(null); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);
  useEffect(() => { load(month); }, [month, load]);

  const go = (m: string) => {
    if (lock.current) return;
    monthRef.current = m;
    setRep(null); setErr(null); setNotice(null); setMonth(m);
    router.replace(`/receipts/tax-report?m=${m}`);
  };

  const { y, m0 } = monthRange(month);
  const monthLabel = `${THAI_MONTH[m0]} ${y + 543}`;
  const byKey = useMemo(() => new Map((rep ? [...rep.rows, ...rep.skipped, ...rep.noVat] : []).map((r) => [r.key, r])), [rep]);
  const surePairs = rep?.pairs.filter((p) => p.sure) ?? [];

  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setErr(null);
    let failed: string | null = null;
    try { await fn(); } catch (e) { failed = errText(e); }
    // โหลดใหม่เสมอ (แม้พลาด — เช่นมีคนบันทึกซ้อน ต้องเห็นของล่าสุด) · ใช้เดือนล่าสุดจาก ref
    try { await load(monthRef.current); } finally { lock.current = false; setBusy(false); }
    if (failed) setErr(failed); // ตั้งหลังโหลด — load ล้าง err ตอนเริ่ม
  }

  const setPairs = (pairs: { skip: string; twin: string }[]) => run(async () => { await api.patch("/receipts/tax-report", { m: month, pairs }); });
  const unskip = (key: string) => run(async () => { await api.patch("/receipts/tax-report", { m: month, unskip: [key] }); });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await run(async () => {
      const fd = new FormData();
      fd.append("m", month); fd.append("file", f);
      const res = await fetch("/api/receipts/tax-report", { method: "POST", body: fd, cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error ?? (res.status === 413 ? "ไฟล์ใหญ่เกินไป (เกิน 4 MB)" : "นำเข้าไฟล์ไม่สำเร็จ"));
      const d = j.data as { added: number; updated: number; problems: string[]; warnings: string[]; empty: boolean };
      setNotice({
        bad: d.empty,
        text: d.empty
          ? "ไม่มีใบไหนถูกนำเข้า — ดูเหตุผลรายแถวด้านล่าง (เช็คว่าเลือกเดือนถูก และเป็นไฟล์รายการใบกำกับภาษี)"
          : `นำเข้าแล้ว: เพิ่มใหม่ ${d.added} ใบ · อัปเดตใบเดิม ${d.updated} ใบ${d.problems.length ? ` · ไม่นำเข้า ${d.problems.length} แถว` : ""}${d.warnings.length ? ` · ควรเปิดใบจริงเทียบ ${d.warnings.length} แถว` : ""}`,
        problems: d.problems, warnings: d.warnings,
      });
    });
  }

  async function download() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/receipts/tax-report?m=${month}&format=xlsx`, { cache: "no-store" });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? "ดาวน์โหลดไม่สำเร็จ"); }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `รายงานภาษีขาย ${monthLabel}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setErr(errText(e)); } finally { lock.current = false; setBusy(false); }
  }

  const openNew = () => { setErr(null); setDraft({ code: "", date: `${month}-01`, name: "", tax_id: "", branch: "", base: "", vat: "", note: "", voided: false, vatTouched: false }); };
  const openEdit = (r: TaxRow) => { setErr(null); setDraft({
    id: r.key.slice(2), code: r.code, date: r.date, name: r.name, tax_id: r.tax_id, branch: r.branch === "-" ? "" : r.branch,
    base: r.voided ? "" : String(r.base), vat: r.voided ? "" : String(r.vat), note: r.voided ? "" : r.note, voided: r.voided, vatTouched: true,
  }); };

  async function saveDraft() {
    if (!draft) return;
    const base = Number(draft.base.replace(/,/g, "")) || 0;
    const vat = Number(draft.vat.replace(/,/g, "")) || 0;
    if (lock.current) return;
    lock.current = true; setBusy(true); setErr(null);
    let saved = false;
    try {
      await api.post("/receipts/tax-report", { m: month, row: {
        ...(draft.id ? { id: draft.id } : {}), code: draft.code.trim(), date: draft.date, name: draft.voided ? "ยกเลิก" : draft.name.trim(),
        tax_id: draft.tax_id.trim(), branch: draft.branch.trim(), base, vat, note: draft.note.trim(), voided: draft.voided,
      } });
      saved = true;
      setDraft(null);
    } catch (e) { setErr(errText(e)); } // พลาด = ฟอร์มยังเปิดอยู่ ข้อความขึ้นในฟอร์ม ของที่กรอกไม่หาย
    try { if (saved) await load(monthRef.current); } finally { lock.current = false; setBusy(false); }
  }

  const removeRow = (r: TaxRow) => {
    if (!window.confirm(`ลบใบ ${r.code} ออกจากรายการที่เพิ่มไว้?`)) return;
    run(async () => { await api.del(`/receipts/tax-report?m=${month}&id=${encodeURIComponent(r.key.slice(2))}`); });
  };
  const removeAll = () => {
    const n = rep ? [...rep.rows, ...rep.skipped].filter((r) => r.source === "extra").length : 0;
    if (!n || !window.confirm(`ลบใบ FlowAccount ที่เพิ่มไว้ของเดือน ${monthLabel} ทั้งหมด ${n} ใบ? (ใบในระบบไม่ถูกแตะ)`)) return;
    run(async () => { await api.del(`/receipts/tax-report?m=${month}&all=1`); setNotice(null); });
  };

  const extraCount = rep ? [...rep.rows, ...rep.skipped].filter((r) => r.source === "extra").length : 0;
  const btn = "press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold border border-brand/30 bg-white/70 text-brand-dark disabled:opacity-50";
  const mini = "press rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-ink-2 disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href="/receipts" className="press inline-flex items-center gap-1.5 text-sm text-ink-2"><Icon name="arrowLeft" size={16} /> กลับรายการใบเสร็จ</Link>
          <h1 className="text-xl font-bold text-brand-dark mt-1">รายงานภาษีขาย</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={mini + " !text-sm !px-2.5 !py-1.5"} disabled={busy} onClick={() => go(shiftMonth(month, -1))}>‹ เดือนก่อน</button>
          <span className="font-semibold text-brand-dark text-sm min-w-[130px] text-center">{monthLabel}</span>
          <button type="button" className={mini + " !text-sm !px-2.5 !py-1.5"} disabled={busy} onClick={() => go(shiftMonth(month, 1))}>เดือนถัดไป ›</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={busy || !rep} onClick={download} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-50">
          <Icon name="file" size={16} /> ดาวน์โหลด Excel
        </button>
        {canEdit && (
          <>
            <button type="button" className={btn} disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="plus" size={16} /> นำเข้าไฟล์ FlowAccount</button>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onFile} />
            <button type="button" className={btn} disabled={busy} onClick={openNew}><Icon name="pencil" size={16} /> เพิ่มใบเอง</button>
            {extraCount > 0 && <button type="button" className={mini} disabled={busy} onClick={removeAll}>ลบใบ FlowAccount ทั้งเดือน ({extraCount})</button>}
          </>
        )}
      </div>

      {err && !draft && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}
      {notice && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${notice.bad ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          <div className="font-semibold">{notice.text}</div>
          {notice.warnings.length > 0 && <>
            <div className="mt-2 text-xs font-bold text-amber-800">นำเข้าแล้ว แต่ตัวเลขน่าสงสัย ควรเปิดใบจริงเทียบ</div>
            <ul className="mt-0.5 list-disc pl-5 text-xs space-y-0.5 text-amber-900">{notice.warnings.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </>}
          {notice.problems.length > 0 && <>
            <div className="mt-2 text-xs font-bold">แถวที่ไม่ได้นำเข้า</div>
            <ul className="mt-0.5 list-disc pl-5 text-xs space-y-0.5">{notice.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </>}
        </div>
      )}
      {rep && rep.sameCode.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          มีใบที่เพิ่มเองแต่เลขที่ตรงกับใบในระบบ ({rep.sameCode.join(", ")}) — ยอดถูกนับ 2 ครั้ง ให้ลบใบที่เพิ่มเองออก
        </div>
      )}

      {rep && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["จำนวนใบที่ยื่น", `${rep.totals.count} ใบ`],
            ["ยอดขายก่อน VAT", `${baht(rep.totals.base)} บาท`],
            ["ภาษีขาย (VAT)", `${baht(rep.totals.vat)} บาท`],
            ["รวม", `${baht(rep.totals.total)} บาท`],
          ].map(([k, v]) => (
            <Card key={k} className="p-4"><div className="text-xs text-ink-3">{k}</div><div className="text-lg font-bold text-brand-dark tabular-nums mt-0.5">{v}</div></Card>
          ))}
        </div>
      )}

      {rep && rep.pairs.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <div className="font-bold text-amber-900">เจอ {rep.pairs.length} คู่ที่น่าจะเป็นเงินก้อนเดียวกัน (มีทั้งใบในระบบเราและใบ FlowAccount)</div>
          <div className="text-amber-900/80 text-xs mt-0.5">ถ้าไม่เลือก ยอดจะถูกนับ 2 ครั้ง · เลือกว่าจะยื่นด้วยเลขใบไหน อีกใบจะย้ายไปอยู่ในรายการ “ไม่นับ (ซ้ำ)”</div>
          {canEdit && surePairs.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2.5">
              <button type="button" className={mini + " !border-amber-400"} disabled={busy} onClick={() => setPairs(surePairs.map((p) => ({ skip: p.system, twin: p.extra })))}>
                ยื่นด้วยเลข FlowAccount ทั้ง {surePairs.length} คู่ที่ชื่อตรง
              </button>
              <button type="button" className={mini + " !border-amber-400"} disabled={busy} onClick={() => setPairs(surePairs.map((p) => ({ skip: p.extra, twin: p.system })))}>
                ยื่นด้วยเลขระบบเรา ทั้ง {surePairs.length} คู่ที่ชื่อตรง
              </button>
            </div>
          )}
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-amber-900/70"><th className="py-1 font-semibold">ใบในระบบเรา</th><th className="font-semibold">ใบ FlowAccount</th><th className="text-right font-semibold">รวม</th><th /></tr></thead>
              <tbody>
                {rep.pairs.map((p) => {
                  const s = byKey.get(p.system), x = byKey.get(p.extra);
                  if (!s || !x) return null;
                  return (
                    <tr key={p.system} className="border-t border-amber-200">
                      <td className="py-1.5 pr-2"><span className="font-mono">{s.code}</span> · {thaiDate(s.date)} · {s.name}</td>
                      <td className="pr-2"><span className="font-mono">{x.code}</span> · {thaiDate(x.date)} · {x.name}
                        {!p.sure && <span className="ml-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">ชื่อไม่ตรง ดูอีกที</span>}
                      </td>
                      <td className="text-right tabular-nums pr-2">{baht(x.total)}</td>
                      <td className="text-right whitespace-nowrap">
                        {canEdit && <>
                          <button type="button" className={mini} disabled={busy} onClick={() => setPairs([{ skip: p.system, twin: p.extra }])}>ยื่นเลข FlowAccount</button>{" "}
                          <button type="button" className={mini} disabled={busy} onClick={() => setPairs([{ skip: p.extra, twin: p.system }])}>ยื่นเลขระบบเรา</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Card className="p-4">
        {!rep ? (
          <div className="py-12 text-center text-ink-3 text-sm">
            {loading ? "กำลังโหลด…" : <>โหลดรายงานไม่สำเร็จ <button type="button" className={mini} onClick={() => load(month)}>ลองใหม่</button></>}
          </div>
        ) : rep.rows.length === 0 ? (
          <div className="py-12 text-center text-ink-3 text-sm">— ยังไม่มีใบกำกับภาษีในเดือนนี้ —</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 text-xs">
                  <th className="py-2 font-semibold w-10 text-center">ลำดับ</th>
                  <th className="font-semibold">เลขที่</th>
                  <th className="font-semibold">วันที่</th>
                  <th className="font-semibold">ชื่อลูกค้า</th>
                  <th className="font-semibold">เลขผู้เสียภาษี</th>
                  <th className="font-semibold">สาขา</th>
                  <th className="font-semibold text-right">ยอดขาย</th>
                  <th className="font-semibold text-right">VAT</th>
                  <th className="font-semibold text-right">รวม</th>
                  <th className="font-semibold pl-3">ที่มา</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rep.rows.map((r, i) => (
                  <tr key={r.key} className={`border-t border-gray-200/70 ${r.voided ? "text-ink-3" : ""}`}>
                    <td className="py-2 text-center text-ink-3">{i + 1}</td>
                    <td className="font-mono text-xs">
                      {r.receipt_id ? <Link href={`/receipts/${r.receipt_id}`} className="hover:underline text-brand-dark">{r.code}</Link> : r.code}
                    </td>
                    <td className="whitespace-nowrap">{thaiDate(r.date)}</td>
                    <td>{r.voided ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">ยกเลิก</span> : r.name}{r.voided && r.source === "system" ? <span className="ml-1.5 text-xs">{r.name}</span> : null}</td>
                    <td className="font-mono text-xs">{r.tax_id || "0"}</td>
                    <td className="text-xs">{r.branch}</td>
                    <td className="text-right tabular-nums">{baht(r.base)}</td>
                    <td className="text-right tabular-nums">{baht(r.vat)}</td>
                    <td className="text-right tabular-nums font-semibold">{baht(r.total)}</td>
                    <td className="pl-3"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${r.source === "system" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>{SRC_LABEL[r.source]}</span></td>
                    <td className="text-right whitespace-nowrap pl-2">
                      {canEdit && !r.voided && <button type="button" className={mini} disabled={busy} onClick={() => setPairFor(r)}>ซ้ำกับใบอื่น</button>}
                      {canEdit && r.source === "extra" && <>
                        {" "}<button type="button" className={mini} disabled={busy} onClick={() => openEdit(r)}>แก้</button>
                        {" "}<button type="button" className={mini} disabled={busy} onClick={() => removeRow(r)}>ลบ</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-bold">
                  <td colSpan={6} className="py-2.5 text-right pr-3">รวมทั้งหมด ({rep.totals.count} ใบ)</td>
                  <td className="text-right tabular-nums">{baht(rep.totals.base)}</td>
                  <td className="text-right tabular-nums">{baht(rep.totals.vat)}</td>
                  <td className="text-right tabular-nums text-brand-dark">{baht(rep.totals.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {rep && rep.gaps.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-xs text-ink-2">
          <span className="font-semibold">เลขใบในระบบที่ไม่มีในเดือนนี้ ({rep.gaps.length}):</span> {rep.gaps.slice(0, 40).join(", ")}{rep.gaps.length > 40 ? " …" : ""}
          <div className="text-ink-3 mt-0.5">เลขที่ข้ามไปอาจเป็นใบที่ลงวันที่เดือนอื่น หรือใบที่ออกไม่สำเร็จ — เช็คก่อนยื่นถ้าเลขนั้นเคยส่งให้ลูกค้า</div>
        </div>
      )}

      {rep && rep.skipped.length > 0 && (
        <Card className="p-4">
          <div className="font-semibold text-sm text-ink-2">ไม่นับ (ซ้ำกับอีกใบ) · {rep.skipped.length} ใบ</div>
          <div className="text-xs text-ink-3 mt-0.5">ใบพวกนี้เป็นเงินก้อนเดียวกับใบที่อยู่ในรายงานแล้ว จึงไม่รวมยอด</div>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <tbody>
                {rep.skipped.map((r) => (
                  <tr key={r.key} className="border-t border-gray-200/70 text-ink-2">
                    <td className="py-1.5 font-mono">{r.code}</td>
                    <td>{thaiDate(r.date)}</td>
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums">{baht(r.total)}</td>
                    <td className="pl-3">{SRC_LABEL[r.source]}</td>
                    <td className="pl-3">ซ้ำกับ <span className="font-mono">{r.twin}</span> ({baht(r.twinTotal)})
                      {Math.abs(r.twinTotal - r.total) > PAIR_EQUAL && <span className="ml-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">ยอดต่าง {baht(Math.abs(r.twinTotal - r.total))}</span>}
                    </td>
                    <td className="text-right">{canEdit && <button type="button" className={mini} disabled={busy} onClick={() => unskip(r.key)}>กลับมานับ</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {rep && rep.noVat.length > 0 && (
        <Card className="p-4">
          <button type="button" className="text-sm font-semibold text-ink-2" onClick={() => setShowNoVat((v) => !v)}>
            {showNoVat ? "▾" : "▸"} ใบเสร็จในระบบที่ไม่มี VAT · {rep.noVat.length} ใบ (ไม่เข้ารายงานภาษีขาย)
          </button>
          {showNoVat && (
            <table className="w-full text-xs mt-2">
              <tbody>
                {rep.noVat.map((r) => (
                  <tr key={r.key} className="border-t border-gray-200/70 text-ink-2">
                    <td className="py-1.5 font-mono">{r.receipt_id ? <Link href={`/receipts/${r.receipt_id}`} className="hover:underline">{r.code}</Link> : r.code}</td>
                    <td>{thaiDate(r.date)}</td>
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums">{baht(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {draft && <DraftModal draft={draft} setDraft={setDraft} month={month} busy={busy} err={err} onSave={saveDraft} />}
      {pairFor && rep && (
        <PairModal
          row={pairFor}
          candidates={rep.rows.filter((r) => r.source !== pairFor.source && !r.voided)}
          busy={busy}
          onClose={() => setPairFor(null)}
          onPick={(twin, keep) => {
            const other = keep === pairFor.key ? twin.key : pairFor.key;
            setPairFor(null);
            setPairs([{ skip: other, twin: keep }]);
          }}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
      <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
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

function DraftModal({ draft, setDraft, month, busy, err, onSave }: {
  draft: Draft; setDraft: (d: Draft | null) => void; month: string; busy: boolean; err: string | null; onSave: () => void;
}) {
  const { start, nextStart } = monthRange(month);
  const lastDay = new Date(Date.parse(nextStart + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  const inp = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const onBase = (v: string) => {
    const b = Number(v.replace(/,/g, ""));
    set({ base: v, ...(draft.vatTouched || !Number.isFinite(b) ? {} : { vat: b > 0 ? String(round2(b * 0.07)) : "" }) });
  };
  const total = round2((Number(draft.base.replace(/,/g, "")) || 0) + (Number(draft.vat.replace(/,/g, "")) || 0));
  return (
    <Modal title={draft.id ? "แก้ใบที่เพิ่มไว้" : "เพิ่มใบกำกับจาก FlowAccount"} onClose={() => setDraft(null)}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="col-span-1">เลขที่เอกสาร<input className={inp} value={draft.code} onChange={(e) => set({ code: e.target.value })} placeholder="INV2026110001" /></label>
        <label className="col-span-1">วันที่<input type="date" className={inp} min={start} max={lastDay} value={draft.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={draft.voided} onChange={(e) => set({ voided: e.target.checked })} /> ใบนี้ยกเลิกแล้ว (ใส่ไว้ให้เลขเรียงครบ ยอดเป็น 0)</label>
        {!draft.voided && <>
          <label className="col-span-2">ชื่อลูกค้า<input className={inp} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
          <label>เลขผู้เสียภาษี (ไม่มีเว้นว่าง)<input className={inp} inputMode="numeric" value={draft.tax_id} onChange={(e) => set({ tax_id: e.target.value })} /></label>
          <label>สาขา (สำนักงานใหญ่เว้นว่าง)<input className={inp} value={draft.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="เช่น 00004" /></label>
          <label>ยอดขายก่อน VAT (บาท · ใบลดหนี้ใส่ติดลบ)<input className={inp} inputMode="decimal" value={draft.base} onChange={(e) => onBase(e.target.value)} /></label>
          <label>VAT (บาท)<input className={inp} inputMode="decimal" value={draft.vat} onChange={(e) => set({ vat: e.target.value, vatTouched: true })} /></label>
          <div className="col-span-2 text-ink-2">รวม <span className="font-bold tabular-nums">{baht(total)}</span> บาท</div>
          <label className="col-span-2">หมายเหตุ<input className={inp} value={draft.note} onChange={(e) => set({ note: e.target.value })} /></label>
        </>}
      </div>
      {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">{err}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="press rounded-xl border px-4 py-2 text-sm" onClick={() => setDraft(null)}>ยกเลิก</button>
        <button type="button" className="press rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={onSave}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
    </Modal>
  );
}

function PairModal({ row, candidates, busy, onClose, onPick }: {
  row: TaxRow; candidates: TaxRow[]; busy: boolean; onClose: () => void; onPick: (twin: TaxRow, keepKey: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<TaxRow | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return candidates
      .filter((c) => !t || c.code.toLowerCase().includes(t) || c.name.toLowerCase().includes(t))
      .sort((a, b) => Math.abs(a.total - row.total) - Math.abs(b.total - row.total))
      .slice(0, 30);
  }, [candidates, q, row.total]);
  const other = row.source === "system" ? "FlowAccount" : "ระบบเรา";
  // นับใบ keep ไม่นับใบ drop — ใช้กติกาเดียวกับ server (ใบที่นับยอดต้องไม่น้อยกว่า)
  const pick = (keep: TaxRow, drop: TaxRow, twin: TaxRow) => {
    const diff = Math.abs(keep.total - drop.total);
    if (diff > PAIR_EQUAL && !window.confirm(`สองใบนี้ยอดไม่เท่ากัน (ต่าง ${baht(diff)} บาท)\nจะยื่นด้วยใบ ${keep.code} ยอด ${baht(keep.total)} บาท และไม่นับใบ ${drop.code} — แน่ใจว่าเป็นเงินก้อนเดียวกัน?`)) return;
    onPick(twin, keep.key);
  };
  return (
    <Modal title="ใบนี้ซ้ำกับใบอื่น" onClose={onClose}>
      <div className="text-sm">
        <div className="rounded-lg bg-gray-50 px-3 py-2"><span className="font-mono">{row.code}</span> · {thaiDate(row.date)} · {row.name} · <b className="tabular-nums">{baht(row.total)}</b> บาท ({SRC_LABEL[row.source]})</div>
        <div className="mt-3 text-ink-2">เลือกใบฝั่ง {other} ที่เป็นเงินก้อนเดียวกัน (เรียงจากยอดที่ใกล้ที่สุด)</div>
        <input className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="ค้นเลขที่หรือชื่อ" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-200">
          {list.length === 0 ? <div className="p-4 text-center text-ink-3 text-xs">ไม่มีใบฝั่ง {other} ในเดือนนี้</div> : list.map((c) => (
            <button key={c.key} type="button" onClick={() => setSel(c)} className={`block w-full text-left px-3 py-2 text-xs border-b border-gray-100 last:border-0 ${sel?.key === c.key ? "bg-brand/10" : "hover:bg-gray-50"}`}>
              <span className="font-mono">{c.code}</span> · {thaiDate(c.date)} · {c.name} · <b className="tabular-nums">{baht(c.total)}</b>
              {Math.abs(c.total - row.total) > PAIR_EQUAL && <span className="ml-1.5 text-amber-700">ยอดต่าง {baht(Math.abs(c.total - row.total))}</span>}
            </button>
          ))}
        </div>
        {sel && (
          <div className="mt-3">
            <div className="text-ink-2">จะยื่นภาษีด้วยใบไหน (อีกใบจะไม่นับ)</div>
            <div className="mt-1.5 flex gap-2 flex-wrap">
              {([[row, sel], [sel, row]] as const).map(([keep, drop]) => {
                const why = pairProblem(drop, keep);
                return (
                  <button key={keep.key} type="button" disabled={busy || !!why} title={why ?? ""} className="press rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={() => pick(keep, drop, sel)}>
                    ยื่นใบ {keep.code} ({baht(keep.total)})
                  </button>
                );
              })}
            </div>
            {(pairProblem(sel, row) || pairProblem(row, sel)) && <div className="mt-1.5 text-xs text-amber-800">ปุ่มที่กดไม่ได้ = ใบนั้นยอดน้อยกว่า ถ้านับใบนั้นยอดขายจะหาย</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
