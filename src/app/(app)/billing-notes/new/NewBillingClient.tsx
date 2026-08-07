"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import DateField from "@/components/ui/DateField";
import { baht, suggestInstallments, computeTotals, planInstallments } from "@/lib/money";
import { todayISO } from "@/lib/date-guard";
import type { AvailableQuotation } from "./page";
import ExternalBillingForm from "./ExternalBillingForm";

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
  // quote = ออกจากใบเสนอ (ปกติ) · external = ลูกค้านอกระบบ พิมพ์เอง ผูกใบเสนอทีหลัง (0124)
  const [mode, setMode] = useState<"quote" | "external">("quote");
  const [quotationId, setQuotationId] = useState<number | "">(
    preselectId ?? quotations[0]?.id ?? ""
  );
  // วันที่ออกบิล — เลขเอกสารจะออกตามเดือนของวันนี้ (ไม่ใช่เอกสารภาษี แก้ทีหลังได้จากหน้ารายละเอียด)
  const [issueDate, setIssueDate] = useState(todayISO());
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
  const [disc, setDisc] = useState(0);            // ส่วนลด %
  const [discAmt, setDiscAmt] = useState("");     // ส่วนลดเป็นบาท (authoritative เมื่อ discMode='baht' · ไม่แปลงกลับเป็น % กัน drift)
  const [discMode, setDiscMode] = useState<"pct" | "baht">("pct");
  const [vat, setVat] = useState(7);
  const [wht, setWht] = useState(0);
  // ค่าแรง (17 ก.ค.69) — หัก ณ ที่จ่ายเฉพาะค่าแรง · กรอกบาทหรือ% · เงินประกันงวดสุดท้าย (แล้วแต่งาน)
  const [laborMode, setLaborMode] = useState<"baht" | "pct">("baht");
  const [laborBaht, setLaborBaht] = useState("");
  const [laborPct, setLaborPct] = useState("");
  const [hasRetention, setHasRetention] = useState(false);
  useEffect(() => {
    if (!selected) return;
    const hasSub = Number(selected.subtotal) > 0;
    // สืบส่วนลดจากใบเสนอ: ถ้ากรอกเป็น "บาท" (discount_amt>0) → ตั้งโหมดบาทให้ตรงเป๊ะ · ไม่งั้นโหมด %
    const qAmt = hasSub ? (Number(selected.discount_amt) || 0) : 0;
    setDisc(hasSub ? Number(selected.discount_pct) || 0 : 0);
    if (qAmt > 0) { setDiscMode("baht"); setDiscAmt(String(qAmt)); }
    else { setDiscMode("pct"); setDiscAmt(""); }
    setVat(hasSub ? Number(selected.vat_rate) || 0 : 0);
    setWht(hasSub ? Number(selected.wht_rate) || 0 : 0);
    setLaborBaht(""); setLaborPct(""); setHasRetention(false);
  }, [selected]);

  // ใส่ค่าแรงเฉพาะเมื่อมี WHT (ค่าแรง = ฐาน WHT) · locked → ไม่คิดภาษี
  const laborActive = !locked && wht > 0;
  const laborInput = laborActive
    ? (laborMode === "baht" && laborBaht !== "" ? { labor_amount: Number(laborBaht) }
      : laborMode === "pct" && laborPct !== "" ? { labor_pct: Number(laborPct) } : {})
    : {};
  // เมื่อ locked บังคับ vat/wht/disc = 0 ให้ตรงกับ API (net = ยอดล้วน)
  // ส่วนลด: โหมดบาท → ส่ง discount_amt ตรง ๆ (authoritative · ไม่แปลงกลับ %) · โหมด % → discount_pct
  const discInput = locked
    ? { discount_pct: 0 }
    : discMode === "baht"
      ? { discount_pct: 0, discount_amt: Number(discAmt) || 0 }
      : { discount_pct: disc };
  const t = useMemo(
    () => computeTotals({ items: [{ qty: 1, unit_price: base }], vat_rate: locked ? 0 : vat, wht_rate: locked ? 0 : wht, ...discInput, ...laborInput }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, vat, disc, discAmt, discMode, wht, locked, laborMode, laborBaht, laborPct]
  );
  const plan = useMemo(() => {
    if (!selected) return [] as { seq: number; label: string; amount: number }[];
    if (t.labor_amt > 0.005) return planInstallments({ material_amt: t.material_amt, labor_amt: t.labor_amt, vat_rate: locked ? 0 : vat, wht_rate: locked ? 0 : wht, hasRetention }).installments;
    return suggestInstallments(t.net, locked ? 0 : vat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, t, vat, wht, hasRetention, locked]);

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
        body: JSON.stringify({
          quotation_id: quotationId, issue_date: issueDate, vat_rate: vat, wht_rate: wht,
          ...(discMode === "baht" ? { discount_amt: Number(discAmt) || 0 } : { discount_pct: disc }),
          ...(laborActive && laborMode === "baht" && laborBaht !== "" ? { labor_amount: Number(laborBaht) } : {}),
          ...(laborActive && laborMode === "pct" && laborPct !== "" ? { labor_pct: Number(laborPct) } : {}),
          has_retention: hasRetention,
        }),
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

      {/* เลือกที่มาของบิล — ปกติออกจากใบเสนอ · บางเคสต้องวางบิลก่อนมีใบเสนอ (พิมพ์ลูกค้าเอง ผูกทีหลัง) */}
      <div className="flex flex-wrap gap-2">
        {([["quote", "จากใบเสนอราคา"], ["external", "ลูกค้านอกระบบ (ยังไม่มีใบเสนอ)"]] as const).map(([k, label]) => (
          <button
            key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
            className={"press rounded-xl px-4 py-2 text-sm font-semibold transition " +
              (mode === k ? "bg-brand text-white shadow-brand" : "glass-soft text-ink-2")}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "external" ? (
        <ExternalBillingForm />
      ) : quotations.length === 0 ? (
        <Card className="p-6 text-center text-ink-3">
          ยังไม่มีใบเสนอราคาที่พร้อมวางบิล — ต้องสร้างใบเสนอราคาและยังไม่มีบิลที่ active
          <span className="block mt-2 text-sm">หรือกด <b>“ลูกค้านอกระบบ”</b> ด้านบนเพื่อวางบิลก่อน แล้วผูกใบเสนอทีหลัง</span>
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

              <label className="block text-sm mt-3">
                <span className="text-xs font-medium text-ink-3">วันที่ออกบิล</span>
                <DateField
                  value={issueDate}
                  onChange={setIssueDate}
                  aria-label="วันที่ออกบิล"
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none"
                />
                <span className="block text-[11px] text-ink-3 mt-1">เลขที่เอกสารจะออกตามเดือนของวันที่นี้ · แก้วันที่ภายหลังได้ที่หน้ารายละเอียด</span>
              </label>
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
                    {/* กรอกได้ทั้ง % และบาท · พิมพ์ช่องไหน = ใช้ช่องนั้น (โหมดบาทเก็บยอดตรง ไม่แปลงกลับเป็น % กัน drift) */}
                    {/* กรอกเป็นบาท → ช่อง % ว่าง (ไม่ derive %จากจำนวน · เจ้าของ 6 ส.ค.: ใส่จำนวนแล้วไม่อยากเห็น %) */}
                    <input type="number" min={0} step="any" disabled={locked}
                      value={discMode === "pct" ? (disc || "") : ""}
                      onChange={(e) => { setDiscMode("pct"); setDisc(Math.max(0, Number(e.target.value) || 0)); }}
                      className="w-14 glass-soft rounded px-1 py-1 text-right outline-none tabular-nums disabled:opacity-50" aria-label="ส่วนลด %" />%
                  </span>
                  <span className="flex items-center gap-1 tabular-nums text-red-700">-฿
                    <input type="number" min={0} step="any" disabled={locked}
                      value={discMode === "baht" ? discAmt : (t.discount_amt || "")}
                      onChange={(e) => { setDiscMode("baht"); setDiscAmt(e.target.value); }}
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

                {/* ค่าแรง (ฐานหัก ณ ที่จ่าย) — โชว์เมื่อมี WHT · หัก 3% เฉพาะค่าแรง (17 ก.ค.69) */}
                {laborActive && (
                  <div className="rounded-lg bg-sky-50 border border-sky-200 px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink-3 flex items-center gap-1.5">ค่าแรง (ฐานหัก ณ ที่จ่าย)
                        <span className="inline-flex rounded-md overflow-hidden border border-sky-300 text-[11px]">
                          {(["baht", "pct"] as const).map((m) => (
                            <button key={m} type="button" onClick={() => setLaborMode(m)}
                              className={`px-1.5 py-0.5 ${laborMode === m ? "bg-sky-500 text-white" : "bg-white text-ink-3"}`}>{m === "baht" ? "บาท" : "%"}</button>
                          ))}
                        </span>
                      </span>
                      {laborMode === "baht" ? (
                        <span className="flex items-center gap-1 tabular-nums">฿
                          <input type="number" min={0} step="any" value={laborBaht} onChange={(e) => setLaborBaht(e.target.value)}
                            className="w-24 glass-soft rounded px-1 py-1 text-right outline-none tabular-nums" aria-label="ค่าแรง บาท" />
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 tabular-nums">
                          <input type="number" min={0} max={100} step="any" value={laborPct} onChange={(e) => setLaborPct(e.target.value)}
                            className="w-14 glass-soft rounded px-1 py-1 text-right outline-none tabular-nums" aria-label="ค่าแรง %" />%
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between text-[12px] text-ink-3">
                      <span>ค่าของ ฿{baht(t.material_amt)} · ค่าแรง ฿{baht(t.labor_amt)}</span>
                      <span>หัก 3% เฉพาะค่าแรง = -฿{baht(t.wht_amt)}</span>
                    </div>
                    <label className="flex items-center gap-1.5 text-[12px] text-ink-2 cursor-pointer">
                      <input type="checkbox" checked={hasRetention} onChange={(e) => setHasRetention(e.target.checked)} />
                      กันเงินประกัน 40,000 เป็นงวดสุดท้าย (แล้วแต่งาน)
                    </label>
                    {t.labor_amt <= 0.005 && (laborBaht !== "" || laborPct !== "") && (
                      <p className="text-[11px] text-amber-700">ค่าแรงเป็น 0 — จะหักทั้งบิลแบบเดิม (กรอกค่าแรงเพื่อหักเฉพาะค่าแรง)</p>
                    )}
                  </div>
                )}

                <div className="flex justify-between font-bold text-base border-t border-gray-300/70 pt-1.5"><span className="text-ink">ยอดชำระ · แบ่ง {plan.length} งวด</span><span className="tabular-nums" style={{ color: "#7d0f15" }}>฿{baht(t.net)}</span></div>
                {/* พรีวิวงวด (ค่าของ → ค่าแรง → เงินประกัน) */}
                {plan.length > 1 && (
                  <div className="text-[11.5px] text-ink-3 space-y-0.5 pt-1">
                    {plan.map((p) => (
                      <div key={p.seq} className="flex justify-between gap-2"><span className="truncate">{p.label}</span><span className="tabular-nums shrink-0">฿{baht(p.amount)}</span></div>
                    ))}
                  </div>
                )}
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
