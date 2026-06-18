-- ============================================================
-- 0048 · ติดตามฟีดแบคลูกค้า (คอลัมน์ "ส่งแบบแล้ว") — 3 ครั้ง
--   followup_1/2/3 = วันที่แอดมินตามฟีดแบคแต่ละครั้ง (สูงสุด 3)
--   ครบ 3 → ไม่ต้องตามอีก (UI เด้งไปบรรทัดล่างสุด)
-- ============================================================
alter table public.jobs
  add column if not exists followup_1 date,
  add column if not exists followup_2 date,
  add column if not exists followup_3 date;

notify pgrst, 'reload schema';
