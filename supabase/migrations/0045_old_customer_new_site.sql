-- ============================================================
-- JR OMS — 0045 ประเมินลูกค้าเก่าหน้างานใหม่
--
-- เพิ่ม target_customer_id ใน queue_entries
-- อัปเดต promote_queue_to_job รองรับ:
--   - target_job_id  → ผูกงานเดิม (เคลียร์แบบ / ลูกค้าเก่าหน้างานเดิม)
--   - target_customer_id → ลูกค้าเดิม + สร้างงานใหม่ (ลูกค้าเก่าหน้างานใหม่)
-- idempotent · รันก่อน deploy
-- ============================================================

alter table public.queue_entries
  add column if not exists target_customer_id bigint references public.customers(id);

comment on column public.queue_entries.target_customer_id is
  'ลูกค้าเก่าหน้างานใหม่: customer_id เดิม (0045)';

-- generalize promote: target_job_id→ผูกงานเดิม (ทุก type), target_customer_id→ลูกค้าเดิม+งานใหม่
create or replace function public.promote_queue_to_job(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q              public.queue_entries%rowtype;
  v_cust         bigint;
  v_job          uuid;
  has_cust       boolean;
  v_tel_digits   text;
begin
  if not public.has_role('ADMIN') then
    raise exception 'forbidden: ต้องเป็น ADMIN';
  end if;

  select * into q from public.queue_entries where id = p_queue_id;
  if q.id is null then
    raise exception 'ไม่พบคิว %', p_queue_id;
  end if;

  -- idempotent — ถ้าผูก job แล้วคืนทันที
  if q.job_id is not null then
    return q.job_id;
  end if;

  -- เคลียร์แบบ ต้องมี target_job_id
  if coalesce(q.job_type, '') = 'เคลียร์แบบ' and q.target_job_id is null then
    raise exception 'เคลียร์แบบ: ต้องระบุ target_job_id (งานเดิม) ก่อนปิดงาน';
  end if;

  -- ผูกงานเดิม (เคลียร์แบบ / ลูกค้าเก่าหน้างานเดิม)
  -- ไม่สร้างงานใหม่, ไม่ set job_id (เพราะ queue_job_uidx unique)
  if q.target_job_id is not null then
    return q.target_job_id;
  end if;

  -- ลูกค้า: target_customer_id (ลูกค้าเก่าหน้างานใหม่) หรือ dedup เบอร์ / สร้างใหม่
  has_cust := to_regclass('public.customers') is not null;

  if q.target_customer_id is not null then
    v_cust := q.target_customer_id;
  elsif has_cust then
    v_tel_digits := nullif(regexp_replace(coalesce(q.tel, ''), '[^0-9]', '', 'g'), '');
    if v_tel_digits is not null then
      execute
        'select id from public.customers
         where regexp_replace(coalesce(phone,''''), ''[^0-9]'', '''', ''g'') = $1
         limit 1'
        into v_cust using v_tel_digits;
    end if;
    if v_cust is null then
      execute
        'insert into public.customers (name, address, line_id, phone)
         values ($1,$2,$3,$4) returning id'
        into v_cust
        using q.customer_name,
              coalesce(q.address, ''),
              coalesce(q.line_contact, ''),
              coalesce(q.tel, '');
    end if;
  end if;

  insert into public.jobs (
    customer_name, customer_tel, customer_area, channel,
    assess_date, status, current_stage, customer_id, queue_entry_id, year, sequence
  ) values (
    q.customer_name, q.tel, q.address, 'OTHER',
    coalesce(q.queue_date, current_date), 'LEAD', 2, v_cust, q.id, 0, 0
  ) returning id into v_job;

  update public.queue_entries set job_id = v_job where id = q.id;
  return v_job;
end $$;

grant execute on function public.promote_queue_to_job(uuid) to authenticated, service_role;
