import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { getChangToken } from "@/lib/chang-token";

// GET /api/chang-open — คนล็อกอิน (ออฟฟิศ) กดจากหน้าผลิต → เด้งเข้าลิงก์ตารางผลิตช่าง /chang/<token>
//   (ออฟฟิศเปิดลิงก์ช่าง = ระบบรู้ว่าเป็นออฟฟิศ ได้โหมดเต็มเหมือนเดิม · ช่างไม่ล็อกอินได้โหมดช่าง)
//   ?to=pick    → หน้าเบิกอลูของช่าง (/chang/<token>/pick · เจ้าของขอ "ลิงก์แยก" 20 ต.ค.69)
//   ?to=cutlist → หน้าใบตัดของช่าง
//   ?format=json → คืน { url } ไว้กดคัดลอกส่งช่าง (ไม่เด้ง)
export const dynamic = "force-dynamic";

const SUB: Record<string, string> = { pick: "/pick", cutlist: "/cutlist" };

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", req.url));
  const token = await getChangToken();
  if (!token) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าลิงก์ช่าง (CHANG_LINK_TOKEN)" }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const url = new URL(`/chang/${token}${SUB[q.get("to") ?? ""] ?? ""}`, req.url);
  if (q.get("format") === "json") return NextResponse.json({ url: url.toString() });
  return NextResponse.redirect(url);
}
