import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { getChangToken } from "@/lib/chang-token";

// GET /api/chang-open — คนล็อกอิน (ออฟฟิศ) กดจากหน้าผลิต → เด้งเข้าลิงก์ตารางผลิตช่าง /chang/<token>
//   (ออฟฟิศเปิดลิงก์ช่าง = ระบบรู้ว่าเป็นออฟฟิศ ได้โหมดเต็มเหมือนเดิม · ช่างไม่ล็อกอินได้โหมดช่าง)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", req.url));
  const token = await getChangToken();
  if (!token) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าลิงก์ช่าง (CHANG_LINK_TOKEN)" }, { status: 404 });
  return NextResponse.redirect(new URL(`/chang/${token}`, req.url));
}
