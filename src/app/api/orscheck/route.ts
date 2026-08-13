import { drivingMinutes } from "@/lib/ors";
import { estimateMinutes } from "@/lib/queue";

export const dynamic = "force-dynamic";

// ⚠ TEMP DIAG — เช็คสถานะ ORS (จะลบทิ้งหลังตรวจเสร็จ) · gate ด้วย token · ไม่คืนค่า key
const TOKEN = "orscheck-9f3a2b7c";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("t") !== TOKEN) return new Response("not found", { status: 404 });

  const keyPresent = !!process.env.ORS_API_KEY;
  const a = { lat: 13.6466, lng: 100.4936 };  // ออฟฟิศ JR พุทธบูชา
  const b = { lat: 13.7466, lng: 100.5396 };  // เซ็นทรัลเวิลด์

  const t0 = Date.now();
  const orsMin = await drivingMinutes(a, b);
  const ms = Date.now() - t0;
  const haversineMin = estimateMinutes(a, b, { avgSpeedKmh: 40, detourFactor: 1.3 });

  return Response.json({
    key_present: keyPresent,
    ors_minutes: orsMin,
    ors_working: orsMin != null,
    haversine_minutes_40kmh: haversineMin,
    call_ms: ms,
  });
}
