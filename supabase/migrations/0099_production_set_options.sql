-- ============================================================
-- 0099: ตัวเลือกดรอปดาวน์ของ worksheet ผลิต — เพิ่ม/ลบเองได้จากหน้าเว็บ
-- ------------------------------------------------------------
-- เดิม: ตัวเลือกทุกดรอปดาวน์ hard-code เป็น const ใน ProductionSetsSection.tsx
--       → เพิ่มโรงงาน/เพิ่มสถานะใหม่ ต้องแก้โค้ด+deploy ทุกครั้ง
-- ใหม่: เก็บใน DB · ออฟฟิศกดเพิ่ม/ลบเองได้ (เจ้าของสั่ง 16 ก.ค.2569 "ลบได้เพิ่มได้ทุกดรอปดาว")
--
-- ⚠ is_locked = ค่าที่ "ระบบใช้ตัดสินใจ" ห้ามลบ ไม่งั้นตรรกะพังเงียบ:
--     qc_after_glass='ผ่าน'   → ปลดล็อกปุ่ม "ส่งติดตั้ง" (production-schedule)
--     screen_installed='ใส่แล้ว' → เงื่อนไขพร้อมติดตั้ง
--     glass_installed='ใส่แล้ว' / design_received='ได้รับแบบ' / qc_*='ผ่าน'
--                             → ป้าย "ทำแล้ว" + audit ใครกด (production-sets/[id] MARKS)
--   ลบไม่ได้ แต่ "เพิ่ม" ค่าใหม่ได้เสมอ
-- idempotent
-- ============================================================

create table if not exists public.production_set_options (
  id          bigserial primary key,
  field_key   text not null,                        -- ชื่อคอลัมน์ใน production_sets
  value       text not null,
  sort_order  int  not null default 0,
  is_locked   boolean not null default false,       -- ระบบใช้ตัดสินใจ → ลบไม่ได้
  created_at  timestamptz not null default now(),
  unique (field_key, value)
);

create index if not exists idx_pso_field on public.production_set_options(field_key, sort_order);

alter table public.production_set_options enable row level security;

-- อ่าน: ทุก user ที่ active (ช่างก็ต้องเห็นตัวเลือก) · เขียน: ADMIN/PRODUCTION
-- (mirror 0050 production_sets — ใช้ public.is_active() ชื่อเดียวกับของเดิม)
drop policy if exists pso_read on public.production_set_options;
create policy pso_read on public.production_set_options for select
  using (public.is_active());

drop policy if exists pso_write on public.production_set_options;
create policy pso_write on public.production_set_options for all
  using (public.has_role('ADMIN', 'PRODUCTION'))
  with check (public.has_role('ADMIN', 'PRODUCTION'));

-- ── seed ค่าเริ่มต้น = ค่าที่ใช้อยู่จริง (ตรงกับ Excel "แผนงานผลิตโรง1.xlsx") ──
-- on conflict do nothing → รันซ้ำไม่ทับของที่ผู้ใช้แก้ไปแล้ว
insert into public.production_set_options (field_key, value, sort_order, is_locked) values
  -- แบบถึงผลิต (ช่างกด)
  ('design_received', 'ได้รับแบบ',            1, true),
  ('design_received', 'ได้แบบไม่ครบ',          2, false),
  ('design_received', 'ยังไม่ได้รับแบบ',        3, true),
  -- โครง/โรงงาน — เพิ่มโรงงาน 1/2 ตามที่เจ้าของสั่ง (Excel มีแต่โรงงาน3)
  ('frame_status', 'เบิกสต๊อกทั้งหมด',          1, false),
  ('frame_status', 'สั่งแล้ว รอของ',            2, false),
  ('frame_status', 'ของมาแล้ว',                3, false),
  ('frame_status', 'ขึ้นโครงโรงงาน1',           4, false),
  ('frame_status', 'ขึ้นโครงโรงงาน2',           5, false),
  ('frame_status', 'ขึ้นโครงโรงงาน3',           6, false),
  ('frame_status', 'มือจับลูกค้า',              7, false),
  -- วัสดุ 3 สาย
  ('mat_equipment', 'เบิกสต๊อกทั้งหมด',         1, false),
  ('mat_equipment', 'สั่งแล้ว รอของ',           2, false),
  ('mat_equipment', 'ของมาแล้ว',               3, false),
  ('mat_equipment', 'มือจับลูกค้า',             4, false),
  ('mat_alu_normal', 'เบิกสต๊อกทั้งหมด',        1, false),
  ('mat_alu_normal', 'สั่งแล้ว รอของ',          2, false),
  ('mat_alu_normal', 'ของมาแล้ว',              3, false),
  ('mat_alu_normal', 'มือจับลูกค้า',            4, false),
  ('mat_alu_painted', 'เบิกสต๊อกทั้งหมด',       1, false),
  ('mat_alu_painted', 'สั่งแล้ว รอของ',         2, false),
  ('mat_alu_painted', 'ของมาแล้ว',             3, false),
  ('mat_alu_painted', 'มือจับลูกค้า',           4, false),
  -- สั่งกระจก
  ('glass_order', 'รอวัด',                    1, false),
  ('glass_order', 'วัดแล้ว',                   2, false),
  ('glass_order', 'สั่งแล้ว รอของ',             3, false),
  ('glass_order', 'มาแล้ว',                    4, false),
  ('glass_order', 'มายังไม่ครบ',                5, false),
  -- ใส่กระจก (ช่างกด)
  ('glass_installed', 'ใส่แล้ว',                1, true),
  ('glass_installed', 'ยังไม่ใส่',              2, true),
  -- มุ้ง
  ('screen_type', 'มุ้งจีบ',                    1, false),
  ('screen_type', 'มุ้ง JR',                    2, false),
  ('screen_type', 'มุ้งจีบ+มุ้ง JR',             3, false),
  ('screen_type', 'มุ้งนิรภัย',                  4, false),
  -- ใส่มุ้ง
  ('screen_installed', 'มาแล้ว',                1, false),
  ('screen_installed', 'ใส่แล้ว',               2, true),
  ('screen_installed', 'ใส่ไม่ครบ',             3, false),
  -- QC 2 จุด (ช่างกด)
  ('qc_before_glass', 'ผ่าน',                  1, true),
  ('qc_before_glass', 'ไม่ผ่าน',                2, true),
  ('qc_after_glass', 'ผ่าน',                   1, true),
  ('qc_after_glass', 'ไม่ผ่าน',                 2, true)
on conflict (field_key, value) do nothing;
