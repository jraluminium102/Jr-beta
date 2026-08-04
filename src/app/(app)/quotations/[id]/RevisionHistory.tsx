"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import Icon from "@/components/Icon";
import { baht } from "@/lib/money";

// ประวัติฉบับก่อนแก้ (0093) — โชว์รายการ snapshot ที่เก็บตอน "Rev + เก็บของเดิม"
//   เดิมเก็บไว้แต่ไม่มีหน้าให้ดู (ผู้ใช้หาฉบับเก่าไม่เจอ) → คลิกดู/พิมพ์ฉบับเก่าได้
export type RevisionRow = {
  id: number;
  label: string;
  created_at: string;
  total: number;
  itemCount: number;
};

function fmtDateTime(iso: string): string {
  // ISO → DD/MM/YYYY HH:mm (ค.ศ.) ไม่พึ่ง locale เบราว์เซอร์
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function RevisionHistory({
  quotationId,
  revisions,
}: {
  quotationId: number;
  revisions: RevisionRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press w-full flex items-center gap-2 text-left"
      >
        <Icon name="clipboard" size={18} />
        <span className="font-bold text-brand-dark">ประวัติฉบับก่อนแก้</span>
        <span className="text-xs font-normal text-ink-3">({revisions.length} ฉบับ · เก็บตอนเลือก &quot;Rev + เก็บของเดิม&quot;)</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {revisions.map((r) => (
            <div key={r.id} className="flex items-center gap-3 flex-wrap rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm">
              <span className="font-mono font-semibold text-brand-dark">{r.label}</span>
              <span className="text-ink-3 text-xs">{fmtDateTime(r.created_at)}</span>
              <span className="text-ink-2">{r.itemCount} รายการ</span>
              <span className="tabular-nums font-semibold ml-auto">฿{baht(r.total)}</span>
              <Link
                href={`/quotations/${quotationId}/rev/${r.id}/print`}
                className="press inline-flex items-center gap-1.5 glass-soft rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-dark"
              >
                <Icon name="printer" size={14} /> ดู / พิมพ์
              </Link>
            </div>
          ))}
          <p className="text-[11px] text-ink-3">
            * ฉบับก่อนแก้เก็บเป็นภาพนิ่ง (snapshot) ตามที่เคยส่งลูกค้า — ดู/พิมพ์ได้ แต่แก้ไม่ได้ (เอกสารปัจจุบันคือใบด้านบน)
          </p>
        </div>
      )}
    </Card>
  );
}
