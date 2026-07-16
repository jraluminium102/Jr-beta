-- ============================================================
-- 0100: สัญลักษณ์ site นอกบอร์ด (crew_team_sites.off_board)
--       + คิวติดตั้งนอกระบบ (install_assignments งานพิเศษ ไม่มี job)
-- ------------------------------------------------------------
-- ที่มา (เจ้าของสั่ง 18 ก.ค.2569 — งาน copy SetTeam เข้าระบบ):
--   1) จุดงานที่ import จาก SetTeam ไม่มีใครอยู่บนบอร์ด "พร้อมติดตั้ง" (จัดคิว/ติดตั้งไปแล้ว)
--      → ทำสัญลักษณ์ให้รู้ว่า "ไม่ได้มาจากไปป์ไลน์พร้อมติดตั้ง" (off_board)
--   2) งานพิเศษนอกระบบ (ไม่มีในระบบเลย) ต้องใส่คิวติดตั้งในปฏิทินได้ด้วยชื่อพิมพ์เอง
--      → install_assignments.job_id เป็น null ได้ + custom_title เก็บชื่องานที่พิมพ์เอง
-- idempotent
-- ============================================================

-- (1) จุดงานในจัดทีมรายวัน: ธงบอกว่านอกบอร์ดพร้อมติดตั้ง (import/งานพิเศษ)
alter table public.crew_team_sites
  add column if not exists off_board boolean not null default false;

-- (2) ปฏิทินติดตั้ง: รองรับ "คิวนอกระบบ" — งานพิเศษที่ไม่มี job ในระบบ
--     job_id เดิม NOT NULL → ทำให้ null ได้ (งานนอกระบบไม่มี job)
alter table public.install_assignments
  alter column job_id drop not null;
alter table public.install_assignments
  add column if not exists custom_title text;

-- กันข้อมูลเสีย: ต้องมีอย่างน้อย job_id หรือ custom_title อย่างใดอย่างหนึ่ง
-- (ลบ constraint เดิมก่อนถ้ามี แล้วสร้างใหม่ — idempotent)
alter table public.install_assignments
  drop constraint if exists ia_job_or_title;
alter table public.install_assignments
  add constraint ia_job_or_title
  check (job_id is not null or nullif(trim(coalesce(custom_title, '')), '') is not null);
