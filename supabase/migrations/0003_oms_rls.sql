-- ============================================================
-- JR OMS — 0003 Row Level Security (defense-in-depth)
-- BFF บังคับ RBAC ชั้นแรก, RLS เป็นชั้นสุดท้ายที่ DB
-- ============================================================

-- helper: role ของ caller
create or replace function public.auth_role()
returns role_t language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.has_role(variadic roles role_t[])
returns boolean language sql stable as $$
  select public.is_active() and public.auth_role() = any(roles)
$$;

-- enable RLS
alter table public.profiles        enable row level security;
alter table public.jobs            enable row level security;
alter table public.productions     enable row level security;
alter table public.installations   enable row level security;
alter table public.issues          enable row level security;
alter table public.finance_entries enable row level security;
alter table public.audit_logs      enable row level security;
alter table public.job_sequence    enable row level security;

-- ---------- PROFILES ----------
create policy profiles_self_read on public.profiles for select using (auth.uid() = id or public.has_role('ADMIN'));
create policy profiles_self_upd  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_admin_all on public.profiles for all    using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

-- ---------- JOBS ----------
-- ทุก active user อ่านได้ (finance fields ถูกกรองที่ BFF ตาม role)
create policy jobs_read on public.jobs for select using (public.is_active());
create policy jobs_write on public.jobs for insert with check (public.has_role('ADMIN','SALES','DESIGNER'));
create policy jobs_update on public.jobs for update using (public.has_role('ADMIN','SALES','DESIGNER')) with check (true);

-- ---------- PRODUCTIONS ----------
create policy prod_read on public.productions for select using (public.is_active());
create policy prod_write on public.productions for all using (public.has_role('ADMIN','PRODUCTION')) with check (public.has_role('ADMIN','PRODUCTION'));

-- ---------- INSTALLATIONS ----------
create policy inst_read on public.installations for select using (public.is_active());
create policy inst_write on public.installations for all using (public.has_role('ADMIN','INSTALLER')) with check (public.has_role('ADMIN','INSTALLER'));

-- ---------- ISSUES ----------
create policy issues_read on public.issues for select using (public.is_active());
create policy issues_write on public.issues for all using (public.has_role('ADMIN','PRODUCTION','INSTALLER','SALES')) with check (true);

-- ---------- FINANCE ----------
create policy finance_read on public.finance_entries for select using (public.has_role('ADMIN','ACCOUNTING','SALES'));
create policy finance_write on public.finance_entries for all using (public.has_role('ADMIN','ACCOUNTING')) with check (public.has_role('ADMIN','ACCOUNTING'));

-- ---------- AUDIT ----------
create policy audit_read on public.audit_logs for select using (public.has_role('ADMIN'));
create policy audit_insert on public.audit_logs for insert with check (public.is_active());

-- ---------- JOB SEQUENCE (เฉพาะ trigger ที่เป็น definer แตะ) ----------
create policy seq_read on public.job_sequence for select using (public.is_active());
