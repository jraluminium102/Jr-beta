import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { ok } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { can } from "@/lib/rbac";
import { fetchAllPaged } from "@/lib/supabase/fetch-all";
import { FEE_CHECK_FROM } from "@/lib/fee-check";

export const dynamic = "force-dynamic";
type Sb = { from: (t: string) => any };

// GET /api/queue/fee-check — คิวที่มีค่าประเมิน ตั้งแต่ พ.ย.69 (ทุกเดือนรวมกัน ไม่ผูกกับเดือนที่หน้าคิวงานกำลังดู)
//   อ่านอย่างเดียว · ไม่รวมคิวยกเลิก · คิวที่ยังไม่ลงวันเอาเฉพาะที่สร้างตั้งแต่ พ.ย.69
//   SALES ที่แก้คิวไม่ได้ เห็นเฉพาะคิวตัวเอง (แบบเดียวกับ GET /api/queue · RLS คุมซ้ำอีกชั้น)
export const GET = withRoute(async () => {
  const ctx = await requirePermission("queue", "read");
  const sb = ctx.supabase as unknown as Sb;
  const canWrite = can(ctx.role, "queue", "write");

  let salesEq: string | null = null;
  if (!canWrite && ctx.role === "SALES") {
    const { data: mine } = await sb.from("queue_sales").select("id").eq("profile_id", ctx.user.id).eq("active", true).limit(1);
    const id = (mine as { id: string }[] | null)?.[0]?.id;
    if (!id) return ok([], { can_write: false, from: FEE_CHECK_FROM });
    salesEq = id;
  }

  let failed: unknown = null;
  const rows = await fetchAllPaged((from, to) => {
    let q = sb
      .from("queue_entries")
      .select("*, sales:sales_id(id,name,code,team), assistant:assistant_id(id,name,code)")
      .gt("assess_fee", 0)
      .neq("status", "CANCELLED")
      .or(`queue_date.gte.${FEE_CHECK_FROM},and(queue_date.is.null,created_at.gte.${FEE_CHECK_FROM})`)
      .order("queue_date", { ascending: true, nullsFirst: false })
      .order("queue_time", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, to);
    if (salesEq) q = q.eq("sales_id", salesEq);
    return q;
  }, 1000, (e) => { failed = e; });
  // โหลดไม่ครบ = ต้องบอก ห้ามคืนรายการว่าง/ขาด (จะกลายเป็น "ไม่มีใครค้างจ่าย" ทั้งที่มี)
  if (failed) throw dbError(failed as Parameters<typeof dbError>[0]);

  return ok(rows, { can_write: canWrite, from: FEE_CHECK_FROM });
});
