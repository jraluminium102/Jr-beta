"use client";

/**
 * GalleryPicker — แสดงรูปสินค้า + ติ๊ก "แนบรูปนี้" ต่อรายการใบเสนอราคา
 *
 * Props:
 *   productKey  — ตรงกับ PRODUCTS[].id เช่น "sliding_sms"
 *                 ถ้า empty string จะไม่ fetch (ยังไม่ได้เลือกสินค้า)
 *   selected    — gallery_id[] ที่เลือกไว้แล้ว
 *   onChange    — callback เมื่อ selection เปลี่ยน
 *   disabled    — ปิด interaction (read-only mode)
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface GalleryRow {
  id: number;
  product_key: string;
  title: string;
  public_url: string;
  sort_order: number;
}

interface Props {
  productKey: string;
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}

export default function GalleryPicker({ productKey, selected, onChange, disabled }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["gallery-picker", productKey],
    queryFn: () =>
      api.get<GalleryRow[]>(`/gallery?product_key=${encodeURIComponent(productKey)}`).then((r) => r.data),
    enabled: !!productKey,
    staleTime: 60_000,
  });

  const rows = data ?? [];

  if (!productKey || (rows.length === 0 && !isLoading)) return null;
  if (isLoading) return (
    <p className="text-[11px] text-ink-3 mt-1.5 animate-pulse">กำลังโหลดรูปสินค้า…</p>
  );

  function toggle(id: number) {
    if (disabled) return;
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="mt-2.5">
      <p className="text-[11px] font-medium text-ink-3 mb-1.5">
        รูปประกอบ ({rows.length} รูป) — ติ๊กเพื่อแนบลงใบ
      </p>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const isSelected = selected.includes(row.id);
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => toggle(row.id)}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? "ยกเลิกแนบ" : "แนบ"}รูป: ${row.title || row.product_key}`}
              className={`relative rounded-xl overflow-hidden border-2 transition-all min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                isSelected
                  ? "border-brand shadow-brand"
                  : "border-transparent hover:border-ink-3/40"
              } ${disabled ? "cursor-default" : "cursor-pointer pressable"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.public_url}
                alt={row.title || row.product_key}
                className="w-20 h-16 object-cover"
                loading="lazy"
              />
              {isSelected && (
                <span className="absolute inset-0 bg-brand/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-[10px] text-brand mt-1">แนบรูปแล้ว {selected.length} รูป</p>
      )}
    </div>
  );
}
