import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — หา "งานผี" (adhoc job ไม่มี customer_id) ที่ซ้ำกับลูกค้าจริง · GET /api/dxghost?t=ghost-2026
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("t") !== "ghost-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  // งานที่ไม่มี customer_id (สร้างจาก adhoc "เพิ่มงานผลิตเอง") ยังไม่ยกเลิก
  const { data: jobs } = await sb.from("jobs")
    .select("id, job_code, customer_name, customer_id, status, current_stage, net_amount, deposit_date, created_at")
    .is("customer_id", null).neq("status", "CANCELLED").order("created_at", { ascending: false });
  const J = (jobs ?? []) as any[];
  const jobIds = J.map((j) => j.id);

  // มี quote/bill/production ไหม
  const has = (tbl: string) => new Set<string>();
  const qSet = has("q"), bSet = has("b"), pMap = new Map<string, string>();
  if (jobIds.length) {
    const { data: qs } = await sb.from("quotations").select("job_id").in("job_id", jobIds).neq("status", "cancelled");
    for (const q of (qs ?? []) as any[]) qSet.add(q.job_id);
    const { data: bs } = await sb.from("billing_notes").select("job_id").in("job_id", jobIds).neq("status", "cancelled");
    for (const b of (bs ?? []) as any[]) bSet.add(b.job_id);
    const { data: ps } = await sb.from("productions").select("job_id, status").in("job_id", jobIds);
    for (const p of (ps ?? []) as any[]) pMap.set(p.job_id, p.status);
  }

  // มีลูกค้าจริง (customer_id) ชื่อตรง/ใกล้เคียง + มีงานจริงไหม → = "ผีซ้ำ"
  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const norm = (s: string) => String(s ?? "").replace(/^คุณ\s*/, "").replace(/\s+/g, "").toLowerCase();
  const rows: string[] = [];
  for (const j of J) {
    const nm = norm(j.customer_name);
    // หาลูกค้าจริงชื่อตรง
    const { data: custs } = await sb.from("customers").select("id, name").ilike("name", "%" + String(j.customer_name).replace(/^คุณ\s*/, "").trim() + "%");
    const realCust = (custs ?? []).find((c: any) => norm(c.name) === nm || norm(c.name).includes(nm) || nm.includes(norm(c.name)));
    let realJob = "";
    if (realCust) {
      const { data: rj } = await sb.from("jobs").select("job_code").eq("customer_id", realCust.id).neq("status", "CANCELLED").limit(3);
      realJob = (rj ?? []).map((x: any) => x.job_code).join(", ");
    }
    const empty = !qSet.has(j.id) && !bSet.has(j.id);
    const isGhostDup = empty && !!realCust;
    rows.push(`<tr style="${isGhostDup ? "background:#fee" : ""}"><td>${esc(j.job_code)}</td><td>${esc(j.customer_name)}</td><td>${esc(j.status)}·st${esc(j.current_stage)}</td><td>${esc(pMap.get(j.id) ?? "—")}</td><td>${qSet.has(j.id) ? "มี" : "<b style=color:red>ไม่มี</b>"}</td><td>${bSet.has(j.id) ? "มี" : "<b style=color:red>ไม่มี</b>"}</td><td>${esc(j.net_amount ?? "—")}</td><td>${realCust ? `✅ ${esc(realCust.name)} (งาน ${esc(realJob || "—")})` : "<i>ไม่เจอลูกค้าจริง</i>"}</td><td>${isGhostDup ? "<b style=color:red>ผีซ้ำ→ลบได้</b>" : "<i>adhoc จริง?</i>"}</td><td>${esc(String(j.created_at).slice(0, 16))}</td></tr>`);
  }
  const dupCount = rows.filter((r) => r.includes("ผีซ้ำ")).length;
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:12px;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:3px 5px}th{background:#f4e0e0}</style>
  <h2>งานผี (adhoc ไม่มี customer_id · ${J.length} งาน · ผีซ้ำลูกค้าจริง ${dupCount})</h2>
  <p><i>แถวแดง = ไม่มีใบเสนอ/บิล + ชื่อตรงลูกค้าจริงที่มีงาน = งานผีซ้ำ ลบได้ปลอดภัย · แถวขาว = อาจเป็น adhoc จริง (งานจดเอง) อย่าลบมั่ว</i></p>
  <table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>สถานะ</th><th>ผลิต</th><th>ใบเสนอ</th><th>บิล</th><th>net</th><th>ลูกค้าจริง?</th><th>สรุป</th><th>สร้าง</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
