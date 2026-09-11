import { requirePermission, Http } from "@/lib/bff/context";
import { withRoute, audit } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";

// POST /api/measure-schedule/external
// เพิ่ม "ลูกค้านอกระบบ" เข้าคิววัดหน้างานตรง ๆ (ลัดคิว) — โลจิคเดียวกับใบเสนอนอกระบบ:
//   1) สร้างลูกค้าเข้าทะเบียน (contact_channel=OTHER)
//   2) สร้างงาน (status=DEPOSITED → trigger tg_on_deposit สร้าง production PENDING_MEASURE + stage 9)
//   3) ตั้งนัดวัด (ถ้าระบุ) แล้วไหลเข้าระบบต่อได้เลย
// หมายเหตุ: ชื่อลูกค้า * = ชื่อที่จะโชว์ในผลิต/ติดตั้ง (customers.name → jobs.customer_name) — กฎเหล็ก ชื่อคนจริง
// สิทธิ์: production:write · ใช้ service client เขียน customers/jobs (RLS insert = ADMIN/SALES/DESIGNER เท่านั้น)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "write");
  // production:write ครอบ CHANG ด้วย (ช่างหน้างาน) — งานสร้างลูกค้า/งานให้เฉพาะ ADMIN/PRODUCTION เท่านั้น
  if (ctx.role !== "ADMIN" && ctx.role !== "PRODUCTION") throw Http.forbidden();

  const body = await req.json().catch(() => null);
  if (!body) return err("payload ไม่ถูกต้อง", 400);

  const name = String(body.name ?? "").trim();
  if (!name) return err("ต้องกรอกชื่อลูกค้า", 400);

  const phone = String(body.phone ?? "").trim();
  const address = String(body.address ?? "").trim();
  const job = String(body.job ?? "").trim();
  const tax_id = String(body.tax_id ?? "").trim();

  // นัดวัด (ไม่บังคับ) — ตั้งได้เลย หรือปล่อยว่างให้ไปอยู่ "รอนัด"
  const measureDate = String(body.measure_scheduled ?? "").trim();     // YYYY-MM-DD
  const measureTime = String(body.measure_time ?? "").trim();          // HH:MM
  const measurerName = String(body.measurer_name ?? "").trim();

  // เลือก "ใช้ลูกค้าเดิม" (customer_id) → ไม่สร้างใหม่ กันซ้ำ · ถ้าไม่ส่งมา = สร้างลูกค้าใหม่
  const existingId = body.customer_id != null && String(body.customer_id).trim() !== "" ? Number(body.customer_id) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceClient() as any;

  // 1) ลูกค้า: ใช้เดิม (customer_id) หรือสร้างใหม่ (เดียวกับใบเสนอนอกระบบ)
  let custId: number;
  let custName = name;
  let custArea = address;
  let custTel = phone;
  if (existingId != null && !Number.isNaN(existingId)) {
    const { data: ex } = await sb.from("customers").select("id, name, address, phone").eq("id", existingId).maybeSingle();
    if (!ex) return err("ไม่พบลูกค้าที่เลือก", 404);
    custId = ex.id;
    // ชื่อในผลิต/ติดตั้ง = ชื่อในทะเบียนเสมอ (กฎเหล็ก) · ที่อยู่/เบอร์ เอาที่กรอกก่อน ไม่งั้นจากทะเบียน
    custName = String(ex.name ?? "").trim() || name;
    custArea = address || String(ex.address ?? "").trim();
    custTel = phone || String(ex.phone ?? "").trim();
  } else {
    const { data: cust, error: cErr } = await sb
      .from("customers")
      .insert({ name, job, address, phone, tax_id, contact_channel: "OTHER", created_by: ctx.user.id })
      .select("id")
      .single();
    if (cErr || !cust) return err("สร้างลูกค้าใหม่ไม่สำเร็จ: " + (cErr?.message ?? ""), 500);
    custId = cust.id;
  }

  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // วันนี้ (UTC+7)

  // 2) สร้างงาน status=DEPOSITED → trigger สร้าง production PENDING_MEASURE + เลื่อน stage 9
  //    (ไม่ใส่ deposit_amount/date → ไม่มี finance entry · เป็นแค่ดีลที่เข้าคิววัด)
  const { data: newJob, error: jErr } = await sb
    .from("jobs")
    .insert({
      customer_name: custName,       // กฎเหล็ก: ชื่อคนจริง = ชื่อในผลิต/ติดตั้ง
      customer_id: custId,
      ...(custArea ? { customer_area: custArea } : {}),
      ...(custTel ? { customer_tel: custTel } : {}),
      channel: "OTHER",
      assess_date: today,
      status: "DEPOSITED",
      external_intake: true,         // ธง 0148: กันรายงานลูกหนี้ผี + close-rate เฟ้อ (งานยังไม่มีดีล/เงินจริง)
    })
    .select("id")
    .single();
  if (jErr || !newJob) return err("สร้างงานไม่สำเร็จ: " + (jErr?.message ?? ""), 500);

  // 3) หา production ที่ trigger สร้างให้ แล้วตั้งนัดวัด (ถ้าระบุ)
  const { data: prod } = await sb
    .from("productions")
    .select("id")
    .eq("job_id", newJob.id)
    .eq("status", "PENDING_MEASURE")
    .maybeSingle();

  let prodId: number | null = prod?.id ?? null;
  if (!prodId) {
    // เผื่อ trigger ไม่ทำงาน (ไม่ควรเกิด) → สร้างเอง กันงานหลุดคิว
    const { data: mk, error: mkErr } = await sb
      .from("productions")
      .insert({ job_id: newJob.id, status: "PENDING_MEASURE" })
      .select("id")
      .single();
    if (mkErr || !mk) return err("สร้างคิววัดไม่สำเร็จ: " + (mkErr?.message ?? ""), 500);
    prodId = mk.id;
  }

  if (measureDate) {
    const upd: Record<string, unknown> = { measure_scheduled: measureDate };
    if (measureTime) upd.measure_time = measureTime;
    if (measurerName) upd.measurer_name = measurerName;
    await sb.from("productions").update(upd).eq("id", prodId);
  }

  // audit: สร้าง customer+job แบบ bypass RLS (service client) → log ไว้สืบย้อน
  await audit({
    jobId: newJob.id,
    userId: ctx.user.id,
    action: "measure-schedule/external-add",
    table: "jobs",
    recordId: String(newJob.id),
    newValue: { customer_id: custId, customer_name: custName, reused_customer: existingId != null, measure_scheduled: measureDate || null, by: ctx.user.email },
  });

  return ok({ job_id: newJob.id, production_id: prodId });
});
