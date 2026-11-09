// ============================================================
// Resolve Google Maps location → พิกัด (lat/lng) ฝั่ง server
// แก้ปัญหาจริง: ลิงก์โลเคชั่นที่ลูกค้าส่งมาเป็น "ลิงก์ย่อ" maps.app.goo.gl
// ซึ่ง parseLatLng (client) ดึงพิกัดไม่ได้ → กฎ 45 นาทีไม่เคยทำงาน
// server ตาม redirect ได้ → final URL/body มี @lat,lng / !3d!4d / q=/ll= / /place/
//
// ปรับปรุง (อ่านลิงก์ "ที่ใช้ได้แต่อ่านไม่ออก"):
//  - timeout 6s → 18s (ลิงก์ย่อ redirect ช้า โดนตัดก่อน)
//  - ส่ง Cookie CONSENT=YES + Accept-Language en + UA Chrome จริง → ข้ามหน้า consent
//  - retry 1 ครั้งถ้า network/timeout
//  - scan body แน่นขึ้น ("latitude"/APP_INITIALIZATION_STATE) + auto-swap lat/lng (ขอบเขตไทย)
// ============================================================
import { parseLatLng } from "@/lib/queue";

// 9s/ครั้ง — ไม่เกินลิมิต serverless (Hobby ~10s) เพราะแต่ละ batch เป็น function call แยก
// ลิงก์ช้า/หลุด → ฝั่ง client วนซ้ำอีกรอบ (คนละ invocation) ให้โอกาสใหม่
const FETCH_MS = 9_000;

// header เลียนแบบ browser + cookie ข้าม consent (ไม่งั้นโดนเด้ง consent.google.com ที่ไม่มีพิกัด)
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Cookie: "CONSENT=YES+cb.20210720-07-p0.en+FX+410; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg",
};

// pattern หาพิกัดจาก URL (เรียงจากแม่นยำสุด)
const COORD_RE: RegExp[] = [
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/, // .../data=...!3d{lat}!4d{lng}
  /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, // .../@{lat},{lng},17z
  /[?&#](?:q|query|ll|sll|center|daddr|destination|saddr|viewpoint)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  /\/(?:search|dir|place)\/(-?\d{1,3}\.\d+),\+?(-?\d{1,3}\.\d+)/, // /search/{lat},{lng}
];

// pattern เพิ่มเติมสำหรับสแกนใน body (HTML/JSON ที่ Google ฝังพิกัดไว้)
const BODY_RE: RegExp[] = [
  ...COORD_RE,
  /\[null,null,(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)\]/, // APP_INITIALIZATION_STATE [null,null,lat,lng]
  /"latitude"\s*:\s*(-?\d{1,3}\.\d+)\s*,\s*"longitude"\s*:\s*(-?\d{1,3}\.\d+)/, // JSON-LD
  /\\"@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, // escaped @lat,lng ใน JSON
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
  const fromRaw = scan(raw, COORD_RE);
  if (fromRaw) return fromRaw;
  if (!/^https?:\/\//i.test(raw)) return null;

  // 2) ตาม redirect (ลิงก์ย่อ maps.app.goo.gl / goo.gl/maps) — ลองครั้งเดียว/เรียก
  //    (ฝั่ง client วนซ้ำทั้งรอบให้อีกที ลิงก์ช้าจะได้โอกาสในคนละ invocation)
  const r = await fetchAndScan(raw);
  return r === "RETRY" ? null : r;
}

// คืนพิกัด | null (โหลดสำเร็จแต่ไม่เจอพิกัด) | "RETRY" (network/timeout ควรลองใหม่)
async function fetchAndScan(raw: string): Promise<{ lat: number; lng: number } | null | "RETRY"> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(raw, { redirect: "follow", headers: HEADERS, signal: ctrl.signal });

    const finalUrl = res.url || "";
    const fromUrl = scan(finalUrl, COORD_RE);
    if (fromUrl) return fromUrl;

    // ถ้ายังโดน consent/sorry → แกะ continue=<encoded maps url> แล้ว fetch ต่อ
    if (/consent\.google|\/sorry\//i.test(finalUrl)) {
      const cont = finalUrl.match(/[?&]continue=([^&]+)/);
      if (cont) {
        const decoded = safeDecode(cont[1]);
        const fromCont = scan(decoded, COORD_RE);
        if (fromCont) return fromCont;
        if (/^https?:\/\//i.test(decoded)) {
          const res2 = await fetch(decoded, { redirect: "follow", headers: HEADERS, signal: ctrl.signal });
          const u2 = scan(res2.url || "", COORD_RE);
          if (u2) return u2;
          const b2 = scan(await res2.text(), BODY_RE);
          if (b2) return b2;
        }
      }
    }

    // พิกัดใน body (บางลิงก์ไม่เด้งใส่ URL)
    const body = await res.text();
    return scan(body, BODY_RE);
  } catch {
    return "RETRY"; // timeout / network — ลองใหม่อีกรอบ
  } finally {
    clearTimeout(timer);
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function clamp(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // auto-swap ถ้าพิกัดสลับ lat↔lng (ลูกค้าทั้งหมดในไทย: lat 5-21, lng 95-110)
  const inLat = (v: number) => v >= 5 && v <= 21;
  const inLng = (v: number) => v >= 95 && v <= 110;
  if (inLng(lat) && inLat(lng) && !inLat(lat)) {
    const t = lat;
    lat = lng;
    lng = t;
  }
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

// ============================================================
// แปลง "ที่อยู่ตัวหนังสือ" → พิกัดโดยประมาณ (Nominatim / OpenStreetMap ฟรี ไม่ต้องมี key · ≤1 req/วินาที)
//   เจ้าของ 9 พ.ย.69: ลงคิวที่มีแค่ที่อยู่ (ไม่มีลิงก์แมพ/ไม่ได้ปักหมุด) → ระบบเสนอวัน "ไม่ยอมจับคู่" กับคิวใกล้ ๆ
//   เพราะกฎระยะต้องมีพิกัดทั้งสองฝั่ง (พิกัดไม่ครบ = ข้ามวันนั้น) · ตัวนี้เติมพิกัดระดับ "ถนน/แขวง" ให้พอจับคู่ได้
//   ⚠ บ้านเลขที่ไทยค้นไม่เจอแทบทุกเคส (ทดสอบ 6 ที่อยู่จริง: เต็ม = 0/6 · ตัดเลขที่/ซอย/โครงการ = 5/6 คลาด 0.3–2.4 กม.)
//      → ค้นแบบย่อก่อน แล้วค่อยถอยไปแค่ แขวง/เขต/จังหวัด · ไม่เจอ = null (ไม่เดา) · ผลเป็น approx เสมอ ให้ UI บอกชัด
// ============================================================
export type GeocodeResult = { lat: number; lng: number; label: string; approx: true };

const GEO_CACHE = new Map<string, GeocodeResult | null>();
const GEO_HEADERS: Record<string, string> = {
  "User-Agent": "JR-OMS queue geocoder/1.0 (jr.aluminium102@gmail.com)",
  "Accept-Language": "th,en;q=0.8",
  Accept: "application/json",
};

/** ตัดส่วนที่ Nominatim หาไม่เจอออก: เลขที่ · เลข ม. · ซอย · ชื่อโครงการ/หมู่บ้าน/คอนโด/อาคาร · รหัสไปรษณีย์คงไว้ */
export function simplifyThaiAddress(a: string): string {
  return a
    .replace(/เลขที่\s*\S+/g, " ")
    .replace(/\b\d+\/\d+\b/g, " ")
    .replace(/\bม\.\s*\d+|หมู่\s*(ที่)?\s*\d+/g, " ")
    .replace(/ซอย\S*\s*\d*|ซ\.\s*\S+\s*\d*/g, " ")
    .replace(/(โครงการ|หมู่บ้าน|คอนโด\S*|อาคาร|ตึก|ห้อง|ชั้น|ยูนิต|Unit)\s*\S*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** เหลือเฉพาะหน่วยปกครอง: แขวง/ตำบล · เขต/อำเภอ · จังหวัด/กรุงเทพ (ทางถอยสุดท้าย) */
function adminOnly(a: string): string {
  const m = a.match(/(แขวง|ตำบล|ต\.)\s*\S+|(เขต|อำเภอ|อ\.)\s*\S+|(จังหวัด|จ\.)\s*\S+|กรุงเทพ\S*|นนทบุรี|ปทุมธานี|สมุทรปราการ|สมุทรสาคร|นครปฐม|ชลบุรี|ระยอง|ฉะเชิงเทรา|ภูเก็ต/g);
  return m ? [...new Set(m)].join(" ") : "";
}

async function nominatim(q: string): Promise<GeocodeResult | null> {
  if (!q || q.length < 4) return null;
  if (GEO_CACHE.has(q)) return GEO_CACHE.get(q) ?? null;
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=th&q=" + encodeURIComponent(q);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6_000);
  try {
    const res = await fetch(url, { headers: GEO_HEADERS, signal: ac.signal, cache: "no-store" });
    if (!res.ok) { GEO_CACHE.set(q, null); return null; }
    const arr = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
    const hit = arr?.[0];
    const co = hit ? clamp(Number(hit.lat), Number(hit.lon)) : null;
    // พิกัดต้องอยู่ในไทย (กันผลหลุดโลก)
    const out: GeocodeResult | null = co && co.lat >= 5 && co.lat <= 21 && co.lng >= 95 && co.lng <= 110
      ? { lat: co.lat, lng: co.lng, label: String(hit!.display_name ?? "").split(",").slice(0, 3).join(",").trim(), approx: true }
      : null;
    GEO_CACHE.set(q, out);
    return out;
  } catch {
    return null; // timeout/เน็ต → ไม่ cache ให้ลองใหม่ได้
  } finally {
    clearTimeout(timer);
  }
}

/** ที่อยู่ → พิกัดโดยประมาณ (null = หาไม่เจอ · ห้ามเดา) */
export async function geocodeAddress(address: string | null | undefined): Promise<GeocodeResult | null> {
  const raw = String(address ?? "").replace(/\s+/g, " ").trim();
  if (raw.length < 6) return null;
  const tries = [simplifyThaiAddress(raw), adminOnly(raw)].filter((q, i, arr) => q && arr.indexOf(q) === i);
  for (const q of tries) {
    const r = await nominatim(q);
    if (r) return r;
  }
  return null;
}
