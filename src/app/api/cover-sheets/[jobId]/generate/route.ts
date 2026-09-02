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

// POST /api/cover-sheets/:jobId/generate — สร้าง "list แบน" คอลัมน์ซ้าย จากใบเสนอราคา (ใบที่เลือก/pin ไว้ หรือใบเสนอล่าสุดที่ลูกค้าตกลงจริง)
//   body { mode, quotation_id? } (mode: short|grouped · quotation_id: ระบุเมื่อผู้ใช้เลือกจากดรอปดาวน์ ไม่งั้น auto-pick)
//   ไม่บันทึก DB — client เอา left ไปเติม state แล้วค่อยกด "บันทึก" (PUT) ซึ่งจะ pin quotation_id/rev_no ให้ตอนเซฟ
export const POST = withRoute(async (req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "read");
  const sb = ctx.supabase as unknown as AnySb;
  const jobId = params.jobId;
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "grouped" ? "grouped" : "short";
  const rawPin = body?.quotation_id;
  const pinnedId = rawPin != null && rawPin !== "" && Number.isFinite(Number(rawPin)) ? Number(rawPin) : null;

  // เลือก "ใบเสนอที่ลูกค้าตกลงจริง" = ใบที่มีใบวางบิล/มัดจำ (ไม่ใช่ใบล่าสุด) — กันดึงสเปคผิดใบเมื่อมีหลายใบเสนอ
  //   ถ้าผู้ใช้เลือกใบ/rev เองจากดรอปดาวน์ (pinnedId) → ใช้ใบนั้นตรง ๆ
  const picked = await pickJobQuotation(sb, jobId, pinnedId);
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
  return ok({ left, mid, right, quotation_id: picked.id, quotation_code: picked.code, quotation_revision_no: picked.revision_no });
});
