-- 0122: ช่องทางติดต่อลูกค้า (LINE/FB/IG) เก็บที่ทะเบียนลูกค้า + ขึ้นเอกสารให้ถูกช่อง
--
-- บั๊กที่เจ้าของแจ้ง 6 ส.ค.2569: หน้าจัดคิวเลือกช่องทาง = FB แต่ใบเสนอ/ใบวางบิล/ใบเสร็จ
-- ยังพิมพ์ "LINE: <ชื่อ>" อยู่ดี
--
-- ต้นเหตุ: contact_channel มีเฉพาะบน queue_entries (0043) · ทะเบียนลูกค้ามีแต่ line_id
-- (ไม่มีช่อง "ช่องทาง") → ตอนสร้างใบเสนอ snapshot ก็ไม่มีช่องทางติดไป · หัวเอกสารเลย
-- hardcode คำว่า LINE ไว้ตายตัว
--
-- แก้: ให้ทะเบียนลูกค้าเก็บช่องทางเอง แล้ว snapshot/หัวเอกสารอ่านจากตรงนี้

alter table public.customers
  add column if not exists contact_channel text not null default 'LINE';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_contact_channel_chk') then
    alter table public.customers
      add constraint customers_contact_channel_chk
      check (contact_channel in ('LINE','FB','IG','OTHER')) not valid;
    alter table public.customers validate constraint customers_contact_channel_chk;
  end if;
end $$;

comment on column public.customers.contact_channel is
  'ช่องทางติดต่อ: LINE | FB | IG | OTHER (0122) — คู่กับ line_id ที่เก็บชื่อ/handle · หัวเอกสารพิมพ์ตามช่องนี้';

-- ── backfill: ลูกค้าที่เคยมีคิว → เอาช่องทางจากคิว "ล่าสุด" ของลูกค้าคนนั้น ──
--    จับคู่ 2 ทาง: (1) คิวที่ผูก customer_id ตรง ๆ  (2) คิวที่ผูกผ่าน job ของลูกค้าคนนั้น
--    เฉพาะที่ยังเป็นค่า default 'LINE' — ไม่ทับของที่คนแก้เองไว้แล้ว
with latest as (
  select distinct on (cid) cid, contact_channel
  from (
    select q.target_customer_id as cid, q.contact_channel, q.created_at
      from public.queue_entries q
     where q.target_customer_id is not null
       and q.contact_channel is not null
    union all
    select j.customer_id as cid, q.contact_channel, q.created_at
      from public.queue_entries q
      join public.jobs j on j.id = q.target_job_id
     where j.customer_id is not null
       and q.contact_channel is not null
  ) s
  where cid is not null
  order by cid, created_at desc
)
update public.customers c
   set contact_channel = latest.contact_channel
  from latest
 where c.id = latest.cid
   and latest.contact_channel <> 'LINE'   -- LINE = ค่า default อยู่แล้ว ไม่ต้องเขียนซ้ำ
   and c.contact_channel = 'LINE';

notify pgrst, 'reload schema';
