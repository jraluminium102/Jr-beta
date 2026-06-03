"use client";

import { useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";
import type { StockItem, StockMove, StockMoveType } from "@/lib/types";

const EMPTY = { name: "", sku: "", category: "", unit: "เส้น", min_qty: "", qty_on_hand: "" };

const MOVE_LABEL: Record<StockMoveType, string> = { in: "รับเข้า", out: "จ่ายออก", adjust: "ปรับยอด" };
const MOVE_TONE: Record<StockMoveType, "emerald" | "red" | "amber"> = { in: "emerald", out: "red", adjust: "amber" };

const isLow = (it: StockItem) => Number(it.qty_on_hand) <= Number(it.min_qty);

export default function StockClient({ initial, canWrite }: { initial: StockItem[]; canWrite: boolean }) {
  const [list, setList] = useState<StockItem[]>(initial);
  const [sel, setSel] = useState<StockItem | null>(initial[0] ?? null);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ฟอร์มบันทึกเคลื่อนไหว
  const [mvType, setMvType] = useState<StockMoveType>("in");
  const [mvQty, setMvQty] = useState("");
  const [mvRef, setMvRef] = useState("");
  const [mvNote, setMvNote] = useState("");
  const [mvBusy, setMvBusy] = useState(false);
  const [mvErr, setMvErr] = useState("");

  const filtered = list.filter((c) =>
    [c.name, c.sku, c.category].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  async function selectItem(it: StockItem) {
    setSel(it); setAdding(false);
    setMvErr(""); setMvQty(""); setMvRef(""); setMvNote(""); setMvType("in");
    const res = await fetch(`/api/stock/${it.id}`);
    const json = await res.json();
    if (res.ok) {
      setMoves((json.data?.stock_moves ?? []) as StockMove[]);
      // sync ค่าคงเหลือล่าสุดจาก server
      const fresh = { ...it, qty_on_hand: json.data.qty_on_hand, min_qty: json.data.min_qty };
      setSel(fresh);
      setList((l) => l.map((x) => (x.id === fresh.id ? fresh : x)));
    } else {
      setMoves([]);
    }
  }

  async function save() {
    if (!form.name.trim()) { setErr("ต้องระบุชื่อวัสดุ"); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/stock", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, sku: form.sku, category: form.category, unit: form.unit,
        min_qty: Number(form.min_qty) || 0, qty_on_hand: Number(form.qty_on_hand) || 0,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    setList([json.data, ...list]);
    setSel(json.data); setMoves([]);
    setAdding(false); setForm(EMPTY);
  }

  async function submitMove() {
    if (!sel) return;
    const qty = Number(mvQty);
    if (!Number.isFinite(qty) || qty === 0) { setMvErr("ต้องระบุจำนวน"); return; }
    setMvBusy(true); setMvErr("");
    const res = await fetch(`/api/stock/${sel.id}/move`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: mvType, qty, ref: mvRef, note: mvNote }),
    });
    const json = await res.json();
    setMvBusy(false);
    if (!res.ok) { setMvErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    setMvQty(""); setMvRef(""); setMvNote("");
    await selectItem(sel); // refresh คงเหลือ + ประวัติ
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
          <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
            <Icon name="boxes" size={18} />
          </span>
          เช็คสต๊อกวัสดุ
        </h1>
        {canWrite && (
          <button onClick={() => { setAdding(true); setSel(null); setErr(""); setForm(EMPTY); }} className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
            <Icon name="plus" size={16} /> เพิ่มวัสดุใหม่
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-1">
          <label className="relative block mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><Icon name="search" size={16} /></span>
            <input aria-label="ค้นหาวัสดุ" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อ / SKU / หมวด"
              className="w-full glass-soft rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none" />
          </label>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {filtered.map((c) => {
              const low = isLow(c);
              const active = sel?.id === c.id;
              return (
                <button key={c.id} onClick={() => selectItem(c)} aria-current={active}
                  className={`press w-full text-left rounded-xl px-3 py-2.5 ${active ? "text-white bg-brand shadow-brand" : "glass-soft hover:bg-white/70"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    {low && !active && <Badge tone="red" dot>ใกล้หมด</Badge>}
                    {low && active && <span className="text-xs font-semibold bg-white/25 rounded-full px-2 py-0.5">ใกล้หมด</span>}
                  </div>
                  <div className={`text-xs mt-0.5 ${active ? "text-red-50" : "text-ink-3"}`}>
                    คงเหลือ {baht(c.qty_on_hand)} {c.unit || ""}
                    {c.category ? ` · ${c.category}` : ""}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-ink-3 text-center py-4">ไม่พบวัสดุ</p>}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          {adding ? (
            <div>
              <h3 className="text-lg font-bold text-brand-dark mb-4">เพิ่มวัสดุใหม่</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <FormField label="ชื่อวัสดุ *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} wide />
                <FormField label="SKU/รหัส" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} />
                <FormField label="หมวด (เส้นอลู/กระจก/อุปกรณ์)" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
                <FormField label="หน่วย" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} />
                <FormField label="จุดเตือนขั้นต่ำ" value={form.min_qty} onChange={(v) => setForm({ ...form, min_qty: v })} type="number" />
                <FormField label="ยอดยกมา (คงเหลือเริ่มต้น)" value={form.qty_on_hand} onChange={(v) => setForm({ ...form, qty_on_hand: v })} type="number" wide />
              </div>
              {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}
              <div className="flex gap-2 mt-4">
                <button onClick={save} disabled={busy} className="press rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                  {busy ? "กำลังบันทึก…" : "บันทึก"}
                </button>
                <button onClick={() => { setAdding(false); setErr(""); }} className="press glass-soft rounded-xl px-5 py-2.5 text-sm text-ink-2">ยกเลิก</button>
              </div>
            </div>
          ) : sel ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-brand-dark">{sel.name}</h3>
                  <p className="text-sm text-ink-3">{sel.category || "—"}{sel.sku ? ` · ${sel.sku}` : ""}</p>
                </div>
                {isLow(sel) ? <Badge tone="red" dot>ต่ำกว่าขั้นต่ำ — สั่งเพิ่ม</Badge> : <Badge tone="emerald" dot>คงเหลือปกติ</Badge>}
              </div>

              {/* คงเหลือเด่นชัด */}
              <div className={`mt-4 rounded-2xl px-5 py-4 flex items-end justify-between ${isLow(sel) ? "bg-red-50" : "glass-soft"}`}>
                <div>
                  <div className="text-xs font-medium text-ink-3">คงเหลือในคลัง</div>
                  <div className={`text-3xl font-bold leading-tight ${isLow(sel) ? "text-red-700" : "text-brand-dark"}`}>
                    {baht(sel.qty_on_hand)} <span className="text-base font-semibold text-ink-3">{sel.unit}</span>
                  </div>
                </div>
                <div className="text-right text-xs text-ink-3">จุดเตือนขั้นต่ำ<br /><span className="text-sm font-semibold text-ink-2">{baht(sel.min_qty)} {sel.unit}</span></div>
              </div>

              {/* ฟอร์มเคลื่อนไหว */}
              {canWrite && (
                <div className="mt-5">
                  <div className="text-sm font-semibold text-brand-dark mb-2">บันทึกความเคลื่อนไหว</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <label className="block">
                      <span className="text-xs font-medium text-ink-3">ประเภท</span>
                      <select value={mvType} onChange={(e) => setMvType(e.target.value as StockMoveType)}
                        className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none">
                        <option value="in">รับเข้า (+)</option>
                        <option value="out">จ่ายออก (−)</option>
                        <option value="adjust">ปรับยอด (ตั้งค่าคงเหลือใหม่)</option>
                      </select>
                    </label>
                    <FormField label={mvType === "adjust" ? "คงเหลือใหม่" : "จำนวน"} value={mvQty} onChange={setMvQty} type="number" />
                    <FormField label="อ้างอิง (งาน/PO)" value={mvRef} onChange={setMvRef} />
                    <FormField label="หมายเหตุ" value={mvNote} onChange={setMvNote} />
                  </div>
                  {mvErr && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{mvErr}</p>}
                  <button onClick={submitMove} disabled={mvBusy} className="press mt-3 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                    {mvBusy ? "กำลังบันทึก…" : "บันทึก"}
                  </button>
                </div>
              )}

              {/* ประวัติเคลื่อนไหว */}
              <div className="mt-6">
                <div className="text-sm font-semibold text-brand-dark mb-2">ประวัติความเคลื่อนไหวล่าสุด</div>
                {moves.length === 0 ? (
                  <p className="text-sm text-ink-3 glass-soft rounded-xl px-3 py-3">ยังไม่มีการเคลื่อนไหว</p>
                ) : (
                  <div className="overflow-x-auto glass-soft rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-ink-3 text-xs border-b border-black/5">
                          <th className="px-3 py-2 font-medium">วันที่</th>
                          <th className="px-3 py-2 font-medium">ประเภท</th>
                          <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                          <th className="px-3 py-2 font-medium">อ้างอิง</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moves.map((m) => (
                          <tr key={m.id} className="border-b border-black/5 last:border-0">
                            <td className="px-3 py-2 text-ink-2 whitespace-nowrap">{new Date(m.created_at).toLocaleDateString("th-TH")}</td>
                            <td className="px-3 py-2"><Badge tone={MOVE_TONE[m.type]}>{MOVE_LABEL[m.type]}</Badge></td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums">
                              {m.type === "out" ? "−" : m.type === "in" ? "+" : "="}{baht(m.qty)}
                            </td>
                            <td className="px-3 py-2 text-ink-2">{m.ref || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-ink-3 text-center py-10">เลือกวัสดุทางซ้าย หรือเพิ่มใหม่</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, wide, type = "text" }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; type?: string }) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2 mt-1 outline-none" />
    </label>
  );
}
