"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import CANDIDATES from "./candidates.json";

type Cand = { stockId: number; name: string; price: string; cat: string; sheet: string; fileId: string; dup: boolean };
type Res = { ok: boolean; image_url?: string; error?: string };

const thumb = (fileId: string) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w120`;

export default function ImportClient() {
  const router = useRouter();
  const rows = CANDIDATES as Cand[];
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<number, Res>>({});

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allIds = rows.map((r) => r.stockId);
  const allOn = sel.size === rows.length;

  async function runImport() {
    const items = rows.filter((r) => sel.has(r.stockId)).map((r) => ({ stockId: r.stockId, fileId: r.fileId }));
    if (!items.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/stock/import-images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.data?.results) {
        const map: Record<number, Res> = {};
        for (const r of j.data.results) map[r.stockId] = r;
        setResults((prev) => ({ ...prev, ...map }));
        router.refresh();
      } else {
        alert(j?.error ?? "นำเข้าไม่สำเร็จ");
      }
    } finally {
      setBusy(false);
    }
  }

  const okCount = Object.values(results).filter((r) => r.ok).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-ink-3">
          จับคู่ด้วยโค้ด (F####/B####) จากไฟล์ Stock1 — {rows.length} รายการ · เลือกแล้ว <b>{sel.size}</b>
          {okCount > 0 && <span className="text-emerald-700"> · นำเข้าสำเร็จ {okCount}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSel(allOn ? new Set() : new Set(allIds))}
            className="press glass-soft rounded-xl px-3 py-2 text-sm font-medium">
            {allOn ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}
          </button>
          <button onClick={runImport} disabled={busy || sel.size === 0}
            className="press bg-brand text-white rounded-xl px-4 py-2 text-sm font-semibold shadow-brand disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            นำเข้าที่เลือก ({sel.size})
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        ⚠ ตัวที่ขึ้น <b>ซ้ำ</b> = ในสต็อกมี 2 แถวโค้ดเดียวกัน (เช่น ตัวถอดทุน + ตัวมี SKU) — เลือกใส่รูปได้ทั้งคู่ แต่ควรตัดสินใจรวมทีหลัง · รูปเป็น preview จาก Drive กดนำเข้าแล้วจะย้ายเข้าเว็บถาวร · <b>ราคาไม่เปลี่ยน</b>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left bg-brand-soft text-brand-dark">
              <th className="p-2 w-8"></th>
              <th className="p-2 w-16">รูป</th>
              <th className="p-2">สต็อกเดิม (คงราคา)</th>
              <th className="p-2 w-8"></th>
              <th className="p-2">รายการในชีต (ที่มาของรูป)</th>
              <th className="p-2 w-20">ผล</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const res = results[r.stockId];
              return (
                <tr key={r.stockId} className="border-b border-gray-100 align-middle">
                  <td className="p-2"><input type="checkbox" checked={sel.has(r.stockId)} onChange={() => toggle(r.stockId)} /></td>
                  <td className="p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(r.fileId)} alt="" className="w-12 h-12 object-cover rounded border border-gray-200 bg-gray-50" referrerPolicy="no-referrer" />
                  </td>
                  <td className="p-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-ink-3">#{r.stockId} · {r.cat || "—"} · ฿{r.price}{r.dup && <span className="ml-1 text-amber-700 font-semibold">· ซ้ำ</span>}</div>
                  </td>
                  <td className="p-2 text-ink-3">→</td>
                  <td className="p-2 text-ink-2">{r.sheet}</td>
                  <td className="p-2">
                    {res
                      ? (res.ok
                        ? <span className="text-emerald-700 inline-flex items-center gap-1"><Icon name="check" size={14} /> สำเร็จ</span>
                        : <span className="text-red-700 text-xs" title={res.error}>ล้มเหลว</span>)
                      : <span className="text-ink-3 text-xs">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Link href="/stock" className="press inline-flex items-center gap-1.5 text-sm text-ink-2">
        <Icon name="arrowLeft" size={16} /> กลับหน้าสต็อก
      </Link>
    </div>
  );
}
