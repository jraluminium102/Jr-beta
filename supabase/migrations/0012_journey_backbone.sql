-- ============================================================
-- JR Beta — 0012 Journey backbone
-- jobs (UUID) = แกนกลางร้อย 13 เฟส · เชื่อม 4 เกาะด้วย FK ใหม่
-- carry-forward ลูกค้า "ครั้งเดียว" ตอน queue→job ผ่าน RPC
-- ⚠️ รันหลัง 0011 commit แล้วเท่านั้น (ใช้ค่า enum ใหม่)
-- idempotent ทั้งไฟล์ · ไม่แตะโครงตารางเดิม เพิ่มเฉพาะคอลัมน์/FK
-- ============================================================

-- ---------- 1) FK เชื่อมเฟส (nullable, ไม่บังคับ backfill ของเก่า) ----------
alter table public.jobs          add column if not exists customer_id    bigint references public.customers(id);
alter table public.jobs          add column if not exists queue_entry_id uuid   references public.queue_entries(id);
alter table public.queue_entries add column if not exists job_id         uuid   references public.jobs(id);
alter table public.quotations    add column if not exists job_id         uuid   references public.jobs(id);

-- ระดับความรุนแรงของปัญหา (enum สร้างใน 0011)
alter table public.issues        add column if not exists severity issue_severity_t not null default 'MEDIUM';

create index if not exists jobs_customer_idx     on public.jobs(customer_id);
create index if not exists jobs_queue_idx        on public.jobs(queue_entry_id);
create unique index if not exists queue_job_uidx on public.queue_entries(job_id) where job_id is not null;
create index if not exists quotations_job_idx    on public.quotations(job_id);
create index if not exists issues_severity_idx   on public.issues(severity);

-- ---------- 2) RPC carry-forward: queue → customer → job (จุดเดียว, idempotent) ----------
-- เรียกตอน queue.status = 'DONE' (เข้าประเมินเสร็จ → เข้าสู่ pipeline งาน)
create or replace function public.promote_queue_to_job(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.queue_entries%rowtype; v_cust bigint; v_job uuid;
begin
  if not public.has_role('ADMIN') then
    raise exception 'forbidden: ต้องเป็น ADMIN';
  end if;

  select * into q from public.queue_entries where id = p_queue_id;
  if q.id is null then raise exception 'ไม่พบคิว %', p_queue_id; end if;
  if q.job_id is not null then return q.job_id; end if;   -- idempotent: promote ครั้งเดียว

  -- 1) upsert customer (master เดียว) — กัน duplicate ด้วยเบอร์โทร
  if coalesce(q.tel,'') <> '' then
    select id into v_cust from public.customers where phone = q.tel limit 1;
  end if;
  if v_cust is null then
    insert into public.customers (name, address, line_id, phone)
    values (q.customer_name, coalesce(q.address,''), coalesce(q.line_contact,''), coalesce(q.tel,''))
    returning id into v_cust;
  end if;

  -- 2) สร้าง job ครั้งเดียว (carry-forward) — job_code/year/sequence ตั้งโดย trigger เดิม
  insert into public.jobs (customer_name, customer_tel, customer_area, channel,
                           assess_date, status, customer_id, queue_entry_id, year, sequence)
  values (q.customer_name, q.tel, q.address, 'OTHER',
          coalesce(q.queue_date, current_date), 'LEAD', v_cust, q.id, 0, 0)
  returning id into v_job;

  -- 3) ผูกกลับ queue (unique index กัน promote ซ้ำ)
  update public.queue_entries set job_id = v_job where id = q.id;
  return v_job;
end $$;

grant execute on function public.promote_queue_to_job(uuid) to authenticated, service_role;

-- หมายเหตุ: คอลัมน์ใหม่ใช้ RLS ของตารางเดิม (jobs/queue_entries/quotations/issues มี policy แล้ว)
-- การ sync macro-stage จาก production/installation + stage-guard = เฟสถัดไป (ทำใน 0013+)
