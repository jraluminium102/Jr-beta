import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { getSalesToken } from "@/lib/sales-link-token";

// GET /api/sales-open — ออฟฟิศกดจากหน้าคิวงาน → เด้งเข้าลิงก์คิวประเมินของเซลล์ /sales-queue/<token>
//   ?format=json → คืน { url } ไว้คัดลอกส่งเซลล์ (ไม่เด้ง)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", req.url));
  const token = await getSalesToken();
  if (!token) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าลิงก์เซลล์ (รัน migration 0165)" }, { status: 404 });
  const url = new URL(`/sales-queue/${token}`, req.url);
  if (new URL(req.url).searchParams.get("format") === "json") return NextResponse.json({ url: url.toString() });
  return NextResponse.redirect(url);
}
