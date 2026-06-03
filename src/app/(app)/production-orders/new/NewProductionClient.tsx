"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";

type Quote = { id: number; code: string; customer_snapshot: { name: string; job: string } };

export default function NewProductionClient({ quotations }: { quotations: Quote[] }) {
  const router = useRouter();
  const [quotationId, setQuotationId] = useState<number | "">(quotations[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!quotationId) {
      setErr("ต้องเลือกใบเสนอราคาที่อนุมัติแล้ว");
      return;
    }
    setErr("");
    setBusy(true);
    const res = await fetch("/api/production-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotation_id: quotationId, due_date: dueDate || null }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && json.data?.id) {
      router.push(`/production-orders/${json.data.id}`);
    } else {
      setErr(json.error || "สร้างใบสั่งผลิตไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/production-orders" aria-label="ย้อนกลับ" className="press glass-soft w-9 h-9 rounded-xl inline-flex items-center justify-center text-brand-dark">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <h1 className="text-xl font-bold text-brand-dark">สร้างใบสั่งผลิต</h1>
      </div>

      <Card className="p-6 space-y-5 max-w-xl">
        {quotations.length === 0 ? (
          <div className="text-center py-8 text-ink-3">
            <p>ยังไม่มีใบเสนอราคาที่อนุมัติแล้ว</p>
            <p className="text-xs mt-1">ต้องอนุมัติใบเสนอราคาก่อนจึงจะสั่งผลิตได้</p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-ink-3 mb-1 block">ใบเสนอราคา (อนุมัติแล้ว)</label>
              <select
                value={quotationId}
                onChange={(e) => setQuotationId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.code} · {q.customer_snapshot?.name}{q.customer_snapshot?.job ? ` (${q.customer_snapshot.job})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-3 mb-1 block">กำหนดส่ง (ถ้ามี)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>

            {err && <div className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">{err}</div>}

            <button
              onClick={submit}
              disabled={busy}
              className="press inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60"
            >
              <Icon name="factory" size={16} /> {busy ? "กำลังสร้าง..." : "สร้างใบสั่งผลิต"}
            </button>
          </>
        )}
      </Card>
    </div>
  );
}
