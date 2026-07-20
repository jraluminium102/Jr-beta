import Link from "next/link";

/**
 * ปุ่มสลับ "แสดง/ซ่อนเอกสารทดสอบ" (ก่อนวันตัดบิล · ดู src/lib/doc-cutoff.ts)
 * โชว์เฉพาะเมื่อมีการตั้งวันตัดไว้ (cutoff ไม่ว่าง) — ไม่ตั้ง = ไม่มีอะไรให้ซ่อน
 * ใช้ในหน้า list (server component): ส่ง cutoff + includeTest + basePath มา
 */
export function TestDocsToggle({ cutoff, includeTest, basePath }: { cutoff: string; includeTest: boolean; basePath: string }) {
  // ไม่มีวันตัด → ไม่ต้องมีปุ่ม (ยกเว้นตอน includeTest ค้างอยู่ก็ให้ลิงก์กลับ)
  if (!cutoff && !includeTest) return null;
  if (includeTest) {
    return (
      <Link href={basePath} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 bg-amber-100 text-amber-800 border border-amber-300">
        👁 กำลังแสดงเอกสารทดสอบด้วย — กดเพื่อซ่อน
      </Link>
    );
  }
  return (
    <Link href={`${basePath}?includeTest=1`} className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 bg-gray-100 text-ink-3 border border-gray-200 hover:bg-gray-200">
      แสดงเอกสารทดสอบ (ก่อน {cutoff})
    </Link>
  );
}
