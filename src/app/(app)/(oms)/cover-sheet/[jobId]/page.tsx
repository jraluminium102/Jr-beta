"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Zap, Save, Printer, Plus, Trash2, Highlighter, Layers } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/primitives";
import type {
  CoverColor, CoverContent, CoverLine, CoverMode,
  CoverSheetGetResponse, GenerateResponse,
} from "@/lib/cover-sheet/types";
import { EMPTY_CONTENT, WARN_PRESETS } from "@/lib/cover-sheet/types";

const COLOR_HEX: Record<CoverColor, string> = { "": "#111827", red: "#c00000", blue: "#1a56db", green: "#15803d" };
const COLOR_LABEL: Record<CoverColor, string> = { "": "ดำ", red: "แดง", blue: "น้ำเงิน", green: "เขียว" };
const nextN = (left: CoverLine[]) => left.reduce((m, l) => Math.max(m, l.kind === "group" ? (l.n ?? 0) : 0), 0) + 1;

// textarea ที่ยืดสูงตามเนื้อหา
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = el.scrollHeight + "px";
}

// ── บรรทัด spec (บุลเลท) ในคอลัมน์ซ้าย — พื้นขาว อ่านออกชัด ──
function SpecRow({ line, onChange, onRemove }: {
  line: CoverLine; onChange: (p: Partial<CoverLine>) => void; onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-400 select-none">–</span>
      <input
        value={line.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="พิมพ์รายการ…"
        style={{ color: COLOR_HEX[line.color ?? ""], background: line.hl ? "#fff35b" : "#fff" }}
        className="flex-1 min-w-0 rounded-md border border-gray-300 px-2 py-1.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-sky-300"
      />
      <select
        value={line.color ?? ""} onChange={(e) => onChange({ color: e.target.value as CoverColor })}
        aria-label="สี" title="สีตัวอักษร"
        className="rounded-md border border-gray-300 bg-white px-1 py-1.5 text-[12px] text-gray-800 focus:outline-none"
        style={{ color: COLOR_HEX[line.color ?? ""] }}
      >
        {(Object.keys(COLOR_LABEL) as CoverColor[]).map((c) => <option key={c} value={c}>{COLOR_LABEL[c]}</option>)}
      </select>
      <button type="button" onClick={() => onChange({ hl: !line.hl })} title="ไฮไลต์"
        className={`shrink-0 rounded-md border w-8 h-8 grid place-items-center ${line.hl ? "bg-yellow-300 border-yellow-400 text-black" : "bg-white border-gray-300 text-gray-400 hover:text-gray-700"}`}>
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
  const [measurer, setMeasurer] = useState("");     // ตัวช่วย "วัดงาน" — ชื่อคนวัด
  const [measureDate, setMeasureDate] = useState(""); // วันวัด (YYYY-MM-DD)

  useEffect(() => {
    const d = data?.data;
    if (!d || loadedOnce) return;
    const c = d.cover?.content;
    setMode(d.cover?.mode ?? "short");
    setContent({
      floorNote: c?.floorNote ?? d.job?.floor_note ?? "",
      warnings: c?.warnings ?? [],
      left: c?.left ?? [],
      mid: c?.mid ?? [],
      right: c?.right ?? [],
    });
    setQuotationId(d.quotation?.id ?? null);
    setLoadedOnce(true);
  }, [data, loadedOnce]);

  const job = data?.data?.job ?? null;
  const quotation = data?.data?.quotation ?? null;
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
    if (content.left.length > 0 && !window.confirm("จะสร้างใหม่ตามโหมดนี้ — รายการ 'สั่งของเตรียมผลิต' เดิมจะถูกแทนที่ (คอลัมน์แจ้งช่าง/ลูกค้าไม่หาย) ต่อไหม?")) return;
    setGenerating(true);
    try {
      const r = await api.post<GenerateResponse>(`/cover-sheets/${jobId}/generate`, { mode });
      setContent((c) => ({ ...c, left: r.data.left }));
      setQuotationId(r.data.quotation_id);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "สร้างอัตโนมัติไม่สำเร็จ");
    } finally { setGenerating(false); }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await api.put(`/cover-sheets/${jobId}`, { mode, content, quotation_id: quotationId });
      setSaveMsg("บันทึกแล้ว ✓");
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
        </div>
      </div>

      {saveMsg && <div className="mb-3 rounded-lg bg-emerald-500 text-white text-[13px] font-medium px-3 py-2 inline-block">{saveMsg}</div>}

      {isLoading ? <Spinner /> : error ? (
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" sub={error instanceof ApiError ? error.message : "ลองรีเฟรช"} />
      ) : (
        <>
          {/* แถบข้อมูลงาน (การ์ดขาว อ่านง่าย) */}
          <div className="rounded-2xl bg-white border border-black/10 shadow-sm p-4 mb-4 flex items-start gap-4 flex-wrap">
            <div>
              <div className="text-gray-900 font-bold tnum">{job?.job_code}</div>
              <div className="text-[13px] text-gray-500">{job?.customer_name}</div>
            </div>
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
                  className="text-[12px] rounded-full px-2.5 py-1.5 border border-gray-300 bg-white w-44 focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
            </div>
            {showFloorNote && (
              <div className="flex-1 min-w-[220px] max-w-[420px]">
                <label className="text-[11px] block mb-1 text-gray-500">พื้นช่าง (มุมขวาบนใบพิมพ์ · เฉพาะงานมี ผรม.)</label>
                <input value={content.floorNote ?? ""} onChange={(e) => setContent((c) => ({ ...c, floorNote: e.target.value }))}
                  placeholder="เช่น พื้นช่างเพยาว์"
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
            )}
          </div>

          <div className="grid gap-4 grid-cols-1 xl:grid-cols-[320px_1fr]">
            {/* ─── ใบเสนอราคาอ้างอิง (การ์ดขาว) ─── */}
            <div className="rounded-2xl bg-white border border-black/10 shadow-sm p-4 h-max">
              <div className="text-[13px] font-bold text-gray-800 mb-2 flex items-center justify-between">
                <span>📄 ใบเสนอราคาอ้างอิง</span>
                {quotation && <span className="text-[12px] tnum text-gray-400">{quotation.code}</span>}
              </div>
              {!quotation ? (
                <div className="text-[13px] text-gray-400">งานนี้ยังไม่มีใบเสนอราคา</div>
              ) : (
                <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
                  {quotation.items.map((it, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                      {it.group_label && <div className="text-[11px] font-medium text-sky-700 mb-0.5">{it.group_label}</div>}
                      <div className="text-[13px] font-semibold text-gray-900 mb-1">{it.name}</div>
                      <div className="text-[12px] whitespace-pre-wrap text-gray-600 leading-relaxed">{it.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── ใบปะหน้า (3 คอลัมน์ · การ์ดขาว) ─── */}
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
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
                {/* ตัวช่วย "วัดงาน" — กรอกคนวัด+วันที่ → เขียน "พี่..วัดงาน วว/ดด/ปปปป" ให้ */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2 rounded-lg bg-rose-50 border border-rose-100 p-2">
                  <span className="text-[11px] font-medium text-rose-700 shrink-0">📏 วัดงาน:</span>
                  <input value={measurer} onChange={(e) => setMeasurer(e.target.value)} placeholder="ชื่อคนวัด (เช่น เป)"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMeasureNote(); } }}
                    className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[12.5px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200" />
                  <input type="date" value={measureDate} onChange={(e) => setMeasureDate(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-1.5 py-1.5 text-[12px] text-gray-800 focus:outline-none" />
                  <button type="button" onClick={addMeasureNote} disabled={!measurer.trim()}
                    className="shrink-0 rounded-md bg-rose-600 text-white text-[12px] font-medium px-2.5 py-1.5 disabled:opacity-40">+ เพิ่ม</button>
                </div>
                <textarea
                  ref={autoGrow}
                  value={sideText("mid")}
                  onChange={(e) => { setSideText("mid", e.target.value); autoGrow(e.target); }}
                  placeholder="พี่…… วัดงาน&#10;รื้อของเดิม พร้อมเก็บสี"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[13.5px] text-[#c00000] leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>

              {/* คอลัมน์ 3: แจ้งลูกค้า (textarea) */}
              <div className="rounded-2xl bg-white border border-black/10 shadow-sm p-4">
                <div className="font-bold text-[#c00000] text-[13.5px] mb-1 underline underline-offset-2">แจ้งลูกค้า + เตรียมของติดตั้ง</div>
                <div className="text-[11px] text-gray-400 mb-3">กรอกเอง — 1 บรรทัด/โน้ต (เช่น สีเก็บงาน)</div>
                <textarea
                  ref={autoGrow}
                  value={sideText("right")}
                  onChange={(e) => { setSideText("right", e.target.value); autoGrow(e.target); }}
                  placeholder="สีเก็บงาน"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[13.5px] text-gray-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
