-- 0091: ติ๊ก "ส่งใบเสนอราคางานพื้นแล้ว" (เฉพาะงานพื้น JR ทำ) — ต่อยอด 0090
alter table public.jobs
  add column if not exists floor_quote_sent boolean not null default false;
