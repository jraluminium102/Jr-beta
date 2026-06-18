# STATE_MACHINE — 24 Stage บน `public.jobs`

`jobs.current_stage` (1–24) = single source of truth ของ UI · status enum เดิม = derived/sync (trigger เก่า + report ไม่พัง). เพิ่มแค่ 2 field + 2 RPC (migration 0014). ไม่แตะ enum เดิม.

## Stage → Status mapping
`J=jobs.status` (sync โดย `_sync_legacy_status`) · P=productions.status · I=installations.status (ตั้งโดยฟอร์มเดิม)

| # | Stage | J (sync) | P/I | กลไกเดิมที่ reuse |
|--|--|--|--|--|
| 1 | ลูกค้านัดดูหน้างาน | LEAD | — | queue_entries |
| 2 | บันทึกเข้าทะเบียนลูกค้า | LEAD | — | RPC promote_queue_to_job |
| 3 | ฝ่ายแบบวาดแบบ | PENDING_QUOTE | — | designer_id/design_start |
| 4 | เซลล์ตรวจแบบ (loop→3) | PENDING_QUOTE | — | — |
| 5 | ทำใบเสนอราคา | PENDING_QUOTE | — | quotations(draft)+job_id |
| 6 | เจรจาราคา (loop→5) | PENDING_QUOTE | — | quotations |
| 7 | ส่งใบเสนอ | QUOTE_SENT | — | quote_sent_date |
| 8 | ลูกค้ามัดจำ | *(deposit flow)* | →P:PENDING_MEASURE | **tg_on_deposit** |
| 9–14 | รอวัด→เข้าวัด→ประชุม→แก้แบบ(loop→11)→คอนเฟิร์ม→เอกสาร | IN_PRODUCTION | P:MEASURE..PENDING_CONFIRM | productions + customer_confirmed |
| 15–19 | ลงคิวผลิต→สั่งอลู→สั่งกระจก→ผลิต→QC | IN_PRODUCTION | P:QUEUED..QC | production_queued/alum/glass_order_date |
| 20 | ผลิตเสร็จ/รอติดตั้ง | *(production READY)* | P:READY→I:PENDING | **tg_production_changes** |
| 21–23 | เข้าติดตั้ง→รอตรวจรับ→แก้งาน(loop→22) | INSTALLING | I:INSTALLING..REVISING | installations |
| 24 | ส่งงาน+รับประกัน | COMPLETED | I:COMPLETED | installations |

## Valid transitions (บังคับใน RPC `advance_stage`)
```
forward : n → n+1 (1..23)
loops   : 4→3, 6→5, 12→11, 23→22  (เท่านั้น)
blocked : skip (>+1) ❌ · ย้อนนอก whitelist ❌ · จาก 24 ต่อ ❌
guard   : ADMIN เท่านั้น · atomic (for update) · เขียน stage_history
sync    : ข้าม stage 8/20 → ปล่อย trigger เดิม (มัดจำ / READY)
```

## ปุ่ม "ไปขั้นต่อไป" — component `<StageAdvanceButton>` (วางบนสุด JobDrawer)
- อ่าน label จาก `src/lib/stages.ts` · เรียก `POST /api/jobs/[id]/advance` → RPC
- forward `→ {ชื่อ stage ถัดไป}` + loop `↩ {ชื่อ stage ย้อน}` (ถ้ามี)
- stage 24 → badge "จบงานแล้ว" ไม่มีปุ่มต่อ
- ฟอร์มเฉพาะเดิม (DepositForm / ProductionStepModal / installation) ยังใช้กรอกข้อมูลคู่กันได้
