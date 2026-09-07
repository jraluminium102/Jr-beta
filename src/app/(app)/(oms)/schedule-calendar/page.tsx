import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ScheduleCalendarClient, { type CalItem } from "./ScheduleCalendarClient";

export const dynamic = "force-dynamic";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ?m=YYYY-MM → {y, m0(0-11)} · ไม่ถูกต้อง → เดือนปัจจุบัน */
function parseMonth(m?: string): { y: number; m0: number } {
  const mm = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  if (mm) {
    const y = Number(mm[1]); const m0 = Number(mm[2]) - 1;
    if (y >= 2000 && y <= 2100 && m0 >= 0 && m0 <= 11) return { y, m0 };
  }
  const now = new Date();
  return { y: now.getFullYear(), m0: now.getMonth() };
}

// normalize เวลา "9.00"/"09:00:00" → "HH:MM" (floor ใช้ "HH:MM", measure_time อาจเป็น "9.30")
function normTime(v?: string | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const m = s.replace(".", ":").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${pad2(Number(m[1]))}:${m[2]}` : "";
}

/**
 * /schedule-calendar — ปฏิทินเดือนรวม "นัดวัดจริง" (measure) + "จัดคิวงานพื้น" (floor) ที่นัดวันแล้ว
 *   ดูอย่างเดียว · กดที่นัด → ไปหน้าต้นทาง (นัดวัดจริง/จัดคิวงานพื้น) · เลือกเดือนด้วย ?m=YYYY-MM
 */
export default async function ScheduleCalendarPage({ searchParams }: { searchParams: { m?: string } }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { y, m0 } = parseMonth(searchParams.m);
  const start = `${y}-${pad2(m0 + 1)}-01`;
  const nextY = m0 === 11 ? y + 1 : y;
  const nextM0 = m0 === 11 ? 0 : m0 + 1;
  const nextStart = `${nextY}-${pad2(nextM0 + 1)}-01`;

  const sb = createClient();

  // นัดวัดจริง (productions.measure_scheduled ในเดือนนี้) — ตัดงานยกเลิก
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prods } = await (sb as any)
    .from("productions")
    .select("id, job_id, status, measure_scheduled, measure_time, measurer_name, measurer:measurer_id(full_name), job:job_id(job_code, customer_name, customer_area, status, floor_work)")
    .in("status", ["PENDING_MEASURE", "MEASURED"])
    .gte("measure_scheduled", start)
    .lt("measure_scheduled", nextStart);

  // จัดคิวงานพื้น (floor_queue_entries ที่ลงวันแล้ว) — bucket scheduled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: floors } = await (sb as any)
    .from("floor_queue_entries")
    .select("id, customer_name, duration_note, extra_note, scheduled_date, start_time, bucket, job:job_id(job_code, customer_name)")
    .eq("bucket", "scheduled")
    .gte("scheduled_date", start)
    .lt("scheduled_date", nextStart);

  const items: CalItem[] = [];

  for (const p of (prods ?? []) as Record<string, unknown>[]) {
    const job = p.job as { customer_name?: string; customer_area?: string | null; status?: string; floor_work?: string | null } | null;
    if (job?.status === "CANCELLED") continue;
    const measurer = (p.measurer_name as string) || ((p.measurer as { full_name?: string } | null)?.full_name ?? "");
    items.push({
      id: `m${p.id}`,
      type: "measure",
      date: String(p.measure_scheduled),
      time: normTime(p.measure_time as string),
      title: job?.customer_name || "-",
      sub: [job?.customer_area || "", measurer ? `ผู้วัด: ${measurer}` : ""].filter(Boolean).join(" · "),
      done: p.status === "MEASURED",
      href: "/measure-schedule",
    });
  }

  for (const f of (floors ?? []) as Record<string, unknown>[]) {
    const job = f.job as { customer_name?: string } | null;
    items.push({
      id: `f${f.id}`,
      type: "floor",
      date: String(f.scheduled_date),
      time: normTime(f.start_time as string),
      title: (f.customer_name as string) || job?.customer_name || "-",
      sub: [f.duration_note as string, f.extra_note as string].filter(Boolean).join(" · "),
      done: false,
      href: "/floor-queue",
    });
  }

  // "วันนี้" ตามเวลาไทย (server เป็น UTC — บวก 7 ชม. กันเพี้ยน 1 วันช่วงเที่ยงคืน)
  const todayIso = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <ScheduleCalendarClient
      year={y}
      month0={m0}
      items={items}
      prevKey={`${m0 === 0 ? y - 1 : y}-${pad2((m0 === 0 ? 11 : m0 - 1) + 1)}`}
      nextKey={`${nextY}-${pad2(nextM0 + 1)}`}
      todayIso={todayIso}
    />
  );
}
