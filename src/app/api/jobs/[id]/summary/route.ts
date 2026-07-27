import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/jobs/[id]/summary — "สรุปงาน" 1 งาน: มัดจำ · ใบเสนอราคา · ติดตั้งเสร็จ · ของที่ใช้ (BOQ/ใบตัด)
//   ไว้ดูในทะเบียนลูกค้า (โดยเฉพาะงานที่จบแล้ว) — ดึงสดจากงานจริง ไม่ต้องกรอกซ้ำ
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("jobs", "read");
  // ยอดเงิน (มัดจำ/ใบเสนอ) โชว์เฉพาะ role ที่เห็นฟิลด์การเงินได้ — role อื่น redact
  const showNet = can(ctx.role, "jobs:finance_fields", "read");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const id = params.id;

  const [jobR, quoR, instR, movesR, cutR] = await Promise.all([
    sb.from("jobs").select("job_code, customer_name, status, current_stage, deposit_amount, deposit_date, net_amount").eq("id", id).maybeSingle(),
    sb.from("quotations").select("id, code, issue_date, net, total, status").eq("job_id", id).order("issue_date", { ascending: false }),
    sb.from("installations").select("status, completed_date, install_actual, install_scheduled").eq("job_id", id).maybeSingle(),
    sb.from("stock_moves").select("qty, stock_items(name, sku, unit)").eq("job_id", id).eq("type", "out").eq("is_voided", false),
    sb.from("cutlists").select("id, code, name, status, stock_cut_at").eq("job_id", id).order("created_at", { ascending: false }),
  ]);

  // ของที่ใช้จริง — รวม stock_moves "เบิกออก" ต่อวัสดุ (จากที่ผูกงานไว้)
  const mMap = new Map<string, { name: string; sku: string | null; unit: string; qty: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (movesR.data ?? []) as any[]) {
    const si = m.stock_items; if (!si) continue;
    const k = si.sku || si.name;
    const e = mMap.get(k) ?? { name: si.name, sku: si.sku, unit: si.unit ?? "", qty: 0 };
    e.qty += Number(m.qty) || 0; mMap.set(k, e);
  }
  const materials = [...mMap.values()].sort((a, b) => (a.sku || a.name).localeCompare(b.sku || b.name));

  // redact ยอดเงินถ้าไม่มีสิทธิ์การเงิน
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = jobR.data as any;
  if (job && !showNet) { job.deposit_amount = null; job.net_amount = null; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotations = ((quoR.data ?? []) as any[]).map((q) =>
    showNet ? q : { ...q, net: null, total: null }
  );

  return ok({
    job: job ?? null,
    quotations,
    install: instR.data ?? null,
    materials,
    cutlists: cutR.data ?? [],
  });
});
