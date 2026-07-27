"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Zap, Save, Printer, Plus, Trash2, Highlighter, Layers } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Spinner, EmptyState } from "@/components/ui/primitives";
// generator ตัวจริง (pure JS ไม่มี type) — ใช้แค่ toShort สำหรับ preview โหมดสั้น ห้ามแก้ logic
import { toShort } from "@/lib/cover-sheet/generate.mjs";
import type {
  CoverColor, CoverContent, CoverGroup, CoverLine, CoverMode,
  CoverSheetGetResponse, GenerateResponse,
} from "@/lib/cover-sheet/types";
import { EMPTY_CONTENT } from "@/lib/cover-sheet/types";

const COLOR_LABEL: Record<CoverColor, string> = { "": "ดำ", red: "แดง", blue: "น้ำเงิน", green: "เขียว" };

function nextN(groups: CoverGroup[]): number {
  return groups.reduce((m, g) => Math.max(m, g.n), 0) + 1;
}

// ── แถวบรรทัดเดียว (ข้อความ + สี + ไฮไลต์ + ลบ) — ใช้ร่วมทั้งคอลัมน์ซ้าย/กลาง/ขวา ──
function LineRow({ line, onChange, onRemove }: {
  line: CoverLine;
  onChange: (patch: Partial<CoverLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <textarea
        value={line.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={1}
        placeholder="พิมพ์ข้อความ…"
        className="flex-1 min-w-0 resize-y rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 text-[13px] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
      />
      <select
        value={line.color ?? ""}
        onChange={(e) => onChange({ color: e.target.value as CoverColor })}
        aria-label="สีตัวอักษร"
        className="rounded-lg border border-white/15 bg-white/10 px-1.5 py-2 text-[12px] text-white focus:outline-none focus:ring-2 focus:ring-white/30"
        style={{ minHeight: 36 }}
      >
        {(Object.keys(COLOR_LABEL) as CoverColor[]).map((c) => (
          <option key={c} value={c} className="text-black">{COLOR_LABEL[c]}</option>
        ))}
      </select>
      <button type="button" onClick={() => onChange({ hl: !line.hl })} title="ไฮไลต์"
        className={`focusable pressable shrink-0 rounded-lg border ${line.hl ? "bg-yellow-300 text-black border-yellow-300" : "bg-white/10 text-white/60 border-white/15"}`}
        style={{ width: 36, height: 36 }}>
        <Highlighter size={14} className="mx-auto" />
      </button>
      <button type="button" onClick={onRemove} title="ลบบรรทัด"
        className="focusable pressable shrink-0 rounded-lg border border-rose-300/30 bg-rose-500/15 text-rose-200"
        style={{ width: 36, height: 36 }}>
        <Trash2 size={14} className="mx-auto" />
      </button>
    </div>
  );
}

function AddLineButton({ onClick, label = "+ เพิ่มบรรทัด" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick}
      className="focusable pressable inline-flex items-center gap-1 text-[12px] font-medium text-white/70 hover:text-white border border-dashed border-white/25 rounded-lg px-2.5 py-2 min-h-[36px]">
      <Plus size={13} /> {label}
    </button>
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

  // เติม state จากของเดิม (ครั้งแรกที่โหลดสำเร็จเท่านั้น — กันทับสิ่งที่กำลังแก้เมื่อ query refetch)
  useEffect(() => {
    const d = data?.data;
    if (!d || loadedOnce) return;
    if (d.cover) {
      setMode(d.cover.mode);
      setContent({
        floorNote: d.cover.content?.floorNote ?? d.job?.floor_note ?? "",
        groups: d.cover.content?.groups ?? [],
        midLines: d.cover.content?.midLines ?? [],
        rightLines: d.cover.content?.rightLines ?? [],
      });
    } else {
      setContent({ floorNote: d.job?.floor_note ?? "", groups: [], midLines: [], rightLines: [] });
    }
    setQuotationId(d.quotation?.id ?? null);
    setLoadedOnce(true);
  }, [data, loadedOnce]);

  const job = data?.data?.job ?? null;
  const quotation = data?.data?.quotation ?? null;
  const showFloorNote = !!job && job.floor_work && job.floor_work !== "none";

  // ── group (ซ้าย) mutations ──
  const updateGroupTitle = (gi: number, title: string) =>
    setContent((c) => ({ ...c, groups: c.groups.map((g, i) => (i !== gi ? g : { ...g, title })) }));
  const updateGroupLine = (gi: number, li: number, patch: Partial<CoverLine>) =>
    setContent((c) => ({ ...c, groups: c.groups.map((g, i) => (i !== gi ? g : { ...g, lines: g.lines.map((l, j) => (j !== li ? l : { ...l, ...patch })) })) }));
  const addGroupLine = (gi: number) =>
    setContent((c) => ({ ...c, groups: c.groups.map((g, i) => (i !== gi ? g : { ...g, lines: [...g.lines, { text: "", color: "", hl: false }] })) }));
  const removeGroupLine = (gi: number, li: number) =>
    setContent((c) => ({ ...c, groups: c.groups.map((g, i) => (i !== gi ? g : { ...g, lines: g.lines.filter((_, j) => j !== li) })) }));
  const addGroup = () =>
    setContent((c) => ({ ...c, groups: [...c.groups, { n: nextN(c.groups), title: `ชุด ${nextN(c.groups)}`, lines: [] }] }));
  const removeGroup = (gi: number) =>
    setContent((c) => ({ ...c, groups: c.groups.filter((_, i) => i !== gi) }));

  // ── mid/right (กลาง/ขวา) mutations ──
  const updateSideLine = (key: "midLines" | "rightLines", li: number, patch: Partial<CoverLine>) =>
    setContent((c) => ({ ...c, [key]: c[key].map((l, j) => (j !== li ? l : { ...l, ...patch })) }));
  const addSideLine = (key: "midLines" | "rightLines") =>
    setContent((c) => ({ ...c, [key]: [...c[key], { text: "", color: "", hl: false }] }));
  const removeSideLine = (key: "midLines" | "rightLines", li: number) =>
    setContent((c) => ({ ...c, [key]: c[key].filter((_, j) => j !== li) }));

  const doGenerate = async () => {
    if (content.groups.length > 0) {
      const yes = window.confirm("มีรายการ 'สั่งของเตรียมผลิต' อยู่แล้ว — สร้างอัตโนมัติจะทับชุดเดิมทั้งหมด (คอลัมน์กลาง/ขวาไม่หาย) ดำเนินการต่อ?");
      if (!yes) return;
    }
    setGenerating(true);
    try {
      const r = await api.post<GenerateResponse>(`/cover-sheets/${jobId}/generate`, {});
      setContent((c) => ({ ...c, groups: r.data.groups }));
      setQuotationId(r.data.quotation_id);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "สร้างอัตโนมัติไม่สำเร็จ");
    } finally {
      setGenerating(false);
    }
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await api.put(`/cover-sheets/${jobId}`, { mode, content, quotation_id: quotationId });
      setSaveMsg("บันทึกแล้ว");
      qc.invalidateQueries({ queryKey: ["cover-sheet", jobId] });
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const shortPreview = mode === "short" ? toShort(content.groups) : [];

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* หัวหน้า */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link href="/production" className="focusable pressable inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white">
          <ArrowLeft size={16} /> กลับ
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={doGenerate} disabled={generating || !quotation}
            title={!quotation ? "งานนี้ยังไม่มีใบเสนอราคา" : undefined}
            className="focusable pressable inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white bg-sky-500/80 disabled:opacity-40 min-h-[44px]">
            <Zap size={15} /> {generating ? "กำลังสร้าง…" : "สร้างอัตโนมัติจากใบเสนอ"}
          </button>
          <button type="button" onClick={doSave} disabled={saving}
            className="focusable pressable inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white bg-emerald-600/90 disabled:opacity-40 min-h-[44px]">
            <Save size={15} /> {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <Link href={`/cover-sheet/${jobId}/print`}
            className="focusable pressable inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white bg-white/15 border border-white/20 min-h-[44px]">
            <Printer size={15} /> พิมพ์
          </Link>
        </div>
      </div>

      {saveMsg && <div className="mb-3 rounded-lg bg-emerald-500/15 border border-emerald-300/30 text-emerald-100 text-[13px] px-3 py-2">{saveMsg}</div>}

      {isLoading ? <Spinner /> : error ? (
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" sub={error instanceof ApiError ? error.message : "ลองรีเฟรช"} />
      ) : (
        <>
          {/* ข้อมูลงาน */}
          <div className="glass-card rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-white font-semibold tnum">{job?.job_code}</div>
              <div className="text-[13px]" style={{ color: "var(--t-mid)" }}>{job?.customer_name}</div>
            </div>
            {showFloorNote && (
              <div className="flex-1 min-w-[220px] max-w-[420px]">
                <label className="text-[11px] block mb-1" style={{ color: "var(--t-low)" }}>พื้นช่าง (มุมขวาบนใบพิมพ์)</label>
                <input value={content.floorNote ?? ""} onChange={(e) => setContent((c) => ({ ...c, floorNote: e.target.value }))}
                  placeholder="พื้นช่าง ................"
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 text-[13px] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30" />
              </div>
            )}
            {/* toggle โหมด */}
            <div className="flex items-center gap-1 rounded-xl border border-white/15 p-1 bg-white/5">
              <button type="button" onClick={() => setMode("short")}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium min-h-[36px] ${mode === "short" ? "bg-white text-ink-1" : "text-white/70"}`}>รวมสั้น</button>
              <button type="button" onClick={() => setMode("grouped")}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium min-h-[36px] ${mode === "grouped" ? "bg-white text-ink-1" : "text-white/70"}`}>แยกตามชุด</button>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(420px,2fr)]">
            {/* ─── ซ้าย: ใบเสนอราคาอ้างอิง (read-only) ─── */}
            <div className="glass-card rounded-2xl p-4">
              <div className="text-[13px] font-semibold text-white mb-2 flex items-center justify-between">
                <span>ใบเสนอราคาอ้างอิง</span>
                {quotation && <span className="text-[12px] tnum" style={{ color: "var(--t-low)" }}>{quotation.code}</span>}
              </div>
              {!quotation ? (
                <div className="text-[13px]" style={{ color: "var(--t-low)" }}>งานนี้ยังไม่มีใบเสนอราคา</div>
              ) : quotation.items.length === 0 ? (
                <div className="text-[13px]" style={{ color: "var(--t-low)" }}>ใบเสนอนี้ยังไม่มีรายการ</div>
              ) : (
                <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
                  {quotation.items.map((it, i) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                      {it.group_label && <div className="text-[11px] font-medium text-sky-300 mb-0.5">{it.group_label}</div>}
                      <div className="text-[13px] font-medium text-white mb-1">{it.name}</div>
                      <div className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--t-mid)" }}>{it.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── ขวา: editor ใบปะหน้า ─── */}
            <div className="space-y-4">
              {/* คอลัมน์ 1: สั่งของเตรียมผลิต (groups) */}
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[13px] font-semibold text-white">รายละเอียด สั่งของเตรียมผลิต</div>
                  <button type="button" onClick={addGroup}
                    className="focusable pressable inline-flex items-center gap-1 text-[12px] font-medium text-white/70 hover:text-white border border-dashed border-white/25 rounded-lg px-2.5 py-2 min-h-[36px]">
                    <Layers size={13} /> เพิ่มชุด
                  </button>
                </div>

                {content.groups.length === 0 ? (
                  <EmptyState title="ยังไม่มีรายการ" sub="กด 'สร้างอัตโนมัติจากใบเสนอ' ด้านบน เพื่อดึงสเปคจากใบเสนอราคา หรือกด 'เพิ่มชุด' เพื่อกรอกเอง" />
                ) : (
                  <div className="space-y-3">
                    {content.groups.map((g, gi) => (
                      <div key={gi} className="rounded-xl border border-white/15 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-rose-300/60 text-rose-200 text-[11px] font-bold shrink-0">{g.n}</span>
                          <input value={g.title} onChange={(e) => updateGroupTitle(gi, e.target.value)}
                            placeholder="ชื่อชุด/จุดติดตั้ง"
                            className="flex-1 min-w-0 rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 text-[13px] text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/30" />
                          <button type="button" onClick={() => removeGroup(gi)} title="ลบชุดนี้"
                            className="focusable pressable shrink-0 rounded-lg border border-rose-300/30 bg-rose-500/15 text-rose-200" style={{ width: 36, height: 36 }}>
                            <Trash2 size={14} className="mx-auto" />
                          </button>
                        </div>
                        <div className="space-y-1.5 pl-1">
                          {g.lines.map((l, li) => (
                            <LineRow key={li} line={l}
                              onChange={(patch) => updateGroupLine(gi, li, patch)}
                              onRemove={() => removeGroupLine(gi, li)} />
                          ))}
                          <AddLineButton onClick={() => addGroupLine(gi)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* preview โหมดสั้น */}
                {mode === "short" && content.groups.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="text-[11px] font-medium mb-1.5" style={{ color: "var(--t-low)" }}>ตัวอย่างที่จะพิมพ์ (โหมดรวมสั้น)</div>
                    <ul className="text-[12.5px] space-y-0.5" style={{ color: "var(--t-mid)" }}>
                      {shortPreview.map((s, i) => (
                        <li key={i}>
                          - {s.text}
                          {s.ref && <span className="text-sky-300 text-[11px] ml-1">({s.ref})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* คอลัมน์ 2: แจ้งช่างตอนติดตั้ง (midLines) */}
              <div className="glass-card rounded-2xl p-4">
                <div className="text-[13px] font-semibold text-rose-200 mb-3">รายละเอียด แจ้งช่างตอนติดตั้ง</div>
                <div className="space-y-1.5">
                  {content.midLines.map((l, li) => (
                    <LineRow key={li} line={l}
                      onChange={(patch) => updateSideLine("midLines", li, patch)}
                      onRemove={() => removeSideLine("midLines", li)} />
                  ))}
                  <AddLineButton onClick={() => addSideLine("midLines")} />
                </div>
              </div>

              {/* คอลัมน์ 3: แจ้งลูกค้า + เตรียมของติดตั้ง (rightLines) */}
              <div className="glass-card rounded-2xl p-4">
                <div className="text-[13px] font-semibold text-rose-200 mb-3">รายละเอียดแจ้งลูกค้า + เตรียมของติดตั้ง</div>
                <div className="space-y-1.5">
                  {content.rightLines.map((l, li) => (
                    <LineRow key={li} line={l}
                      onChange={(patch) => updateSideLine("rightLines", li, patch)}
                      onRemove={() => removeSideLine("rightLines", li)} />
                  ))}
                  <AddLineButton onClick={() => addSideLine("rightLines")} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
