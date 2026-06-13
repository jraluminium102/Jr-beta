-- ============================================================
-- JR OMS — 0034 job_vat_rate: รองรับลูกค้าไม่คิด VAT + fix RLS job_documents_write
-- idempotent — รันซ้ำได้
-- ============================================================

-- เพิ่มคอลัมน์ vat_rate ให้ jobs (0=ไม่คิด VAT, 7=คิด VAT 7%)
alter table public.jobs add column if not exists vat_rate numeric(5,2) not null default 7;
comment on column public.jobs.vat_rate is 'อัตรา VAT ของงาน: 7=คิด VAT 7%, 0=ไม่คิด VAT';

alter table public.jobs drop constraint if exists jobs_vat_rate_chk;
alter table public.jobs add constraint jobs_vat_rate_chk check (vat_rate in (0, 7));

-- แก้ trigger tg_calc_financials: ไม่ hardcode 7% → ใช้ vat_rate ของงาน
-- งานเดิม 152 ใบ: default 7 → round(net*7/100,2) = เดิมเป๊ะ ยอดไม่ขยับ
create or replace function public.tg_calc_financials()
returns trigger language plpgsql as $$
begin
  if new.net_amount is not null then
    new.vat_amount   := round(new.net_amount * coalesce(new.vat_rate, 7) / 100.0, 2);
    new.total_amount := new.net_amount + new.vat_amount;
  end if;
  return new;
end $$;

-- ต้องเพิ่ม vat_rate ใน event list เพื่อให้ trigger ยิงเมื่อแก้ vat_rate ด้วย
drop trigger if exists calc_financials on public.jobs;
create trigger calc_financials
  before insert or update of net_amount, vat_rate on public.jobs
  for each row execute function public.tg_calc_financials();

-- แก้ BUG-01: RLS job_documents_write เดิมไม่ครอบ DESIGNER
-- BFF requirePermission("jobs","write") ให้ ADMIN/SALES/DESIGNER
-- → align RLS ให้ตรงกัน (เพิ่ม DESIGNER เข้าไป ตัด PRODUCTION/INSTALLER/ACCOUNTING ออก)
drop policy if exists job_documents_write on public.job_documents;
create policy job_documents_write on public.job_documents for all
  using      (public.has_role('ADMIN', 'SALES', 'DESIGNER'))
  with check (public.has_role('ADMIN', 'SALES', 'DESIGNER'));
