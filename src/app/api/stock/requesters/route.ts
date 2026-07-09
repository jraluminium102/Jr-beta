import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";

// GET /api/stock/requesters → รายชื่อผู้เบิก/ผู้รับเข้า ที่เคยกรอก (distinct) สำหรับ dropdown เลือกเดิม+เพิ่มใหม่
export async function GET() {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();
  const sb = createClient();
  const { data, error } = await sb
    .from("stock_moves")
    .select("requester")
    .not("requester", "is", null)
    .neq("requester", "")
    .order("created_at", { ascending: false })
    .limit(3000);
  if (error) return fail(error.message, 500);
  const set = new Set<string>();
  for (const r of (data ?? []) as { requester: string }[]) {
    const v = (r.requester || "").trim();
    if (v) set.add(v);
  }
  return ok([...set].sort((a, b) => a.localeCompare(b, "th")));
}
