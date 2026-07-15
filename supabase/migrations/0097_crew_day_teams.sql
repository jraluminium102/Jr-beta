-- 0097: จัดทีมช่างรายวัน — ลอกฟีเจอร์จากเว็บ SetTeamApp ที่เจ้าของใช้จริงทุกวัน มาเพิ่มเป็น "แท็บใหม่" ในหน้าติดตั้ง
-- ⚠ ไม่แตะ/ไม่ใช้ install_teams + install_assignments (0086) — ตารางนั้นคือปฏิทินวางแผน "1 งาน → หลายวัน/ไม่ต่อเนื่อง"
--    (การ์ด = ลูกค้า+หัวหน้าช่าง ต่องาน) ส่วนอันนี้คือ "1 วัน → หลายทีม → หลายสถานที่/ทีม" (การ์ด = ทีม ต่อวัน)
--    คนละโมเดลข้อมูล คนละกรณีใช้งาน (แผนระยะยาวต่องาน vs จัดหน้างานรายวันละเอียด) จึงแยกตารางใหม่ ไม่ยุ่งของเดิม

-- รายชื่อช่าง (หัวหน้าทีม + สมาชิก) — คนเดียวกันเป็นได้ทั้งสองบทบาท
create table if not exists public.crew_people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_leader boolean not null default false,   -- เลือกเป็นหัวหน้าทีมได้
  is_member boolean not null default true,    -- เลือกเป็นลูกทีมได้
  is_active boolean not null default true,    -- ปิดใช้งาน (ลาออก) แทนการลบ
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- ทีมของแต่ละวัน (1 วัน มีได้หลายทีม สูงสุด ~16 จริงใช้ 9-11)
create table if not exists public.crew_day_teams (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  sort_order int not null default 0,
  start_time text not null default '',        -- เวลาเริ่มงาน: ช่องพิมพ์อิสระ ("6.30","8โมง","ตี4","000") ห้ามทำ time picker
  leader_id uuid references public.crew_people(id) on delete set null,
  member_ids uuid[] not null default '{}',    -- ลูกทีม (เลือกได้หลายคน)
  note text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);
create index if not exists idx_cdt_date on public.crew_day_teams(work_date);

-- สถานที่ทำงานของทีม (1-4 จุด/ทีม) — ผูกงานจากระบบได้ (autocomplete) หรือพิมพ์เอง (เช่น "โรงงาน","ลากลับบ้าน")
-- ดีกว่าต้นฉบับ: ถ้าผูก job_id → snapshot ที่อยู่หน้างาน+เบอร์ลูกค้าลงมาด้วย (ต้นฉบับไม่มี ช่างต้องไปหาเอง)
create table if not exists public.crew_team_sites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.crew_day_teams(id) on delete cascade,
  site_no int not null check (site_no between 1 and 4),
  job_id uuid references public.jobs(id) on delete set null,
  customer_name text not null default '',     -- ชื่อสถานที่/ลูกค้าที่โชว์ (autofill จาก job หรือพิมพ์เอง)
  appointment_time text not null default '',  -- เวลานัด (ข้อความสั้น)
  address text,                                -- snapshot ที่อยู่หน้างาน ณ ตอนเลือก
  phone text,                                  -- snapshot เบอร์ลูกค้า ณ ตอนเลือก
  created_at timestamptz default now(),
  unique (team_id, site_no)
);
create index if not exists idx_cts_team on public.crew_team_sites(team_id);
create index if not exists idx_cts_job on public.crew_team_sites(job_id) where job_id is not null;

alter table public.crew_people enable row level security;
alter table public.crew_day_teams enable row level security;
alter table public.crew_team_sites enable row level security;

-- RLS mirror 0086 (install_teams/install_assignments): read = ผู้ใช้ที่ active ทุกคน, write = ADMIN/INSTALLER
drop policy if exists cp_read on public.crew_people;
drop policy if exists cp_write on public.crew_people;
create policy cp_read  on public.crew_people for select using (public.is_active());
create policy cp_write on public.crew_people for all using (public.has_role('ADMIN','INSTALLER')) with check (public.has_role('ADMIN','INSTALLER'));

drop policy if exists cdt_read on public.crew_day_teams;
drop policy if exists cdt_write on public.crew_day_teams;
create policy cdt_read  on public.crew_day_teams for select using (public.is_active());
create policy cdt_write on public.crew_day_teams for all using (public.has_role('ADMIN','INSTALLER')) with check (public.has_role('ADMIN','INSTALLER'));

drop policy if exists cts_read on public.crew_team_sites;
drop policy if exists cts_write on public.crew_team_sites;
create policy cts_read  on public.crew_team_sites for select using (public.is_active());
create policy cts_write on public.crew_team_sites for all using (public.has_role('ADMIN','INSTALLER')) with check (public.has_role('ADMIN','INSTALLER'));

-- seed รายชื่อจริง: หัวหน้าทีม 7 คน + สมาชิก 55 คน (บางคนเป็นได้ทั้งสองบทบาท — "เป" เป็นหัวหน้าอย่างเดียว)
-- idempotent ผ่าน unique(name) + on conflict do nothing (รันซ้ำได้ ไม่ซ้ำแถว)
insert into public.crew_people (name, is_leader, is_member, sort_order)
select v.name, v.is_leader, v.is_member, v.sort_order
from (values
  -- หัวหน้าทีม (7) — 6 ใน 7 คนเป็นลูกทีมของทีมอื่นได้ด้วย, "เป" เป็นหัวหน้าอย่างเดียว
  ('กุ้ง', true, true, 1), ('โซ', true, true, 2), ('ทูน', true, true, 3),
  ('เนียน', true, true, 4), ('เป', true, false, 5), ('มอส', true, true, 6), ('เสก', true, true, 7),
  -- สมาชิก (49 คนที่เหลือ ไม่ซ้ำกับหัวหน้าด้านบน)
  ('กร', false, true, 10), ('เก่ง', false, true, 11), ('โก้', false, true, 12), ('คุณ', false, true, 13),
  ('จอ', false, true, 14), ('จอนนี่', false, true, 15), ('จ่อย', false, true, 16), ('ชัย', false, true, 17),
  ('ซอ', false, true, 18), ('ซู', false, true, 19), ('แดง', false, true, 20), ('แดน', false, true, 21),
  ('โด้', false, true, 22), ('ต้น', false, true, 23), ('ต้น2', false, true, 24), ('ตาล', false, true, 25),
  ('เต้ย', false, true, 26), ('เตี้ย', false, true, 27), ('โต้', false, true, 28), ('ทอม', false, true, 29),
  ('ไท', false, true, 30), ('นาย', false, true, 31), ('นาย2', false, true, 32), ('บอม', false, true, 33),
  ('บุญทิ้ง', false, true, 34), ('เบียร์', false, true, 35), ('แบงค์', false, true, 36), ('ประทีป', false, true, 37),
  ('ปั้น', false, true, 38), ('เป้า', false, true, 39), ('เปีย', false, true, 40), ('พร', false, true, 41),
  ('มองฮุง', false, true, 42), ('มิ้ง', false, true, 43), ('แรม', false, true, 44), ('เล็ก', false, true, 45),
  ('วิชัย', false, true, 46), ('วี', false, true, 47), ('ศรีพร', false, true, 48), ('ศักดิ์', false, true, 49),
  ('ศักดิ์2', false, true, 50), ('สาว', false, true, 51), ('เสือ', false, true, 52), ('หมี', false, true, 53),
  ('หวัน', false, true, 54), ('อั๋น', false, true, 55), ('เอ็ม', false, true, 56), ('แอ๊ด', false, true, 57),
  ('เฮ', false, true, 58)
) as v(name, is_leader, is_member, sort_order)
on conflict (name) do nothing;

-- กัน PostgREST schema cache ค้าง (เจอมาแล้วหลายรอบ — ดู memory) ให้รู้จักตาราง/คอลัมน์ใหม่ทันที
notify pgrst, 'reload schema';
