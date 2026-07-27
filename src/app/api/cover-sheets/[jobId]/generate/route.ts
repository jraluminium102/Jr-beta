import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
// generator ตัวจริง (pure JS ไม่มี type · เหมือน calculator40/engine.mjs) — ห้ามแก้ logic
import { generateCoverSheet } from "@/lib/cover-sheet/generate.mjs";

export const dynamic = "force-dynamic";

type Params = { params: { jobId: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

// POST /api/cover-sheets/:jobId/generate — สร้างชุด (groups) จากใบเสนอราคาล่าสุดของงาน
//   ไม่บันทึกลง DB — client เอา groups ไปเติม state แล้วค่อยกด "บันทึก" (PUT) เอง
export const POST = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as AnySb;
  const jobId = params.jobId;

  const { data: quos, error: qErr } = await sb
    .from("quotations")
    .select("id, code, created_at")
    .eq("job_id", jobId)
    .neq("status", "cancelled")   // ตัดใบยกเลิก — กันดึงสเปคผิดใบ
    .order("created_at", { ascending: false });
  if (qErr) throw dbError(qErr);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latest = ((quos ?? []) as any[])[0];
  if (!latest) return err("งานนี้ยังไม่มีใบเสนอราคา — สร้างอัตโนมัติไม่ได้ (กรอกเองในช่องซ้ายแทน)", 404);

  const { data: items, error: iErr } = await sb
    .from("quotation_items")
    .select("name, detail, group_label, sort_order")
    .eq("quotation_id", latest.id)
    .order("sort_order", { ascending: true });
  if (iErr) throw dbError(iErr);

  const { groups } = generateCoverSheet(items ?? []);
  return ok({ groups, quotation_id: latest.id, quotation_code: latest.code });
});
