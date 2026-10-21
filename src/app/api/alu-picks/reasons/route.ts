import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { pickCtx } from "@/lib/alu-pick/route-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/alu-picks/reasons → ข้อความ "อื่นๆ (ระบุ)" ที่เคยกรอก (ทุกช่าง) ใช้ล่าสุดก่อน · ไม่ซ้ำ · สูงสุด 20
 *   เจ้าของสั่ง 21 ต.ค.69: "ช่อง อื่นๆ(ระบุ) อยากให้บันทึกประวัติการกรอกไว้เผื่อใส่รอบหน้า"
 */
export const GET = withRoute(async (req: Request) => {
  const { sb } = await pickCtx(req, "read");
  const { data } = await sb.from("alu_picks").select("reason_note, created_at")
    .eq("reason", "other").neq("status", "cancelled").order("created_at", { ascending: false }).limit(300);
  const seen = new Map<string, string>();   // ตัวพิมพ์เล็ก/ไม่มีช่องว่าง → ข้อความที่โชว์ (แบบล่าสุด)
  for (const r of (data ?? []) as { reason_note: string | null }[]) {
    const t = String(r.reason_note ?? "").trim();
    if (!t) continue;
    const k = t.replace(/\s+/g, "").toLowerCase();
    if (!seen.has(k)) seen.set(k, t);
    if (seen.size >= 20) break;
  }
  return ok([...seen.values()]);
});
