-- 0118: แก้วันที่ใบวางบิล/ใบเสร็จได้ + เลขเอกสารรันตามเดือนของ issue_date (ปิดบั๊กต้นตอ)
--
-- ต้นตอ: next_document_code(p_doc_type) เดิมใช้ now() หาเดือน แต่ตอน insert BL/INV เก็บ issue_date จาก body
--        → สร้างเอกสารวันนี้ (ส.ค.) แต่กรอกวันที่ 31 ก.ค. → เลขออกเป็นเดือน 08 (ไม่ตรงวันที่บนใบ)
--
-- แก้: เพิ่ม overload next_document_code(p_doc_type, p_date) — derive year_be/month จาก p_date ที่ส่งมา
--      ตัวเดิม (1 พารามิเตอร์) คงไว้ backward compat — เปลี่ยนให้เรียกตัวใหม่ด้วย now() (Asia/Bangkok) แทน
--      ⚠ ไม่ใช้ "default" parameter (จะชนกับ overload 1 พารามิเตอร์เดิม → Postgres error "function is not unique")

-- ---------- ออกรหัสเอกสารตามวันที่ที่ระบุ (atomic ผ่าน upsert เหมือนเดิม) ----------
create or replace function public.next_document_code(p_doc_type text, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_year   int := extract(year  from p_date)::int + 543;  -- พ.ศ.
  v_month  int := extract(month from p_date)::int;
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

-- ---------- ตัวเดิม (1 พารามิเตอร์) — คง backward compat โดยเรียกตัวใหม่ด้วยวันนี้ (Asia/Bangkok) ----------
create or replace function public.next_document_code(p_doc_type text)
returns text language sql security definer set search_path = public as $$
  select public.next_document_code(p_doc_type, (now() at time zone 'Asia/Bangkok')::date);
$$;

notify pgrst, 'reload schema';
