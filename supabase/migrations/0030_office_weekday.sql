-- ============================================================
-- JR — 0030 วันอยู่ออฟฟิศประจำของเซลล์ (recurring office half-days)
-- ไล้/แม็ก อยู่ออฟฟิศ "ครึ่งวัน" หลายวัน/สัปดาห์ · ปฏิทินจองช่องนั้นอัตโนมัติทุกสัปดาห์
-- เก็บเป็น jsonb array ของ {weekday, half} บน queue_sales (ไหลเข้า sales meta อัตโนมัติ)
--   weekday: 0=อา 1=จ 2=อ 3=พ 4=พฤ 5=ศ 6=ส   ·   half: 'AM'(เช้า) / 'PM'(บ่าย)
-- กติกา: ไล้กับแม็กห้ามอยู่ออฟฟิศ "ครึ่งเดียวกันของวันเดียวกัน" (บังคับฝั่ง UI/แอป)
-- idempotent — รันซ้ำได้ (seed เขียนเฉพาะตอน office_slots ยังว่าง)
-- ============================================================

alter table public.queue_sales
  add column if not exists office_slots jsonb not null default '[]'::jsonb;

comment on column public.queue_sales.office_slots is
  'วันอยู่ออฟฟิศประจำ — array ของ {"weekday":0-6,"half":"AM|PM"} · ปฏิทินจองอัตโนมัติทุกสัปดาห์';

-- ── SEED: ไล้ = จ-พฤ เช้า · แม็ก = จ-พฤ บ่าย (ครึ่งวัน × 4 วัน · ไม่ทับเวลากัน) ──
-- guard office_slots='[]' → ไม่ทับของที่แอดมินแก้เองภายหลัง
update public.queue_sales
  set office_slots = '[{"weekday":1,"half":"AM"},{"weekday":2,"half":"AM"},{"weekday":3,"half":"AM"},{"weekday":4,"half":"AM"}]'::jsonb
  where code = 'lai' and office_slots = '[]'::jsonb;

update public.queue_sales
  set office_slots = '[{"weekday":1,"half":"PM"},{"weekday":2,"half":"PM"},{"weekday":3,"half":"PM"},{"weekday":4,"half":"PM"}]'::jsonb
  where code = 'mac' and office_slots = '[]'::jsonb;
