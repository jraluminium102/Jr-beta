import type { Metadata } from "next";
import SellCalcApp from "./SellCalcApp";

/**
 * /quote — ลิงก์เครื่องคิดราคา (R3.9) สำหรับเซลล์คิดราคาหน้างาน มือถือ/แท็บเล็ต
 *   · public · ไม่ต้อง login (นอกกลุ่ม (app)) · ล็อกด้วย PIN (app_config quote_pin · migration 0132)
 *   · เนื้อเครื่องคิด = public/calculator/index.html เสิร์ฟผ่าน /api/quick-quote/calc หลังใส่รหัสถูก
 *   · โหมดเซลล์: ซ่อนปุ่มที่ต้อง login (ส่งเข้าระบบ/AI) · คิด+พรีวิว+พิมพ์ในเครื่องได้
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "คิดราคา — JR Aluminium",
  robots: { index: false, follow: false },
};

export default function QuotePage() {
  return <SellCalcApp />;
}
