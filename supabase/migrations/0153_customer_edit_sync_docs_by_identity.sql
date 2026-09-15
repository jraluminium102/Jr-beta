-- ============================================================
-- 0153 · แก้ทะเบียนลูกค้า → เอกสารที่ผูก "อัปเดตตาม" แต่เฉพาะใบที่ออกในตัวตนที่แก้ (เจ้าของสั่ง 15 ก.ย.69)
--
-- ปัญหา: คีย์ที่อยู่ผิด (กรุงเทพหมานคร) ออกเอกสารไปแล้ว · แก้ทะเบียนแล้วเอกสารไม่ตาม
-- กฎเจ้าของ (ระวังบัค): อัปเดตทุกฟิลด์ (ชื่อ/ที่อยู่/เลขภาษี/เบอร์/ผู้ติดต่อ) แต่ **เฉพาะเอกสารที่ค่าเดิม
--   ตรงกับค่าลูกค้าเดิม** = ใบที่ออกในนาม/ที่อยู่ "ตัวตนนี้" เท่านั้น · ใบที่ออกในนามบริษัท/นามอื่น (ค่าต่าง) ไม่โดนแตะ
--   เช่น แก้ที่อยู่หน้างาน แต่บิลออกในนามบริษัท (ที่อยู่บริษัท) → บิลคงเดิม
--
-- ทำไมปลอดภัย (ต่างจากที่ 0143 ปิดไว้): 0143 ปิดเพราะบั๊กหัวเอกสารเขียน customers.name แล้วทับทุกใบ
--   ตอนนี้ (ก) หัวเอกสารไม่แตะ customers.name แล้ว (ข) จับคู่ต่อฟิลด์ด้วยค่าเดิม → นามบริษัทไม่โดน
-- idempotent · เจ้าของรัน
-- ============================================================

-- อัปเดต snapshot[field] ของเอกสารทุกชนิด เฉพาะใบของลูกค้านี้ที่ค่าเดิม = ค่าลูกค้าเดิม (จับคู่ตัวตน)
create or replace function public.sync_customer_field_docs(p_id bigint, p_field text, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- ไม่มีค่าเก่า (ว่าง) = จับคู่ไม่ได้ → ข้าม (กันทับใบที่บังเอิญเว้นว่าง) · ไม่เปลี่ยน = ข้าม
  if p_old is null or btrim(p_old) = '' then return; end if;
  if p_old is not distinct from p_new then return; end if;

  update public.quotations
     set customer_snapshot = jsonb_set(customer_snapshot, array[p_field], to_jsonb(p_new))
   where customer_id = p_id and customer_snapshot->>p_field = p_old;

  update public.billing_notes b
     set customer_snapshot = jsonb_set(b.customer_snapshot, array[p_field], to_jsonb(p_new))
    from public.quotations q
   where b.quotation_id = q.id and q.customer_id = p_id and b.customer_snapshot->>p_field = p_old;

  -- ใบเสร็จ/ใบกำกับภาษี (receipts): เจ้าของสั่ง (15 ก.ย.69) ให้แก้ตามทะเบียนได้ทุกฟิลด์ (รวมชื่อ/เลขภาษี) แทน void+ออกใหม่
  --   ★ คงข้อเดียว: ห้ามแตะใบที่ "ยกเลิก (void) แล้ว" — ต้องแช่แข็งสภาพ ณ วันยกเลิกไว้เป็นหลักฐาน (audit)
  --   (บัญชีเตือน: การแก้ชื่อ/เลขภาษีบนใบกำกับที่ยื่น ภ.พ.30 แล้ว ผู้สอบบัญชีอาจให้ void+reissue — เจ้าของรับทราบแล้ว)
  update public.receipts r
     set customer_snapshot = jsonb_set(r.customer_snapshot, array[p_field], to_jsonb(p_new))
    from public.billing_notes b
    join public.quotations q on b.quotation_id = q.id
   where r.billing_note_id = b.id and q.customer_id = p_id
     and coalesce(r.is_voided, false) = false
     and r.customer_snapshot->>p_field = p_old;

  update public.production_orders p
     set customer_snapshot = jsonb_set(p.customer_snapshot, array[p_field], to_jsonb(p_new))
    from public.quotations q
   where p.quotation_id = q.id and q.customer_id = p_id and p.customer_snapshot->>p_field = p_old;

  update public.warranties w
     set customer_snapshot = jsonb_set(w.customer_snapshot, array[p_field], to_jsonb(p_new))
    from public.quotations q
   where w.quotation_id = q.id and q.customer_id = p_id and w.customer_snapshot->>p_field = p_old;

  update public.boqs bo
     set customer_snapshot = jsonb_set(bo.customer_snapshot, array[p_field], to_jsonb(p_new))
   where (bo.job_id in (select id from public.jobs where customer_id = p_id)
       or bo.quotation_id in (select id from public.quotations where customer_id = p_id))
     and bo.customer_snapshot->>p_field = p_old;
end $$;

-- ชื่อ: jobs/queue ตามชื่อทะเบียนเสมอ (เชิงปฏิบัติงาน) + คืนการซิงก์ชื่อลงเอกสาร (เฉพาะใบที่ใช้ชื่อนี้)
create or replace function public.apply_customer_name(p_id bigint, p_old_name text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.jobs set customer_name = p_name
   where customer_id = p_id and customer_name is distinct from p_name;
  update public.queue_entries set customer_name = p_name
   where customer_id = p_id and customer_name is distinct from p_name;
  perform public.sync_customer_field_docs(p_id, 'name', p_old_name, p_name);
end $$;

-- trigger: ซิงก์ทุกฟิลด์ที่แก้ (ชื่อ/ที่อยู่/เลขภาษี/เบอร์/ผู้ติดต่อ)
create or replace function public.tg_sync_customer_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    perform public.apply_customer_name(new.id, old.name, new.name);
  end if;
  if new.address is distinct from old.address then
    perform public.sync_customer_field_docs(new.id, 'address', old.address, new.address);
  end if;
  if new.tax_id is distinct from old.tax_id then
    perform public.sync_customer_field_docs(new.id, 'tax_id', old.tax_id, new.tax_id);
  end if;
  if new.phone is distinct from old.phone then
    perform public.sync_customer_field_docs(new.id, 'phone', old.phone, new.phone);
  end if;
  if new.contact_person is distinct from old.contact_person then
    perform public.sync_customer_field_docs(new.id, 'contact_person', old.contact_person, new.contact_person);
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_customer_name on public.customers;
drop trigger if exists trg_sync_customer_fields on public.customers;
create trigger trg_sync_customer_fields
  after update of name, address, tax_id, phone, contact_person on public.customers
  for each row execute function public.tg_sync_customer_fields();

notify pgrst, 'reload schema';
