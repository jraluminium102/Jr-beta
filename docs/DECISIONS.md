# DECISIONS — เชื่อม flow ลูกค้า 24 stage (autonomous)

บันทึกการตัดสินใจระหว่างทำ (โหมด autonomous — ไม่หยุดถาม, ตัดสินตาม best practice)

| # | ประเด็น | ตัดสินใจ | เหตุผล |
|---|--------|---------|--------|
| D1 | entity ของ "1 ลูกค้า = 1 flow" | ใช้ `public.jobs` (UUID) เป็นแกน ต่อยอด journey backbone เดิม | jobs เป็นแกนร้อยเฟสอยู่แล้ว (0012) + เชื่อม queue/quotation/production/installation |
| D2 | field ใหม่ (ตาม scope ห้ามเกิน 2) | `jobs.current_stage smallint` (1–24) + `jobs.stage_history jsonb` | ตรง scope; ไม่แตะ schema เดิม |
| D3 | DB ที่ deploy ใช้จริง | project **A** = `whjoyqpgyyjbcwscmyel` (org jraluminium) — รัน migration ที่นี่ | ยืนยันแล้วจาก session ก่อน (เว็บอ่าน A, ข้อมูลลูกค้าอยู่ A) |
| D4 | ห้ามทำ | ไม่ rewrite UI, ไม่เปลี่ยน framework, ไม่แตะ Google Sheets/Apps Script | ตาม scope HANDOFF |
| D5 | 24 stage detail | stage 15–19 (ผลิต) / 20–24 (ติดตั้ง) ที่ handoff ย่อไว้ → ขยายตาม productions/installations status เดิม | reuse สถานะที่มี ไม่สร้างใหม่ |
| D6 | re-use logic เดิม | promote_queue_to_job (carry-forward), tg_on_deposit (มัดจำ→production), tg_production_changes | กัน duplicate + ตาม scope "เพิ่มน้อยสุด" |

| D7 | stage 8(มัดจำ)/20(READY) sync | ไม่ให้ StageAdvanceButton advance ตรง — ใช้ฟอร์มเดิม (DepositForm/Production READY) แล้ว **trigger เลื่อน current_stage ให้อัตโนมัติ** (0015) | กันมัดจำไม่มียอด + กัน production/installation ไม่ถูกสร้าง (ผล E2E HIGH-2/3) |
| D8 | promote เริ่ม stage | job ใหม่จากคิว = current_stage 2 (เข้าทะเบียนแล้ว) ไม่ใช่ 1 | ผ่านการนัด+ประเมินมาแล้ว (E2E BLOCKER-1) |

(เพิ่มรายการระหว่างทำ)
