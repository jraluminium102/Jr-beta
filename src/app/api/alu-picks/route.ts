import { withRoute, audit } from "@/lib/bff/handler";
import { ok, created } from "@/lib/bff/response";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { pickCtx, runPick } from "@/lib/alu-pick/route-helpers";
import { createPick } from "@/lib/alu-pick/service";
import { stockDisplayName } from "@/lib/stock/display-name";

export const dynamic = "force-dynamic";

/**
 * ใบเบิกอลู (เจ้าของสั่ง 19 ต.ค.69) — รับทั้งช่างผ่านลิงก์ (x-chang-token) และคนล็อกอิน
 *
 * GET  /api/alu-picks?mine=1&days=7          → ใบของช่างคนนี้ (ชื่อจาก header x-chang-name) ย้อนหลัง N วัน
 * GET  /api/alu-picks?from=YYYY-MM-DD&to=…   → ทุกใบในช่วงวัน (สโตร์อลู)
 * POST /api/alu-picks {job_id, reason, reason_note, note, items:[{stock_item_id, qty}]} → สร้าง + ตัดสต็อกทันที
 */
type Row = {
  id: number; code: string; job_id: string | null; reason: string; reason_note: string; picker_name: string;
  status: string; checked_at: string | null; checked_by_name: string; cancelled_at: string | null; cancel_reason: string;
  note: string; created_at: string; updated_at: string;
  jobs: { job_code: string | null; customer_name: string | null } | null;
  alu_pick_items: { id: number; stock_item_id: number; qty: number; returned: number; sort_order: number;
    stock_items: { sku: string | null; name: string; color: string | null; image_url: string | null; unit: string | null; qty_on_hand: number | null } | null }[];
};

const isoDay = (s: string | null, fb: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fb);
const SEL = "id, code, job_id, reason, reason_note, picker_name, status, checked_at, checked_by_name, cancelled_at, cancel_reason, note, created_at, updated_at, jobs:job_id(job_code, customer_name), alu_pick_items(id, stock_item_id, qty, returned, sort_order, stock_items(sku, name, color, image_url, unit, qty_on_hand))";

export const GET = withRoute(async (req: Request) => {
  const { sb, actor } = await pickCtx(req, "read");
  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const picker = (url.searchParams.get("picker") ?? "").trim();
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);   // วันไทย
  const from = isoDay(url.searchParams.get("from"), "");
  const to = isoDay(url.searchParams.get("to"), from || today);

  const rows = await fetchAllPaged<Row>((f, t) => {
    let q = sb.from("alu_picks").select(SEL).order("created_at", { ascending: false }).order("id", { ascending: false }).range(f, t);
    if (mine) q = q.eq("picker_name", actor.name);
    else if (picker) q = q.eq("picker_name", picker);
    if (from) q = q.gte("created_at", `${from}T00:00:00+07:00`).lte("created_at", `${to}T23:59:59.999+07:00`);
    else q = q.gte("created_at", new Date(Date.now() - days * 86400 * 1000).toISOString());
    return q;
  });

  const out = rows.map((r) => ({
    id: r.id, code: r.code, job_id: r.job_id, reason: r.reason, reason_note: r.reason_note, picker_name: r.picker_name,
    status: r.status, checked_at: r.checked_at, checked_by_name: r.checked_by_name, cancelled_at: r.cancelled_at, cancel_reason: r.cancel_reason,
    note: r.note, created_at: r.created_at, updated_at: r.updated_at,
    job_code: r.jobs?.job_code ?? null, customer_name: r.jobs?.customer_name ?? null,
    items: [...(r.alu_pick_items ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((it) => ({
      id: it.id, stock_item_id: it.stock_item_id, qty: Number(it.qty) || 0, returned: Number(it.returned) || 0,
      sku: it.stock_items?.sku ?? "", name: stockDisplayName(it.stock_items ?? {}), color: it.stock_items?.color ?? "",
      image_url: it.stock_items?.image_url ?? "", unit: it.stock_items?.unit ?? "เส้น", on_hand: Number(it.stock_items?.qty_on_hand) || 0,
    })),
  }));
  return ok(out, { me: actor.name });
});

export const POST = withRoute(async (req: Request) => {
  const { sb, actor } = await pickCtx(req, "write");
  const b = await req.json().catch(() => ({}));
  // ช่างกรอกชื่อในหน้าเบิก → ส่งมาใน body ด้วย (header อาจยังว่างถ้าเพิ่งเลือกชื่อ)
  const name = (actor.isChang && String(b.picker_name ?? "").trim()) ? String(b.picker_name).trim() : actor.name;
  return runPick(async () => {
    const res = await createPick(sb, { ...actor, name }, {
      job_id: typeof b.job_id === "string" && b.job_id ? b.job_id : null,
      reason: String(b.reason ?? ""), reason_note: String(b.reason_note ?? ""), note: String(b.note ?? ""),
      items: Array.isArray(b.items) ? b.items : [],
    });
    await audit({
      jobId: (typeof b.job_id === "string" && b.job_id) ? b.job_id : null, userId: actor.userId || null,
      action: "ALU_PICK_CREATE", table: "alu_picks", recordId: String(res.id),
      newValue: { code: res.code, by: name, items: (b.items ?? []).length },
    });
    return created(res);
  });
});
