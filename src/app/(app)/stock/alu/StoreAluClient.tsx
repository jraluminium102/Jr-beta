"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import PickList, { Thumb } from "@/components/alu-pick/PickList";
import PickFlow from "@/components/alu-pick/PickFlow";
import AluSummary from "./AluSummary";
import { fmtQty, type Pick, type PickableItem } from "@/components/alu-pick/types";

/**
 * สโตร์อลู — 4 มุม (เจ้าของเคาะ 19 ต.ค.69)
 *   ① เบิกวันนี้: ใบที่ช่างกดเอง เรียงเวลา · ปุ่ม "ตรวจแล้ว" · แก้/คืน/ยกเลิกแทนช่างได้
 *   ② นับเฉพาะที่เคลื่อนไหว: เส้นอลูที่มีการเบิก/รับ/ปรับในช่วงวัน → กรอกนับจริง → "ปรับให้ตรง" (adjust + เหตุผล)
 *   ③ ใกล้หมด: อลูที่คงเหลือ ≤ จุดเตือน
 *   ④ เบิกแทนช่าง: ฟอร์มเดียวกับมือถือช่าง (กรณีช่างไม่ได้กดเอง สโตร์กดให้ ใส่ชื่อช่าง)
 */
const thaiToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 86400 * 1000).toISOString().slice(0, 10);

type LedgerRow = { id: number; at: string; type: "in" | "out" | "adjust"; sid: number | null; onHand: number; sku: string | null; name: string; category: string; unit: string; qty: number; who: string; note: string; ref: string; customer: string | null };

export default function StoreAluClient({ canWrite, myName }: { canWrite: boolean; myName: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"picks" | "summary" | "count" | "low" | "new">("picks");
  const [from, setFrom] = useState(thaiToday());
  const [to, setTo] = useState(thaiToday());
  const [onlyOpen, setOnlyOpen] = useState(false);

  // ช่างกดเบิกจากมือถือ → หน้าสโตร์ที่เปิดค้างต้องเห็นเอง (ดึงใหม่ทุก 1 นาที + ตอนกลับมาที่แท็บ)
  const picksQ = useQuery({ queryKey: ["alu-picks", from, to], queryFn: () => api.get<Pick[]>(`/alu-picks?from=${from}&to=${to}`), refetchInterval: 60 * 1000, refetchOnWindowFocus: true });
  const picks = picksQ.data?.data ?? [];
  const shownPicks = onlyOpen ? picks.filter((p) => p.status === "open") : picks;
  const openCount = picks.filter((p) => p.status === "open").length;
  const refresh = () => { qc.invalidateQueries({ queryKey: ["alu-picks"] }); qc.invalidateQueries({ queryKey: ["alu-ledger"] }); qc.invalidateQueries({ queryKey: ["alu-pick-items"] }); };

  const range = (
    <div className="flex items-center gap-2 flex-wrap">
      {[["วันนี้", 0], ["เมื่อวาน", -1]].map(([l, n]) => (
        <button key={String(l)} onClick={() => { const d = addDays(thaiToday(), Number(n)); setFrom(d); setTo(d); }}
          className={`press rounded-full px-3 py-1.5 text-xs font-semibold ${from === addDays(thaiToday(), Number(n)) && to === from ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>{l}</button>
      ))}
      <button onClick={() => { setFrom(addDays(thaiToday(), -6)); setTo(thaiToday()); }} className={`press rounded-full px-3 py-1.5 text-xs font-semibold ${from === addDays(thaiToday(), -6) && to === thaiToday() ? "bg-brand text-white" : "glass-soft text-ink-2"}`}>7 วัน</button>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="glass-soft rounded-lg px-2 py-1.5 text-sm" />
      <span className="text-ink-3 text-sm">ถึง</span>
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="glass-soft rounded-lg px-2 py-1.5 text-sm" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark">📦 สโตร์อลู</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <PickLinkButton />
          <a href="/stock" className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-dark border border-brand/30 bg-white/60">← เช็คสต๊อกวัสดุ</a>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {([["picks", `ใบเบิกของช่าง${openCount ? ` (รอตรวจ ${openCount})` : ""}`], ["summary", "สรุปคงเหลือ"], ["count", "นับเฉพาะที่เคลื่อนไหว"], ["low", "ใกล้หมด"], ["new", "เบิกแทนช่าง"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`press rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === k ? "bg-brand text-white shadow-brand" : "glass-soft text-ink-2"}`}>{l}</button>
        ))}
      </div>

      {tab === "picks" && (
        <div className="space-y-3">
          <div className="glass-card rounded-2xl p-3 space-y-2">
            {range}
            <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> เฉพาะที่ยังไม่ตรวจ</label>
            <p className="text-xs text-ink-3">ช่างกดเบิกจากมือถือ = ตัดสต็อกแล้ว · สโตร์เดินนับเฉพาะเส้นในใบ แล้วกด "ตรวจแล้ว" · ตัวเลขไม่ตรงกด "แก้จำนวน" ได้เลย (เก็บประวัติว่าใครแก้)</p>
          </div>
          {picksQ.isLoading ? <p className="text-center py-10 text-ink-3">กำลังโหลด…</p>
            : <PickList picks={shownPicks} isChang={false} canCheck={canWrite} onChanged={refresh} emptyText="ไม่มีใบเบิกในช่วงนี้" />}
        </div>
      )}

      {tab === "summary" && <AluSummary canWrite={canWrite} />}
      {tab === "count" && <CountTab from={from} to={to} range={range} canWrite={canWrite} />}
      {tab === "low" && <LowTab />}
      {tab === "new" && (
        <div className="glass-card rounded-2xl p-2 max-w-[640px]">
          <p className="text-xs text-ink-3 px-3 pt-2">เบิกแทนช่าง — เลือกชื่อช่างที่หยิบของจริง (ไม่ใช่ชื่อสโตร์) ระบบจะบันทึกว่าสโตร์ {myName} เป็นคนกด</p>
          <PickFlow isChang={false} />
        </div>
      )}
    </div>
  );
}

/** ลิงก์หน้าเบิกอลูของช่าง (ไม่ต้องล็อกอิน) — กดคัดลอกแล้ววางส่งในไลน์กลุ่มช่าง (เจ้าของขอ 20 ต.ค.69) */
function PickLinkButton() {
  const [msg, setMsg] = useState("");
  async function copy() {
    setMsg("");
    try {
      const r = await fetch("/api/chang-open?to=pick&format=json", { credentials: "include" });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || "ไม่พบลิงก์ช่าง");
      try { await navigator.clipboard.writeText(j.url); setMsg("คัดลอกแล้ว — วางส่งช่างได้เลย"); }
      catch { window.prompt("คัดลอกลิงก์นี้ส่งช่าง:", j.url); }
    } catch (e) { setMsg(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={copy} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">🔗 คัดลอกลิงก์เบิกอลูของช่าง</button>
      <a href="/api/chang-open?to=pick" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-dark underline">เปิดดู</a>
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
    </span>
  );
}

/** ② นับเฉพาะที่เคลื่อนไหว — จากสมุดสโตร์ในช่วงวัน กรองหมวดอลู → รวมต่อเส้น */
function CountTab({ from, to, range, canWrite }: { from: string; to: string; range: React.ReactNode; canWrite: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["alu-ledger", from, to], queryFn: () => api.get<{ rows: LedgerRow[] }>(`/stock/ledger?from=${from}&to=${to}`) });
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());

  const items = useMemo(() => {
    const m = new Map<number, { sid: number; sku: string; name: string; unit: string; onHand: number; out: number; inn: number; adj: number; who: Set<string> }>();
    for (const r of q.data?.data.rows ?? []) {
      if (!r.sid || !/อลู/.test(r.category)) continue;
      const g = m.get(r.sid) ?? { sid: r.sid, sku: r.sku ?? "", name: r.name, unit: r.unit, onHand: r.onHand, out: 0, inn: 0, adj: 0, who: new Set<string>() };
      if (r.type === "out") g.out += r.qty; else if (r.type === "in") g.inn += r.qty; else g.adj += 1;
      if (r.who) g.who.add(r.who);
      m.set(r.sid, g);
    }
    return [...m.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [q.data]);

  async function adjust(it: (typeof items)[number]) {
    const v = Number(counts[it.sid]);
    if (!Number.isFinite(v) || counts[it.sid] === undefined || counts[it.sid] === "") return;
    if (v < 0) { setMsg({ ...msg, [it.sid]: "นับได้ต้องเป็น 0 ขึ้นไป" }); return; }
    if (v === it.onHand) { setDoneIds(new Set([...doneIds, it.sid])); setMsg({ ...msg, [it.sid]: "ตรงกัน ✓" }); return; }
    const reason = window.prompt(`นับได้ ${v} ระบบมี ${fmtQty(it.onHand)} — ต่างกัน ${fmtQty(v - it.onHand)} เส้น\nเหตุผล (เช่น ช่างกดจำนวนผิด / เศษเส้นหัก):`, "");
    if (reason === null) return;
    setBusy(it.sid);
    try {
      await api.post(`/stock/${it.sid}/move`, { type: "adjust", qty: v, ref: "นับสโตร์อลู", note: `เดิม ${fmtQty(it.onHand)} → ${v}${reason ? " · " + reason : ""}` });
      setDoneIds(new Set([...doneIds, it.sid])); setMsg({ ...msg, [it.sid]: `ปรับเป็น ${v} แล้ว` });
      qc.invalidateQueries({ queryKey: ["alu-ledger"] }); qc.invalidateQueries({ queryKey: ["alu-pick-items"] });
    } catch (e) { setMsg({ ...msg, [it.sid]: e instanceof Error ? e.message : "ไม่สำเร็จ" }); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-3">
      <div className="glass-card rounded-2xl p-3 space-y-2">
        {range}
        <p className="text-xs text-ink-3">เส้นอลูที่มีการเบิก/รับ/ปรับในช่วงนี้ — เดินไปนับแค่พวกนี้ กรอกที่นับได้ แล้วกด "ปรับให้ตรง" (ตรงกันอยู่แล้วกดก็ได้ = ติ๊กว่านับแล้ว)</p>
      </div>
      {q.isLoading ? <p className="text-center py-10 text-ink-3">กำลังโหลด…</p>
        : items.length === 0 ? <p className="text-center py-10 text-ink-3">ช่วงนี้ไม่มีเส้นอลูเคลื่อนไหว</p>
          : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs text-ink-3 bg-black/[0.03]"><tr>
                  <th className="text-left px-3 py-2">เส้น</th><th className="text-right px-2 py-2">เบิกออก</th><th className="text-right px-2 py-2">รับ/คืน</th><th className="text-right px-2 py-2">ระบบมี</th><th className="text-right px-2 py-2 w-[140px]">นับได้</th><th className="px-2 py-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-black/5">
                  {items.map((it) => (
                    <tr key={it.sid} className={doneIds.has(it.sid) ? "bg-emerald-50/60" : ""}>
                      <td className="px-3 py-2"><div className="font-semibold text-ink-1">{it.name}</div><div className="text-xs text-ink-3">{it.sku}{it.who.size ? ` · ${[...it.who].join(", ")}` : ""}{it.adj ? " · มีปรับยอด" : ""}</div></td>
                      <td className="px-2 py-2 text-right tabular-nums">{it.out ? fmtQty(it.out) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{it.inn ? fmtQty(it.inn) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-bold">{fmtQty(it.onHand)}</td>
                      <td className="px-2 py-2 text-right">
                        <input inputMode="decimal" value={counts[it.sid] ?? ""} onChange={(e) => setCounts({ ...counts, [it.sid]: e.target.value })} placeholder={fmtQty(it.onHand)}
                          className="w-[90px] glass-soft rounded-lg px-2 py-1.5 text-right tabular-nums outline-none" disabled={!canWrite} />
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        {canWrite && <button disabled={busy === it.sid} onClick={() => adjust(it)} className="press rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-brand disabled:opacity-50">ปรับให้ตรง</button>}
                        {msg[it.sid] && <div className="text-[11px] mt-1 text-ink-2">{msg[it.sid]}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}

/** ③ ใกล้หมด — จากรายการเส้นที่เบิกได้ (ไม่มีราคา) */
function LowTab() {
  const q = useQuery({ queryKey: ["alu-pick-items"], queryFn: () => api.get<{ items: PickableItem[] }>("/alu-picks/items"), staleTime: 5 * 60 * 1000 });
  const rows = (q.data?.data.items ?? []).filter((i) => i.min_qty > 0 && i.qty <= i.min_qty).sort((a, b) => (a.qty - a.min_qty) - (b.qty - b.min_qty));
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-3">เส้นอลูที่คงเหลือ ≤ จุดเตือนขั้นต่ำ (ตั้งจุดเตือนได้ที่หน้าเช็คสต๊อกวัสดุ)</p>
      {q.isLoading ? <p className="text-center py-10 text-ink-3">กำลังโหลด…</p>
        : rows.length === 0 ? <p className="text-center py-10 text-ink-3">ไม่มีเส้นใกล้หมด</p>
          : (
            <div className="glass-card rounded-2xl divide-y divide-black/5">
              {rows.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <Thumb url={i.image_url} size={40} />
                  <div className="min-w-0 flex-1"><div className="font-semibold text-ink-1 truncate">{i.name}</div><div className="text-xs text-ink-3">{i.sku}</div></div>
                  <div className="text-right"><div className={`font-bold tabular-nums ${i.qty <= 0 ? "text-red-600" : "text-amber-700"}`}>{fmtQty(i.qty)} {i.unit}</div><div className="text-[11px] text-ink-3">เตือนที่ {fmtQty(i.min_qty)}</div></div>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}
