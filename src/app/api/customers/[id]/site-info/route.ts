import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export type CustomerSiteInfo = {
  customer_name: string;
  tel: string | null;
  address: string | null;
  location_url: string | null;
  lat: number | null;
  lng: number | null;
  line_contact: string | null;
  contact_channel: string;
};

// GET /api/customers/[id]/site-info
// รวมข้อมูลไซต์ที่ "ครบสุด" ของลูกค้า เพื่อ auto-fill ฟอร์มคิว "ลูกค้าเก่า หน้างานเดิม"
// แก้ปัญหา auto-fill ไม่ครบ (location ขาด) — ดึง location จากคิวล่าสุดของลูกค้า "ที่มีแผนที่"
// (ข้ามงานที่ไม่มี → ดึงจากงานเก่ากว่าได้) · field อื่น fallback จาก customer record
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("jobs", "read");
  const sb = ctx.supabase as unknown as Sb;

  const nonEmpty = (v: unknown) => (v != null && v !== "" ? v : null);

  // ลูกค้า
  const { data: cust } = await sb
    .from("customers")
    .select("name, phone, address, line_id")
    .eq("id", params.id)
    .maybeSingle();
  const c = (cust ?? {}) as { name?: string; phone?: string | null; address?: string | null; line_id?: string | null };

  // งานของลูกค้า (ล่าสุดก่อน)
  const { data: jobs } = await sb
    .from("jobs")
    .select("customer_area, queue_entry_id, created_at")
    .eq("customer_id", params.id)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false });
  const jobRows = (jobs ?? []) as { customer_area: string | null; queue_entry_id: string | null }[];

  // queue entries ของลูกค้า — จับด้วย (1) เบอร์โทร (หลาย format) + (2) งานที่ลิงก์ queue_entry_id
  // **สำคัญ**: งาน import ไม่ลิงก์ queue_entry_id → ต้องจับด้วยเบอร์ด้วย ไม่งั้น location (ที่อยู่ใน queue) หาย
  const qIds = jobRows.map((j) => j.queue_entry_id).filter(Boolean);
  const cdigits = String(c.phone ?? "").replace(/[^0-9]/g, "");
  const phoneCandidates = Array.from(new Set([c.phone, cdigits].filter((v) => v && v !== ""))) as string[];
  const QF = "id, tel, address, location_url, lat, lng, line_contact, contact_channel, created_at";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let queues: Record<string, any>[] = [];
  if (phoneCandidates.length) {
    const { data } = await sb.from("queue_entries").select(QF).in("tel", phoneCandidates);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queues = queues.concat((data ?? []) as Record<string, any>[]);
  }
  if (qIds.length) {
    const { data } = await sb.from("queue_entries").select(QF).in("id", qIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queues = queues.concat((data ?? []) as Record<string, any>[]);
  }
  // dedupe by id + เรียงล่าสุดก่อน (ใช้ค่าที่ใหม่สุดต่อ field)
  const seenQ = new Set<unknown>();
  queues = queues
    .filter((q) => { if (seenQ.has(q.id)) return false; seenQ.add(q.id); return true; })
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));

  const firstQ = (key: string) => {
    const f = queues.find((q) => q[key] != null && q[key] !== "");
    return f ? f[key] : null;
  };
  const qLoc = queues.find((q) => q.location_url);

  return ok<CustomerSiteInfo>({
    customer_name: c.name ?? "",
    tel: (nonEmpty(c.phone) as string | null) ?? firstQ("tel"),
    address:
      (nonEmpty(c.address) as string | null) ??
      (jobRows.find((j) => nonEmpty(j.customer_area))?.customer_area ?? null) ??
      firstQ("address"),
    location_url: qLoc?.location_url ?? null,
    lat: qLoc?.lat ?? null,
    lng: qLoc?.lng ?? null,
    line_contact: (nonEmpty(c.line_id) as string | null) ?? firstQ("line_contact"),
    contact_channel: firstQ("contact_channel") ?? "LINE",
  });
});
