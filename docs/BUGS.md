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
