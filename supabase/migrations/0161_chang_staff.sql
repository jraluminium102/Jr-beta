-- 0161 · บัญชีช่าง (ล็อกอินลิงก์ช่างด้วยรหัสพนักงาน)
--
-- เจ้าของสั่ง 21 ต.ค.69: "สร้างแอคเค้าท์หน้าเบิกของ เชื่อมกับหน้าผลิตช่าง + เบิกของ
--   ล็อกอินแค่รหัสพนักงาน ชื่อที่แสดงตอนเบิกเอาตามชื่อภาษาไทย"
--   ลิงก์ช่าง (โทเคน) ยังเป็นตัวกันคนนอกเหมือนเดิม · รหัสพนักงาน = บอกว่า "ใครกด" (แทนการพิมพ์/เลือกชื่อเอง)
-- idempotent · เจ้าของรัน
create table if not exists public.chang_staff (
  code        text primary key,                 -- JR002 (ตัวพิมพ์ใหญ่ ไม่มีเว้นวรรค)
  name        text not null,                    -- ชื่อที่โชว์ (ไทย)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.chang_staff enable row level security;
drop policy if exists chang_staff_read on public.chang_staff;
create policy chang_staff_read on public.chang_staff for select using (public.is_active());
drop policy if exists chang_staff_write on public.chang_staff;
create policy chang_staff_write on public.chang_staff for all
  using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

insert into public.chang_staff (code, name) values
  ('JR000', 'แอดมิน'),
  ('JR002', 'เป'),
  ('JR004', 'เนียน'),
  ('JR009', 'แบ้ง'),
  ('JR012', 'ต้น'),
  ('JR017', 'บอม'),
  ('JR040', 'ชัย'),
  ('JR046', 'จอย'),
  ('JR999', 'สโตร์')
on conflict (code) do update set name = excluded.name, is_active = true;
