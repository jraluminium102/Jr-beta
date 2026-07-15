-- 0098: โน้ตเด่น "ทำไมงานนี้ยังวัด/ผลิตไม่ได้" ต่อ job — โชว์วงเล็บหลังชื่อลูกค้าในหน้างานผลิต (ส่วนออฟฟิศ)
-- เจ้าของ: "เอาแบบคนกด" = เลือกจากตัวเลือกสำเร็จรูป (chip) ไม่พิมพ์เอง ยกเว้น "อื่นๆ" ที่พิมพ์ข้อความได้
-- เลือกได้หลายอันต่อ 1 งาน (เก็บเป็นตาราง ไม่ใช่คอลัมน์เดียว) เพื่อกดใส่/เอาออกได้เร็วจากหน้ารายการ
-- อย่าสับสนกับ jobs.floor_work (0090) — นั่นคือ "งานพื้น ผรม." เฉพาะทาง มีขั้นตอน jr/customer + ติ๊กส่งใบเสนอพื้น
-- ส่วนตารางนี้คือโน้ตทั่วไป "ทำไมยังวัด/ผลิตไม่ได้" (เหตุผลกว้างกว่า ติดงานพื้น/รอวัสดุค่ายต่างๆ/อื่นๆ)

create table if not exists public.job_blocker_notes (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  tag text not null check (tag in ('floor_work', 'wait_ykk', 'wait_tostem', 'other')),
  note text not null default '',   -- ข้อความเสริม (บังคับกรอกเมื่อ tag='other' — เช็คที่ BFF)
  -- source: manual = คนกดเอง (ตอนนี้ใช้ทางเดียว) · auto = ระบบเติมเองในอนาคต (ยังไม่ implement)
  -- จุดต่ออนาคต: ถ้าใบเสนอราคาที่ผูก job นี้มีรายการอ้างถึง ykk/tostem (เช็คจาก quotation_items.name/detail)
  -- แล้วลูกค้ามัดจำ (jobs.deposit_date ถูกเซ็ต) → insert แถวนี้อัตโนมัติ tag='wait_ykk'/'wait_tostem' source='auto'
  -- (กันคนลืมโน้ตเอง) — ยังไม่เคาะ trigger/hook จุดไหนแน่ชัด ให้ SA ออกแบบต่อตอนเจ้าของสั่งทำจริง
  source text not null default 'manual' check (source in ('manual', 'auto')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_blocker_notes_job on public.job_blocker_notes(job_id);
-- กันติ๊กแท็กสำเร็จรูปซ้ำต่องาน (ยกเว้น 'other' ที่พิมพ์ข้อความต่างกันได้หลายอัน)
create unique index if not exists uq_job_blocker_notes_tag on public.job_blocker_notes(job_id, tag) where tag <> 'other';

alter table public.job_blocker_notes enable row level security;
create policy jbn_read  on public.job_blocker_notes for select using (public.is_active());
-- write = คนที่แก้หน้างานผลิต (ตรงกับ productions table เดิม, rbac.ts resource "production")
create policy jbn_write on public.job_blocker_notes for all
  using (public.has_role('ADMIN', 'PRODUCTION'))
  with check (public.has_role('ADMIN', 'PRODUCTION'));
