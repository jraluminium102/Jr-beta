import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";

export const dynamic = "force-dynamic";

// GET /api/boq-daily?date=YYYY-MM-DD → ความเคลื่อนไหวสโตร์ของวันนั้น
//   เบิกออก (type=out): จัดกลุ่มตามลูกค้า/งาน → วัสดุ + ผู้เบิก (เบิกไปใช้งานใคร)
//   รับเข้า/ซื้อเข้า (type=in): รายการรับเข้าวันนั้น (ต้นทุน/หน่วย · ผู้รับเข้า · หมายเหตุ)
//   แหล่ง: stock_moves (ไม่ void) วันนั้น ⋈ stock_items ⋈ jobs ⋈ cutlists(ref=code)
//   ⚠ ใช้ fetchAllPaged — stock_moves วันคึกอาจเกิน 1,000 แถว (เคยมีเหตุจริง 16 ก.ค.69 ของหายเงียบ)

type MoveRow = {
  id: number; stock_item_id: number; type: string; qty: number; ref: string | null; created_at: string;
  job_id: string | null; total_price: number | null; unit_cost: number | null; requester: string | null; note: string | null;
  stock_items: { name: string; sku: string | null; unit: string | null; category: string | null; is_weight_based: boolean | null; weight_per_unit: number | null } | null;
  jobs: { job_code: string | null; customer_name: string | null } | null;
};

export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("production", "read");
  const url = new URL(req.url);
  const q = url.searchParams.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10);
  const start = `${date}T00:00:00+07:00`;   // ยึดวันเวลาไทย (created_at เป็น timestamptz)
  const end = `${date}T23:59:59.999+07:00`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  // ดึงทั้ง เบิกออก + รับเข้า วันเดียว (adjust ไม่นับ — เป็นการตั้งค่ายอด ไม่ใช่เบิก/รับ)
  const moves = await fetchAllPaged<MoveRow>((from, to) => sb
    .from("stock_moves")
    .select("id, stock_item_id, type, qty, ref, created_at, job_id, total_price, unit_cost, requester, note, stock_items(name, sku, unit, category, is_weight_based, weight_per_unit), jobs:job_id(job_code, customer_name)")
    .in("type", ["out", "in"]).eq("is_voided", false)
    .gte("created_at", start).lte("created_at", end)
    .order("id", { ascending: true })
    .range(from, to));

  const outMoves = moves.filter((m) => m.type === "out");
  const inMoves = moves.filter((m) => m.type === "in");

  // ── เบิกออก: ชื่อใบตัดของงานเบิก (ไม่ผูกลูกค้า) — ref = "CL-<id>" ──
  const refs = [...new Set(outMoves.filter((m) => !m.job_id && m.ref).map((m) => m.ref as string))];
  const cutlistName: Record<string, string> = {};
  if (refs.length) {
    const { data: cls } = await sb.from("cutlists").select("code, name").in("code", refs);
    for (const c of (cls ?? []) as { code: string; name: string }[]) cutlistName[c.code] = c.name;
  }

  type Mat = { sku: string | null; name: string; unit: string; qty: number; kg: number; price: number };
  type Group = { key: string; kind: "job" | "blank"; title: string; ref: string | null; mats: Record<string, Mat>; price: number; bars: number; who: Set<string> };
  const groups: Record<string, Group> = {};
  for (const m of outMoves) {
    const si = m.stock_items;
    const isJob = !!m.job_id;
    const key = isJob ? `job:${m.job_id}` : m.ref ? `cl:${m.ref}` : "other";
    const g = (groups[key] ??= {
      key,
      kind: isJob ? "job" : "blank",
      title: isJob ? (m.jobs?.customer_name ?? "—") : m.ref ? (cutlistName[m.ref] ?? m.ref) : "งานเบิกอื่น ๆ",
      ref: isJob ? (m.jobs?.job_code ?? null) : (m.ref ?? null),
      mats: {}, price: 0, bars: 0, who: new Set<string>(),
    });
    const mk = si?.sku || si?.name || String(m.stock_item_id);
    const mat = (g.mats[mk] ??= { sku: si?.sku ?? null, name: si?.name ?? "—", unit: si?.unit ?? "เส้น", qty: 0, kg: 0, price: 0 });
    const qty = Number(m.qty) || 0;
    mat.qty += qty;
    if (si?.is_weight_based && si?.weight_per_unit) mat.kg += qty * Number(si.weight_per_unit);
    mat.price += Number(m.total_price) || 0;
    g.price += Number(m.total_price) || 0;
    g.bars += qty;
    if (m.requester && m.requester.trim()) g.who.add(m.requester.trim());
  }

  const outGroups = Object.values(groups)
    .map((g) => ({
      key: g.key, kind: g.kind, title: g.title, ref: g.ref, price: g.price, bars: g.bars,
      requesters: [...g.who],
      mats: Object.values(g.mats).sort((a, b) => (a.sku || a.name).localeCompare(b.sku || b.name)),
    }))
    .sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === "job" ? -1 : 1));

  // ── รับเข้า/ซื้อเข้า: รายการต่อแถว (ล่าสุดก่อน) ──
  const receives = inMoves
    .map((m) => ({
      id: m.id,
      at: m.created_at,
      sku: m.stock_items?.sku ?? null,
      name: m.stock_items?.name ?? "—",
      category: m.stock_items?.category ?? "",
      unit: m.stock_items?.unit ?? "",
      qty: Number(m.qty) || 0,
      unitCost: Number(m.unit_cost) || 0,
      price: Number(m.total_price) || 0,
      who: (m.requester ?? "").trim(),
      note: (m.note ?? "").trim(),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));

  const totals = outGroups.reduce(
    (t, g) => ({ bars: t.bars + g.bars, kg: t.kg + g.mats.reduce((s, m) => s + m.kg, 0), price: t.price + g.price }),
    { bars: 0, kg: 0, price: 0 },
  );
  const receiveTotal = receives.reduce((s, r) => s + r.price, 0);

  return ok({ date, groups: outGroups, totals, receives, receiveTotal });
});
