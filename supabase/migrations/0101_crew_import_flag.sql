-- 0101: กัน auto-import (ปฏิทิน → จัดทีม) ดึงงานที่ถูกลบทิ้งกลับมาซ้ำ
-- เดิม auto-import กันซ้ำด้วย "job_id ที่ยังอยู่ในจุดของทีมวันนั้น" → ลบทีมทิ้ง = job_id หาย = ดึงกลับมาอีก
-- ธงนี้ผูกกับตัว install_assignment: import เข้าจัดทีมแล้วครั้งเดียว = ไม่ดึงซ้ำ แม้จะลบทีมในหน้าจัดทีมทิ้ง
alter table public.install_assignments
  add column if not exists crew_imported boolean not null default false;
