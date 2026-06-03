/**
 * POST /api/ai/review-quotation
 *
 * ตรวจ "ใบเสนอราคาที่เครื่องคิดราคาสร้างออกมา" → เทียบใบจริง + ประเมินการใช้งาน
 * body: { quoteText: string }   (ข้อความใบเสนอ เช่น innerText ของ #quoteContent)
 *
 * Response: { agents:[FormatReviewer, UsabilityReviewer], verdict, summary }
 */

import { getProfile } from "@/lib/auth";
import { ok, fail, UNAUTHORIZED } from "@/lib/bff";
import { reviewQuotationOutput } from "@/lib/ai/quotation-review-agents";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await getProfile();
  if (!profile) return UNAUTHORIZED();

  const body = await req.json().catch(() => null);
  const quoteText = String(body?.quoteText ?? "").trim();
  if (!quoteText) return fail("ไม่มีเนื้อหาใบเสนอให้ตรวจ");
  if (quoteText.length < 30) return fail("เนื้อหาใบเสนอสั้นเกินไป — สร้างใบเสนอก่อน");

  try {
    const result = await reviewQuotationOutput({ quoteText });
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI ตรวจไม่สำเร็จ";
    return fail(msg, 500);
  }
}
