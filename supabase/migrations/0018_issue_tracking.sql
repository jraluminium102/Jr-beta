-- ============================================================
-- JR Beta — 0018 Issue tracking: due date + priority + log อัปเดต (admin track)
-- เพิ่ม field บน issues + ตาราง issue_updates · ไม่แตะ flow เดิม · idempotent · รันหลัง 0017
-- ============================================================

-- ---------- field ใหม่บน issues ----------
alter table public.issues add column if not exists due_date date;
alter table public.issues add column if not exists priority smallint not null default 0;

-- ---------- index (เฉพาะปัญหาที่ยังไม่ปิด) ----------
create index if not exists issues_due_idx   on public.issues(due_date) where status <> 'CLOSED';
create index if not exists issues_owner_idx  on public.issues(owner_id) where status <> 'CLOSED';

-- ---------- log อัปเดตปัญหา (timeline) ----------
create table if not exists public.issue_updates (
  id         bigint generated always as identity primary key,
  issue_id   uuid not null references public.issues(id) on delete cascade,
  note       text not null,
  new_status issue_status_t,
  author_id  uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists issue_updates_issue_idx on public.issue_updates(issue_id);

-- ============================================================
-- RLS — อ่านได้ทุกคน · active user เขียน log ได้
-- ============================================================
alter table public.issue_updates enable row level security;

drop policy if exists issue_updates_read  on public.issue_updates;
drop policy if exists issue_updates_write on public.issue_updates;
create policy issue_updates_read  on public.issue_updates for select using (true);
create policy issue_updates_write on public.issue_updates for all
  using      (public.is_active())
  with check (public.is_active());

grant select, insert, update, delete on public.issue_updates to authenticated, service_role;
