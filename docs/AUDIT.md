# AUDIT — ช่องโหว่การไหลของ Flow ลูกค้า 24 Stage (JR Beta)

Entity หลัก = `public.jobs`. (จากทีม agent flow-mapper + bug-hunter)

| ID | Stage | อาการ | Root cause | ไฟล์ | Priority | สถานะ |
|----|-------|-------|------------|------|----------|-------|
| C1 | 1→3 | Job `LEAD` เปิด drawer ไม่มีปุ่ม/ฟอร์ม = "ติดที่เดิม" | QuoteEditor/ปุ่มมัดจำ ไม่ครอบ LEAD | JobDrawer.tsx | CRITICAL | ✅ แก้ (StageAdvanceButton) |
| C2 | ทุก stage | `JOB_STATUS["LEAD"]` undefined → chip เปล่า/crash | constants ขาด 3 enum | constants.ts | CRITICAL | ✅ แก้ |
| C3 | ทุก stage | type `JobStatus` ขาด 3 ค่า ที่ DB มี | hand-maintained type | database.types.ts | CRITICAL | ✅ แก้ |
| C4 | 1→3 | set LEAD โดน zod reject | statusSchema ไม่รับ LEAD | api/jobs/[id]/route.ts | CRITICAL | ✅ แก้ |
| H1 | 1→2 | promote คิวสำเร็จ แต่ไม่แจ้ง/ไม่ลิงก์งาน | ทิ้ง meta.job_id | QueueModal.tsx | HIGH | ✅ แก้ (alert แจ้ง) |
| G3 | 5 | ใบเสนอราคาดึงลูกค้าจากทะเบียนไม่ได้ + ไม่ผูก job | QuotationForm ไม่ pre-select / ไม่ set job_id | QuotationForm.tsx | MED | 🔜 ทำต่อ |
| H2 | 19→20 | READY แล้ว tab ติดตั้งว่างถ้า trigger ไม่ติด | ไม่มี POST /api/installation fallback | api/installation | HIGH | 🔜 ทำต่อ |
| H3 | 8→24 | สถานะข้าม entity ย้อนได้อิสระ | production/installation PATCH ไม่มี guard | api/production[id], installation[id] | HIGH | 🔜 ทำต่อ |
| G1/G2 | 3,4,6,14 | stage ย่อยไม่เห็นว่าอยู่ไหน | ไม่มี status เฉพาะ | — | MED | ✅ แก้ด้วย current_stage |
| M1 | — | derivePhase default คืน LEAD เงียบ | ไม่ log | followup.ts | LOW | 🔜 |
| M2 | 1-2 | คิว PATCH name="" → null bypass | clean() ก่อน validate | api/queue/[id] | LOW | 🔜 |

## Breakpoints หลัก (สถานะการอุด)
- **Queue→Job (1→2):** RPC promote_queue_to_job (มี) + แจ้งผล H1 ✅
- **LEAD ตัน (2→3):** StageAdvanceButton + C1–C4 ✅ ← **แก้เคสคุณเอ**
- **Deposit→Production (8→9):** tg_on_deposit (มี) + advance_stage ✅
- **Production→Installation (19→20):** tg_production_changes (มี) + H2 fallback 🔜
- **Quote↔Job (5):** G3 pre-select + set job_id 🔜
