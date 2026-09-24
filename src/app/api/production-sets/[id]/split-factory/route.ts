import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok, err, notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any
type Params = { params: { id: string } };

// POST /api/production-sets/:id/split-factory
//   ชุดที่ติ๊กหลายโรง (factories หลายค่า) → แยกเป็น "1 ชุด = 1 โรง" (สถานะ/เตือนเกินกำหนดแยกโรงได้จริง · เจ้าของสั่ง 24 ก.ย.69)
//   ต้นฉบับเก็บโรงแรก · สร้างสำเนา 1 ชุด/โรงที่เหลือ (คัดลอกสเปค+สถานะปัจจุบันไปเริ่มต้น แล้วแยกกันต่อจากนี้)
export const POST = withRoute(async (_req: Request, { params }: Params) => {
  const ctx = await requirePermission("production", "write");
  const sb = ctx.supabase as unknown as Sb;

  const { data: set, error: e0 } = await sb.from("production_sets").select("*").eq("id", params.id).maybeSingle();
  if (e0) throw dbError(e0);
  if (!set) return notFound("ไม่พบชุดงานนี้");

  const factories: string[] = Array.isArray(set.factories) ? set.factories.filter(Boolean) : [];
  if (factories.length <= 1) return err("ชุดนี้ติ๊กโรงเดียว/ยังไม่ติ๊กโรง — ไม่ต้องแยก", 400);

  const startMap: Record<string, string> = (set.factory_start && typeof set.factory_start === "object") ? set.factory_start : {};
  const [keep, ...rest] = factories;
  const baseLabel0 = String(set.set_label ?? "").replace(/\s*\((?:โรงงาน[^)]*)\)\s*$/, "").trim();   // ตัด suffix โรงเก่าถ้าเคยแยก

  // 1) ต้นฉบับ → เหลือโรงแรก + วันเริ่มของโรงแรก + ต่อชื่อโรง
  const { error: e1 } = await sb.from("production_sets")
    .update({
      factories: [keep],
      factory_start: startMap[keep] ? { [keep]: startMap[keep] } : {},
      set_label: baseLabel0 ? `${baseLabel0} (${keep})` : keep,
    })
    .eq("id", params.id);
  if (e1) throw dbError(e1);

  // 2) สำเนา 1 ชุด/โรงที่เหลือ — คัดลอกทุกฟิลด์ (สเปค+สถานะปัจจุบัน) ยกเว้น key ของแถว
  //    (แยกกันต่อจากนี้: ติ๊กเสร็จ/เตือนเกินกำหนด แยกอิสระต่อชุด)
  const strip = new Set(["id", "created_at", "updated_at"]);
  const base: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(set)) if (!strip.has(k) && k !== "job") base[k] = v;

  const baseLabel = String(base.set_label ?? "").replace(/\s*\((?:โรงงาน[^)]*)\)\s*$/,"").trim();   // ตัด suffix โรงเก่าถ้าเคยแยก
  const rows = rest.map((f) => ({
    ...base,
    factories: [f],
    factory_start: startMap[f] ? { [f]: startMap[f] } : {},
    set_label: baseLabel ? `${baseLabel} (${f})` : f,   // ต่อชื่อโรงท้าย กันซ้ำ/แยกออกง่าย
  }));
  const { data: created, error: e2 } = await sb.from("production_sets").insert(rows).select("id");
  if (e2) throw dbError(e2);

  return ok({ split: rest.length + 1, factories, created: (created ?? []).length });
});
