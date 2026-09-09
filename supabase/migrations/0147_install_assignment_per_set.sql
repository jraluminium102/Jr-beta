-- ============================================================
-- 0147 · ลงคิวติดตั้ง "รายชุด/รายข้อ" (per production_set)
--   เดิม install_assignments ผูกที่ระดับงาน (job) เท่านั้น → ลงคิวได้ทั้งงาน
--   เพิ่ม production_set_id (nullable) → ลงคิวเฉพาะชุด/ข้อได้ (เช่น "คุณX · ชุด1 ติดตั้ง 12/09")
--     · null = ลงคิวทั้งงานเหมือนเดิม (backward compatible)
--     · on delete set null → ถ้าชุดถูกลบ (เช่น Rev regen) การ์ดคิวไม่พัง กลับเป็นระดับงาน
--   set_label = ชื่อชุด ณ ตอนลงคิว (ไว้โชว์บนการ์ด · ไม่ join ทุกครั้ง)
-- idempotent · เจ้าของรัน
-- ============================================================

alter table public.install_assignments
  add column if not exists production_set_id bigint references public.production_sets(id) on delete set null,
  add column if not exists set_label text not null default '';

comment on column public.install_assignments.production_set_id is 'ชุดผลิตที่ลงคิวติดตั้ง (null = ทั้งงาน)';
comment on column public.install_assignments.set_label is 'ชื่อชุด ณ ตอนลงคิว (โชว์บนการ์ด)';

create index if not exists install_assignments_set_idx on public.install_assignments(production_set_id) where production_set_id is not null;
