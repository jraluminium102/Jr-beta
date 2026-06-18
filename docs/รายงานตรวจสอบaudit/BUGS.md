# BUGS — flow 24 stage (เจอ + แก้)

จากทีม bug-hunter + ระหว่าง implement

| ID | Severity | bug | fix | commit |
|----|----------|-----|-----|--------|
| C1 | CRITICAL | job `LEAD` เปิด drawer ไม่มี action = ติดที่เดิม | StageAdvanceButton บนสุด JobDrawer | 48cb08f |
| C2 | CRITICAL | `JOB_STATUS[LEAD/IN_PRODUCTION/INSTALLING]` undefined → crash/chip เปล่า | เติม 3 key ใน constants.ts | 48cb08f |
| C3 | CRITICAL | type `JobStatus` ขาด 3 ค่า ที่ enum DB มี | เติมใน database.types.ts | 48cb08f |
| C4 | CRITICAL | jobs PATCH zod reject LEAD/IN_PRODUCTION/INSTALLING | เติมใน statusSchema | 48cb08f |
| H1 | HIGH | promote คิวสำเร็จไม่แจ้งผล | alert "บันทึกเข้าทะเบียน+สร้างงานแล้ว" | 48cb08f |

## ค้าง (ทำต่อ)
| ID | Severity | bug | แผนแก้ |
|----|----------|-----|--------|
| G3 | MED | ใบเสนอราคาดึงลูกค้าจากทะเบียนไม่ได้ + ไม่ผูก quotations.job_id | pre-select dropdown ด้วย jobs.customer_id + set job_id ตอน submit |
| H2 | HIGH | tab ติดตั้งว่างถ้า trigger ไม่ติด | POST /api/installation (idempotent) + ปุ่ม "เปิดงานติดตั้ง" |
| H3 | HIGH | production/installation ย้อนสถานะข้าม entity ได้ | guard transition ใน PATCH + sync jobs.status |
| M1 | LOW | derivePhase default LEAD เงียบ | log/throw |
| M2 | LOW | คิว PATCH customer_name="" → null | validate ก่อน clean() |

---

# BUGS — เอกสารการเงิน (รอบ refactor finance)

จากทีม agent 8 ตัว (architecture-mapper ฯลฯ) เรียง critical → low

| ID | Severity | bug | root cause | fix | สถานะ |
|----|----------|-----|-----------|-----|-------|
| A1 | 🔴 CRITICAL | ออกใบเสร็จต่องวด → งวดไม่ถูกปิด + ใบวางบิลไม่ recompute → บิลโผล่ dropdown ซ้ำ, ยอดค้างผิด | `POST /receipts` เก็บ `installment_id` แต่ไม่อัปเดต `billing_installments`/`billing_notes` (logic ถูกมีแต่ใน `/pay`) | helper เดียว `lib/billing.ts:applyInstallmentPayment` → ใช้ทั้ง `/pay` + `/receipts` | ✅ แก้แล้ว |
| A2 | 🔴 CRITICAL | ใบเสร็จถอด VAT ย้อนกลับจาก `net` (หัก WHT แล้ว) → ยอดก่อน VAT ในใบกำกับไม่ตรง subtotal QT | `billing_notes.total=q.net` แต่ receipts คิด vat จากยอดนั้น | (planned) carry subtotal/vat_rate QT→BL ผ่าน join `quotation_id`, ใบเสร็จ default = QT.subtotal | 📋 documented |
| A3 | 🟠 MED | logic VAT/แบ่งงวดเสี่ยงซ้ำซ้อน | `finance.ts:calcFinancials` + ไฟล์ `installments/tax` ที่เพิ่งสร้างซ้ำ money.ts | ลบ `installments.ts`/`tax.ts` (ไม่มีใคร import) ใช้ money.ts source เดียว · calcFinancials deferred | ◑ partial |
| A4 | 🟠 MED | calc→ใบเสนอ ได้ลูกค้าแค่ชื่อ ไม่มี `customer_id` → เลือก dropdown ซ้ำ | sessionStorage bridge ส่งแค่ชื่อ | fuzzy-match ชื่อกับทะเบียน (`QuotationForm`) → preselect dropdown + hint ✓/⚠️ | ✅ แก้แล้ว |
| A5/A6 | 🟡 LOW | create logic inline · ไม่มี automated test | — | service extraction · vitest | deferred (มี node verify) |

> หมายเหตุ: A2 fix แตะ chain หลายจุด (กระทบยอดเงิน) → แยกทำรอบถัดไป กัน regression · ไม่แตะ `computeTotals`/`suggestInstallments`/`next_document_code`
