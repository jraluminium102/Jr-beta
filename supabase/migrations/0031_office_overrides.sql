-- ============================================================
-- JR — 0031 override วันอยู่ออฟฟิศรายวัน (per-date office override)
-- เดิม office_slots เป็น pattern ประจำสัปดาห์ (0030) — แก้ทีกระทบทุกสัปดาห์
-- เพิ่มชั้น override รายวัน: เอาออก/ใส่ออฟฟิศ "เฉพาะวันนั้น" โดยไม่แตะ pattern
--   office_overrides = array ของ {"date":"YYYY-MM-DD","half":"AM|PM","action":"add|remove"}
--     action=remove → ยกเลิก office ของ pattern เฉพาะวันนั้น (เช่น งานด่วน ออกประเมินแทน)
--     action=add    → ใส่ office เพิ่มเฉพาะวันนั้น (เช่น ย้ายออฟฟิศมาวันนี้)
-- effective office(date,half) = ถ้ามี override → ตาม action · ไม่มี → ตาม pattern(weekday,half)
-- idempotent — รันซ้ำได้
-- ============================================================

alter table public.queue_sales
  add column if not exists office_overrides jsonb not null default '[]'::jsonb;

comment on column public.queue_sales.office_overrides is
  'override วันอยู่ออฟฟิศรายวัน — array {"date","half":"AM|PM","action":"add|remove"} ทับ pattern office_slots เฉพาะวันนั้น';
