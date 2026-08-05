"use client";
import { Plus, Layers } from "lucide-react";
import type { PrefillGroup } from "@/lib/job-drawings/types";

// แผงข้าง "สเปคจากใบเสนอ" — กด + เพื่อเพิ่มลงหน้าที่ "กำลังใช้งาน" หรือลากไปวางตำแหน่งที่ต้องการบนแบบ
export default function PrefillPanel({
  groups, onAddText, disabled,
}: {
  groups: PrefillGroup[];
  onAddText: (text: string) => void;
  disabled: boolean;
}) {
  if (groups.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-4 text-[13px]" style={{ color: "var(--t-mid)" }}>
        งานนี้ยังไม่มีใบเสนอราคา (หรือใบเสนอยังไม่มีรายการ) — ยังดึงสเปคอัตโนมัติไม่ได้ พิมพ์กล่องข้อความเองบนแบบได้เลย
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4 max-h-[75vh] overflow-y-auto">
      <div className="text-[12px]" style={{ color: "var(--t-low)" }}>
        กด <b>+</b> เพื่อเพิ่มลงหน้าที่กำลังใช้งาน หรือ <b>ลาก</b> ไปวางตำแหน่งที่ต้องการบนแบบได้เลย
      </div>
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
    </div>
  );
}
