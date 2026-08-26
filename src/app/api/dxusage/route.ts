import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// TEMP (จะลบทิ้ง) — เช็ค usage จริง: DB size + Storage ต่อ bucket · GET /api/dxusage?t=usage-2026
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("t") !== "usage-2026") return NextResponse.json({ error: "no" }, { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any; rpc: (fn: string, a: any) => Promise<any>; storage: any };

  const esc = (s: any) => String(s ?? "").replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const mb = (b: number) => (b / 1048576).toFixed(1) + " MB";
  const out: string[] = [];

  // 1) Storage — sum size ต่อ bucket จาก storage.objects (ดึงทีละหน้า กัน cap)
  const byBucket: Record<string, { n: number; bytes: number }> = {};
  let totalBytes = 0, totalN = 0;
  try {
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await sb.schema ? await (sb as any).schema("storage").from("objects").select("bucket_id, metadata").order("id").range(from, from + 999) : { data: null, error: "no schema()" };
      if (error) { out.push(`<p>storage.objects อ่านตรงไม่ได้ (${esc(String((error as any).message ?? error))}) — จะลองอีกวิธี</p>`); break; }
      const rows = (data ?? []) as any[];
      for (const r of rows) {
        const size = Number(r.metadata?.size) || 0;
        (byBucket[r.bucket_id] ??= { n: 0, bytes: 0 });
        byBucket[r.bucket_id].n++; byBucket[r.bucket_id].bytes += size;
        totalBytes += size; totalN++;
      }
      if (rows.length < 1000) break;
    }
  } catch (e: any) { out.push(`<p>storage error: ${esc(e?.message)}</p>`); }

  // fallback: ถ้าอ่าน schema('storage') ไม่ได้ ลอง list buckets ผ่าน storage API
  if (totalN === 0) {
    try {
      const { data: buckets } = await sb.storage.listBuckets();
      for (const b of (buckets ?? [])) {
        let n = 0, bytes = 0;
        for (let off = 0; off < 20000; off += 1000) {
          const { data: files } = await sb.storage.from(b.name).list("", { limit: 1000, offset: off });
          const fs = files ?? [];
          for (const f of fs) { n++; bytes += Number(f.metadata?.size) || 0; }
          if (fs.length < 1000) break;
        }
        byBucket[b.name] = { n, bytes }; totalBytes += bytes; totalN += n;
      }
    } catch (e: any) { out.push(`<p>listBuckets error: ${esc(e?.message)}</p>`); }
  }

  const bucketRows = Object.entries(byBucket).sort((a, b) => b[1].bytes - a[1].bytes)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${v.n}</td><td style="text-align:right"><b>${esc(mb(v.bytes))}</b></td></tr>`).join("");

  // 2) DB size + top tables
  let dbSize = "?", tableRows = "";
  try {
    const { data } = await sb.rpc("exec_sql_readonly", {}).catch?.(() => ({ data: null })) ?? { data: null };
    void data;
  } catch { /* ignore */ }

  const pct = (totalBytes / 1073741824 * 100).toFixed(1);
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:16px;font-size:14px;line-height:1.7}table{border-collapse:collapse;width:100%;max-width:520px}td,th{border:1px solid #ccc;padding:5px 8px}th{background:#f4e0e0}b{color:#7d0f15}</style>
  <h2>Usage จริง (Supabase)</h2>
  ${out.join("")}
  <h3>Storage (ฟรีให้ 1 GB = 1024 MB)</h3>
  <table><thead><tr><th>bucket</th><th>ไฟล์</th><th>ขนาด</th></tr></thead><tbody>${bucketRows || "<tr><td colspan=3>อ่านไม่ได้</td></tr>"}</tbody>
  <tfoot><tr style="background:#eef;font-weight:bold"><td>รวม</td><td style="text-align:right">${totalN}</td><td style="text-align:right">${esc(mb(totalBytes))} (${pct}% ของฟรี)</td></tr></tfoot></table>
  <p style="margin-top:14px">💡 ถ้ารวมรูปเยอะ = ตัวนี้แหละที่จะเต็มก่อน · ถ้าไฟล์เฉลี่ยใหญ่ (เกิน ~300KB/รูป) = ยังไม่ย่อ ย่อได้จะยืดฟรีอีกนาน</p>
  <p><i>DB size ต้องดูใน Supabase Dashboard → Settings → Database (ผมดึงตรงไม่ได้ถ้าไม่มี RPC) · แต่ข้อมูลตัวหนังสือปกติเล็กมาก storage คือตัวชี้ขาด</i></p>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
