-- ============================================================
-- 0067 · แก้ถาวร "ลูกค้าไม่เข้าระบบ" + "ยกเลิกแล้วเด้งกลับ" — รื้อ band-aid auto-revive
--
-- รากปัญหา: cleanup ครั้งเดียว 12 มิ.ย. ไปยกเลิกงานล่วงหน้าผิด (คิวยังไม่ถึงวัน)
--   reason = "ยังไม่ได้เข้าหน้างานจริง (คิว ≥ 15 มิ.ย. ยังไม่ประเมิน)" · stage 2
--   → เลยใส่ logic "ฟื้นงานที่ยกเลิก" ไว้ซ่อม แต่ band-aid นี้:
--     - ฟื้นมั่ว: แก้/เซฟคิว DONE → ปลุกงานที่ "คนกดยกเลิกจริง" กลับมา (เด้งกลับ)
--     - ฟื้นไม่ครบ: cron ข้าม (เพราะ job_id ไม่ว่าง) → ปทิตตาค้าง ไม่เข้าเขียนแบบ
--
-- แก้ถาวร: รื้อ auto-revive ทิ้ง → กฎเรียบง่าย
--   • ยกเลิก = อยู่ยกเลิกตลอดไป (ไม่ฟื้นเอง)
--   • ประเมินเสร็จ + ยังไม่มีงาน → สร้างใหม่ · มีงานอยู่ → ใช้เดิม
--   • (คู่กับ app: ยกเลิกงาน → ยกเลิกคิวต้นทางด้วย กัน cron auto-complete ปลุกกลับ)
-- + ซ่อม cleanup พลาดครั้งเดียว (ปทิตตา/ศรายุทธ/รุ่งทิพย์)
-- idempotent · เจ้าของรัน
-- ============================================================

-- ── 1) _promote_queue_core: เอา auto-revive ออก (สร้างเมื่อยังไม่มีงานเท่านั้น) ──
create or replace function public._promote_queue_core(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q              public.queue_entries%rowtype;
  v_cust         bigint;
  v_job          uuid;
  has_cust       boolean;
  v_tel_digits   text;
begin
  select * into q from public.queue_entries where id = p_queue_id;
  if q.id is null then
    raise exception 'ไม่พบคิว %', p_queue_id;
  end if;

  if q.job_id is not null then   -- idempotent — มีงานอยู่แล้ว ใช้อันเดิม (ไม่ฟื้น ไม่แตะสถานะ)
    return q.job_id;
  end if;

  if coalesce(q.job_type, '') = 'เคลียร์แบบ' and q.target_job_id is null then
    raise exception 'เคลียร์แบบ: ต้องระบุ target_job_id (งานเดิม) ก่อนปิดงาน';
  end if;

  if q.target_job_id is not null then   -- ผูกงานเดิม ไม่สร้างใหม่
    return q.target_job_id;
  end if;

  has_cust := to_regclass('public.customers') is not null;
  if q.target_customer_id is not null then
    v_cust := q.target_customer_id;
  elsif has_cust then
    v_tel_digits := nullif(regexp_replace(coalesce(q.tel, ''), '[^0-9]', '', 'g'), '');
    if v_tel_digits is not null then
      execute 'select id from public.customers
               where regexp_replace(coalesce(phone,''''), ''[^0-9]'', '''', ''g'') = $1 limit 1'
        into v_cust using v_tel_digits;
    end if;
    if v_cust is null then
      execute 'insert into public.customers (name, address, line_id, phone)
               values ($1,$2,$3,$4) returning id'
        into v_cust
        using q.customer_name, coalesce(q.address, ''), coalesce(q.line_contact, ''), coalesce(q.tel, '');
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

revoke all on function public._promote_queue_core(uuid) from public;
grant execute on function public._promote_queue_core(uuid) to service_role;
grant execute on function public.promote_queue_to_job(uuid) to authenticated, service_role;

-- ── 2) ซ่อม cleanup พลาดครั้งเดียว (เฉพาะ reason นั้น + stage≤2) ──
-- ใช้ลิงก์ที่เชื่อถือได้ q.job_id = j.id (job เก่าบางตัว queue_entry_id ไม่ตรง/ว่าง)
-- 2a) คิว "ประเมินแล้ว (DONE)" → ฟื้นงานเข้าเขียนแบบ (เก็บ job_code เดิม) — ปทิตตา
update public.jobs j
   set status = 'LEAD', design_state = 'NOT_STARTED'
  from public.queue_entries q
 where q.job_id = j.id
   and q.status = 'DONE'
   and j.status = 'CANCELLED'
   and coalesce(j.current_stage, 0) <= 2
   and j.cancel_reason like 'ยังไม่ได้เข้าหน้างานจริง%';

-- 2b) คิว "ยังไม่ประเมิน (ไม่ DONE)" → ตัดลิงก์ job_id → พอประเมินเสร็จค่อยสร้างงานใหม่สดๆ
--     (งานที่ยกเลิกเก็บไว้เป็นประวัติ ไม่ปลุก) — ศรายุทธ/รุ่งทิพย์
update public.queue_entries q
   set job_id = null
  from public.jobs j
 where q.job_id = j.id
   and q.status <> 'DONE'
   and j.status = 'CANCELLED'
   and coalesce(j.current_stage, 0) <= 2
   and j.cancel_reason like 'ยังไม่ได้เข้าหน้างานจริง%';
