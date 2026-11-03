import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import { notFound } from "@/lib/bff/response";
import { dbError } from "@/lib/bff/db-error";
import { buildQcDoc } from "@/lib/qc-doc.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Sb = { from: (t: string) => any };

/**
 * GET /api/queue/[id]/qc-doc — เอกสารควบคุมคุณภาพงาน (PDF ต้นฉบับ 18 หน้า) เติมข้อมูลลูกค้าหน้างานลงหน้า 1
 *   สร้างสดทุกครั้ง ไม่เก็บไฟล์ (เจ้าของ 3 พ.ย.69: ส่งให้เซลล์ก่อนเข้าหน้างาน · เว็บไม่ต้องเก็บ)
 */
export const GET = withRoute(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requirePermission("queue", "read");
  const sb = ctx.supabase as unknown as Sb;
  const { data, error } = await sb
    .from("queue_entries")
    .select("*, sales:sales_id(id,name,code,team), assistant:assistant_id(id,name,code)")
    .eq("id", params.id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return notFound("ไม่พบคิวนี้");

  const bytes = await buildQcDoc(data);
  // ชื่อไฟล์ = "<ชื่อลูกค้า> เอกสารควบคุมคุณภาพงาน.pdf" ตามแบบที่เจ้าของตั้งไว้ (เช่น "คุณวริศ เอกสารควบคุมคุณภาพงาน")
  const cust = String((data as { customer_name?: string }).customer_name ?? "").replace(/[\\/:*?"<>|]+/g, " ").trim() || "ลูกค้า";
  const name = `${cust} เอกสารควบคุมคุณภาพงาน.pdf`;
  // header ต้องเป็น ASCII — ชื่อไทยใส่แบบ percent-encode ใน filename* เท่านั้น (เบราว์เซอร์ใช้ตัวนี้ตอนเซฟ)
  const ascii = `QC-${params.id.slice(0, 8)}.pdf`;
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
});
