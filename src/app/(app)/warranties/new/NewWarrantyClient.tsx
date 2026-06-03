"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";

type WarrantyQuotation = {
  id: number;
  code: string;
  customer_snapshot: { name: string; job: string };
};

const DEFAULT_COVERAGE = "รับประกันงานติดตั้งและวัสดุตามเงื่อนไขบริษัท";

export default function NewWarrantyClient({ quotations }: { quotations: WarrantyQuotation[] }) {
  const router = useRouter();
  const [quotationId, setQuotationId] = useState<number | "">(quotations[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [months, setMonths] = useState(12);
  const [coverage, setCoverage] = useState(DEFAULT_COVERAGE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const selected = useMemo(
    () => quotations.find((q) => q.id === quotationId) ?? null,
    [quotations, quotationId]
  );

  // พรีวิววันหมดประกัน = วันออก + ระยะประกัน (เดือน) — คำนวณฝั่ง client
  const expires = useMemo(() => {
    if (!issueDate || !months) return "—";
    const exp = new Date(issueDate);
    if (Number.isNaN(exp.getTime())) return "—";
    exp.setMonth(exp.getMonth() + (Number(months) || 0));
    return exp.toISOString().slice(0, 10);
  }, [issueDate, months]);

  async function submit() {
    setErr("");
    if (!quotationId) { setErr("ต้องเลือกใบเสนอราคา"); return; }
    setBusy(true);
    const res = await fetch("/api/warranties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quotation_id: quotationId,
        warranty_months: Number(months) || 12,
        coverage,
        issue_date: issueDate || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "สร้างไม่สำเร็จ"); return; }
    router.push(`/warranties/${json.data.id}`);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
        <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
          <Icon name="shield" size={18} />
        </span>
        ออกใบรับประกัน
        <span className="text-xs font-normal text-ink-3">(รหัสจะออกอัตโนมัติเมื่อบันทึก)</span>
      </h1>

      {quotations.length === 0 ? (
        <Card className="p-6 text-center text-ink-3">
          ยังไม่มีใบเสนอราคาที่อนุมัติ — ต้องอนุมัติใบเสนอราคาก่อนจึงจะออกใบรับประกันได้
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5 space-y-4">
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">ใบเสนอราคาที่อนุมัติ *</span>
                <select value={quotationId} onChange={(e) => setQuotationId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none">
                  <option value="">— เลือกใบเสนอราคา —</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.code} · {q.customer_snapshot?.name}{q.customer_snapshot?.job ? ` · ${q.customer_snapshot.job}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="text-xs font-medium text-ink-3">วันที่ออก</span>
                  <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-ink-3">ระยะประกัน (เดือน)</span>
                  <input type="number" min={1} value={months}
                    onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 0))}
                    className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" />
                </label>
              </div>

              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">ข้อความเงื่อนไขการรับประกัน (Coverage)</span>
                <textarea value={coverage} onChange={(e) => setCoverage(e.target.value)} rows={3}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none resize-y" />
              </label>
            </Card>
          </div>

          <div>
            <Card className="p-5 sticky top-4">
              <h3 className="font-bold text-brand-dark mb-3">สรุป</h3>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-ink-3">ลูกค้า / งาน</span>
                <span className="font-medium text-right">{selected?.customer_snapshot?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-ink-3">วันที่ออก</span>
                <span>{issueDate || "—"}</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-ink-3">ระยะประกัน</span>
                <span>{months || 0} เดือน</span>
              </div>
              <div className="flex justify-between text-sm py-1 border-t mt-1">
                <span className="text-ink-3">วันหมดประกัน</span>
                <span className="font-bold" style={{ color: "#7d0f15" }}>{expires}</span>
              </div>

              {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}

              <div className="mt-4 space-y-2">
                <button onClick={submit} disabled={busy || !quotationId} className="press w-full rounded-xl py-3 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                  {busy ? "กำลังบันทึก…" : "ออกใบรับประกัน"}
                </button>
                <button onClick={() => router.back()} className="press w-full glass-soft rounded-xl py-2.5 text-sm text-ink-2">ยกเลิก</button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
