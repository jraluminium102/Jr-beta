import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { fail, UNAUTHORIZED } from "@/lib/bff";
import { buildQuoteXlsx } from "@/lib/floor-calc/quote-xlsx";
import { quoteFileName } from "@/lib/floor-calc/engine.mjs";

export const dynamic = "force-dynamic";

// GET /api/floor-quotations/[id]/xlsx — ดาวน์โหลดใบเสนอเป็น Excel (ฟอร์มเดียวกับหน้าพิมพ์)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const supabase = createClient();
  const { data } = await supabase
    .from("floor_quotations")
    .select("*, floor_quotation_items(*), floor_installments(*)")
    .eq("id", params.id)
    .single();
  if (!data) return fail("ไม่พบใบเสนอราคางานพื้น", 404);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((q.floor_quotation_items ?? []) as any[])
    .slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inst = ((q.floor_installments ?? []) as any[]).slice().sort((a, b) => a.seq - b.seq);

  const buf = buildQuoteXlsx({
    customer: q.customer_snapshot ?? { name: "" },
    issueDate: q.issue_date,
    revLabel: q.rev > 0 ? ` (Rev${String(q.rev).padStart(2, "0")})` : "",
    items,
    contractor: q.contractor ?? {},
    note: q.note,
    installments: inst.length
      ? inst.map((r) => ({ label: r.label, amount: Number(r.amount) || 0, work_items: r.work_items, is_final: !!r.is_final }))
      : undefined,
  });

  // ⚠ ชื่อไฟล์เป็นไทย → ต้องใช้ filename* (RFC 5987) · ใส่ไทยดิบใน header ไม่ได้
  const name = `${quoteFileName(q.customer_snapshot?.name, q.rev)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="floor-quote-${q.code}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
