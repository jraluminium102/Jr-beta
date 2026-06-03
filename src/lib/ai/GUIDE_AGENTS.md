# คู่มือ Multi-Agent Verification System

## แนวคิด

**Multi-Agent** = AI หลายตัว แต่ละตัวมีบทบาทเดียว → ตรวจซ้ำกันเองได้

ต่างจาก 1 prompt ใหญ่ตรงที่:
- แต่ละ agent โฟกัสเรื่องเดียว → ผลแม่นกว่า
- ถ้า agent 1 ผิด agent 3 จับได้
- เพิ่ม/แทน agent ได้โดยไม่กระทบตัวอื่น

---

## Pipeline ของ JR ERP

```
POST /api/ai/verify-quotation
        │
        ▼
  [Agent 1] DataValidator
  ตรวจ: items ครบ, qty>0, customer มี
        │ ส่งผล step1
        ▼
  [Agent 2] BusinessRulesChecker
  ตรวจ: discount≤2%, vat=0/7, wht valid
        │ ส่งผล step1 + step2
        ▼
  [Agent 3] FinalReviewer
  สรุป: APPROVE / NEEDS_REVISION / REJECT
```

---

## โครงสร้างไฟล์

```
src/lib/ai/
  agents.ts              ← core runner (ใช้ซ้ำทุก agent)
  quotation-agents.ts    ← 3 agents เฉพาะใบเสนอราคา

src/app/api/ai/
  verify-quotation/
    route.ts             ← endpoint ที่ frontend เรียก
```

---

## วิธีติดตั้ง

### 1. ติดตั้ง SDK
```bash
npm install @anthropic-ai/sdk
```

### 2. เพิ่ม API Key ใน .env.local
```
ANTHROPIC_API_KEY=sk-ant-...
```

> ดู key ได้ที่: https://console.anthropic.com

### 3. ตรวจสอบ .env.local.example มีตัวอย่างแล้ว

---

## วิธีเรียกจาก Frontend

```typescript
// ใน quotation form ก่อนกด Submit
const res = await fetch("/api/ai/verify-quotation", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(formData),
});

const { verdict, canSubmit, agents } = await res.json();

if (!canSubmit) {
  // แสดง issues จาก agents
  const issues = agents.flatMap((a) => a.issues);
  showWarning(issues);
  return;
}

// ถ้า canSubmit === true → ส่งต่อไปที่ POST /api/quotations
```

---

## Response ตัวอย่าง

```json
{
  "data": {
    "agents": [
      {
        "agentName": "DataValidator",
        "passed": true,
        "issues": [],
        "suggestions": ["ควรใส่ detail ของรายการที่ 2"],
        "rawOutput": "ข้อมูลครบถ้วน"
      },
      {
        "agentName": "BusinessRulesChecker",
        "passed": false,
        "issues": ["discount_pct = 5% เกินกว่า 2% ที่อนุญาต"],
        "suggestions": [],
        "rawOutput": "ส่วนลดเกินกำหนด"
      },
      {
        "agentName": "FinalReviewer",
        "verdict": "REJECT",
        "passed": false,
        "issues": ["ส่วนลดเกิน 2% — ต้องแก้ก่อน submit"],
        "suggestions": [],
        "rawOutput": "ใบเสนอราคายังไม่พร้อมส่ง เนื่องจากส่วนลดเกินกำหนด"
      }
    ],
    "verdict": "REJECT",
    "canSubmit": false
  }
}
```

---

## เพิ่ม Agent ใหม่

ตัวอย่าง: เพิ่ม Agent 4 ตรวจราคาตลาด

```typescript
// ใน quotation-agents.ts
export async function marketPriceAgent(
  quotation: QuotationInput,
  prevResults: AgentResult[]
): Promise<AgentResult> {
  return runAgent({
    name: "MarketPriceChecker",
    systemPrompt: `ตรวจว่า unit_price สมเหตุสมผลตามราคาตลาดอลูมิเนียม/กระจก...`,
    userMessage: `...`,
  });
}
```

แล้วเพิ่มใน route.ts:
```typescript
const step4 = await marketPriceAgent(body, [step1, step2, step3]);
const step5 = await finalReviewerAgent(body, [step1, step2, step3, step4]);
```

---

## ค่าใช้จ่าย (ประมาณ)

| Agent | Tokens | ราคา/ครั้ง |
|-------|--------|-----------|
| DataValidator | ~500 | ~$0.0002 |
| BusinessRules | ~800 | ~$0.0003 |
| FinalReviewer | ~1000 | ~$0.0004 |
| **รวม 3 agents** | ~2300 | **~$0.001** |

ใช้ Haiku → ถูกมาก ไม่ต้องกังวล

---

## Key Concept สรุป

```
1 Agent  =  1 system prompt + 1 LLM call + JSON output
Pipeline =  agents รันตามลำดับ ส่ง context ต่อกัน
Verdict  =  FinalReviewer ตัดสินใจ APPROVE / NEEDS_REVISION / REJECT
```
