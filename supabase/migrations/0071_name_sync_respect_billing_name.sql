-- ============================================================
-- 0071 · SYNC guard: แก้ชื่อลูกค้า → อย่าทับ "นามออกบิล" บนเอกสาร
--
-- ปัญหา: 0051 tg_sync_customer_name เวลาแก้ customers.name จะเขียน snapshot->>'name'
--   ของ "ทุกเอกสาร" ของลูกค้า → ถ้าเอกสารเลือกออกในนามบริษัท (name = ชื่อบริษัท)
--   จะโดนทับเป็นชื่อลูกค้า = นามบิลหาย (ผิดหลักภาษี + ที่ผู้ใช้ย้ำ "ทุกอย่างต้องซิงก์")
--
-- แก้: apply_customer_name รับ p_old_name → เอกสารอัปเดต snapshot.name
--   "เฉพาะใบที่เคยใช้ชื่อลูกค้าเดิม (= p_old_name)" · ใบที่ใช้นามบริษัท/นามอื่นไม่แตะ
--   (jobs/queue_entries ยังตามชื่อลูกค้าเสมอ เพราะไม่ใช่นามบิล)
-- idempotent · เจ้าของรัน
-- ============================================================

create or replace function public.apply_customer_name(p_id bigint, p_old_name text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- เฟสปฏิบัติงาน: customer_name = ชื่อลูกค้าเสมอ (ไม่ใช่นามบิล) → อัปเดตทั้งหมด
  update public.jobs set customer_name = p_name
   where customer_id = p_id and customer_name is distinct from p_name;
  update public.queue_entries set customer_name = p_name
   where customer_id = p_id and customer_name is distinct from p_name;

  -- เอกสาร: อัปเดต snapshot.name เฉพาะใบที่ "เคยใช้ชื่อลูกค้าเดิม" (p_old_name)
  --   → ใบที่เลือกนามบริษัท/นามอื่นไว้ (name ≠ ชื่อลูกค้า) จะไม่โดนทับ
  update public.quotations
     set customer_snapshot = jsonb_set(customer_snapshot, '{name}', to_jsonb(p_name))
   where customer_id = p_id and customer_snapshot->>'name' = p_old_name;

  update public.billing_notes b
     set customer_snapshot = jsonb_set(b.customer_snapshot, '{name}', to_jsonb(p_name))
    from public.quotations q
   where b.quotation_id = q.id and q.customer_id = p_id and b.customer_snapshot->>'name' = p_old_name;

  update public.receipts r
     set customer_snapshot = jsonb_set(r.customer_snapshot, '{name}', to_jsonb(p_name))
    from public.billing_notes b
    join public.quotations q on b.quotation_id = q.id
   where r.billing_note_id = b.id and q.customer_id = p_id and r.customer_snapshot->>'name' = p_old_name;

  update public.production_orders p
     set customer_snapshot = jsonb_set(p.customer_snapshot, '{name}', to_jsonb(p_name))
    from public.quotations q
   where p.quotation_id = q.id and q.customer_id = p_id and p.customer_snapshot->>'name' = p_old_name;

  update public.warranties w
     set customer_snapshot = jsonb_set(w.customer_snapshot, '{name}', to_jsonb(p_name))
    from public.quotations q
   where w.quotation_id = q.id and q.customer_id = p_id and w.customer_snapshot->>'name' = p_old_name;

  update public.boqs bo
     set customer_snapshot = jsonb_set(bo.customer_snapshot, '{name}', to_jsonb(p_name))
   where (bo.job_id in (select id from public.jobs where customer_id = p_id)
       or bo.quotation_id in (select id from public.quotations where customer_id = p_id))
     and bo.customer_snapshot->>'name' = p_old_name;
end $$;

-- trigger ส่ง old.name เข้าไปด้วย
create or replace function public.tg_sync_customer_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    perform public.apply_customer_name(new.id, old.name, new.name);
  end if;
  return new;
end $$;

-- ลบเวอร์ชัน 2-arg เดิม (ไม่มี live caller — เหลือแต่ reconcile ที่รันครั้งเดียวไปแล้ว)
drop function if exists public.apply_customer_name(bigint, text);

-- ใบเสนอเก็บนามออกบิลที่เลือก (trace + โชว์ตอนแก้)
alter table public.quotations add column if not exists billing_profile_id bigint;
