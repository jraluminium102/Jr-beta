// คิวงาน — types + helper (Supabase เป็น source of truth, ไม่มี Google Sheet แล้ว)

export type QueueStatus = "PENDING" | "PROPOSED" | "CONFIRMED" | "DONE" | "CANCELLED";
export type QueueTeam = "BKK" | "PHUKET";
export type JobSize = "SINGLE" | "MULTI" | "FULLDAY";
export type QueueSalesRole = "MAIN" | "ASSISTANT";  // (0019)
export type OfficeHalf = "AM" | "PM";
export type OfficeSlot = { weekday: number; half: OfficeHalf };  // (0030) weekday 0=อา..6=ส
export type OfficeOverride = { date: string; half: OfficeHalf; action: "add" | "remove" }; // (0031) ทับรายวัน

export type QueueSales = {
  id: string;
  code: string;
  name: string;
  team: QueueTeam;
  start_label: string | null;
  start_lat: number | null;
  start_lng: number | null;
  profile_id: string | null;
  active: boolean;
  role: QueueSalesRole;             // (0019) ผู้ช่วยเซลล์
  parent_sales_id: string | null;   // (0019) สังกัดเซลล์หลัก
  office_slots?: OfficeSlot[] | null;        // (0030) วันอยู่ออฟฟิศประจำ (ครึ่งวัน)
  office_overrides?: OfficeOverride[] | null; // (0031) override รายวัน (ย้าย/เอาออก)
};

// office มีผลไหม ในวันนั้น/ช่วงนั้น — override รายวันทับ pattern ประจำสัปดาห์
export function isOfficeOn(sales: QueueSales, date: string, weekday: number, half: OfficeHalf): boolean {
  const ovr = (sales.office_overrides ?? []).find((o) => o.date === date && o.half === half);
  if (ovr) return ovr.action === "add";
  return (sales.office_slots ?? []).some((o) => o.weekday === weekday && o.half === half);
}

export type QueueEntry = {
  id: string;
  status: QueueStatus;
  queue_date: string | null;
  queue_time: string | null;
  job_type: string | null;
  sales_id: string | null;
  sales?: { id: string; name: string; code: string; team: QueueTeam } | null;
  assistant_id: string | null;  // (0019) ผู้ช่วยเซลล์ที่ไปด้วย
  assistant?: { id: string; name: string; code: string } | null;
  line_contact: string | null;
  customer_name: string;
  tel: string | null;
  address: string | null;
  location_url: string | null;
  lat: number | null;
  lng: number | null;
  job_size: JobSize | null;
  job_count: number | null;
  assess_fee: number | null;
  payment: string | null;
  receipt_done: boolean;
  fee_paid: boolean;            // (0042) ชำระค่าประเมินแล้ว
  note_admin: string | null;
  note_ai: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- สถานะ ----------
export const STATUS_META: Record<QueueStatus, { th: string; tone: "gray" | "amber" | "sky" | "emerald" | "red" }> = {
  PENDING:   { th: "รอจัด", tone: "gray" },
  PROPOSED:  { th: "เสนอคิว (รอลูกค้ายืนยัน)", tone: "amber" },
  CONFIRMED: { th: "ยืนยันแล้ว", tone: "emerald" },
  DONE:      { th: "เสร็จ", tone: "emerald" },
  CANCELLED: { th: "ยกเลิก", tone: "red" },
};
export const STATUS_ORDER: QueueStatus[] = ["PENDING", "PROPOSED", "CONFIRMED", "DONE", "CANCELLED"];

// ---------- ขนาดงาน ----------
export const JOB_SIZE_META: Record<JobSize, string> = {
  SINGLE: "จุดเดียว",
  MULTI: "หลายจุด",
  FULLDAY: "เต็มวัน",
};

// ---------- ค่าประเมิน (dropdown + พิมพ์เอง) ----------
export const FEE_OPTIONS = [1000, 2000, 2500, 3000, 3500];

// ---------- วันในสัปดาห์ + สีประจำวัน (ไทย) ----------
// index: 0=อาทิตย์ … 6=เสาร์ (ตรงกับ Date.getDay())
const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export type DayColor = { name: string; row: string; chip: string; dot: string };
const DAY_COLORS: DayColor[] = [
  { name: "อาทิตย์", row: "bg-red-50",     chip: "bg-red-100 text-red-800",        dot: "#dc2626" },
  { name: "จันทร์",  row: "bg-yellow-50",  chip: "bg-yellow-100 text-yellow-800",  dot: "#ca8a04" },
  { name: "อังคาร",  row: "bg-pink-50",    chip: "bg-pink-100 text-pink-800",      dot: "#db2777" },
  { name: "พุธ",     row: "bg-green-50",   chip: "bg-green-100 text-green-800",     dot: "#16a34a" },
  { name: "พฤหัสบดี", row: "bg-orange-50", chip: "bg-orange-100 text-orange-800",   dot: "#ea580c" },
  { name: "ศุกร์",   row: "bg-sky-50",     chip: "bg-sky-100 text-sky-800",         dot: "#0284c7" },
  { name: "เสาร์",   row: "bg-purple-50",  chip: "bg-purple-100 text-purple-800",   dot: "#9333ea" },
];

// "2026-06-01" -> index วัน (0–6) หรือ null
function dowIndex(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getDay();
}

export function dayLabel(isoDate: string | null): string {
  const i = dowIndex(isoDate);
  return i === null ? "" : DOW_TH[i];
}

export function dayColor(isoDate: string | null): DayColor | null {
  const i = dowIndex(isoDate);
  return i === null ? null : DAY_COLORS[i];
}

// แปลง ISO -> วันที่ไทยอ่านง่าย (1 มิ.ย. 69)
const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function thaiDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d} ${TH_MON[m]} ${String((y + 543) % 100).padStart(2, "0")}`;
}

// ---------- พิกัด: ดึง lat,lng จากข้อความ/ลิงก์ Google Maps (ฝั่ง client) ----------
// รองรับ: "13.7,100.5" · ".../@13.7,100.5,17z" · "?q=13.7,100.5" · "query=13.7,100.5"
// ลิงก์ย่อ maps.app.goo.gl ดึงไม่ได้ฝั่ง client → ให้วางพิกัดตรง ๆ แทน
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  if (!input) return null;
  const s = input.trim();
  const valid = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { lat, lng } : null;

  const plain = s.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (plain) return valid(Number(plain[1]), Number(plain[2]));
  const at = s.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (at) return valid(Number(at[1]), Number(at[2]));
  const q = s.match(/[?&](?:q|query|ll|center)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (q) return valid(Number(q[1]), Number(q[2]));
  return null;
}

// ---------- ระยะทาง/เวลา (ใช้เต็มที่ตอนเฟส 2 — ระยะเส้นตรงโดยประมาณ) ----------
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// โซนใต้ (13 จังหวัด) → ทีมภูเก็ต (เซลล์บาส) · นอกนั้น = ทีม กทม.
export const SOUTH_PROVINCES = [
  "กระบี่", "ชุมพร", "ตรัง", "นครศรีธรรมราช", "นราธิวาส", "ปัตตานี", "พังงา",
  "พัทลุง", "ภูเก็ต", "ยะลา", "ระนอง", "สงขลา", "สตูล",
];
// ดูโซนจาก "พิกัด" ก่อน (แม่นกว่าคำในที่อยู่) — ใต้/ภูเก็ต lat < ~11.5 (กทม.13.7, ภูเก็ต7.8, ชุมพร10.5)
// ไม่มีพิกัด → ดูคำจังหวัดในที่อยู่ · ไม่เข้าเงื่อนไข = กทม.
export function detectTeam(address?: string | null, lat?: number | null, lng?: number | null): QueueTeam {
  if (lat != null && Number.isFinite(lat) && lat < 11.5 && (lng == null || (lng > 96 && lng < 101))) return "PHUKET";
  if (address && SOUTH_PROVINCES.some((p) => address.includes(p))) return "PHUKET";
  return "BKK";
}

// แปลงระยะเส้นตรง -> นาทีเดินทางโดยประมาณ (ปรับ avgSpeed/detour ได้จาก queue_settings)
export function estimateMinutes(
  a: { lat: number; lng: number }, b: { lat: number; lng: number },
  opts: { avgSpeedKmh?: number; detourFactor?: number } = {}
): number {
  const avg = opts.avgSpeedKmh ?? 40;
  const detour = opts.detourFactor ?? 1.3;
  const km = haversineKm(a, b) * detour;
  return Math.round((km / avg) * 60);
}
