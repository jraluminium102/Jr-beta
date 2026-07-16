import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/admin";
import { getChangToken } from "@/lib/chang-token";
import { getContext, Http, type Ctx } from "./context";
import { can, type Action, type Resource } from "@/lib/rbac";

/**
 * "ช่างผ่านลิงก์" ให้ทำงานกับ API เดิมได้ โดยไม่ต้อง login และไม่ต้องโคลน endpoint
 *
 * ── ทำไมต้องมี ──────────────────────────────────────────────────────────────
 * เจ้าของแจ้ง 16 ก.ค.2569: "เลย์เอาท์ลิงก์ช่างไม่เหมือนหน้าตารางผลิตช่างในเว็บเต็ม"
 * เพราะเดิมลิงก์ช่างเป็น "หน้าเขียนใหม่" (ChangPublicView) + "API เขียนใหม่" (/api/chang/<token>)
 * → หน้าตา/ฟีเจอร์หลุดจากเว็บหลักเรื่อย ๆ (แก้ data ให้ตรงแล้วก็ยังหลุด เพราะ UI คนละตัว)
 *
 * วิธีที่ยั่งยืน = **ให้ลิงก์ช่างใช้ "หน้าเดียวกัน + API เดียวกัน" กับเว็บหลักไปเลย**
 * หน้า production-schedule มีโหมด `isChang` (meta.role === "CHANG") ที่ซ่อนของออฟฟิศอยู่แล้ว
 * → แค่ทำให้ API เดิมรับ "โทเคนช่าง" แล้วตอบ role=CHANG หน้าเดิมก็ทำงานได้ทันที เลย์เอาท์ตรงกัน 100% ตลอดไป
 *
 * ── ความปลอดภัย ────────────────────────────────────────────────────────────
 * ช่างไม่มี session → RLS บล็อก จึงต้องใช้ service client (ข้าม RLS)
 * = **สิทธิ์ทั้งหมดอยู่ที่ไฟล์นี้ล้วน ๆ** · endpoint ไหนที่ "ห้ามช่าง" ห้ามเรียก requireChangOr()
 * ให้เรียก requirePermission() ปกติ (ช่างจะได้ 401 เพราะไม่มี session) — เช่น ลบงาน/เพิ่มงานออฟฟิศ
 */

export type ChangCtx = Omit<Ctx, "profile"> & {
  /** true = มาจากลิงก์ช่าง (ไม่มี session) */
  isChang: boolean;
  /** ชื่อที่ช่างพิมพ์ไว้ (ไว้ทำ audit) */
  actorName: string;
  profile: Ctx["profile"] | null;
};

/** โทเคนช่างถูกต้องไหม — อ่านจาก header (หน้าเว็บแนบให้อัตโนมัติ) หรือ query */
async function tokenOk(req: Request): Promise<boolean> {
  const token = req.headers.get("x-chang-token") ?? new URL(req.url).searchParams.get("chang_token");
  if (!token) return false;
  const expected = await getChangToken();
  return !!expected && token === expected;
}

/** ชื่อช่างจาก header — ⚠ ต้อง decode: header รับแค่ ISO-8859-1 ชื่อไทยเลยถูก encode มา */
export function changActorName(req: Request): string {
  const raw = req.headers.get("x-chang-name") ?? "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * เหมือน requirePermission() แต่ "ยอมรับลิงก์ช่าง" ด้วย
 * ใช้กับ endpoint ที่ช่างต้องใช้จริง: ดูตารางผลิต · มาร์คเช็คลิสต์ · เริ่มผลิต/ส่งติดตั้ง
 *
 * @param changAction สิ่งที่ช่างทำได้กับ resource นี้ ("read" = ดูอย่างเดียว, "write" = แก้ได้)
 *                    ถ้า action ที่ขอเกินกว่านี้ → ช่างโดน 403
 */
export async function requireChangOr(
  req: Request,
  resource: Resource,
  action: Action,
  changAction: Action = "write",
): Promise<ChangCtx> {
  // คนล็อกอินก่อนเสมอ (ได้ ctx จริง + RLS ของตัวเอง)
  const ctx = await getContext();
  if (ctx) {
    if (!can(ctx.role, resource, action)) throw Http.forbidden();
    return { ...ctx, isChang: false, actorName: ctx.profile.full_name ?? "" };
  }
  // ไม่มี session → ลิงก์ช่าง
  if (!(await tokenOk(req))) throw Http.unauthorized();
  if (action !== "read" && changAction !== "write") throw Http.forbidden();
  return {
    supabase: createServiceClient() as unknown as SupabaseClient<Database>,
    user: { id: "", email: null },
    profile: null,
    role: "CHANG",
    isChang: true,
    actorName: changActorName(req),
  };
}
