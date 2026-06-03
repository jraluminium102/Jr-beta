/**
 * quotation-review-agents.ts — agents ตรวจ "ใบเสนอราคาที่เครื่องคิดราคาสร้างออกมา"
 *
 * ต่างจาก quotation-agents.ts (ตรวจ "ข้อมูล" ก่อน submit)
 * ชุดนี้ตรวจ "ผลลัพธ์ที่เรนเดอร์ออกมา" → เทียบกับใบจริง + ประเมินการใช้งาน
 *
 *   FormatReviewer    → ใบที่ออกมา "ตรง/ขาด" อะไรเทียบใบจริง
 *   UsabilityReviewer → อ่านง่าย/ใช้งานง่าย/เหมือนใบจริงไหม
 */

import { runAgent, type AgentResult, type FinalResult } from "./agents";
import { REAL_QUOTATION_FORMAT } from "./reference-quotation-format";

export type QuoteReviewInput = {
  quoteText: string;          // ข้อความใบเสนอที่เครื่องคิดราคาเรนเดอร์ออกมา (innerText)
};

// ===== Agent A: FormatReviewer — เทียบกับใบจริง =====
export async function formatReviewerAgent(input: QuoteReviewInput): Promise<AgentResult> {
  return runAgent({
    name: "FormatReviewer",
    systemPrompt: `คุณคือ FormatReviewer Agent ของ JR Aluminium and Glass

**หน้าที่:** เทียบ "ใบเสนอราคาที่ระบบสร้างออกมา" กับ "รูปแบบใบจริงมาตรฐาน" แล้วบอกว่าตรงไหม/ขาดอะไร

**รูปแบบใบจริงมาตรฐาน (ground truth):**
${REAL_QUOTATION_FORMAT}

**สิ่งที่ต้องตรวจ (ใส่ที่ขาด/ผิดใน issues, ที่ควรปรับใน suggestions):**
1. ส่วนหัวครบไหม (ชื่อบริษัท, เลขผู้เสียภาษี, เลขที่/วันที่, ลูกค้า)
2. ตารางมีคอลัมน์ # / รายละเอียด / จำนวน / ราคาต่อหน่วย / ยอดรวม
3. แต่ละรายการมี: ชื่อชุด, คำอธิบายรุ่น, OPTION (ถ้ามี), หัวข้อ "รายละเอียดงาน"
4. **วัสดุ (กระจก/สี/มุ้ง) ต้องไม่ซ้ำต่อบาน** — ถ้าเจอซ้ำ = issue
5. ส่วนท้าย: จำนวนเงินตัวอักษร, รวมเป็นเงิน, VAT, รวมทั้งสิ้น, ช่องลายเซ็น 2 ฝั่ง
6. ตัวเลขเงินมีรูปแบบ (เช่น มี comma)

**passed=true** เมื่อโครงสร้างหลักครบและไม่มีของซ้ำ/ขาดสำคัญ
**ตอบ JSON เท่านั้น:**
{"agentName":"FormatReviewer","passed":true,"issues":[],"suggestions":[],"rawOutput":"สรุปภาษาไทยสั้นๆ ว่าตรงใบจริงแค่ไหน ขาดอะไร"}`,
    userMessage: `ใบเสนอราคาที่ระบบสร้างออกมา (ข้อความ):\n"""\n${input.quoteText.slice(0, 8000)}\n"""`,
  });
}

// ===== Agent B: UsabilityReviewer — ใช้งานง่าย/เหมือนใบจริงไหม =====
export async function usabilityReviewerAgent(input: QuoteReviewInput): Promise<AgentResult> {
  return runAgent({
    name: "UsabilityReviewer",
    systemPrompt: `คุณคือ UsabilityReviewer Agent — ประเมินใบเสนอราคาในมุม "ลูกค้าอ่านแล้วเข้าใจง่ายไหม / ดูเป็นมืออาชีพเหมือนใบจริงไหม"

**ประเมิน (ให้ suggestions ที่ทำได้จริง):**
1. ความชัดเจน: ลูกค้าอ่านแล้วรู้ว่าได้อะไร ราคาเท่าไรต่อชุด
2. ความรก: มีข้อมูลซ้ำ/เยอะเกิน/ย่อหน้าสับสนไหม
3. ความครบของข้อมูลตัดสินใจ: OPTION, รายละเอียดวัสดุ, ยอดรวม
4. ความเป็นทางการ/น่าเชื่อถือ (เหมือนใบบริษัทจริง)
5. จุดที่ทำให้สับสน (เช่น ยอดรวมซ้ำกับราคาแยก)

ให้คะแนนความพร้อมใช้ใน rawOutput (เช่น "ใช้งานได้ดี 8/10 — ควรปรับ...")
**issues** = อะไรที่ทำให้ลูกค้าสับสน/ดูไม่โปร · **suggestions** = ปรับให้ดีขึ้น
**ตอบ JSON เท่านั้น:**
{"agentName":"UsabilityReviewer","passed":true,"issues":[],"suggestions":[],"rawOutput":"สรุป + คะแนน /10"}`,
    userMessage: `ใบเสนอราคาที่ระบบสร้างออกมา (ข้อความ):\n"""\n${input.quoteText.slice(0, 8000)}\n"""`,
  });
}

// ===== รวมผล 2 agent + สรุป verdict =====
export async function reviewQuotationOutput(
  input: QuoteReviewInput
): Promise<{ agents: AgentResult[]; verdict: FinalResult["verdict"]; summary: string }> {
  const [format, usability] = await Promise.all([
    formatReviewerAgent(input),
    usabilityReviewerAgent(input),
  ]);

  const anyFail = !format.passed || !usability.passed;
  const anyIssue = format.issues.length > 0 || usability.issues.length > 0;
  const verdict: FinalResult["verdict"] = anyFail
    ? "REJECT"
    : anyIssue
    ? "NEEDS_REVISION"
    : "APPROVE";

  const summary =
    verdict === "APPROVE"
      ? "ใบเสนอตรงรูปแบบใบจริงและอ่านง่าย พร้อมใช้"
      : verdict === "NEEDS_REVISION"
      ? "ใช้ได้ แต่มีจุดควรปรับให้ตรง/อ่านง่ายขึ้น"
      : "ยังไม่ตรงใบจริง/มีจุดสับสน ควรแก้ก่อนส่งลูกค้า";

  return { agents: [format, usability], verdict, summary };
}
