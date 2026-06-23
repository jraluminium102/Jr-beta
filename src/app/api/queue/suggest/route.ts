import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { detectTeam, estimateMinutes } from "@/lib/queue";
import { resolveMapLink } from "@/lib/queue-geo";
import { drivingMinutes } from "@/lib/ors";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

const schema = z.object({
  sales_id: z.string().uuid().nullish(),
  job_size: z.enum(["SINGLE", "MULTI", "FULLDAY"]).nullish(),
  address: z.string().nullish(),
  location_url: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  from_date: z.string().nullish(), // (0042) วันเริ่มหา slot — ถ้าไม่ส่งมา = today+1
  fixed_time: z.enum(["10:00", "14:00"]).nullish(), // (ข้อ 12) ล็อกเวลาเอง → ระบบหาแค่วัน
});

// POST /api/queue/suggest — propose earliest available slot based on queue rules
// R-Sunday  : no Sunday slots
// R-2slot   : each sales rep has max 2 slots per day (10:00 / 14:00)
// R-45min   : if a slot is the 2nd booking on the same day for the same sales rep,
//             travel time between the existing booking's location and the new one
//             must not exceed queue_settings.max_pair_min (default 45 min); skip if
//             either booking has no coordinates (do NOT block)
// R-Zone    : auto-filter sales rep by address province (BKK / PHUKET)
// R-Leave   : respect sales_availability (LEAVE_FULL / HOLIDAY → skip day;
//             LEAVE_HALF / OFFICE_HALF → only one slot available)
// R-Balance : sort sales reps by queue load ascending (least-loaded first)
// Auto-assign: only consider role=MAIN sales reps (ASSISTANT is picked manually)
export const POST = withRoute(async (req: Request) => {
  const ctx = await requirePermission("queue", "write");
  const body = schema.parse(await req.json());
  const sb = ctx.supabase as unknown as Sb;

  // resolve พิกัดงานใหม่จากลิงก์ (รองรับลิงก์ย่อ) ถ้าไม่ได้ส่ง lat/lng มา — เพื่อให้กฎ 45 นาทีทำงานจริง
  if ((body.lat == null || body.lng == null) && body.location_url) {
    const co = await resolveMapLink(body.location_url);
    if (co) { body.lat = co.lat; body.lng = co.lng; }
  }

  // Load queue_settings for max_pair_min / avg_speed_kmh / detour_factor
  const { data: settingsRaw } = await sb
    .from("queue_settings")
    .select("max_pair_min,avg_speed_kmh,detour_factor")
    .eq("id", 1)
    .maybeSingle();
  const settings = (settingsRaw ?? {}) as {
    max_pair_min?: number | null;
    avg_speed_kmh?: number | null;
    detour_factor?: number | null;
  };
  const maxPairMin = settings.max_pair_min ?? 45;
  const avgSpeedKmh = settings.avg_speed_kmh ?? 40;
  const detourFactor = settings.detour_factor ?? 1.3;

  // R-Zone + R-Balance: load only MAIN sales reps (ASSISTANT not auto-assigned)
  const { data: salesAll, error: e1 } = await sb
    .from("queue_sales")
    .select("*")
    .eq("active", true)
    .eq("role", "MAIN"); // R-Balance: only role=MAIN for auto-assign
  if (e1) throw dbError(e1);
  let sales = (salesAll ?? []) as any[];
  if (!sales.length) throw new HttpError(422, "ยังไม่มีเซลล์ในระบบ");

  // R-Zone: filter by address province, or explicit sales_id
  if (body.sales_id) {
    sales = sales.filter((s) => s.id === body.sales_id);
  } else {
    const team = detectTeam(body.address, body.lat, body.lng);
    sales = sales.filter((s) => s.team === team);
  }
  if (!sales.length) throw new HttpError(422, "ไม่มีเซลล์ที่ตรงเงื่อนไข/โซน");

  const today = iso(new Date());

  // คำนวณ base วันเริ่มหา slot — ถ้าส่ง from_date มา ใช้ max(today, from_date-1) เพื่อเริ่มจากวันแรกของเดือนที่ดูอยู่
  let base: Date;
  if (body.from_date) {
    const fromDay = new Date(body.from_date + "T00:00:00Z");
    const todayDay = new Date();
    todayDay.setUTCHours(0, 0, 0, 0);
    // ถ้า from_date อยู่ในอนาคต → เริ่มจาก from_date-1 (loop d=1 จะเป็นวันแรก)
    // ถ้า from_date ผ่านไปแล้ว → เริ่มจาก today (ไม่เสนอย้อนหลัง)
    base = fromDay > todayDay ? new Date(fromDay.getTime() - 86400000) : todayDay;
  } else {
    base = new Date();
    base.setUTCHours(0, 0, 0, 0);
  }

  // Load existing bookings: include lat/lng for R-45min check
  const { data: entriesRaw } = await sb
    .from("queue_entries")
    .select("sales_id,queue_date,queue_time,status,lat,lng")
    .not("queue_date", "is", null)
    .neq("status", "CANCELLED")
    .gte("queue_date", today);
  const entries = (entriesRaw ?? []) as {
    sales_id: string | null;
    queue_date: string;
    queue_time: string | null;
    lat: number | null;
    lng: number | null;
  }[];

  // R-Leave: load sales_availability
  const { data: availRaw } = await sb
    .from("sales_availability")
    .select("sales_id,date,kind,half")
    .gte("date", today);
  const avail = (availRaw ?? []) as {
    sales_id: string;
    date: string;
    kind: string;
    half: string | null;
  }[];

  // R-Balance: count queued bookings per sales rep (load)
  const load: Record<string, number> = {};
  entries.forEach((e) => {
    if (e.sales_id) load[e.sales_id] = (load[e.sales_id] ?? 0) + 1;
  });

  // (ข้อ 10) cache ผลระยะขับรถต่อ request — newLat/newLng คงที่ทั้ง request, key ด้วยพิกัดงานเดิม
  // กันยิง ORS ซ้ำ/เกินโควต้า/timeout เมื่อ loop หลายวัน
  const driveCache = new Map<string, number | null>();

  for (let d = 1; d <= 70; d++) {
    const day = new Date(base.getTime() + d * 86400000);
    const dow = day.getUTCDay();

    // R-Sunday: skip Sunday
    if (dow === 0) continue;
    const dateStr = iso(day);

    // R-Balance: sort by load ascending
    const ordered = [...sales].sort(
      (a, b) => (load[a.id] ?? 0) - (load[b.id] ?? 0)
    );

    for (const s of ordered) {
      // R-Leave: availability restrictions for this date
      const av = avail.filter((a) => a.sales_id === s.id && a.date === dateStr);

      // ลาทั้งวัน / วันหยุด / (ข้อ 4) WFH ทำงานที่บ้าน (ไม่ออกหน้างาน) → ข้ามทั้งวัน
      if (av.some((a) => a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY" || a.kind === "WFH"))
        continue;

      // (ข้อ 9/11) ตัด slot ที่ติด "วันอยู่ออฟฟิศ" — เดิม engine ไม่เช็ค office_slots/overrides เลยจัดทับ
      const blocked = new Set<string>();
      const half2slot = (h: unknown) => (h === "PM" ? "14:00" : "10:00");
      // office_slots: วันอยู่ออฟฟิศประจำรายสัปดาห์ [{weekday,half}]
      for (const o of Array.isArray(s.office_slots) ? s.office_slots : []) {
        if (o && o.weekday === dow) blocked.add(half2slot(o.half));
      }
      // office_overrides: override รายวัน [{date,half,action}]
      for (const o of Array.isArray(s.office_overrides) ? s.office_overrides : []) {
        if (o && o.date === dateStr) {
          if (o.action === "remove") blocked.delete(half2slot(o.half));
          else blocked.add(half2slot(o.half));
        }
      }
      // ลาครึ่งวัน / เช้าอยู่ออฟฟิศ (จาก sales_availability)
      if (av.some((a) => a.kind === "OFFICE_HALF")) blocked.add("10:00"); // เช้าออฟฟิศ
      const halfLeave = av.find((a) => a.kind === "LEAVE_HALF");
      if (halfLeave) blocked.add(half2slot(halfLeave.half));

      let slots = ["10:00", "14:00"].filter((t) => !blocked.has(t));
      // (ข้อ 8) งานหลายจุด → จัดบ่ายก่อนอัตโนมัติ (comparator 2-arg ให้ stable)
      if (body.job_size === "MULTI")
        slots = [...slots].sort((a, b) => (a === "14:00" ? -1 : 1) - (b === "14:00" ? -1 : 1));
      // (ข้อ 12) ล็อกเวลาเอง → เหลือเฉพาะ slot ที่เลือก (ไม่ใช้กับงานเต็มวันที่ต้องการ 2 slot)
      if (body.fixed_time && body.job_size !== "FULLDAY")
        slots = slots.filter((t) => t === body.fixed_time);
      if (slots.length === 0) continue;

      // คิวที่จองแล้วของเซลล์นี้ในวันนี้
      const dayEntries = entries.filter(
        (e) => e.sales_id === s.id && e.queue_date === dateStr
      );
      const usedTimes = dayEntries.map((e) => e.queue_time);

      // FULLDAY: ต้องว่างทั้ง 2 slot (ไม่ติดออฟฟิศ/ลาครึ่งวัน)
      if (body.job_size === "FULLDAY") {
        if (usedTimes.length === 0 && slots.length === 2) {
          return ok({
            queue_date: dateStr,
            queue_time: "10:00",
            sales_id: s.id,
            sales_name: s.name,
            reason: `งานเต็มวัน → ${s.name} ว่างทั้งวัน ${DOW_TH[dow]} ${dateStr}`,
          });
        }
        continue;
      }

      // R-2slot: slot ว่างแรก (ตามลำดับที่จัด — MULTI=บ่ายก่อน)
      const freeSlot = slots.find((t) => !usedTimes.includes(t));
      if (!freeSlot) continue;

      // R-45min: ถ้าเป็นคิวที่ 2 ในวันเดียว → เช็คเวลาเดินทาง
      // (ข้อ 10) ใช้ระยะ "ขับรถจริง" จาก ORS, fallback haversine ถ้าไม่มี key/พัง
      if (dayEntries.length === 1) {
        const existing = dayEntries[0];
        const newLat = body.lat ?? null;
        const newLng = body.lng ?? null;
        if (existing.lat != null && existing.lng != null && newLat != null && newLng != null) {
          const ck = `${existing.lat},${existing.lng}`;
          let travelMin: number | null;
          if (driveCache.has(ck)) {
            travelMin = driveCache.get(ck) ?? null;
          } else {
            travelMin = await drivingMinutes(
              { lat: existing.lat, lng: existing.lng },
              { lat: newLat, lng: newLng },
            );
            driveCache.set(ck, travelMin);
          }
          if (travelMin == null) {
            travelMin = estimateMinutes(
              { lat: existing.lat, lng: existing.lng },
              { lat: newLat, lng: newLng },
              { avgSpeedKmh, detourFactor }
            );
          }
          if (travelMin > maxPairMin) continue; // ไกลเกิน → ข้าม slot นี้
        }
      }

      return ok({
        queue_date: dateStr,
        queue_time: freeSlot,
        sales_id: s.id,
        sales_name: s.name,
        reason: `${s.name} ว่างเร็วสุด ${DOW_TH[dow]} ${dateStr} ${freeSlot.slice(0, 5)}`,
      });
    }
  }

  throw new HttpError(
    422,
    "ไม่พบช่องว่างใน 70 วันข้างหน้า — ตรวจวันลา/โควตา/ระยะทาง"
  );
});
