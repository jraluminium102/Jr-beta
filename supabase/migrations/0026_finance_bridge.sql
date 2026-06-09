-- ============================================================
-- 0026_finance_bridge.sql  (idempotent)
-- เชื่อมเส้น A (billing) กับเส้น B (finance_entries)
-- ============================================================

-- 1) billing_notes.job_id
alter table public.billing_notes
  add column if not exists job_id uuid references public.jobs(id);
create index if not exists billing_notes_job_id_idx on public.billing_notes(job_id);

-- 2) finance_entries — เพิ่ม fields เชื่อมโยง
alter table public.finance_entries
  add column if not exists source text,
  add column if not exists billing_installment_id bigint references public.billing_installments(id),
  add column if not exists receipt_id bigint references public.receipts(id);

-- unique index กัน double-count: งวดหนึ่งมี finance_entry ที่ active ได้เพียงรายการเดียว
create unique index if not exists finance_inst_uidx
  on public.finance_entries(billing_installment_id)
  where billing_installment_id is not null and is_voided = false;

-- 3) receipts — เพิ่ม void fields
alter table public.receipts
  add column if not exists is_voided  boolean not null default false,
  add column if not exists void_reason text,
  add column if not exists voided_at  timestamptz,
  add column if not exists voided_by  uuid references auth.users(id);

-- 4) billing_notes.status — รองรับ 'cancelled'
-- ตรวจว่าเป็น enum หรือ text
do $$
declare
  col_type text;
begin
  select data_type into col_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'billing_notes'
    and column_name  = 'status';

  if col_type = 'USER-DEFINED' then
    -- enum: เพิ่ม value ถ้ายังไม่มี
    if not exists (
      select 1 from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      where t.typname = 'billing_status' and e.enumlabel = 'cancelled'
    ) then
      alter type public.billing_status add value 'cancelled';
    end if;
  end if;
  -- ถ้า text ข้ามได้ (ไม่มี constraint)
end $$;

-- 5) constraint trigger: sum(billing_installments.amount) = billing_notes.total ± 0.01
-- ต้อง drop ก่อนเพราะ CREATE CONSTRAINT TRIGGER ไม่มี OR REPLACE
drop trigger if exists tg_check_installment_sum on public.billing_installments;

create or replace function public.check_installment_sum()
returns trigger language plpgsql as $$
declare
  v_total   numeric;
  v_sum     numeric;
  v_bn_id   bigint;
begin
  -- ระบุ billing_note_id จาก row ที่ถูกแตะ
  v_bn_id := coalesce(NEW.billing_note_id, OLD.billing_note_id);

  select total into v_total
  from public.billing_notes
  where id = v_bn_id;

  select coalesce(sum(amount), 0) into v_sum
  from public.billing_installments
  where billing_note_id = v_bn_id;

  if abs(v_sum - v_total) > 0.01 then
    raise exception
      'sum(installment.amount) = % ไม่ตรงกับ billing_notes.total = % (billing_note_id=%)',
      v_sum, v_total, v_bn_id;
  end if;
  return null;
end $$;

create constraint trigger tg_check_installment_sum
  after insert or update or delete
  on public.billing_installments
  deferrable initially deferred
  for each row execute function public.check_installment_sum();
