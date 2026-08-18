import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const TOKEN = "dchk-2b7a";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== TOKEN) return new Response("not found", { status: 404 });
  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const { data } = await sb.from("job_drawings").select("id, job_id, title, pages").order("created_at", { ascending: false }).limit(5);
  const out = [];
  for (const d of data ?? []) {
    const { data: job } = await sb.from("jobs").select("job_code, customer_name, customer_id").eq("id", d.job_id).maybeSingle();
    let addr = "";
    if (job?.customer_id != null) { const { data: c } = await sb.from("customers").select("address").eq("id", job.customer_id).maybeSingle(); addr = c?.address ?? ""; }
    out.push({ drawing_id: d.id, job_id: d.job_id, title: d.title, pages: (d.pages ?? []).length, first_page: (d.pages ?? [])[0] ? { w: d.pages[0].w, h: d.pages[0].h } : null, customer: job?.customer_name, address: addr });
  }
  return Response.json({ drawings: out });
}
