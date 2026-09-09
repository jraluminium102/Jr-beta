-- ============================================================
-- 0145 · RPC regen_production_sets — แทนที่ชุดผลิตจากใบเสนอแบบ atomic (ใช้ตอน Rev)
--
-- ปัญหา (QA BLOCKER): RLS write ของ production_sets = ADMIN/PRODUCTION เท่านั้น (0050)
--   แต่การ Rev ใบเสนอเรียกด้วย session ผู้ใช้ที่มีแค่ jobs:write (SALES/DESIGNER) → delete/insert
--   ถูก RLS บล็อกเงียบ → ผลิตไม่อัพเดทตาม Rev · และ delete+insert แยก call = ไม่ atomic (เสี่ยงข้อมูลหาย)
--
-- แก้: ห่อเป็น RPC security definer (แพตเทิร์นเดียวกับ undeposit_job/merge_stock_items/cascade void)
--   - เช็คสิทธิ์ในตัว (is_active) · การ Rev ถูก gate jobs:write ที่ API แล้ว
--   - delete ชุด auto (quotation_id not null) + insert ชุดใหม่ ใน "ฟังก์ชันเดียว = atomic"
--   - รับแถวสเปคที่ JS แตกมาแล้ว (p_rows jsonb) เพราะ logic แยกบุลเลทอยู่ฝั่ง JS
-- idempotent · เจ้าของรัน
-- ============================================================

create or replace function public.regen_production_sets(
  p_job_id uuid,
  p_quotation_id bigint,
  p_rev_no integer,
  p_created_by uuid,
  p_rows jsonb
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.is_active() then raise exception 'forbidden'; end if;

  -- แทนที่เฉพาะชุดที่ดึงจากใบเสนอ (auto) — คงชุดที่เพิ่มมือ (quotation_id is null)
  delete from public.production_sets
   where job_id = p_job_id and quotation_id is not null;

  insert into public.production_sets
    (job_id, set_label, seq, glass_spec, screen_type, note,
     measure_actual, measurer_name, install_date, quotation_id, quotation_rev_no, created_by)
  select
    p_job_id,
    coalesce(r->>'set_label',''),
    coalesce((r->>'seq')::int, 0),
    coalesce(r->>'glass_spec',''),
    coalesce(r->>'screen_type',''),
    coalesce(r->>'note',''),
    nullif(r->>'measure_actual','')::date,
    coalesce(r->>'measurer_name',''),
    nullif(r->>'install_date','')::date,
    p_quotation_id, p_rev_no, p_created_by
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
