import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { CHECKLIST_MARKER } from "@/lib/checklist-marker";
import { buildSalesResolver } from "@/lib/sales-resolve";

export const dynamic = "force-dynamic";

export type ChecklistQuotation = {
  id: number;
  code: string;
  net: number;
  status: string;
  note: string;
  vat_rate: number;
};

export type ChecklistStage = "in_design" | "pending" | "drafted" | "sent";

export type ChecklistItem = {
  job_id: string;
  job_code: string | null;
  customer_id: number | null;
  customer_name: string;
  customer_area: string | null;
  assess_date: string | null;
  design_state: string;
  design_end: string | null;
  job_status: string;
  quotation: ChecklistQuotation | null;
  // ฟิลด์ใหม่
  stage: ChecklistStage;
  delivery_due: string | null;
  designer_name: string | null;
  estimator_name: string | null;
  sales_name: string | null;   // เซลล์ที่ไปดูหน้างาน (estimator หรือ fallback จากคิว)
  quote_sent_date: string | null;
  onsite_deposit: boolean; // (0044) ป้ายมัดจำหน้างาน · ด่วน
  on_hold: boolean;
  on_hold_reason: string | null;
  revised: boolean;       // มาจากการแก้แบบ (อยู่ใน active เพราะถูกแก้)
  revise_count: number;   // จำนวนรอบแก้แบบ
};

export type ChecklistData = {
  active: ChecklistItem[];
  sent:   ChecklistItem[];
  held:   ChecklistItem[];
};

// ---------- helpers ----------

/**
 * คำนวณวันทำการ n วัน (ข้ามเฉพาะอาทิตย์) นับจากวันถัดจาก isoStart
 * เสาร์นับเป็นวันทำการ
 * ใช้ UTC ตลอดเพื่อกัน timezone offset ทำให้ toISOString() ผิดวัน
 */
function addWorkingDaysSkipSunday(isoStart: string, n: number): string {
  const [y, m, day] = isoStart.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) added++; // 0 = Sunday
  }
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/quotation-checklist
 *
 * คืน 2 กลุ่ม:
 *  active — งานในไปป์ไลน์ก่อนส่ง (in_design + pending + drafted) เรียงตาม delivery_due asc, null ท้าย
 *  sent   — ส่งใบเสนอแล้ว รอมัดจำ (stage = sent)
 *
 * ดึงทุกงาน pre-deposit (ตัด DEPOSITED,IN_PRODUCTION,INSTALLING,COMPLETED,CANCELLED ออก)
 */
export const GET = withRoute(async () => {
  const ctx = await requirePermission("jobs", "read");

  // ใช้ createClient() untyped เพราะ Database type ไม่มี quotations/customers/profiles join
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createClient() as any;

  const canWrite = can(ctx.role, "jobs", "write");
  const today = new Date().toISOString().slice(0, 10);

  // โหลดงาน pre-deposit (ไม่รวม DEPOSITED ขึ้นไป)
  // ข้อยกเว้น (0044): งาน onsite_deposit ที่ยังไม่ส่งใบเสนอ → ดึงกลับเข้ามาแม้ status = DEPOSITED
  const { data: jobs, error: jErr } = await sb
    .from("jobs")
    .select(
      "id, job_code, customer_id, customer_name, customer_area, assess_date, design_state, design_end, design_revise_count, quoted_revise_count, status, designer_ref, quote_sent_date, queue_entry_id, onsite_deposit, on_hold, on_hold_reason, estimator:estimator_id(full_name), designer_lookup:designer_ref(name)"
    )
    .or(
      "status.not.in.(DEPOSITED,IN_PRODUCTION,INSTALLING,COMPLETED,CANCELLED)," +
      "and(onsite_deposit.eq.true,quote_sent_date.is.null)"
    )
    .order("assess_date", { ascending: false })
    .limit(500);
  if (jErr) throw new Error(jErr.message);

  type EstimatorJoin = { full_name: string } | null;
  type DesignerJoin  = { name: string } | null;

  type JobRow = {
    id: string;
    job_code: string | null;
    customer_id: number | null;
    customer_name: string;
    customer_area: string | null;
    assess_date: string | null;
    design_state: string;
    design_end: string | null;
    design_revise_count: number | null;
    quoted_revise_count: number | null;
    status: string;
    designer_ref: number | null;
    quote_sent_date: string | null;
    queue_entry_id: string | null;
    onsite_deposit: boolean; // (0044)
    on_hold: boolean;
    on_hold_reason: string | null;
    estimator: EstimatorJoin;
    designer_lookup: DesignerJoin;
  };

  const jobRows = (jobs ?? []) as JobRow[];
  const salesOf = await buildSalesResolver(sb);   // เซลล์ที่ไปดู (estimator → คิว)

  if (jobRows.length === 0) {
    return ok<ChecklistData>(
      { active: [], sent: [], held: [] },
      { can_write: canWrite, counts: { in_design: 0, pending: 0, drafted: 0, sent: 0, held: 0 }, overdue: 0, due_soon: 0 }
    );
  }

  const jobIds = jobRows.map((j) => j.id);

  // โหลดใบเสนอราคาที่มี marker (ยกเว้น cancelled)
  const { data: quotations, error: qErr } = await sb
    .from("quotations")
    .select("id, code, net, status, note, job_id, vat_rate")
    .in("job_id", jobIds)
    .ilike("note", `${CHECKLIST_MARKER}%`)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (qErr) throw new Error(qErr.message);

  type QuotRow = { id: number; code: string; net: number; status: string; note: string; job_id: string; vat_rate: number };

  // map: job_id → ใบเช็คลิสต์ล่าสุด
  const qMap = new Map<string, ChecklistQuotation>();
  for (const q of (quotations ?? []) as QuotRow[]) {
    if (!qMap.has(q.job_id)) {
      qMap.set(q.job_id, {
        id: q.id, code: q.code, net: q.net, status: q.status, note: q.note,
        vat_rate: Number(q.vat_rate ?? 7),
      });
    }
  }

  // วันถัดไป 2 วัน (calendar) สำหรับ due_soon — ใช้ UTC กัน timezone offset
  const dueSoonEnd = (() => {
    const [y, m, day] = today.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, day));
    d.setUTCDate(d.getUTCDate() + 2);
    return d.toISOString().slice(0, 10);
  })();

  const active: ChecklistItem[] = [];
  const sent:   ChecklistItem[] = [];
  const held:   ChecklistItem[] = [];
  let countInDesign = 0, countPending = 0, countDrafted = 0, countSent = 0, countHeld = 0;
  let overdue = 0, dueSoon = 0;

  for (const j of jobRows) {
    const q = qMap.get(j.id) ?? null;

    // คำนวณ delivery_due
    const delivery_due = j.assess_date
      ? addWorkingDaysSkipSunday(j.assess_date, 5)
      : null;

    // ชื่อนักออกแบบ / เซลล์
    const designer_name  = (j.designer_lookup as DesignerJoin)?.name  ?? null;
    const estimator_name = (j.estimator as EstimatorJoin)?.full_name   ?? null;
    const sales_name = salesOf({ id: j.id, queue_entry_id: j.queue_entry_id, customer_name: j.customer_name, estimator_name });

    // งาน on_hold → ใส่ held ข้ามทุก stage
    if (j.on_hold) {
      // ใช้ stage ปัจจุบัน (คำนวณเดิม) เพื่อ context ตอน unhold
      let heldStage: ChecklistStage = "pending";
      if (j.design_state !== "DONE") heldStage = "in_design";
      else if (q && ["sent", "approved"].includes(q.status)) heldStage = "sent";
      else if (q && q.status === "draft") heldStage = "drafted";

      held.push({
        job_id:        j.id,
        job_code:      j.job_code,
        customer_id:   j.customer_id ?? null,
        customer_name: j.customer_name,
        customer_area: j.customer_area,
        assess_date:   j.assess_date,
        design_state:  j.design_state,
        design_end:    j.design_end,
        job_status:    j.status,
        quotation:     q,
        stage:         heldStage,
        delivery_due,
        designer_name,
        estimator_name,
        sales_name,
        quote_sent_date: j.quote_sent_date,
        onsite_deposit: j.onsite_deposit ?? false,
        revised: j.design_state === "REVISING",
        revise_count: j.design_revise_count ?? 0,
        on_hold: true,
        on_hold_reason: j.on_hold_reason ?? null,
      });
      countHeld++;
      continue;
    }

    // ── ตรวจ "แก้แบบ" ───────────────────────────────────────────────
    // design_revise_count +1 ทุกครั้งที่เข้า REVISING
    // quoted_revise_count = ค่า ณ ตอนส่งใบเสนอล่าสุด (0047) — snapshot ไม่อิงวันที่
    // แบบถูกแก้ "หลัง" ส่งใบเสนอ → ต้องทำใบเสนอใหม่ → กลับเข้า active
    // (กันเคส same-day ที่เทียบ design_end > quote_sent_date ไม่ได้ เช่น JR2026-159)
    const reviseCount = j.design_revise_count ?? 0;
    const needsRequote = reviseCount > (j.quoted_revise_count ?? 0);
    // ป้าย "มาจากแก้แบบ" — โผล่ใน active เพราะกำลังแก้ หรือแบบแก้แล้วรอทำใบเสนอใหม่
    const revised = j.design_state === "REVISING" || needsRequote;

    // จัด stage
    let stage: ChecklistStage;
    if (j.design_state !== "DONE") {
      // ฝ่ายแบบกำลังทำงาน — ทุกสถานะที่ยังไม่ DONE
      // (NOT_STARTED / DRAWING / PENDING_CUSTOMER / REVISING)
      // → เด้งเข้า active เสมอ ทั้งงานสร้างใหม่และงานที่ส่งกลับแก้ แม้เคยส่งใบเสนอแล้ว
      stage = "in_design";
    } else if (needsRequote) {
      // แบบเสร็จแล้ว (DONE) แต่ถูกแก้หลังส่งใบเสนอ → ใบเสนอเก่า ต้องทำใหม่ (กลับเข้า active)
      stage = q ? "drafted" : "pending";
    } else if (q && ["sent", "approved"].includes(q.status)) {
      stage = "sent";
    } else if (q && q.status === "draft") {
      stage = "drafted";
    } else if (
      ["LEAD", "PENDING_QUOTE", "QUOTE_SENT", "PENDING_DECISION"].includes(j.status)
    ) {
      stage = "pending";
    } else {
      // ไม่เข้าเงื่อนไขใด (edge case เช่น status ที่ไม่ตรงกับ pre-deposit แต่ผ่าน filter มาได้)
      continue;
    }

    const item: ChecklistItem = {
      job_id:        j.id,
      job_code:      j.job_code,
      customer_id:   j.customer_id ?? null,
      customer_name: j.customer_name,
      customer_area: j.customer_area,
      assess_date:   j.assess_date,
      design_state:  j.design_state,
      design_end:    j.design_end,
      job_status:    j.status,
      quotation:     q,
      stage,
      delivery_due,
      designer_name,
      estimator_name,
      sales_name,
      quote_sent_date: j.quote_sent_date,
      onsite_deposit: j.onsite_deposit ?? false, // (0044)
      revised,
      revise_count: reviseCount,
      on_hold: false,
      on_hold_reason: null,
    };

    if (stage === "sent") {
      sent.push(item);
      countSent++;
    } else {
      active.push(item);
      if (stage === "in_design") countInDesign++;
      else if (stage === "pending") countPending++;
      else if (stage === "drafted") countDrafted++;

      // นับ overdue / due_soon สำหรับ active
      if (delivery_due) {
        if (delivery_due < today) overdue++;
        else if (delivery_due <= dueSoonEnd) dueSoon++;
      }
    }
  }

  // เรียง active ตาม delivery_due asc, null ไปท้ายสุด
  active.sort((a, b) => {
    if (!a.delivery_due && !b.delivery_due) return 0;
    if (!a.delivery_due) return 1;
    if (!b.delivery_due) return -1;
    return a.delivery_due.localeCompare(b.delivery_due);
  });

  // เรียง sent ตาม delivery_due asc เช่นกัน
  sent.sort((a, b) => {
    if (!a.delivery_due && !b.delivery_due) return 0;
    if (!a.delivery_due) return 1;
    if (!b.delivery_due) return -1;
    return a.delivery_due.localeCompare(b.delivery_due);
  });

  return ok<ChecklistData>(
    { active, sent, held },
    {
      can_write: canWrite,
      counts: { in_design: countInDesign, pending: countPending, drafted: countDrafted, sent: countSent, held: countHeld },
      overdue,
      due_soon: dueSoon,
    }
  );
});
