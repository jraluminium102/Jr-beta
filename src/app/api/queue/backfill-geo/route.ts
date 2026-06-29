import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { resolveMapLink } from "@/lib/queue-geo";

// POST /api/queue/backfill-geo?after=<id> — อ่านลิงก์แผนที่ของคิวเก่าที่ยังไม่มีพิกัด แล้วเติม lat/lng
//   ทำทีละ batch (parallel) + ใช้ cursor id เดินหน้า → ลิงก์ที่อ่านไม่ได้ถูกข้าม ไม่วนซ้ำ
//   เดิมเว็บอ่านลิงก์ย่อ goo.gl ไม่ได้ คิวเก่าเลยมี location_url แต่ lat/lng ว่าง → กฎ 45 นาทีใช้ไม่ได้
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Sb = { from: (t: string) => any };
const BATCH = 12;

export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const sb = ctx.supabase as unknown as Sb;
  const after = new URL(req.url).searchParams.get("after") ?? "";

  let q = sb
    .from("queue_entries")
    .select("id, location_url")
    .not("location_url", "is", null)
    .neq("location_url", "")
    .or("lat.is.null,lng.is.null")
    .order("id", { ascending: true })
    .limit(BATCH);
  if (after) q = q.gt("id", after);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const batch = (data ?? []) as { id: string; location_url: string }[];

  let updated = 0;
  let failed = 0;
  await Promise.all(
    batch.map(async (e) => {
      const co = await resolveMapLink(e.location_url);
      if (co) {
        const { error: ue } = await sb.from("queue_entries").update({ lat: co.lat, lng: co.lng }).eq("id", e.id);
        if (ue) failed++;
        else updated++;
      } else {
        failed++; // อ่านพิกัดไม่ได้ (ลิงก์เสีย/ไม่ใช่แผนที่) — ข้ามด้วย cursor id ไม่วนซ้ำ
      }
    })
  );

  const lastId = batch.length ? batch[batch.length - 1].id : after;
  return ok({ processed: batch.length, updated, failed, lastId });
});
