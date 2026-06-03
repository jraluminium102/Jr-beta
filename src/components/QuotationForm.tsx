"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "./ui";
import Icon from "./Icon";
import { computeTotals, baht } from "@/lib/money";
import type { Customer } from "@/lib/types";

type Item = { name: string; detail: string; qty: number; unit_price: number };
const blank = (): Item => ({ name: "", detail: "", qty: 1, unit_price: 0 });

export default function QuotationForm({ customers }: { customers: Pick<Customer, "id" | "name" | "job">[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<number | "">(customers[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Item[]>([blank()]);
  const [vat, setVat] = useState(7);
  const [disc, setDisc] = useState(0);
  const [wht, setWht] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [calcCustomer, setCalcCustomer] = useState("");

  type AgentResult = { agentName: string; passed: boolean; issues: string[]; suggestions: string[]; rawOutput: string };
  type AiReview = { agents: AgentResult[]; verdict: "APPROVE" | "NEEDS_REVISION" | "REJECT" };
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiReview | null>(null);
  const [aiErr, setAiErr] = useState("");

  // รับรายการจากเครื่องคิดราคา (สะพาน) ตอน mount
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("jr_quote_items") ?? localStorage.getItem("jr_quote_bridge");
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { items?: Array<{ name?: string; detail?: string; qty?: number; unit_price?: number }>; customer?: string };
      const bridged = (payload.items ?? [])
        .filter((it) => it && (it.name || it.unit_price))
        .map<Item>((it) => ({
          name: String(it.name ?? ""),
          detail: String(it.detail ?? ""),
          qty: Number(it.qty) || 1,
          unit_price: Number(it.unit_price) || 0,
        }));
      if (bridged.length) setItems(bridged);
      if (payload.customer) setCalcCustomer(String(payload.customer));
    } catch {
      /* ignore malformed payload */
    } finally {
      try {
        sessionStorage.removeItem("jr_quote_items");
        localStorage.removeItem("jr_quote_bridge");
      } catch {
        /* ignore */
      }
    }
  }, []);

  const t = useMemo(() => computeTotals({ items, vat_rate: vat, discount_pct: disc, wht_rate: wht }), [items, vat, disc, wht]);

  const setItem = (i: number, k: keyof Item, v: string | number) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));

  async function aiVerify() {
    setAiErr(""); setAiResult(null);
    const valid = items.filter((i) => i.name.trim() && Number(i.qty) > 0);
    if (valid.length === 0) { setAiErr("ต้องมีรายการอย่างน้อย 1 บรรทัดก่อนตรวจ"); return; }
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai/verify-quotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, issue_date: issueDate, items: valid, vat_rate: vat, discount_pct: disc, wht_rate: wht, note }),
      });
      const json = await res.json();
      if (!res.ok) { setAiErr(json.error ?? "ตรวจไม่สำเร็จ"); return; }
      setAiResult(json.data as AiReview);
    } catch {
      setAiErr("เชื่อมต่อ AI ไม่สำเร็จ");
    } finally {
      setAiBusy(false);
    }
  }

  async function submit() {
    setErr("");
    if (!customerId) { setErr("ต้องเลือกลูกค้า"); return; }
    const valid = items.filter((i) => i.name.trim() && Number(i.qty) > 0);
    if (valid.length === 0) { setErr("ต้องมีรายการอย่างน้อย 1 บรรทัด (ระบุชื่อ + จำนวน)"); return; }
    setBusy(true);
    const res = await fetch("/api/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, issue_date: issueDate, items: valid, vat_rate: vat, discount_pct: disc, wht_rate: wht, note }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "บันทึกไม่สำเร็จ"); return; }
    router.push(`/quotations/${json.data.id}`);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
        <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
          <Icon name="file" size={18} />
        </span>
        สร้างใบเสนอราคา
        <span className="text-xs font-normal text-ink-3">(รหัสจะออกอัตโนมัติเมื่อบันทึก)</span>
      </h1>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="block">
                <span className="text-xs font-medium text-ink-3">ลูกค้า / งาน *</span>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none">
                  <option value="">— เลือกลูกค้า —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.job}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-3">วันที่</span>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" />
              </label>
            </div>
            {customers.length === 0 && (
              <p className="text-sm text-amber-700 mt-2">ยังไม่มีลูกค้า — ไปเพิ่มที่เมนู “ทะเบียนลูกค้า” ก่อน</p>
            )}
            {calcCustomer && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                ลูกค้าจากเครื่องคิดราคา: <strong>{calcCustomer}</strong> — เลือกให้ตรงทะเบียนลูกค้า
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-bold text-brand-dark mb-3">รายการ</h3>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="glass-soft rounded-xl p-3.5">
                  <div className="flex gap-2">
                    <input value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} placeholder="ชื่อรายการ เช่น ประตูบานเปิดคู่"
                      className="flex-1 glass rounded-md px-3 py-2 text-sm font-medium outline-none" />
                    {items.length > 1 && (
                      <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} aria-label="ลบรายการ"
                        className="press w-9 rounded-md inline-flex items-center justify-center text-red-700 bg-red-50 hover:bg-red-100">
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                  <input value={it.detail} onChange={(e) => setItem(i, "detail", e.target.value)} placeholder="รายละเอียด เช่น 1.8×2.2ม. สีอบขาว กระจกเขียว 6มม."
                    className="w-full glass rounded-md px-3 py-1.5 text-xs mt-2 outline-none" />
                  <div className="flex items-center gap-3 text-sm flex-wrap mt-2.5">
                    <label className="text-xs text-ink-3">จำนวน
                      <input type="number" min={0} value={it.qty} onChange={(e) => setItem(i, "qty", Number(e.target.value))} className="w-16 ml-1.5 glass rounded-md px-2 py-1 text-right outline-none" />
                    </label>
                    <label className="text-xs text-ink-3">ราคา/หน่วย
                      <input type="number" min={0} value={it.unit_price} onChange={(e) => setItem(i, "unit_price", Number(e.target.value))} className="w-28 ml-1.5 glass rounded-md px-2 py-1 text-right outline-none" />
                    </label>
                    <span className="ml-auto font-bold text-brand-dark">฿{baht((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setItems([...items, blank()])} className="press w-full mt-3 glass-soft rounded-xl py-2.5 text-sm inline-flex items-center justify-center gap-1.5 text-ink-2 hover:bg-white/70">
              <Icon name="plus" size={15} /> เพิ่มรายการ
            </button>
          </Card>

          <Card className="p-5">
            <h3 className="font-bold text-brand-dark mb-3">ภาษี / ส่วนลด</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <label className="block">
                <span className="text-xs font-medium text-ink-3">VAT (%)</span>
                <select value={vat} onChange={(e) => setVat(Number(e.target.value))} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none">
                  <option value={0}>0% (ไม่มีใบกำกับ)</option><option value={7}>7%</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-3">ส่วนลด (%) · ≤2%</span>
                <input type="number" min={0} max={2} step={0.5} value={disc} onChange={(e) => setDisc(Number(e.target.value))} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 text-right outline-none" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-ink-3">หัก ณ ที่จ่าย (%)</span>
                <select value={wht} onChange={(e) => setWht(Number(e.target.value))} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none">
                  <option value={0}>ไม่หัก</option><option value={3}>3%</option><option value={5}>5%</option>
                </select>
              </label>
            </div>
          </Card>
        </div>

        <div>
          <Card className="p-5 sticky top-4">
            <h3 className="font-bold text-brand-dark mb-3">สรุปยอด</h3>
            <Row k="ยอดรวมก่อนภาษี" v={t.subtotal} />
            {t.discount_amt > 0 && <Row k={`ส่วนลด ${disc}%`} v={-t.discount_amt} red />}
            <Row k={`VAT ${vat}%`} v={t.vat_amt} />
            <div className="border-t border-gray-300/70 my-2" />
            <Row k="ยอดรวมสุทธิ" v={t.total} bold />
            {t.wht_amt > 0 && <><Row k={`หัก ณ ที่จ่าย ${wht}%`} v={-t.wht_amt} red /><Row k="ยอดรับสุทธิ" v={t.net} bold big /></>}

            {err && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{err}</p>}

            {/* AI ตรวจก่อนบันทึก (3 agents: DataValidator → BusinessRules → FinalReviewer) */}
            <button onClick={aiVerify} disabled={aiBusy} className="press w-full mt-4 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#1f2937" }}>
              {aiBusy ? "⏳ AI กำลังตรวจ…" : "🤖 ตรวจก่อนบันทึก (AI)"}
            </button>
            {aiErr && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2">{aiErr}</p>}
            {aiResult && (
              <div className="mt-2 glass-soft rounded-xl p-3 text-sm">
                <div className="font-bold" style={{ color: aiResult.verdict === "APPROVE" ? "#0f7a38" : aiResult.verdict === "NEEDS_REVISION" ? "#b45309" : "#b3151d" }}>
                  {aiResult.verdict === "APPROVE" ? "✅ ผ่าน พร้อมบันทึก" : aiResult.verdict === "NEEDS_REVISION" ? "🟡 มีจุดควรปรับ" : "🔴 ควรแก้ก่อนบันทึก"}
                </div>
                {aiResult.agents.map((a, i) => (
                  <div key={i} className="mt-2 pt-2 border-t border-gray-200/60">
                    <div className="text-xs font-semibold text-ink">{a.agentName} {a.passed ? "✅" : "⚠️"}</div>
                    {a.rawOutput && <div className="text-xs text-ink-2 mt-0.5">{a.rawOutput}</div>}
                    {a.issues.map((x, j) => <div key={`i${j}`} className="text-xs" style={{ color: "#b3151d" }}>• {x}</div>)}
                    {a.suggestions.map((x, j) => <div key={`s${j}`} className="text-xs" style={{ color: "#b45309" }}>○ {x}</div>)}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-2">
              <button onClick={submit} disabled={busy} className="press w-full rounded-xl py-3 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-60">
                {busy ? "กำลังบันทึก…" : "บันทึกใบเสนอราคา"}
              </button>
              <button onClick={() => router.back()} className="press w-full glass-soft rounded-xl py-2.5 text-sm text-ink-2">ยกเลิก</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold, big, red }: { k: string; v: number; bold?: boolean; big?: boolean; red?: boolean }) {
  return (
    <div className={`flex justify-between ${big ? "text-lg" : "text-sm"} ${bold ? "font-bold" : ""} py-0.5`}>
      <span className={bold ? "text-ink" : "text-ink-3"}>{k}</span>
      <span style={red ? { color: "#b3151d" } : bold ? { color: "#7d0f15" } : {}}>{v < 0 ? "-" : ""}฿{baht(Math.abs(v))}</span>
    </div>
  );
}
