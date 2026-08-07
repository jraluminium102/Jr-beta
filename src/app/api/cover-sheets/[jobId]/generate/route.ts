import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
// generator ตัวจริง (pure JS ไม่มี type · เหมือน calculator40/engine.mjs) — ห้ามแก้ logic
import { buildGroups, toLeftLines, buildSideColumns } from "@/lib/cover-sheet/generate.mjs";
import { pickJobQuotation } from "@/lib/cover-sheet/pick-quotation";

export const dynamic = "force-dynamic";

type Params = { params: { jobId: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = { from: (t: string) => any };

// POST /api/cover-sheets/:jobId/generate — สร้าง "list แบน" คอลัมน์ซ้าย จากใบเสนอราคาล่าสุด
//   body { mode } (short|grouped) · ไม่บันทึก DB — client เอา left ไปเติม state แล้วค่อยกด "บันทึก" (PUT)
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as AnySb;
  const jobId = params.jobId;
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "grouped" ? "grouped" : "short";

  // เลือก "ใบเสนอที่ลูกค้าตกลงจริง" = ใบที่มีใบวางบิล/มัดจำ (ไม่ใช่ใบล่าสุด) — กันดึงสเปคผิดใบเมื่อมีหลายใบเสนอ
  const picked = await pickJobQuotation(sb, jobId);
  if (!picked) return err("งานนี้ยังไม่มีใบเสนอราคา — สร้างอัตโนมัติไม่ได้ (กรอกเองในช่องซ้ายแทน)", 404);

  const { data: items, error: iErr } = await sb
    .from("quotation_items")
    .select("name, detail, group_label, sort_order")
    .eq("quotation_id", picked.id)
    .order("sort_order", { ascending: true });
  if (iErr) throw dbError(iErr);

  const left = toLeftLines(buildGroups(items ?? []), mode);
  // คอลัมน์ 2 (แจ้งช่าง = ขอบเขตงานจากหมายเหตุ) + 3 (แจ้งลูกค้า = บรรทัด "ลูกค้าเตรียม…")
  const { mid, right } = buildSideColumns(items ?? []);
  return ok({ left, mid, right, quotation_id: picked.id, quotation_code: picked.code });
});
