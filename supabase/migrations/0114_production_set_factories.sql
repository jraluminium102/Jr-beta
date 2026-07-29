-- 0114 · production_sets.factories — เลือกโรงงานผลิตได้หลายโรงต่อชุด (โรงงาน 1 / โรงงาน 3)
--   เดิม frame_status ปนสถานะ+โรงงาน ("ขึ้นโครงโรงงาน3") → แยกช่อง "โรงงานผลิต" ออกมาชัด
--   ใช้แยกตารางผลิตช่างตามโรงงาน (โรง 1 / โรง 3 ดูคิวแยกกัน)
-- idempotent · เจ้าของรัน
alter table public.production_sets
  add column if not exists factories text[] not null default '{}';

-- index ค้นตามโรงงาน (แยกตารางผลิต)
create index if not exists production_sets_factories_idx on public.production_sets using gin (factories);

notify pgrst, 'reload schema';
