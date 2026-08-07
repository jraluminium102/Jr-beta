"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

type Matched = { id: number; sku: string; name: string; color: string; oldQty: number; newQty: number; changed: boolean; ambiguous: boolean };
type Row = { sku: string; name: string; qty: number };
type Summary = { total: number; matched: number; changed: number; unmatched: number; ambiguous: number };
type Preview = { summary: Summary; matched: Matched[]; unmatched: Row[] };

// อ่าน CSV: คอลัมน์ 1=รหัส(sku) · 2=ชื่อ · 4=จำนวนนับจริง (คนกรอกที่ช่อง "จำนวนในระบบ" ตามที่เจ้าของยืนยัน)
function parseCsv(text: string): Row[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {           // ข้ามหัวตาราง
    const c = lines[i].split(",");
    const sku = (c[0] ?? "").trim();
    const name = (c[1] ?? "").trim();
    const qty = Number((c[3] ?? "").trim());          // คอลัมน์ D (index 3) = จำนวนนับจริง
    if (sku && Number.isFinite(qty) && qty >= 0) out.push({ sku, name, qty });
  }
  return out;
}

export default function StockCountImportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);
  const [error, setError] = useState("");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setPreview(null); setApplied(null); setError("");
    const reader = new FileReader();
    reader.onload = () => setRows(parseCsv(String(reader.result ?? "")));
    reader.readAsText(f, "utf-8");
  }

  async function doPreview() {
    setBusy(true); setError(""); setApplied(null);
    try {
      const res = await fetch("/api/stock/count-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", rows }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "ดูตัวอย่างไม่สำเร็จ"); return; }
      setPreview(j.data);
    } catch { setError("เชื่อมต่อไม่ได้"); } finally { setBusy(false); }
  }

  async function doApply() {
    if (!preview) return;
    if (!confirm(`ยืนยันตั้งจำนวนสต็อกใหม่ ${preview.summary.changed} รายการตามที่นับ? (บันทึกเป็นความเคลื่อนไหว "นับสต็อก" ย้อนดูได้)`)) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/stock/count-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply", rows }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "ปรับสต็อกไม่สำเร็จ"); return; }
      setApplied(j.data.applied ?? 0);
      setPreview((p) => p ? { ...p, matched: p.matched.map((m) => ({ ...m, oldQty: m.newQty, changed: false })) } : p);
    } catch { setError("เชื่อมต่อไม่ได้"); } finally { setBusy(false); }
  }

  const changed = preview?.matched.filter((m) => m.changed) ?? [];

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <Link href="/stock" className="press inline-flex items-center gap-1.5 text-sm text-ink-2 mb-4">
        <Icon name="arrowLeft" size={16} /> กลับหน้าสต็อก
      </Link>
      <h1 className="text-xl font-bold text-ink mb-1 flex items-center gap-2"><Icon name="clipboard" size={20} /> นำเข้านับสต็อก (อลูมิเนียม)</h1>
      <p className="text-sm text-ink-3 mb-5">อัปโหลดไฟล์ CSV นับสต็อก → ดูตัวอย่างการเปลี่ยนแปลง → ยืนยันตั้งจำนวนตามที่นับจริง (ตั้งเป็นความเคลื่อนไหว &quot;นับสต็อก&quot; ย้อนดูได้ · ต้นทุนไม่เปลี่ยน)</p>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-500">ไฟล์ CSV (คอลัมน์ D = จำนวนนับจริง)</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-white file:font-semibold" />
        </label>
        {fileName && <div className="text-xs text-gray-500">{fileName} — อ่านได้ <b>{rows.length}</b> แถว</div>}
        <button onClick={doPreview} disabled={busy || rows.length === 0}
          className="press inline-flex items-center gap-1.5 rounded-xl bg-brand text-white px-4 py-2.5 text-sm font-semibold shadow-brand disabled:opacity-40 min-h-[44px]">
          {busy && !applied ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Icon name="search" size={16} />} ดูตัวอย่างการเปลี่ยนแปลง
        </button>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {preview && (
        <div className="mt-5 space-y-4">
          {/* สรุป */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "ทั้งหมด", v: preview.summary.total, c: "text-ink" },
              { label: "จับคู่ได้", v: preview.summary.matched, c: "text-emerald-700" },
              { label: "จำนวนเปลี่ยน", v: preview.summary.changed, c: "text-amber-700" },
              { label: "จับคู่ไม่ได้", v: preview.summary.unmatched, c: "text-red-700" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-black/10 bg-white p-3 text-center shadow-sm">
                <div className={`text-2xl font-bold tabular-nums ${s.c}`}>{s.v}</div>
                <div className="text-[11px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {applied != null ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm font-medium">
              ✓ ปรับสต็อกแล้ว {applied} รายการ ตามจำนวนที่นับจริง
            </div>
          ) : changed.length > 0 ? (
            <button onClick={doApply} disabled={busy}
              className="press inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40 min-h-[44px]">
              {busy ? <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Icon name="check" size={16} />} ยืนยันตั้งจำนวนใหม่ {changed.length} รายการ
            </button>
          ) : (
            <div className="text-sm text-gray-500">— ไม่มีจำนวนที่ต่างจากระบบ ไม่ต้องปรับ —</div>
          )}

          {/* รายการที่จะเปลี่ยน */}
          {changed.length > 0 && (
            <div className="rounded-2xl border border-black/10 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 text-sm font-bold text-ink border-b border-black/10">รายการที่จำนวนเปลี่ยน ({changed.length})</div>
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500 text-xs">
                    <tr><th className="text-left px-3 py-2">รหัส</th><th className="text-left px-3 py-2">ชื่อ / สี</th><th className="text-right px-3 py-2">เดิม</th><th className="text-right px-3 py-2">ใหม่</th></tr>
                  </thead>
                  <tbody>
                    {changed.map((m) => (
                      <tr key={m.id} className="border-t border-black/5">
                        <td className="px-3 py-1.5 font-mono text-xs">{m.sku}</td>
                        <td className="px-3 py-1.5">{m.name}{m.color ? <span className="text-gray-400"> · {m.color}</span> : ""}{m.ambiguous && <span className="ml-1 text-[10px] text-amber-600">(กำกวม)</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{m.oldQty}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${m.newQty > m.oldQty ? "text-emerald-700" : "text-red-700"}`}>{m.newQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* จับคู่ไม่ได้ */}
          {preview.unmatched.length > 0 && (
            <details className="rounded-2xl border border-red-200 bg-red-50/50 shadow-sm">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold text-red-700">จับคู่ไม่ได้ ({preview.unmatched.length}) — ไม่ถูกปรับ</summary>
              <div className="max-h-[300px] overflow-y-auto px-4 pb-3">
                {preview.unmatched.map((u, i) => (
                  <div key={i} className="text-xs text-gray-600 py-0.5"><span className="font-mono">{u.sku}</span> · {u.name} · นับ {u.qty}</div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
