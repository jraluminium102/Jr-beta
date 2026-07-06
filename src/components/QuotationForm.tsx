"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "./ui";
import Icon from "./Icon";
import { computeTotals, baht } from "@/lib/money";
import DateField from "@/components/ui/DateField";
import type { Customer } from "@/lib/types";
import { CONDITIONS_WORK, CONDITIONS_QUOTE } from "@/app/(app)/quotations/[id]/print/quote-constants";

type ActiveJob = { id: string; job_code: string | null; current_stage: number; status: string; created_at: string };

type Item = { name: string; detail: string; qty: number; unit_price: number; category: string; product_id: string; group_label: string };
const blank = (): Item => ({ name: "", detail: "", qty: 1, unit_price: 0, category: "", product_id: "", group_label: "" });

export default function QuotationForm({ customers }: { customers: Pick<Customer, "id" | "name" | "job">[] }) {
  const router = useRouter();
  // ไม่ default เป็นลูกค้าคนแรก — กันผูกผิดคนเงียบ ๆ (ต้องเลือก/ดึงจากเครื่องคิดราคาเสมอ)
  const [customerId, setCustomerId] = useState<number | "">("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Item[]>([blank()]);
  const [vat, setVat] = useState(7);
  const [disc, setDisc] = useState(0);
  const [wht, setWht] = useState(0);
  const [note, setNote] = useState("");
  // เงื่อนไขท้ายใบ (แก้ได้ต่อใบ) — เริ่มจากค่ามาตรฐาน · ส่งเฉพาะเมื่อแก้ (null = ใช้มาตรฐาน)
  const [condWork, setCondWork] = useState<string[]>([...CONDITIONS_WORK]);
  const [condQuote, setCondQuote] = useState<string[]>([...CONDITIONS_QUOTE]);
  const [condEdited, setCondEdited] = useState(false);
  const [condOpen, setCondOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [activeJobsLoading, setActiveJobsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [bridgeJobId, setBridgeJobId] = useState<string>(""); // งานที่มาจากเช็คลิสต์ → preselect หลังโหลดงานลูกค้า
  // (0069) นามออกบิล ของลูกค้าที่เลือก
  type BProf = { id: number; bill_name: string; kind: string; branch: string; is_default: boolean; tax_id?: string; address?: string; postal_code?: string; contact_person?: string; phone?: string };
  const [billingProfiles, setBillingProfiles] = useState<BProf[]>([]);
  const [billingProfileId, setBillingProfileId] = useState<number | "">("");
  // หัวบิล (ออกในนาม) — autofill จากนามออกบิลที่เลือก (ซึ่งมาจากคิวได้) · แก้ได้แบบเดียวกับใบวางบิล
  type Hdr = { kind: string; name: string; tax_id: string; branch: string; postal_code: string; address: string; contact_person: string; phone: string };
  const EMPTY_HDR: Hdr = { kind: "INDIVIDUAL", name: "", tax_id: "", branch: "สำนักงานใหญ่", postal_code: "", address: "", contact_person: "", phone: "" };
  const [hdr, setHdr] = useState<Hdr>(EMPTY_HDR);
  const [hdrOpen, setHdrOpen] = useState(false);
  const [calcCustomer, setCalcCustomer] = useState("");
  const [calcMatched, setCalcMatched] = useState(false); // preselect ให้แล้ว (จาก calc)
  const [calcExact, setCalcExact] = useState(false); // มั่นใจ (customer_id ตรง/ชื่อตรงเป๊ะรายเดียว) → เขียว; เดา → เหลือง

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
      const payload = JSON.parse(raw) as { items?: Array<{ name?: string; detail?: string; qty?: number; unit_price?: number; category?: string; product_id?: string; group_label?: string }>; customer?: string; customer_id?: number | null; job_id?: string };
      if (payload.job_id) setBridgeJobId(String(payload.job_id));
      const bridged = (payload.items ?? [])
        .filter((it) => it && (it.name || it.unit_price))
        .map<Item>((it) => ({
          name: String(it.name ?? ""),
          detail: String(it.detail ?? ""),
          qty: Number(it.qty) || 1,
          unit_price: Number(it.unit_price) || 0,
          category: String(it.category ?? ""),     // หมวดสินค้าจากเครื่องคิดราคา → สถิติ (0046)
          product_id: String(it.product_id ?? ""),
          group_label: String(it.group_label ?? ""),
        }));
      if (bridged.length) setItems(bridged);
      // ลูกค้าจากเครื่องคิดราคา: ใช้ customer_id (เลือกจากทะเบียนแล้ว) ก่อน — แม่นยำสุด
      const cidFromCalc =
        payload.customer_id != null && customers.some((c) => c.id === Number(payload.customer_id))
          ? Number(payload.customer_id)
          : null;
      if (cidFromCalc != null) {
        // เลือกจากทะเบียนในหน้าคิดราคาแล้ว → มั่นใจ (เขียว)
        setCustomerId(cidFromCalc);
        setCalcMatched(true);
        setCalcExact(true);
        setCalcCustomer(customers.find((c) => c.id === cidFromCalc)?.name ?? String(payload.customer ?? ""));
      } else if (payload.customer) {
        // ไม่ได้เลือกจากทะเบียน → จับคู่จากชื่อ (แยกระดับความมั่นใจ กัน match ผิดเงียบ)
        const name = String(payload.customer);
        setCalcCustomer(name);
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
        const target = norm(name);
        if (target) {
          const exact = customers.filter((c) => norm(c.name) === target);
          if (exact.length === 1) {
            setCustomerId(exact[0].id); // ชื่อตรงเป๊ะรายเดียว → มั่นใจ (เขียว)
            setCalcMatched(true);
            setCalcExact(true);
          }
          // exact 0 (ชื่อไม่ตรงเป๊ะ) → ไม่เดา/ไม่ preselect ลูกค้าเด็ดขาด
          // (กันผูกผิดคนเงียบ โดยเฉพาะจากเครื่องคิดราคา "เต็มจอ" ที่ส่งมาแต่ชื่อพิมพ์มือ)
          // ปล่อย customerId ว่าง + calcMatched=false → โชว์แถบเตือนแดงให้เลือกเอง
          // exact >1 (ชื่อซ้ำเป๊ะหลายราย) → ไม่ preselect ให้เลือกเอง
        }
      }
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

  // fetch งาน active ของลูกค้าเมื่อ customerId เปลี่ยน
  useEffect(() => {
    setActiveJobs([]);
    setSelectedJobId("");
    if (!customerId) return;
    let cancelled = false;
    setActiveJobsLoading(true);
    fetch(`/api/jobs/by-customer?customer_id=${customerId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const jobs: ActiveJob[] = Array.isArray(json?.data) ? json.data : [];
        setActiveJobs(jobs);
        // งานจากเช็คลิสต์ (bridgeJobId) → เลือกงานนั้นให้เลยถ้ายังอยู่ในลิสต์ · ไม่งั้น 1 งาน→auto · ≥2→เว้นว่าง
        const bridged = bridgeJobId && jobs.find((j) => j.id === bridgeJobId);
        setSelectedJobId(bridged ? bridgeJobId : (jobs.length === 1 ? jobs[0].id : ""));
      })
      .catch(() => { if (!cancelled) setActiveJobs([]); })
      .finally(() => { if (!cancelled) setActiveJobsLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  // (0069) โหลดนามออกบิลของลูกค้า → default = นามหลัก
  useEffect(() => {
    setBillingProfiles([]); setBillingProfileId("");
    if (!customerId) return;
    let cancelled = false;
    fetch(`/api/billing-profiles?customer_id=${customerId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const ps: BProf[] = Array.isArray(json?.data) ? json.data : [];
        setBillingProfiles(ps);
        const def = ps.find((p) => p.is_default) ?? ps[0];
        setBillingProfileId(def ? def.id : "");
      })
      .catch(() => { if (!cancelled) setBillingProfiles([]); });
    return () => { cancelled = true; };
  }, [customerId]);

  // autofill หัวบิลจากนามออกบิลที่เลือก (นามหลัก/บริษัทที่มาจากคิว จะเด้งเข้าฟอร์มให้เลย)
  useEffect(() => {
    const p = billingProfiles.find((x) => x.id === billingProfileId);
    if (!p) { setHdr(EMPTY_HDR); return; }
    setHdr({
      kind: p.kind === "COMPANY" ? "COMPANY" : "INDIVIDUAL",
      name: p.bill_name ?? "", tax_id: p.tax_id ?? "",
      branch: p.branch || "สำนักงานใหญ่", postal_code: p.postal_code ?? "",
      address: p.address ?? "", contact_person: p.contact_person ?? "", phone: p.phone ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingProfileId, billingProfiles]);

  const t = useMemo(() => computeTotals({ items, vat_rate: vat, discount_pct: disc, wht_rate: wht }), [items, vat, disc, wht]);

  const setItem = (i: number, k: keyof Item, v: string | number) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));

  // จัดลำดับรายการ (เลื่อนขึ้น/ลง) — sort_order ตอนบันทึกใช้ลำดับ array นี้
  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = [...items];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setItems(arr);
  };

  // Export Excel (CSV · UTF-8 BOM เปิดใน Excel ได้ ไม่ต้องมีไลบรารี)
  function exportCsv() {
    const rows: string[][] = [["#", "รายการ", "รายละเอียด", "จำนวน", "ราคา/หน่วย", "รวม"]];
    items.filter((i) => i.name.trim()).forEach((it, idx) =>
      rows.push([String(idx + 1), it.name, it.detail.replace(/\n/g, " · "), String(it.qty), String(it.unit_price), String((Number(it.qty) || 0) * (Number(it.unit_price) || 0))]));
    rows.push([]);
    rows.push(["", "", "", "", "ยอดก่อนภาษี", String(t.subtotal)]);
    if (t.discount_amt > 0) rows.push(["", "", "", "", `ส่วนลด ${disc}%`, String(-t.discount_amt)]);
    rows.push(["", "", "", "", `VAT ${vat}%`, String(t.vat_amt)]);
    rows.push(["", "", "", "", "ยอดรวมสุทธิ", String(t.total)]);
    if (t.wht_amt > 0) { rows.push(["", "", "", "", `หัก ณ ที่จ่าย ${wht}%`, String(-t.wht_amt)]); rows.push(["", "", "", "", "ยอดรับสุทธิ", String(t.net)]); }
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ใบเสนอราคา_${issueDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

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
    if (!customerId) { setErr("ต้องเลือกลูกค้าก่อน (ช่องบนสุด) แล้วกดบันทึกอีกครั้ง"); return; }
    if (activeJobsLoading) { setErr("กำลังโหลดรายการงานของลูกค้า รอสักครู่แล้วกดอีกครั้ง"); return; }
    if (activeJobs.length >= 2 && !selectedJobId) { setErr("ลูกค้ามีหลายงาน — เลือกงานที่จะผูกก่อน (ช่อง 'เลือกงานที่จะผูก')"); return; }
    const valid = items.filter((i) => i.name.trim() && Number(i.qty) > 0);
    if (valid.length === 0) { setErr("ต้องมีรายการอย่างน้อย 1 บรรทัด (ระบุชื่อ + จำนวน)"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          issue_date: issueDate,
          items: valid,
          vat_rate: vat,
          discount_pct: disc,
          wht_rate: wht,
          note,
          ...(selectedJobId ? { job_id: selectedJobId } : {}),
          ...(billingProfileId ? { billing_profile_id: billingProfileId } : {}),
          ...(hdr.name.trim() ? { header_override: hdr } : {}),
          ...(condEdited ? {
            conditions_work: condWork.map((s) => s.trim()).filter(Boolean),
            conditions_quote: condQuote.map((s) => s.trim()).filter(Boolean),
          } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(json.error ?? `บันทึกไม่สำเร็จ (${res.status}) — ลองอีกครั้ง`); return; }
      if (!json?.data?.id) { setErr("บันทึกแล้วแต่ไม่ได้รหัสกลับ — เปิดหน้าใบเสนอราคาเพื่อตรวจสอบ"); return; }
      router.push(`/quotations/${json.data.id}`);
    } catch {
      // เน็ตสะดุด/หลุด → ไม่ปล่อยปุ่มค้าง ต้องแจ้งให้กดใหม่ได้
      setErr("เชื่อมต่อไม่สำเร็จ (เน็ตสะดุด?) — ตรวจอินเทอร์เน็ตแล้วกดบันทึกอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-dark flex items-center gap-2.5">
        <span className="text-white rounded-xl w-9 h-9 inline-flex items-center justify-center bg-brand shadow-brand">
          <Icon name="file" size={18} />
        </span>
        สร้างใบเสนอราคา (จากเครื่องคิดราคา)
        <span className="text-xs font-normal text-ink-3">(รายการ+ราคา+ลูกค้า ดึงมาจากเครื่องคิดราคา · รหัสออกอัตโนมัติเมื่อบันทึก)</span>
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
                <DateField value={issueDate} onChange={(iso) => setIssueDate(iso)} className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none" aria-label="วันที่" />
              </label>
            </div>
            {customers.length === 0 && (
              <p className="text-sm text-amber-700 mt-2">ยังไม่มีลูกค้า — ไปเพิ่มที่เมนู "ทะเบียนลูกค้า" ก่อน</p>
            )}
            {/* (0069) เลือกนามออกบิล — หัวเอกสารจะเป็นนามนี้ · แก้/เพิ่มนามได้ที่ทะเบียนลูกค้า */}
            {customerId !== "" && billingProfiles.length > 0 && (
              <label className="block mt-3">
                <span className="text-xs font-medium text-ink-3">ออกเอกสารในนาม</span>
                <select value={billingProfileId} onChange={(e) => setBillingProfileId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none">
                  {billingProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.bill_name} {p.kind === "COMPANY" ? `(นิติบุคคล${p.branch ? " · " + p.branch : ""})` : "(บุคคล)"}{p.is_default ? " · นามหลัก" : ""}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-ink-3 mt-1 block">หัวเอกสารจะเป็นนามนี้ · เพิ่ม/แก้นามได้ที่ทะเบียนลูกค้า</span>
              </label>
            )}

            {/* แก้หัวบิลตรงนี้ (ออกในนามนิติบุคคล) — autofill จากนามออกบิลที่เลือก (ข้อมูลบริษัทจากคิวเด้งเข้าให้) · แก้ได้เฉพาะใบนี้ */}
            {customerId !== "" && (
              <div className="mt-3">
                <button type="button" onClick={() => setHdrOpen((v) => !v)} className="press text-sm font-semibold text-brand-dark inline-flex items-center gap-1.5">
                  <Icon name="pencil" size={14} /> แก้หัวบิล / ออกในนามบริษัท {hdrOpen ? "▲" : "▼"}
                  {hdr.kind === "COMPANY" && <span className="text-[11px] font-normal text-ink-3">· {hdr.name || "นิติบุคคล"}</span>}
                </button>
                {hdrOpen && (
                  <div className="mt-2 rounded-xl border border-brand/20 bg-brand/5 p-3 space-y-2">
                    <p className="text-[11px] text-ink-3">autofill จากนามออกบิลที่เลือก (ถ้ามีข้อมูลบริษัทจากคิวจะเด้งเข้าให้) · แก้ตรงนี้ = เฉพาะใบนี้ · ไม่กระทบทะเบียน</p>
                    <div className="inline-flex rounded-lg overflow-hidden border border-gray-300 text-sm">
                      {(["INDIVIDUAL", "COMPANY"] as const).map((k) => (
                        <button key={k} type="button" onClick={() => setHdr({ ...hdr, kind: k })}
                          className={`px-3 py-1.5 ${hdr.kind === k ? "bg-brand text-white" : "text-ink-2"}`}>
                          {k === "INDIVIDUAL" ? "บุคคลธรรมดา" : "นิติบุคคล"}
                        </button>
                      ))}
                    </div>
                    <input value={hdr.name} onChange={(e) => setHdr({ ...hdr, name: e.target.value })} placeholder={hdr.kind === "COMPANY" ? "ชื่อบริษัท" : "ชื่อลูกค้า"} className="w-full glass-soft rounded-lg px-3 py-2 text-sm outline-none" />
                    <input value={hdr.tax_id} onChange={(e) => setHdr({ ...hdr, tax_id: e.target.value })} placeholder="เลขผู้เสียภาษี 13 หลัก" className="w-full glass-soft rounded-lg px-3 py-2 text-sm outline-none" />
                    {hdr.kind === "COMPANY" && (
                      <div className="flex items-center gap-3 text-sm flex-wrap">
                        <label className="flex items-center gap-1.5"><input type="radio" checked={!hdr.branch.startsWith("สาขา")} onChange={() => setHdr({ ...hdr, branch: "สำนักงานใหญ่" })} /> สำนักงานใหญ่</label>
                        <label className="flex items-center gap-1.5"><input type="radio" checked={hdr.branch.startsWith("สาขา")} onChange={() => setHdr({ ...hdr, branch: "สาขาที่ " })} /> สาขา</label>
                        {hdr.branch.startsWith("สาขา") && (
                          <input value={hdr.branch.replace(/\D/g, "")} onChange={(e) => setHdr({ ...hdr, branch: "สาขาที่ " + e.target.value.replace(/\D/g, "") })} placeholder="รหัสสาขา" className="glass-soft rounded-lg px-3 py-2 text-sm outline-none max-w-[150px]" />
                        )}
                      </div>
                    )}
                    <textarea value={hdr.address} onChange={(e) => setHdr({ ...hdr, address: e.target.value })} rows={2} placeholder="ที่อยู่ออกบิล (ตามภาษี)" className="w-full glass-soft rounded-lg px-3 py-2 text-sm outline-none resize-none" />
                    <input value={hdr.postal_code} onChange={(e) => setHdr({ ...hdr, postal_code: e.target.value.replace(/\D/g, "").slice(0, 5) })} inputMode="numeric" placeholder="รหัสไปรษณีย์" className="glass-soft rounded-lg px-3 py-2 text-sm outline-none max-w-[160px]" />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={hdr.contact_person} onChange={(e) => setHdr({ ...hdr, contact_person: e.target.value })} placeholder="ผู้ติดต่อ" className="glass-soft rounded-lg px-3 py-2 text-sm outline-none" />
                      <input value={hdr.phone} onChange={(e) => setHdr({ ...hdr, phone: e.target.value })} placeholder="เบอร์โทร" className="glass-soft rounded-lg px-3 py-2 text-sm outline-none" />
                    </div>
                  </div>
                )}
              </div>
            )}
            {calcCustomer && calcMatched && calcExact && (
              <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mt-2">
                ✓ ผูกลูกค้าจากเครื่องคิดราคา: <strong>{calcCustomer}</strong> (ตรงทะเบียน)
              </p>
            )}
            {calcCustomer && calcMatched && !calcExact && (
              <p className="text-xs text-amber-800 bg-amber-100 rounded-lg px-3 py-2 mt-2 border border-amber-300">
                ⚠️ เดาลูกค้าให้จากชื่อ "<strong>{calcCustomer}</strong>" — <strong>โปรดยืนยัน</strong>ในช่องด้านบนว่าตรงคนก่อนบันทึก
              </p>
            )}
            {calcCustomer && !calcMatched && (
              <p className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2 mt-2 border border-rose-200">
                ไม่พบ/มีชื่อคล้ายหลายคนกับ "<strong>{calcCustomer}</strong>" ในทะเบียน — เลือกลูกค้าให้ตรงเอง (หรือเพิ่มที่เมนูทะเบียนลูกค้า)
              </p>
            )}

            {/* Job picker — แสดงเมื่อเลือกลูกค้าแล้ว */}
            {customerId !== "" && (
              <div className="mt-3">
                {activeJobsLoading && (
                  <p className="text-xs text-ink-3 flex items-center gap-1.5">
                    <Icon name="refresh" size={13} className="animate-spin" /> กำลังโหลดรายการงาน…
                  </p>
                )}
                {!activeJobsLoading && activeJobs.length === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                    ลูกค้ายังไม่มีงานในระบบ — ใบเสนอราคานี้จะยังไม่ผูกกับงาน (สามารถผูกทีหลังได้)
                  </p>
                )}
                {!activeJobsLoading && activeJobs.length === 1 && (
                  <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                    <Icon name="briefcase" size={12} className="inline mr-1" />
                    จะผูกกับงาน <strong>{activeJobs[0].job_code ?? activeJobs[0].id}</strong> อัตโนมัติ
                  </p>
                )}
                {!activeJobsLoading && activeJobs.length >= 2 && (
                  <label className="block">
                    <span className="text-xs font-medium text-ink-3">เลือกงานที่จะผูก *</span>
                    <select
                      value={selectedJobId}
                      onChange={(e) => setSelectedJobId(e.target.value)}
                      className="w-full glass-soft rounded-lg px-3 py-2.5 mt-1 outline-none text-sm text-ink"
                    >
                      <option value="">— เลือกงาน —</option>
                      {activeJobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.job_code ?? j.id} — {j.status} ({new Date(j.created_at).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" })})
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-amber-700 mt-0.5 block">ลูกค้ามี {activeJobs.length} งาน active — กรุณาเลือกให้ถูกต้องเพื่อกัน auto ผูกผิด</span>
                  </label>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-bold text-brand-dark mb-3">รายการ</h3>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="glass-soft rounded-xl p-3.5">
                  <input value={it.group_label} onChange={(e) => setItem(i, "group_label", e.target.value)} placeholder="หัวข้อชุด (เว้นว่าง=ไม่มี · เช่น ห้องนอน 1)"
                    className="w-full glass rounded-md px-3 py-1.5 text-xs mb-2 outline-none text-brand-dark font-semibold" />
                  <div className="flex gap-2">
                    <input value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} placeholder="ชื่อรายการ เช่น ประตูบานเปิดคู่"
                      className="flex-1 glass rounded-md px-3 py-2 text-sm font-medium outline-none" />
                    {items.length > 1 && (
                      <>
                        <button onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น"
                          className="press w-8 rounded-md inline-flex items-center justify-center text-ink-2 glass hover:bg-white/70 disabled:opacity-30">▲</button>
                        <button onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} aria-label="เลื่อนลง"
                          className="press w-8 rounded-md inline-flex items-center justify-center text-ink-2 glass hover:bg-white/70 disabled:opacity-30">▼</button>
                        <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} aria-label="ลบรายการ"
                          className="press w-9 rounded-md inline-flex items-center justify-center text-red-700 bg-red-50 hover:bg-red-100">
                          <Icon name="trash" size={15} />
                        </button>
                      </>
                    )}
                  </div>
                  <textarea value={it.detail} onChange={(e) => setItem(i, "detail", e.target.value)} rows={Math.max(2, (it.detail.match(/\n/g)?.length ?? 0) + 1)}
                    placeholder={"รายละเอียด (แต่ละบรรทัด = บุลเล็ต)\n- ชุดล็อค + กุญแจ\nรายละเอียดงาน\n- สีอลูมิเนียม: อบขาว\n- กระจก: เขียว 6มม."}
                    className="w-full glass rounded-md px-3 py-1.5 text-xs mt-2 outline-none resize-y leading-relaxed" />
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

          {/* เงื่อนไขท้ายใบ (แก้ได้ต่อใบ) — เริ่มจากค่ามาตรฐาน · แก้แล้วพิมพ์ลงใบนี้เท่านั้น */}
          <Card className="p-5">
            <button onClick={() => setCondOpen((v) => !v)} className="press w-full flex items-center justify-between">
              <h3 className="font-bold text-brand-dark">เงื่อนไขท้ายใบเสนอราคา {condEdited && <span className="text-xs font-normal text-amber-700">· แก้แล้ว</span>}</h3>
              <span className="text-ink-3 text-sm">{condOpen ? "▲" : "▼ แก้ไข"}</span>
            </button>
            {condOpen && (
              <div className="mt-3 space-y-4">
                {([["เงื่อนไขการเข้าทำงาน", condWork, setCondWork], ["เงื่อนไขแบบและใบเสนอราคา", condQuote, setCondQuote]] as const).map(([title, list, setList]) => (
                  <div key={title}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-brand-dark">{title}</span>
                      <button onClick={() => { setList([...list, ""]); setCondEdited(true); }} className="press text-xs text-brand font-semibold">+ เพิ่มข้อ</button>
                    </div>
                    <div className="space-y-1.5">
                      {list.map((c, ci) => (
                        <div key={ci} className="flex gap-1.5">
                          <textarea value={c} rows={c.length > 80 ? 3 : 1}
                            onChange={(e) => { setList(list.map((x, xi) => xi === ci ? e.target.value : x)); setCondEdited(true); }}
                            className="flex-1 glass rounded-md px-2.5 py-1.5 text-xs outline-none resize-y" />
                          <button onClick={() => { setList(list.filter((_, xi) => xi !== ci)); setCondEdited(true); }} aria-label="ลบข้อ"
                            className="press w-8 rounded-md inline-flex items-center justify-center text-red-700 bg-red-50 hover:bg-red-100 shrink-0"><Icon name="trash" size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {condEdited && (
                  <button onClick={() => { setCondWork([...CONDITIONS_WORK]); setCondQuote([...CONDITIONS_QUOTE]); setCondEdited(false); }}
                    className="press text-xs text-ink-3">↺ คืนค่ามาตรฐาน</button>
                )}
                <p className="text-[11px] text-ink-3">* ไม่แก้ = ใช้เงื่อนไขมาตรฐาน · แก้แล้วจะพิมพ์เฉพาะใบนี้</p>
              </div>
            )}
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
              <button onClick={exportCsv} className="press w-full glass-soft rounded-xl py-2.5 text-sm text-ink-2 inline-flex items-center justify-center gap-1.5">
                <Icon name="file" size={14} /> Export Excel (CSV)
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
