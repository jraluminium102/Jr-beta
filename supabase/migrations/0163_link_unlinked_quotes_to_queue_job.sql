-- 0163 · ผูกใบเสนอที่หลุดงาน กลับเข้างานจากคิวประเมิน (ครั้งเดียว · ย้อนหลัง)
--
-- เจ้าของแจ้ง 26 ต.ค.69: "สร้างใบเสนอจากคิวประเมินตามปกติ ส่วนมากก็ผูกงาน แต่บางใบไม่ผูก"
--   ต้นเหตุ: 0156 ปิด trigger trg_quotation_link ที่เคยยัดใบไม่มีงานเข้างานล่าสุดของลูกค้า
--   → ใบที่สร้างหลังจากนั้น (ไม่ได้มาจากปุ่มในเช็คลิสต์) ไม่ได้ผูกงานคิวประเมิน
--   แอปแก้แล้ว (POST /api/quotations ผูกงานว่างงานเดียวให้เอง) · ไฟล์นี้เก็บกวาดใบที่หลุดไปแล้ว
--
-- ผูกเฉพาะกรณีชัดเจน (ไม่เดา):
--   ลูกค้ามีใบเสนอที่ยังไม่ผูกงาน (ไม่ยกเลิก · ไม่มีบิล) "ใบเดียว"
--   และมีงาน active ที่ "ว่าง" (ไม่มีใบเสนอที่ใช้งานอยู่ + ไม่มีบิล) "งานเดียว"
--   นอกนั้นปล่อยไว้ (วางบิลแล้วได้งานใหม่ตามปกติ)
-- idempotent · รันซ้ำได้ · เจ้าของรัน

with unlinked as (
  select q.id, q.customer_id
    from public.quotations q
   where q.job_id is null
     and q.status <> 'cancelled'
     and q.customer_id is not null
     and not exists (select 1 from public.billing_notes b where b.quotation_id = q.id and b.status <> 'cancelled')
),
one_unlinked as (
  select customer_id, min(id) as quotation_id
    from unlinked
   group by customer_id
  having count(*) = 1
),
empty_jobs as (
  select j.id as job_id, j.customer_id
    from public.jobs j
   where j.status not in ('COMPLETED', 'CANCELLED')
     and not exists (select 1 from public.quotations q2 where q2.job_id = j.id and q2.status <> 'cancelled')
     and not exists (select 1 from public.billing_notes b2 where b2.job_id = j.id and b2.status <> 'cancelled')
),
one_empty as (
  select customer_id, min(job_id::text)::uuid as job_id
    from empty_jobs
   group by customer_id
  having count(*) = 1
)
update public.quotations q
   set job_id = e.job_id
  from one_unlinked u
  join one_empty e on e.customer_id = u.customer_id
 where q.id = u.quotation_id
   and q.job_id is null;

-- ตรวจผล: ใบที่ยังไม่ผูกงาน (ไม่ยกเลิก) ที่เหลือ — ส่วนใหญ่ควรเป็นลูกค้าที่ไม่มีงานจากคิว หรือมีหลายใบ/หลายงาน
select q.code as ใบเสนอ, q.customer_snapshot->>'name' as ลูกค้า, q.status as สถานะ, q.created_at::date as วันที่
  from public.quotations q
 where q.job_id is null and q.status <> 'cancelled'
 order by q.created_at desc
 limit 50;
