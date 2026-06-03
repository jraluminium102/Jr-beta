-- ============================================================
-- JR ERP บัญชี · Functions (เดิมจาก Quotation 0002)
-- ปรับสำหรับแอพรวม:
--   - ตัด handle_new_user() + trigger on_auth_user_created (ใช้ของ OMS 0002 แล้ว)
--   - current_user_role() คืน role_t (ไม่ใช่ user_role) อ่านจาก profiles เดียวกัน
-- ============================================================

-- ---------- role ของผู้ใช้ปัจจุบัน (ใช้ใน RLS ฝั่งบัญชี) — คืน role_t ----------
create or replace function public.current_user_role()
returns role_t language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------- ออกรหัสเอกสารอัตโนมัติ (พ.ศ. · reset รายเดือน) ----------
-- คืนค่า เช่น QT2568060001  (atomic ผ่าน upsert)
create or replace function public.next_document_code(p_doc_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_now    timestamptz := now() at time zone 'Asia/Bangkok';
  v_year   int := extract(year  from v_now)::int + 543;  -- พ.ศ.
  v_month  int := extract(month from v_now)::int;
  v_run    int;
begin
  insert into public.document_sequences (doc_type, year_be, month, last_running)
  values (p_doc_type, v_year, v_month, 1)
  on conflict (doc_type, year_be, month)
  do update set last_running = public.document_sequences.last_running + 1
  returning last_running into v_run;

  return p_doc_type
       || lpad(v_year::text, 4, '0')
       || lpad(v_month::text, 2, '0')
       || lpad(v_run::text, 4, '0');
end $$;
