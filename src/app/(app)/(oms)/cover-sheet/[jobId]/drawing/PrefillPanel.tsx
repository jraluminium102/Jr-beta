"use client";
import { Plus, Layers, Type } from "lucide-react";
import type { PrefillGroup } from "@/lib/job-drawings/types";

// ปุ่ม "+ ข้อความเอง" — เพิ่มกล่องข้อความว่าง (ไม่ต้องมีสเปคในระบบ) แล้วพิมพ์เองบนแบบ
function AddBlankButton({ onAddBlank }: { onAddBlank: () => void }) {
  return (
    <button type="button" onClick={onAddBlank}
      className="focusable pressable w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white bg-sky-500 hover:bg-sky-600 min-h-[42px]">
      <Type size={15} /> + ข้อความเอง
    </button>
  );
}

// แผงข้าง "สเปคจากใบเสนอ" — กด + เพื่อเพิ่มลงหน้าที่ "กำลังใช้งาน" หรือลากไปวางตำแหน่งที่ต้องการบนแบบ
export default function PrefillPanel({
  groups, onAddText, onAddBlank, disabled, activePageLabel,
}: {
  groups: PrefillGroup[];
  onAddText: (text: string) => void;
  onAddBlank: () => void;     // เพิ่มกล่องข้อความว่าง (ไม่พึ่งสเปค)
  disabled: boolean;
  activePageLabel?: number;   // เลขหน้าที่ + จะลง (เลื่อนตามที่มองอยู่)
}) {
  if (groups.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-4 space-y-3 text-[13px]" style={{ color: "var(--t-mid)" }}>
        <div>งานนี้ยังไม่มีใบเสนอราคา (หรือใบเสนอยังไม่มีรายการ) — ยังดึงสเปคอัตโนมัติไม่ได้ กดปุ่มด้านล่างเพื่อเพิ่มกล่องข้อความเอง</div>
        {!disabled && <AddBlankButton onAddBlank={onAddBlank} />}
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4">
      {!disabled && <AddBlankButton onAddBlank={onAddBlank} />}
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
    </div>
  );
}
