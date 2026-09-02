-- 0135 — เก็บไว้เพื่อความปลอดภัยเท่านั้น (ปกติไม่ต้องรัน · รัน 0134 ไฟล์เดียวจบ)
--
-- ที่มา: เดิมแยกเป็น 2 ไฟล์ (0134 สร้างตาราง · 0135 แก้กุญแจให้รวม match_name)
--   แต่ 0134 ยังไม่เคยถูกรันจริง เจ้าของรัน 0135 ก่อนเลยเจอ
--     ERROR 42P01: relation "public.calc_line_overrides" does not exist
--   → ยุบทุกอย่างกลับเข้า 0134 แล้ว (0134 มี match_name/set_kg + unique ที่ถูกต้องอยู่ในตัว)
--
-- ไฟล์นี้เหลือไว้เผื่อกรณีเดียว: ถ้ามีใครเคยรัน 0134 "เวอร์ชันก่อนยุบ" ไปแล้ว
--   รันซ้ำได้ ไม่มีผลข้างเคียง (idempotent ทุกคำสั่ง) · ถ้ายังไม่มีตาราง จะข้ามทั้งไฟล์เงียบ ๆ ไม่ error

do $$
declare
  c text;
begin
  if to_regclass('public.calc_line_overrides') is null then
    raise notice '0135: ยังไม่มีตาราง calc_line_overrides -- ขามไฟลนี ใหรน 0134 แทน (0134 รวมทุกอยางแลว)';
    return;
  end if;

  alter table public.calc_line_overrides
    add column if not exists match_name text not null default '',
    add column if not exists set_kg     numeric(10,4);

  -- unique เดิม (ไม่มี match_name) → ทิ้ง แล้วสร้างใหม่ที่รวมชื่อบรรทัด
  select conname into c
    from pg_constraint
   where conrelid = 'public.calc_line_overrides'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%match_key%'
     and pg_get_constraintdef(oid) not like '%match_name%'
   limit 1;
  if c is not null then
    execute format('alter table public.calc_line_overrides drop constraint %I', c);
  end if;

  create unique index if not exists calc_line_overrides_key_uidx
    on public.calc_line_overrides (product_id, scope, match_key, match_name);
end $$;
