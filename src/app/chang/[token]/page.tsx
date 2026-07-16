import { notFound } from "next/navigation";
import { getChangToken } from "@/lib/chang-token";
import { Providers } from "@/app/providers";
import ProductionSchedulePage from "@/app/(app)/(oms)/production-schedule/page";
import ChangNameBar from "./ChangNameBar";

/**
 * ลิงก์ช่าง — ตารางผลิต (ไม่ต้อง login · อยู่นอกกลุ่ม (app) จึงไม่มี auth layout)
 *
 * ⚠️ หน้านี้ "เรนเดอร์หน้าตารางผลิตตัวเดียวกับเว็บหลัก" ไม่ใช่หน้าลอกแบบ — ห้ามแยกกลับ
 *    เจ้าของแจ้ง 16 ก.ค.2569: "เลย์เอาท์ลิงก์ช่างไม่เหมือนหน้าตารางผลิตในเว็บเต็ม"
 *    ต้นเหตุ: เดิมเป็นหน้าเขียนใหม่ (ChangPublicView) → หน้าตา/ฟีเจอร์หลุดจากเว็บหลักเรื่อย ๆ
 *    ตอนนี้ใช้ component เดียวกัน → เว็บหลักเปลี่ยนอะไร ลิงก์ช่างได้ตามทันทีเสมอ
 *
 * ทำงานได้เพราะ:
 *   · api client แนบ x-chang-token อัตโนมัติเมื่อ path ขึ้นต้น /chang/ (src/lib/api.ts)
 *   · API ฝั่ง server รับโทเคนแล้วตอบ role=CHANG (src/lib/bff/chang-ctx.ts)
 *   · หน้า production-schedule เห็น role=CHANG → เข้าโหมดช่างเอง (ซ่อนของออฟฟิศ) อยู่แล้วแต่เดิม
 *   · Providers = react-query (ปกติมาจาก layout ของ (oms) ซึ่งหน้านี้ไม่ได้อยู่ใต้)
 */
export const dynamic = "force-dynamic";

export default async function ChangLinkPage({ params }: { params: { token: string } }) {
  const expected = await getChangToken();
  if (!expected || params.token !== expected) notFound();
  return (
    <Providers>
      <div style={{ background: "#f2f2f7", minHeight: "100dvh" }}>
        <ChangNameBar token={params.token} />
        <ProductionSchedulePage />
      </div>
    </Providers>
  );
}
