import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

// GET /api/jobs/search?q=<text>
// ค้นงานด้วยชื่อลูกค้า หรือเบอร์โทร (รองรับมีขีด/ไม่มีขีด)
// ใช้สำหรับหน้าคิวงาน "เคลียร์แบบ" — เลือกงานเดิมที่จะผูก
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("jobs", "read");

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as unknown as { from: (t: string) => any };

  if (!q) {
    return ok<JobSearchResult[]>([]);
  }

  // ค้นชื่อ ilike หรือ เบอร์ ilike ทั้ง raw และ digits-only
  const qDigits = normalizePhone(q);

  // build or filter: ค้นชื่อ + เบอร์ raw + เบอร์ digits
  // customer_tel อาจเก็บแบบมีขีดหรือไม่มีขีด — ค้นทั้งคู่
  const orParts: string[] = [
    `customer_name.ilike.%${q}%`,
    `customer_tel.ilike.%${q}%`,
  ];
  if (qDigits && qDigits !== q) {
    orParts.push(`customer_tel.ilike.%${qDigits}%`);
  }

  const { data, error } = await sb
    .from("jobs")
    .select("id, job_code, customer_name, customer_tel, design_state, status, current_stage, customer_area")
    .neq("status", "CANCELLED")
    .or(orParts.join(","))
    .order("assess_date", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  return ok<JobSearchResult[]>((data ?? []) as JobSearchResult[]);
});

export type JobSearchResult = {
  id: string;
  job_code: string | null;
  customer_name: string;
  customer_tel: string | null;
  design_state: string;
  status: string;
  current_stage: number;
  customer_area: string | null;
};
