"use client";

/**
 * DateField — input วันที่แบบ DD/MM/YYYY เสมอ ไม่ขึ้นกับ locale เบราว์เซอร์
 *
 * Props:
 *   value    — ISO "YYYY-MM-DD" หรือ "" (ว่าง)
 *   onChange — (iso: string) => void  คืน ISO เหมือน <input type="date">
 *
 * ธีม:
 *   ส่ง className เข้ามาเพื่อควบคุม bg/text — ไม่ hardcode สี
 *   ปุ่มปฏิทิน (CalendarDays) เป็น opacity กลาง ดูดีทั้ง 2 โทน
 *
 * picker:
 *   กดไอคอน → เรียก hidden <input type="date"> .showPicker()
 *   (fallback: .click() ถ้า browser ไม่ support showPicker)
 */

import { useRef, useState, useId } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/format";

// ── helpers ──────────────────────────────────────────────────────────────────

/** ISO "YYYY-MM-DD" → "DD/MM/YYYY" แสดงผล */
function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

/** "DD/MM/YYYY" หรือ "DD-MM-YYYY" (พิมพ์มือ) → ISO "YYYY-MM-DD" หรือ null ถ้า invalid */
function parseDisplay(text: string): string | null {
  // รับ separator / หรือ -
  const parts = text.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map((p) => p.trim());
  if (!dd || !mm || !yyyy) return null;
  if (yyyy.length !== 4) return null;
  const day = parseInt(dd, 10);
  const mon = parseInt(mm, 10);
  const year = parseInt(yyyy, 10);
  if (isNaN(day) || isNaN(mon) || isNaN(year)) return null;
  if (mon < 1 || mon > 12) return null;
  if (day < 1 || day > 31) return null;
  // ตรวจสอบวันจริงด้วย Date object
  const date = new Date(year, mon - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== mon - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── component ─────────────────────────────────────────────────────────────────

interface DateFieldProps {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
  min?: string;          // ISO
  max?: string;          // ISO
  "aria-label"?: string;
  id?: string;
  required?: boolean;
  name?: string;
  placeholder?: string;
  onBlur?: () => void;
}

export default function DateField({
  value,
  onChange,
  className,
  disabled,
  min,
  max,
  "aria-label": ariaLabel,
  id,
  required,
  name,
  placeholder = "วว/ดด/ปปปป",
  onBlur: externalOnBlur,
}: DateFieldProps) {
  const hiddenId = useId();

  // ข้อความที่แสดงใน text input
  const [text, setText] = useState<string>(() => isoToDisplay(value));
  // ป้องกัน value เปลี่ยนจากภายนอก ขณะผู้ใช้ไม่ได้โฟกัส
  const [focused, setFocused] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);

  // sync ถ้า value เปลี่ยนจากภายนอก (เช่น reset ฟอร์ม) ขณะไม่ได้โฟกัส
  const displayFromProp = isoToDisplay(value);
  if (!focused && text !== displayFromProp) {
    setText(displayFromProp);
  }

  // ── ผู้ใช้พิมพ์ ──
  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);
    // auto-commit เมื่อพิมพ์ครบ 10 ตัว (DD/MM/YYYY)
    if (e.target.value.length === 10) {
      const iso = parseDisplay(e.target.value);
      if (iso) {
        onChange(iso);
        // อย่า setText ตรง — ปล่อย blur จัดการ
      }
    } else if (e.target.value === "") {
      onChange("");
    }
  }

  // ── blur: commit หรือ rollback ──
  function handleBlur() {
    setFocused(false);
    if (text === "") {
      onChange("");
      return;
    }
    const iso = parseDisplay(text);
    if (iso) {
      onChange(iso);
      setText(isoToDisplay(iso)); // normalize
    } else {
      // ค่าผิด → rollback กลับ value เดิม
      setText(isoToDisplay(value));
    }
    externalOnBlur?.();
  }

  // ── กดปุ่มปฏิทิน → เปิด native picker ──
  function openPicker() {
    if (disabled) return;
    const el = hiddenRef.current;
    if (!el) return;
    el.focus();
    if (typeof el.showPicker === "function") {
      try { el.showPicker(); } catch { el.click(); }
    } else {
      el.click();
    }
  }

  // ── native picker เลือก → อัปเดต ──
  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value; // ISO จาก browser
    onChange(iso);
    setText(isoToDisplay(iso));
  }

  return (
    <span className="relative inline-flex items-center w-full min-w-0">
      {/* text input แสดง DD/MM/YYYY */}
      <input
        type="text"
        id={id}
        name={name}
        required={required}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onChange={handleTextChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        inputMode="numeric"
        autoComplete="off"
        className={cn("tnum pr-9", className)}
      />

      {/* ปุ่มปฏิทิน */}
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        aria-label="เปิดปฏิทิน"
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80 transition-opacity disabled:opacity-25 focus:outline-none min-w-[24px] min-h-[24px] flex items-center justify-center"
      >
        <CalendarDays size={16} />
      </button>

      {/* hidden native date picker (invisible แต่ทำงานได้) */}
      <input
        ref={hiddenRef}
        id={hiddenId}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        min={min}
        max={max}
        value={value || ""}
        onChange={handleNativeChange}
        className="sr-only"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: "1px", height: "1px" }}
      />
    </span>
  );
}
