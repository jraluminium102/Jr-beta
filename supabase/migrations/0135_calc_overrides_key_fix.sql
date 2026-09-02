-- 0135 — แก้กุญแจอ้างอิงบรรทัดของ calc_line_overrides (QA จับได้ 1 ก.ย.69)
--
-- ปัญหาของ 0134: อ้างบรรทัดด้วย "รหัส" อย่างเดียว (match_key) + unique(product_id, scope, match_key)
--   แต่ของจริง "รหัสเดียวกันถูกใช้หลายบรรทัดในรุ่นเดียวกัน" เป็นเรื่องปกติมาก
--     บานเปิด  ใช้ F7935 (คิ้วกระจก) 5 บรรทัด — คิ้วตั้ง/คิ้วขวาง/คิ้วช่องแสง ฯลฯ
--     เลื่อนยูโร ใช้ F7988 4 บรรทัด · ใบตัด sms_slide_free ใช้ B20054 4 บรรทัด
--   รวมชนกัน 41 กลุ่ม (ฝั่งคิดราคา) + 92 กลุ่ม (ฝั่งใบตัด)
--   ผลคือ: แก้ได้แค่บรรทัดแรก · และ unique constraint บล็อกไม่ให้สร้าง override ของบรรทัดที่เหลือเลย
--
-- ทางแก้: เติม "ชื่อบรรทัด" เข้าไปในกุญแจด้วย
--   ตรวจกับข้อมูลจริงแล้ว (รหัส + ชื่อ) ไม่ซ้ำเลยสักกลุ่ม จาก 598 บรรทัดคิดราคา + 1,140 บรรทัดใบตัด
--
-- ⚠ 0134 รันไปแล้ว ห้ามแก้ไฟล์นั้น — ต้องมาแก้ต่อในไฟล์นี้

alter table public.calc_line_overrides
  add column if not exists match_name text not null default '',
  -- น้ำหนัก กก./เส้น สำหรับบรรทัดอลูที่ "เพิ่มเอง" — 0134 ฮาร์ดโค้ด kg=0
  --   ทำให้ค่าอบสี (bakeRate × น้ำหนักรวม) ไม่นับเส้นที่เพิ่มเอง = ทุนงานสีขาดไปเงียบ ๆ
  add column if not exists set_kg numeric(10,4);

comment on column public.calc_line_overrides.match_name is
  'ชื่อบรรทัดในสูตร — ใช้คู่กับ match_key เพราะรหัสเดียวถูกใช้หลายบรรทัดในรุ่นเดียวกันได้';
comment on column public.calc_line_overrides.set_kg is
  'น้ำหนัก กก./เส้น (เฉพาะบรรทัดอลูที่เพิ่มเอง) — ต้องมี ไม่งั้นค่าอบสีคิดขาด';

-- เปลี่ยน unique: เดิม (product_id, scope, match_key) → เพิ่ม match_name
do $$
declare c text;
begin
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
end $$;

create unique index if not exists calc_line_overrides_key_uidx
  on public.calc_line_overrides (product_id, scope, match_key, match_name);
