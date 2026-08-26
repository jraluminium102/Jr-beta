import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — หาลูกค้าที่ "ชื่อทะเบียน" เป็นชื่อบริษัท (ควรเป็นชื่อคน · บริษัทควรอยู่นามออกบิล)
// GET /api/dxcompany?t=co-2026
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("t") !== "co-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const CO = /บริษัท|จำกัด|หจก|บจก|ห้างหุ้นส่วน|ห้าง|โรงงาน|กรุ๊ป|group|co\.?,?\s*ltd|company|corporation|\bltd\b|\binc\b|\bcorp\b/i;

  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("customers")
      .select("id, name, contact_person, phone, tax_id, is_active, created_at")
      .order("id", { ascending: true }).range(from, from + 999);
    const batch = (data ?? []) as any[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const coCust = rows.filter((c) => CO.test(String(c.name ?? "")));
  const ids = coCust.map((c) => c.id);

  // billing profiles + job count ของลูกค้าเหล่านี้
  const bpByCust: Record<number, string[]> = {}, jobByCust: Record<number, string[]> = {};
  if (ids.length) {
    const { data: bps } = await sb.from("billing_profiles").select("customer_id, bill_name, kind").in("customer_id", ids);
    for (const b of (bps ?? []) as any[]) (bpByCust[b.customer_id] ??= []).push(`${b.bill_name}${b.kind === "COMPANY" ? "(นิติ)" : ""}`);
    const { data: js } = await sb.from("jobs").select("customer_id, job_code, status").in("customer_id", ids).neq("status", "CANCELLED");
    for (const j of (js ?? []) as any[]) (jobByCust[j.customer_id] ??= []).push(j.job_code);
  }

  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:14px;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:3px 6px}th{background:#f4e0e0}</style>
  <h2>ลูกค้าที่ชื่อทะเบียนเป็น "บริษัท" (${coCust.length} คน)</h2>
  <p><i>ชื่อทะเบียน(name)=สิ่งที่โชว์ในผลิต/ติดตั้ง · ผู้ติดต่อ(contact_person)=ชื่อคนจริง (ถ้ามี=กู้ได้) · นามออกบิล=ควรเป็นที่อยู่ของชื่อบริษัท</i></p>
  <table><thead><tr><th>id</th><th>ชื่อทะเบียน (โชว์ในผลิต)</th><th>ผู้ติดต่อ (ชื่อคนจริง?)</th><th>เบอร์</th><th>นามออกบิล</th><th>งาน</th></tr></thead>
  <tbody>${coCust.map((c) => `<tr><td>${esc(c.id)}</td><td style="color:#b00"><b>${esc(c.name)}</b></td><td style="color:#0a0">${esc(c.contact_person) || "<i style=color:#999>— ไม่มี —</i>"}</td><td>${esc(c.phone)}</td><td>${esc((bpByCust[c.id] ?? []).join(" · ")) || "<i>—</i>"}</td><td>${esc((jobByCust[c.id] ?? []).join(", ")) || "<i>—</i>"}</td></tr>`).join("")}</tbody></table>
  ${coCust.length === 0 ? "<p>✅ ไม่พบลูกค้าที่ชื่อทะเบียนเป็นบริษัท</p>" : ""}`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
