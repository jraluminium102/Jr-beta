import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP diagnostic (จะลบทิ้ง) — ตรวจสถานะจริงคุณนัฐพงษ์: ลูกค้าซ้ำ/งานซ้ำ/ใบเสนอ/ใบวางบิล/ผลิต/ใบปะหน้า
// GET /api/dxnat?t=nat-2026
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("t") !== "nat-2026") {
    return NextResponse.json({ error: "no" }, { status: 404 });
  }
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const like = "%นัฐพงษ์%";

  // customers matching
  const { data: custs } = await sb.from("customers")
    .select("id, name, job, created_at, is_active").ilike("name", like).order("id");
  const custIds = (custs ?? []).map((c: any) => c.id);

  // jobs matching by name OR customer_id
  const { data: jobsByName } = await sb.from("jobs")
    .select("id, job_code, customer_name, customer_id, status, current_stage, deposit_date, net_amount, total_amount, created_at")
    .ilike("customer_name", like).order("created_at");
  let jobsByCust: any[] = [];
  if (custIds.length) {
    const { data } = await sb.from("jobs")
      .select("id, job_code, customer_name, customer_id, status, current_stage, deposit_date, net_amount, total_amount, created_at")
      .in("customer_id", custIds);
    jobsByCust = data ?? [];
  }
  const jobMap = new Map<string, any>();
  [...(jobsByName ?? []), ...jobsByCust].forEach((j) => jobMap.set(j.id, j));
  const jobs = [...jobMap.values()];
  const jobIds = jobs.map((j) => j.id);

  // quotations for those jobs (+ first item name)
  let quos: any[] = [];
  if (jobIds.length) {
    const { data } = await sb.from("quotations")
      .select("id, code, job_id, customer_id, status, created_at, customer_snapshot")
      .in("job_id", jobIds).order("created_at");
    quos = data ?? [];
  }
  // also quotations by customer (catch unlinked)
  let quosByCust: any[] = [];
  if (custIds.length) {
    const { data } = await sb.from("quotations")
      .select("id, code, job_id, customer_id, status, created_at, customer_snapshot")
      .in("customer_id", custIds).order("created_at");
    quosByCust = data ?? [];
  }
  const quoMap = new Map<number, any>();
  [...quos, ...quosByCust].forEach((q) => quoMap.set(q.id, q));
  const allQuos = [...quoMap.values()];
  const quoIds = allQuos.map((q) => q.id);
  let firstItems: Record<number, string> = {};
  if (quoIds.length) {
    const { data: its } = await sb.from("quotation_items")
      .select("quotation_id, name, sort_order").in("quotation_id", quoIds).order("sort_order");
    (its ?? []).forEach((it: any) => { if (firstItems[it.quotation_id] === undefined) firstItems[it.quotation_id] = it.name; });
  }
  const quoView = allQuos.map((q) => ({
    id: q.id, code: q.code, job_id: q.job_id, customer_id: q.customer_id, status: q.status,
    snap_name: q.customer_snapshot?.name, first_item: firstItems[q.id] ?? null, created_at: q.created_at,
  }));

  // billing notes for those jobs/quotes
  let bns: any[] = [];
  if (jobIds.length || quoIds.length) {
    const { data } = await sb.from("billing_notes")
      .select("id, code, job_id, quotation_id, status, total, created_at, customer_snapshot, billing_installments(seq, amount, paid_amount, paid_date, status)")
      .or(`job_id.in.(${jobIds.map((x)=>`"${x}"`).join(",") || "null"}),quotation_id.in.(${quoIds.join(",") || "0"})`)
      .order("created_at");
    bns = data ?? [];
  }
  const bnView = bns.map((b) => ({
    id: b.id, code: b.code, job_id: b.job_id, quotation_id: b.quotation_id, status: b.status, total: b.total,
    snap_name: b.customer_snapshot?.name,
    paid: (b.billing_installments ?? []).map((i: any) => ({ seq: i.seq, amt: i.amount, paid: i.paid_amount, date: i.paid_date, st: i.status })),
    created_at: b.created_at,
  }));

  // productions + cover sheets for those jobs
  let prods: any[] = [], covers: any[] = [];
  if (jobIds.length) {
    const { data: p } = await sb.from("productions").select("job_id, status, status_updated_at").in("job_id", jobIds);
    prods = p ?? [];
    const { data: cv } = await sb.from("cover_sheets").select("job_id, quotation_id, mode, updated_at").in("job_id", jobIds);
    covers = cv ?? [];
  }

  return NextResponse.json({
    customers: custs,
    jobs: jobs.map((j) => ({ id: j.id, code: j.job_code, name: j.customer_name, cust: j.customer_id, status: j.status, stage: j.current_stage, dep: j.deposit_date, net: j.net_amount, total: j.total_amount, created: j.created_at })),
    quotations: quoView,
    billing_notes: bnView,
    productions: prods,
    cover_sheets: covers,
  });
}
