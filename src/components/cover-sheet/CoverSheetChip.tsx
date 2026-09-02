"use client";
import Link from "next/link";
import { FileCheck, TriangleAlert, FilePlus } from "@/components/ui/icons";

/**
 * CoverSheetChip — ป้ายสถานะ "ใบปะหน้า" บนการ์ดงานผลิต (คู่กับ CutlistChip)
 *   exists=true            → เขียว "ใบปะหน้า" (มีแล้ว กดเปิด/แก้)
 *   exists=false, stage<=13 → ส้ม/แดง "ทำใบปะหน้า" (ก่อน/ช่วงประชุม — เตือนให้ทำ)
 *   exists=false, stage>13  → จาง "ใบปะหน้า" (พ้นช่วงเตือนแล้ว แต่ยังกดทำได้)
 *   เจ้าของสั่ง: เตือนเฉพาะ stage<=13 — พ้นแล้วไม่ต้องเตือนซ้ำ
 *   revStale=true (0136) → ใบเสนอถูก Rev หลังสร้างใบปะหน้านี้ — เติมจุดส้ม + tooltip เตือน (ไม่ทับของที่แก้มือ)
 */
export default function CoverSheetChip({ jobId, exists, currentStage, canWrite, revStale }: {
  jobId: string | null;
  exists: boolean;
  currentStage?: number | null;
  canWrite: boolean;
  revStale?: boolean;
}) {
  if (!jobId) return null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const linkCls = "text-[11px] rounded-md px-1.5 py-0.5 font-medium inline-flex items-center gap-1 relative";

  if (exists) {
    return (
      <Link href={`/cover-sheet/${jobId}`} onClick={stop} className={linkCls}
        title={revStale ? "ใบเสนอถูก Rev หลังสร้างใบปะหน้านี้ — เปิดดูรายละเอียด" : undefined}
        style={{ background: "#e8f8ee", color: "#1a7d4f", border: "1px solid #bfe8cf" }}>
        <FileCheck size={11} /> ใบปะหน้า
        {revStale && <TriangleAlert size={11} className="text-orange-600" />}
      </Link>
    );
  }

  if (!canWrite) return null;

  const stage = currentStage ?? 0;
  const urgent = stage <= 13;
  return (
    <Link href={`/cover-sheet/${jobId}`} onClick={stop} className={linkCls}
      style={urgent
        ? { background: "#fff1e6", color: "#c2540a", border: "1px solid #ffd7b3" }
        : { background: "#f1f1f4", color: "#8a8a8e", border: "1px solid #e5e5ea" }}>
      {urgent ? <TriangleAlert size={11} /> : <FilePlus size={11} />}
      {urgent ? "ทำใบปะหน้า" : "ใบปะหน้า"}
    </Link>
  );
}
