"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";

// ป๊อปอัพ "เอกสารที่เกี่ยวข้อง" บนหน้ารายการใบเสนอ/ใบวางบิล — กดกระโดดไปเอกสารที่ผูกกันได้เลย
//   (อ้างอิงUX FlowAccount ที่เจ้าของใช้ · สาย: ใบเสนอ → ใบวางบิล → ใบเสร็จ)
//   ใช้ portal + position:fixed กันโดน overflow ของตารางบัง
export type RelatedDoc = { group: string; code: string; href: string };

export function RelatedDocs({ docs }: { docs: RelatedDoc[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // หน่วง 1 tick กันคลิกที่เปิดเมนูมาปิดเมนูทันที
    const t = setTimeout(() => {
      document.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!docs.length) return null;

  const groups = docs.reduce<Record<string, RelatedDoc[]>>((acc, d) => {
    (acc[d.group] ??= []).push(d);
    return acc;
  }, {});

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        title="เอกสารที่เกี่ยวข้อง"
        aria-label="เอกสารที่เกี่ยวข้อง"
        className="ml-1 inline-flex align-middle text-ink-3 hover:text-brand"
      >
        <Icon name="file" size={14} />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 60 }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-[210px] max-w-[280px] rounded-xl bg-white shadow-xl border border-gray-200 p-3"
        >
          <div className="text-xs font-bold text-brand mb-2">เอกสารที่เกี่ยวข้อง</div>
          {Object.entries(groups).map(([g, list]) => (
            <div key={g} className="mb-2 last:mb-0">
              <div className="text-[11px] text-ink-3 mb-0.5">{g}</div>
              {list.map((d) => (
                <Link
                  key={g + d.href + d.code}
                  href={d.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 text-sm font-mono font-semibold text-brand-dark hover:underline py-0.5"
                >
                  <Icon name="external" size={13} /> {d.code}
                </Link>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
