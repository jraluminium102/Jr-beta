import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createServiceClient } from "@/lib/supabase/admin";
import { detectTeam } from "@/lib/queue";
import { STAGE_NAMES } from "@/lib/stages";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// สถานะที่ "ผ่านมัดจำแล้ว" — ตัดออกจากมุมมองรอติดตามงาน (ส่งใบเสนอแล้ว)
const POST_DEPOSIT = ["DEPOSITED", "IN_PRODUCTION", "INSTALLING", "COMPLETED", "CANCELLED"];

const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

const monthKey = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
};

// GET /api/operations — ภาพรวมงาน (dashboard สถานะลูกค้าตลอดสายงาน)
//   1. รอเข้าประเมิน (นับอย่างเดียว) แยก กทม / ภาคใต้
//   2. รอติดตามงาน (ส่งใบเสนอแล้ว ยังไม่มัดจำ ยังไม่ยกเลิก) แยกตามเดือน
//   3. เฟสรอผลิต (พึ่งมัดจำ stage 8) · 4. เฟสผลิต (9-19) · 5. เฟสติดตั้ง (20-24)
//   6. จบงานแล้ว (COMPLETED) — count (รายการเต็มดูที่ /api/operations/completed)
// ใช้ service client อ่านรวมทั้งระบบ (ตัวเลขภาพรวมสำหรับผู้บริหาร ไม่โดน RLS scope ราย sales)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("dashboard", "read");
  // ยอดเงิน (net) โชว์เฉพาะ role ที่เห็นฟิลด์การเงินได้ (ADMIN/SALES/ACCOUNTING) — role อื่น redact เป็น null
  const showNet = can(ctx.role, "jobs:finance_fields", "read");
  const sb = createServiceClient() as unknown as { from: (t: string) => Any };

  // แยก query ตามมุมมอง — กัน Supabase 1000-row cap (jobs COMPLETED สะสมไม่จำกัด)
  //   · queue: เฉพาะที่ยังรอ · sent: เฉพาะที่ส่งใบเสนอ+ยังไม่ผ่านมัดจำ · pipeline: เฉพาะ active stage 8-24
  //   · completed: นับหัวอย่างเดียว (head count ไม่ดึงแถว)
  const [queueR, sentR, pipeR, completedR] = await Promise.all([
    // คิวรอเข้าประเมิน — ยังไม่ถึงคิว/ยังไม่ประเมิน
    sb.from("queue_entries")
      .select("id, address, lat, lng, status, queue_date")
      .in("status", ["PENDING", "PROPOSED", "CONFIRMED"]),
    // รอติดตามงาน: ส่งใบเสนอแล้ว (quote_sent_date ไม่ว่าง) และยังไม่ผ่านมัดจำ/ยกเลิก
    sb.from("jobs")
      .select("id, status, quote_sent_date, net_amount")
      .not("quote_sent_date", "is", null)
      .not("status", "in", `(${POST_DEPOSIT.join(",")})`),
    // pipeline: งาน active (ไม่จบ/ไม่ยกเลิก) ที่ current_stage 8-24 — ก้อนเล็ก bounded
    //   embed production/installation timestamp ไว้คำนวณ "ค้างในเฟส" ให้แม่นกว่า jobs.updated_at
    sb.from("jobs")
      .select(
        "id, job_code, customer_name, customer_tel, customer_area, status, current_stage, on_hold, updated_at, " +
        "productions(status_updated_at), installations(updated_at)"
      )
      .not("status", "in", "(CANCELLED,COMPLETED)")
      .gte("current_stage", 8)
      .lte("current_stage", 24),
    // จบงานแล้ว — นับอย่างเดียว
    sb.from("jobs").select("id", { count: "exact", head: true }).eq("status", "COMPLETED"),
  ]);

  const Q = (queueR.data ?? []) as Any[];
  const sentJobs = (sentR.data ?? []) as Any[];
  const pipeline = (pipeR.data ?? []) as Any[];
  const completedCount = (completedR.count as number | null) ?? 0;

  // ── 1. รอเข้าประเมิน — แยกสาขา ────────────────────────────────────────────
  // "ถึงคิวแล้วตัดออก" — เอาเฉพาะที่ยังไม่ถึงวัน (queue_date ว่าง หรือ >= วันนี้ เวลาไทย)
  const todayTH = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  let bkk = 0, south = 0;
  for (const q of Q) {
    if (q.queue_date && String(q.queue_date).slice(0, 10) < todayTH) continue; // ผ่านวันประเมินแล้ว
    const team = detectTeam(q.address, q.lat, q.lng);
    if (team === "PHUKET") south++; else bkk++;
  }
  const assess = { bkk, south, total: bkk + south };

  // ── 2. รอติดตามงาน (ส่งใบเสนอแล้ว ยังไม่มัดจำ ยังไม่ยกเลิก) ─────────────────
  // sentJobs กรองมาจาก DB แล้ว — bucket ตามเดือนของ quote_sent_date
  const monthMap = new Map<string, { count: number; net: number }>();
  for (const j of sentJobs) {
    const k = monthKey(j.quote_sent_date);
    if (!k) continue;
    const e = monthMap.get(k) ?? { count: 0, net: 0 };
    e.count++;
    e.net += Number(j.net_amount) || 0;
    monthMap.set(k, e);
  }
  const byMonth = [...monthMap.entries()]
    .map(([month, v]) => ({ month, count: v.count, net: showNet ? v.net : null }))
    .sort((a, b) => (a.month < b.month ? 1 : -1)); // ล่าสุดก่อน
  const followup = { total: sentJobs.length, byMonth };

  // ── 3-5. เฟส pipeline (active งานที่ยังไม่จบ/ยกเลิก) ─────────────────────────
  // "ค้างในเฟส" — ใช้ timestamp เฉพาะทาง (production.status_updated_at / installation.updated_at)
  //   ก่อน fallback jobs.updated_at กัน false-reset จากการแก้ note/เบอร์ (บทเรียนจาก followup.phaseSince)
  const phaseSince = (j: Any): string | null => {
    const inst = Array.isArray(j.installations) ? j.installations : j.installations ? [j.installations] : [];
    const prod = Array.isArray(j.productions) ? j.productions : j.productions ? [j.productions] : [];
    return inst[0]?.updated_at || prod[0]?.status_updated_at || j.updated_at || null;
  };
  const mapJob = (j: Any) => ({
    id: j.id as string,
    job_code: (j.job_code as string | null) ?? null,
    customer_name: j.customer_name as string,
    customer_tel: (j.customer_tel as string | null) ?? null,
    customer_area: (j.customer_area as string | null) ?? null,
    current_stage: Number(j.current_stage) || 0,
    stage_name: STAGE_NAMES[Number(j.current_stage)] ?? `ขั้น ${j.current_stage}`,
    on_hold: !!j.on_hold,
    days: daysSince(phaseSince(j)),
  });
  const byStale = (a: { days: number }, b: { days: number }) => b.days - a.days;

  const awaitProd = pipeline.filter((j) => Number(j.current_stage) === 8).map(mapJob).sort(byStale);
  const producing = pipeline
    .filter((j) => Number(j.current_stage) >= 9 && Number(j.current_stage) <= 19)
    .map(mapJob).sort(byStale);
  const installing = pipeline
    .filter((j) => Number(j.current_stage) >= 20 && Number(j.current_stage) <= 24)
    .map(mapJob).sort(byStale);

  // ── 6. จบงานแล้ว — completedCount (head count) มาจาก query ด้านบน ──────────────

  return ok({
    assess,
    followup,
    phases: {
      awaitProd: { count: awaitProd.length, jobs: awaitProd },
      producing: { count: producing.length, jobs: producing },
      installing: { count: installing.length, jobs: installing },
    },
    completed: { count: completedCount },
  });
});
