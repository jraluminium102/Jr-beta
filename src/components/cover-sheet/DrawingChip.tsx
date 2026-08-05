"use client";
import Link from "next/link";
import { PenSquare } from "lucide-react";

/**
 * DrawingChip — ป้าย "สแตมป์สเปคลงแบบ" บนการ์ดงานผลิต (คู่กับ CoverSheetChip/CutlistChip)
 *   exists=true  → ม่วงเข้ม "แบบลูกค้า" (มีแล้ว กดเปิด/แก้)
 *   exists=false → จาง "สแตมป์สเปคลงแบบ" (ยังไม่มี กดเริ่มทำ) — โชว์เฉพาะงานมัดจำแล้ว (การ์ดหน้าผลิตคือมัดจำแล้วทุกใบอยู่แล้ว)
 */
export default function DrawingChip({ jobId, exists }: { jobId: string | null; exists: boolean }) {
  if (!jobId) return null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const linkCls = "text-[11px] rounded-md px-1.5 py-0.5 font-medium inline-flex items-center gap-1";

  if (exists) {
    return (
      <Link href={`/cover-sheet/${jobId}/drawing`} onClick={stop} className={linkCls}
        style={{ background: "#f1e9fc", color: "#6d28d9", border: "1px solid #ddc9f7" }}>
        <PenSquare size={11} /> แบบลูกค้า
      </Link>
    );
  }
  return (
    <Link href={`/cover-sheet/${jobId}/drawing`} onClick={stop} className={linkCls}
      style={{ background: "#f1f1f4", color: "#8a8a8e", border: "1px solid #e5e5ea" }}>
      <PenSquare size={11} /> สแตมป์สเปคลงแบบ
    </Link>
  );
}
