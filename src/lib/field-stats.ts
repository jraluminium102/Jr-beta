/**
 * สถิติ "ออกหน้างาน" ของเซลล์รายเดือน (เจ้าของสั่ง 12 พ.ย.69)
 *   · นับจากคิวที่มีวันนัดและไม่ยกเลิก ทุกประเภทที่ต้องออกนอกออฟฟิศ (ประเมิน/เคลียร์แบบ/วัดจริง) — โชว์รูมไม่นับ
 *   · เช้า = 0.5 วัน · บ่าย = 0.5 วัน · มีทั้งสอง = 1 วัน
 *   · งานขนาด "เต็มวัน" หรือ งานต่างจังหวัด (นอก กทม.+นนทบุรี+ปทุมธานี+สมุทรปราการ+สมุทรสาคร+นครปฐม) แม้เจ้าเดียว = 1 วัน
 *   · วันอาทิตย์ = หยุด ไม่นับ ไม่ตัดสาย (ศุกร์ เสาร์ จันทร์ = ติดกัน 3 วัน)
 *   · "ติดกัน" = วันทำงาน (จ–ส) ที่ออกหน้างานต่อเนื่อง · วันลา/วันหยุด/ไม่มีคิว = ตัดสาย
 *   · วันที่ลงออฟฟิศ (แม้ครึ่งวัน) = ตัดสายทันที นับใหม่จาก 0 (เจ้าของ 19 พ.ย.69: "อยู่ออฟฟิศ 1 วันก็เป็น 0 ทันที")
 *   · แยก 2 ตัว: ติดกันถึงวันนี้ (ของจริง) กับ ต่อจากคิวล่วงหน้า (วันที่ยังมาไม่ถึง นับเฉพาะวันที่ลูกค้าเต็มวัน)
 *   · วันออฟฟิศ: ทั้งวัน = 1 · เช้าหรือบ่าย = 0.5 (จาก queue_sales.office_overrides action "add")
 *   · ผู้ช่วยเซลล์ไม่นับ (ผู้เรียกกรอง role เอง)
 * ฟังก์ชันล้วน ไม่แตะ DB — ใช้ร่วมกัน หน้าคิวงาน · ลิงก์เซลล์ · engine เสนอคิว
 */

/** เซลล์ที่ติดตาม ออกหน้างาน/ติดกัน/วันออฟฟิศ — เจ้าของสั่ง 12 พ.ย.69 "เอาแค่แม็กกับไล้พอ" (การ์ด · ปฏิทินออฟฟิศ · เตือนใน engine · ลิงก์เซลล์) */
export const FIELD_TRACK_NAMES = ["แม็ก", "ไล้"];
export const isFieldTracked = (name?: string | null) => FIELD_TRACK_NAMES.includes(String(name ?? "").trim());

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
  streak_now: number;      // ออกติดกันมาถึงวันนี้กี่วันทำงาน (0 = วันนี้ไม่ได้ออก หรือวันนี้ลงออฟฟิศ)
  streak_ahead: number;    // คิวล่วงหน้าต่อจากวันนี้อีกกี่วันทำงาน — นับเฉพาะวันที่ลูกค้าเต็มวัน (หยุดที่วันแรกที่ไม่เต็ม/ลงออฟฟิศ)
  streak_ahead_until: string | null; // วันสุดท้ายของสายล่วงหน้า (YYYY-MM-DD) · null = ไม่มีต่อ
  streak_ahead_warn: boolean; // ถึงวันนี้ + ล่วงหน้า ≥ เกณฑ์เตือน (ทั้งที่ตอนนี้ยังไม่ถึงเกณฑ์)
  streak_max: number;      // ติดกันยาวสุดในเดือน (ของจริง ถึงวันนี้)
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

/** วันที่ลงออฟฟิศ (เช้า/บ่าย/ทั้งวัน) — ใช้ตัดสาย "ติดกัน" */
export function officeDateSet(office?: FieldOffice[] | null): Set<string> {
  const s = new Set<string>();
  for (const o of office ?? []) if (o && o.action === "add" && o.date) s.add(String(o.date).slice(0, 10));
  return s;
}

/** นับวันทำงานติดกันที่ออกหน้างาน ย้อนจาก `endDate` (รวมวันนั้น) — หยุดเมื่อเจอวันทำงานที่ไม่ได้ออก หรือวันที่ลงออฟฟิศ (แม้ครึ่งวัน) */
export function fieldStreakEnding(days: Map<string, { value: number }>, endDate: string, officeDays?: Set<string>): number {
  let d = isSunday(endDate) ? prevWorkingDay(endDate) : endDate;
  let n = 0;
  for (let i = 0; i < 60; i++) {
    if ((days.get(d)?.value ?? 0) <= 0 || officeDays?.has(d)) break;
    n++;
    d = prevWorkingDay(d);
  }
  return n;
}

/** คิวล่วงหน้า: นับวันทำงานถัดจาก `today` ไปข้างหน้า เฉพาะวันที่ลูกค้าเต็มวัน (ค่า 1) และไม่ได้ลงออฟฟิศ — หยุดที่วันแรกที่ไม่เข้าเงื่อนไข */
export function fieldStreakAhead(days: Map<string, { value: number }>, today: string, officeDays?: Set<string>): { days: number; until: string | null } {
  const next = (iso: string) => { let d = addDays(iso, 1); while (isSunday(d)) d = addDays(d, 1); return d; };
  let d = next(today), n = 0, until: string | null = null;
  for (let i = 0; i < 60; i++) {
    if ((days.get(d)?.value ?? 0) < 1 || officeDays?.has(d)) break;
    n++; until = d;
    d = next(d);
  }
  return { days: n, until };
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
    const officeDays = officeDateSet(args.officeBySales[sid]);
    // ติดกันยาวสุดในเดือน (ของจริง — ถึงวันนี้เท่านั้น วันที่ยังมาไม่ถึงไปอยู่ช่องล่วงหน้า): ไล่ทุกวันทำงานของเดือน
    //   เริ่มด้วยสายที่ต่อมาจากเดือนก่อน (นับเข้า max เฉพาะเมื่อยังออกต่อในเดือนนี้) · วันลงออฟฟิศ = ตัดสาย
    {
      let cur = fieldStreakEnding(days, prevWorkingDay(`${month}-01`), officeDays);
      let d = `${month}-01`;
      while (d.startsWith(month) && d <= today) {
        if (!isSunday(d)) { if ((days.get(d)?.value ?? 0) > 0 && !officeDays.has(d)) { cur++; streakMax = Math.max(streakMax, cur); } else cur = 0; }
        d = addDays(d, 1);
      }
    }
    const streakNow = fieldStreakEnding(days, today, officeDays);
    const ahead = fieldStreakAhead(days, today, officeDays);
    // วันออฟฟิศในเดือน
    const off = (args.officeBySales[sid] ?? []).filter((o) => o.action === "add" && inMonth(o.date));
    const offDays = new Map<string, number>();
    for (const o of off) offDays.set(o.date, (offDays.get(o.date) ?? 0) + 0.5);
    let officeCount = 0; for (const v of offDays.values()) officeCount += Math.min(1, v);
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
      streak_now: streakNow, streak_ahead: ahead.days, streak_ahead_until: ahead.until,
      streak_ahead_warn: ahead.days > 0 && streakNow < args.streakWarn && streakNow + ahead.days >= args.streakWarn,
      streak_max: streakMax, office_days: officeCount, office_required: required, leave_days: leave,
      streak_warn: streakNow >= args.streakWarn,
    };
  });
}
