import { createServiceClient } from "@/lib/supabase/admin";
import { computeSuggestion, type SuggestParams } from "@/lib/queue-suggest";

export const dynamic = "force-dynamic";

// ⚠ TEMP DIAG — ทดสอบเครื่องยนต์เสนอคิว (จะลบหลังตรวจ) · gate ด้วย token
const TOKEN = "qsuggest-7b21c9";

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
function dowOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== TOKEN) return new Response("not found", { status: 404 });

  const sb = createServiceClient() as unknown as { from: (t: string) => any };
  const today = new Date().toISOString().slice(0, 10);

  const scenarios: { name: string; p: SuggestParams }[] = [
    { name: "BKK เดี่ยว (สุขุมวิท)", p: { job_size: "SINGLE", address: "กรุงเทพ", lat: 13.7466, lng: 100.5396 } },
    { name: "BKK หลายจุด (ควรบ่ายก่อน)", p: { job_size: "MULTI", address: "กรุงเทพ", lat: 13.7466, lng: 100.5396 } },
    { name: "BKK เต็มวัน", p: { job_size: "FULLDAY", address: "กรุงเทพ", lat: 13.7466, lng: 100.5396 } },
    { name: "ภูเก็ต เดี่ยว", p: { job_size: "SINGLE", address: "ภูเก็ต", lat: 7.8804, lng: 98.3923 } },
    { name: "BKK ล็อกเวลา 14:00", p: { job_size: "SINGLE", address: "กรุงเทพ", lat: 13.7466, lng: 100.5396, fixed_time: "14:00" } },
  ];

  const results = [];
  for (const sc of scenarios) {
    try {
      const r = await computeSuggestion(sb, sc.p);
      const checks: string[] = [];
      if (r.queue_date < today) checks.push("❌ วันย้อนหลัง");
      if (dowOf(r.queue_date) === "อา") checks.push("❌ ตรงวันอาทิตย์");
      if (sc.p.fixed_time && r.queue_time.slice(0, 5) !== sc.p.fixed_time) checks.push("❌ ไม่ตรง fixed_time");
      results.push({ scenario: sc.name, ok: true, date: r.queue_date, dow: dowOf(r.queue_date), time: r.queue_time, sales: r.sales_name, reason: r.reason, checks: checks.length ? checks : ["✓ ผ่าน"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ scenario: sc.name, ok: false, error: msg });
    }
  }

  return Response.json({ today, count: results.length, results });
}
