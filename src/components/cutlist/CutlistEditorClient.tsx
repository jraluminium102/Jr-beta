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

type ItemRow = {
  key: number;
  spec_id: string;
  label: string;
  input: Partial<CutInput> & Record<string, unknown>;
  sets: number;
};

type StockInfo = { qty: number; image: string; name: string };

// รุ่นตระกูล SMS เลื่อน = มีตัวเลือก "โหนก" (เสาเกี่ยวโหนก)
const hasHonk = (specId: string) => specId.startsWith("sms_slide");

export default function CutlistEditorClient({
  cutlistId, stockByCode, canWrite,
}: {
  cutlistId: number;
  stockByCode: Record<string, StockInfo>;
  canWrite: boolean;
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
  const [keySeq, setKeySeq] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [confirmCut, setConfirmCut] = useState(false);

  const stockOf = (c: string) => stockByCode[String(c ?? "").trim().toUpperCase()];
  const imgOf = (c: string) => stockOf(c)?.image || "";

  useEffect(() => {
    fetch(`/api/cutlists/${cutlistId}`)
      .then((r) => r.json())
      .then((json) => {
        const d = json?.data;
        if (!d?.id) { setErr(json?.error ?? "โหลดใบตัดไม่สำเร็จ"); return; }
        setName(d.name ?? "");
        setNote(d.note ?? "");
        setStatus(d.status ?? "draft");
        setCode(d.code || `CL-${d.id}`);
        setCutSummary(d.stock_cut_summary ?? null);
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
    const len = new Map<string, number>();
    const sl = new Map<string, number>();
    for (const c of computed) {
      if (!c.result || !c.spec) continue;
      for (const b of c.result.barsByCode) {
        len.set(b.code, (len.get(b.code) ?? 0) + b.totalLenCm);
        sl.set(b.code, c.spec.stockLen);
      }
    }
    return [...len.entries()]
      .map(([codeK, totalLenCm]) => {
        const bars = Math.ceil(totalLenCm / (sl.get(codeK) || 640) - 1e-9);
        const st = stockOf(codeK);
        return { code: codeK, totalLenCm: Math.round(totalLenCm * 10) / 10, bars, stockQty: st ? st.qty : null, stockName: st?.name ?? "" };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed]);

  async function save() {
    setBusy(true); setErr(""); setOkMsg("");
    try {
      const res = await fetch(`/api/cutlists/${cutlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, note,
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
      const res = await fetch(`/api/cutlists/${cutlistId}/cut-stock`, { method: "POST" });
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

  if (!loaded) return <p className="text-ink-3 py-10 text-center">กำลังโหลดใบตัด…</p>;

  return (
    <div className="space-y-4">
      {/* หัวใบ + ปุ่ม */}
      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/cutlist" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark shrink-0">
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
          {!readOnly && (
            <button onClick={() => setConfirmCut(true)} disabled={busy || boq.length === 0}
              className="press rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow disabled:opacity-50">
              ✂️ ตัดสต็อก
            </button>
          )}
        </div>
      </div>

      {status === "stock_cut" && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 no-print">
          ✓ ใบนี้ตัดสต็อกแล้ว{cutSummary?.at ? ` (${String(cutSummary.at).slice(0, 10)})` : ""} — แก้ข้อไม่ได้ · หัก {cutSummary?.deducted?.length ?? 0} รหัส
          {cutSummary?.skipped?.length ? ` · ข้าม ${cutSummary.skipped.length} รหัส: ${cutSummary.skipped.map((s: { code: string }) => s.code).join(", ")} (ไม่มีในสต็อก — หักมือได้ที่หน้าสต๊อก)` : ""}
          {cutSummary?.failed?.length ? ` · ⚠ หักไม่สำเร็จ ${cutSummary.failed.length} รหัส: ${cutSummary.failed.map((s: { code: string }) => s.code).join(", ")} (เช่นสต็อกไม่พอ — เช็ค/หักมือที่หน้าสต๊อก)` : ""}
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
                {/* ตัวเลือกเฉพาะรุ่น (spec.opts) — SlimLux: ช่องปูน/คาน ฯลฯ · เฟี้ยม: พับซ้าย/กระจก · ติดตาย: ชนิดกล่อง */}
                {(spec?.opts ?? []).map((op) => op.type === "number" ? (
                  <NumField key={op.key} label={op.label} value={it.input[op.key]} disabled={readOnly}
                    onChange={(v) => patchInput(it.key, { [op.key]: v })} />
                ) : (
                  <label key={op.key} className="block"><span className="text-[11px] font-medium text-ink-3">{op.label}</span>
                    <select value={String(it.input[op.key] ?? op.choices?.[0] ?? "")} disabled={readOnly}
                      onChange={(e) => patchInput(it.key, { [op.key]: e.target.value })}
                      className="glass-soft rounded-lg px-2 py-1.5 mt-0.5 outline-none text-sm block disabled:opacity-60">
                      {(op.choices ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                ))}
                <NumField label="ชุด" value={it.sets} onChange={(v) => patchItem(it.key, { sets: Math.max(1, Math.round(v)) })} disabled={readOnly} narrow />
              </div>
              {/* บรรทัดสรุปอินพุต (สำหรับพิมพ์) */}
              <div className="hidden print:block text-xs">
                {spec?.name} · {String(it.input.W)}×{String(it.input.H)} ซม. · {String(it.input.N)} บาน{it.input.rail ? ` · ${it.input.rail}` : ""}{it.sets > 1 ? ` · ${it.sets} ชุด` : ""}
              </div>

              {!spec && <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">⚠ ไม่รู้จักรุ่น &quot;{it.spec_id}&quot; (สเปกถูกถอดจากระบบ) — ข้อนี้จะไม่ถูกคิด/หักสต็อก</p>}

              {c?.result && (
                <div className="overflow-x-auto rounded-lg border border-black/5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-3 text-xs border-b border-black/5 bg-black/[0.02]">
                        <th className="px-2.5 py-1.5 font-medium">โปรไฟล์</th>
                        <th className="px-2.5 py-1.5 font-medium">รหัส</th>
                        <th className="px-2.5 py-1.5 font-medium text-right">ยาวตัด (ซม.)</th>
                        <th className="px-2.5 py-1.5 font-medium text-right">จำนวน</th>
                        <th className="px-2.5 py-1.5 font-medium text-right">เส้น {spec ? spec.stockLen / 100 : 6.4}ม.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.result.rows.filter((r) => r.qty > 0).map((r, i) => (
                        <tr key={i} className="border-b border-black/5 last:border-0">
                          <td className="px-2.5 py-1.5 font-medium">{r.name}</td>
                          <td className="px-2.5 py-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              <ProfileThumb url={imgOf(r.code)} code={r.code} />
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
                <tr key={b.code} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <ProfileThumb url={imgOf(b.code)} code={b.code} />
                      <span className="font-mono font-semibold">{b.code}</span>
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
                        : <Badge tone="red">ขาด {(b.bars - b.stockQty).toLocaleString("th-TH")}</Badge>}
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

      {/* dialog ยืนยันตัดสต็อก */}
      {confirmCut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 no-print" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-emerald-700">✂️ ยืนยันตัดสต็อก {code}</h3>
            <div className="text-sm text-ink-2 max-h-56 overflow-y-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <tbody>
                  {boq.map((b) => (
                    <tr key={b.code} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-1.5 font-mono">{b.code}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">-{b.bars} เส้น</td>
                      <td className="px-3 py-1.5 text-right text-xs">{b.stockQty == null ? <span className="text-amber-700">ไม่มีในสต็อก — ข้าม</span> : b.stockQty < b.bars ? <span className="text-red-600">สต็อกไม่พอ (ติดลบ)</span> : "✓"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              หักจริงทันที (สร้างความเคลื่อนไหว &quot;เบิกออก&quot; อ้างอิง {code}) · หักแล้วแก้ข้อไม่ได้ · ยกเลิกได้โดย void ความเคลื่อนไหวที่หน้าสต๊อก
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmCut(false)} disabled={busy}
                className="press flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50">ยกเลิก</button>
              <button onClick={cutStock} disabled={busy}
                className="press flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                ยืนยันตัดสต็อก
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
    <a href={url} target="_blank" rel="noopener noreferrer" title={`รูปโปรไฟล์ ${code}`} className="shrink-0 no-print">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={code} className="w-9 h-7 object-cover rounded border border-black/10 hover:ring-2 hover:ring-brand/40" loading="lazy" />
    </a>
  );
}

function NumField({ label, value, onChange, disabled, narrow }: { label: string; value: unknown; onChange: (v: number) => void; disabled?: boolean; narrow?: boolean }) {
  return (
    <label className={`block ${narrow ? "w-16" : "w-24"}`}>
      <span className="text-[11px] font-medium text-ink-3">{label}</span>
      <input type="number" value={value == null || value === 0 ? "" : String(value)} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full glass-soft rounded-lg px-2 py-1.5 mt-0.5 outline-none tabular-nums text-sm disabled:opacity-60" />
    </label>
  );
}
