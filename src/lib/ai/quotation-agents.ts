/**
 * quotation-agents.ts — 3 agents สำหรับตรวจสอบใบเสนอราคา
 *
 * Pipeline (sequential):
 *   Agent 1: DataValidator      → ตรวจความครบถ้วนของข้อมูล
 *   Agent 2: BusinessRulesAgent → ตรวจ business rules (discount, vat, wht)
 *   Agent 3: FinalReviewer      → สรุป verdict: APPROVE / NEEDS_REVISION / REJECT
 *
 * แต่ละ agent เห็นผลของตัวก่อนหน้า → ไม่ต้องตรวจซ้ำ ต่อยอดได้เลย
 */

import { runAgent, AgentResult, FinalResult } from "./agents";

// ----- Types สำหรับ Quotation -----

export type QuotationInput = {
  customer_id?: string;
  customer_snapshot?: {
    name?: string;
    address?: string;
    tax_id?: string;
    phone?: string;
  };
  issue_date?: string;
  items?: Array<{
    name?: string;
    detail?: string;
    qty?: number;
    unit_price?: number;
  }>;
  discount_pct?: number;
  vat_rate?: number;
  wht_rate?: number;
  note?: string;
};

// ===== Agent 1: DataValidator =====
// บทบาท: ตรวจว่าข้อมูลครบถ้วนก่อนคำนวณ

export async function dataValidatorAgent(
  quotation: QuotationInput
): Promise<AgentResult> {
  return runAgent({
    name: "DataValidator",
    systemPrompt: `คุณคือ DataValidator Agent สำหรับระบบ ERP บริษัท JR Aluminium and Glass

**หน้าที่:** ตรวจสอบความครบถ้วนและความถูกต้องของข้อมูลใบเสนอราคา

**สิ่งที่ต้องตรวจ:**
1. customer_id ต้องมีค่า (ไม่ว่างเปล่า)
2. items ต้องมีอย่างน้อย 1 รายการ
3. ทุก item ต้องมี: name ที่ไม่ว่าง, qty > 0, unit_price > 0
4. ชื่อ item ต้องไม่ใช่ "(ไม่มีชื่อรายการ)"
5. issue_date ต้องมีและรูปแบบถูก (YYYY-MM-DD)

**ตอบเป็น JSON เท่านั้น (ไม่มีข้อความอื่น):**
{
  "agentName": "DataValidator",
  "passed": true,
  "issues": [],
  "suggestions": [],
  "rawOutput": "ข้อมูลครบถ้วน พร้อมส่ง"
}`,
    userMessage: `ตรวจสอบข้อมูลใบเสนอราคา:\n${JSON.stringify(quotation, null, 2)}`,
  });
}

// ===== Agent 2: BusinessRulesAgent =====
// บทบาท: ตรวจ business rules ของ JR Aluminium and Glass

export async function businessRulesAgent(
  quotation: QuotationInput,
  prevResult: AgentResult
): Promise<AgentResult> {
  return runAgent({
    name: "BusinessRulesChecker",
    systemPrompt: `คุณคือ BusinessRules Agent สำหรับ JR Aluminium and Glass

**หน้าที่:** ตรวจ business rules — รับ context จาก DataValidator มาด้วย

**Business Rules ที่ต้องตรวจ:**
1. discount_pct ≤ 2% (เกินนี้ถือว่า reject)
2. vat_rate ต้องเป็น 0 หรือ 7 เท่านั้น
3. wht_rate ต้องเป็น 0, 1, 1.5, 3, หรือ 5 เท่านั้น
4. unit_price แต่ละรายการต้องไม่ต่ำกว่า 100 บาท (งานอลูมิเนียม/กระจก)
5. ถ้า DataValidator ผ่าน ให้โฟกัส rules เท่านั้น ไม่ต้องตรวจความครบถ้วนซ้ำ

**ตอบเป็น JSON เท่านั้น:**
{
  "agentName": "BusinessRulesChecker",
  "passed": true,
  "issues": [],
  "suggestions": [],
  "rawOutput": "ผ่าน business rules ทุกข้อ"
}`,
    userMessage: `ผล DataValidator:\n${JSON.stringify(prevResult, null, 2)}\n\nข้อมูลใบเสนอราคา:\n${JSON.stringify(quotation, null, 2)}`,
  });
}

// ===== Agent 3: FinalReviewer =====
// บทบาท: ดู context ทั้งหมด → ตัดสินใจ verdict

export async function finalReviewerAgent(
  quotation: QuotationInput,
  results: AgentResult[]
): Promise<FinalResult> {
  const raw = await runAgent({
    name: "FinalReviewer",
    systemPrompt: `คุณคือ FinalReviewer Agent — ตัดสินใจขั้นสุดท้ายว่าใบเสนอราคาพร้อมส่งหรือไม่

**หลักเกณฑ์ verdict:**
- APPROVE        → ผ่านทุก agent, ไม่มี issues
- NEEDS_REVISION → มี suggestions เท่านั้น (ไม่มี issue ที่ passed=false)
- REJECT         → มีอย่างน้อย 1 agent ที่ passed=false หรือมี issues

**สรุป rawOutput ให้เป็นภาษาไทยสั้น ๆ สำหรับ user อ่าน**

**ตอบเป็น JSON เท่านั้น:**
{
  "agentName": "FinalReviewer",
  "verdict": "APPROVE",
  "passed": true,
  "issues": [],
  "suggestions": [],
  "rawOutput": "ใบเสนอราคาผ่านการตรวจสอบ พร้อมส่งให้ลูกค้า"
}`,
    userMessage: `ผลจาก agents ทั้งหมด:\n${JSON.stringify(results, null, 2)}\n\nข้อมูลสรุปใบเสนอราคา:\n${JSON.stringify(
      {
        items_count: quotation.items?.length ?? 0,
        discount_pct: quotation.discount_pct,
        vat_rate: quotation.vat_rate,
        wht_rate: quotation.wht_rate,
      },
      null,
      2
    )}`,
  });

  // ดึง verdict จาก rawOutput ของ agent
  // (raw.passed + issues ไม่เพียงพอ ต้อง cast verdict ด้วย)
  const verdictMatch = raw.rawOutput.match(/APPROVE|NEEDS_REVISION|REJECT/);
  const fromIssues: FinalResult["verdict"] =
    results.some((r) => !r.passed) ? "REJECT" : raw.issues.length > 0 ? "NEEDS_REVISION" : "APPROVE";

  return {
    ...raw,
    verdict: (verdictMatch?.[0] as FinalResult["verdict"]) ?? fromIssues,
  };
}
