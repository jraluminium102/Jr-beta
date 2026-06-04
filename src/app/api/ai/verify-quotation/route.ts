/**
 * POST /api/ai/verify-quotation
 *
 * รัน 3 agents ตรวจสอบใบเสนอราคาก่อน submit
 * ส่ง body เดียวกับ POST /api/quotations แต่ไม่บันทึก DB
 *
 * Response:
 * {
 *   agents: [DataValidator, BusinessRulesChecker, FinalReviewer],
 *   verdict: "APPROVE" | "NEEDS_REVISION" | "REJECT",
 *   canSubmit: boolean
 * }
 */

import { ok, fail } from "@/lib/bff";
import { requirePermission } from "@/lib/bff/context";
import { withRoute } from "@/lib/bff/handler";
import {
  dataValidatorAgent,
  businessRulesAgent,
  finalReviewerAgent,
  type QuotationInput,
} from "@/lib/ai/quotation-agents";

export const POST = withRoute(async (req: Request) => {
  await requirePermission("quotations", "read");

  const body: QuotationInput = await req.json().catch(() => null);
  if (!body) return fail("payload ไม่ถูกต้อง");

  // ----- รัน pipeline 3 agents ตามลำดับ -----
  // agent แต่ละตัวเห็นผลของตัวก่อนหน้า → ไม่ตรวจซ้ำ

  const step1 = await dataValidatorAgent(body);
  const step2 = await businessRulesAgent(body, step1);
  const step3 = await finalReviewerAgent(body, [step1, step2]);

  return ok({
    agents: [step1, step2, step3],
    verdict: step3.verdict,
    canSubmit: step3.verdict === "APPROVE",
  });
});
