-- ============================================================
-- 0174 · เลิกวันออฟฟิศประจำสัปดาห์ → ปฏิทินออฟฟิศรายเดือน (เลือกวัน/ครึ่งวันเอง) + ตั้งค่าตัวนับออกหน้างาน
--   เจ้าของสั่ง 12 พ.ย.69: "ตั้งอังคารแล้วบล็อกทุกอังคาร ใช้จริงไม่ได้ ต้องยืดหยุ่น"
--   เก็บวันออฟฟิศรายวันที่ queue_sales.office_overrides (0031) action "add" เหมือนเดิม — แค่เลิกใช้ pattern office_slots
--   ขั้นตอน: 1) แปลง pattern ที่มีอยู่เป็นวันจริงของ "เดือนนี้ที่เหลือ + เดือนหน้า" (ไม่มีอะไรหายกะทันหัน) 2) ล้าง office_slots
-- ============================================================
alter table public.queue_settings
  add column if not exists office_days_required int not null default 4,   -- ต้องอยู่ออฟฟิศกี่วัน/เดือน (ทั้งวัน=1 ครึ่งวัน=0.5)
  add column if not exists field_streak_warn   int not null default 6;    -- ออกหน้างานติดกันกี่วันทำงานถึงเตือน
alter table public.queue_sales
  add column if not exists office_days_required int;                      -- แก้รายคนได้ (null = ใช้ค่ากลาง · เช่น ภูเก็ต 0)
comment on column public.queue_settings.office_days_required is 'ต้องอยู่ออฟฟิศกี่วันต่อเดือน (0174)';
comment on column public.queue_settings.field_streak_warn   is 'ออกหน้างานติดกันกี่วันทำงานถึงขึ้นเตือน (0174)';
comment on column public.queue_sales.office_days_required   is 'ต้องอยู่ออฟฟิศกี่วัน/เดือน รายคน · null = ใช้ queue_settings (0174)';

-- 1) แปลง pattern รายสัปดาห์ → override รายวัน (วันนี้ → สิ้นเดือนหน้า) เฉพาะวันที่ไม่มี override อยู่แล้ว
do $$
declare
  s record; d date; wd int; h text; existing jsonb; add_list jsonb;
  v_from date := current_date;
  v_to   date := (date_trunc('month', current_date) + interval '2 month' - interval '1 day')::date;
begin
  for s in select id, office_slots, office_overrides from public.queue_sales where jsonb_array_length(coalesce(office_slots,'[]'::jsonb)) > 0 loop
    existing := coalesce(s.office_overrides, '[]'::jsonb);
    add_list := '[]'::jsonb;
    d := v_from;
    while d <= v_to loop
      wd := extract(dow from d)::int;  -- 0=อาทิตย์ ตรงกับ getUTCDay
      foreach h in array array['AM','PM'] loop
        if exists (select 1 from jsonb_array_elements(s.office_slots) o where (o->>'weekday')::int = wd and o->>'half' = h)
           and not exists (select 1 from jsonb_array_elements(existing) o where o->>'date' = d::text and o->>'half' = h) then
          add_list := add_list || jsonb_build_array(jsonb_build_object('date', d::text, 'half', h, 'action', 'add'));
        end if;
      end loop;
      d := d + 1;
    end loop;
    -- override "remove" ของเดิมไม่จำเป็นแล้ว (ไม่มี pattern ให้ลบ) → ทิ้ง เหลือเฉพาะ "add"
    update public.queue_sales
       set office_overrides = (select coalesce(jsonb_agg(o), '[]'::jsonb) from jsonb_array_elements(existing || add_list) o where o->>'action' = 'add'),
           office_slots = '[]'::jsonb
     where id = s.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
