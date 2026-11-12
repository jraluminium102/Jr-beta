// เครื่องยนต์เสนอคิวอัตโนมัติ (แยกออกจาก route เพื่อทดสอบ/เรียกซ้ำได้)
//   ตรรกะย้ายมาจาก src/app/api/queue/suggest/route.ts แบบคงเดิม 100%
import { HttpError } from "@/lib/bff/context";
import { dbError } from "@/lib/bff/db-error";
import { detectTeam, estimateMinutes, haversineKm } from "@/lib/queue";
import { geocodeAddress, resolveMapLink } from "@/lib/queue-geo";
import { fieldDayMap, fieldStreakEnding, isFieldTracked } from "@/lib/field-stats";
import { drivingMinutes } from "@/lib/ors";

type Sb = { from: (t: string) => any };

// เซลล์ที่ให้ "เสนออัตโนมัติ" ได้เท่านั้น = ไล้ / แม็ก / บาส(ใต้) — เจ้าของกำหนด 13 ส.ค.69
//   (เลือกเองใน dropdown ยังเลือกได้ทุกคน · จำกัดเฉพาะตอนระบบเลือกเซลล์ให้อัตโนมัติ)
const AUTO_CODES = new Set(["lai", "mac", "bas"]);
const AUTO_NAMES = new Set(["ไล้", "แม็ก", "บาส"]);
const isAutoSales = (s: { code?: unknown; name?: unknown }) =>
  AUTO_CODES.has(String(s.code)) || AUTO_NAMES.has(String(s.name).trim());

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export type SuggestParams = {
  sales_id?: string | null;
  job_size?: "SINGLE" | "MULTI" | "FULLDAY" | null;
  address?: string | null;
  location_url?: string | null;
  lat?: number | null;
  lng?: number | null;
  from_date?: string | null;
  fixed_time?: "10:00" | "14:00" | null;
};

/** คิวที่เซลล์คนนั้นมีอยู่แล้วในวันที่เสนอ — ให้เจ้าของเช็คเองได้โดยไม่ต้องไปเปิดตารางวันนั้น (เจ้าของ 3 พ.ย.69) */
export type DayPlanItem = {
  queue_time: string | null;
  customer_name: string;
  address: string | null;
  job_type: string | null;
  job_size: string | null;
  km: number | null;      // ระยะเส้นตรงจากหน้างานใหม่ (null = พิกัดไม่ครบ)
  min: number | null;     // เวลาขับโดยประมาณ (คูณรถติดแล้ว)
};
export type SuggestResult = {
  queue_date: string;
  queue_time: string;
  sales_id: string;
  sales_name: string;
  reason: string;
  day_plan: DayPlanItem[];   // คิวเดิมของเซลล์วันนั้น (เรียงตามเวลา)
  day_notes: string[];       // ช่องที่ถูกกันไว้วันนั้น เช่น "เช้า: วันออฟฟิศ"
};

export async function computeSuggestion(sb: Sb, params: SuggestParams): Promise<SuggestResult> {
  const body: SuggestParams = { ...params };

  // resolve พิกัดงานใหม่จากลิงก์ (รองรับลิงก์ย่อ) ถ้าไม่ได้ส่ง lat/lng มา — เพื่อให้กฎ 45 นาทีทำงานจริง
  if ((body.lat == null || body.lng == null) && body.location_url) {
    const co = await resolveMapLink(body.location_url);
    if (co) { body.lat = co.lat; body.lng = co.lng; }
  }
  // ยังไม่มีพิกัด แต่มีที่อยู่ตัวหนังสือ → หาพิกัดโดยประมาณจากที่อยู่ (เจ้าของ 9 พ.ย.69: คิวที่อยู่อย่างเดียวต้องจับคู่กับคิวใกล้ ๆ ได้)
  //   เดิม: พิกัดไม่ครบ = ไม่จับคู่เลย → ระบบเสนอ "วันว่างทั้งวัน" ไกลออกไป ทั้งที่มีคิวข้าง ๆ กันอยู่
  let geoNote = "";
  if ((body.lat == null || body.lng == null) && body.address) {
    const g = await geocodeAddress(body.address);
    if (g) {
      body.lat = g.lat; body.lng = g.lng;
      geoNote = `ใช้พิกัดโดยประมาณจากที่อยู่ (${g.label}) — อยากให้แม่นกว่านี้ วางลิงก์แมพ/ปักหมุดแล้วกดเสนอใหม่`;
    }
  }
  if (body.lat == null || body.lng == null) {
    geoNote = "ไม่มีพิกัดหน้างาน → ไม่จับคู่กับคิวอื่นในวันเดียวกัน (เลือกวันที่ว่างทั้งวัน) — วางลิงก์แมพ/ปักหมุดแล้วกดเสนอใหม่ถ้าอยากให้จับคู่";
  }

  // Load queue_settings for max_pair_min / avg_speed_kmh / detour_factor
  type Settings = {
    max_pair_min?: number | null; avg_speed_kmh?: number | null; detour_factor?: number | null; field_streak_warn?: number | null;
    max_pair_km?: number | null; traffic_factor?: number | null;
  };
  // 0167 เพิ่ม max_pair_km/traffic_factor — ยังไม่รัน = อ่านคอลัมน์เดิมแล้วใช้ค่าเริ่มต้น
  let { data: settingsRaw, error: sErr } = await sb
    .from("queue_settings")
    .select("max_pair_min,avg_speed_kmh,detour_factor,max_pair_km,traffic_factor,field_streak_warn")
    .eq("id", 1)
    .maybeSingle();
  if (sErr) {
    ({ data: settingsRaw } = await sb.from("queue_settings").select("max_pair_min,avg_speed_kmh,detour_factor").eq("id", 1).maybeSingle());
  }
  const settings = (settingsRaw ?? {}) as Settings;
  const maxPairMin = Number(settings.max_pair_min) || 45;
  const avgSpeedKmh = Number(settings.avg_speed_kmh) || 40;
  const detourFactor = Number(settings.detour_factor) || 1.3;
  // กันจับคู่ไกล (เจ้าของ 3 พ.ย.69 "ระยะทางบัคมาตลอด แก้ให้หายขาด"): ระยะเส้นตรงห้ามเกิน + เวลา ORS × ตัวคูณรถติด
  //   เคสที่พลาด: นนทบุรี→สาทร เส้นตรง 11.3 กม. ORS ~30 นาที (ถนนโล่ง) ผ่านเกณฑ์ 45 ทั้งที่จริงชั่วโมงกว่า
  const maxPairKm = Number(settings.max_pair_km) || 8;
  const trafficFactor = Number(settings.traffic_factor) || 1.5;

  // R-Zone + R-Balance: load only MAIN sales reps (ASSISTANT not auto-assigned)
  const { data: salesAll, error: e1 } = await sb
    .from("queue_sales")
    .select("*")
    .eq("active", true)
    .eq("role", "MAIN");
  if (e1) throw dbError(e1);
  let sales = (salesAll ?? []) as any[];
  if (!sales.length) throw new HttpError(422, "ยังไม่มีเซลล์ในระบบ");

  // R-Zone: filter by address province, or explicit sales_id
  if (body.sales_id) {
    // เลือกเซลล์เองมา → ใช้คนนั้น (ไม่จำกัด allowlist — ถือว่าตั้งใจเลือก)
    sales = sales.filter((s) => s.id === body.sales_id);
  } else {
    // เสนออัตโนมัติ → เฉพาะโซน + เฉพาะ ไล้/แม็ก/บาส
    const team = detectTeam(body.address, body.lat, body.lng);
    sales = sales.filter((s) => s.team === team && isAutoSales(s));
  }
  if (!sales.length) throw new HttpError(422, "ไม่มีเซลล์ที่ตรงเงื่อนไข/โซน");

  const today = iso(new Date());

  // คำนวณ base วันเริ่มหา slot
  let base: Date;
  if (body.from_date) {
    const fromDay = new Date(body.from_date + "T00:00:00Z");
    const todayDay = new Date();
    todayDay.setUTCHours(0, 0, 0, 0);
    base = fromDay > todayDay ? new Date(fromDay.getTime() - 86400000) : todayDay;
  } else {
    base = new Date();
    base.setUTCHours(0, 0, 0, 0);
  }

  // Load existing bookings: include lat/lng for R-45min check
  const { data: entriesRaw } = await sb
    .from("queue_entries")
    .select("id,sales_id,queue_date,queue_time,status,lat,lng,customer_name,address,job_type,job_size")
    .not("queue_date", "is", null)
    .neq("status", "CANCELLED")
    .gte("queue_date", new Date(new Date(today + "T00:00:00Z").getTime() - 21 * 86400000).toISOString().slice(0, 10)); // ย้อน 3 สัปดาห์ ไว้นับสายออกหน้างานติดกัน
  const entries = (entriesRaw ?? []) as {
    id: string;
    sales_id: string | null;
    queue_date: string;
    queue_time: string | null;
    status: string;
    lat: number | null;
    lng: number | null;
    customer_name: string | null;
    address: string | null;
    job_type: string | null;
    job_size: string | null;
  }[];
  type Entry = (typeof entries)[number];
  const timeMin = (t: unknown) => { const m = String(t ?? "").match(/(\d{1,2})[:.](\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 9999; };
  const toPlan = (rows: Entry[], dist: Map<string, { km: number | null; min: number | null }>): DayPlanItem[] =>
    [...rows].sort((a, b) => timeMin(a.queue_time) - timeMin(b.queue_time)).map((e) => ({
      queue_time: e.queue_time ? String(e.queue_time).slice(0, 5) : null,
      customer_name: e.customer_name ?? "",
      address: e.address ?? null,
      job_type: e.job_type ?? null,
      job_size: e.job_size ?? null,
      km: dist.get(e.id)?.km ?? null,
      min: dist.get(e.id)?.min ?? null,
    }));

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
    if (e.sales_id && e.queue_date >= today) load[e.sales_id] = (load[e.sales_id] ?? 0) + 1;
  });
  // ออกหน้างานติดกัน (เจ้าของ 12 พ.ย.69): เตือนในกล่องเสนอเมื่อเซลล์ออกติดกันมาแล้ว ≥ field_streak_warn วันทำงาน — เตือนอย่างเดียว ไม่เปลี่ยนวันที่เสนอ
  const streakWarnAt = Math.max(1, Number((settingsRaw as { field_streak_warn?: number | null } | null)?.field_streak_warn ?? 6) || 6);
  const fieldDaysBySales = new Map<string, ReturnType<typeof fieldDayMap>>();
  const streakBefore = (salesId: string, dateStr: string) => {
    let m = fieldDaysBySales.get(salesId); if (!m) { m = fieldDayMap(entries, salesId); fieldDaysBySales.set(salesId, m); }
    const prev = new Date(new Date(dateStr + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
    return fieldStreakEnding(m, prev);
  };

  const driveCache = new Map<string, number | null>();

  for (let d = 1; d <= 70; d++) {
    const day = new Date(base.getTime() + d * 86400000);
    const dow = day.getUTCDay();

    // R-Sunday: skip Sunday
    if (dow === 0) continue;
    const dateStr = iso(day);

    // R-Balance: sort by load ascending
    const ordered = [...sales].sort((a, b) => (load[a.id] ?? 0) - (load[b.id] ?? 0));

    for (const s of ordered) {
      const av = avail.filter((a) => a.sales_id === s.id && a.date === dateStr);

      if (av.some((a) => a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY" || a.kind === "WFH"))
        continue;

      const blocked = new Set<string>();
      const half2slot = (h: unknown) => (h === "PM" ? "14:00" : "10:00");
      for (const o of Array.isArray(s.office_slots) ? s.office_slots : []) {
        if (o && o.weekday === dow) blocked.add(half2slot(o.half));
      }
      for (const o of Array.isArray(s.office_overrides) ? s.office_overrides : []) {
        if (o && o.date === dateStr) {
          if (o.action === "remove") blocked.delete(half2slot(o.half));
          else blocked.add(half2slot(o.half));
        }
      }
      if (av.some((a) => a.kind === "OFFICE_HALF")) blocked.add("10:00");
      const halfLeave = av.find((a) => a.kind === "LEAVE_HALF");
      if (halfLeave) blocked.add(half2slot(halfLeave.half));

      const dayNotes: string[] = [];
      if (blocked.has("10:00")) dayNotes.push(halfLeave?.half !== "PM" && halfLeave ? "เช้า: ลาครึ่งวัน" : "เช้า: วันออฟฟิศ");
      if (blocked.has("14:00")) dayNotes.push(halfLeave?.half === "PM" ? "บ่าย: ลาครึ่งวัน" : "บ่าย: วันออฟฟิศ");
      if (isFieldTracked(s.name)) { const st = streakBefore(s.id, dateStr); if (st >= streakWarnAt) dayNotes.push(`⚠ ${s.name} ออกหน้างานติดกันมาแล้ว ${st} วันทำงาน (ถึงวันก่อนหน้า) — พิจารณาให้พักหรือลงออฟฟิศ`); }
      let slots = ["10:00", "14:00"].filter((t) => !blocked.has(t));
      if (body.job_size === "MULTI")
        slots = [...slots].sort((a, b) => (a === "14:00" ? -1 : 1) - (b === "14:00" ? -1 : 1));
      if (body.fixed_time && body.job_size !== "FULLDAY")
        slots = slots.filter((t) => t === body.fixed_time);
      if (slots.length === 0) continue;

      const dayEntries = entries.filter((e) => e.sales_id === s.id && e.queue_date === dateStr);
      // slot ที่ถูกใช้แล้ว — ดูตาม "ครึ่งวัน" ไม่ใช่เทียบข้อความเวลาตรง ๆ
      //   ⚠ บั๊กเดิม (เจ้าของเจอ 3 พ.ย.69): ไล้มีคิวเคลียร์แบบ 09:30 + 15:00 วันที่ 4/11 แต่ระบบเสนอ 10:00 ให้
      //   เพราะเทียบ usedTimes.includes("10:00") ตรง ๆ → เวลาอื่นที่ไม่ใช่ 10:00/14:00 เป๊ะ ถูกมองว่าว่าง
      //   กติกา: ก่อน 13:00 = กันช่องเช้า (10:00) · ตั้งแต่ 13:00 = กันช่องบ่าย (14:00) · ไม่มีเวลา = กันทั้งวัน
      const usedSlots = new Set<string>();
      for (const e of dayEntries) {
        const m = String(e.queue_time ?? "").match(/(\d{1,2})[:.](\d{2})/);
        if (!m) { usedSlots.add("10:00"); usedSlots.add("14:00"); continue; }
        usedSlots.add(Number(m[1]) * 60 + Number(m[2]) < 13 * 60 ? "10:00" : "14:00");
      }

      // FULLDAY: ต้องว่างทั้ง 2 slot
      if (body.job_size === "FULLDAY") {
        if (usedSlots.size === 0 && slots.length === 2) {
          return {
            queue_date: dateStr,
            queue_time: "10:00",
            sales_id: s.id,
            sales_name: s.name,
            reason: `งานเต็มวัน → ${s.name} ว่างทั้งวัน ${DOW_TH[dow]} ${dateStr}`,
            day_plan: [],
            day_notes: geoNote ? [...dayNotes, geoNote] : dayNotes,
          };
        }
        continue;
      }

      // R-2slot: slot ว่างแรก (ตามลำดับที่จัด — MULTI=บ่ายก่อน)
      const freeSlot = slots.find((t) => !usedSlots.has(t));
      if (!freeSlot) continue;

      // R-45min + R-Km: ถ้ามีคิวอื่นในวันเดียวกันอยู่แล้ว → หน้างานใหม่ต้อง "ใกล้" ทุกคิวในวันนั้น
      //   ชั้น 1 ระยะเส้นตรง ≤ max_pair_km (ไม่ต้องพึ่ง ORS) · ชั้น 2 เวลาขับ ORS × traffic_factor ≤ max_pair_min
      //   พิกัดไม่ครบ (คิวเดิมหรืองานใหม่) = ไม่จับคู่วันนั้น (ข้ามไปวันที่ว่างทั้งวัน) — กันเดาแล้วพลาด
      let pairNote = "";
      const dist = new Map<string, { km: number | null; min: number | null }>();
      if (dayEntries.length > 0) {
        const newLat = body.lat ?? null;
        const newLng = body.lng ?? null;
        if (newLat == null || newLng == null) continue;
        let ok = true;
        for (const existing of dayEntries) {
          if (existing.lat == null || existing.lng == null) { ok = false; break; }
          const a = { lat: existing.lat, lng: existing.lng };
          const b = { lat: newLat, lng: newLng };
          const km = haversineKm(a, b);
          // ชั้น 1 เส้นตรง (เจ้าของ 9 พ.ย.69 — รามคำแหง 24 → ร่มเกล้า เส้นตรง 12 กม. แต่ขับจริง 16 นาที ต้องจับคู่ได้):
          //   ≤ maxPairKm (8)        = "ใกล้"           → ใช้เกณฑ์เวลาปกติ (45 นาที)
          //   maxPairKm–2× (8–16 กม.) = "ไกลแต่ถนนเร็ว" → ต้องขับถึงไวกว่า = 2/3 ของเกณฑ์ (30 นาที) และต้องมี ORS ยืนยัน (ไม่ใช้ประมาณการ)
          //   > 2× (16 กม.)          = ไม่จับคู่
          //   เคส 3 พ.ย. นนทบุรี→สาทร 11 กม. ORS 30 นาที ×1.5 = 45 > 30 → ยังไม่จับคู่ (ถูกต้องตามที่เจ้าของต้องการ)
          if (km > maxPairKm * 2) { ok = false; break; }
          const farButFast = km > maxPairKm;
          const minCap = farButFast ? Math.round((maxPairMin * 2) / 3) : maxPairMin;
          const ck = `${a.lat},${a.lng}`;
          let orsMin: number | null;
          if (driveCache.has(ck)) orsMin = driveCache.get(ck) ?? null;
          else { orsMin = await drivingMinutes(a, b); driveCache.set(ck, orsMin); }
          let travelMin: number;
          if (orsMin == null) {
            if (farButFast) { ok = false; break; } // ไกลเส้นตรง + ไม่มีเวลาขับจริงยืนยัน → ไม่เสี่ยงจับคู่
            // ORS ใช้ไม่ได้ → ประมาณการแบบ "ระมัดระวัง" (เมืองรถติดช้ากว่า 40 km/h มาก)
            travelMin = estimateMinutes(a, b, { avgSpeedKmh: Math.min(avgSpeedKmh, 24), detourFactor: Math.max(detourFactor, 1.45) });
            console.warn("[queue/suggest] ORS ใช้ไม่ได้ — ใช้ประมาณการระยะแบบระมัดระวัง (กันจับคู่ไกล)");
          } else {
            travelMin = orsMin * trafficFactor;   // ORS = เวลาถนนโล่ง → คูณรถติดก่อนเทียบเกณฑ์
          }
          dist.set(existing.id, { km: Math.round(km * 10) / 10, min: Math.round(travelMin) });
          if (travelMin > minCap) { ok = false; break; }
          pairNote = ` · คู่กับคิว ${String(existing.queue_time ?? "").slice(0, 5)} ห่าง ${km.toFixed(1)} กม. ~${Math.round(travelMin)} นาที${farButFast ? " (ไกลเส้นตรงแต่ถนนเร็ว)" : ""}`;
        }
        if (!ok) continue;
      }

      return {
        queue_date: dateStr,
        queue_time: freeSlot,
        sales_id: s.id,
        sales_name: s.name,
        reason: `${s.name} ว่างเร็วสุด ${DOW_TH[dow]} ${dateStr} ${freeSlot.slice(0, 5)}${pairNote}`,
        day_plan: toPlan(dayEntries, dist),
        day_notes: geoNote ? [...dayNotes, geoNote] : dayNotes,
      };
    }
  }

  throw new HttpError(422, "ไม่พบช่องว่างใน 70 วันข้างหน้า — ตรวจวันลา/โควตา/ระยะทาง");
}
