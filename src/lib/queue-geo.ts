// ============================================================
// Resolve Google Maps location → พิกัด (lat/lng) ฝั่ง server
// แก้ปัญหาจริง: ลิงก์โลเคชั่นที่ลูกค้าส่งมาเป็น "ลิงก์ย่อ" maps.app.goo.gl
// ซึ่ง parseLatLng (client) ดึงพิกัดไม่ได้ → กฎ 45 นาทีไม่เคยทำงาน
// server ตาม redirect ได้ → final URL/body มี @lat,lng / !3d!4d / q=/ll= / /place/
// รองรับเพิ่ม: หน้า consent (continue=...) + พิกัดใน body (APP_INITIALIZATION_STATE)
// ============================================================
import { parseLatLng } from "@/lib/queue";

// pattern หาพิกัดจาก URL (เรียงจากแม่นยำสุด)
const COORD_RE: RegExp[] = [
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/, // .../data=...!3d{lat}!4d{lng}
  /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, // .../@{lat},{lng},17z
  /[?&#](?:q|query|ll|sll|center|daddr|destination|saddr)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, // ?q=/ll=/center={lat},{lng}
  /\/(?:search|dir|place)\/(-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)/, // /search/{lat},{lng}
];

// pattern เพิ่มเติมสำหรับสแกนใน body (HTML/JSON ที่ Google ฝังพิกัดไว้)
const BODY_RE: RegExp[] = [
  ...COORD_RE,
  /\[null,null,(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\]/, // APP_INITIALIZATION_STATE
];

function scan(text: string, res: RegExp[]): { lat: number; lng: number } | null {
  if (!text) return null;
  for (const re of res) {
    const m = text.match(re);
    if (m) {
      const c = clamp(Number(m[1]), Number(m[2]));
      if (c) return c;
    }
  }
  return null;
}

/** คืนพิกัดจากข้อความ/ลิงก์ Google Maps (รองรับลิงก์ย่อ via redirect). null ถ้าหาไม่ได้ */
export async function resolveMapLink(
  url?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  // 1) พิกัดดิบ / ลิงก์เต็มที่มีพิกัดอยู่แล้ว (client parser ครอบ plain/@/q=/ll=)
  const direct = parseLatLng(raw);
  if (direct) return direct;
  // เผื่อ parseLatLng ยังไม่ครอบ pattern (เช่น /place/{lat},{lng}, !3d!4d) → ลองสแกนตรงๆ
  const fromRaw = scan(raw, COORD_RE);
  if (fromRaw) return fromRaw;
  if (!/^https?:\/\//i.test(raw)) return null;

  // 2) ตาม redirect (ลิงก์ย่อ maps.app.goo.gl / goo.gl/maps)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(raw, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JR-OMS/1.0)" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const finalUrl = res.url || "";

    // 2a) พิกัดใน URL สุดท้าย
    const fromUrl = scan(finalUrl, COORD_RE);
    if (fromUrl) return fromUrl;

    // 2b) ถ้าโดนเด้งหน้า consent/sorry → แกะ continue=<encoded maps url> แล้วสแกนซ้ำ
    if (/consent\.google|\/sorry\//i.test(finalUrl)) {
      const cont = finalUrl.match(/[?&]continue=([^&]+)/);
      if (cont) {
        const decoded = safeDecode(cont[1]);
        const fromCont = scan(decoded, COORD_RE);
        if (fromCont) return fromCont;
      }
    }

    // 2c) พิกัดอยู่ใน body (บางลิงก์ไม่เด้งใส่ URL)
    const body = await res.text();
    const fromBody = scan(body, BODY_RE);
    if (fromBody) return fromBody;
  } catch {
    /* timeout / network — คืน null ไม่บล็อกการบันทึก */
  }
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function clamp(lat: number, lng: number): { lat: number; lng: number } | null {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    ? { lat, lng }
    : null;
}
