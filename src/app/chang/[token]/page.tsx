import { notFound } from "next/navigation";
import ChangPublicView from "./ChangPublicView";
import { getChangToken } from "@/lib/chang-token";

// หน้า "ตารางผลิตช่าง" แบบลิงก์ลับ ไม่ต้อง login — อยู่นอกกลุ่ม (app) จึงไม่มี auth layout
export const dynamic = "force-dynamic";

export default async function ChangLinkPage({ params }: { params: { token: string } }) {
  const expected = await getChangToken();
  if (!expected || params.token !== expected) notFound();
  return <ChangPublicView token={params.token} />;
}
