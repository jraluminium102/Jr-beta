import { redirect } from "next/navigation";

// หน้าเก่า "🔍 เทียบคิดราคา 4.0 ↔ ใบตัด" — ยุบรวมเข้า /calculator40/link แล้ว (เจ้าของสั่ง 1 ก.ย.69)
//   เก็บ route นี้ไว้แค่ redirect กันคนที่บุ๊กมาร์กลิงก์เดิมไว้เจอ 404
export default function ComparePageRedirect() {
  redirect("/calculator40/link");
}
