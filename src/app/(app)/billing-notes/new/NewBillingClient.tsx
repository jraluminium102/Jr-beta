"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht, suggestInstallments, computeTotals } from "@/lib/money";
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
  const busyRef = useRef(false);
  const [err, setErr] = useState("");

  const selected = useMemo(
    () => quotations.find((q) => q.id === quotationId) ?? null,
    [quotations, quotationId]
  );

  // footer ยอดแยก (ติ๊กปรับได้) — base = ยอดก่อนภาษี(subtotal) ของใบเสนอ · default = ค่าจากใบเสนอ (ไม่คิดซ้ำ)
  // locked = ใบเสนอ import เก่าที่ไม่มี subtotal → net เป็นยอด "หลัง VAT" แล้ว · ถือเป็นยอดล้วน ปรับภาษีไม่ได้ (กันคิด VAT ซ้ำ)
  const locked = !(Number(selected?.subtotal) > 0);
  const base = locked ? (Number(selected?.net) || 0) : Number(selected?.subtotal) || 0;
  const [disc, setDisc] = useState(0);
  const [vat, setVat] = useState(7);
  const [wht, setWht] = useState(0);
  useEffect(() => {
    if (!selected) return;
    const hasSub = Number(selected.subtotal) > 0;
    setDisc(hasSub ? Number(selected.discount_pct) || 0 : 0);
    setVat(hasSub ? Number(selected.vat_rate) || 0 : 0);
    setWht(hasSub ? Number(selected.wht_rate) || 0 : 0);
  }, [selected]);

  // เมื่อ locked บังคับ vat/wht/disc = 0 ให้ตรงกับ API (net = ยอดล้วน)
  const t = useMemo(
    () => computeTotals({ items: [{ qty: 1, unit_price: base }], vat_rate: locked ? 0 : vat, discount_pct: locked ? 0 : disc, wht_rate: locked ? 0 : wht }),
    [base, vat, disc, wht, locked]
  );
  const plan = useMemo(() => (selected ? suggestInstallments(t.net) : []), [selected, t.net]);

  async function submit() {
    // synchronous guard — กัน double-tap / กดรัว
    if (busyRef.current) return;

    setErr("");
    if (!quotationId) { setErr("ต้องเลือกใบเสนอราคา"); return; }

    // confirm ก่อนสร้างถ้าใบเสนอยังไม่ approved (auto-approve ย้อนกลับยาก)
    if (selected && selected.status !== "approved") {
      const ok = window.confirm(
        "การสร้างบิลจะอนุมัติใบเสนอนี้อัตโนมัติและย้อนกลับยาก ยืนยัน?"
      );
      if (!ok) return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/billing-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotation_id: quotationId, discount_pct: disc, vat_rate: vat, wht_rate: wht }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "สร้างไม่สำเร็จ"); return; }
      router.push(`/billing-notes/${json.data.id}`);
    } catch {
      setErr("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
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
                      {q.code} · {q.customer_snapshot?.name}
                      {q.customer_snapshot?.job ? ` · ${q.customer_snapshot.job}` : ""} · ฿{baht(q.net)}
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
              {selected && !selected.job_id && (
                <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ⚠ ใบเสนอนี้ยังไม่ผูกงาน — เงินที่รับจะไม่ขึ้นในระบบบัญชี/ค้างรับ (ตามงานไม่เจอ) แนะนำให้ผูกงานที่ใบเสนอก่อนวางบิล
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
              <h3 className="font-bold text-brand-dark mb-3">สรุปยอด</h3>
              {/* footer เดียวกับใบเสนอ — เริ่มจากยอดก่อนภาษีของใบเสนอ · ติ๊ก/แก้ได้ (default = ค่าใบเสนอ ไม่คิดซ้ำ) */}
              {locked && (
                <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  ใบเสนอนี้ไม่มียอดก่อนภาษี (นำเข้าจากภายนอก) — ใช้ยอดสุทธิเป็นยอดล้วน ปรับส่วนลด/VAT ไม่ได้
                </p>
              )}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-ink-3">รวมเป็นเงิน</span><span className="tabular-nums">฿{baht(t.subtotal)}</span></div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-3 flex items-center gap-1">ส่วนลด
                    <input type="number" min={0} step="any" disabled={locked} value={disc || ""} onChange={(e) => setDisc(Math.max(0, Number(e.target.value) || 0))}
                      className="w-12 glass-soft rounded px-1 py-1 text-right outline-none tabular-nums disabled:opacity-50" aria-label="ส่วนลด %" />%
                  </span>
                  <span className="flex items-center gap-1 tabular-nums text-red-700">-฿
                    <input type="number" min={0} step="any" disabled={locked} value={t.discount_amt || ""}
                      onChange={(e) => setDisc(base > 0 ? Math.max(0, Math.round(((Number(e.target.value) || 0) / base) * 10000) / 100) : 0)}
                      className="w-20 glass-soft rounded px-1 py-1 text-right outline-none tabular-nums disabled:opacity-50" aria-label="ส่วนลด บาท" />
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-ink-3">ราคาหลังหักส่วนลด</span><span className="tabular-nums">฿{baht(t.after_discount)}</span></div>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-ink-3 flex items-center gap-1.5"><input type="checkbox" disabled={locked} checked={vat === 7} onChange={(e) => setVat(e.target.checked ? 7 : 0)} /> ภาษีมูลค่าเพิ่ม 7%</span>
                  <span className="tabular-nums">฿{baht(t.vat_amt)}</span>
                </label>
                <div className="border-t border-gray-300/70 my-1.5" />
                <div className="flex justify-between font-bold"><span className="text-ink">จำนวนเงินรวมทั้งสิ้น</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.total)}</span></div>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-ink-3 flex items-center gap-1.5"><input type="checkbox" disabled={locked} checked={wht > 0} onChange={(e) => setWht(e.target.checked ? 3 : 0)} /> หักภาษี ณ ที่จ่าย
                    <select value={wht || 3} disabled={locked || wht === 0} onChange={(e) => setWht(Number(e.target.value))} className="glass-soft rounded px-1 py-1 outline-none text-xs disabled:opacity-50">
                      <option value={1}>1%</option><option value={2}>2%</option><option value={3}>3%</option><option value={5}>5%</option>
                    </select>
                  </span>
                  <span className="tabular-nums text-red-700">-฿{baht(t.wht_amt)}</span>
                </label>
                <div className="flex justify-between font-bold text-base border-t border-gray-300/70 pt-1.5"><span className="text-ink">ยอดชำระ · แบ่ง {plan.length} งวด</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.net)}</span></div>
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
