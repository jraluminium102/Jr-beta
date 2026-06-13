-- ============================================================
-- JR OMS — 0033 job_documents: เอกสารประกอบงาน (BOQ / สัญญา / ใบรับประกัน)
-- ศูนย์เอกสารต่องาน เฟส 2 — ติ๊กว่าทำแล้ว + แนบลิงก์ไฟล์นอกระบบ
-- idempotent — รันซ้ำได้
-- ============================================================

create table if not exists public.job_documents (
  id          uuid        primary key default gen_random_uuid(),
  job_id      uuid        not null references public.jobs(id) on delete cascade,
  doc_type    text        not null,            -- 'boq' | 'contract' | 'warranty' | 'other'
  doc_no      text,                            -- เลขเอกสาร (ถ้ามี)
  file_link   text,                            -- ลิงก์ไฟล์ที่ทำนอกระบบ
  doc_date    date,                            -- วันที่ของเอกสาร
  meta        jsonb       not null default '{}'::jsonb,  -- warranty: {start_date, years}
  done        boolean     not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.job_documents                  is 'เอกสารประกอบงาน (BOQ / สัญญา / ใบรับประกัน / อื่น ๆ) — ทำนอกระบบ ติ๊กว่าทำแล้ว + แนบลิงก์';
comment on column public.job_documents.doc_type         is '''boq'' | ''contract'' | ''warranty'' | ''other''';
comment on column public.job_documents.meta             is 'ฟิลด์พิเศษตาม doc_type เช่น warranty: {start_date, years}';
comment on column public.job_documents.done             is 'ติ๊กว่าทำแล้ว (true) หรือยัง (false)';

-- index: lookup ตาม job
create index if not exists idx_job_documents_job
  on public.job_documents(job_id);

-- unique: เอกสารชนิดละ 1 ต่องาน (รองรับ upsert onConflict job_id,doc_type)
-- ใช้ full unique (ไม่ partial) เพราะ Supabase upsert ใช้ partial index เป็น arbiter ไม่ได้ (Postgres 42P10)
create unique index if not exists uq_job_documents_job_type
  on public.job_documents(job_id, doc_type);

-- auto-stamp updated_at (ใช้ function tg_touch_updated_at ที่สร้างไว้ใน 0002)
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'touch_job_documents'
      and tgrelid = 'public.job_documents'::regclass
  ) then
    create trigger touch_job_documents
      before update on public.job_documents
      for each row execute function public.tg_touch_updated_at();
  end if;
end $$;

-- ============================================================
-- RLS — ตาม pattern jobs: active user อ่านได้ · ADMIN/SALES/PRODUCTION เขียน
-- ============================================================
alter table public.job_documents enable row level security;

drop policy if exists job_documents_read  on public.job_documents;
drop policy if exists job_documents_write on public.job_documents;

create policy job_documents_read on public.job_documents
  for select using (public.is_active());

create policy job_documents_write on public.job_documents
  for all
  using      (public.has_role('ADMIN', 'SALES', 'PRODUCTION', 'INSTALLER', 'ACCOUNTING'))
  with check (public.has_role('ADMIN', 'SALES', 'PRODUCTION', 'INSTALLER', 'ACCOUNTING'));

grant select, insert, update, delete on public.job_documents to authenticated, service_role;
