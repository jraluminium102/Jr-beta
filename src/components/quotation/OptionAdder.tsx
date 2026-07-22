"use client";
import { useState } from "react";
import { insertOption, OPTION_MODES, type OptionMode } from "@/lib/quotation-options";

/**
 * OptionAdder — กล่องเล็กใต้ช่องรายละเอียด สำหรับเติมบรรทัด "OPTION (n) : ..." เข้า detail
 * ใช้ร่วม: เครื่องคิด 4.0 · ใบเสนอใหม่ (QuotationForm) · แก้ใบเสนอ (QuotationEditButton)
 * เป็นข้อความล้วน ไม่รวมยอด — แค่ประกอบข้อความให้ตามฟอร์แมต แล้ว onChange กลับ detail ใหม่
 */
export default function OptionAdder({ detail, onChange }: { detail: string; onChange: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<OptionMode>("add");
  const [desc, setDesc] = useState("");
  const [amt, setAmt] = useState("");

  const add = () => {
    const a = Math.round(Number(amt) || 0);
    if (!desc.trim() || a <= 0) return;
    onChange(insertOption(detail, mode, desc, a));
    setDesc("");
    setAmt("");
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="press mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700/90 hover:text-amber-800">
        + เพิ่ม OPTION (ทางเลือก)
      </button>
    );
  }

  const inputCls = "border border-amber-200 rounded-md px-2 py-1.5 text-xs outline-none focus-visible:ring-2 bg-white/80";
  const preview =
    mode === "add" ? "→ OPTION (n) : หากลูกค้าต้องการเพิ่ม … ราคาเพิ่ม X บาท"
      : mode === "reduce" ? "→ OPTION (n) : หากลูกค้าต้องการเปลี่ยนเป็น … ราคาลดลง X บาท"
        : "→ OPTION (n) : หากลูกค้าต้องการเปลี่ยนเป็น … ราคา X บาท (เปลี่ยนรูปแบบ)";

  return (
    <div className="mt-1.5 rounded-lg border border-dashed border-amber-300/80 bg-amber-50/50 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-amber-700">เพิ่ม OPTION</span>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-gray-400 hover:text-gray-600">ปิด</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={mode} onChange={(e) => setMode(e.target.value as OptionMode)} className={inputCls} aria-label="แบบ option">
          {OPTION_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="รายละเอียด เช่น เพิ่มโช๊คด้านบน"
          className={`${inputCls} flex-1 min-w-[140px]`} aria-label="รายละเอียด option"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="numeric" placeholder="บาท"
          className={`${inputCls} w-20 text-right tabular-nums`} aria-label="จำนวนเงิน"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add}
          className="press rounded-md px-2.5 py-1.5 text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700">+ เพิ่ม</button>
      </div>
      <div className="text-[10px] text-amber-700/70">{preview}</div>
    </div>
  );
}
