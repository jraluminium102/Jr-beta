import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { requirePermission } from "@/lib/bff/context";

export const dynamic = "force-dynamic";

// GET /api/producers — distinct producer names from productions.producer_note
// ใช้โดย ตารางผลิต / production สำหรับ datalist + filter "งานของฉัน"
// ถ้า query error คืน [] เพื่อ graceful degrade (ไม่ block UI)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("production", "read");

  try {
    const { data } = await ctx.supabase
      .from("productions")
      .select("producer_note")
      .not("producer_note", "is", null)
      .neq("producer_note", "");

    // dedup + sort (ดึงทั้งหมดแล้ว dedup ใน JS เพราะ Supabase REST ไม่รองรับ SELECT DISTINCT column เดียว)
    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of data ?? []) {
      const n = (row.producer_note ?? "").trim();
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
