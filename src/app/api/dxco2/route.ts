import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — ข้อมูลเต็ม 4 ลูกค้าบริษัท (ออกแบบ fix ชื่อ) · GET /api/dxco2?t=co2-2026
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("t") !== "co2-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const IDS = [270, 306, 310, 316];

  const { data: custs } = await sb.from("customers")
    .select("id, name, contact_person, phone, tax_id, address, line_id, contact_channel").in("id", IDS);
  const { data: bps } = await sb.from("billing_profiles")
    .select("id, customer_id, bill_name, kind, tax_id, branch, address, postal_code, contact_person, phone, is_default, is_active").in("customer_id", IDS);
  const { data: quos } = await sb.from("quotations")
    .select("id, code, customer_id, customer_snapshot, status").in("customer_id", IDS).order("id");

  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const sec = (title: string, obj: any) => `<h3>${esc(title)}</h3><pre style="white-space:pre-wrap;background:#f6f6f6;padding:8px;border-radius:6px">${esc(JSON.stringify(obj, null, 1))}</pre>`;

  const byId: Record<number, any> = {};
  for (const c of (custs ?? []) as any[]) byId[c.id] = { customer: c, billing_profiles: [], quote_snapshots: [] };
  for (const b of (bps ?? []) as any[]) byId[b.customer_id]?.billing_profiles.push(b);
  for (const q of (quos ?? []) as any[]) byId[q.customer_id]?.quote_snapshots.push({ code: q.code, status: q.status, snap_name: q.customer_snapshot?.name, snap_kind: q.customer_snapshot?.kind, snap_tax: q.customer_snapshot?.tax_id });

  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:14px;font-size:12px}h2{color:#7d0f15}pre{font-size:11px}</style>
  <h1>ข้อมูลเต็ม 4 ลูกค้าบริษัท (ออกแบบ fix)</h1>
  ${IDS.map((id) => byId[id] ? `<h2>id ${id}</h2>${sec("ทะเบียนลูกค้า (customers)", byId[id].customer)}${sec("นามออกบิล (billing_profiles)", byId[id].billing_profiles)}${sec("snapshot บนใบเสนอ (โชว์บนเอกสาร)", byId[id].quote_snapshots)}` : `<h2>id ${id} — ไม่พบ</h2>`).join("<hr>")}`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
