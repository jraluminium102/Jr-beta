// ============================================================
// Resolve Google Maps location → พิกัด (lat/lng) ฝั่ง server
// แก้ปัญหาจริง: ลิงก์โลเคชั่นที่ลูกค้าส่งมาเป็น "ลิงก์ย่อ" maps.app.goo.gl
// ซึ่ง parseLatLng (client) ดึงพิกัดไม่ได้ → กฎ 45 นาทีไม่เคยทำงาน
// server ตาม redirect ได้ → final URL มี @lat,lng / !3d!4d
// ============================================================
import { parseLatLng } from "@/lib/queue";

const COORD_RE = [
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/, // .../data=...!3d13.78!4d100.42
  /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, // .../@13.78,100.42,17z
];

/** คืนพิกัดจากข้อความ/ลิงก์ Google Maps (รองรับลิงก์ย่อ via redirect). null ถ้าหาไม่ได้ */
export async function resolveMapLink(
  url?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  // 1) พิกัดดิบ / ลิงก์เต็มที่มีพิกัดอยู่แล้ว
  const direct = parseLatLng(raw);
  if (direct) return direct;
  if (!/^https?:\/\//i.test(raw)) return null;

  // 2) ตาม redirect (ลิงก์ย่อ maps.app.goo.gl / goo.gl/maps)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(raw, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JR-OMS/1.0)" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    for (const re of COORD_RE) {
      const m = (res.url || "").match(re);
      if (m) return clamp(+m[1], +m[2]);
    }
    // 3) เผื่อพิกัดอยู่ใน body (บางลิงก์ไม่เด้งใส่ URL)
    const body = await res.text();
    for (const re of [...COORD_RE, /\[null,null,(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\]/]) {
      const m = body.match(re);
      if (m) return clamp(+m[1], +m[2]);
    }
  } catch {
    /* timeout / network — คืน null ไม่บล็อกการบันทึก */
  }
  return null;
}

function clamp(lat: number, lng: number): { lat: number; lng: number } | null {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    ? { lat, lng }
    : null;
}
