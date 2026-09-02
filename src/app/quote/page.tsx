import type { Metadata } from "next";
import QuoteApp from "./QuoteApp";

/**
 * /quote — หน้าคิดราคาประเมินเบื้องต้น สำหรับเซลล์หน้างาน (มือถือ/แท็บเล็ต)
 *   · public · ไม่ต้อง login (อยู่นอกกลุ่ม (app) จึงไม่มี auth layout)
 *   · ล็อกด้วยรหัสผ่านง่าย ๆ (PIN) — ราคาโหลดจาก /api/quick-quote/unlock หลังใส่รหัสถูก
 *   · ราคา = "ประเมินเบื้องต้น" ไม่ใช่ใบเสนอราคาจริง · เก็บใบที่คิดไว้ในเครื่อง (localStorage)
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "คิดราคาประเมิน — JR Aluminium",
  robots: { index: false, follow: false }, // กัน search engine เก็บหน้า
};

export default function QuotePage() {
  return <QuoteApp />;
}
