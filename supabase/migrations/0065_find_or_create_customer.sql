-- 0065: find_or_create_customer — ใช้ตอนสร้างงาน (POST /api/jobs / walk-in)
--   เดิม: สร้างงานเก็บแค่ customer_name/tel บน jobs ไม่เขียนตาราง customers
--         → ลูกค้าไม่โผล่หน้า "ทะเบียนลูกค้า" เลย (โผล่เฉพาะที่มาจากคิว)
--   แก้: หา customer จากเบอร์ (normalize ตัดอักขระ → กันซ้ำ "081-..."/"081...") ถ้าไม่มีสร้างใหม่
--        คืน id ให้ route ไป set jobs.customer_id
create or replace function public.find_or_create_customer(
  p_name text, p_phone text default '', p_address text default ''
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_digits text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_id     uuid;
begin
  if to_regclass('public.customers') is null then
    return null;
  end if;
  -- dedup ด้วยเบอร์ที่ normalize แล้ว (มีเบอร์เท่านั้น)
  if v_digits is not null then
    select id into v_id from public.customers
    where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_digits
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  -- ไม่พบ → สร้างใหม่ (เบอร์ว่างก็สร้าง เพื่อให้ลูกค้าโผล่ในระบบ — ฟอร์มเตือนเรื่องเบอร์ซ้ำแล้ว)
  insert into public.customers (name, phone, address)
  values (coalesce(nullif(p_name, ''), '(ไม่ระบุชื่อ)'), coalesce(p_phone, ''), coalesce(p_address, ''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.find_or_create_customer(text, text, text) to authenticated, service_role;
