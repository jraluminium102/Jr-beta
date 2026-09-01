-- 0127: ซ่อมงานที่ "ที่อยู่ว่าง" (customer_area) — เติมจากทะเบียนลูกค้า (บัคคุณธนัชชา 30 ส.ค.69)
--   ราก: จุดสร้าง job (promote คิว / วางบิล) เดิมไม่ก๊อป customers.address ลง jobs.customer_area
--   โค้ดจุดสร้างตอนวางบิลแก้แล้ว (billing.ts / billing-notes) · ตัวนี้ backfill ของเก่าที่ค้าง
-- ⚠ เติมเฉพาะแถวที่ "ว่างจริง" และทะเบียนมีที่อยู่ — ไม่ทับที่อยู่ไซต์ที่กรอกไว้แล้ว (บางไซต์ต่างจากทะเบียน)
update public.jobs j
set customer_area = c.address
from public.customers c
where j.customer_id = c.id
  and coalesce(nullif(btrim(j.customer_area), ''), '') = ''
  and coalesce(nullif(btrim(c.address), ''), '') <> '';
