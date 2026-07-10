"use client";
import { useMemo, useState } from "react";

// เรตอลูต่อโล — จัดกลุ่ม ซีรีส์ × สี · แก้เรต ฿/กก. แล้วอัปเดตราคาทุกเส้นในกลุ่ม (unit_cost = น้ำหนัก × เรต)
type Row = { id: number; sku: string; name: string; supplier: string; weight_per_unit: number; unit_cost: number; price_per_kg: number };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

function seriesOf(sku: string): string {
  const s = sku.toUpperCase();
  if (s.startsWith("B20")) return "บานเลื่อน SMS (B20xxx)";
  if (s.startsWith("B22")) return "ระแนงเลื่อน (B22xxx)";
  if (s.startsWith("B24")) return "บานเฟี้ยม (B24xxx)";
  if (s.startsWith("E-")) return "บานเลื่อน E-series";
  if (s.startsWith("WM-")) return "SlimLux (WM-Kxx)";
  if (/^F7[89]/.test(s) || /^F79/.test(s)) return "ยูโร (F78xx-F79xx)";
  if (s.startsWith("F")) return "ยูโร อื่นๆ (F...)";
  return "อื่นๆ";
}
// สีจากท้ายชื่อ "รหัส-ชื่อ-สี" · ชื่อแบบเก่า "เฟรมบน (B22001)" = ไม่ระบุสี
function colorOf(name: string): string {
  const i = name.lastIndexOf("-");
  if (i < 0) return "ไม่ระบุสี";
  const c = name.slice(i + 1).trim();
  return c && c.length <= 20 ? c : "ไม่ระบุสี";
}

type Group = { key: string; series: string; color: string; items: Row[]; rate: number };
type RateLog = { id: number; series: string; color: string; prev_rate: number | null; rate: number; item_count: number; changed_by_name: string; created_at: string };

export default function AluRatesClient({ items, noWeightCount, canEdit, rateLog = [] }: { items: Row[]; noWeightCount: number; canEdit: boolean; rateLog?: RateLog[] }) {
  const [rows, setRows] = useState<Row[]>(items);
  const [log, setLog] = useState<RateLog[]>(rateLog);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; text: string; ok: boolean } | null>(null);
  const [openSeries, setOpenSeries] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      const series = seriesOf(r.sku), color = colorOf(r.name);
      const key = series + "‖" + color;
      const g = m.get(key) || { key, series, color, items: [], rate: 0 };
      g.items.push(r);
      m.set(key, g);
    }
    for (const g of m.values()) {
      const kg = g.items.reduce((s, r) => s + Number(r.weight_per_unit), 0);
      const cost = g.items.reduce((s, r) => s + Number(r.unit_cost), 0);
      g.rate = kg > 0 ? round2(cost / kg) : 0;   // เรตเฉลี่ยถ่วงน้ำหนักปัจจุบัน
    }
    return [...m.values()].sort((a, b) => a.series.localeCompare(b.series, "th") || a.color.localeCompare(b.color, "th"));
  }, [rows]);

  const seriesList = useMemo(() => [...new Set(groups.map((g) => g.series))], [groups]);

  async function apply(g: Group) {
    const rate = Number(inputs[g.key]);
    if (!(rate > 0)) { setMsg({ key: g.key, text: "ใส่เรต ฿/กก. ก่อน", ok: false }); return; }
    if (!confirm(`ตั้งเรต ${g.series} · ${g.color} = ${rate} ฿/กก.\nจะอัปเดตราคา ${g.items.length} เส้น (ราคา/เส้น = น้ำหนัก × เรต) — ยืนยัน?`)) return;
    setBusy(g.key); setMsg(null);
    const res = await fetch("/api/stock/alu-rates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: g.items.map((r) => r.id), rate, series: g.series, color: g.color }),
    });
    const j = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) { setMsg({ key: g.key, text: j?.error || "อัปเดตไม่สำเร็จ", ok: false }); return; }
    setRows((rs) => rs.map((r) => g.items.some((x) => x.id === r.id)
      ? { ...r, unit_cost: round2(Number(r.weight_per_unit) * rate), price_per_kg: rate } : r));
    setInputs((v) => ({ ...v, [g.key]: "" }));
    const warns: string[] = j?.data?.warns ?? [];
    setMsg({
      key: g.key,
      text: `อัปเดตแล้ว ${j?.data?.updated ?? g.items.length} เส้น ✓ (คิดราคา 4.0 ใช้ราคาใหม่ทันที)${warns.length ? " · ⚠ " + warns.join(" · ") : ""}`,
      ok: true,
    });
    setLog((l) => [{ id: Date.now(), series: g.series, color: g.color, prev_rate: j?.data?.prev_rate ?? (g.rate || null), rate,
      item_count: j?.data?.updated ?? g.items.length, changed_by_name: "คุณ", created_at: new Date().toISOString() }, ...l]);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark">⚖️ เรตอลูต่อโล (ราคา/กก. × น้ำหนักรายเส้น)</h1>
        <a href="/stock" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">← กลับหน้าสต๊อก</a>
      </div>

      <p className="text-[13px] text-ink-2 glass-soft rounded-xl px-4 py-3">
        ตั้งราคา <b>฿/กก.</b> ของแต่ละกลุ่ม (ซีรีส์ × สี) แล้วกดอัปเดต — ระบบคูณ<b>น้ำหนักต่อเส้น</b>ของแต่ละรหัส
        อัปเดตราคา/เส้นให้ทั้งกลุ่ม · เส้นที่ผูกรหัสกับคิดราคา 4.0 จะใช้ราคาใหม่ทันที
        {noWeightCount > 0 && <> · ⚠ อลูอีก <b>{noWeightCount}</b> รายการยังไม่มีน้ำหนัก/เส้น (เติมในหน้าสต๊อกแล้วจะโผล่ที่นี่)</>}
      </p>

      {seriesList.map((series) => {
        const sg = groups.filter((g) => g.series === series);
        const total = sg.reduce((s, g) => s + g.items.length, 0);
        const open = openSeries[series] ?? true;
        return (
          <div key={series} className="glass-card rounded-2xl p-4">
            <button onClick={() => setOpenSeries((v) => ({ ...v, [series]: !open }))}
              className="w-full flex items-center justify-between text-left">
              <span className="text-sm font-bold text-brand-dark">{series} <span className="font-normal text-ink-3">· {total} เส้น</span></span>
              <span className="text-ink-3 text-xs">{open ? "▲ ย่อ" : "▼ ขยาย"}</span>
            </button>
            {open && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[12px] text-ink-3 border-b border-brand/10">
                      <th className="py-1.5 pr-3">สี</th>
                      <th className="py-1.5 pr-3 text-right">จำนวนเส้น</th>
                      <th className="py-1.5 pr-3 text-right">เรตตอนนี้ (฿/กก.)</th>
                      <th className="py-1.5 pr-3">เรตใหม่</th>
                      <th className="py-1.5 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sg.map((g) => (
                      <RateRow key={g.key} g={g} value={inputs[g.key] ?? ""} busy={busy === g.key}
                        msg={msg?.key === g.key ? msg : null} canEdit={canEdit}
                        onChange={(v) => setInputs((s) => ({ ...s, [g.key]: v }))} onApply={() => apply(g)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {!groups.length && (
        <p className="text-sm text-ink-3 glass-soft rounded-xl px-4 py-6 text-center">
          ยังไม่มีเส้นอลูที่มีทั้ง sku และน้ำหนัก/เส้น — รัน SQL seed น้ำหนัก หรือเติมน้ำหนักในหน้าสต๊อกก่อน
        </p>
      )}

      {/* ประวัติการเปลี่ยนเรต (0088) — วันที่ · กลุ่ม · เรตเดิม→ใหม่ · กี่เส้น · ใคร */}
      <div className="glass-card rounded-2xl p-4">
        <div className="text-sm font-bold text-brand-dark mb-2">🕘 ประวัติการเปลี่ยนเรต</div>
        {log.length === 0 ? (
          <p className="text-[13px] text-ink-3">ยังไม่มีประวัติ — จะบันทึกอัตโนมัติทุกครั้งที่กดอัปเดตเรต</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[12px] text-ink-3 border-b border-brand/10">
                  <th className="py-1.5 pr-3">วันที่</th>
                  <th className="py-1.5 pr-3">กลุ่ม</th>
                  <th className="py-1.5 pr-3">สี</th>
                  <th className="py-1.5 pr-3 text-right">เรต (฿/กก.)</th>
                  <th className="py-1.5 pr-3 text-right">เส้น</th>
                  <th className="py-1.5 pr-3">โดย</th>
                </tr>
              </thead>
              <tbody>
                {log.map((h) => {
                  const up = h.prev_rate != null && h.rate > h.prev_rate;
                  const down = h.prev_rate != null && h.rate < h.prev_rate;
                  return (
                    <tr key={h.id} className="border-b border-brand/5">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(h.created_at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-1.5 pr-3">{h.series}</td>
                      <td className="py-1.5 pr-3">{h.color}</td>
                      <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                        {h.prev_rate != null && <span className="text-ink-3">{fmt(Number(h.prev_rate))} → </span>}
                        <b className={up ? "text-red-700" : down ? "text-green-700" : "text-brand-dark"}>{fmt(Number(h.rate))}</b>
                        {up && " ▲"}{down && " ▼"}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{h.item_count}</td>
                      <td className="py-1.5 pr-3">{h.changed_by_name || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RateRow({ g, value, busy, msg, canEdit, onChange, onApply }: {
  g: Group; value: string; busy: boolean; msg: { text: string; ok: boolean } | null; canEdit: boolean;
  onChange: (v: string) => void; onApply: () => void;
}) {
  const [show, setShow] = useState(false);
  const preview = Number(value) > 0 ? Number(value) : null;
  return (
    <>
      <tr className="border-b border-brand/5 align-top">
        <td className="py-2 pr-3">
          <button onClick={() => setShow((v) => !v)} className="font-semibold text-brand-dark underline decoration-dotted underline-offset-2">
            {g.color}
          </button>
          {msg && <div className={`text-[11px] mt-1 ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</div>}
        </td>
        <td className="py-2 pr-3 text-right">{g.items.length}</td>
        <td className="py-2 pr-3 text-right font-semibold">{g.rate > 0 ? fmt(g.rate) : "-"}</td>
        <td className="py-2 pr-3">
          {canEdit ? (
            <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
              placeholder={g.rate > 0 ? String(g.rate) : "฿/กก."}
              className="w-24 glass-soft rounded-lg px-2 py-1.5 text-sm outline-none" />
          ) : <span className="text-ink-3 text-xs">ดูอย่างเดียว</span>}
        </td>
        <td className="py-2 pr-3">
          {canEdit && (
            <button onClick={onApply} disabled={busy || !(Number(value) > 0)}
              className="press rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-brand shadow-brand disabled:opacity-40">
              {busy ? "กำลังอัปเดต…" : `อัปเดต ${g.items.length} เส้น`}
            </button>
          )}
        </td>
      </tr>
      {show && (
        <tr className="border-b border-brand/5">
          <td colSpan={5} className="pb-2">
            <div className="rounded-xl bg-brand/5 border border-brand/10 px-3 py-2 text-[12px] text-ink-2 grid sm:grid-cols-2 gap-x-4">
              {g.items.map((r) => (
                <div key={r.id} className="flex justify-between gap-2 py-0.5">
                  <span className="truncate">{r.sku} · {r.name}</span>
                  <span className="shrink-0">
                    {fmt(Number(r.weight_per_unit))} กก. → {fmt(Number(r.unit_cost))}฿
                    {preview && <b className="text-brand-dark"> ⇒ {fmt(round2(Number(r.weight_per_unit) * preview))}฿</b>}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
