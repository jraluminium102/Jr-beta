import { z } from "zod";
import { requirePermission, HttpError } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { detectTeam, estimateMinutes, haversineKm } from "@/lib/queue";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

const schema = z.object({
  sales_id: z.string().uuid().nullish(),
  job_size: z.enum(["SINGLE", "MULTI", "FULLDAY"]).nullish(),
  address: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
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
    const team = detectTeam(body.address);
    sales = sales.filter((s) => s.team === team);
  }
  if (!sales.length) throw new HttpError(422, "ไม่มีเซลล์ที่ตรงเงื่อนไข/โซน");

  const today = iso(new Date());

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

  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);

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
      // R-Leave: check availability restrictions for this date
      const av = avail.filter((a) => a.sales_id === s.id && a.date === dateStr);

      // Full day leave or holiday → skip entirely
      if (av.some((a) => a.kind === "LEAVE_FULL" || a.kind === "HOLIDAY"))
        continue;

      // Determine available slots based on partial leave / office half
      let slots = ["10:00", "14:00"];
      if (av.some((a) => a.kind === "OFFICE_HALF")) slots = ["14:00"]; // morning in office
      const halfLeave = av.find((a) => a.kind === "LEAVE_HALF");
      if (halfLeave)
        slots = halfLeave.half === "PM" ? ["10:00"] : ["14:00"]; // PM leave → only AM

      // Existing bookings for this sales rep on this date
      const dayEntries = entries.filter(
        (e) => e.sales_id === s.id && e.queue_date === dateStr
      );
      const usedTimes = dayEntries.map((e) => e.queue_time);

      // FULLDAY: need both slots free
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

      // R-2slot: find first free slot
      const freeSlot = slots.find((t) => !usedTimes.includes(t));
      if (!freeSlot) continue; // both slots taken

      // R-45min: if this would be the 2nd booking on that day, check travel time
      // Only applies when there is exactly 1 existing booking already
      if (dayEntries.length === 1) {
        const existing = dayEntries[0];
        const newLat = body.lat ?? null;
        const newLng = body.lng ?? null;

        // If either booking lacks coordinates → do NOT block (R-45min: skip check)
        if (
          existing.lat != null &&
          existing.lng != null &&
          newLat != null &&
          newLng != null
        ) {
          const travelMin = estimateMinutes(
            { lat: existing.lat, lng: existing.lng },
            { lat: newLat, lng: newLng },
            { avgSpeedKmh, detourFactor }
          );
          // R-45min: travel time exceeds max_pair_min → skip this slot
          if (travelMin > maxPairMin) continue;
        }
      }

      return ok({
        queue_date: dateStr,
        queue_time: freeSlot,
        sales_id: s.id,
        sales_name: s.name,
        reason: `${s.name} ว่างเร็วสุด ${DOW_TH[dow]} ${dateStr} ${freeSlot === "10:00" ? "(เช้า)" : "(บ่าย)"}`,
      });
    }
  }

  throw new HttpError(
    422,
    "ไม่พบช่องว่างใน 70 วันข้างหน้า — ตรวจวันลา/โควตา/ระยะทาง"
  );
});
