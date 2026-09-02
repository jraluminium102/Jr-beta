"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Zap, Save, Printer, Plus, Trash2, Highlighter, Layers, PenSquare, TriangleAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { thDate } from "@/lib/format";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import type {
  CoverColor, CoverContent, CoverLine, CoverMode,
  CoverSheetGetResponse, GenerateResponse,
} from "@/lib/cover-sheet/types";
import { EMPTY_CONTENT, WARN_PRESETS, effectiveHl } from "@/lib/cover-sheet/types";
import { HIGHLIGHT_HEX, nextHighlight } from "@/lib/highlight-colors";

const COLOR_HEX: Record<CoverColor, string> = { "": "#111827", red: "#c00000", blue: "#1a56db", green: "#15803d" };
const COLOR_LABEL: Record<CoverColor, string> = { "": "ดำ", red: "แดง", blue: "น้ำเงิน", green: "เขียว" };
const nextN = (left: CoverLine[]) => left.reduce((m, l) => Math.max(m, l.kind === "group" ? (l.n ?? 0) : 0), 0) + 1;

// ── บรรทัด spec (บุลเลท) ในคอลัมน์ซ้าย — พื้นขาว อ่านออกชัด ──
function SpecRow({ line, onChange, onRemove }: {
  line: CoverLine; onChange: (p: Partial<CoverLine>) => void; onRemove: () => void;
}) {
  const hl = effectiveHl(line);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-400 select-none">–</span>
      <input
        value={line.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="พิมพ์รายการ…"
        style={{ color: COLOR_HEX[line.color ?? ""], background: hl ? HIGHLIGHT_HEX[hl] : "#fff" }}
        className="flex-1 min-w-0 rounded-md border border-gray-300 px-2.5 py-2 text-[15px] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
      />
      <select
        value={line.color ?? ""} onChange={(e) => onChange({ color: e.target.value as CoverColor })}
        aria-label="สี" title="สีตัวอักษร"
        className="rounded-md border border-gray-300 bg-white px-1.5 py-2 text-[13px] text-gray-800 focus:outline-none"
        style={{ color: COLOR_HEX[line.color ?? ""] }}
      >
        {(Object.keys(COLOR_LABEL) as CoverColor[]).map((c) => <option key={c} value={c}>{COLOR_LABEL[c]}</option>)}
      </select>
      {/* กดวนสีไฮไลต์: ไม่มี→เหลือง→เขียว→ชมพู→ฟ้า→ส้ม→ไม่มี — เขียนทั้ง hlc(ใหม่)+hl(เก่า sync ไว้กันหน้าจอ/รายงานเก่าอ่าน boolean) */}
      <button type="button" onClick={() => { const n = nextHighlight(hl); onChange({ hlc: n, hl: n !== "" }); }}
        title={`ไฮไลต์: ${hl ? hl : "ไม่มี"} (กดเปลี่ยน)`}
        style={hl ? { background: HIGHLIGHT_HEX[hl] } : undefined}
        className={`shrink-0 rounded-md border w-8 h-8 grid place-items-center ${hl ? "border-gray-400 text-black" : "bg-white border-gray-300 text-gray-400 hover:text-gray-700"}`}>
        <Highlighter size={14} />
      </button>
      <button type="button" onClick={onRemove} title="ลบ"
        className="shrink-0 rounded-md border border-gray-200 bg-white w-8 h-8 grid place-items-center text-gray-400 hover:text-rose-600 hover:border-rose-200">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function CoverSheetEditorPage({ params }: { params: { jobId: string } }) {
  const jobId = params.jobId;
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cover-sheet", jobId],
    queryFn: () => api.get<CoverSheetGetResponse>(`/cover-sheets/${jobId}`),
  });

  const [mode, setMode] = useState<CoverMode>("short");
  const [content, setContent] = useState<CoverContent>(EMPTY_CONTENT);
  const [quotationId, setQuotationId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [changingQuote, setChangingQuote] = useState(false); // (0136) กำลังสลับใบเสนอ/rev ที่ pin ไว้
  const [measurer, setMeasurer] = useState("");     // ตัวช่วย "วัดงาน" — ชื่อคนวัด
  const [measureDate, setMeasureDate] = useState(""); // วันวัด (YYYY-MM-DD)

  // เตือน "มีของยังไม่บันทึก" (เจ้าของสั่ง 25 ส.ค.69) — เทียบ 4 ตัวที่แก้ได้ (content/mode/measurer/measureDate)
  // กับ snapshot ล่าสุดที่โหลด/บันทึกแล้ว · savedRef กัน false-positive ตอนโหลดครั้งแรก
  const savedRef = useRef<string>("");
  // (0136) true = เพิ่งกด "สร้าง/อัปเดตจากใบเสนอล่าสุด" → บันทึกครั้งถัดไปส่ง sync_rev เคลียร์ป้ายเตือน (เซฟแก้ typo เฉย ๆ ไม่เคลียร์)
  const pulledRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const d = data?.data;
    if (!d || loadedOnce) return;
    const c = d.cover?.content;
    const loadedMode = d.cover?.mode ?? "short";
    const loadedContent: CoverContent = {
      floorNote: c?.floorNote ?? d.job?.floor_note ?? "",
      warnings: c?.warnings ?? [],
      left: c?.left ?? [],
      mid: c?.mid ?? [],
      right: c?.right ?? [],
    };
    setMode(loadedMode);
    setContent(loadedContent);
    setQuotationId(d.quotation?.id ?? null);
    setLoadedOnce(true);
    savedRef.current = JSON.stringify({ mode: loadedMode, content: loadedContent, measurer: "", measureDate: "" });
    setDirty(false);
  }, [data, loadedOnce]);

  useEffect(() => {
    if (!loadedOnce) return;
    setDirty(JSON.stringify({ mode, content, measurer, measureDate }) !== savedRef.current);
  }, [loadedOnce, mode, content, measurer, measureDate]);

  useUnsavedWarning(dirty);

  const job = data?.data?.job ?? null;
  const quotation = data?.data?.quotation ?? null;
  const quotationOptions = data?.data?.quotations ?? []; // (0136) รายการใบเสนอ/rev ให้เลือก
  const revStale = !!data?.data?.rev_stale;               // (0136) ใบเสนอถูก Rev หลังสร้างใบปะหน้านี้
  const showFloorNote = !!job && job.floor_work && job.floor_work !== "none";

  // ── left mutations ──
  const patchLeft = (i: number, p: Partial<CoverLine>) =>
    setContent((c) => ({ ...c, left: c.left.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const removeLeft = (i: number) =>
    setContent((c) => ({ ...c, left: c.left.filter((_, j) => j !== i) }));
  const addSpec = () =>
    setContent((c) => ({ ...c, left: [...c.left, { text: "", color: "", hl: false, kind: "spec" }] }));
  const addGroupHead = () =>
    setContent((c) => ({ ...c, left: [...c.left, { text: "", kind: "group", n: nextN(c.left) }] }));

  // ── mid/right = textarea (บรรทัดละโน้ต) ──
  const sideText = (key: "mid" | "right") => content[key].map((l) => l.text).join("\n");
  const setSideText = (key: "mid" | "right", v: string) =>
    setContent((c) => ({ ...c, [key]: v.split("\n").map((t) => ({ text: t, color: "" as CoverColor, hl: false })) }));

  // ── คำเตือนมุมซ้ายบน ──
  const toggleWarn = (w: string) => setContent((c) => {
    const cur = c.warnings ?? [];
    return { ...c, warnings: cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w] };
  });
  const addCustomWarn = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setContent((c) => ({ ...c, warnings: (c.warnings ?? []).includes(t) ? (c.warnings ?? []) : [...(c.warnings ?? []), t] }));
  };

  // ตัวช่วย "วัดงาน" → แทรก "พี่{คนวัด}วัดงาน {วันที่}" ไว้บนสุดของช่องแจ้งช่าง
  const addMeasureNote = () => {
    const name = measurer.trim();
    if (!name) return;
    const d = measureDate ? measureDate.split("-").reverse().join("/") : ""; // YYYY-MM-DD → DD/MM/YYYY
    const note = `พี่${name}วัดงาน${d ? " " + d : ""}`;
    setContent((c) => ({ ...c, mid: [{ text: note, color: "" as CoverColor, hl: false }, ...c.mid] }));
    setMeasurer(""); setMeasureDate("");
  };

  const doGenerate = async () => {
    if (content.left.length > 0 && !window.confirm("จะสร้างใหม่ตามโหมดนี้ — รายการ 'สั่งของเตรียมผลิต' เดิมจะถูกแทนที่ · ช่องแจ้งช่าง/ลูกค้าจะเติมจากหมายเหตุใบเสนอ (ที่พิมพ์เองไว้ไม่หาย) ต่อไหม?")) return;
    setGenerating(true);
    try {
      // ส่ง quotation_id ปัจจุบัน (ที่ pin ไว้/เลือกจากดรอปดาวน์) ไปด้วย — กันเผลอสลับไปใบอื่นตอนสร้างซ้ำ (0136)
      const r = await api.post<GenerateResponse>(`/cover-sheets/${jobId}/generate`, { mode, quotation_id: quotationId ?? undefined });
      // แจ้งช่าง(mid)/แจ้งลูกค้า(right): เติมบรรทัดใหม่จากหมายเหตุ ต่อท้ายของที่พิมพ์เอง (dedup ตามข้อความ · ของเดิมไม่หาย)
      const mergeSide = (existing: CoverLine[], incoming?: CoverLine[]) => {
        const seen = new Set(existing.map((l) => l.text.trim()).filter(Boolean));
        const add = (incoming ?? []).filter((l) => l.text.trim() && !seen.has(l.text.trim()));
        return [...existing, ...add];
      };
      setContent((c) => ({
        ...c,
        left: r.data.left,
        mid: mergeSide(c.mid, r.data.mid),
        right: mergeSide(c.right, r.data.right),
      }));
      setQuotationId(r.data.quotation_id);
      pulledRef.current = true; // ดึงจากใบเสนอล่าสุดแล้ว — เซฟรอบถัดไปจะเคลียร์ป้ายเตือน
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "สร้างอัตโนมัติไม่สำเร็จ");
    } finally { setGenerating(false); }
  };

  // (0136) สลับใบเสนอ/rev ที่ใช้อ้างอิง — pin อย่างเดียว (ไม่ส่ง content = ไม่ทับของที่ยังไม่เซฟ) แล้ว refetch โชว์รายการของใบที่เลือก
  const doChangeQuotation = async (newId: number) => {
    setChangingQuote(true);
    try {
      await api.put(`/cover-sheets/${jobId}`, { quotation_id: newId }); // pin-only · ไม่แตะ content/dirty
      setQuotationId(newId);
      await qc.invalidateQueries({ queryKey: ["cover-sheet", jobId] });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "เปลี่ยนใบเสนออ้างอิงไม่สำเร็จ");
    } finally { setChangingQuote(false); }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await api.put(`/cover-sheets/${jobId}`, { mode, content, quotation_id: quotationId, sync_rev: pulledRef.current });
      pulledRef.current = false;
      setSaveMsg("บันทึกแล้ว ✓");
      savedRef.current = JSON.stringify({ mode, content, measurer, measureDate });
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["cover-sheet", jobId] });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const btn = "focusable pressable inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold min-h-[44px] disabled:opacity-40";

  return (
    <div className="max-w-[1500px] mx-auto pb-10">
      {/* แถบบน */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link href="/production" className="focusable pressable inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
          <ArrowLeft size={16} /> กลับหน้าผลิต
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          {/* โหมดสร้าง */}
          <div className="flex items-center gap-1 rounded-xl border border-white/20 p-1 bg-white/10">
            {(["short", "grouped"] as CoverMode[]).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium min-h-[36px] ${mode === m ? "bg-white text-gray-900" : "text-white/80"}`}>
                {m === "short" ? "รวมสั้น" : "แยกตามชุด"}
              </button>
            ))}
          </div>
          <button type="button" onClick={doGenerate} disabled={generating || !quotation}
            title={!quotation ? "งานนี้ยังไม่มีใบเสนอราคา" : undefined}
            className={`${btn} text-white bg-sky-500`}>
            <Zap size={15} /> {generating ? "กำลังสร้าง…" : "สร้างอัตโนมัติ"}
          </button>
          <button type="button" onClick={doSave} disabled={saving} className={`${btn} text-white bg-emerald-600`}>
            <Save size={15} /> {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <Link href={`/cover-sheet/${jobId}/print`} className={`${btn} text-gray-900 bg-white`}>
            <Printer size={15} /> พิมพ์
          </Link>
          {/* สแตมป์สเปคลงแบบ (PDF) — เฉพาะงานมัดจำแล้ว (เกณฑ์เดียวกับที่ระบบใช้ทั้งระบบ: deposit_date ไม่ว่าง) */}
          {job?.deposit_date ? (
            <Link href={`/cover-sheet/${jobId}/drawing`} className={`${btn} text-white bg-violet-600`}>
              <PenSquare size={15} /> สแตมป์สเปคลงแบบ
            </Link>
          ) : (
            <span title="ต้องมัดจำก่อนถึงจะสแตมป์สเปคลงแบบได้" className={`${btn} text-white/50 bg-white/10 cursor-not-allowed`}>
              <PenSquare size={15} /> สแตมป์สเปคลงแบบ
            </span>
          )}
        </div>
      </div>

      {saveMsg && <div className="mb-3 rounded-lg bg-emerald-500 text-white text-[13px] font-medium px-3 py-2 inline-block">{saveMsg}</div>}

      {isLoading ? <Spinner /> : error ? (
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" sub={error instanceof ApiError ? error.message : "ลองรีเฟรช"} />
      ) : (
        <>
          {/* ชื่อลูกค้า — ตัวใหญ่ กลางจอ (ให้เห็นชัดในหน้าแก้ไข ไม่ต้องกดพิมพ์) */}
          <div className="text-center mb-4">
            <span className="text-white/70 text-[15px]">ชื่อลูกค้า</span>{" "}
            <span className="text-white text-2xl font-bold">{job?.customer_name || "—"}</span>
            {job?.job_code && <span className="text-white/50 text-[13px] ml-2 tnum">({job.job_code})</span>}
          </div>

          {/* แถบข้อมูลงาน (การ์ดขาว อ่านง่าย) */}
          <div className="rounded-2xl bg-white border border-black/10 shadow-sm p-4 mb-4 flex items-start gap-4 flex-wrap">
            {/* ⚠️ คำเตือนมุมซ้ายบนใบพิมพ์ — เลือกจากดรอปดาวน์/พิมพ์เพิ่ม */}
            <div className="flex-1 min-w-[280px]">
              <label className="text-[11px] block mb-1 text-gray-500">⚠️ คำเตือน (มุมซ้ายบนใบพิมพ์) — เลือก / พิมพ์เพิ่ม</label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {WARN_PRESETS.map((w) => {
                  const on = (content.warnings ?? []).includes(w);
                  return (
                    <button key={w} type="button" onClick={() => toggleWarn(w)}
                      className={`text-[12px] rounded-full px-2.5 py-1.5 border ${on ? "bg-rose-600 text-white border-rose-600" : "bg-white text-gray-700 border-gray-300 hover:border-rose-300"}`}>
                      {on ? "✓ " : ""}{w}
                    </button>
                  );
                })}
                {(content.warnings ?? []).filter((w) => !WARN_PRESETS.includes(w)).map((w) => (
                  <span key={w} className="inline-flex items-center gap-1 text-[12px] rounded-full px-2.5 py-1.5 bg-rose-600 text-white">
                    {w}<button type="button" onClick={() => toggleWarn(w)} title="ลบ" className="ml-0.5 leading-none">✕</button>
                  </span>
                ))}
                <input placeholder="พิมพ์เตือนเอง + Enter"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomWarn(e.currentTarget.value); e.currentTarget.value = ""; } }}
                  className="text-[13px] text-gray-900 placeholder-gray-400 rounded-full px-3 py-2 border border-gray-300 bg-white w-52 focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
            </div>
            <div className="flex-1 min-w-[220px] max-w-[420px]">
              <label className="text-[11px] block mb-1 text-gray-500">🧱 งานพื้น (มุมขวาบนใบพิมพ์) — กรอกได้เลย</label>
              <input value={content.floorNote ?? ""} onChange={(e) => setContent((c) => ({ ...c, floorNote: e.target.value }))}
                placeholder="เช่น พื้นช่าง / งานพื้น ผรม. / ปูกระเบื้องก่อน"
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300" />
            </div>
          </div>

          <div className="space-y-4">
            {/* ⚠ (0136) ใบเสนอถูก Rev หลังสร้างใบปะหน้านี้ — ไม่ทับของที่แก้มือ แค่เตือนให้กดอัปเดตเอง */}
            {revStale && (
              <div className="rounded-2xl bg-orange-50 border border-orange-300 text-orange-900 text-[13px] px-4 py-3 flex items-center gap-2.5 flex-wrap">
                <TriangleAlert size={16} className="shrink-0 text-orange-600" />
                <span>ใบเสนอราคาที่อ้างอิงอยู่ถูก <b>Rev</b> หลังสร้างใบปะหน้านี้ — เนื้อหาด้านล่างอาจไม่ตรงกับใบเสนอปัจจุบันแล้ว</span>
                <button type="button" onClick={doGenerate} disabled={generating}
                  className="ml-auto shrink-0 rounded-lg bg-orange-600 text-white text-[12.5px] font-semibold px-3 py-2 min-h-[38px] disabled:opacity-40">
                  {generating ? "กำลังดึง…" : "สร้าง/อัปเดตจากใบเสนอล่าสุด"}
                </button>
              </div>
            )}

            {/* ─── ใบเสนอราคาอ้างอิง (ด้านบน · เต็มกว้าง · รายการเรียงหลายคอลัมน์ พับเลื่อนได้) ─── */}
            <details open className="rounded-2xl bg-white border border-black/10 shadow-sm">
              <summary className="cursor-pointer select-none text-[13px] font-bold text-gray-800 p-4 flex items-center justify-between">
                <span>📄 ใบเสนอราคาอ้างอิง <span className="text-gray-400 font-normal">(กดเพื่อย่อ/ขยาย)</span></span>
                {quotation && <span className="text-[12px] tnum text-gray-400">{quotation.code}</span>}
              </summary>
              <div className="px-4 pb-4">
                {/* (0136) เลือกใบเสนอ/rev เอง — default = ใบที่ pin ไว้/เลือกอัตโนมัติ (บิลก่อน/ล่าสุด) */}
                {quotationOptions.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-3" onClick={(e) => e.stopPropagation()}>
                    <label htmlFor="cover-quote-select" className="text-[12px] text-gray-500 shrink-0">อ้างอิงใบเสนอ/rev:</label>
                    <select id="cover-quote-select" value={quotationId ?? ""} disabled={changingQuote}
                      onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== quotationId) doChangeQuotation(v); }}
                      className="text-[13px] rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-gray-900 min-h-[38px] focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50">
                      {quotationOptions.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.code}{q.revision_no ? ` · Rev ${q.revision_no}` : ""}{q.revision_label ? ` (${q.revision_label})` : ""} · {thDate(q.created_at)}{q.has_bill ? " · มีบิล" : ""}
                        </option>
                      ))}
                    </select>
                    {changingQuote && <span className="text-[12px] text-gray-400">กำลังเปลี่ยน…</span>}
                  </div>
                )}
                {!quotation ? (
                  <div className="text-[13px] text-gray-400">งานนี้ยังไม่มีใบเสนอราคา</div>
                ) : (
                  // การ์ดต่อข้อ — auto-fit: ข้อน้อยขยายเต็มความกว้าง (อ่านง่าย ไม่บีบเป็นแถบแคบสูง) · ข้อเยอะค่อยแตกหลายคอลัมน์ (≥420px/คอลัมน์)
                  <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))]">
                    {quotation.items.map((it, i) => (
                      <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="flex items-start gap-2 mb-1.5">
                          <span className="shrink-0 mt-0.5 inline-grid place-items-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10.5px] font-bold tnum">{i + 1}</span>
                          <div className="min-w-0">
                            {it.group_label && <div className="text-[11px] font-medium text-sky-700 leading-tight">{it.group_label}</div>}
                            <div className="text-[14px] font-semibold text-gray-900 leading-snug">{it.name}</div>
                          </div>
                        </div>
                        <div className="text-[13.5px] whitespace-pre-wrap text-gray-700 leading-relaxed pl-7">{it.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>

            {/* ─── ใบปะหน้า (3 คอลัมน์ · เต็มกว้าง) — minmax(0,..) ให้ทุกคอลัมน์หดได้เท่ากัน ─── */}
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              {/* คอลัมน์ 1: สั่งของเตรียมผลิต */}
              <div className="rounded-2xl bg-white border border-black/10 shadow-sm p-4">
                <div className="font-bold text-gray-900 text-[13.5px] mb-1 underline underline-offset-2">รายละเอียด สั่งของเตรียมผลิต</div>
                <div className="text-[11px] text-gray-400 mb-3">
                  {mode === "short" ? "โหมดรวมสั้น — รายการล้วน (สเปคซ้ำหลายชุดรวมกัน)" : "โหมดแยกตามชุด — มีหัวข้อชุด + เลข"}
                </div>
                {content.left.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-[13px] text-gray-500">
                    ยังไม่มีรายการ<br />กด <b className="text-sky-600">สร้างอัตโนมัติ</b> เพื่อดึงสเปคจากใบเสนอ<br />หรือกดปุ่มด้านล่างเพื่อกรอกเอง
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {content.left.map((l, i) => l.kind === "group" ? (
                      <div key={i} className="flex items-center gap-1.5 pt-1.5">
                        <span className="inline-grid place-items-center w-6 h-6 rounded-full border-[1.6px] border-rose-500 text-rose-600 text-[11px] font-bold shrink-0">{l.n}</span>
                        <input value={l.text} onChange={(e) => patchLeft(i, { text: e.target.value })}
                          placeholder="ชื่อชุด / จุดติดตั้ง"
                          className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[13.5px] font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-300" />
                        <button type="button" onClick={() => removeLeft(i)} title="ลบหัวข้อชุด"
                          className="shrink-0 rounded-md border border-gray-200 bg-white w-8 h-8 grid place-items-center text-gray-400 hover:text-rose-600">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <SpecRow key={i} line={l} onChange={(p) => patchLeft(i, p)} onRemove={() => removeLeft(i)} />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button type="button" onClick={addSpec}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-sky-700 border border-dashed border-sky-300 rounded-lg px-2.5 py-2 min-h-[38px] hover:bg-sky-50">
                    <Plus size={13} /> เพิ่มบรรทัด
                  </button>
                  <button type="button" onClick={addGroupHead}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg px-2.5 py-2 min-h-[38px] hover:bg-gray-50">
                    <Layers size={13} /> เพิ่มหัวข้อชุด
                  </button>
                </div>
              </div>

              {/* คอลัมน์ 2: แจ้งช่าง (textarea แดง) */}
              <div className="rounded-2xl bg-white border border-black/10 shadow-sm p-4">
                <div className="font-bold text-[#c00000] text-[13.5px] mb-1 underline underline-offset-2">รายละเอียด แจ้งช่างตอนติดตั้ง</div>
                <div className="text-[11px] text-gray-400 mb-2">กรอกเอง — 1 บรรทัด/โน้ต (เช่น พี่เนียน วัดงาน)</div>
                {/* ตัวช่วย "วัดงาน" — กรอกคนวัด+วันที่(จิ้มปฏิทิน) กด+เพิ่ม → แทรก "พี่..วัดงาน วว/ดด/ปปปป" บนสุด */}
                <div className="mb-2 rounded-lg bg-rose-50 border border-rose-200 p-2.5">
                  <div className="text-[12px] font-semibold text-rose-700 mb-1.5">📏 ใส่วันวัดงาน (เขียนให้อัตโนมัติ)</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={measurer} onChange={(e) => setMeasurer(e.target.value)} placeholder="ชื่อคนวัด เช่น เป"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMeasureNote(); } }}
                      className="min-w-[110px] flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-2 text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-200" />
                    <input type="date" value={measureDate} onChange={(e) => setMeasureDate(e.target.value)} title="เลือกวันวัดงาน"
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-2 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200" />
                    <button type="button" onClick={addMeasureNote} disabled={!measurer.trim()}
                      className="shrink-0 rounded-md bg-rose-600 text-white text-[13px] font-semibold px-3.5 py-2 min-h-[38px] disabled:opacity-40">+ เพิ่มลงช่องล่าง</button>
                  </div>
                </div>
                <textarea
                  value={sideText("mid")}
                  onChange={(e) => setSideText("mid", e.target.value)}
                  placeholder="พี่…… วัดงาน&#10;รื้อของเดิม พร้อมเก็บสี"
                  rows={10}
                  className="w-full min-h-[220px] resize-y rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-[15px] text-[#c00000] leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              {/* คอลัมน์ 3: แจ้งลูกค้า (textarea) */}
              <div className="rounded-2xl bg-white border border-black/10 shadow-sm p-4">
                <div className="font-bold text-[#c00000] text-[13.5px] mb-1 underline underline-offset-2">แจ้งลูกค้า + เตรียมของติดตั้ง</div>
                <div className="text-[11px] text-gray-400 mb-2">กรอกเอง — 1 บรรทัด/โน้ต (เช่น สีเก็บงาน)</div>
                <textarea
                  value={sideText("right")}
                  onChange={(e) => setSideText("right", e.target.value)}
                  placeholder="สีเก็บงาน"
                  rows={10}
                  className="w-full min-h-[220px] resize-y rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-[15px] text-gray-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
