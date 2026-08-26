import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — ซ่อม jobs.customer_name ที่เป็น "นามบิล/บริษัท" ให้กลับเป็นชื่อลูกค้าจริง (customers.name)
//   ?t=name-2026            → พรีวิว (ไม่แตะ)
//   ?t=name-2026&commit=1   → ซ่อมจริง
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== "name-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const commit = url.searchParams.get("commit") === "1";
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  // งานที่ผูกลูกค้า + ชื่อในงาน != ชื่อในทะเบียน (ดึงทีละหน้า กัน 1000-cap)
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("jobs")
      .select("id, job_code, customer_name, customer_id, status, customers:customer_id(name)")
      .not("customer_id", "is", null).neq("status", "CANCELLED")
      .order("id", { ascending: true }).range(from, from + 999);
    const batch = (data ?? []) as any[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const mismatched = rows.filter((j) => {
    const real = String(j.customers?.name ?? "").trim();
    return real && String(j.customer_name ?? "").trim() !== real;
  });

  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  let done = 0;
  if (commit && mismatched.length) {
    // ซ่อมทีละตัว (set customer_name = customers.name) — 0071 design: ผลิต/ติดตั้งตามชื่อลูกค้าเสมอ
    for (const j of mismatched) {
      const real = String(j.customers?.name ?? "").trim();
      const { error } = await sb.from("jobs").update({ customer_name: real }).eq("id", j.id);
      if (!error) done++;
    }
  }

  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:14px;font-size:13px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:3px 6px}th{background:#f4e0e0}</style>
  <h2>ซ่อมชื่อในงาน ${commit ? `(ทำจริงแล้ว ✅ ${done} งาน)` : "(พรีวิว — ยังไม่แตะ)"}</h2>
  <p><b>${commit ? `แก้แล้ว ${done}` : `จะแก้ ${mismatched.length}`} งาน</b> — เปลี่ยน "ชื่อในงาน" (ที่เป็นนามบิล/บริษัท) → "ชื่อลูกค้าจริง"</p>
  <table><thead><tr><th>รหัส</th><th>ชื่อในงานตอนนี้ (ผิด)</th><th>→ ชื่อลูกค้าจริง (ถูก)</th><th>สถานะ</th></tr></thead>
  <tbody>${mismatched.map((j) => `<tr><td>${esc(j.job_code)}</td><td style="color:#b00">${esc(j.customer_name)}</td><td style="color:#0a0"><b>${esc(j.customers?.name)}</b></td><td>${esc(j.status)}</td></tr>`).join("")}</tbody></table>
  ${commit ? "" : `<p style="margin-top:14px;font-size:15px">✔ ถ้าถูกต้อง เปิดเพื่อ<b>ซ่อมจริง</b>: <code>/api/dxname?t=name-2026&commit=1</code></p>`}
  ${mismatched.length === 0 ? "<p>✅ ไม่มีงานที่ชื่อเพี้ยน — เรียบร้อยดีอยู่แล้ว</p>" : ""}`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
