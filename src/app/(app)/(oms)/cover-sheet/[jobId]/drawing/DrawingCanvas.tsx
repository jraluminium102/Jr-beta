"use client";
import { useEffect, useRef, useState } from "react";
import { GripVertical, Minus, Plus, Palette, AlignLeft, AlignCenter, AlignRight, Trash2, Highlighter } from "lucide-react";
import type { AnnotAlign, AnnotColor, DrawingAnnotation, DrawingPage } from "@/lib/job-drawings/types";
import { HIGHLIGHT_HEX, nextHighlight } from "@/lib/highlight-colors";

const COLOR_HEX: Record<AnnotColor, string> = { "": "#111827", red: "#c00000", blue: "#1a56db", green: "#15803d" };
const COLOR_ORDER: AnnotColor[] = ["", "red", "blue", "green"];
const ALIGN_ORDER: AnnotAlign[] = ["left", "center", "right"];
const ALIGN_ICON: Record<AnnotAlign, typeof AlignLeft> = { left: AlignLeft, center: AlignCenter, right: AlignRight };
// ฮาโลขาวรอบตัวอักษร — อ่านออกแม้ทับเส้นแบบสีเข้ม (ไม่เก็บใน DB คำนวณจากสีตัวอักษรอย่างเดียว ใช้ทั้งตอนแก้และตอนพิมพ์)
// มีไฮไลต์อยู่แล้ว (พื้นหลังทึบ) → ตัดฮาโลออก กันดูเลอะ/กวนตากับพื้นสี
const HALO = "0 0 3px #fff, 0 0 3px #fff, 0 0 4px #fff, 0 0 5px #fff";
// กรอบฟ้าตอนเลือกกล่อง (แทนพื้นเหลืองเดิม กันชนกับสีไฮไลต์จริง)
const SELECTED_RING = "0 0 0 2px #2563eb, 0 0 0 4px rgba(37,99,235,0.25)";
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// ── กล่องข้อความ 1 กล่อง — ลากย้ายด้วย pointer events (มือถือ/เมาส์ใช้ร่วมได้), พิมพ์แก้ในตัว ──
function AnnotationBox({
  a, pageRef, pageHeightPx, selected, onSelect, onPatch, onRemove, canWrite,
}: {
  a: DrawingAnnotation;
  pageRef: React.RefObject<HTMLDivElement>;
  pageHeightPx: number;
  selected: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<DrawingAnnotation>) => void;
  onRemove: () => void;
  canWrite: boolean;
}) {
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0, xf: 0, yf: 0 });

  const onHandlePointerDown = (e: React.PointerEvent) => {
    if (!canWrite) return;
    e.stopPropagation();
    onSelect();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    start.current = { x: e.clientX, y: e.clientY, xf: a.xf, yf: a.yf };
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dxf = (e.clientX - start.current.x) / rect.width;
    const dyf = (e.clientY - start.current.y) / rect.height;
    onPatch({ xf: clamp01(start.current.xf + dxf), yf: clamp01(start.current.yf + dyf) });
  };
  const onHandlePointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const lines = (a.text || "").split("\n");
  const cols = Math.min(60, Math.max(3, Math.max(...lines.map((l) => l.length)) + 1));
  const rows = Math.min(20, Math.max(1, lines.length));
  const fontSizePx = Math.max(8, a.size * pageHeightPx);

  return (
    <div
      className="absolute"
      style={{ left: `${a.xf * 100}%`, top: `${a.yf * 100}%`, zIndex: selected ? 20 : 10 }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* toolbar ลอยด้านบน — โชว์เมื่อเลือกกล่องนี้ */}
      {selected && canWrite && (
        <div
          className="absolute bottom-full left-0 mb-1 flex items-center gap-1 rounded-lg bg-gray-900/90 text-white px-1.5 py-1 shadow-lg whitespace-nowrap"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" title="ลากย้าย" onPointerDown={onHandlePointerDown} onPointerMove={onHandlePointerMove} onPointerUp={onHandlePointerUp}
            className="w-7 h-7 grid place-items-center rounded hover:bg-white/15 cursor-grab active:cursor-grabbing touch-none">
            <GripVertical size={14} />
          </button>
          <button type="button" title="ตัวเล็กลง" onClick={() => onPatch({ size: Math.max(0.008, +(a.size - 0.003).toFixed(4)) })}
            className="w-7 h-7 grid place-items-center rounded hover:bg-white/15"><Minus size={13} /></button>
          <button type="button" title="ตัวใหญ่ขึ้น" onClick={() => onPatch({ size: Math.min(0.15, +(a.size + 0.003).toFixed(4)) })}
            className="w-7 h-7 grid place-items-center rounded hover:bg-white/15"><Plus size={13} /></button>
          <button type="button" title={`สี: ${a.color || "ดำ"} (กดเปลี่ยน)`}
            onClick={() => onPatch({ color: COLOR_ORDER[(COLOR_ORDER.indexOf(a.color ?? "") + 1) % COLOR_ORDER.length] })}
            className="w-7 h-7 grid place-items-center rounded hover:bg-white/15">
            <Palette size={13} style={{ color: COLOR_HEX[a.color ?? ""] }} />
          </button>
          <button type="button" title={`ไฮไลต์: ${a.hl ? a.hl : "ไม่มี"} (กดเปลี่ยน)`}
            onClick={() => onPatch({ hl: nextHighlight(a.hl) })}
            style={a.hl ? { background: HIGHLIGHT_HEX[a.hl] } : undefined}
            className="w-7 h-7 grid place-items-center rounded hover:bg-white/15">
            <Highlighter size={13} style={{ color: a.hl ? "#111827" : "#fff" }} />
          </button>
          {(() => { const AlignIcon = ALIGN_ICON[a.align ?? "left"]; return (
            <button type="button" title="จัดแนวข้อความ (กดเปลี่ยน)"
              onClick={() => onPatch({ align: ALIGN_ORDER[(ALIGN_ORDER.indexOf(a.align ?? "left") + 1) % ALIGN_ORDER.length] })}
              className="w-7 h-7 grid place-items-center rounded hover:bg-white/15"><AlignIcon size={13} /></button>
          ); })()}
          <button type="button" title="ลบกล่องนี้" onClick={onRemove}
            className="w-7 h-7 grid place-items-center rounded hover:bg-rose-500/70 text-rose-200"><Trash2 size={13} /></button>
        </div>
      )}
      <textarea
        value={a.text}
        onChange={(e) => onPatch({ text: e.target.value })}
        onFocus={onSelect}
        readOnly={!canWrite}
        rows={rows}
        cols={cols}
        placeholder="พิมพ์ข้อความ…"
        style={{
          fontSize: fontSizePx,
          lineHeight: 1.25,
          color: COLOR_HEX[a.color ?? ""],
          textAlign: a.align ?? "left",
          textShadow: a.hl ? "none" : HALO,   // มีไฮไลต์พื้นทึบแล้ว → ตัดฮาโลกันเลอะ
          background: a.hl ? HIGHLIGHT_HEX[a.hl] : "transparent",
          borderRadius: a.hl ? 3 : 0,
          boxShadow: selected ? SELECTED_RING : "none",
          border: selected ? "1px dashed rgba(0,0,0,0.5)" : "1px dashed transparent",
          resize: "none",
          padding: "1px 3px",
          fontFamily: "inherit",
          fontWeight: 600,
        }}
        className="block outline-none"
      />
    </div>
  );
}

// ── 1 หน้าแบบ (รูป PNG) + กล่องข้อความทั้งหมดของหน้านั้น ──
function PageBlock({
  page, pageIndex, active, annotations, onActivate, onPatch, onRemove, onDropText, canWrite,
}: {
  page: DrawingPage;
  pageIndex: number;
  active: boolean;
  annotations: DrawingAnnotation[];
  onActivate: () => void;
  onPatch: (id: string, patch: Partial<DrawingAnnotation>) => void;
  onRemove: (id: string) => void;
  onDropText: (xf: number, yf: number, text: string) => void;
  canWrite: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setHeightPx(el.getBoundingClientRect().height));
    ro.observe(el);
    setHeightPx(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [page.path]);

  // หน้าที่ "กำลังใช้งาน" เลื่อนตามที่ผู้ใช้เลื่อนดู → ปุ่ม + สเปคลงหน้าที่มองอยู่จริง (แก้ปัญหาหลายแผ่นแล้ว +ลงผิดหน้า)
  const activateRef = useRef(onActivate);
  activateRef.current = onActivate;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) activateRef.current(); },
      { rootMargin: "-45% 0px -45% 0px" },   // ยิงเมื่อหน้าตัดกลางจอ = หน้าที่กำลังดู
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`rounded-2xl overflow-hidden border-2 ${active ? "border-sky-400" : "border-transparent"}`}>
      <div className="bg-gray-800/60 text-white/70 text-[12px] px-3 py-1.5 flex items-center justify-between">
        <span>หน้า {pageIndex + 1}{active ? " · กำลังใช้งาน (กดปุ่ม + ในแผงขวาจะเพิ่มลงหน้านี้)" : ""}</span>
      </div>
      <div
        ref={wrapRef}
        className="relative bg-white select-none"
        onPointerDown={() => { onActivate(); setSelectedId(null); }}
        onDragOver={(e) => { e.preventDefault(); onActivate(); }}
        onDrop={(e) => {
          e.preventDefault();
          const text = e.dataTransfer.getData("text/plain");
          if (!text || !wrapRef.current) return;
          const rect = wrapRef.current.getBoundingClientRect();
          const xf = clamp01((e.clientX - rect.left) / rect.width);
          const yf = clamp01((e.clientY - rect.top) / rect.height);
          onDropText(xf, yf, text);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก Supabase Storage public URL (ไม่ใช่ asset ในโปรเจกต์) */}
        <img src={page.path} alt={`หน้า ${pageIndex + 1}`} className="w-full block pointer-events-none" draggable={false} />
        {annotations.map((a) => (
          <AnnotationBox
            key={a.id}
            a={a}
            pageRef={wrapRef}
            pageHeightPx={heightPx}
            selected={selectedId === a.id}
            onSelect={() => setSelectedId(a.id)}
            onPatch={(patch) => onPatch(a.id, patch)}
            onRemove={() => { onRemove(a.id); setSelectedId(null); }}
            canWrite={canWrite}
          />
        ))}
      </div>
    </div>
  );
}

export default function DrawingCanvas({
  pages, annotations, activePage, onSetActivePage, onPatch, onRemove, onDropText, canWrite,
}: {
  pages: DrawingPage[];
  annotations: DrawingAnnotation[];
  activePage: number;
  onSetActivePage: (i: number) => void;
  onPatch: (id: string, patch: Partial<DrawingAnnotation>) => void;
  onRemove: (id: string) => void;
  onDropText: (pageIndex: number, xf: number, yf: number, text: string) => void;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-5">
      {pages.map((page, i) => (
        <PageBlock
          key={i}
          page={page}
          pageIndex={i}
          active={activePage === i}
          annotations={annotations.filter((a) => a.page === i)}
          onActivate={() => onSetActivePage(i)}
          onPatch={onPatch}
          onRemove={onRemove}
          onDropText={(xf, yf, text) => onDropText(i, xf, yf, text)}
          canWrite={canWrite}
        />
      ))}
    </div>
  );
}
