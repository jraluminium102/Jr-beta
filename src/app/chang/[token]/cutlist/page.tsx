import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangToken } from "@/lib/chang-token";
import { Providers } from "@/app/providers";
import ChangCutlistList from "./ChangCutlistList";

/**
 * ใบตัด/ตัดประกอบ สำหรับช่าง — "เข้าได้อิสระ ไม่ต้องมีงานลูกค้าในคิว"
 * (เจ้าของสั่ง 16 ก.ค.2569: เผื่อช่างทำงานนอกระบบ หรือแค่อยากลองคิดเลขเช็คอะไร)
 *
 * ช่าง: สร้าง/แก้/ดูได้ · ตัดสต็อกไม่ได้ (ดู src/lib/cutlist/actor.ts)
 */
export const dynamic = "force-dynamic";

export default async function ChangCutlistIndex({ params }: { params: { token: string } }) {
  const expected = await getChangToken();
  if (!expected || params.token !== expected) notFound();
  return (
    <Providers>
      <div style={{ background: "#f2f2f7", minHeight: "100dvh" }} className="p-4 sm:p-6">
        <div className="max-w-[760px] mx-auto">
          <Link href={`/chang/${params.token}`} className="text-[13px]" style={{ color: "#007aff" }}>← ตารางผลิต</Link>
          <h1 className="text-2xl font-bold mt-1 mb-0.5" style={{ color: "#1c1c1e", letterSpacing: "-.01em" }}>✂️ ใบตัด / ตัดประกอบ</h1>
          <p className="text-[12.5px] mb-4" style={{ color: "#636366" }}>
            คิดขนาดตัด + สรุปเส้นต่อรหัส · ผูกงานลูกค้าหรือไม่ผูกก็ได้ · เทียบสต็อกให้ดู แต่ช่างกดตัดสต็อกไม่ได้
          </p>
          <ChangCutlistList token={params.token} />
        </div>
      </div>
    </Providers>
  );
}
