"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ImageZoom — กดรูปเล็ก → เด้ง popup รูปใหญ่ (lightbox) แทนเปิดแท็บใหม่
 * ใช้ในหน้าสต๊อก + ใบตัด (ทุกที่ที่มีรูปสินค้า/รูปโปรไฟล์อลู)
 *
 * children = ตัว trigger (รูปย่อ / ไอคอน / ข้อความ "ดูรูปเต็ม")
 * ครอบด้วย <button> — กันคลิกทะลุไปโดน onClick พ่อ (เช่น แถวที่กดเลือก) ด้วย stopPropagation
 * ปิดด้วย: คลิกพื้นดำ · ปุ่ม ✕ · ปุ่ม Esc
 */
export default function ImageZoom({
  src, alt = "", children, className, title,
}: {
  src: string;
  alt?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    // กันหน้าเลื่อนใต้ overlay
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  if (!src) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        title={title ?? "ดูรูปใหญ่"}
        aria-label={title ?? "ดูรูปใหญ่"}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={className}
      >
        {children}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 cursor-zoom-out"
          style={{ backdropFilter: "blur(2px)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[92vh] object-contain rounded-xl shadow-2xl"
            style={{ cursor: "default" }}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="ปิด"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white text-2xl leading-none flex items-center justify-center"
          >
            ✕
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
