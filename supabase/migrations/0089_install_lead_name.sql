-- 0089: หน้าติดตั้งแบบปฏิทินเดือน — เลิกอิงทีม A/B/C ใช้ "หัวหน้าช่าง" พิมพ์อิสระต่อการเข้าติดตั้ง
-- team_id คงไว้ (nullable · ข้อมูลเก่าไม่พัง) แต่ UI ใหม่ไม่ใช้แล้ว
alter table public.install_assignments
  add column if not exists lead_name text not null default '';

-- ย้ายชื่อหัวหน้าจากทีมเดิมเข้าแถวที่ผูกทีมไว้ (ครั้งเดียว — แถวที่ยังว่าง)
update public.install_assignments a
set lead_name = t.lead_name
from public.install_teams t
where a.team_id = t.id and a.lead_name = '' and coalesce(t.lead_name, '') <> '';

create index if not exists idx_install_asg_lead on public.install_assignments(lead_name);
