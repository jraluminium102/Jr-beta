import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// POST /api/floor-queue/pull — ดึงลูกค้าอัตโนมัติเข้าคิวงานพื้น
//   เงื่อนไข: floor_work != 'none' AND มัดจำแล้ว (deposit_date ไม่ว่าง) AND ยังไม่อยู่ในคิว (กันซ้ำด้วย unique job_id อยู่แล้ว
//   แต่กรองซ้ำที่นี่ก่อน insert เพื่อไม่ให้ error รก + คืนจำนวนที่เพิ่มจริงได้)
export const POST = withRoute(async () => {
  const ctx = await requirePermission("floor_queue", "write");
  const sb = ctx.supabase as unknown as Sb;

  const { data: existing, error: exErr } = await sb
    .from("floor_queue_entries")
    .select("job_id")
    .not("job_id", "is", null);
  if (exErr) throw dbError(exErr);
  const existingIds = new Set((existing ?? []).map((r: { job_id: string }) => r.job_id));

  const { data: jobs, error: jobsErr } = await sb
    .from("jobs")
    .select("id, customer_name")
    .neq("floor_work", "none")
    .not("deposit_date", "is", null);
  if (jobsErr) throw dbError(jobsErr);

  let skippedNoName = 0;
  const toInsert = (jobs ?? [])
    .filter((j: { id: string }) => !existingIds.has(j.id))
    .map((j: { id: string; customer_name: string | null }) => ({
      job_id: j.id,
      customer_name: String(j.customer_name ?? "").trim(),  // เก็บชื่อจริง (มี "คุณ" นำหน้า export กันซ้ำเอง)
      bucket: "deposit_wait",
      scheduled_date: null,
      status: "confirmed",
      kind: "work",
    }))
    // งานที่ชื่อลูกค้าว่าง/null (ข้อมูลเก่าคุณภาพต่ำ) → ข้าม ไม่สร้างคิวชื่อว่าง
    .filter((r: { customer_name: string }) => { if (!r.customer_name) { skippedNoName++; return false; } return true; });

  if (toInsert.length === 0) return ok({ added: 0, skipped_no_name: skippedNoName });

  // insert ธรรมดา (กรอง existingIds มาแล้ว) — unique job_id เป็น partial index จึงใช้ upsert onConflict ไม่ได้
  //   race หายาก (แอดมินกดดึงซ้อนกันพอดี) → ชน unique 23505 → คืนข้อความชวนกดใหม่ (รอบหน้า pre-filter จับเอง)
  const { data: inserted, error: insErr } = await sb.from("floor_queue_entries").insert(toInsert).select("id");
  if (insErr) {
    if (insErr.code === "23505") return err("มีการดึงลูกค้าซ้อนกันพอดี ลองกดอีกครั้ง (ระบบกันซ้ำให้แล้ว)", 409);
    throw dbError(insErr);
  }

  return ok({ added: inserted?.length ?? 0, skipped_no_name: skippedNoName });
});
