"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";

type Plan = { total: number; existing: number; toInsert: number };

export default function ImportClient() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [prog, setProg] = useState({ offset: 0, inserted: 0, skipped: 0, failed: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  async function loadPlan() {
    const res = await fetch("/api/stock/import-images", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "plan" }),
    });
    const j = await res.json().catch(() => null);
    if (j?.data) setPlan(j.data);
  }
  useEffect(() => { loadPlan(); }, []);

  async function run() {
    setRunning(true); setDone(false);
    setProg({ offset: 0, inserted: 0, skipped: 0, failed: 0 }); setErrors([]);
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch("/api/stock/import-images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "run", offset, limit: 12 }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.data) { setErrors((e) => [...e, j?.error ?? "หยุดกลางคัน"]); break; }
      const d = j.data;
      setProg((p) => ({ offset: d.nextOffset, inserted: p.inserted + d.inserted, skipped: p.skipped + d.skipped, failed: p.failed + d.failed }));
      if (d.errors?.length) setErrors((e) => [...e, ...d.errors].slice(0, 20));
      offset = d.nextOffset;
      if (d.done) { setDone(true); break; }
    }
    setRunning(false);
    router.refresh();
    loadPlan();
  }

  const total = plan?.total ?? 1932;
  const pct = Math.min(100, Math.round((prog.offset / total) * 100));

  return (
    <div className="space-y-4">
      {plan && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl glass-soft p-3"><div className="text-2xl font-bold text-brand-dark">{plan.total}</div><div className="text-xs text-ink-3">ทั้งหมดในไฟล์</div></div>
          <div className="rounded-xl glass-soft p-3"><div className="text-2xl font-bold text-emerald-700">{plan.toInsert}</div><div className="text-xs text-ink-3">จะเพิ่มใหม่</div></div>
          <div className="rounded-xl glass-soft p-3"><div className="text-2xl font-bold text-ink-3">{plan.existing}</div><div className="text-xs text-ink-3">มีแล้ว (ข้าม)</div></div>
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        เพิ่มสินค้าจากไฟล์ Stock1: ชื่อ+หมวด+ราคา+จำนวน(ยอดยกมา)+รูป · อลูฯ/มือจับ/ฯลฯ แยกตามสี · น็อต = ต่อโล (ยังไม่ใส่ราคา) · <b>กดซ้ำได้ ไม่เพิ่มซ้ำ</b> (ข้ามชื่อที่มีแล้ว)
      </div>

      {(running || done || prog.offset > 0) && (
        <div className="space-y-1.5">
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-sm text-ink-2 flex flex-wrap gap-x-4 gap-y-0.5">
            <span>ความคืบหน้า {pct}% ({prog.offset}/{total})</span>
            <span className="text-emerald-700">เพิ่มแล้ว {prog.inserted}</span>
            <span className="text-ink-3">ข้าม {prog.skipped}</span>
            {prog.failed > 0 && <span className="text-red-700">พลาด {prog.failed}</span>}
            {done && <span className="text-emerald-700 font-semibold">✓ เสร็จสิ้น</span>}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={run} disabled={running}
          className="press bg-brand text-white rounded-xl px-5 py-2.5 text-sm font-semibold shadow-brand disabled:opacity-50 inline-flex items-center gap-2">
          {running && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          {running ? "กำลังนำเข้า…" : done ? "นำเข้าอีกครั้ง (เก็บตกที่พลาด)" : "เริ่มนำเข้าทั้งหมด"}
        </button>
        <Link href="/stock" className="press glass-soft rounded-xl px-4 py-2.5 text-sm font-medium inline-flex items-center gap-1.5">
          <Icon name="arrowLeft" size={16} /> กลับหน้าสต็อก
        </Link>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 space-y-0.5">
          <div className="font-semibold">ตัวที่มีปัญหา (โชว์บางส่วน):</div>
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      <p className="text-xs text-ink-3">
        ⚠ อย่าปิดหน้านี้ระหว่างนำเข้า (มันทยอยยิงเป็นชุด ~25 ตัว/ครั้ง จนครบ) · ถ้าหลุดกลางคัน กดใหม่ได้ มันจะข้ามตัวที่ลงแล้ว
      </p>
    </div>
  );
}
