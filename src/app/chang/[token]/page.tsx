import { notFound } from "next/navigation";
import ChangPublicView from "./ChangPublicView";

// หน้า "ตารางผลิตช่าง" แบบลิงก์ลับ ไม่ต้อง login — อยู่นอกกลุ่ม (app) จึงไม่มี auth layout
export const dynamic = "force-dynamic";

export default function ChangLinkPage({ params }: { params: { token: string } }) {
  const expected = process.env.CHANG_LINK_TOKEN;
  if (!expected || expected.length < 8 || params.token !== expected) notFound();
  return <ChangPublicView token={params.token} />;
}
