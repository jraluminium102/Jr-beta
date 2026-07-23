import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

// GET /api/stock/jobs?q=<ชื่อ/เบอร์>
//   งานที่ "อยู่ในขั้นตอนผลิต–ติดตั้ง (มีมัดจำแล้ว ยังไม่จบ)" ให้สโตร์ผูกตอนเบิก
//   เกณฑ์: current_stage 9–23 (9–19 ผลิต · 20 พร้อมติดตั้ง · 21–23 ติดตั้ง) · ตัด 8=มัดจำ, 24=จบ, <8=ก่อนมัดจำ
//   สิทธิ์ stock (role สโตร์ใช้ได้ · ไม่ต้องมี jobs:read) · ไม่มี q = คืนรายการงานที่เข้าเงื่อนไข (เลือกได้เลย)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requirePermission("stock", "read");
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  // all=1 → ค้นทุกงาน (ไว้ผูกย้อนหลัง งานเก่าที่อาจจบไปแล้ว) · ปกติ = เฉพาะงานกำลังผลิต–ติดตั้ง (stage 9–23)
  const all = url.searchParams.get("all") === "1";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = ctx.supabase as any;
  let query = sb.from("jobs")
    .select("id, job_code, customer_name, customer_tel, customer_area, current_stage")
    .neq("status", "CANCELLED")
    .order("current_stage", { ascending: false })
    .order("assess_date", { ascending: false })
    .limit(30);
  if (!all) query = query.gte("current_stage", 9).lte("current_stage", 23);

  if (q) {
    const d = normalizePhone(q);
    const or = [`customer_name.ilike.%${q}%`, `customer_tel.ilike.%${q}%`];
    if (d && d !== q) or.push(`customer_tel.ilike.%${d}%`);
    query = query.or(or.join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map((j) => ({
    id: j.id as string,
    job_code: (j.job_code ?? null) as string | null,
    customer_name: (j.customer_name ?? "") as string,
    tel4: telTail(j.customer_tel),
    locator: shortAddr(j.customer_area),
    stage_label: stageLabel(Number(j.current_stage) || 0),
  }));
  return ok(rows);
});

// สถานะย่อ: ผลิต/พร้อมติดตั้ง/ติดตั้ง
function stageLabel(s: number): string {
  if (s >= 21) return "กำลังติดตั้ง";
  if (s === 20) return "พร้อมติดตั้ง";
  return "กำลังผลิต";
}

// ดึง "บ้านเลขที่ · เขต/อำเภอ" จากที่อยู่เต็ม (customer_area เก็บที่อยู่ยาว) — ไว้กันชื่อซ้ำ
function shortAddr(area?: string | null): string {
  if (!area) return "";
  const a = area.replace(/\s+/g, " ").trim();
  const house = (a.match(/(\d+\/[\d\-]+)/) || a.match(/เลขที่\s*([\d/\-]+)/) || [])[1] || "";
  const dist = (a.match(/(?:เขต|อำเภอ|อ\.)\s*[^\s,0-9]+/) || [])[0] || "";
  const s = [house && `บ้าน ${house}`, dist].filter(Boolean).join(" · ");
  return s || a.slice(0, 36);
}

// เบอร์ 4 ตัวท้าย (กันชื่อซ้ำเพิ่ม)
function telTail(tel?: string | null): string {
  const d = (tel ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : "";
}
