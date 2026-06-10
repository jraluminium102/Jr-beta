"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht, suggestInstallments } from "@/lib/money";
import type { AvailableQuotation } from "./page";

const STATUS_LABEL: Record<string, string> = {
  draft: "ฉบับร่าง",
  sent: "ส่งแล้ว",
  approved: "อนุมัติ",
};

export default function NewBillingClient({
  quotations,
  preselectId,
}: {
  quotations: AvailableQuotation[];
  preselectId?: number | null;
}) {
  const router = useRouter();
  const [quotationId, setQuotationId] = useState<number | "">(
    preselectId ?? quotations[0]?.id ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const selected = useMemo(
    () => quotations.find((q) => q.id === quotationId) ?? null,
    [quotations, quotationId]
  );
  const plan = useMemo(
    () => (selected ? suggestInstallments(selected.net) : []),
    [selected]
  );

  async function submit() {
    setErr("");
    if (!quotationId) { setErr("ต้องเลือกใบเสนอราคา"); return; }
    setBusy(true);
    const res = await fetch("/api/billing-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotation_id: quotationId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "สร้างไม่สำเร็จ"); return; }
    router.push(`/billing-notes/${json.data.id}`);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
        <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
          <Icon name="banknote" size={18} />
        </span>
        สร้างใบวางบิล
        <span className="text-xs font-normal text-ink-3">(รหัสจะออกอัตโนมัติเมื่อบันทึก)</span>
      </h1>

      {quotations.length === 0 ? (
        <Card className="p-6 text-center text-ink-3">
          ยังไม่มีใบเสนอราคาที่พร้อมวางบิล — ต้องสร้างใบเสนอราคาและยังไม่มีบิลที่ active
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">ใบเสนอราคา *</span>
                <select
                  value={quotationId}
                  onChange={(e) => setQuotationId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none"
                >
                  <option value="">— เลือกใบเสนอราคา —</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.code} · {q.customer_snapshot?.name} · ฿{baht(q.net)}
                      {q.status !== "approved" ? ` [${STATUS_LABEL[q.status] ?? q.status}]` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selected && selected.status !== "approved" && (
                <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ใบเสนอราคานี้ยังไม่ถูกอนุมัติ — การสร้างบิลจะอนุมัติใบเสนอราคาให้อัตโนมัติ
                </p>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="font-bold text-brand-dark mb-3">งวดชำระที่จะแบ่ง (อัตโนมัติ)</h3>
              {plan.length === 0 ? (
                <p className="text-sm text-ink-3">เลือกใบเสนอราคาเพื่อดูงวดชำระ</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left bg-brand-soft text-brand-dark">
                      <th className="p-2 rounded-l-lg">งวด</th>
                      <th>รายละเอียด</th>
                      <th className="text-right p-2 rounded-r-lg">ยอด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((p) => (
                      <tr key={p.seq} className="border-b border-gray-100">
                        <td className="p-2">{p.seq}</td>
                        <td>{p.label}</td>
                        <td className="text-right p-2 font-semibold tabular-nums">฿{baht(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <div>
            <Card className="p-5 sticky top-4">
              <h3 className="font-bold text-brand-dark mb-3">สรุป</h3>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-ink-3">ยอดรวม (จากใบเสนอ)</span>
                <span className="font-bold tabular-nums" style={{ color: "#7d0f15" }}>
                  ฿{baht(selected?.net ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-ink-3">จำนวนงวด</span>
                <span>{plan.length} งวด</span>
              </div>

              {err && (
                <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">
                  {err}
                </p>
              )}

              <div className="mt-4 space-y-2">
                <button
                  onClick={submit}
                  disabled={busy || !quotationId}
                  className="press w-full rounded-xl py-3 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60 min-h-[44px]"
                >
                  {busy ? "กำลังบันทึก…" : "สร้างใบวางบิล"}
                </button>
                <button
                  onClick={() => router.back()}
                  className="press w-full glass-soft rounded-xl py-2.5 text-sm text-ink-2 min-h-[44px]"
                >
                  ยกเลิก
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
