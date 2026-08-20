"use client";
import { Plus, Layers, Type, ClipboardPaste, FileText } from "lucide-react";
import type { CoverBubble, PrefillGroup } from "@/lib/job-drawings/types";
import { HIGHLIGHT_HEX } from "@/lib/highlight-colors";

// สีตัวอักษรบับเบิ้ลจากใบปะหน้า (ตรงกับ COLOR_HEX ของ DrawingCanvas · "" = จุดเทากลาง ๆ บนพื้นเข้ม)
const COVER_DOT: Record<string, string> = { "": "#9ca3af", red: "#e5484d", blue: "#4f83e8", green: "#3aa661" };

// ปุ่มบนสุดของแผง — "+ ข้อความเอง" (เพิ่มกล่องว่าง) + "วางกล่องที่ก๊อป" (โชว์เมื่อมีของในคลิปบอร์ด)
function TopActions({ onAddBlank, onPaste, hasClip, activePageLabel }: {
  onAddBlank: () => void; onPaste: () => void; hasClip: boolean; activePageLabel?: number;
}) {
  return (
    <div className="space-y-2">
      <button type="button" onClick={onAddBlank}
        className="focusable pressable w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white bg-sky-500 hover:bg-sky-600 min-h-[42px]">
        <Type size={15} /> + ข้อความเอง
      </button>
      {hasClip && (
        <button type="button" onClick={onPaste}
          className="focusable pressable w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white bg-violet-500 hover:bg-violet-600 min-h-[42px]">
          <ClipboardPaste size={15} /> วางกล่องที่ก๊อป{activePageLabel != null ? ` (ลงหน้า ${activePageLabel})` : ""}
        </button>
      )}
    </div>
  );
}

// แผงข้าง "สเปคจากใบเสนอ" — กด + เพื่อเพิ่มลงหน้าที่ "กำลังใช้งาน" หรือลากไปวางตำแหน่งที่ต้องการบนแบบ
// ── บับเบิ้ลจากใบปะหน้า (ช่อง 1 "สั่งของเตรียมผลิต") — เลือกลงแบบได้ คงสี/ไฮไลต์ ──
function CoverBubbleSection({ bubbles, onAddCover, disabled }: {
  bubbles: CoverBubble[]; onAddCover: (b: CoverBubble) => void; disabled: boolean;
}) {
  return (
    <div className="space-y-1.5 border-t border-white/12 pt-3">
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-white">
        <FileText size={13} className="shrink-0 opacity-70" /> จากใบปะหน้า (สั่งของเตรียมผลิต)
      </div>
      <div className="text-[11px]" style={{ color: "var(--t-low)" }}>บับเบิ้ลที่ทำไว้ในใบปะหน้า — กด + ลงแบบได้เลย (มาพร้อมสี/ไฮไลต์)</div>
      <div className="space-y-1">
        {bubbles.map((b, i) => b.kind === "group" ? (
          <div key={i} className="text-[12px] font-bold text-sky-100 pt-1.5">{b.n ? `${b.n}. ` : ""}{b.text}</div>
        ) : (
          <div key={i}
            draggable={!disabled}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", b.text)}
            className={`flex items-center gap-1.5 text-[12.5px] rounded-lg px-2 py-1.5 ${disabled ? "" : "cursor-grab active:cursor-grabbing hover:brightness-110"}`}
            style={{ color: b.hl ? "#111827" : "var(--t-hi)", background: b.hl ? HIGHLIGHT_HEX[b.hl] : "rgba(255,255,255,0.08)" }}
          >
            {!b.hl && b.color && <span className="shrink-0 w-2.5 h-2.5 rounded-sm" style={{ background: COVER_DOT[b.color] }} />}
            <span className="flex-1 min-w-0">{b.text}</span>
            {!disabled && (
              <button type="button" title="เพิ่มลงแบบ (คงสี/ไฮไลต์)" onClick={() => onAddCover(b)}
                className="shrink-0 w-6 h-6 grid place-items-center rounded bg-black/15 hover:bg-black/25">
                <Plus size={11} style={{ color: b.hl ? "#111827" : "#fff" }} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PrefillPanel({
  groups, coverBubbles, onAddText, onAddCover, onAddBlank, onPaste, hasClip, disabled, activePageLabel,
}: {
  groups: PrefillGroup[];
  coverBubbles: CoverBubble[];       // บับเบิ้ลจากใบปะหน้า (ช่อง 1)
  onAddText: (text: string) => void;
  onAddCover: (b: CoverBubble) => void; // เพิ่มบับเบิ้ลใบปะหน้า (คงสี/ไฮไลต์)
  onAddBlank: () => void;     // เพิ่มกล่องข้อความว่าง (ไม่พึ่งสเปค)
  onPaste: () => void;        // วางกล่องที่ก๊อป ลงหน้าที่กำลังดู
  hasClip: boolean;           // มีกล่องในคลิปบอร์ดไหม
  disabled: boolean;
  activePageLabel?: number;   // เลขหน้าที่ + จะลง (เลื่อนตามที่มองอยู่)
}) {
  const hasCover = coverBubbles.length > 0;
  if (groups.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-4 space-y-3 text-[13px]" style={{ color: "var(--t-mid)" }}>
        <div>งานนี้ยังไม่มีใบเสนอราคา (หรือใบเสนอยังไม่มีรายการ) — ยังดึงสเปคอัตโนมัติไม่ได้ กดปุ่มด้านล่างเพื่อเพิ่มกล่องข้อความเอง</div>
        {!disabled && <TopActions onAddBlank={onAddBlank} onPaste={onPaste} hasClip={hasClip} activePageLabel={activePageLabel} />}
        {hasCover && <CoverBubbleSection bubbles={coverBubbles} onAddCover={onAddCover} disabled={disabled} />}
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4">
      {!disabled && <TopActions onAddBlank={onAddBlank} onPaste={onPaste} hasClip={hasClip} activePageLabel={activePageLabel} />}
      <div className="text-[12px]" style={{ color: "var(--t-low)" }}>
        กด <b>+</b> เพื่อเพิ่มลงหน้าที่กำลังดูอยู่ หรือ <b>ลาก</b> ไปวางตำแหน่งที่ต้องการบนแบบได้เลย
      </div>
      {activePageLabel != null && (
        <div className="text-[12px] font-semibold text-sky-100 bg-sky-500/20 border border-sky-300/30 rounded-lg px-2.5 py-1.5">
          ➕ กด + จะลง <b>หน้า {activePageLabel}</b> (เลื่อนดูหน้าไหน = ลงหน้านั้น)
        </div>
      )}
      {groups.map((g) => {
        const groupText = [g.title, ...g.lines.map((l) => l.text)].filter(Boolean).join("\n");
        return (
          <div key={g.n} className="space-y-1.5">
            <div
              draggable={!disabled}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", groupText)}
              className={`flex items-center gap-1.5 text-[13px] font-bold text-white ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}
            >
              <Layers size={13} className="shrink-0 opacity-70" />
              <span className="flex-1 min-w-0 truncate">{g.title}</span>
              {!disabled && (
                <button type="button" title="เพิ่มทั้งชุด" onClick={() => onAddText(groupText)}
                  className="shrink-0 w-6 h-6 grid place-items-center rounded-md bg-white/15 hover:bg-white/25 text-white">
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div className="space-y-1 pl-4">
              {g.lines.map((l, i) => (
                <div
                  key={i}
                  draggable={!disabled}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", l.text)}
                  className={`flex items-center gap-1.5 text-[12.5px] rounded-lg bg-white/8 px-2 py-1.5 ${disabled ? "" : "cursor-grab active:cursor-grabbing hover:bg-white/14"}`}
                  style={{ color: "var(--t-hi)" }}
                >
                  <span className="flex-1 min-w-0">{l.text}</span>
                  {!disabled && (
                    <button type="button" title="เพิ่ม" onClick={() => onAddText(l.text)}
                      className="shrink-0 w-6 h-6 grid place-items-center rounded bg-white/15 hover:bg-white/25 text-white">
                      <Plus size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {hasCover && <CoverBubbleSection bubbles={coverBubbles} onAddCover={onAddCover} disabled={disabled} />}
    </div>
  );
}
