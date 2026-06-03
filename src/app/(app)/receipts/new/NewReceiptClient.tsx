"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";

export type InstallmentOption = {
  id: number;
  seq: number;
  label: string;
  amount: number;
  status: string;
  sort_order: number;
};

export type BillingNoteOption = {
  id: number;
  code: string;
  customer_snapshot: { name: string; job: string };
  total: number;
  status: string;
  billing_installments?: InstallmentOption[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "transfer", label: "โอนเงิน" },
  { value: "cash", label: "เงินสด" },
  { value: "cheque", label: "เช็ค" },
];

export default function NewReceiptClient({ notes }: { notes: BillingNoteOption[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const preselect = params.get("billing");

  const [billingNoteId, setBillingNoteId] = useState<number | "">(
    preselect && notes.some((n) => n.id === Number(preselect))
      ? Number(preselect)
      : notes[0]?.id ?? ""
  );
  const [installmentId, setInstallmentId] = useState<number | "">("");
  const [amount, setAmount] = useState<string>("");
  const [vatRate, setVatRate] = useState<0 | 7>(7);
  const [paymentMethod, setPaymentMethod] = useState<string>("transfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const selected = useMemo(
    () => notes.find((n) => n.id === billingNoteId) ?? null,
    [notes, billingNoteId]
  );
  const installments = useMemo(
    () => (selected?.billing_installments ?? []).filter((i) => i.status !== "paid"),
    [selected]
  );
  const selectedInstallment = useMemo(
    () => installments.find((i) => i.id === installmentId) ?? null,
    [installments, installmentId]
  );

  // เมื่อเปลี่ยนใบวางบิล → reset งวด + ตั้งยอด default = ยอดบิล
  useEffect(() => {
    setInstallmentId("");
    if (selected) setAmount(String(selected.total));
  }, [selected]);

  // เมื่อเลือกงวด → ตั้งยอด default = ยอดงวด
  useEffect(() => {
    if (selectedInstallment) setAmount(String(selectedInstallment.amount));
    else if (selected) setAmount(String(selected.total));
  }, [selectedInstallment, selected]);

  const amountNum = Number(amount) || 0;
  const vatAmt = round2((amountNum * vatRate) / 100);
  const net = round2(amountNum + vatAmt);

  async function submit() {
    setErr("");
    if (!billingNoteId) { setErr("ต้องเลือกใบวางบิล"); return; }
    if (amountNum <= 0) { setErr("จำนวนเงินต้องมากกว่า 0"); return; }
    setBusy(true);
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billing_note_id: billingNoteId,
        installment_id: installmentId || null,
        amount: amountNum,
        vat_rate: vatRate,
        payment_method: paymentMethod,
        note,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "สร้างไม่สำเร็จ"); return; }
    router.push(`/receipts/${json.data.id}`);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
        <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
          <Icon name="receipt" size={18} />
        </span>
        ออกใบเสร็จ / ใบกำกับภาษี
        <span className="text-xs font-normal text-ink-3">(รหัสจะออกอัตโนมัติเมื่อบันทึก)</span>
      </h1>

      {notes.length === 0 ? (
        <Card className="p-6 text-center text-ink-3">
          ยังไม่มีใบวางบิลที่ค้างชำระ — ต้องสร้างใบวางบิลก่อนจึงจะออกใบเสร็จได้
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5 space-y-4">
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">ใบวางบิล *</span>
                <select value={billingNoteId} onChange={(e) => setBillingNoteId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none">
                  <option value="">— เลือกใบวางบิล —</option>
                  {notes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.code} · {n.customer_snapshot?.name} · ฿{baht(n.total)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">งวดชำระ (ถ้ามี)</span>
                <select value={installmentId} onChange={(e) => setInstallmentId(e.target.value ? Number(e.target.value) : "")}
                  disabled={installments.length === 0}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none disabled:opacity-60">
                  <option value="">— ทั้งใบ / ไม่ระบุงวด —</option>
                  {installments.map((it) => (
                    <option key={it.id} value={it.id}>
                      งวด {it.seq} · {it.label} · ฿{baht(it.amount)}
                    </option>
                  ))}
                </select>
              </label>
            </Card>

            <Card className="p-5 space-y-4">
              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">ยอดก่อน VAT *</span>
                <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none tabular-nums" />
              </label>

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="text-xs font-medium text-ink-3">ภาษีมูลค่าเพิ่ม (VAT)</span>
                  <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value) === 7 ? 7 : 0)}
                    className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none">
                    <option value={7}>VAT 7%</option>
                    <option value={0}>ไม่มี VAT (0%)</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-ink-3">วิธีชำระ</span>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none">
                    {PAYMENT_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="text-xs font-medium text-ink-3">หมายเหตุ</span>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" />
              </label>
            </Card>
          </div>

          <div>
            <Card className="p-5 sticky top-4">
              <h3 className="font-bold text-brand-dark mb-3">สรุป</h3>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-ink-3">ยอดก่อน VAT</span>
                <span className="tabular-nums">฿{baht(amountNum)}</span>
              </div>
              <div className="flex justify-between text-sm py-0.5">
                <span className="text-ink-3">VAT {vatRate}%</span>
                <span className="tabular-nums">฿{baht(vatAmt)}</span>
              </div>
              <div className="flex justify-between text-sm py-1 mt-1 border-t font-bold" style={{ color: "#7d0f15" }}>
                <span>ยอดสุทธิ</span>
                <span className="tabular-nums">฿{baht(net)}</span>
              </div>

              {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}

              <div className="mt-4 space-y-2">
                <button onClick={submit} disabled={busy || !billingNoteId || amountNum <= 0}
                  className="press w-full rounded-xl py-3 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                  {busy ? "กำลังบันทึก…" : "บันทึกใบเสร็จ"}
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
