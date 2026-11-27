import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { PHOTO_JOB_TYPE, photoCrew, type PhotoHistoryItem } from "@/lib/photo-queue";

export const dynamic = "force-dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

// GET /api/queue/photo-history[?customer_id=N][&job_id=UUID]
//   ประวัติคิวถ่ายผลงาน (เจ้าของ 27 พ.ย.69: "อยากได้เป็นประวัติด้วยว่าเคยถ่าย") — อ่านอย่างเดียว ไม่รวมคิวที่ยกเลิก
//   ใช้ที่: ฟอร์มคิวถ่ายผลงาน (ป้าย "เคยถ่ายแล้ว" + รายการประวัติ) · ทะเบียนลูกค้า (ใต้หน้างานของลูกค้า)
//   คิวที่ผูกงานในระบบ → target_job_id / target_customer_id · ลูกค้านอกระบบ → ว่างทั้งคู่
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("jobs", "read");
  const sb = ctx.supabase as unknown as Sb;
  const url = new URL(req.url);
  const cidRaw = Number(url.searchParams.get("customer_id"));
  const customerId = Number.isInteger(cidRaw) && cidRaw > 0 ? cidRaw : null;
  const jobIdRaw = (url.searchParams.get("job_id") ?? "").trim();
  const jobId = /^[0-9a-f-]{36}$/i.test(jobIdRaw) ? jobIdRaw : null;

  // ทุกคอลัมน์ที่เรียกมีมาตั้งแต่ migration 0010/0044/0045 (ไม่มีคอลัมน์ใหม่)
  const COLS = "id, status, queue_date, queue_time, customer_name, tel, address, location_url, note_admin, note_ai, job_type, target_job_id, target_customer_id";
  let failed: unknown = null;
  const rows = await fetchAllPaged<Record<string, unknown>>((from, to) => {
    let q = sb.from("queue_entries").select(COLS)
      .eq("job_type", PHOTO_JOB_TYPE)
      .neq("status", "CANCELLED")
      .order("queue_date", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, to);
    if (customerId != null) q = q.eq("target_customer_id", customerId);
    if (jobId) q = q.eq("target_job_id", jobId);
    return q;
  }, 1000, (e) => { failed = e; });
  // โหลดไม่ครบต้องบอก — ห้ามคืนว่าง (จะกลายเป็น "ยังไม่เคยถ่าย" ทั้งที่เคย)
  if (failed) throw dbError(failed as Parameters<typeof dbError>[0]);

  // รหัสงานของคิวที่ผูกงาน (ไว้โชว์ JR2026-xxx)
  const jobIds = [...new Set(rows.map((r) => r.target_job_id).filter((x): x is string => typeof x === "string" && !!x))];
  const codeOf = new Map<string, string | null>();
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data, error } = await sb.from("jobs").select("id, job_code").in("id", jobIds.slice(i, i + 200));
    if (error) throw dbError(error);
    for (const j of (data ?? []) as { id: string; job_code: string | null }[]) codeOf.set(j.id, j.job_code);
  }

  const items: PhotoHistoryItem[] = rows.map((r) => ({
    id: String(r.id),
    status: String(r.status ?? ""),
    queue_date: (r.queue_date as string | null) ?? null,
    queue_time: (r.queue_time as string | null) ?? null,
    customer_name: String(r.customer_name ?? ""),
    tel: (r.tel as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    location_url: (r.location_url as string | null) ?? null,
    note_admin: (r.note_admin as string | null) ?? null,
    crew: photoCrew(r as { note_ai?: string | null }),
    target_job_id: (r.target_job_id as string | null) ?? null,
    target_customer_id: (r.target_customer_id as number | null) ?? null,
    job_code: r.target_job_id ? codeOf.get(String(r.target_job_id)) ?? null : null,
  }));
  return ok(items);
});
