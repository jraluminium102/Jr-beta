"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";
import { baht } from "@/lib/money";
import { MANUAL_PREFIX, type LedgerKind } from "@/lib/stats-ledger";

/**
 * หน้าต่างแก้สมุดบัญชี (ยอดมัดจำ) ในหน้าสถิติ — เจ้าของสั่ง 24 พ.ย.69
 *   row = null            → เพิ่มรายการที่ไม่มีในระบบ
 *   row.manual            → แก้/ลบ รายการที่เพิ่มเอง
 *   row เป็นงานในระบบ      → แก้ยอดงาน / ยอดมัดจำ / มัดจำหน้างาน ทับค่าที่ระบบคิด · เอาออกจากยอดมัดจำ
 *   ทุกอย่างมีผลเฉพาะตัวเลขหน้าสถิติ ไม่แตะงาน ใบวางบิล หรือการเงินจริง
 */
export type LedgerEditRow = {
  id: string; job_code: string | null; customer_name: string; line: string;
  date: string | null; assess_date: string | null;
  deposit: number | null; net: number | null; fee: number | null;
  vat: boolean; kind: LedgerKind; sales: string; onsite: boolean; ledger_note: string;
  manual: boolean; adj: { net: boolean; deposit: boolean; onsite: boolean };
  net_auto: number | null; deposit_auto: number | null; onsite_auto: boolean;
  src: "bill" | "quote" | "none" | "manual";
};

const KIND_OPTS: { v: LedgerKind; th: string }[] = [
  { v: "NEW", th: "N — ลูกค้าใหม่" }, { v: "OLD", th: "O — ลูกค้าเก่า" },
  { v: "ADDON", th: "งานเพิ่ม (ไม่ผ่านประเมิน)" }, { v: "SPECIAL", th: "พิเศษ (ช่าง/พาร์ตเนอร์)" },
];
const toNum = (s: string): number | null => {
  const t = s.replace(/,/g, "").trim(); if (!t) return 0;
  const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : null;
};
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
const numStr = (n: number | null | undefined) => (n == null ? "" : String(n));

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) throw new Error(j?.error ?? "บันทึกไม่สำเร็จ");
  return j.data;
}
/** ใช้ร่วมกับตาราง (สลับมัดจำหน้างาน · เอากลับ · แก้ใหม่/เก่า ของรายการที่เพิ่มเอง) */
export const ledgerApi = {
  patchJob: (job_id: string, body: { net?: number | null; deposit?: number | null; onsite?: boolean | null; excluded?: boolean }) => call("PATCH", "/api/stats/ledger", { job_id, ...body }),
  addManual: (body: Record<string, unknown>) => call("POST", "/api/stats/ledger", body),
  putManual: (rowId: string, body: Record<string, unknown>) => call("PUT", "/api/stats/ledger", { id: rowId.slice(MANUAL_PREFIX.length), ...body }),
  delManual: (rowId: string) => call("DELETE", `/api/stats/ledger?id=${encodeURIComponent(rowId.slice(MANUAL_PREFIX.length))}`),
};

const lbl = "block text-[13px] font-semibold text-ink-2 mb-1";
const inp = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-[15px] outline-none focus:border-brand";

export function LedgerEditModal({ row, salesNames, onClose, onSaved }: {
  row: LedgerEditRow | null; salesNames: string[]; onClose: () => void; onSaved: () => void;
}) {
  const isNew = row === null;
  const isManual = isNew || row.manual;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // ช่องเงิน — เก็บเป็นข้อความ (พิมพ์ลูกน้ำได้)
  const [net, setNet] = useState(numStr(row?.net));
  const [deposit, setDeposit] = useState(numStr(row?.deposit));
  const [fee, setFee] = useState(numStr(row?.fee) === "0" ? "" : numStr(row?.fee));
  // มัดจำหน้างาน: งานในระบบ = ตามระบบ/ใช่/ไม่ใช่ · รายการเพิ่มเอง = ใช่/ไม่ใช่
  const [onsite, setOnsite] = useState<"auto" | "yes" | "no">(isManual ? (row?.onsite ? "yes" : "no") : row.adj.onsite ? (row.onsite ? "yes" : "no") : "auto");
  // เฉพาะรายการเพิ่มเอง
  const [name, setName] = useState(row?.customer_name ?? "");
  const [line, setLine] = useState(row?.line ?? "");
  const [depDate, setDepDate] = useState(row?.date ?? "");
  const [assessDate, setAssessDate] = useState(row?.assess_date ?? "");
  const [vat, setVat] = useState(row?.vat ?? false);
  const [kind, setKind] = useState<LedgerKind>(row?.kind ?? "NEW");
  const [sales, setSales] = useState(row && row.sales !== "ไม่ระบุ" ? row.sales : "");
  const [note, setNote] = useState(row?.ledger_note ?? "");
  // ค่าตอนเปิดหน้าต่าง — ส่งไปบันทึกเฉพาะช่องที่ถูกแตะจริง
  //   (ตัวเลขที่หน้าเว็บได้มาถูกปัดเป็นบาทเต็มแล้ว ถ้าส่งทุกช่องกลับไป เศษสตางค์ของช่องที่ไม่ได้แก้จะหาย)
  const [init] = useState({ net, deposit, fee, onsite, name, line, depDate, assessDate, vat, kind, sales, note });

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setErr("");
    try { await fn(); onSaved(); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); setBusy(false); }
  }

  function save() {
    const n = toNum(net), d = toNum(deposit), f = toNum(fee);
    if (n === null || d === null || f === null) return setErr("ยอดเงินต้องเป็นตัวเลข ไม่ติดลบ");
    if (isManual) {
      if (!name.trim()) return setErr("กรอกชื่อลูกค้า");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(depDate)) return setErr("เลือกวันที่มัดจำ (รายการจะไปอยู่เดือนของวันนี้)");
      const all = {
        customer_name: name.trim(), line: line.trim(), deposit_date: depDate, assess_date: /^\d{4}-\d{2}-\d{2}$/.test(assessDate) ? assessDate : null,
        deposit: d, net: n, fee: f, vat, kind, sales: sales.trim(), onsite: onsite === "yes", note: note.trim(),
      };
      if (isNew) return run(() => ledgerApi.addManual(all));
      // แก้รายการเดิม: ส่งเฉพาะช่องที่เปลี่ยน
      const touched: Record<string, boolean> = {
        customer_name: name !== init.name, line: line !== init.line, deposit_date: depDate !== init.depDate, assess_date: assessDate !== init.assessDate,
        deposit: deposit !== init.deposit, net: net !== init.net, fee: fee !== init.fee, vat: vat !== init.vat, kind: kind !== init.kind,
        sales: sales !== init.sales, onsite: onsite !== init.onsite, note: note !== init.note,
      };
      const body = Object.fromEntries(Object.entries(all).filter(([k]) => touched[k]));
      if (!Object.keys(body).length) return onClose();
      return run(() => ledgerApi.putManual(row.id, body));
    }
    // งานในระบบ: ส่งเฉพาะช่องที่แตะจริง · กรอกเท่ากับค่าที่ระบบคิด = ไม่ตั้งทับ (กลับไปตามระบบ)
    const body: { net?: number | null; deposit?: number | null; onsite?: boolean | null } = {};
    //   ลบตัวเลขจนช่องว่าง = ใช้ค่าตามระบบ (ไม่ใช่ตั้งเป็น 0 — อยากได้ 0 ต้องพิมพ์ 0)
    if (net !== init.net) body.net = !net.trim() || same(n, row.net_auto ?? 0) ? null : n;
    if (deposit !== init.deposit) body.deposit = !deposit.trim() || same(d, row.deposit_auto ?? 0) ? null : d;
    //   เลือก ใช่/ไม่ใช่ ที่ตรงกับที่ระบบดูอยู่แล้ว = ไม่ตั้งทับ (เหมือนปุ่มสลับในตาราง)
    if (onsite !== init.onsite) body.onsite = onsite === "auto" || (onsite === "yes") === row.onsite_auto ? null : onsite === "yes";
    if (!Object.keys(body).length) return onClose();
    run(() => ledgerApi.patchJob(row.id, body));
  }
  function exclude() {
    if (!row || row.manual) return;
    if (!window.confirm(`เอา "${row.customer_name}" ออกจากยอดมัดจำ?\n\nรายการนี้จะไม่ถูกนับเป็นยอดมัดจำ/ยอดขายในหน้าสถิติ (งานและเอกสารจริงไม่ถูกแตะ)\nเอากลับได้ที่ท้ายตาราง`)) return;
    run(() => ledgerApi.patchJob(row.id, { excluded: true }));
  }
  function removeManual() {
    if (!row || !row.manual) return;
    if (!window.confirm(`ลบรายการ "${row.customer_name}" ที่เพิ่มเอง?\n\nลบแล้วเอากลับไม่ได้ ต้องเพิ่มใหม่`)) return;
    run(() => ledgerApi.delManual(row.id));
  }

  const autoHint = (auto: number | null, on: boolean, reset: () => void, srcTh: string) => (
    <div className="text-[12px] text-ink-3 mt-1">
      ระบบคิดได้ <b className="text-ink-2 tabular-nums">{baht(auto ?? 0)} บาท</b>{srcTh ? ` (${srcTh})` : ""}
      {on && <> · <button type="button" onClick={reset} className="press text-brand underline">ใช้ค่าตามระบบ</button></>}
    </div>
  );
  const SRC: Record<LedgerEditRow["src"], string> = { bill: "จากใบวางบิล", quote: "จากใบเสนอ", none: "ไม่มีบิล/ใบเสนอ", manual: "" };
  const netNum = toNum(net) ?? 0, depNum = toNum(deposit) ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 scrim" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-lg max-h-[94dvh] overflow-y-auto glass rounded-2xl p-5 sm:p-6 fade-in">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-brand-dark">{isNew ? "เพิ่มรายการที่ไม่มีในระบบ" : isManual ? "แก้รายการที่เพิ่มเอง" : "แก้ยอดในสมุดบัญชี"}</h2>
            <p className="text-[12.5px] text-ink-3 mt-0.5">
              {isManual ? "ใช้กับงานที่ไม่ได้เปิดในระบบ — นับเป็นยอดมัดจำ/ยอดขายของเดือนที่มัดจำ" : <>{row.customer_name}{row.job_code ? ` · ${row.job_code}` : ""}</>}
              {" · "}มีผลเฉพาะหน้าสถิติ ไม่แตะงานหรือเอกสารจริง
            </p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="ปิด" className="press text-ink-3 hover:text-ink rounded-lg p-1"><Icon name="close" size={18} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {isManual && (
            <>
              <div className="sm:col-span-2"><label className={lbl}>ชื่อลูกค้า *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น งานบ้าน K.อ้อ" className={inp} autoFocus /></div>
              <div><label className={lbl}>วันที่มัดจำ *</label>
                <DateField value={depDate} onChange={setDepDate} className={inp} aria-label="วันที่มัดจำ" /></div>
              <div><label className={lbl}>เข้าประเมิน <span className="font-normal text-ink-3">(ไม่มีเว้นว่าง)</span></label>
                <DateField value={assessDate} onChange={setAssessDate} className={inp} aria-label="วันเข้าประเมิน" /></div>
            </>
          )}

          <div><label className={lbl}>ยอดงานทั้งหมด <span className="font-normal text-ink-3">(ก่อน VAT)</span></label>
            <input value={net} onChange={(e) => setNet(e.target.value)} inputMode="decimal" className={`${inp} tabular-nums text-right`} placeholder="0" />
            {!isManual && autoHint(row.net_auto, !same(netNum, row.net_auto ?? 0), () => setNet(numStr(row.net_auto ?? 0)), SRC[row.src])}
          </div>
          <div><label className={lbl}>ยอดมัดจำ <span className="font-normal text-ink-3">(ก่อน VAT)</span></label>
            <input value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" className={`${inp} tabular-nums text-right`} placeholder="0" />
            {!isManual && autoHint(row.deposit_auto, !same(depNum, row.deposit_auto ?? 0), () => setDeposit(numStr(row.deposit_auto ?? 0)), "")}
          </div>

          {isManual && (
            <>
              <div><label className={lbl}>ค่าประเมิน/3D</label>
                <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className={`${inp} tabular-nums text-right`} placeholder="0" /></div>
              <div><label className={lbl}>ใหม่/เก่า</label>
                <select value={kind} onChange={(e) => setKind(e.target.value as LedgerKind)} className={inp}>
                  {KIND_OPTS.map((k) => <option key={k.v} value={k.v}>{k.th}</option>)}
                </select></div>
              <div><label className={lbl}>เซลล์</label>
                <input value={sales} onChange={(e) => setSales(e.target.value)} list="ledger-sales-names" placeholder="เลือกหรือพิมพ์ชื่อ" className={inp} />
                <datalist id="ledger-sales-names">{salesNames.map((n) => <option key={n} value={n} />)}</datalist></div>
              <div><label className={lbl}>ไลน์/ชื่อติดต่อ</label>
                <input value={line} onChange={(e) => setLine(e.target.value)} className={inp} /></div>
            </>
          )}

          <div className={isManual ? "" : "sm:col-span-2"}><label className={lbl}>มัดจำหน้างาน</label>
            <select value={onsite} onChange={(e) => setOnsite(e.target.value as "auto" | "yes" | "no")} className={inp}>
              {!isManual && <option value="auto">ตามที่ระบบดู ({row.onsite_auto ? "ใช่" : "ไม่ใช่"})</option>}
              <option value="yes">ใช่ — มัดจำหน้างาน</option>
              <option value="no">ไม่ใช่</option>
            </select>
            {!isManual && <div className="text-[12px] text-ink-3 mt-1">ระบบนับเป็นมัดจำหน้างานเมื่อติ๊กไว้ตอนรับเงิน หรือวันมัดจำตรงกับวันประเมิน</div>}
          </div>
          {isManual && (
            <label className="flex items-center gap-2 text-[14px] text-ink-2 cursor-pointer self-end pb-2">
              <input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} className="w-4 h-4 accent-brand" /> งานนี้มี VAT
            </label>
          )}
          {isManual && (
            <div className="sm:col-span-2"><label className={lbl}>หมายเหตุ</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น งานช่าง ไม่ได้เปิดในระบบ" className={inp} /></div>
          )}
        </div>

        {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{err}</div>}

        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div>
            {!isNew && isManual && <button onClick={removeManual} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"><Icon name="trash" size={15} /> ลบรายการนี้</button>}
            {!isManual && <button onClick={exclude} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"><Icon name="trash" size={15} /> เอาออกจากยอดมัดจำ</button>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy} className="press rounded-lg px-4 py-2 text-sm font-semibold text-ink-2 glass-soft">ยกเลิก</button>
            <button onClick={save} disabled={busy} className="press rounded-lg px-5 py-2 text-sm font-semibold bg-brand text-white shadow-brand disabled:opacity-60">{busy ? "กำลังบันทึก…" : isNew ? "เพิ่มรายการ" : "บันทึก"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
