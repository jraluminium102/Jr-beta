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

  // finance_entries + receipts for these jobs (สำหรับวางแผน void — ดูเงินจริง)
  let fins: any[] = [], rcs: any[] = [];
  if (jobIds.length) {
    const { data: fe } = await sb.from("finance_entries")
      .select("job_id, type, amount, is_auto_created, is_voided, billing_installment_id, payment_date")
      .in("job_id", jobIds).order("payment_date");
    fins = fe ?? [];
  }
  const bnIds = bns.map((b) => b.id);
  if (bnIds.length) {
    const { data: rc } = await sb.from("receipts")
      .select("code, billing_note_id, installment_id, is_voided, total").in("billing_note_id", bnIds);
    rcs = rc ?? [];
  }

  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const jobsHtml = jobs.map((j) => `<tr><td>${esc(j.job_code)}</td><td>${esc(j.customer_name)}</td><td>cust=${esc(j.customer_id)}</td><td><b>${esc(j.status)}</b></td><td>stage ${esc(j.current_stage)}</td><td>มัดจำ ${esc(j.deposit_date)}</td><td>net ${esc(j.net_amount)}</td><td>${esc(String(j.id).slice(0, 8))}</td><td>${esc(String(j.created_at).slice(0, 16))}</td></tr>`).join("");
  const quoHtml = quoView.map((q) => `<tr><td>${esc(q.code)}</td><td><b>${esc(q.first_item)}</b></td><td>${esc(q.status)}</td><td>job=${esc(String(q.job_id ?? "—").slice(0, 8))}</td><td>cust=${esc(q.customer_id)}</td><td>${esc(q.snap_name)}</td><td>${esc(String(q.created_at).slice(0, 16))}</td></tr>`).join("");
  const bnHtml = bnView.map((b) => `<tr><td>${esc(b.code)}</td><td><b>${esc(b.status)}</b></td><td>฿${esc(b.total)}</td><td>job=${esc(String(b.job_id ?? "—").slice(0, 8))}</td><td>quo=${esc(b.quotation_id)}</td><td>${esc(b.snap_name)}</td><td>${esc(b.paid.map((p: any) => `ง${p.seq}:จ่าย${p.paid ?? 0}/${p.amt}(${p.st})`).join(" · "))}</td><td>${esc(String(b.created_at).slice(0, 16))}</td></tr>`).join("");
  const custHtml = (custs ?? []).map((c: any) => `<tr><td>${esc(c.id)}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.job)}</td><td>active=${esc(c.is_active)}</td><td>${esc(String(c.created_at).slice(0, 16))}</td></tr>`).join("");
  const prodHtml = prods.map((p) => `<tr><td>job=${esc(String(p.job_id).slice(0, 8))}</td><td><b>${esc(p.status)}</b></td><td>${esc(String(p.status_updated_at).slice(0, 16))}</td></tr>`).join("");
  const covHtml = covers.map((c) => `<tr><td>job=${esc(String(c.job_id).slice(0, 8))}</td><td>quo=${esc(c.quotation_id)}</td><td>${esc(c.mode)}</td><td>${esc(String(c.updated_at).slice(0, 16))}</td></tr>`).join("");
  const finHtml = fins.map((f: any) => `<tr><td>job=${esc(String(f.job_id).slice(0, 8))}</td><td>${esc(f.type)}</td><td>฿${esc(f.amount)}</td><td>auto=${esc(f.is_auto_created)}</td><td>${f.is_voided ? "<b style=color:red>VOIDED</b>" : "active"}</td><td>inst=${esc(f.billing_installment_id ?? "—")}</td><td>${esc(String(f.payment_date).slice(0, 10))}</td></tr>`).join("");
  const rcHtml = rcs.map((r: any) => `<tr><td>${esc(r.code)}</td><td>bn=${esc(r.billing_note_id)}</td><td>inst=${esc(r.installment_id ?? "—")}</td><td>฿${esc(r.total)}</td><td>${r.is_voided ? "<b style=color:red>VOIDED</b>" : "active"}</td></tr>`).join("");
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:12px;font-size:13px}h3{margin:14px 0 4px;color:#7d0f15}table{border-collapse:collapse;width:100%;margin-bottom:8px}td,th{border:1px solid #ccc;padding:3px 6px;text-align:left}b{color:#0f4}</style>
  <h2>วินิจฉัย คุณนัฐพงษ์</h2>
  <h3>ลูกค้า (${(custs ?? []).length}) — ซ้ำไหม?</h3><table>${custHtml || "<tr><td>ไม่พบ</td></tr>"}</table>
  <h3>งาน (${jobs.length}) — ซ้ำไหม? อันไหนเข้าผลิต?</h3><table>${jobsHtml || "<tr><td>ไม่พบ</td></tr>"}</table>
  <h3>ใบเสนอ (${quoView.length}) — รายการแรก = งานอะไร? ผูก job ไหน?</h3><table>${quoHtml || "<tr><td>ไม่พบ</td></tr>"}</table>
  <h3>ใบวางบิล (${bnView.length})</h3><table>${bnHtml || "<tr><td>ไม่พบ</td></tr>"}</table>
  <h3>ผลิต (${prods.length})</h3><table>${prodHtml || "<tr><td>ไม่มี</td></tr>"}</table>
  <h3>ใบปะหน้า (${covers.length})</h3><table>${covHtml || "<tr><td>ไม่มี</td></tr>"}</table>
  <h3>เงินที่ลงบัญชี finance_entries (${fins.length}) — auto=true คือมัดจำที่ void แล้ว "คงเงิน"</h3><table>${finHtml || "<tr><td>ไม่มี</td></tr>"}</table>
  <h3>ใบเสร็จ (${rcs.length})</h3><table>${rcHtml || "<tr><td>ไม่มี</td></tr>"}</table>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
