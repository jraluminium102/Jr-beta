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

  // โหลด queue_entry เดิม (ถ้ามี)
  let qTel: string | null = null;
  let qAddress: string | null = null;
  let qLocationUrl: string | null = null;
  let qLat: number | null = null;
  let qLng: number | null = null;
  let qLineContact: string | null = null;
  let qContactChannel: string | null = null;

  if (j.queue_entry_id) {
    const { data: qe } = await sb
      .from("queue_entries")
      .select("tel, address, location_url, lat, lng, line_contact, contact_channel")
      .eq("id", j.queue_entry_id)
      .maybeSingle();

    if (qe) {
      const q = qe as {
        tel: string | null;
        address: string | null;
        location_url: string | null;
        lat: number | null;
        lng: number | null;
        line_contact: string | null;
        contact_channel: string | null;
      };
      qTel = q.tel;
      qAddress = q.address;
      qLocationUrl = q.location_url;
      qLat = q.lat;
      qLng = q.lng;
      qLineContact = q.line_contact;
      qContactChannel = q.contact_channel;
    }
  }

  // โหลด customer (fallback)
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
      const c = cust as {
        address: string | null;
        line_id: string | null;
        phone: string | null;
      };
      custAddress = c.address;
      custLineId = c.line_id;
      custPhone = c.phone;
    }
  }

  // fallback chain
  const tel = qTel ?? j.customer_tel ?? custPhone;
  const address = qAddress ?? j.customer_area ?? custAddress;
  const location_url = qLocationUrl ?? null;
  const lat = qLat ?? null;
  const lng = qLng ?? null;
  const line_contact = qLineContact ?? custLineId;
  const contact_channel = qContactChannel ?? "LINE";

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
