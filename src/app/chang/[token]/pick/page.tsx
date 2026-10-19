import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangToken } from "@/lib/chang-token";
import { Providers } from "@/app/providers";
import PickFlow from "@/components/alu-pick/PickFlow";

/**
 * เบิกอลู (ลิงก์ช่าง · ไม่ต้องล็อกอิน · มือถือ) — เจ้าของเคาะ 19 ต.ค.69
 *   ช่างเลือกชื่อ → เลือกงาน → เลือกเส้น → บันทึก = ตัดสต็อกทันที (ดู src/components/alu-pick/PickFlow.tsx)
 *   API ตัวเดียวกับออฟฟิศ (/api/alu-picks · api client แนบโทเคน + ชื่อช่างให้เอง)
 */
export const dynamic = "force-dynamic";

export default async function ChangPickPage({ params }: { params: { token: string } }) {
  const expected = await getChangToken();
  if (!expected || params.token !== expected) notFound();
  return (
    <Providers>
      <div style={{ background: "#f2f2f7", minHeight: "100dvh" }}>
        <div className="max-w-[640px] mx-auto">
          <div className="px-4 pt-3 flex items-center gap-3">
            <Link href={`/chang/${params.token}`} className="text-[13px]" style={{ color: "#007aff" }}>← ตารางผลิต</Link>
            <span className="text-[15px] font-bold" style={{ color: "#1c1c1e" }}>📦 เบิกอลู</span>
          </div>
          <PickFlow isChang />
        </div>
      </div>
    </Providers>
  );
}
