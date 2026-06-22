-- ============================================================
-- JR Beta — 0051 ชื่อลูกค้า single-source-of-truth
-- ปัญหา: customers.name ถูก denormalize หลายตาราง (jobs.customer_name,
--   queue_entries.customer_name, customer_snapshot ของเอกสาร) ไม่มี sync →
--   แก้ชื่อที่ทะเบียนแล้วเฟสอื่นยังชื่อเก่า
-- แก้: แก้ customers.name แล้ว propagate ไปทุกตารางอัตโนมัติ (trigger)
--   + reconcile drift ที่มีอยู่ (one-time)
-- ขอบเขต (เจ้าของยืนยัน 22 มิ.ย.2026, accountant ทักท้วงเรื่องใบกำกับ):
--   - แตะเฉพาะ key "name" เท่านั้น (ใช้ jsonb_set ไม่ replace ทั้งก้อน)
--     → ไม่แตะ tax_id / address / phone บนเอกสาร = ไม่กระทบข้อมูลภาษี
--   - ตัวเลขเงิน (total/vat/net/amount) เก็บแยกคอลัมน์ ไม่อยู่ใน snapshot → ไม่กระทบยอด
--   - เจ้าของเลือก auto-sync รวมใบเสร็จ/ใบกำกับภาษีด้วย (รับทราบความเสี่ยงภาษีไทย)
--     audit ใครแก้ชื่อ → ทำที่ app layer (customers/queue PATCH)
-- idempotent · รันหลัง 0050
-- ============================================================

-- ---------- 1) queue_entries.customer_id (ลิงก์คิวกับลูกค้าจริง) ----------
alter table public.queue_entries
  add column if not exists customer_id bigint references public.customers(id);
create index if not exists queue_entries_customer_idx on public.queue_entries(customer_id);

-- backfill: คิวที่ promote เป็นงานแล้ว → ใช้ customer_id ของงานนั้น
update public.queue_entries q
   set customer_id = j.customer_id
  from public.jobs j
 where j.queue_entry_id = q.id
   and j.customer_id is not null
   and q.customer_id is null;
-- backfill: คิว "ลูกค้าเก่า" ที่ผูก target_customer_id ไว้
update public.queue_entries q
   set customer_id = q.target_customer_id
 where q.target_customer_id is not null
   and q.customer_id is null;

-- ---------- 2) คง queue_entries.customer_id ให้ตรงเสมอเมื่อ promote/แก้งาน ----------
create or replace function public.tg_link_queue_customer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.queue_entry_id is not null and new.customer_id is not null then
    update public.queue_entries
       set customer_id = new.customer_id
     where id = new.queue_entry_id
       and customer_id is distinct from new.customer_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_link_queue_customer on public.jobs;
create trigger trg_link_queue_customer
  after insert or update of customer_id, queue_entry_id on public.jobs
  for each row execute function public.tg_link_queue_customer();

-- ---------- 3) ตัวกระจายชื่อ (ใช้ทั้ง trigger + reconcile) ----------
-- แตะเฉพาะ key name; guard "is distinct" กันเขียนซ้ำ/ขยับ updated_at โดยไม่จำเป็น
create or replace function public.apply_customer_name(p_id bigint, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- เฟสปฏิบัติงาน
  update public.jobs
     set customer_name = p_name
   where customer_id = p_id and customer_name is distinct from p_name;

  update public.queue_entries
     set customer_name = p_name
   where customer_id = p_id and customer_name is distinct from p_name;

  -- ใบเสนอราคา (link ตรง customer_id)
  update public.quotations
     set customer_snapshot = jsonb_set(customer_snapshot, '{name}', to_jsonb(p_name))
   where customer_id = p_id and customer_snapshot->>'name' is distinct from p_name;

  -- ใบวางบิล (link ผ่าน quotation)
  update public.billing_notes b
     set customer_snapshot = jsonb_set(b.customer_snapshot, '{name}', to_jsonb(p_name))
    from public.quotations q
   where b.quotation_id = q.id and q.customer_id = p_id
     and b.customer_snapshot->>'name' is distinct from p_name;

  -- ใบเสร็จ/ใบกำกับภาษี (link ผ่าน billing_note → quotation)
  update public.receipts r
     set customer_snapshot = jsonb_set(r.customer_snapshot, '{name}', to_jsonb(p_name))
    from public.billing_notes b
    join public.quotations q on b.quotation_id = q.id
   where r.billing_note_id = b.id and q.customer_id = p_id
     and r.customer_snapshot->>'name' is distinct from p_name;

  -- ใบสั่งผลิต (link ผ่าน quotation)
  update public.production_orders p
     set customer_snapshot = jsonb_set(p.customer_snapshot, '{name}', to_jsonb(p_name))
    from public.quotations q
   where p.quotation_id = q.id and q.customer_id = p_id
     and p.customer_snapshot->>'name' is distinct from p_name;

  -- ใบรับประกัน (link ผ่าน quotation)
  update public.warranties w
     set customer_snapshot = jsonb_set(w.customer_snapshot, '{name}', to_jsonb(p_name))
    from public.quotations q
   where w.quotation_id = q.id and q.customer_id = p_id
     and w.customer_snapshot->>'name' is distinct from p_name;

  -- BOQ (link ผ่าน job หรือ quotation)
  update public.boqs bo
     set customer_snapshot = jsonb_set(bo.customer_snapshot, '{name}', to_jsonb(p_name))
   where (bo.job_id in (select id from public.jobs where customer_id = p_id)
       or bo.quotation_id in (select id from public.quotations where customer_id = p_id))
     and bo.customer_snapshot->>'name' is distinct from p_name;
end $$;

-- ---------- 4) trigger: customers.name เปลี่ยน → กระจาย ----------
create or replace function public.tg_sync_customer_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    perform public.apply_customer_name(new.id, new.name);
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_customer_name on public.customers;
create trigger trg_sync_customer_name
  after update of name on public.customers
  for each row execute function public.tg_sync_customer_name();

-- ---------- 5) reconcile drift ที่มีอยู่ (one-time) ----------
-- ดึงทุกตารางให้ตรง customers.name ปัจจุบัน (ครอบ test/import ที่ชื่อเพี้ยน)
select public.apply_customer_name(id, name) from public.customers;

-- ---------- 6) reload PostgREST schema cache (เพราะเพิ่มคอลัมน์ใหม่) ----------
notify pgrst, 'reload schema';
