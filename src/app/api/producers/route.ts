import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { requirePermission } from "@/lib/bff/context";
import { requireChangOr } from "@/lib/bff/chang-ctx";

export const dynamic = "force-dynamic";

// GET /api/producers — distinct producer names from productions.producer_note
// ใช้โดย ตารางผลิต / production สำหรับ datalist + filter "งานของฉัน"
// ถ้า query error คืน [] เพื่อ graceful degrade (ไม่ block UI)
export const GET = withRoute(async (req: Request) => {
  const ctx = await requireChangOr(req, "production", "read");

  try {
    // adhoc_production_tasks ยังไม่อยู่ใน generated types → cast
    const sb = ctx.supabase as unknown as { from: (t: string) => any };

    const [{ data: prodRows }, { data: adhocRows }] = await Promise.all([
      ctx.supabase
        .from("productions")
        .select("producer_note")
        .not("producer_note", "is", null)
        .neq("producer_note", ""),
      sb
        .from("adhoc_production_tasks")
        .select("producer_note")
        .not("producer_note", "is", null)
        .neq("producer_note", ""),
    ]);

    // dedup + sort จากทั้งสองแหล่ง
    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of [...(prodRows ?? []), ...(adhocRows ?? [])]) {
      const n = ((row as { producer_note?: string | null }).producer_note ?? "").trim();
      if (n && !seen.has(n)) {
        seen.add(n);
        names.push(n);
      }
    }
    names.sort((a, b) => a.localeCompare(b, "th"));

    return ok({ producers: names });
  } catch {
    // resilient — ห้ามคืน 500 ให้คืน empty list แทน
    return ok({ producers: [] as string[] });
  }
});
