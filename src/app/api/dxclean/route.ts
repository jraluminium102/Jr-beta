import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — ยกเลิก "งานผีซ้ำ" (adhoc ไม่มี customer_id + ไม่มีใบเสนอ/บิล/เงิน + ชื่อตรงลูกค้าจริงที่มีงาน)
//   ?t=clean-2026            → พรีวิว (ไม่แตะ)
//   ?t=clean-2026&commit=1   → ยกเลิกจริง (set jobs.status='CANCELLED')
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "clean-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const commit = url.searchParams.get("commit") === "1";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  const { data: jobs } = await sb.from("jobs")
    .select("id, job_code, customer_name, customer_id, status, net_amount, created_at")
    .is("customer_id", null).neq("status", "CANCELLED").order("created_at", { ascending: false });
  const J = (jobs ?? []) as any[];
  const jobIds = J.map((j) => j.id);
  const qSet = new Set<string>(), bSet = new Set<string>();
  if (jobIds.length) {
    const { data: qs } = await sb.from("quotations").select("job_id").in("job_id", jobIds).neq("status", "cancelled");
    for (const q of (qs ?? []) as any[]) qSet.add(q.job_id);
    const { data: bs } = await sb.from("billing_notes").select("job_id").in("job_id", jobIds).neq("status", "cancelled");
    for (const b of (bs ?? []) as any[]) bSet.add(b.job_id);
  }
  const norm = (s: string) => String(s ?? "").replace(/^คุณ\s*/, "").replace(/\s+/g, "").toLowerCase();
  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

  const toCancel: { code: string; id: string; name: string; realJob: string }[] = [];
  const skipped: string[] = [];
  for (const j of J) {
    const hasDoc = qSet.has(j.id) || bSet.has(j.id);
    const hasNet = j.net_amount != null && Number(j.net_amount) > 0;
    if (hasDoc || hasNet) { skipped.push(`${j.job_code} (มีใบเสนอ/บิล/เงิน)`); continue; }
    // ต้องมีลูกค้าจริงชื่อตรง + มีงานจริง (ไม่ยกเลิก) → ถึงจะเป็น "ผีซ้ำ"
    const bare = String(j.customer_name ?? "").replace(/^คุณ\s*/, "").trim();
    if (!bare) { skipped.push(`${j.job_code} (ไม่มีชื่อ)`); continue; }
    const { data: custs } = await sb.from("customers").select("id, name").ilike("name", "%" + bare + "%");
    const realCust = (custs ?? []).find((c: any) => norm(c.name) === norm(j.customer_name));
    if (!realCust) { skipped.push(`${j.job_code} (ไม่เจอลูกค้าจริง = adhoc จริง)`); continue; }
    const { data: rj } = await sb.from("jobs").select("job_code").eq("customer_id", realCust.id).not("customer_id", "is", null).neq("status", "CANCELLED").limit(3);
    const realJobs = (rj ?? []).map((x: any) => x.job_code);
    if (!realJobs.length) { skipped.push(`${j.job_code} (ลูกค้าไม่มีงานจริง)`); continue; }
    toCancel.push({ code: j.job_code, id: j.id, name: j.customer_name, realJob: realJobs.join(", ") });
  }

  let done = 0;
  if (commit && toCancel.length) {
    const ids = toCancel.map((t) => t.id);
    const { error } = await sb.from("jobs").update({ status: "CANCELLED" }).in("id", ids);
    if (!error) done = ids.length;
    else return new NextResponse(`<p>❌ ยกเลิกไม่สำเร็จ: ${esc(error.message)}</p>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:16px;font-size:13px;line-height:1.6}li{margin:2px 0}b{color:#0a7}</style>
  <h2>ลบงานผีซ้ำ ${commit ? "(ทำจริงแล้ว ✅)" : "(พรีวิว — ยังไม่แตะ)"}</h2>
  <p><b>${commit ? `ยกเลิกแล้ว ${done} งาน` : `จะยกเลิก ${toCancel.length} งาน`}</b> (set CANCELLED → หายจากบอร์ดผลิต · ย้อนได้ถ้าผิด)</p>
  <ol>${toCancel.map((t) => `<li><b>${esc(t.code)}</b> · ${esc(t.name)} · ซ้ำงานจริง ${esc(t.realJob)}</li>`).join("")}</ol>
  <h3>ข้าม (ไม่ลบ · ${skipped.length}) — adhoc จริง/มีข้อมูล</h3>
  <ul>${skipped.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  ${commit ? "" : `<p style="margin-top:16px;font-size:15px">✔ ถ้าถูกต้อง เปิดลิงก์นี้เพื่อ<b>ลบจริง</b>: <code>/api/dxclean?t=clean-2026&commit=1</code></p>`}`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
