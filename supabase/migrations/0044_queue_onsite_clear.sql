-- ============================================================
-- JR OMS — 0044 คิวงาน: มัดจำหน้างาน + เคลียร์แบบ
--
-- เพิ่ม onsite_deposit ใน jobs (ป้ายด่วน)
-- เพิ่ม target_job_id ใน queue_entries (เคลียร์แบบ — ผูกงานเดิม)
-- อัปเดต promote_queue_to_job รองรับ path เคลียร์แบบ
-- idempotent · รันก่อน deploy
-- ============================================================

alter table public.jobs
  add column if not exists onsite_deposit boolean not null default false;

alter table public.queue_entries
  add column if not exists target_job_id uuid references public.jobs(id);

comment on column public.jobs.onsite_deposit          is 'มัดจำหน้างาน — ข้ามขั้นเขียนแบบ เข้าผลิตทันที (0044)';
comment on column public.queue_entries.target_job_id  is 'เคลียร์แบบ: uuid ของงานเดิมที่ต้องการผูก (0044)';

create or replace function public.promote_queue_to_job(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q          public.queue_entries%rowtype;
  v_cust     bigint;
  v_job      uuid;
  has_cust   boolean;
  v_tel_digits text;
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

  -- ─── path เคลียร์แบบ: ผูกงานเดิม ไม่สร้างลูกค้า/งานใหม่ ───────────────
  -- หมายเหตุ: ห้าม set queue_entries.job_id = target — เพราะงานเดิมผูกคิวเดิมอยู่แล้ว
  --   และ job_id มี unique constraint (queue_job_uidx) → จะชน duplicate key.
  --   เคลียร์แบบใช้ target_job_id เป็นตัวเชื่อมแทน (job_id ปล่อย null = คิวนี้ไม่ได้สร้างงาน)
  if coalesce(q.job_type, '') = 'เคลียร์แบบ' then
    if q.target_job_id is null then
      raise exception 'เคลียร์แบบ: ต้องระบุ target_job_id (งานเดิม) ก่อนปิดงาน';
    end if;
    return q.target_job_id;
  end if;

  -- ─── path ปกติ: สร้างลูกค้า (dedup ด้วยเลขโทร) + สร้างงาน ────────────
  has_cust := to_regclass('public.customers') is not null;
  v_tel_digits := nullif(regexp_replace(coalesce(q.tel, ''), '[^0-9]', '', 'g'), '');

  if has_cust then
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
