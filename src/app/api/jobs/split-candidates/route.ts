import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

// GET /api/jobs/split-candidates — ADMIN: หา "งานที่ปนหลายออเดอร์" = มีใบวางบิล Active ผูก "ใบเสนอ ≥ 2 ใบคนละใบ"
//   (ลูกค้าตกลงจ่ายหลายออเดอร์จริงใต้งานเดียว) — จุดที่ต้องใช้เครื่องมือ "แตกออเดอร์" (0129) เช่นเคสคุณไอซ์/คุณกิ๊ฟ
//   ⚠ 16 ต.ค.69: เดิมนับ ">1 ใบเสนอ หรือ >1 บิล" → ขึ้น 30 งานแต่เกือบทั้งหมดไม่ได้ปน
//     (ออกใบเสนอใหม่แทนใบเดิมโดยไม่ยกเลิกใบเก่า · ออเดอร์เดียวออกบิลหลายใบ) = แจ้งเตือนหลอก
//   บิลนอกระบบ (ไม่ผูกใบเสนอ) นับ 1 ออเดอร์ต่อบิล
//   ⚠ ดึงเฉพาะ job_id (เบาที่สุด) แล้ว fetchAllPaged กัน cap ~1,000 แถว/query ของ Supabase
export const GET = withRoute(async () => {
  const ctx = await requirePermission("finance", "void");
  if (ctx.role !== "ADMIN") throw new HttpError(403, "เฉพาะแอดมินดูรายการนี้ได้");
  const sb = ctx.supabase as unknown as AnySb;

  const [quoRows, bnRows] = await Promise.all([
    fetchAllPaged<{ job_id: string }>((from, to) =>
      sb.from("quotations").select("id, job_id").not("job_id", "is", null).neq("status", "cancelled").order("id", { ascending: true }).range(from, to)),
    fetchAllPaged<{ id: number; job_id: string; quotation_id: number | null }>((from, to) =>
      sb.from("billing_notes").select("id, job_id, quotation_id").not("job_id", "is", null).neq("status", "cancelled").order("id", { ascending: true }).range(from, to)),
  ]);

  const quoCount = new Map<string, number>();
  for (const r of quoRows) quoCount.set(r.job_id, (quoCount.get(r.job_id) ?? 0) + 1);
  const bnCount = new Map<string, number>();
  // ออเดอร์ที่มีบิล (distinct) ต่องาน — key = ใบเสนอที่บิลผูก · บิลนอกระบบ = นับแยกต่อบิล
  const billedOrders = new Map<string, Set<string>>();
  for (const r of bnRows) {
    bnCount.set(r.job_id, (bnCount.get(r.job_id) ?? 0) + 1);
    const key = r.quotation_id != null ? `q${r.quotation_id}` : `bn${r.id}`;
    if (!billedOrders.has(r.job_id)) billedOrders.set(r.job_id, new Set());
    billedOrders.get(r.job_id)!.add(key);
  }

  const candidateIds = new Set<string>();
  for (const [jobId, keys] of billedOrders) if (keys.size > 1) candidateIds.add(jobId);

  if (candidateIds.size === 0) return ok([]);

  const { data: jobs, error } = await sb
    .from("jobs")
    .select("id, job_code, customer_name, customer_area, status")
    .in("id", [...candidateIds])
    .neq("status", "CANCELLED")
    .order("job_code", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (jobs ?? []).map((j: { id: string; job_code: string | null; customer_name: string; customer_area: string | null; status: string }) => ({
    ...j,
    active_quotation_count: quoCount.get(j.id) ?? 0,
    active_billing_count: bnCount.get(j.id) ?? 0,
    billed_order_count: billedOrders.get(j.id)?.size ?? 0,
  }));

  return ok(rows);
});
