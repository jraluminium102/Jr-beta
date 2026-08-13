import { createServiceClient } from "@/lib/supabase/admin";
import { computeSuggestion, type SuggestParams } from "@/lib/queue-suggest";

export const dynamic = "force-dynamic";

// ⚠ TEMP DIAG — ทดสอบเครื่องยนต์เสนอคิว (จะลบหลังตรวจ) · gate ด้วย token
const TOKEN = "qsuggest-7b21c9";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== TOKEN) return new Response("not found", { status: 404 });

  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const scenarios: { name: string; p: SuggestParams }[] = [
    { name: "BKK เดี่ยว #1", p: { job_size: "SINGLE", address: "กรุงเทพ", lat: 13.7466, lng: 100.5396 } },
    { name: "BKK เดี่ยว #2 (คนละพิกัด)", p: { job_size: "SINGLE", address: "กรุงเทพ", lat: 13.68, lng: 100.61 } },
    { name: "BKK เดี่ยว #3", p: { job_size: "SINGLE", address: "กรุงเทพ", lat: 13.80, lng: 100.55 } },
    { name: "ภูเก็ต", p: { job_size: "SINGLE", address: "ภูเก็ต", lat: 7.8804, lng: 98.3923 } },
  ];
  const results = [];
  for (const sc of scenarios) {
    try {
      const r = await computeSuggestion(sb, sc.p);
      results.push({ scenario: sc.name, sales: r.sales_name, date: r.queue_date, time: r.queue_time });
    } catch (e) {
      results.push({ scenario: sc.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ results });
}
