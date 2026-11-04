-- ============================================================
-- 0171 · รวมลูกค้าซ้ำในทะเบียน (merge_customers) — atomic · ADMIN-only
--
-- ปัญหา (เคสคุณป้อ 4 พ.ย.69): ลูกค้าคนเดียวมี 2 แถวในทะเบียน
--   · แถวแรกเกิดจาก "งานจดเอง" ในตารางผลิต (มีแค่ชื่อ ไม่มีเบอร์)
--   · แถวสองเกิดจากคิวประเมิน (ลูกค้าใหม่) — promote เช็คซ้ำด้วย "เบอร์" เท่านั้น แถวแรกไม่มีเบอร์ → สร้างใหม่
--   → บอร์ดผลิตเห็นชื่อเดิมค้าง (งานของแถวแรก) ทั้งที่แก้ชื่อแถวสองไปแล้ว
--
-- วิธี (ทรานแซกชันเดียว all-or-nothing):
--   · ย้ายทุกอย่างที่ชี้ลูกค้าตัวลบ → ตัวที่เก็บ: jobs · queue_entries (customer_id/target_customer_id) ·
--     quotations · billing_profiles (นามหลักซ้ำ → ตัวที่ย้ายมาเป็นนามรอง) · floor_works (ถ้ามีตาราง)
--   · เติมช่องว่างของตัวที่เก็บจากตัวลบ (เบอร์/ไลน์/ที่อยู่/เลขภาษี/ผู้ติดต่อ/ชื่องาน) — ไม่ทับค่าที่มีอยู่
--   · ไลน์ของตัวลบที่ต่างจากตัวเก็บ → เก็บเข้า line_id_prev (0170) ไม่ทิ้ง
--   · งาน/คิวที่ย้ายมา: customer_name = ชื่อตัวที่เก็บ (กฎ: ชื่อในผลิต/คิว = ชื่อทะเบียน)
--   · เอกสาร (ใบเสนอ/บิล/ใบเสร็จ) ไม่แตะ snapshot — นามบนเอกสารคงเดิมต่อใบ
--   · ลบแถวตัวลบออกจากทะเบียน
-- idempotent · เจ้าของรัน
-- ============================================================

create or replace function public.merge_customers(p_keep bigint, p_remove bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_keep   public.customers;
  v_rm     public.customers;
  n_jobs   int := 0;
  n_queue  int := 0;
  n_quot   int := 0;
  n_prof   int := 0;
  n_floor  int := 0;
  v_tmp    int;
  v_has_prev boolean;
begin
  if not public.has_role('ADMIN') then
    raise exception 'forbidden';
  end if;
  if p_keep is null or p_remove is null or p_keep = p_remove then
    raise exception 'same_customer';
  end if;

  select * into v_keep from public.customers where id = p_keep for update;
  if not found then raise exception 'keep_not_found'; end if;
  select * into v_rm from public.customers where id = p_remove for update;
  if not found then raise exception 'remove_not_found'; end if;

  -- 1) งาน → ตัวที่เก็บ + ชื่อตามทะเบียนตัวที่เก็บ
  update public.jobs set customer_id = p_keep, customer_name = v_keep.name
   where customer_id = p_remove;
  get diagnostics n_jobs = row_count;

  -- 2) คิว (ทั้งลิงก์ลูกค้า + ลิงก์ "ลูกค้าเก่าหน้างานใหม่")
  update public.queue_entries set customer_id = p_keep, customer_name = v_keep.name
   where customer_id = p_remove;
  get diagnostics n_queue = row_count;
  update public.queue_entries set target_customer_id = p_keep
   where target_customer_id = p_remove;
  get diagnostics v_tmp = row_count;
  n_queue := n_queue + v_tmp;

  -- 3) ใบเสนอราคา (ลิงก์ลูกค้าเท่านั้น · snapshot นามบนใบไม่แตะ)
  update public.quotations set customer_id = p_keep where customer_id = p_remove;
  get diagnostics n_quot = row_count;

  -- 4) นามออกบิล: ย้ายมาเป็นนามรอง ถ้าตัวที่เก็บมีนามหลักอยู่แล้ว (partial unique 1 นามหลัก/ลูกค้า)
  if to_regclass('public.billing_profiles') is not null then
    if exists (select 1 from public.billing_profiles where customer_id = p_keep and is_default) then
      update public.billing_profiles set is_default = false where customer_id = p_remove and is_default;
    end if;
    update public.billing_profiles set customer_id = p_keep where customer_id = p_remove;
    get diagnostics n_prof = row_count;
  end if;

  -- 5) งานพื้น
  if to_regclass('public.floor_works') is not null then
    update public.floor_works set customer_id = p_keep where customer_id = p_remove;
    get diagnostics n_floor = row_count;
  end if;

  -- 6) เติมช่องว่างของตัวที่เก็บจากตัวลบ (ไม่ทับของเดิม) + เก็บไลน์เดิมไว้
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'customers' and column_name = 'line_id_prev'
  ) into v_has_prev;

  update public.customers k set
    phone          = case when coalesce(btrim(k.phone), '') = '' then coalesce(v_rm.phone, '') else k.phone end,
    address        = case when coalesce(btrim(k.address), '') = '' then coalesce(v_rm.address, '') else k.address end,
    tax_id         = case when coalesce(btrim(k.tax_id), '') = '' then coalesce(v_rm.tax_id, '') else k.tax_id end,
    contact_person = case when coalesce(btrim(k.contact_person), '') = '' then coalesce(v_rm.contact_person, '') else k.contact_person end,
    job            = case when coalesce(btrim(k.job), '') = '' then coalesce(v_rm.job, '') else k.job end,
    line_id        = case when coalesce(btrim(k.line_id), '') = '' then coalesce(v_rm.line_id, '') else k.line_id end
  where k.id = p_keep;

  if v_has_prev and coalesce(btrim(v_rm.line_id), '') <> '' and v_rm.line_id is distinct from v_keep.line_id
     and coalesce(btrim(v_keep.line_id), '') <> '' then
    execute $q$
      update public.customers set line_id_prev =
        case when coalesce(line_id_prev, '') = '' then $2
             when position($2 in line_id_prev) > 0 then line_id_prev
             else line_id_prev || ' / ' || $2 end
      where id = $1 $q$
      using p_keep, v_rm.line_id;
  end if;

  -- 7) ลบตัวซ้ำออกจากทะเบียน
  delete from public.customers where id = p_remove;

  return jsonb_build_object(
    'keep_id', p_keep, 'keep_name', v_keep.name,
    'removed_id', p_remove, 'removed_name', v_rm.name,
    'jobs', n_jobs, 'queues', n_queue, 'quotations', n_quot, 'billing_profiles', n_prof, 'floor_works', n_floor
  );
end $$;

grant execute on function public.merge_customers(bigint, bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
