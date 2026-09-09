import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";

// GET /api/install-plan?from=YYYY-MM-DD&to=YYYY-MM-DD
// คืน { teams, assignments(ในช่วง+ข้อมูลงาน), ready(งานผลิตเสร็จ รอจัดคิว) }
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("installation", "read");
  const u = new URL(req.url);
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  if (!from || !to) return err("ต้องระบุ from/to", 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;

  const SCHED = ["QUEUED", "MANUFACTURING", "QC", "READY", "ISSUE"];
  const [teamsR, asgR, readyR, prodBookR, adhocBookR, producingR] = await Promise.all([
    sb.from("install_teams").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    sb.from("install_assignments").select("*, jobs(*)").gte("date", from).lte("date", to).order("date", { ascending: true }),
    sb.from("installations").select("id, job_id, status, install_scheduled, jobs(*)").eq("status", "PENDING"),
    // "จองจากผลิต" — งานในระบบที่ตั้งวันติดตั้งตอนผลิต (planned_install_date) ในช่วงเดือนนี้ (0021/0024)
    sb.from("productions").select("id, job_id, planned_install_date, status, job:job_id(job_code, customer_name, customer_area, status)")
      .not("planned_install_date", "is", null).gte("planned_install_date", from).lte("planned_install_date", to).in("status", SCHED),
    // "จองจากผลิต" — งานจดเอง (adhoc) ที่ตั้งวันติดตั้ง
    sb.from("adhoc_production_tasks").select("id, title, customer_name, install_date, status")
      .not("install_date", "is", null).gte("install_date", from).lte("install_date", to).neq("status", "DONE"),
    // งานที่ "ยังผลิตไม่เสร็จ" (กำลังผลิต/รอลงผลิต) และยังไม่ตั้งวันติดตั้ง → จองคิวล่วงหน้าได้ (เจ้าของสั่ง 23 ก.ค.69)
    sb.from("productions").select("id, job_id, status, production_due_date, job:job_id(job_code, customer_name, customer_area, status)")
      .is("planned_install_date", null).in("status", ["QUEUED", "MANUFACTURING"]),
  ]);

  // ── งานที่มี "ใบเสนอราคาในระบบ" เท่านั้น (เจ้าของสั่ง: งานไม่มีใบเสนอ ไม่ต้องแสดง) ──
  //   + ชุดงาน (production_sets) ของงานที่พร้อมติดตั้ง → "รอลง (รายชุด)"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobIdsAll = [...new Set([
    ...((readyR.data ?? []) as any[]).map((r) => r.job_id),
    ...((prodBookR.data ?? []) as any[]).map((r) => r.job_id),
    ...((producingR.data ?? []) as any[]).map((r) => r.job_id),
  ].filter(Boolean))] as string[];

  let quoteJobIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let readySets: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let readyToClose: any[] = [];
  if (jobIdsAll.length) {
    const [quosR, setsR, setAsgR] = await Promise.all([
      sb.from("quotations").select("job_id").in("job_id", jobIdsAll).neq("status", "cancelled"),
      sb.from("production_sets").select("id, job_id, set_label, install_status, hold, hold_reason").in("job_id", jobIdsAll),
      sb.from("install_assignments").select("production_set_id").in("job_id", jobIdsAll).not("production_set_id", "is", null),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quoteJobIds = new Set(((quosR.data ?? []) as any[]).map((q) => q.job_id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignedSetIds = new Set(((setAsgR.data ?? []) as any[]).map((a) => a.production_set_id));
    // job → ชื่อลูกค้า/รหัส (เอาจาก ready ก่อน ไม่งั้นจาก booked)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobMeta = new Map<string, any>();
    for (const r of (readyR.data ?? []) as any[]) if (r.job_id && !jobMeta.has(r.job_id)) jobMeta.set(r.job_id, r.jobs);   // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const r of (prodBookR.data ?? []) as any[]) if (r.job_id && !jobMeta.has(r.job_id)) jobMeta.set(r.job_id, r.job); // eslint-disable-line @typescript-eslint/no-explicit-any
    readySets = ((setsR.data ?? []) as any[])   // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter((s) => s.install_status !== "INSTALLED" && !assignedSetIds.has(s.id) && quoteJobIds.has(s.job_id))
      .map((s) => ({
        id: s.id, job_id: s.job_id, set_label: s.set_label || "(ไม่มีชื่อชุด)",
        hold: s.hold ? (String(s.hold_reason || "").trim() || "พักงาน") : "",   // เหตุผล hold (text) ไม่ใช่ boolean
        customer_name: jobMeta.get(s.job_id)?.customer_name ?? "",
        job_code: jobMeta.get(s.job_id)?.job_code ?? null,
        customer_area: jobMeta.get(s.job_id)?.customer_area ?? null,
      }));

    // งานที่ "ติดตั้งครบทุกชุดแล้ว + ไม่มี hold" → รอปิดงาน (แก้ H1: หลังปิดชุดครบต้องมีทางปิดงาน)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byJobSets = new Map<string, { total: number; installed: number; hold: number }>();
    for (const s of (setsR.data ?? []) as any[]) {   // eslint-disable-line @typescript-eslint/no-explicit-any
      const g = byJobSets.get(s.job_id) ?? { total: 0, installed: 0, hold: 0 };
      g.total++; if (s.install_status === "INSTALLED") g.installed++; if (s.hold) g.hold++;
      byJobSets.set(s.job_id, g);
    }
    readyToClose = ((readyR.data ?? []) as any[])   // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter((r) => r.job_id && quoteJobIds.has(r.job_id))
      .filter((r) => { const g = byJobSets.get(r.job_id); return g && g.total > 0 && g.installed === g.total && g.hold === 0; })
      .map((r) => ({ job_id: r.job_id, customer_name: r.jobs?.customer_name ?? "", job_code: r.jobs?.job_code ?? null, customer_area: r.jobs?.customer_area ?? null }));
  }
  // งานที่ไม่มีใบเสนอในระบบ = ซ่อน (เฉพาะงานในระบบ · adhoc/คิวนอกระบบไม่แตะ)
  const hasQuote = (jobId: string | null) => !jobId || quoteJobIds.has(jobId);

  // งานที่ถูกจัดคิวติดตั้งจริงแล้ว (มีแถว install_assignments) → ไม่ต้องโชว์ overlay "จองจากผลิต" ซ้ำ
  const assignedJobIds = new Set((asgR.data ?? []).map((a: { job_id: string | null }) => a.job_id).filter(Boolean));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const booked = [
    ...((prodBookR.data ?? []) as any[])
      .filter((p) => p.job && p.job.status !== "CANCELLED" && !assignedJobIds.has(p.job_id) && hasQuote(p.job_id))
      .map((p) => ({ kind: "job" as const, id: p.id, job_id: p.job_id, date: p.planned_install_date, customer_name: p.job.customer_name, job_code: p.job.job_code, customer_area: p.job.customer_area, prod_status: p.status })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((adhocBookR.data ?? []) as any[])
      .map((a) => ({ kind: "adhoc" as const, id: a.id, job_id: null, date: a.install_date, customer_name: a.customer_name || a.title, job_code: null, customer_area: null, prod_status: a.status })),
  ];

  // งานกำลังผลิต/รอลงผลิต ที่ยังไม่ตั้งวัน → บับเบิ้ล "จองล่วงหน้า" (ตัดงาน CANCELLED + งานที่ลงคิวจริงแล้ว)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const producing = ((producingR.data ?? []) as any[])
    .filter((p) => p.job && p.job.status !== "CANCELLED" && !assignedJobIds.has(p.job_id) && hasQuote(p.job_id))
    .map((p) => ({
      id: p.id, job_id: p.job_id, prod_status: p.status, due_date: p.production_due_date,
      customer_name: p.job.customer_name, job_code: p.job.job_code, customer_area: p.job.customer_area,
    }));

  return ok({
    teams: teamsR.data ?? [],
    assignments: asgR.data ?? [],
    // ready = งานพร้อมติดตั้ง เฉพาะที่มีใบเสนอในระบบ (ซ่อนงานไม่มีใบเสนอ)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ready: ((readyR.data ?? []) as any[]).filter((r) => hasQuote(r.job_id)),
    readySets,   // ชุดที่ยังไม่ลงคิว → "รอลง (รายชุด)"
    readyToClose,   // งานที่ติดตั้งครบทุกชุดแล้ว รอปิดงาน
    booked,
    producing,
  });
});
