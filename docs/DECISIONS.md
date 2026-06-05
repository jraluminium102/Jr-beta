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

---

## รอบ refactor เอกสารการเงิน (autonomous)

| # | ประเด็น | ตัดสินใจ | เหตุผล |
|---|--------|---------|--------|
| **DF1** | ⚠️ premise ของ goal ขัดกับโค้ดจริง — goal บอก "web team สร้าง quote ผิดหน้า (ที่ใบเสนอ) ต้องย้ายไปหน้าคิดราคา" | **ไม่ย้าย** — ทีม agent ยืนยันว่า `quotations/page.tsx` เป็น **list view อยู่แล้ว**, create อยู่ที่ `quotations/new` ซึ่ง**ดึงราคาจากหน้าคิดราคา** (`/calculator`) ผ่าน sessionStorage อยู่แล้ว. โครงถูกตาม flow ที่ต้องการแล้ว → โฟกัส bug จริง (A1) + ช่องว่าง wiring (A4) แทนการรื้อที่ถูกอยู่แล้ว | "เจอข้อขัดแย้ง → log + continue"; การย้ายที่ถูกอยู่แล้วจะ rewrite UI (ผิด scope) + เสี่ยงพังของที่ทำงาน |
| **DF2** | กฎแบ่งงวด 4 tier ที่สั่งใหม่ | **ไม่ต้องเขียนใหม่** — `money.ts:suggestInstallments` มีสูตรตรงเป๊ะอยู่แล้ว (70/30 · 40/50/10 · 35/30/res/40k · 25×3/res/40k, RETENTION=40000) | ตรวจ node แล้ว sum=total ทุก tier; เขียนซ้ำ = A3 duplication |
| **DF3** | tax (VAT/WHT/discount) | ใช้ `money.ts:computeTotals` (canonical) — **ลบ** `tax.ts`/`installments.ts` ที่เผลอสร้างรอบนี้ | computeTotals รองรับครบ + ถูกตามภาษีไทย; กัน source ซ้อน |
| **DF4** | A1 (P0) แก้ที่ไหน | helper เดียว `lib/billing.ts:applyInstallmentPayment` ใช้ร่วมทั้ง `/pay` + `/receipts` | กัน logic แตกสองทาง (root cause เดิมคือ logic อยู่แค่ฝั่ง pay) |
| **DF5** | A1 ใบเสร็จ sync งวดพลาด | ใบเสร็จออกสำเร็จแล้ว **ไม่ rollback** ถ้าปิดงวดพลาด — คืน `warn` แทน | กันใบเสร็จ (เอกสารภาษี) หายเพราะ side-effect รอง |
| **DF6** | A2 (P0 VAT meaning) | **เลื่อนทำรอบถัดไป** + documented | fix แตะ chain หลายจุด (QT→BL→INV) กระทบยอดเงิน → ต้องมี regression test ยอดก่อนทำ กันออกใบกำกับผิด |
| **DF7** | numbering | **ไม่แตะ** RPC `next_document_code` (atomic, reset เดือน ถูกแล้ว) | scope = connect ไม่ใช่ rewrite; client ห้าม gen running เอง (race) |
