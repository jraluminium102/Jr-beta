# E2E_TEST_RESULT — State Machine 24 Stage (คุณเอ 1→24)

วิธี: logic review โดย agent e2e-tester + regression-tester (อ่านโค้ด) · รอบ 1 เจอ 3 ปัญหา → แก้ครบ

## รอบ 1 — ผล + การแก้
| ปัญหา | severity | สถานะ |
|------|----------|-------|
| promote_queue_to_job ไม่ set current_stage (job ใหม่เริ่ม stage 1) | BLOCKER | ✅ แก้ 0015 (set stage=2) |
| stage 8 (มัดจำ): advance ตรง → ไม่ยิง tg_on_deposit → ไม่สร้าง production | HIGH | ✅ แก้ 0015 (deposit→stage 9 อัตโนมัติ) + StageAdvanceButton ใช้ฟอร์ม |
| stage 20 (READY): advance ตรง → ไม่ยิง tg_production_changes → ไม่สร้าง installation | HIGH | ✅ แก้ 0015 (READY→stage 20 อัตโนมัติ) + StageAdvanceButton ใช้ฟอร์ม |

## Flow คุณเอ 1→24 (หลังแก้)
| ช่วง | กลไก | ผล |
|------|------|-----|
| คิว DONE → job (stage 2) | promote_queue_to_job (current_stage=2) | ✅ |
| 2→7 (ทะเบียน→วาดแบบ→ตรวจ→ใบเสนอ→เจรจา→ส่ง) | StageAdvanceButton + loop 4→3/6→5 | ✅ |
| 8 มัดจำ | DepositForm (status DEPOSITED) → tg_on_deposit สร้าง production + เลื่อน stage 9 | ✅ auto |
| 9→19 (วัด→ประชุม→แก้แบบ loop→คอนเฟิร์ม→เอกสาร→ผลิต→QC) | StageAdvanceButton + ProductionStepModal | ✅ |
| 20 พร้อมติดตั้ง | Production READY → tg_production_changes สร้าง installation + เลื่อน stage 20 | ✅ auto |
| 21→23 (ติดตั้ง→ตรวจรับ→แก้งาน loop) | StageAdvanceButton + installation | ✅ |
| 24 ส่งงาน | installation COMPLETED → tg_installation_changes ตั้ง job COMPLETED + stage 24 + warranty | ✅ auto |

## Regression
- เติม enum LEAD/IN_PRODUCTION/INSTALLING ใน JOB_STATUS/JobStatus/zod/derivePhase → ครบ ไม่มี type error/crash (Chip, dashboard, deposit, production/installation ทำงานเดิม)
- ปุ่ม advance validate ที่ DB (forward+1 / loop whitelist / กัน skip / กันย้อนผิด / stage 24 จบ)

## คงเหลือ (next, ไม่ block flow หลัก)
- G3 ใบเสนอราคา pre-select ลูกค้าจากทะเบียน + ผูก job_id
- H3 guard ย้อนสถานะข้าม entity (production/installation PATCH)
- M1/M2 hardening
