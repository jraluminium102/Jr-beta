"use client";
import { useEffect, useRef, useState } from "react";
import { GripVertical, Minus, Plus, Palette, AlignLeft, AlignCenter, AlignRight, Trash2, Highlighter, Copy, MousePointer2 } from "lucide-react";
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

// ── Snap (เจ้าของ 5 พ.ย.69): ลากกล่องเข้าใกล้ขอบ/กลางของกล่องอื่นในหน้าเดียวกัน → ดูดให้ตรงแนว + ตีเส้นไกด์ ──
//   เทียบทั้งแกน X (ซ้าย/ขวา/กลาง) และ Y (บน/ล่าง/กลาง) · รวม "กลางหน้า" ด้วย · กด Alt ค้างตอนลาก = ปิด snap
const SNAP_PX = 7;
type Rect = { left: number; top: number; width: number; height: number };
type Guides = { x: number | null; y: number | null };

function snapRect(cur: Rect, others: Rect[], pageW: number, pageH: number): { left: number; top: number; guides: Guides } {
  const xT: number[] = [pageW / 2];
  const yT: number[] = [pageH / 2];
  for (const o of others) {
    xT.push(o.left, o.left + o.width, o.left + o.width / 2);
    yT.push(o.top, o.top + o.height, o.top + o.height / 2);
  }
  const pick = (anchors: number[], targets: number[]) => {
    let best: { d: number; t: number } | null = null;
    for (const a of anchors) for (const t of targets) {
      const d = t - a;
      if (Math.abs(d) <= SNAP_PX && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
    }
    return best;
  };
  const bx = pick([cur.left, cur.left + cur.width, cur.left + cur.width / 2], xT);
  const by = pick([cur.top, cur.top + cur.height, cur.top + cur.height / 2], yT);
  return {
    left: cur.left + (bx?.d ?? 0),
    top: cur.top + (by?.d ?? 0),
    guides: { x: bx ? bx.t : null, y: by ? by.t : null },
  };
}

// วัดกรอบของทุกกล่องในหน้า (relative กับหน้า) ยกเว้นกล่องที่กำลังลาก — ใช้เป็นเป้า snap
function siblingRects(pageEl: HTMLElement, exceptId: string): Rect[] {
  const base = pageEl.getBoundingClientRect();
  const out: Rect[] = [];
  pageEl.querySelectorAll<HTMLElement>("[data-annot-id]").forEach((el) => {
    if (el.dataset.annotId === exceptId) return;
    const r = el.getBoundingClientRect();
    out.push({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height });
  });
  return out;
}

// ── กล่องข้อความ 1 กล่อง — ลากย้ายด้วยที่จับ (grip) มุมซ้ายบน · พิมพ์แก้ในตัว · เครื่องมืออื่นอยู่แถบบนของหน้า (ไม่บังกล่องอื่น) ──
function AnnotationBox({
  a, pageRef, pageHeightPx, selected, onSelect, onPatch, onGuides, canWrite,
}: {
  a: DrawingAnnotation;
  pageRef: React.RefObject<HTMLDivElement>;
  pageHeightPx: number;
  selected: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<DrawingAnnotation>) => void;
  onGuides: (g: Guides | null) => void;
  canWrite: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const start = useRef<{ x: number; y: number; left: number; top: number; w: number; h: number; others: Rect[] }>({ x: 0, y: 0, left: 0, top: 0, w: 0, h: 0, others: [] });

  const onHandlePointerDown = (e: React.PointerEvent) => {
    if (!canWrite || !pageRef.current || !boxRef.current) return;
    e.stopPropagation();
    onSelect();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    const base = pageRef.current.getBoundingClientRect();
    const r = boxRef.current.getBoundingClientRect();
    start.current = {
      x: e.clientX, y: e.clientY,
      left: r.left - base.left, top: r.top - base.top, w: r.width, h: r.height,
      others: siblingRects(pageRef.current, a.id),
    };
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const s = start.current;
    const cur: Rect = { left: s.left + (e.clientX - s.x), top: s.top + (e.clientY - s.y), width: s.w, height: s.h };
    if (e.altKey) {
      onGuides(null);
      onPatch({ xf: clamp01(cur.left / rect.width), yf: clamp01(cur.top / rect.height) });
      return;
    }
    const snapped = snapRect(cur, s.others, rect.width, rect.height);
    onGuides(snapped.guides.x == null && snapped.guides.y == null ? null : snapped.guides);
    onPatch({ xf: clamp01(snapped.left / rect.width), yf: clamp01(snapped.top / rect.height) });
  };
  const onHandlePointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    onGuides(null);
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const lines = (a.text || "").split("\n");
  const cols = Math.min(60, Math.max(3, Math.max(...lines.map((l) => l.length)) + 1));
  const rows = Math.min(20, Math.max(1, lines.length));
  const fontSizePx = Math.max(8, a.size * pageHeightPx);

  return (
    <div
      ref={boxRef}
      data-annot-id={a.id}
      className="absolute"
      style={{ left: `${a.xf * 100}%`, top: `${a.yf * 100}%`, zIndex: selected ? 20 : 10 }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* ที่จับลาก — ติดมุมซ้ายบนของกล่องเอง (เล็ก ไม่บังกล่องอื่น) · โชว์เมื่อเลือกกล่องนี้ */}
      {selected && canWrite && (
        <button
          type="button"
          title="ลากย้าย (กด Alt ค้าง = ไม่ดูดเข้าแนว) · กดแล้วใช้ลูกศรขยับทีละนิด"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          className="absolute -left-[22px] -top-[2px] w-5 h-6 grid place-items-center rounded-md bg-sky-600 text-white shadow cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical size={13} />
        </button>
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
  page, pageIndex, pageCount, active, annotations, selectedId, onSelect, onActivate, onPatch, onDropText, canWrite,
}: {
  page: DrawingPage;
  pageIndex: number;
  pageCount: number;
  active: boolean;
  annotations: DrawingAnnotation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onActivate: () => void;
  onPatch: (id: string, patch: Partial<DrawingAnnotation>) => void;
  onDropText: (xf: number, yf: number, text: string) => void;
  canWrite: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [heightPx, setHeightPx] = useState(0);
  const [guides, setGuides] = useState<Guides | null>(null);

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

  const pointToFrac = (e: { clientX: number; clientY: number }) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { xf: clamp01((e.clientX - rect.left) / rect.width), yf: clamp01((e.clientY - rect.top) / rect.height) };
  };

  return (
    <div className={`rounded-2xl overflow-hidden border-2 ${active ? "border-sky-400" : "border-transparent"}`}>
      <div className="bg-gray-800/60 text-white/70 text-[12px] px-3 py-1.5 flex items-center justify-between">
        <span>หน้า {pageIndex + 1}/{pageCount}{active ? " · กำลังใช้งาน (กดปุ่ม + ในแผงขวาจะเพิ่มลงหน้านี้)" : ""}</span>
        {canWrite && <span className="text-white/45 hidden sm:inline">ดับเบิลคลิกที่ว่าง = เพิ่มกล่องตรงนั้น</span>}
      </div>
      <div
        ref={wrapRef}
        data-page-canvas=""
        className="relative bg-white select-none"
        onPointerDown={() => { onActivate(); onSelect(null); }}
        onDoubleClick={(e) => {
          if (!canWrite || !wrapRef.current) return;
          if ((e.target as HTMLElement).closest("[data-annot-id]")) return;   // ดับเบิลคลิกในกล่อง = เลือกคำ ไม่ใช่เพิ่มกล่อง
          const { xf, yf } = pointToFrac(e);
          onDropText(xf, yf, "");
        }}
        onDragOver={(e) => { e.preventDefault(); onActivate(); }}
        onDrop={(e) => {
          e.preventDefault();
          const text = e.dataTransfer.getData("text/plain");
          if (!text || !wrapRef.current) return;
          const { xf, yf } = pointToFrac(e);
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
            onSelect={() => onSelect(a.id)}
            onPatch={(patch) => onPatch(a.id, patch)}
            onGuides={setGuides}
            canWrite={canWrite}
          />
        ))}
        {/* เส้นไกด์ตอน snap — ชมพู บาง ทับทุกอย่าง ไม่รับคลิก */}
        {guides?.x != null && (
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: guides.x - 0.5, width: 1, background: "#ec4899", zIndex: 30 }} />
        )}
        {guides?.y != null && (
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: guides.y - 0.5, height: 1, background: "#ec4899", zIndex: 30 }} />
        )}
      </div>
    </div>
  );
}

// ── แถบเครื่องมือของ "กล่องที่เลือก" — อยู่บนสุดของคอลัมน์แบบ (sticky) ไม่ลอยทับกล่องอื่นอีก (เจ้าของ 5 พ.ย.69) ──
function SelectionToolbar({ a, onPatch, onRemove, onCopy }: {
  a: DrawingAnnotation;
  onPatch: (patch: Partial<DrawingAnnotation>) => void;
  onRemove: () => void;
  onCopy: () => void;
}) {
  const AlignIcon = ALIGN_ICON[a.align ?? "left"];
  const tb = "w-9 h-9 grid place-items-center rounded-lg hover:bg-white/15";
  return (
    <div className="sticky top-2 z-40 mb-3 flex items-center gap-1 rounded-xl bg-gray-900/95 text-white px-2 py-1.5 shadow-xl backdrop-blur flex-wrap">
      <span className="inline-flex items-center gap-1 text-[12px] text-white/70 px-1.5 mr-1">
        <MousePointer2 size={12} /> กล่องที่เลือก · หน้า {a.page + 1}
      </span>
      <button type="button" title="ตัวเล็กลง" onClick={() => onPatch({ size: Math.max(0.008, +(a.size - 0.003).toFixed(4)) })} className={tb}><Minus size={15} /></button>
      <button type="button" title="ตัวใหญ่ขึ้น" onClick={() => onPatch({ size: Math.min(0.15, +(a.size + 0.003).toFixed(4)) })} className={tb}><Plus size={15} /></button>
      <button type="button" title={`สี: ${a.color || "ดำ"} (กดเปลี่ยน)`}
        onClick={() => onPatch({ color: COLOR_ORDER[(COLOR_ORDER.indexOf(a.color ?? "") + 1) % COLOR_ORDER.length] })} className={tb}>
        <Palette size={15} style={{ color: a.color ? COLOR_HEX[a.color] : "#fff" }} />
      </button>
      <button type="button" title={`ไฮไลต์: ${a.hl ? a.hl : "ไม่มี"} (กดเปลี่ยน)`}
        onClick={() => onPatch({ hl: nextHighlight(a.hl) })}
        style={a.hl ? { background: HIGHLIGHT_HEX[a.hl] } : undefined} className={tb}>
        <Highlighter size={15} style={{ color: a.hl ? "#111827" : "#fff" }} />
      </button>
      <button type="button" title="จัดแนวข้อความ (กดเปลี่ยน)"
        onClick={() => onPatch({ align: ALIGN_ORDER[(ALIGN_ORDER.indexOf(a.align ?? "left") + 1) % ALIGN_ORDER.length] })} className={tb}>
        <AlignIcon size={15} />
      </button>
      <button type="button" title="ก๊อปข้อความนี้ (พร้อมสี/ไฮไลต์ — ไปวางหน้าอื่นได้)" onClick={onCopy} className={tb}><Copy size={15} /></button>
      <button type="button" title="ลบกล่องนี้ (หรือกด Delete ตอนไม่ได้พิมพ์)" onClick={onRemove} className={`${tb} hover:bg-rose-500/70 text-rose-200`}><Trash2 size={15} /></button>
      <span className="hidden md:inline text-[11px] text-white/50 ml-auto pr-1">
        ลาก = ที่จับฟ้าซ้ายกล่อง (ดูดเข้าแนวอัตโนมัติ · Alt = ไม่ดูด) · Esc แล้วลูกศร = ขยับทีละนิด (Shift = ไว)
      </span>
    </div>
  );
}

export default function DrawingCanvas({
  pages, annotations, activePage, onSetActivePage, onPatch, onRemove, onCopy, onDropText, canWrite,
}: {
  pages: DrawingPage[];
  annotations: DrawingAnnotation[];
  activePage: number;
  onSetActivePage: (i: number) => void;
  onPatch: (id: string, patch: Partial<DrawingAnnotation>) => void;
  onRemove: (id: string) => void;
  onCopy: (id: string) => void;
  onDropText: (pageIndex: number, xf: number, yf: number, text: string) => void;
  canWrite: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = annotations.find((a) => a.id === selectedId) ?? null;
  const rootRef = useRef<HTMLDivElement>(null);

  // คีย์ลัดเมื่อ "ไม่ได้พิมพ์อยู่ในกล่อง" (กด Esc ออกจากกล่องก่อน): ลูกศร = ขยับ 1px (Shift = 10px) · Delete = ลบกล่อง
  useEffect(() => {
    if (!canWrite) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const typing = tag === "textarea" || tag === "input" || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (e.key === "Escape" && typing) { (document.activeElement as HTMLElement).blur(); return; }
      if (!selected || typing) return;
      const pageEl = rootRef.current?.querySelectorAll<HTMLElement>("[data-page-canvas]")[selected.page];
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onRemove(selected.id); setSelectedId(null); return; }
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      onPatch(selected.id, { xf: clamp01(selected.xf + dx / rect.width), yf: clamp01(selected.yf + dy / rect.height) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canWrite, selected, onPatch, onRemove]);

  return (
    <div ref={rootRef} className="space-y-5">
      {selected && canWrite && (
        <SelectionToolbar
          a={selected}
          onPatch={(p) => onPatch(selected.id, p)}
          onRemove={() => { onRemove(selected.id); setSelectedId(null); }}
          onCopy={() => onCopy(selected.id)}
        />
      )}
      {pages.map((page, i) => (
        <div key={i} data-page-wrap="">
          <PageBlock
            page={page}
            pageIndex={i}
            pageCount={pages.length}
            active={activePage === i}
            annotations={annotations.filter((a) => a.page === i)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onActivate={() => onSetActivePage(i)}
            onPatch={onPatch}
            onDropText={(xf, yf, text) => onDropText(i, xf, yf, text)}
            canWrite={canWrite}
          />
        </div>
      ))}
    </div>
  );
}
