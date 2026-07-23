import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { canSeeCost } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/stock/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD&type=in,out,adjust&voided=0
//   สมุดสโตร์รวม — ดึง stock_moves ในช่วงวัน (เวลาไทย) แล้วส่ง raw + ชื่อใบตัด · client คิด 4 มุมมอง + กรอง วัสดุ/หมวด/ผู้เบิก/งาน เอง
//   ⚠ RBAC: requirePermission("production","read") — กันเข้าถึงต้นทุนตรงผ่าน API (ตรงกับ boq-daily เดิม · QA พบช่องโหว่ 24 ก.ค.)
//   ⚠ fetchAllPaged — เดือนคึกเกิน 1,000 แถว query ตรงจะหายเงียบ · default ตัด void ออก (ยอดทุกมุมตรงกัน)

type Row = {
  id: number; created_at: string; type: "in" | "out" | "adjust"; qty: number;
  requester: string | null; ref: string | null; note: string | null;
  unit_cost: number | null; total_price: number | null; job_id: string | null;
  is_voided: boolean | null; void_reason: string | null; edited_at: string | null;
  stock_items: { id: number; name: string; sku: string | null; unit: string | null; category: string | null; qty_on_hand: number | null; is_weight_based: boolean | null; weight_per_unit: number | null } | null;
  jobs: { job_code: string | null; customer_name: string | null } | null;
};

const isoDay = (s: string | null, fallback: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback);

export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "read");
  const blind = !canSeeCost(ctx.role);   // role สโตร์ = ตาบอดราคา → ส่งต้นทุน/มูลค่าเป็น 0

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = isoDay(url.searchParams.get("from"), today);
  const to = isoDay(url.searchParams.get("to"), from);
  const start = `${from}T00:00:00+07:00`;
  const end = `${to}T23:59:59.999+07:00`;
  const types = (url.searchParams.get("type") ?? "").split(",").map((s) => s.trim()).filter((s) => ["in", "out", "adjust"].includes(s));
  const includeVoided = url.searchParams.get("voided") === "1";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  const moves = await fetchAllPaged<Row>((f, t) => {
    let query = sb.from("stock_moves")
      .select("id, created_at, type, qty, requester, ref, note, unit_cost, total_price, job_id, is_voided, void_reason, edited_at, stock_items(id, name, sku, unit, category, qty_on_hand, is_weight_based, weight_per_unit), jobs:job_id(job_code, customer_name)")
      .gte("created_at", start).lte("created_at", end)
      .order("id", { ascending: true }).range(f, t);
    if (!includeVoided) query = query.eq("is_voided", false);
    if (types.length) query = query.in("type", types);
    return query;
  });

  // ชื่อใบตัดของงานเบิกไม่ผูกลูกค้า (ref = CL-xxx)
  const refs = [...new Set(moves.filter((m) => !m.job_id && m.ref && /^CL-/i.test(m.ref)).map((m) => m.ref as string))];
  const cutlistName: Record<string, string> = {};
  if (refs.length) {
    const { data: cls } = await sb.from("cutlists").select("code, name").in("code", refs);
    for (const c of (cls ?? []) as { code: string; name: string }[]) cutlistName[c.code] = c.name;
  }

  const rows = moves.map((m) => {
    const si = m.stock_items;
    const qty = Number(m.qty) || 0;
    return {
      id: m.id,
      at: m.created_at,
      type: m.type,
      sid: si?.id ?? null,
      onHand: Number(si?.qty_on_hand) || 0,
      sku: si?.sku ?? null,
      name: si?.name ?? "—",
      category: si?.category ?? "",
      unit: si?.unit ?? "",
      qty,
      kg: si?.is_weight_based && si?.weight_per_unit ? Math.round(qty * Number(si.weight_per_unit) * 100) / 100 : 0,
      unitCost: blind ? 0 : (Number(m.unit_cost) || 0),
      price: blind ? 0 : (Number(m.total_price) || 0),
      who: (m.requester ?? "").trim(),
      note: (m.note ?? "").trim(),
      ref: m.ref ?? "",
      jobId: m.job_id,
      jobCode: m.jobs?.job_code ?? null,
      customer: m.jobs?.customer_name ?? null,
      cutlistName: m.ref && cutlistName[m.ref] ? cutlistName[m.ref] : "",
      voided: !!m.is_voided,
      voidReason: m.void_reason ?? "",
      edited: !!m.edited_at,
    };
  });

  const cats = [...new Set(moves.map((m) => m.stock_items?.category ?? "").filter(Boolean))].sort();
  return ok({ from, to, rows, cats });
});
