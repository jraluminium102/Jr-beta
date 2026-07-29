/**
 * ตารางผลิตช่าง — "ตัวสร้างแถวกลาง" ใช้ร่วมกัน 2 ทาง เข้าเว็บหลักกับลิงก์ช่าง
 *
 *   /api/production-schedule   → ช่างที่ล็อกอิน (หน้า /production-schedule)
 *   /api/chang/<token>         → ช่างผ่านลิงก์ ไม่ต้องล็อกอิน (หน้า /chang/<token>)
 *
 * ⚠️⚠️ ห้ามเขียน query ตารางผลิตซ้ำที่อื่นเด็ดขาด — ให้เรียกไฟล์นี้เสมอ ⚠️⚠️
 *
 * ที่มา (เจ้าของแจ้ง 16 ก.ค.2569 "ลิงก์ช่างไม่อัพเดท"):
 *   เดิม 2 ทางนี้ต่างคน "ต่างเขียน query เอง" แล้วค่อย ๆ หลุดกันเงียบ ๆ จนลิงก์ช่างเพี้ยน:
 *     · งานจดเอง (adhoc_production_tasks) — เว็บหลักมี ลิงก์ช่างไม่ดึงเลย → เพิ่มงานแล้วช่างไม่เห็น
 *     · producer_note — เว็บหลักส่ง ลิงก์ช่างไม่ส่ง
 *     · งาน READY (พร้อมติดตั้ง) — เว็บหลักซ่อน ลิงก์ช่างโชว์ → ช่างเห็นงานที่เสร็จแล้วรกเต็มจอ
 *   บทเรียน: ของแบบนี้ไม่มี error ไม่มีเทสจับ รู้ตัวอีกทีคือผู้ใช้มาบอกเอง
 *   → รวมไว้ที่เดียว เพิ่มฟีลด์ทีเดียวได้ทั้ง 2 ทางพร้อมกันเสมอ
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export type ScheduleSet = Record<string, unknown>;

export type ScheduleRow = {
  kind: "job" | "adhoc";
  id: string;
  job_id: string | null;
  title: string;
  subtitle: string | null;
  job_code: string | null;
  customer_area: string | null;
  produce_date: string | null;
  /** วันกำหนดเสร็จ = หัววันในตาราง */
  due_date: string | null;
  install_date: string | null;
  producer_note: string | null;
  status: string;
  sets: ScheduleSet[];
  /** ใบตัดของงานนี้ (0094) — โชว์ชิปกดเปิดบนการ์ด (ช่าง + ออฟฟิศ) */
  cutlists: { id: number; code: string | null; name: string; status: string }[];
};

/** สถานะที่ถือว่า "อยู่ในตารางผลิต" */
export const SCHEDULE_STATUSES = ["QUEUED", "MANUFACTURING", "QC", "READY", "ISSUE"] as const;

/** คอลัมน์ชุดงานที่ช่างต้องเห็น — เพิ่มฟีลด์ใหม่ที่นี่ที่เดียว */
export const SET_COLS =
  "id, job_id, set_label, seq, design_received, frame_done, glass_installed, qc_before_glass, qc_after_glass, " +
  "glass_spec, screen_type, screen_installed, glass_order, mat_equipment, mat_alu_normal, mat_alu_painted, " +
  "frame_status, factories, measurer_name, measure_actual, must_finish_date, glass_done_date, actual_done_date, install_date, note";

/**
 * แถวตารางผลิตทั้งหมด (งานในระบบ + งานจดเอง) เรียงงานด่วนก่อน
 * @param sb  client ที่มีสิทธิ์อ่านแล้ว (ctx.supabase ของคนล็อกอิน หรือ service client ของลิงก์ช่าง)
 */
export async function buildScheduleRows(sb: Sb): Promise<ScheduleRow[]> {
  const [{ data: prods }, { data: adhoc }] = await Promise.all([
    sb.from("productions")
      .select("id, job_id, status, production_queued, production_due_date, planned_install_date, producer_note, job:job_id(job_code, customer_name, customer_area, status)")
      .in("status", SCHEDULE_STATUSES as unknown as string[]),
    sb.from("adhoc_production_tasks").select("*").neq("status", "DONE"),
  ]);

  const jobIds = (prods ?? [])
    .map((p: Record<string, unknown>) => p.job_id as string | null)
    .filter((x: string | null): x is string => !!x);

  let setsByJob: Record<string, ScheduleSet[]> = {};
  if (jobIds.length) {
    const { data: sets } = await sb
      .from("production_sets")
      .select(SET_COLS)
      .in("job_id", jobIds)
      .order("seq", { ascending: true })
      .order("id", { ascending: true });
    setsByJob = (sets ?? []).reduce((acc: Record<string, ScheduleSet[]>, s: Record<string, unknown>) => {
      (acc[s.job_id as string] ??= []).push(s);
      return acc;
    }, {});
  }

  // ใบตัดต่องาน (0094) — query แยก ถ้าตารางยังไม่มี/พัง data=null → ว่าง ไม่กระทบตารางหลัก
  type CutBrief = { id: number; code: string | null; name: string; status: string };
  let cutsByJob: Record<string, CutBrief[]> = {};
  if (jobIds.length) {
    const { data: cuts } = await sb.from("cutlists").select("id, code, name, status, job_id").in("job_id", jobIds);
    cutsByJob = (cuts ?? []).reduce((acc: Record<string, CutBrief[]>, c: Record<string, unknown>) => {
      (acc[c.job_id as string] ??= []).push({ id: c.id as number, code: (c.code as string) ?? null, name: (c.name as string) ?? "", status: (c.status as string) ?? "draft" });
      return acc;
    }, {});
  }

  // ตัดงานที่ job ถูกยกเลิก
  const jobRows: ScheduleRow[] = (prods ?? [])
    .filter((p: Record<string, unknown>) => (p.job as { status?: string } | null)?.status !== "CANCELLED")
    .map((p: Record<string, unknown>) => {
      const job = p.job as { job_code?: string; customer_name?: string; customer_area?: string } | null;
      return {
        kind: "job" as const,
        id: p.id as string,
        job_id: (p.job_id as string | null) ?? null,
        title: job?.customer_name ?? "—",
        subtitle: job?.customer_area ?? null,
        job_code: job?.job_code ?? null,
        customer_area: job?.customer_area ?? null,
        produce_date: (p.production_queued as string | null) ?? null,
        due_date: (p.production_due_date as string | null) ?? null,
        install_date: (p.planned_install_date as string | null) ?? null,
        producer_note: (p.producer_note as string | null) ?? null,
        status: p.status as string,
        sets: p.job_id ? (setsByJob[p.job_id as string] ?? []) : [],
        cutlists: p.job_id ? (cutsByJob[p.job_id as string] ?? []) : [],
      };
    });

  const adhocRows: ScheduleRow[] = (adhoc ?? []).map((a: Record<string, unknown>) => ({
    kind: "adhoc" as const,
    id: a.id as string,
    job_id: null,
    // ลูกค้าเป็นชื่อหลัก · ชื่องานเป็นบรรทัดรอง (โชว์เฉพาะเมื่อต่างจากชื่อลูกค้า กันซ้ำ)
    title: (a.customer_name as string) || (a.title as string) || "—",
    subtitle: (a.title && a.title !== a.customer_name) ? (a.title as string) : null,
    job_code: null,
    customer_area: null,
    produce_date: (a.produce_date as string | null) ?? null,
    due_date: (a.produce_date as string | null) ?? null,   // adhoc ใช้วันที่จดเองเป็นหัววัน
    install_date: (a.install_date as string | null) ?? null,
    producer_note: (a.producer_note as string | null) ?? null,
    status: (a.status as string) ?? "QUEUED",
    sets: [],
    cutlists: [],
  }));

  // งานด่วนก่อน: วันกำหนดเสร็จใกล้สุดขึ้นก่อน · ไม่มีวันไปท้าย
  return [...jobRows, ...adhocRows].sort((a, b) =>
    (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99"),
  );
}

/**
 * แถวที่ "ช่างควรเห็นในตาราง" — กติกาเดียวกันทั้งเว็บหลักและลิงก์ช่าง
 * READY (พร้อมติดตั้ง) = จบงานผลิตแล้ว หลุดไปหน้าติดตั้ง → ไม่ต้องรกตารางช่าง
 */
export const isVisibleToChang = (r: ScheduleRow) => !(r.kind === "job" && r.status === "READY");

/**
 * สร้าง "งานจดเอง" เป็นงานจริง (job + production เข้าคิวผลิต) — เจ้าของสั่ง 23 ก.ค.69
 *   งานจดเองต้องกดดูรายละเอียด/สถานะ/กระจก/แบบ/QC/ใบตัด ได้ครบเหมือนลูกค้าทั่วไป → ต้องเป็น job จริง ไม่ใช่ adhoc_production_tasks
 *   status งาน = DEPOSITED (งาน active · trigger on_deposit สร้าง production ให้) แต่ "ไม่ใส่ deposit_amount" → ไม่สร้าง finance (กันเงินปลอม)
 *   ⚠ อยู่ในไฟล์กลางนี้ (ไม่ใช่ route) เพื่อคง parity: route API ห้ามมี .from("productions") ตรง ๆ
 */
export async function createAdhocJob(
  sb: Sb,
  opts: { customer_name: string; remark: string; install_date?: string | null; produce_date?: string | null; net_amount?: number | null },
): Promise<{ id: string; job_code: string; customer_name: string }> {
  const today = new Date().toISOString().slice(0, 10);
  // net_amount (ยอดงาน · ไม่บังคับ) — กรอก = trigger calc_financials คิด vat/total ให้ (เผื่อสถิติ) · เว้น = ไม่ลงยอด
  const jobRow: Record<string, unknown> = { customer_name: opts.customer_name, status: "DEPOSITED", assess_date: today, remark: opts.remark };
  if (opts.net_amount != null && opts.net_amount > 0) jobRow.net_amount = opts.net_amount;
  const { data: job, error: jErr } = await sb
    .from("jobs")
    .insert(jobRow)
    .select("id, job_code, customer_name")
    .single();
  if (jErr || !job) throw new Error(jErr?.message ?? "สร้างงานไม่สำเร็จ");
  // เริ่มที่ "กำลังผลิต" เลย (เจ้าของสั่ง 23 ก.ค.69: งานจดเองมักเพิ่มตอนกำลังทำอยู่แล้ว ไม่ต้องกด "เริ่มผลิต" ซ้ำ)
  //   ข้ามวัด/ประชุม/รอลงผลิต · upsert เผื่อ trigger สร้าง/ไม่สร้าง production
  const { error: pErr } = await sb
    .from("productions")
    .upsert({
      job_id: job.id, status: "MANUFACTURING",
      planned_install_date: opts.install_date || null,
      production_due_date: opts.produce_date || null,
      production_queued: today,
      status_updated_at: new Date().toISOString(),
    }, { onConflict: "job_id" });
  if (pErr) throw new Error("สร้างคิวผลิตไม่สำเร็จ: " + pErr.message);
  return job as { id: string; job_code: string; customer_name: string };
}
