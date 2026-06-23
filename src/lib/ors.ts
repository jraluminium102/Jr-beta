// OpenRouteService — เวลาขับรถจริง (server-only, ใช้ ORS_API_KEY)
// คืน null ถ้าไม่มี key / call พัง → ผู้เรียก fallback เป็น haversine
export async function drivingMinutes(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): Promise<number | null> {
  const key = process.env.ORS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      // ORS รับพิกัดเป็น [lng, lat]
      body: JSON.stringify({ locations: [[a.lng, a.lat], [b.lng, b.lat]], metrics: ["duration"] }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { durations?: (number | null)[][] };
    const sec = j?.durations?.[0]?.[1];
    return typeof sec === "number" ? sec / 60 : null;
  } catch {
    return null;
  }
}
