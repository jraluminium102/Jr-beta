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
  // กันปี พ.ศ. (เช่น 2569) หลุดเข้า DB — บังคับ ค.ศ. เท่านั้น
  if (year >= 2500) return null;
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

/** ดึงเลขปี (ส่วนที่ 3) จากข้อความ DD/MM/YYYY — ใช้ตรวจว่ากรอก พ.ศ. มาไหม */
function yearOf(text: string): number | null {
  const parts = text.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const y = parseInt(parts[2].trim(), 10);
  return isNaN(y) ? null : y;
}

/** ISO → "DD/MM/YYYY" สำหรับข้อความเตือน */
const say = (iso: string) => isoToDisplay(iso) || iso;

/**
 * เช็ค min/max กับค่าที่ "พิมพ์เอง"
 *
 * เดิม min/max ผูกไว้กับ <input type="date"> ที่ซ่อนอยู่เท่านั้น → คุมได้แค่ตอนกดปฏิทิน
 * พิมพ์มือทะลุไปเลย (นี่คือทางที่วันที่เพี้ยนหลุดเข้าระบบจริง)
 */
function rangeIssue(iso: string, min?: string, max?: string): string | null {
  if (min && iso < min) return `ต้องไม่ก่อน ${say(min)}`;
  if (max && iso > max) return `ต้องไม่เกิน ${say(max)}`;
  return null;
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
  // ข้อความเตือนเมื่อกรอกปี พ.ศ. (เช่น 2569)
  const [beWarn, setBeWarn] = useState<string | null>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  // sync ถ้า value เปลี่ยนจากภายนอก (เช่น reset ฟอร์ม) ขณะไม่ได้โฟกัส
  const displayFromProp = isoToDisplay(value);
  if (!focused && text !== displayFromProp) {
    setText(displayFromProp);
  }

  // ── ผู้ใช้พิมพ์ ──
  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setText(v);
    setBeWarn(null);
    // auto-commit เมื่อพิมพ์ครบ 10 ตัว (DD/MM/YYYY)
    if (v.length === 10) {
      const yr = yearOf(v);
      if (yr != null && yr >= 2500) {
        // กรอกปี พ.ศ. มา → ไม่รับ + บอกให้ใช้ ค.ศ.
        setBeWarn(`กรอกปี ค.ศ. ${yr - 543} (ไม่ใช่ พ.ศ. ${yr})`);
        return;
      }
      const iso = parseDisplay(v);
      if (iso) {
        const bad = rangeIssue(iso, min, max);
        if (bad) { setBeWarn(bad); return; }   // นอกช่วง → ไม่ commit
        onChange(iso);
        // อย่า setText ตรง — ปล่อย blur จัดการ
      }
    } else if (v === "") {
      onChange("");
    }
  }

  // ── blur: commit หรือ rollback ──
  function handleBlur() {
    setFocused(false);
    if (text === "") {
      setBeWarn(null);
      onChange("");
      return;
    }
    const yr = yearOf(text);
    if (yr != null && yr >= 2500) {
      // กรอกปี พ.ศ. → คงข้อความเตือน + rollback ค่าเดิม (ไม่ commit พ.ศ.)
      setBeWarn(`กรอกปี ค.ศ. ${yr - 543} (ไม่ใช่ พ.ศ. ${yr})`);
      setText(isoToDisplay(value));
      externalOnBlur?.();
      return;
    }
    setBeWarn(null);
    const iso = parseDisplay(text);
    if (iso) {
      const bad = rangeIssue(iso, min, max);
      if (bad) {
        // นอกช่วงที่อนุญาต → เตือน + rollback (ห้าม commit)
        setBeWarn(bad);
        setText(isoToDisplay(value));
        externalOnBlur?.();
        return;
      }
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
        aria-invalid={beWarn ? true : undefined}
        className={cn("tnum pr-9", beWarn && "ring-1 ring-rose-500 border-rose-500", className)}
      />

      {/* เตือนเมื่อกรอกปี พ.ศ. */}
      {beWarn && (
        <span
          role="alert"
          className="absolute left-0 top-full mt-0.5 z-20 whitespace-nowrap rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-medium text-white shadow"
        >
          {beWarn}
        </span>
      )}

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
