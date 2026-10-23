import { err } from "@/lib/bff/response";
import { Http } from "@/lib/bff/context";
import { requireChangOr, type ChangCtx } from "@/lib/bff/chang-ctx";
import type { Action } from "@/lib/rbac";
import { PickError, type PickActor, type Sb } from "./service";

/** ใครกำลังเบิก — ช่างผ่านลิงก์ (ชื่อจาก header) หรือคนล็อกอิน (ชื่อจากโปรไฟล์) */
export async function pickCtx(req: Request, action: Action): Promise<{ ctx: ChangCtx; sb: Sb; actor: PickActor }> {
  const ctx = await requireChangOr(req, "stock", action, "write");
  // ช่างต้องล็อกอินด้วยรหัสพนักงาน (0161) — ไม่มีรหัส = ชื่อพิมพ์เองจาก header เดิม ปลอมแก้ใบคนอื่นได้ → 401 ให้ ChangGate ล็อกอินใหม่
  if (ctx.isChang && !ctx.actorCode) throw Http.unauthorized();
  const name = ctx.isChang ? ctx.actorName.trim() : String(ctx.profile?.full_name ?? "").trim();
  return {
    ctx,
    sb: ctx.supabase as unknown as Sb,
    actor: { userId: ctx.user.id || null, name, isChang: ctx.isChang },
  };
}

/** แปลง PickError → response ภาษาคน (withRoute รู้จักแค่ HttpError/Zod) */
export async function runPick(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (e) {
    if (e instanceof PickError) return err(e.message, e.status);
    throw e;
  }
}
