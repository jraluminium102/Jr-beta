import { getProfile } from "@/lib/auth";
import { getChangToken } from "@/lib/chang-token";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * ใครกำลังใช้ใบตัด — คนล็อกอิน หรือ "ช่างผ่านลิงก์โทเคน" (ไม่ต้องล็อกอิน)
 *
 * เจ้าของสั่ง 16 ก.ค.2569: ช่างเปิดใบตัดจากลิงก์เดิม (/chang/<token>) ได้
 * และ **ดูได้ + สร้าง/แก้ใบตัดได้เอง**
 * เจ้าของสั่ง 23 ก.ค.2569: เปิดให้ช่าง "ตัดสต็อก" ได้ด้วย (ยืนยันใช้จริงหน้างาน) — จาก actorName "ช่าง <ชื่อ>" ยังรู้ว่าใครตัด
 *
 * ⚠ ทำไมต้องมีไฟล์นี้แทนที่จะ copy API ไปไว้ใต้ /api/chang:
 *   ใบตัดมี 5 endpoint (list/create/read/save/delete) — ถ้าโคลนไปอีกชุดจะกลายเป็น 2 ชุด
 *   ที่ต้องแก้คู่กันตลอดไป แล้ววันหนึ่งจะหลุดกันเงียบ ๆ · รวมทางเข้าไว้ที่เดียวคุมง่ายกว่า
 *
 * ⚠ ช่างไม่มี session → RLS บล็อก จึงต้องใช้ service client (ข้าม RLS)
 *   = สิทธิ์อยู่ที่ชั้นนี้ล้วน ๆ ห้ามปล่อยให้ actor ที่เป็น chang ทำเกินที่เขียนไว้ตรงนี้
 */
const CUT_WRITE = ["ADMIN", "PRODUCTION", "SALES", "ACCOUNTING"];

export type CutActor = {
  kind: "user" | "chang";
  canWrite: boolean;
  /** หักสต็อกจริงได้ไหม — คนล็อกอิน = ตามสิทธิ์ write · ช่างผ่านลิงก์ = ได้ (เจ้าของเคาะ 23 ก.ค.69) */
  canCutStock: boolean;
  /** ชื่อไว้ใส่ audit — ช่างพิมพ์ชื่อตัวเองมาจากหน้า chang */
  actorName: string;
  /** uuid ผู้ใช้ (created_by) — ช่างผ่านลิงก์ไม่มี = null */
  userId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: { from: (t: string) => any; rpc?: (n: string, a?: unknown) => any };
};

/** โทเคนช่างจาก header (หน้า chang ส่งมาให้) หรือ query — คืน null ถ้าไม่มี/ไม่ตรง */
async function changOk(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  const token = req.headers.get("x-chang-token") ?? url.searchParams.get("chang_token");
  if (!token) return null;
  const expected = await getChangToken();
  if (!expected || token !== expected) return null;
  return token;
}

export async function cutlistActor(req: Request): Promise<CutActor | null> {
  const profile = await getProfile();
  if (profile) {
    const canWrite = CUT_WRITE.includes(profile.role);
    return {
      kind: "user",
      canWrite,
      canCutStock: canWrite,
      actorName: profile.full_name ?? "",
      userId: profile.id,
      sb: createClient() as unknown as CutActor["sb"],
    };
  }
  if (await changOk(req)) {
    // ⚠ HTTP header ใส่ได้แต่ ISO-8859-1 — ชื่อช่างเป็นไทยทุกคน (เนียน/กุ้ง/เป)
    //   ถ้าใส่ดิบ ๆ fetch ฝั่ง client จะ throw ทั้งคำขอเลย ("String contains non ISO-8859-1 code point")
    //   → ฝั่งหน้าเว็บ encodeURIComponent มา ที่นี่ถอดกลับ (เจอตอนเทสจริงกับชื่อไทย 16 ก.ค.2569)
    const raw = req.headers.get("x-chang-name") ?? "";
    let name = "";
    try { name = decodeURIComponent(raw); } catch { name = raw; }
    return {
      kind: "chang",
      canWrite: true,        // ช่างสร้าง/แก้ใบตัดได้ (เจ้าของเคาะ)
      canCutStock: true,     // ช่างตัดสต็อกจริงได้ (เจ้าของเคาะ 23 ก.ค.69 — ยืนยันใช้จริงหน้างาน) · ยังจด actorName = "ช่าง <ชื่อ>" ไว้ audit
      actorName: name ? `ช่าง ${name}` : "ช่าง (ลิงก์)",
      userId: null,
      sb: createServiceClient() as unknown as CutActor["sb"],
    };
  }
  return null;
}
