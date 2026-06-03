/**
 * agents.ts — Core agent runner สำหรับ multi-agent pipeline
 *
 * หลักการ:
 * - แต่ละ agent คือ LLM call 1 ครั้ง พร้อม system prompt เฉพาะบทบาท
 * - agent ตอบเป็น JSON เสมอ (parse ง่าย ส่งต่อง่าย)
 * - ใช้ claude-haiku เพราะเร็ว+ถูก สำหรับงาน structured verification
 */

import Anthropic from "@anthropic-ai/sdk";

// lazy-init: สร้าง client ตอนเรียกใช้จริง (กัน build พังตอนยังไม่มี ANTHROPIC_API_KEY)
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ----- Types -----

export type AgentResult = {
  agentName: string;
  passed: boolean;
  issues: string[];       // ปัญหาที่ต้องแก้ก่อน (blocker)
  suggestions: string[];  // คำแนะนำ (ไม่ block แต่ควรทำ)
  rawOutput: string;      // สรุปภาษาธรรมดาสำหรับ user
};

export type FinalResult = AgentResult & {
  verdict: "APPROVE" | "NEEDS_REVISION" | "REJECT";
};

// ----- Core Runner -----

/**
 * runAgent — รัน 1 agent
 *
 * @param name        ชื่อ agent (สำหรับ logging / tracking)
 * @param systemPrompt บทบาทและ rule ของ agent นี้
 * @param userMessage  ข้อมูลที่ส่งให้ agent ตรวจ
 */
export async function runAgent(params: {
  name: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<AgentResult> {
  const msg = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001", // เร็ว ถูก เหมาะงาน verification
    max_tokens: 1024,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userMessage }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";

  // ดึง JSON จาก response (agent อาจมี text นำหน้า/ท้าย JSON ได้)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      agentName: params.name,
      passed: false,
      issues: [`${params.name}: ไม่สามารถ parse ผลลัพธ์ได้`],
      suggestions: [],
      rawOutput: text,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      agentName: params.name,
      passed: Boolean(parsed.passed),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      rawOutput: String(parsed.rawOutput ?? ""),
    };
  } catch {
    return {
      agentName: params.name,
      passed: false,
      issues: [`${params.name}: JSON parse error`],
      suggestions: [],
      rawOutput: text,
    };
  }
}
