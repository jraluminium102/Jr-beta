/**
 * สถิติ "ออกหน้างาน" ของเซลล์รายเดือน (เจ้าของสั่ง 12 พ.ย.69)
 *   · นับจากคิวที่มีวันนัดและไม่ยกเลิก ทุกประเภทที่ต้องออกนอกออฟฟิศ (ประเมิน/เคลียร์แบบ/วัดจริง) — โชว์รูมไม่นับ
 *   · เช้า = 0.5 วัน · บ่าย = 0.5 วัน · มีทั้งสอง = 1 วัน
 *   · งานขนาด "เต็มวัน" หรือ งานต่างจังหวัด (นอก กทม.+นนทบุรี+ปทุมธานี+สมุทรปราการ+สมุทรสาคร+นครปฐม) แม้เจ้าเดียว = 1 วัน
 *   · วันอาทิตย์ = หยุด ไม่นับ ไม่ตัดสาย (ศุกร์ เสาร์ จันทร์ = ติดกัน 3 วัน)
 *   · "ติดกัน" = วันทำงาน (จ–ส) ที่ออกหน้างานต่อเนื่อง · วันลา/วันหยุด/อยู่ออฟฟิศทั้งวัน/ไม่มีคิว = ตัดสาย
 *   · วันออฟฟิศ: ทั้งวัน = 1 · เช้าหรือบ่าย = 0.5 (จาก queue_sales.office_overrides action "add")
 *   · ผู้ช่วยเซลล์ไม่นับ (ผู้เรียกกรอง role เอง)
 * ฟังก์ชันล้วน ไม่แตะ DB — ใช้ร่วมกัน หน้าคิวงาน · ลิงก์เซลล์ · engine เสนอคิว
 */

export type FieldEntry = {
  sales_id: string | null;
  queue_date: string | null;
  queue_time: string | null;
  status: string;
  job_type?: string | null;
  job_size?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};
export type FieldAvail = { sales_id: string; date: string; kind: string; half?: string | null };
export type FieldOffice = { date: string; half: "AM" | "PM"; action: "add" | "remove" };

export type SalesFieldStats = {
  sales_id: string;
  field_days: number;      // รวมวันออกหน้างาน (เต็ม + ครึ่ง×0.5)
  full_days: number;       // วันที่ออกเต็มวัน
  half_days: number;       // วันที่ออกครึ่งวัน
  upcountry_days: number;  // วันที่มีงานต่างจังหวัด
  streak_now: number;      // ออกติดกันมาถึงวันนี้กี่วันทำงาน (0 = วันนี้/เมื่อวานไม่ได้ออก)
  streak_max: number;      // ติดกันยาวสุดในเดือน
  office_days: number;     // ตั้งวันออฟฟิศในเดือนแล้วกี่วัน (0.5 ต่อครึ่งวัน)
  office_required: number; // ต้องอยู่ออฟฟิศกี่วัน
  leave_days: number;      // ลา/หยุด/WFH (0.5 ต่อครึ่งวัน)
  streak_warn: boolean;    // ติดกัน ≥ เกณฑ์เตือน
};

// จังหวัดใกล้ (ไม่นับเป็น ตจว.) — เจ้าของเคาะ 12 พ.ย.69
const NEAR_PROVINCES = ["กรุงเทพ", "กทม", "นนทบุรี", "ปทุมธานี", "สมุทรปราการ", "สมุทรสาคร", "นครปฐม"];
const FAR_PROVINCES = [
  "สมุทรสงคราม", "ฉะเชิงเทรา", "ชลบุรี", "ระยอง", "จันทบุรี", "ตราด", "พระนครศรีอยุธยา", "อยุธยา", "อ่างทอง", "สระบุรี", "ลพบุรี", "สิงห์บุรี",
  "ชัยนาท", "นครนายก", "ปราจีนบุรี", "สระแก้ว", "ราชบุรี", "กาญจนบุรี", "สุพรรณบุรี", "เพชรบุรี", "ประจวบคีรีขันธ์", "นครราชสีมา", "โคราช",
  "ขอนแก่น", "อุดรธานี", "อุบลราชธานี", "บุรีรัมย์", "สุรินทร์", "ศรีสะเกษ", "ร้อยเอ็ด", "มหาสารคาม", "กาฬสินธุ์", "สกลนคร", "นครพนม",
  "มุกดาหาร", "หนองคาย", "เลย", "หนองบัวลำภู", "บึงกาฬ", "ชัยภูมิ", "ยโสธร", "อำนาจเจริญ", "เชียงใหม่", "เชียงราย", "ลำปาง", "ลำพูน",
  "แพร่", "น่าน", "พะเยา", "แม่ฮ่องสอน", "อุตรดิตถ์", "พิษณุโลก", "สุโขทัย", "ตาก", "กำแพงเพชร", "พิจิตร", "นครสวรรค์", "อุทัยธานี",
  "เพชรบูรณ์", "ชุมพร", "ระนอง", "สุราษฎร์ธานี", "นครศรีธรรมราช", "พังงา", "กระบี่", "ภูเก็ต", "ตรัง", "พัทลุง", "สงขลา", "สตูล",
  "ปัตตานี", "ยะลา", "นราธิวาส", "หัวหิน", "พัทยา", "ศรีราชา",
];
/** ต่างจังหวัด = นอก กทม.+5 ปริมณฑล · ดูพิกัดก่อน (กรอบ กทม.-ปริมณฑล) → คำจังหวัดในที่อยู่ · ไม่รู้ = ใกล้ (ไม่เฟ้อ) */
export function isUpcountry(address?: string | null, lat?: number | null, lng?: number | null): boolean {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const near = lat >= 13.35 && lat <= 14.25 && lng >= 100.05 && lng <= 101.0; // กทม.+ปริมณฑลโดยประมาณ
    return !near;
  }
  const s = String(address ?? "");
  if (!s.trim()) return false;
  if (NEAR_PROVINCES.some((p) => s.includes(p))) return false;
  return FAR_PROVINCES.some((p) => s.includes(p));
}

const isSunday = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay() === 0;
const addDays = (iso: string, n: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const prevWorkingDay = (iso: string) => { let d = addDays(iso, -1); while (isSunday(d)) d = addDays(d, -1); return d; };
const isFieldJobType = (jt: unknown) => !/โชว์รูม|showroom/i.test(String(jt ?? ""));
const halfOf = (time: string | null | undefined): "AM" | "PM" | "FULL" => {
  const m = String(time ?? "").match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return "FULL";
  return Number(m[1]) * 60 + Number(m[2]) < 13 * 60 ? "AM" : "PM";
};

/** วัน → ค่าออกหน้างาน (0 / 0.5 / 1) ของเซลล์หนึ่งคน */
export function fieldDayMap(entries: FieldEntry[], salesId: string): Map<string, { value: number; upcountry: boolean }> {
  const m = new Map<string, { am: boolean; pm: boolean; full: boolean; up: boolean }>();
  for (const e of entries) {
    if (e.sales_id !== salesId || !e.queue_date || e.status === "CANCELLED" || !isFieldJobType(e.job_type)) continue;
    const d = String(e.queue_date).slice(0, 10);
    if (isSunday(d)) continue;
    const cur = m.get(d) ?? { am: false, pm: false, full: false, up: false };
    const up = isUpcountry(e.address, e.lat, e.lng);
    if (up || e.job_size === "FULLDAY") cur.full = true;
    const h = halfOf(e.queue_time);
    if (h === "FULL") cur.full = true; else if (h === "AM") cur.am = true; else cur.pm = true;
    if (up) cur.up = true;
    m.set(d, cur);
  }
  const out = new Map<string, { value: number; upcountry: boolean }>();
  for (const [d, v] of m) out.set(d, { value: v.full || (v.am && v.pm) ? 1 : v.am || v.pm ? 0.5 : 0, upcountry: v.up });
  return out;
}

/** นับวันทำงานติดกันที่ออกหน้างาน ย้อนจาก `endDate` (รวมวันนั้น) — หยุดเมื่อเจอวันทำงานที่ไม่ได้ออก */
export function fieldStreakEnding(days: Map<string, { value: number }>, endDate: string): number {
  let d = isSunday(endDate) ? prevWorkingDay(endDate) : endDate;
  let n = 0;
  for (let i = 0; i < 60; i++) {
    if ((days.get(d)?.value ?? 0) <= 0) break;
    n++;
    d = prevWorkingDay(d);
  }
  return n;
}

export function computeFieldStats(args: {
  salesIds: string[];
  entries: FieldEntry[];      // ควรครอบคลุมเดือนที่ดู + ~2 สัปดาห์ก่อนหน้า (ให้นับสายต่อเนื่องข้ามเดือนได้)
  avail: FieldAvail[];
  officeBySales: Record<string, FieldOffice[] | null | undefined>;
  month: string;              // YYYY-MM
  today: string;              // YYYY-MM-DD
  requiredDays: number;
  requiredBySales?: Record<string, number | null | undefined>;
  streakWarn: number;
}): SalesFieldStats[] {
  const { month, today } = args;
  const inMonth = (d: string) => d.startsWith(month);
  return args.salesIds.map((sid) => {
    const days = fieldDayMap(args.entries, sid);
    let field = 0, full = 0, half = 0, up = 0, streakMax = 0;
    for (const [d, v] of days) {
      if (!inMonth(d)) continue;
      field += v.value; if (v.value >= 1) full++; else if (v.value > 0) half++; if (v.upcountry) up++;
    }
    // ติดกันยาวสุดในเดือน: ไล่ทุกวันทำงานของเดือน · เริ่มด้วยสายที่ต่อมาจากเดือนก่อน (นับเข้า max เฉพาะเมื่อยังออกต่อในเดือนนี้)
    {
      let cur = fieldStreakEnding(days, prevWorkingDay(`${month}-01`));
      let d = `${month}-01`;
      while (d.startsWith(month)) {
        if (!isSunday(d)) { if ((days.get(d)?.value ?? 0) > 0) { cur++; streakMax = Math.max(streakMax, cur); } else cur = 0; }
        d = addDays(d, 1);
      }
    }
    const streakNow = fieldStreakEnding(days, today);
    // วันออฟฟิศในเดือน
    const off = (args.officeBySales[sid] ?? []).filter((o) => o.action === "add" && inMonth(o.date));
    const offDays = new Map<string, number>();
    for (const o of off) offDays.set(o.date, (offDays.get(o.date) ?? 0) + 0.5);
    let officeDays = 0; for (const v of offDays.values()) officeDays += Math.min(1, v);
    // ลา
    let leave = 0;
    for (const a of args.avail) {
      if (a.sales_id !== sid || !inMonth(a.date)) continue;
      if (a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY" || a.kind === "WFH") leave += 1;
      else if (a.kind === "LEAVE_HALF") leave += 0.5;
    }
    const required = args.requiredBySales?.[sid] ?? args.requiredDays;
    return {
      sales_id: sid, field_days: field, full_days: full, half_days: half, upcountry_days: up,
      streak_now: streakNow, streak_max: streakMax, office_days: officeDays, office_required: required, leave_days: leave,
      streak_warn: streakNow >= args.streakWarn,
    };
  });
}
