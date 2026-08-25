import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — reconcile ยอดขายเดือน ส.ค. เทียบตารางบัญชี · GET /api/dxaug?t=aug-2026
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("t") !== "aug-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };

  // งานที่มัดจำในเดือน ส.ค. 2026 (= ส.ค.2569)
  const { data: jobs } = await sb.from("jobs")
    .select("id, job_code, customer_name, deposit_date, status, net_amount, total_amount, vat_rate")
    .gte("deposit_date", "2026-08-01").lte("deposit_date", "2026-08-31")
    .neq("status", "CANCELLED")
    .order("deposit_date");
  const J = (jobs ?? []) as any[];
  const jobIds = J.map((j) => j.id);

  // ใบวางบิลของงานเหล่านี้ (ไม่ยกเลิก) — sum total + count
  const bnByJob: Record<string, { n: number; total: number; codes: string[] }> = {};
  if (jobIds.length) {
    const { data: bns } = await sb.from("billing_notes")
      .select("job_id, code, total, status").in("job_id", jobIds).neq("status", "cancelled");
    for (const b of (bns ?? []) as any[]) {
      const k = b.job_id; (bnByJob[k] ??= { n: 0, total: 0, codes: [] });
      bnByJob[k].n++; bnByJob[k].total += Number(b.total) || 0; bnByJob[k].codes.push(b.code);
    }
  }
  // ใบเสนอ (contract) ล่าสุดของแต่ละงาน — total (after VAT ตามใบเสนอ)
  const quoByJob: Record<string, { total: number; net: number; code: string }> = {};
  if (jobIds.length) {
    const { data: qs } = await sb.from("quotations")
      .select("job_id, code, total, net, subtotal, vat_amt, status, id").in("job_id", jobIds).neq("status", "cancelled").order("id");
    for (const q of (qs ?? []) as any[]) {
      quoByJob[q.job_id] = { total: Number(q.total) || 0, net: Number(q.net) || 0, code: q.code }; // เอาใบล่าสุด (id มากสุด)
    }
  }

  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const fmt = (n: number) => (n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let sumNet = 0, sumTotal = 0, sumBn = 0, sumQuo = 0;
  const rows = J.map((j, i) => {
    const bn = bnByJob[j.id]; const quo = quoByJob[j.id];
    const net = Number(j.net_amount) || 0, tot = Number(j.total_amount) || 0;
    sumNet += net; sumTotal += tot; sumBn += bn?.total || 0; sumQuo += quo?.total || 0;
    // flag: net_amount(สถิติ) ต่างจากใบเสนอ total มาก
    const contract = quo?.total || 0;
    const diff = Math.abs(tot - contract);
    const warn = contract > 0 && diff > 1 ? `<b style=color:red>ต่าง ${fmt(diff)}</b>` : (contract === 0 ? "<i style=color:#c60>ไม่มีใบเสนอ</i>" : "");
    return `<tr><td>${i + 1}</td><td>${esc(j.customer_name)}</td><td>${esc(j.deposit_date)}</td><td>${esc(j.status)}</td>
      <td style="text-align:right">${fmt(net)}</td><td style="text-align:right">${fmt(tot)}</td>
      <td style="text-align:right">${bn ? fmt(bn.total) + `<br><i>${bn.n}ใบ</i>` : "<i>—</i>"}</td>
      <td style="text-align:right">${quo ? fmt(quo.total) : "<i>—</i>"}</td><td>${warn}</td></tr>`;
  }).join("");

  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
  <style>body{font-family:system-ui;padding:12px;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:3px 5px}th{background:#f4e0e0}tfoot td{font-weight:bold;background:#eef}</style>
  <h2>Reconcile ยอดขาย ส.ค.2026 (มัดจำในเดือน · ${J.length} งาน)</h2>
  <p><i>net_amount=ก่อน VAT (สถิติใช้ตัวนี้) · total_amount=หลัง VAT · ใบวางบิล=Σบิลไม่ยกเลิก · ใบเสนอ=contract หลัง VAT</i></p>
  <table><thead><tr><th>#</th><th>ลูกค้า</th><th>วันมัดจำ</th><th>สถานะ</th><th>net(ก่อนVAT)</th><th>total(หลังVAT)</th><th>Σใบวางบิล</th><th>ใบเสนอ</th><th>เช็ค</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan=4>รวม (${J.length} งาน)</td><td style="text-align:right">${fmt(sumNet)}</td><td style="text-align:right">${fmt(sumTotal)}</td><td style="text-align:right">${fmt(sumBn)}</td><td style="text-align:right">${fmt(sumQuo)}</td><td></td></tr></tfoot></table>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
