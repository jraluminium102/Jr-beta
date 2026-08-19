"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { api } from "@/lib/api";
import { WEIGHT_STATUS_LABEL, type WeightRow, type WeightStatus } from "@/lib/calculator40/weight-backfill";

const TONE: Record<WeightStatus, "emerald" | "amber" | "red" | "gray"> = {
  fill: "red", differ: "amber", suspect: "gray", same: "emerald",
};
const n3 = (n: number) => (n > 0 ? Number(n).toLocaleString("th-TH", { maximumFractionDigits: 3 }) : "—");

export default function WeightBackfillClient({ rows, counts, stockCount }: {
  rows: WeightRow[];
  counts: Record<WeightStatus, number>;
  stockCount: number;
}) {
  const router = useRouter();
  // ค่าตั้งต้น: ติ๊กเฉพาะ "ยังไม่มีน้ำหนัก" — ตัวที่มีอยู่แล้วต้องกดเลือกเอง (กันทับของที่ตั้งมือไว้)
  const [sel, setSel] = useState<Set<number>>(() => new Set(rows.filter((r) => r.status === "fill").map((r) => r.id)));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return kw ? rows.filter((r) => `${r.sku} ${r.name} ${r.color}`.toLowerCase().includes(kw)) : rows;
  }, [rows, q]);

  const canPick = (r: WeightRow) => r.status === "fill" || r.status === "differ";
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pickAll = (st: WeightStatus) => setSel((s) => {
    const n = new Set(s);
    const ids = shown.filter((r) => r.status === st).map((r) => r.id);
    const allOn = ids.every((i) => n.has(i));
    ids.forEach((i) => (allOn ? n.delete(i) : n.add(i)));
    return n;
  });

  async function save() {
    setBusy(true); setMsg(null); setErr(null);
    const res = await api<{ updated: number; skipped: number; note?: string; warns?: string[] }>(
      "/stock/weights", { method: "POST", body: JSON.stringify({ ids: [...sel] }) },
    ).catch((e) => { setErr(String(e?.message || e)); return null; });
    setBusy(false);
    if (!res) return;
    const d = res.data;
    setMsg(`เติมน้ำหนักแล้ว ${d.updated.toLocaleString("th-TH")} รายการ${d.skipped ? ` · ข้าม ${d.skipped}` : ""}${d.note ? ` — ${d.note}` : ""}`);
    if (d.warns?.length) setErr(d.warns.join(" · "));
    router.refresh();
  }

  const pickable = rows.filter(canPick).length;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-bold text-brand-dark">⚖️ เติมน้ำหนักเส้นอลูเข้าสโตร์</h1>
          <Link href="/stock" className="text-xs text-brand underline">← กลับสโตร์</Link>
          <Link href="/calculator40/stock-audit" className="text-xs text-brand underline">ตรวจผูกสโตร์</Link>
          <span className="ml-auto text-xs text-ink-3">สโตร์ {stockCount.toLocaleString("th-TH")} รายการ</span>
        </div>
        <p className="mt-1 text-xs text-ink-3">
          สโตร์คิด <b>ราคา/เส้น = น้ำหนัก/เส้น × เรตต่อโล</b> — เส้นที่ยังไม่มีน้ำหนัก
          กดเปลี่ยนเรตต่อโลยังไงราคาก็ไม่ขยับ หน้านี้เติมน้ำหนักจากไฟล์ถอดทุน (ชีต &quot;น้ำหนักโปรไฟล์&quot; = ชั่งจริง)
        </p>
        <p className="mt-1 text-xs text-ink-3">
          ⓘ หน้านี้ <b>เติมน้ำหนักอย่างเดียว ไม่แตะราคา</b> — พอเติมเสร็จค่อยไปกด &quot;ตั้งเรตต่อโล&quot; ที่หน้าเรตอลู
          ราคาถึงจะคิดใหม่พร้อมลงประวัติราคาให้ครบ
        </p>

        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {(["fill", "differ", "suspect", "same"] as const).map((k) => (
            <button key={k} type="button" disabled={k === "suspect" || k === "same"}
              onClick={() => pickAll(k)}
              className={`press rounded-xl px-3 py-1.5 text-xs font-semibold ${k === "suspect" || k === "same" ? "glass-soft text-ink-3 cursor-default" : "glass-soft text-ink-2"}`}>
              <Badge tone={TONE[k]}>{WEIGHT_STATUS_LABEL[k]} {counts[k]}</Badge>
            </button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส/ชื่อ/สี"
            className="ml-auto glass-soft rounded-lg px-3 py-2 text-sm outline-none min-w-[180px]" />
        </div>

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={save} disabled={busy || !sel.size}
            className="press rounded-xl px-4 py-2.5 text-sm font-bold bg-brand text-white shadow-brand disabled:opacity-40">
            {busy ? "กำลังเติม…" : `เติมน้ำหนัก ${sel.size.toLocaleString("th-TH")} รายการ`}
          </button>
          <span className="text-xs text-ink-3">เลือกได้ {pickable.toLocaleString("th-TH")} รายการ (ตัวที่ตรงแล้ว/ยังไม่ชัวร์ เลือกไม่ได้)</span>
        </div>
        {msg && <p className="mt-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ {msg}</p>}
        {err && <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      </Card>

      <Card className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-brand-soft text-brand-dark">
                <th className="p-2 rounded-l-lg w-10"></th>
                <th>รหัส</th><th>ชื่อ</th><th>สี</th>
                <th className="text-right">น้ำหนักในสโตร์</th>
                <th className="text-right">จากไฟล์</th>
                <th className="text-right">เรต ฿/กก.</th>
                <th className="text-right">ราคา/เส้น</th>
                <th className="p-2 rounded-r-lg">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-line/60">
                  <td className="p-2">
                    <input type="checkbox" disabled={!canPick(r)} checked={sel.has(r.id)}
                      onChange={() => toggle(r.id)} className="w-4 h-4" />
                  </td>
                  <td className="font-mono text-xs">{r.sku}</td>
                  <td className="text-xs">{r.name}</td>
                  <td className="text-xs">{r.color || "—"}</td>
                  <td className="px-2 text-right tabular-nums">{n3(r.current)}</td>
                  <td className="px-2 text-right tabular-nums font-semibold">{n3(r.fromFile)}</td>
                  <td className="px-2 text-right tabular-nums text-ink-3">{n3(r.ratePerKg)}</td>
                  <td className="px-2 text-right tabular-nums text-ink-3">{n3(r.unitCost)}</td>
                  <td className="p-2"><Badge tone={TONE[r.status]}>{WEIGHT_STATUS_LABEL[r.status]}</Badge></td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={9} className="p-4 text-center text-ink-3">ไม่มีเส้นอลูในสโตร์ที่รหัสตรงกับไฟล์ถอดทุน</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
