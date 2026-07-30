"use client";

/**
 * ใบตัด / BOQ — editor ต่อใบ
 *   ข้อ (item) = รุ่น (CutSpec) + ขนาด/ราง/ชุด → ตารางตัดสด · รวมทั้งใบ = BOQ เส้นต่อรหัส + สต็อกคงเหลือ
 *   ปุ่ม "ตัดสต็อก" → POST cut-stock (server คิดเอง · หักผ่าน stock_moves · กันหักซ้ำ)
 *   ใบที่ตัดสต็อกแล้ว = อ่านอย่างเดียว (แก้ข้อไม่ได้ ยอดหักไปแล้ว)
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { computeCutList, type CutInput } from "@/lib/cutlist/engine";
import { CUT_SPECS, CUT_SPEC_BY_ID } from "@/lib/cutlist/products";
import { resolveStock, type StockLite } from "@/lib/cutlist/stock-match";
import ImageZoom from "@/components/ImageZoom";
import CutAdjustPanel, { type Adj } from "@/components/cutlist/CutAdjustPanel";

type ItemRow = {
  key: number;
  spec_id: string;
  label: string;
  input: Partial<CutInput> & Record<string, unknown>;
  sets: number;
};

// รุ่นตระกูล SMS เลื่อน = มีตัวเลือก "โหนก" (เสาเกี่ยวโหนก)
const hasHonk = (specId: string) => specId.startsWith("sms_slide");

export default function CutlistEditorClient({
  cutlistId, stock, colorOptions, canWrite, changToken, changName, canCutStock = true, requesters = [],
}: {
  cutlistId: number;
  stock: StockLite[];
  /** เปิดจากลิงก์ช่าง (ไม่ล็อกอิน) → แนบโทเคนไปกับทุก request · undefined = คนล็อกอินปกติ */
  changToken?: string;
  /** ชื่อช่าง (ไว้ทำ audit ฝั่ง server) */
  changName?: string;
  /** ตัดสต็อกได้ไหม — ช่างผ่านลิงก์ = false (ปุ่มจะซ่อน) */
  canCutStock?: boolean;
  colorOptions: string[];
  canWrite: boolean;
  /** รายชื่อคนเบิกเก่า (datalist ตอนตัดสต็อก) */
  requesters?: string[];
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("draft");
  const [code, setCode] = useState("");
  const [jobLabel, setJobLabel] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cutSummary, setCutSummary] = useState<any>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [adjustments, setAdjustments] = useState<Adj[]>([]);
  const [keySeq, setKeySeq] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [confirmCut, setConfirmCut] = useState(false);
  const [cutRequester, setCutRequester] = useState("");   // ชื่อคนเบิก (กรอกก่อนตัดสต็อก)

  // จับคู่รหัส (+สี) → สต็อกจริง — sku เป๊ะ หรือ ชื่อมีรหัส+สี (SlimLux/OPK sku ว่าง)
  // แนบโทเคนช่างไปกับทุก request (ถ้าเปิดจากลิงก์ช่าง) — server ตัดสินสิทธิ์จากตรงนี้
  const authHeaders = (extra?: Record<string, string>): Record<string, string> => {
    if (!changToken) return extra ?? {};
    // ชื่อช่างเก็บใน localStorage คีย์ "chang_name" (ตัวเดียวกับหน้าตารางผลิตช่าง) — ไว้ทำ audit
    let who = changName ?? "";
    if (!who) { try { who = localStorage.getItem("chang_name") || ""; } catch { /* ignore */ } }
    // encode ก่อนใส่ header — ชื่อไทยดิบ ๆ ทำ fetch throw (header รับแค่ ISO-8859-1)
    return { ...(extra ?? {}), "x-chang-token": changToken, "x-chang-name": encodeURIComponent(who) };
  };
  const stockOf = (c: string, color?: string) => resolveStock(stock, c, color);
  // รูปโชว์อย่างเดียว (ไม่กระทบการตัดสต็อก): ถ้าตัวที่จับคู่ไม่มีรูป → ยืมรูปจากพี่น้องรหัสเดียวกันที่มีรูป
  //   (บางรหัสมีหลายแถว เช่นชิ้นรอง "เฟรมล่างกันน้ำ (Bxxxxx)" ไม่มีรูป แต่ตัวสีหลักมีรูป)
  const imgOf = (c: string, color?: string) => {
    const hit = stockOf(c, color);
    if (hit?.image) return hit.image;
    const uc = String(c ?? "").trim().toUpperCase();
    if (!uc || uc === "-") return "";
    const sib = stock.find((s) => s.image && (String(s.sku).trim().toUpperCase() === uc || String(s.name).toUpperCase().includes(uc)));
    return sib?.image || "";
  };

  useEffect(() => {
    fetch(`/api/cutlists/${cutlistId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((json) => {
        const d = json?.data;
        if (!d?.id) { setErr(json?.error ?? "โหลดใบตัดไม่สำเร็จ"); return; }
        setName(d.name ?? "");
        setNote(d.note ?? "");
        setStatus(d.status ?? "draft");
        setCode(d.code || `CL-${d.id}`);
        setCutSummary(d.stock_cut_summary ?? null);
        setAdjustments(Array.isArray(d.adjustments) ? d.adjustments : []);
        if (d.jobs) setJobLabel(`${d.jobs.customer_name ?? ""}${d.jobs.job_code ? ` · ${d.jobs.job_code}` : ""}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const its = ((d.cutlist_items ?? []) as any[]).map((it, i) => ({
          key: i + 1, spec_id: it.spec_id, label: it.label ?? "", input: it.input ?? {}, sets: Number(it.sets) || 1,
        }));
        setItems(its);
        setKeySeq(its.length + 1);
      })
      .catch(() => setErr("โหลดใบตัดไม่สำเร็จ"))
      .finally(() => setLoaded(true));
  }, [cutlistId]);

  const readOnly = status === "stock_cut" || !canWrite;

  function addItem() {
    const spec = CUT_SPECS[0];
    setItems((xs) => [...xs, { key: keySeq, spec_id: spec.id, label: "", input: { ...spec.defaults }, sets: 1 }]);
    setKeySeq((k) => k + 1);
  }
  function patchItem(key: number, p: Partial<ItemRow>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }
  function patchInput(key: number, p: Record<string, unknown>) {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, input: { ...x.input, ...p } } : x)));
  }
  function removeItem(key: number) {
    setItems((xs) => xs.filter((x) => x.key !== key));
  }
  function copyItem(key: number) {
    setItems((xs) => {
      const i = xs.findIndex((x) => x.key === key);
      if (i < 0) return xs;
      const arr = [...xs];
      arr.splice(i + 1, 0, { ...xs[i], input: { ...xs[i].input }, key: keySeq });
      return arr;
    });
    setKeySeq((k) => k + 1);
  }

  // คิดสดต่อข้อ + BOQ รวมทั้งใบ (รวมยาวต่อรหัสก่อน แล้วปัดเป็นเส้น — ตรง logic ฝั่ง server)
  const computed = useMemo(() => items.map((it) => {
    const spec = CUT_SPEC_BY_ID[it.spec_id];
    if (!spec) return { it, spec: null, result: null };
    return { it, spec, result: computeCutList(spec, it.input, Math.max(1, it.sets)) };
  }), [items]);

  const boq = useMemo(() => {
    // key = รหัส + สี (คนละสี = คนละรายการสต็อก แม้รหัสเดียวกัน) · เก็บ code/color แยกไว้ประกอบกลับ
    const SEP = " ";
    const len = new Map<string, number>();
    const maxCut = new Map<string, number>();
    const opts = new Map<string, Set<number>>();
    const meta = new Map<string, { code: string; color: string }>();
    for (const c of computed) {
      if (!c.result || !c.spec) continue;
      const color = String(c.it.input.color ?? "").trim();
      const K = (code: string) => code + SEP + color;
      for (const b of c.result.barsByCode) {
        const k = K(b.code);
        len.set(k, (len.get(k) ?? 0) + b.totalLenCm);
        if (!opts.has(k)) opts.set(k, new Set());
        opts.get(k)!.add(b.stockLen);
        if (!meta.has(k)) meta.set(k, { code: b.code, color });
      }
      for (const row of c.result.rows) {
        if (!row.code || row.code === "-" || row.qty <= 0 || row.len <= 0) continue;
        const k = K(row.code);
        maxCut.set(k, Math.max(maxCut.get(k) ?? 0, row.len));
        opts.get(k)?.add(row.stockLen);
      }
    }
    return [...len.entries()]
      .map(([k, totalLenCm]) => {
        const { code: codeK, color } = meta.get(k)!;
        // เลือกเส้นคุ้มสุด (เศษน้อยสุด · ยาว ≥ ชิ้นยาวสุด) — ตรง engine pickStock / server cut-stock
        const cand = [...(opts.get(k) ?? new Set([640]))].filter((b) => b > 0).sort((a, b) => a - b);
        const feas = cand.filter((b) => b >= (maxCut.get(k) ?? 0) - 1e-9);
        const pool = feas.length ? feas : [Math.max(...cand)];
        let stockLen = pool[0], bestWaste = Infinity;
        for (const b of pool) {
          const bb = Math.ceil(totalLenCm / b - 1e-9);
          const w = bb * b - totalLenCm;
          if (w < bestWaste - 1e-9) { bestWaste = w; stockLen = b; }
        }
        const bars = Math.ceil(totalLenCm / stockLen - 1e-9);
        const st = stockOf(codeK, color);
        return { code: codeK, color, totalLenCm: Math.round(totalLenCm * 10) / 10, bars, stockLen, stockQty: st ? st.qty : null, stockName: st?.name ?? "", stockId: st?.id ?? null };
      })
      .sort((a, b) => a.code.localeCompare(b.code) || a.color.localeCompare(b.color));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed]);

  // BOQ อุปกรณ์รวมทั้งใบ — รวมตาม SKU (JR#####) + เทียบสต็อกคงเหลือ (เชื่อมหน้าสโตร์)
  const hwBoq = useMemo(() => {
    const skuOf = new Map<string, StockLite>();
    for (const s of stock) if (s.sku) skuOf.set(s.sku.trim().toLowerCase(), s);
    // group key = sku (ถ้ามี) · ไม่มี sku = แยกตามชื่อ · เก็บ unit/noStock/ชื่อรวม
    const g = new Map<string, { sku: string; names: Set<string>; unit: string; qty: number; noStock: boolean }>();
    for (const c of computed) {
      if (!c.result) continue;
      for (const h of c.result.hardware) {
        if (h.qty <= 0) continue;
        const sku = String(h.sku ?? "").trim();
        const key = sku ? "s:" + sku.toLowerCase() : "n:" + h.name;
        const cur = g.get(key) ?? { sku, names: new Set<string>(), unit: h.unit, qty: 0, noStock: !!h.noStock };
        cur.names.add(h.name); cur.qty += h.qty; if (h.noStock) cur.noStock = true;
        g.set(key, cur);
      }
    }
    return [...g.values()]
      .map((e) => {
        const st = e.sku ? skuOf.get(e.sku.toLowerCase()) : undefined;
        return {
          sku: e.sku, name: [...e.names].join(" + "), unit: e.unit, qty: Math.round(e.qty * 10) / 10,
          noStock: e.noStock, stockQty: st ? st.qty : null, stockName: st?.name ?? "", stockId: st?.id ?? null,
        };
      })
      .sort((a, b) => (a.noStock ? 1 : 0) - (b.noStock ? 1 : 0) || a.name.localeCompare(b.name, "th"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed]);

  async function save() {
    setBusy(true); setErr(""); setOkMsg("");
    try {
      const res = await fetch(`/api/cutlists/${cutlistId}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name, note, adjustments,
          items: items.map((it) => ({ spec_id: it.spec_id, label: it.label, input: it.input, sets: it.sets })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error ?? "บันทึกไม่สำเร็จ"); return false; }
      setOkMsg("บันทึกแล้ว ✓");
      return true;
    } finally { setBusy(false); }
  }

  async function cutStock() {
    setBusy(true); setErr(""); setOkMsg("");
    try {
      // บันทึกก่อนหักเสมอ — ให้ server คิดจากข้อล่าสุดที่เห็นบนจอ
      const saved = await save();
      if (!saved) return;
      const res = await fetch(`/api/cutlists/${cutlistId}/cut-stock`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ requester: cutRequester.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error ?? "ตัดสต็อกไม่สำเร็จ"); return; }
      const d = json?.data ?? {};
      setStatus("stock_cut");
      setCutSummary({ ...d, at: new Date().toISOString() });
      setConfirmCut(false);
      const parts = [`ตัดสต็อกแล้ว ✓ หัก ${d.deducted?.length ?? 0} รหัส`];
      if (d.skipped?.length) parts.push(`ข้าม ${d.skipped.length} รหัส (ไม่มีในสต็อก)`);
      if (d.failed?.length) parts.push(`⚠ หักไม่สำเร็จ ${d.failed.length} รหัส (${d.failed.map((f: { code: string }) => f.code).join(", ")}) — เช็ค/หักมือที่หน้าสต๊อก`);
      setOkMsg(parts.join(" · "));
      router.refresh();
    } finally { setBusy(false); }
  }

  // หักรายการที่ค้าง (failed) ของใบที่ตัดไปแล้ว — ใช้ตอนอลูยอดไม่พอตอนนั้น (ตอนนี้ติดลบได้แล้ว)
  async function retryFailed() {
    const who = window.prompt(`หักรายการที่ค้าง ${cutSummary?.failed?.length ?? 0} รหัส (${(cutSummary?.failed ?? []).map((f: { code: string }) => f.code).join(", ")})\nชื่อคนเบิก:`, cutRequester || "");
    if (who === null) return;
    if (!who.trim()) { setErr("ต้องระบุชื่อคนเบิก"); return; }
    setBusy(true); setErr(""); setOkMsg("");
    try {
      const res = await fetch(`/api/cutlists/${cutlistId}/cut-stock-retry`, {
        method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ requester: who.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error ?? "หักไม่สำเร็จ"); return; }
      const d = json?.data ?? {};
      setCutSummary((s: Record<string, unknown>) => ({ ...s, deducted: [...((s?.deducted as unknown[]) ?? []), ...(d.newDeducted ?? [])], failed: d.stillFailed ?? [] }));
      const parts = [`หักที่ค้างแล้ว ✓ ${d.newDeducted?.length ?? 0} รหัส`];
      if (d.stillFailed?.length) parts.push(`เหลือ ${d.stillFailed.length} รหัสที่ยังไม่มีในสต็อก (สร้างวัสดุก่อน)`);
      setOkMsg(parts.join(" · "));
      router.refresh();
    } finally { setBusy(false); }
  }

  // ลบใบร่างที่เทส — server กันเฉพาะ draft (ใบตัดแล้วลบไม่ได้ · มีประวัติหักผูกอยู่)
  async function deleteCutlist() {
    if (!window.confirm(`ลบใบตัด ${code} ทิ้งถาวร?\n(ลบได้เฉพาะใบที่ยังไม่ตัดสต็อก — ไว้เคลียร์ใบที่สร้างเทส)`)) return;
    setBusy(true); setErr(""); setOkMsg("");
    try {
      const res = await fetch(`/api/cutlists/${cutlistId}`, { method: "DELETE", headers: authHeaders() });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error ?? "ลบไม่สำเร็จ"); return; }
      router.push(changToken ? `/chang/${changToken}/cutlist` : "/cutlist?tab=cutlist");
    } finally { setBusy(false); }
  }

  if (!loaded) return <p className="text-ink-3 py-10 text-center">กำลังโหลดใบตัด…</p>;

  return (
    <div className="space-y-4">
      {/* หัวใบ + ปุ่ม */}
      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/cutlist?tab=cutlist" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark shrink-0">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <h1 className="text-xl font-bold text-brand-dark font-mono shrink-0">{code}</h1>
          {status === "stock_cut" ? <Badge tone="emerald" dot>ตัดสต็อกแล้ว</Badge> : <Badge tone="gray" dot>ร่าง</Badge>}
          {jobLabel && <span className="text-sm text-ink-3 truncate">งาน: {jobLabel}</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!readOnly && (
            <button onClick={save} disabled={busy}
              className="press rounded-xl px-4 py-2.5 text-sm font-semibold glass-soft text-brand-dark disabled:opacity-50">
              บันทึก
            </button>
          )}
          <button onClick={() => window.print()} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold glass-soft text-ink-2">
            <Icon name="printer" size={15} /> พิมพ์
          </button>
          {/* ลบใบร่างที่เทส — เฉพาะใบที่ยังไม่ตัดสต็อก (draft) · ใบที่ตัดแล้วล็อก (server กันอีกชั้น) */}
          {!readOnly && (
            <button onClick={deleteCutlist} disabled={busy}
              className="press rounded-xl px-4 py-2.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50">
              🗑 ลบใบนี้
            </button>
          )}
          {/* ตัดออกสโตร์ = ยืนยันนำไปใช้จริง (หักของออกจากสโตร์) · ช่างกดได้แล้ว (เจ้าของเคาะ 23 ก.ค.69) */}
          {!readOnly && canCutStock && (
            <button onClick={() => setConfirmCut(true)} disabled={busy || boq.length === 0}
              className="press rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow disabled:opacity-50">
              ✂️ ตัดออกสโตร์ (ยืนยันใช้จริง)
            </button>
          )}
        </div>
      </div>

      {status === "stock_cut" && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 no-print">
          ✓ ใบนี้ตัดสต็อกแล้ว{cutSummary?.at ? ` (${String(cutSummary.at).slice(0, 10)})` : ""} — แก้ข้อไม่ได้ · หัก {cutSummary?.deducted?.length ?? 0} รหัส
          {cutSummary?.skipped?.length ? ` · ข้าม ${cutSummary.skipped.length} รหัส: ${cutSummary.skipped.map((s: { code: string }) => s.code).join(", ")} (ไม่มีในสต็อก — หักมือได้ที่หน้าสต๊อก)` : ""}
          {cutSummary?.failed?.length ? ` · ⚠ หักไม่สำเร็จ ${cutSummary.failed.length} รหัส: ${cutSummary.failed.map((s: { code: string }) => s.code).join(", ")}` : ""}
          {cutSummary?.failed?.length && canCutStock ? (
            <button onClick={retryFailed} disabled={busy}
              className="press ml-2 rounded-lg px-3 py-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50">
              🔄 หักรายการที่ค้าง ({cutSummary.failed.length})
            </button>
          ) : null}
        </div>
      )}
      {err && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 no-print">{err}</p>}
      {okMsg && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 no-print">{okMsg}</p>}

      {/* ชื่อใบ + โน้ต */}
      <Card className="p-4 grid sm:grid-cols-2 gap-3 no-print">
        <label className="block"><span className="text-xs font-medium text-ink-3">ชื่อใบตัด</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly}
            className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none disabled:opacity-60" />
        </label>
        <label className="block"><span className="text-xs font-medium text-ink-3">หมายเหตุ</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} disabled={readOnly}
            className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none disabled:opacity-60" />
        </label>
      </Card>

      {/* หัวพิมพ์ (โชว์เฉพาะตอนพิมพ์) */}
      <div className="hidden print:block">
        <div className="text-lg font-bold">ใบตัดอลู {code} — {name}</div>
        {jobLabel && <div className="text-sm">งาน: {jobLabel}</div>}
      </div>

      {/* ข้อ (items) */}
      {items.map((it, idx) => {
        const spec = CUT_SPEC_BY_ID[it.spec_id];
        const c = computed.find((x) => x.it.key === it.key);
        return (
          <Card key={it.key} className="p-0 overflow-hidden" style={{ breakInside: "avoid" }}>
            <div className="px-4 py-2.5 border-b border-black/5 flex items-center gap-2 flex-wrap bg-black/[0.02]">
              <span className="font-bold text-brand-dark shrink-0">ข้อ {idx + 1}</span>
              <input value={it.label} onChange={(e) => patchItem(it.key, { label: e.target.value })} disabled={readOnly}
                placeholder="ชื่อข้อ (เช่น บานเลื่อน SMS ห้องนอน)"
                className="flex-1 min-w-[180px] glass-soft rounded-lg px-3 py-1.5 text-sm outline-none disabled:opacity-60" />
              {!readOnly && (
                <span className="flex items-center gap-1 no-print">
                  <button onClick={() => copyItem(it.key)} title="ก็อปข้อนี้" className="press px-2 py-1 rounded-lg glass-soft text-xs">📋</button>
                  <button onClick={() => removeItem(it.key)} title="ลบข้อนี้" className="press px-2 py-1 rounded-lg text-red-600 bg-red-50 text-xs">✕</button>
                </span>
              )}
            </div>
            <div className="p-3 space-y-2.5">
              <div className="flex flex-wrap items-end gap-2 no-print">
                <label className="block"><span className="text-[11px] font-medium text-ink-3">รุ่น</span>
                  <select value={it.spec_id} disabled={readOnly}
                    onChange={(e) => { const s = CUT_SPEC_BY_ID[e.target.value]; patchItem(it.key, { spec_id: e.target.value, input: { ...s.defaults } }); }}
                    className="glass-soft rounded-lg px-2 py-1.5 mt-0.5 outline-none text-sm block disabled:opacity-60">
                    {CUT_SPECS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                {/* สีอลู — ตัดสต็อกต่อสีให้ถูกตัว (SlimLux/OPK แยกสีในชื่อ · รหัส B/F ราคาเดียวไม่แยกสี) · ตัวเลือก = สีที่มีจริงในสต็อก */}
                <label className="block"><span className="text-[11px] font-medium text-ink-3">สีอลู</span>
                  <select value={String(it.input.color ?? "")} disabled={readOnly}
                    onChange={(e) => patchInput(it.key, { color: e.target.value })}
                    className="glass-soft rounded-lg px-2 py-1.5 mt-0.5 outline-none text-sm block disabled:opacity-60">
                    <option value="">— ไม่ระบุ —</option>
                    {colorOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    {it.input.color && !colorOptions.includes(String(it.input.color)) && (
                      <option value={String(it.input.color)}>{String(it.input.color)} (นอกสต็อก)</option>
                    )}
                  </select>
                </label>
                <NumField label="กว้าง (ซม.)" value={it.input.W} onChange={(v) => patchInput(it.key, { W: v })} disabled={readOnly} />
                <NumField label="สูง (ซม.)" value={it.input.H} onChange={(v) => patchInput(it.key, { H: v })} disabled={readOnly} />
                <NumField label="จำนวนบาน" value={it.input.N} onChange={(v) => patchInput(it.key, { N: Math.max(1, Math.round(v)) })} disabled={readOnly} />
                {spec && spec.rails.length > 0 && (
                  <label className="block"><span className="text-[11px] font-medium text-ink-3">ราง</span>
                    <select value={String(it.input.rail ?? spec.defaults.rail)} disabled={readOnly}
                      onChange={(e) => patchInput(it.key, { rail: e.target.value })}
                      className="glass-soft rounded-lg px-2 py-1.5 mt-0.5 outline-none text-sm block disabled:opacity-60">
                      {spec.rails.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                )}
                {spec && hasHonk(spec.id) && (
                  <label className="flex items-center gap-1.5 text-sm text-ink-2 pb-1.5">
                    <input type="checkbox" checked={!!it.input.honk} disabled={readOnly}
                      onChange={(e) => patchInput(it.key, { honk: e.target.checked })} /> มีโหนก
                  </label>
                )}
                {/* ตัวเลือกเฉพาะรุ่น (spec.opts) — SlimLux: ช่องปูน/คาน ฯลฯ · เฟี้ยม: พับซ้าย/กระจก · ติดตาย: ชนิดกล่อง
                    · choice "อื่นๆ" (มือจับ) → โชว์ช่องพิมพ์เองคู่กัน (เก็บที่ `${key}_other`) */}
                {(spec?.opts ?? []).flatMap((op) => op.type === "number" ? [
                  <NumField key={op.key} label={op.label} value={it.input[op.key]} disabled={readOnly}
                    onChange={(v) => patchInput(it.key, { [op.key]: v })} />,
                ] : [
                  <label key={op.key} className="block"><span className="text-[11px] font-medium text-ink-3">{op.label}</span>
                    <select value={String(it.input[op.key] ?? op.choices?.[0] ?? "")} disabled={readOnly}
                      onChange={(e) => patchInput(it.key, { [op.key]: e.target.value })}
                      className="glass-soft rounded-lg px-2 py-1.5 mt-0.5 outline-none text-sm block disabled:opacity-60">
                      {(op.choices ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>,
                  ...(String(it.input[op.key] ?? "") === "อื่นๆ" ? [
                    <label key={op.key + "_other"} className="block"><span className="text-[11px] font-medium text-ink-3">{op.label} (พิมพ์เอง)</span>
                      <input type="text" value={String(it.input[`${op.key}_other`] ?? "")} disabled={readOnly}
                        placeholder="ระบุชื่อ/รุ่น"
                        onChange={(e) => patchInput(it.key, { [`${op.key}_other`]: e.target.value })}
                        className="w-32 glass-soft rounded-lg px-2 py-1.5 mt-0.5 outline-none text-sm block disabled:opacity-60" />
                    </label>,
                  ] : []),
                ])}
                <NumField label="ชุด" value={it.sets} onChange={(v) => patchItem(it.key, { sets: Math.max(1, Math.round(v)) })} disabled={readOnly} narrow />
              </div>
              {/* บรรทัดสรุปอินพุต (สำหรับพิมพ์) */}
              <div className="hidden print:block text-xs">
                {spec?.name} · {String(it.input.W)}×{String(it.input.H)} ซม. · {String(it.input.N)} บาน{it.input.rail ? ` · ${it.input.rail}` : ""}{it.input.color ? ` · สี${String(it.input.color)}` : ""}{it.sets > 1 ? ` · ${it.sets} ชุด` : ""}
              </div>

              {!spec && <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">⚠ ไม่รู้จักรุ่น &quot;{it.spec_id}&quot; (สเปกถูกถอดจากระบบ) — ข้อนี้จะไม่ถูกคิด/หักสต็อก</p>}

              {c?.result && (
                <div className="overflow-x-auto rounded-lg border border-black/5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                        {/* โปรไฟล์ดูดพื้นที่ว่าง (w-full) → คอลัมน์ตัวเลขชิดเป็นกลุ่มขวา ไม่โหว่กลางบนจอกว้าง */}
                        <th className="px-2.5 py-1.5 font-medium w-full">โปรไฟล์</th>
                        <th className="px-2.5 py-1.5 font-medium whitespace-nowrap">รหัส</th>
                        <th className="px-2.5 py-1.5 font-medium text-right whitespace-nowrap">ยาวตัด (ซม.)</th>
                        <th className="px-2.5 py-1.5 font-medium text-right whitespace-nowrap">จำนวน</th>
                        <th className="px-2.5 py-1.5 font-medium text-right whitespace-nowrap">เส้น {spec ? spec.stockLen / 100 : 6.4}ม.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.result.rows.filter((r) => r.qty > 0).map((r, i) => (
                        <tr key={i} className="border-b border-black/5 last:border-0">
                          <td className="px-2.5 py-1.5 font-medium">{r.name}</td>
                          <td className="px-2.5 py-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              <ProfileThumb url={imgOf(r.code, it.input.color)} code={r.code} />
                              <span className="font-mono text-xs">{r.code}</span>
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums">{r.len.toLocaleString("th-TH")}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums">{r.qty}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{r.bars || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {c?.result && c.result.hardware.filter((h) => h.qty > 0).length > 0 && (
                <p className="text-[11px] text-ink-3">
                  อุปกรณ์: {c.result.hardware.filter((h) => h.qty > 0).map((h) => `${h.name} ${h.qty} ${h.unit}`).join(" · ")}
                </p>
              )}
            </div>
          </Card>
        );
      })}

      {!readOnly && (
        <button onClick={addItem}
          className="press w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm text-ink-3 hover:bg-white/60 no-print">
          ＋ เพิ่มข้อ (กรอกมือ)
        </button>
      )}

      {/* BOQ รวมทั้งใบ + สต็อก */}
      <Card className="p-0 overflow-hidden border-2 border-emerald-200" style={{ breakInside: "avoid" }}>
        <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50 font-bold text-emerald-800 flex items-center justify-between">
          <span>📦 BOQ รวมทั้งใบ — เส้นต่อรหัส + สต็อกคงเหลือ</span>
          <span className="text-xs font-normal text-emerald-700">{boq.length} รหัส · {boq.reduce((s, b) => s + b.bars, 0)} เส้น</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                <th className="px-3 py-2 font-medium">รหัสอลู (sku)</th>
                <th className="px-3 py-2 font-medium text-right">รวมยาว (ซม.)</th>
                <th className="px-3 py-2 font-medium text-right">ต้องใช้ (เส้น)</th>
                <th className="px-3 py-2 font-medium text-right">สต็อกคงเหลือ</th>
                <th className="px-3 py-2 font-medium text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {boq.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-3">ยังไม่มีข้อที่คิดได้ — เพิ่มข้อด้านบน</td></tr>
              )}
              {boq.map((b) => (
                <tr key={b.code + " " + b.color} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <ProfileThumb url={imgOf(b.code, b.color)} code={b.code} />
                      <span className="font-mono font-semibold">{b.code}</span>
                      {b.color && <span className="text-[11px] px-1.5 py-0.5 rounded bg-black/[0.04] text-ink-2 shrink-0">สี{b.color}</span>}
                      {b.stockName && <span className="text-[11px] text-ink-3 truncate max-w-[180px]">{b.stockName}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-2">{b.totalLenCm.toLocaleString("th-TH")}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">{b.bars}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.stockQty == null ? <span className="text-ink-3">ไม่มีในสต็อก</span> : b.stockQty.toLocaleString("th-TH")}</td>
                  <td className="px-3 py-2 text-center">
                    {b.stockQty == null
                      ? <Badge tone="gray">ข้ามตอนหัก</Badge>
                      : b.stockQty >= b.bars
                        ? <Badge tone="emerald">พอ</Badge>
                        : <Badge tone="amber">ตัดได้ · ยอดจะติดลบ {(b.bars - b.stockQty).toLocaleString("th-TH")}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 text-[11px] text-ink-3 border-t border-black/5 no-print">
          * กด &quot;ตัดสต็อก&quot; = หักตามคอลัมน์ &quot;ต้องใช้&quot; ผ่านความเคลื่อนไหวสต็อก (มีประวัติ + ผูกงาน) · รหัสที่ไม่มีในสต็อกจะข้าม แล้วแจ้งให้หักมือ
        </p>
      </Card>

      {/* BOQ อุปกรณ์รวมทั้งใบ + สต็อก */}
      {hwBoq.length > 0 && (
        <Card className="p-0 overflow-hidden border-2 border-sky-200" style={{ breakInside: "avoid" }}>
          <div className="px-4 py-3 border-b border-sky-100 bg-sky-50 font-bold text-sky-800 flex items-center justify-between">
            <span>🔩 อุปกรณ์รวมทั้งใบ — จำนวน + สต็อกคงเหลือ</span>
            <span className="text-xs font-normal text-sky-700">{hwBoq.length} รายการ</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                  <th className="px-3 py-2 font-medium">อุปกรณ์</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium text-right">ต้องใช้</th>
                  <th className="px-3 py-2 font-medium text-right">สต็อกคงเหลือ</th>
                  <th className="px-3 py-2 font-medium text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {hwBoq.map((h) => (
                  <tr key={(h.sku || h.name)} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{h.name}</span>
                      {h.stockName && <span className="block text-[11px] text-ink-3 truncate max-w-[220px]">{h.stockName}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-2">{h.sku || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-sky-700">{h.qty.toLocaleString("th-TH")} {h.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.noStock ? <span className="text-ink-3">—</span> : h.stockQty == null ? <span className="text-ink-3">ไม่มีในสต็อก</span> : h.stockQty.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2 text-center">
                      {h.noStock
                        ? <Badge tone="gray">ไม่ตัดสต็อก</Badge>
                        : !h.sku
                          ? <Badge tone="gray">ยังไม่ผูกรหัส</Badge>
                          : h.stockQty == null
                            ? <Badge tone="gray">ข้ามตอนหัก</Badge>
                            : h.stockQty >= h.qty
                              ? <Badge tone="emerald">พอ</Badge>
                              : <Badge tone="red">ขาด {(h.qty - h.stockQty).toLocaleString("th-TH")}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2.5 text-[11px] text-ink-3 border-t border-black/5 no-print">
            * อุปกรณ์ที่มี SKU ในสต็อกจะถูกหักตอนกด &quot;ตัดสต็อก&quot; (ยกเว้น &quot;ไม่ตัดสต็อก&quot; เช่น Digital lock / สักหลาดสะสมม้วน) · &quot;ยังไม่ผูกรหัส&quot; = เพิ่มสินค้าในสโตร์แล้วใส่ SKU ให้ตรง
          </p>
        </Card>
      )}

      {/* ปรับก่อนตัดสต็อก (ต่างจาก BOQ) — ลดใช้เศษ / เพิ่มอลู+อุปกรณ์ (0107) */}
      {(!readOnly || adjustments.length > 0) && (
        <CutAdjustPanel
          boqAlu={boq}
          boqHw={hwBoq.filter((h) => !h.noStock).map((h) => ({ sku: h.sku, name: h.name, unit: h.unit, qty: h.qty, stockId: h.stockId }))}
          stock={stock}
          value={adjustments}
          onChange={setAdjustments}
          readOnly={readOnly}
        />
      )}

      {/* dialog ยืนยันตัดสต็อก */}
      {confirmCut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 no-print" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-emerald-700">✂️ ยืนยันตัดออกสโตร์ {code}</h3>
            <p className="text-xs text-ink-3 -mt-2">ยืนยันว่า <b>นำไปใช้จริง</b> (ไม่ใช่แค่เทส) — ของจะถูกหักออกจากสโตร์จริงตามรายการนี้</p>
            <label className="block">
              <span className="text-xs font-medium text-ink-2">ชื่อคนเบิก *</span>
              <input value={cutRequester} onChange={(e) => setCutRequester(e.target.value)} list="cut-requesters"
                placeholder="พิมพ์ชื่อ หรือเลือกจากรายการ" autoFocus
                className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none text-sm" />
              <datalist id="cut-requesters">{requesters.map((n) => <option key={n} value={n} />)}</datalist>
            </label>
            <div className="text-sm text-ink-2 max-h-56 overflow-y-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <tbody>
                  {boq.map((b) => (
                    <tr key={b.code + " " + b.color} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-1.5 font-mono">{b.code}{b.color ? ` · สี${b.color}` : ""}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">-{b.bars} เส้น</td>
                      <td className="px-3 py-1.5 text-right text-xs">{b.stockQty == null ? <span className="text-amber-700">ไม่มีในสต็อก — ข้าม</span> : b.stockQty < b.bars ? <span className="text-amber-700">ตัดได้ (ยอดจะติดลบ)</span> : "✓"}</td>
                    </tr>
                  ))}
                  {hwBoq.filter((h) => !h.noStock && h.sku).map((h) => (
                    <tr key={"hw:" + h.sku} className="border-b border-gray-100 last:border-0 bg-sky-50/40">
                      <td className="px-3 py-1.5"><span className="font-mono text-xs">{h.sku}</span> <span className="text-xs text-ink-3">{h.name}</span></td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">-{h.qty.toLocaleString("th-TH")} {h.unit}</td>
                      <td className="px-3 py-1.5 text-right text-xs">{h.stockQty == null ? <span className="text-amber-700">ไม่มีในสต็อก — ข้าม</span> : h.stockQty < h.qty ? <span className="text-red-600">สต็อกไม่พอ (ติดลบ)</span> : "✓"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {adjustments.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs space-y-1">
                <div className="font-semibold text-amber-900">🔧 ปรับจาก BOQ (จะรีมาร์กไว้ตอนหัก):</div>
                {adjustments.map((a) => (
                  <div key={a.id} className={a.qty < 0 ? "text-red-700" : "text-emerald-700"}>
                    {a.qty < 0 ? "ลด" : "เพิ่ม"} {Math.abs(a.qty)} {a.unit} · {a.name}{a.note ? ` (${a.note})` : ""}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              หักจริงทันที (สร้างความเคลื่อนไหว &quot;เบิกออก&quot; อ้างอิง {code}) · หักแล้วแก้ข้อไม่ได้ · ยกเลิกได้โดย void ความเคลื่อนไหวที่หน้าสต๊อก
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmCut(false)} disabled={busy}
                className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
              <button onClick={cutStock} disabled={busy || !cutRequester.trim()}
                className="press flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                ยืนยัน — ใช้จริง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileThumb({ url, code }: { url: string; code: string }) {
  if (!url) return <span className="inline-flex items-center justify-center w-9 h-7 rounded border border-dashed border-gray-300 text-[9px] text-ink-3 shrink-0">—</span>;
  return (
    <ImageZoom src={url} alt={code} title={`รูปโปรไฟล์ ${code}`} className="shrink-0 no-print inline-flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={code} className="w-9 h-7 object-cover rounded border border-black/10 hover:ring-2 hover:ring-brand/40 cursor-zoom-in" loading="lazy" />
    </ImageZoom>
  );
}

// ช่องกรอกเลข — พิมพ์ได้อิสระทั้งคอม+มือถือ
//  ⚠ บั๊กเดิม: type=number + ค่าที่ผู้เรียก clamp (Math.max(1,..)) เด้งทับทุกคีย์ = พิมพ์ 2/3 ไม่ได้ (ล็อกที่ 1)
//    + มือถือไม่มีปุ่มลูกศร spinner = แก้ค่าไม่ได้เลย
//  แก้: เก็บข้อความที่พิมพ์ไว้ใน state ตัวเอง (ไม่ให้ค่านอกเด้งทับตอนกำลังพิมพ์) · type=text + inputMode=decimal (คีย์บอร์ดเลขมือถือ)
function NumField({ label, value, onChange, disabled, narrow }: { label: string; value: unknown; onChange: (v: number) => void; disabled?: boolean; narrow?: boolean }) {
  const propStr = value == null || value === 0 ? "" : String(value);
  const [text, setText] = useState(propStr);
  const [focused, setFocused] = useState(false);
  // ซิงก์ค่าจากภายนอกเฉพาะตอน "ไม่ได้พิมพ์อยู่" — ไม่งั้นค่าที่ถูก clamp เด้งทับสิ่งที่พิมพ์
  useEffect(() => { if (!focused) setText(propStr); }, [propStr, focused]);
  return (
    <label className={`block ${narrow ? "w-16" : "w-24"}`}>
      <span className="text-[11px] font-medium text-ink-3">{label}</span>
      <input type="text" inputMode="decimal" value={text} disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setText(value == null || value === 0 ? "" : String(value)); }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");   // อนุญาตเลข+จุด · ว่างได้ระหว่างพิมพ์
          setText(raw);
          const n = parseFloat(raw);
          onChange(isNaN(n) ? 0 : n);                            // ส่งเลขออก (clamp ทำที่ผู้เรียกได้ ไม่กระทบข้อความที่โชว์)
        }}
        className="w-full glass-soft rounded-lg px-2 py-1.5 mt-0.5 outline-none tabular-nums text-sm disabled:opacity-60" />
    </label>
  );
}
