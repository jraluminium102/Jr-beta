-- ============================================================
-- 0070 · SYNC + คิวเก็บ "ออกเอกสารในนาม"
--
-- (1) sync: ทุกลูกค้า "ต้องมีนามออกบิลอย่างน้อย 1 นามเสมอ"
--     ลูกค้าใหม่ (สร้างจาก promote/find_or_create/เพิ่มมือ) → trigger สร้างนามเริ่มต้นให้อัตโนมัติ
--     (0069 backfill เฉพาะลูกค้าเดิม · อันนี้ครอบลูกค้าใหม่ตลอดไป)
-- (2) คิวงานเก็บตัวเลือก "ออกในนาม": ตามหน้างาน / ที่อยู่อื่น / ในนามบริษัท
--     → ตอนกดคิวเสร็จ (promote) จะ materialize เป็นนามออกบิลของลูกค้า (ทำที่ app layer)
-- idempotent · เจ้าของรัน
-- ============================================================

-- ── (1) trigger: ลูกค้าใหม่ → นามออกบิลเริ่มต้น ──
create or replace function public.tg_customer_default_billing_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.billing_profiles where customer_id = new.id) then
    insert into public.billing_profiles
      (customer_id, kind, bill_name, tax_id, branch, address, ship_address, contact_person, phone, is_default)
    values
      (new.id, 'INDIVIDUAL', new.name, coalesce(new.tax_id,''), 'สำนักงานใหญ่',
       coalesce(new.address,''), '', coalesce(new.contact_person,''), coalesce(new.phone,''), true);
  end if;
  return new;
end $$;

drop trigger if exists trg_customer_default_billing on public.customers;
create trigger trg_customer_default_billing
  after insert on public.customers
  for each row execute function public.tg_customer_default_billing_profile();

-- ── (2) คิวเก็บตัวเลือกออกในนาม ──
alter table public.queue_entries
  add column if not exists bill_choice text not null default 'SITE'
    check (bill_choice in ('SITE','OTHER_ADDR','COMPANY')),
  add column if not exists bill_kind    text not null default 'INDIVIDUAL'
    check (bill_kind in ('INDIVIDUAL','COMPANY')),
  -- text fields nullable (app clean() แปลง ""→null) — materialize อ่านด้วย coalesce
  add column if not exists bill_name    text,
  add column if not exists bill_tax_id  text,
  add column if not exists bill_branch  text,
  add column if not exists bill_address text;
