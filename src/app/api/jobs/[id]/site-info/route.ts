import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export type SiteInfo = {
  customer_name: string;
  tel: string | null;
  address: string | null;
  location_url: string | null;
  lat: number | null;
  lng: number | null;
  line_contact: string | null;
  contact_channel: string;
};

// GET /api/jobs/[id]/site-info
// คืนข้อมูลไซต์จากงานเดิม เพื่อ auto-fill ฟอร์มคิว "ลูกค้าเก่า หน้างานเดิม"
// ลำดับ fallback: queue_entry เดิม → job → customer
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("jobs", "read");
  const sb = ctx.supabase as unknown as Sb;

  // โหลด job
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("customer_name, customer_tel, customer_area, customer_id, queue_entry_id")
    .eq("id", params.id)
    .maybeSingle();

  if (jobErr) throw dbError(jobErr);
  if (!job) {
    const { err: errFn } = await import("@/lib/bff/response");
    return errFn("ไม่พบงานนี้", 404);
  }

  const j = job as {
    customer_name: string;
    customer_tel: string | null;
    customer_area: string | null;
    customer_id: number | null;
    queue_entry_id: string | null;
  };

  // โหลด customer (สำหรับ phone match + fallback)
  let custAddress: string | null = null;
  let custLineId: string | null = null;
  let custPhone: string | null = null;
  if (j.customer_id) {
    const { data: cust } = await sb
      .from("customers")
      .select("address, line_id, phone")
      .eq("id", j.customer_id)
      .maybeSingle();
    if (cust) {
      const c = cust as { address: string | null; line_id: string | null; phone: string | null };
      custAddress = c.address;
      custLineId = c.line_id;
      custPhone = c.phone;
    }
  }

  // หา queue entry: (1) ที่ผูกกับงานนี้โดยตรง (queue_entry_id) — ไซต์เจาะจง
  //                 (2) ถ้าไม่มี/ขาดข้อมูล → จับด้วยเบอร์ของลูกค้า (กันงาน import ไม่ลิงก์ queue_entry_id)
  const QF = "id, tel, address, location_url, lat, lng, line_contact, contact_channel, created_at";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Q = Record<string, any>;
  let linked: Q | null = null;
  if (j.queue_entry_id) {
    const { data } = await sb.from("queue_entries").select(QF).eq("id", j.queue_entry_id).maybeSingle();
    linked = (data ?? null) as Q | null;
  }
  const phoneSrc = custPhone ?? j.customer_tel;
  const cdigits = String(phoneSrc ?? "").replace(/[^0-9]/g, "");
  const phoneCandidates = Array.from(new Set([phoneSrc, cdigits].filter((v) => v && v !== ""))) as string[];
  let byPhone: Q[] = [];
  if (phoneCandidates.length) {
    const { data } = await sb.from("queue_entries").select(QF).in("tel", phoneCandidates).order("created_at", { ascending: false });
    byPhone = (data ?? []) as Q[];
  }

  // เลือกค่าต่อ field: งานที่ผูกตรงก่อน → แล้วค่อย queue ที่จับด้วยเบอร์ (ล่าสุด)
  const pick = (k: string) => {
    if (linked && linked[k] != null && linked[k] !== "") return linked[k];
    const f = byPhone.find((q) => q[k] != null && q[k] !== "");
    return f ? f[k] : null;
  };
  const locSrc: Q | null =
    linked && linked.location_url ? linked : byPhone.find((q) => q.location_url) ?? null;

  // fallback chain
  const tel = pick("tel") ?? j.customer_tel ?? custPhone;
  const address = pick("address") ?? j.customer_area ?? custAddress;
  const location_url = locSrc?.location_url ?? null;
  const lat = locSrc?.lat ?? null;
  const lng = locSrc?.lng ?? null;
  const line_contact = pick("line_contact") ?? custLineId;
  const contact_channel = pick("contact_channel") ?? "LINE";

  return ok<SiteInfo>({
    customer_name: j.customer_name,
    tel,
    address,
    location_url,
    lat,
    lng,
    line_contact,
    contact_channel,
  });
});
