-- 0088: ประวัติการเปลี่ยน "เรตอลูต่อโล" (หน้า /stock/alu-rates)
-- เก็บเป็นเหตุการณ์ต่อกลุ่ม (ซีรีส์×สี): เรตเดิม→ใหม่ กี่เส้น ใคร เมื่อไหร่ — รายเส้นดูได้จาก stock_prices อยู่แล้ว
create table if not exists public.alu_rate_log (
  id bigserial primary key,
  series text not null,
  color text not null,
  prev_rate numeric,                 -- เรตเฉลี่ยก่อนเปลี่ยน (null = ยังไม่เคยตั้ง)
  rate numeric not null,             -- เรตใหม่ ฿/กก.
  item_count int not null default 0, -- จำนวนเส้นที่อัปเดต
  changed_by uuid,
  changed_by_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_alu_rate_log_group on public.alu_rate_log(series, color, created_at desc);

alter table public.alu_rate_log enable row level security;
drop policy if exists alu_rate_log_read  on public.alu_rate_log;
drop policy if exists alu_rate_log_write on public.alu_rate_log;
create policy alu_rate_log_read  on public.alu_rate_log for select using (true);
create policy alu_rate_log_write on public.alu_rate_log for all
  using      (public.has_role('ADMIN','ACCOUNTING'))
  with check (public.has_role('ADMIN','ACCOUNTING'));

grant select, insert on public.alu_rate_log to authenticated, service_role;
