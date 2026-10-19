-- 0158 · ใบเบิกอลู — ช่างเบิกเส้นเองผ่านมือถือ (ลิงก์ช่าง) ผูกงานลูกค้า · ตัดสต็อกทันที · สโตร์ตรวจทีหลัง
--
-- เจ้าของสั่ง 19 ต.ค.69: เดิมช่างหยิบเส้นแล้วติ๊กกระดาษ (ไม่ระบุงาน) → สโตร์นับ/จด/พิมพ์เข้าเว็บเอง
--   รู้ไม่ได้ว่าเส้นไปงานไหน · สโตร์ทำซ้ำ 3 รอบ
--   ใหม่: ช่างกดเลือกงาน → เลือกเส้น → ใส่จำนวน → บันทึก = stock_moves out (ref PK-id · requester ชื่อช่าง · job_id)
--   สโตร์เปิดหน้า "สโตร์อลู" กด "ตรวจแล้ว" · ช่างแก้/คืน/ยกเลิกได้เองจนกว่าจะถูกตรวจ
--
-- ยอดจริงอยู่ที่ stock_moves (ref = PK-<id>) เสมอ · ตารางนี้ = หัวใบ + รายการ (ไว้แก้/คืน/ตรวจ เป็นใบ)
-- idempotent · เจ้าของรัน

create table if not exists public.alu_picks (
  id            bigserial primary key,
  code          text not null default '',                    -- PK-<id> (ตั้งหลัง insert · ใช้เป็น ref ใน stock_moves)
  job_id        uuid references public.jobs(id) on delete set null,
  reason        text not null default '' check (reason in ('', 'repair', 'other')),  -- '' = งานลูกค้า
  reason_note   text not null default '',                    -- อื่นๆ ระบุ
  picker_name   text not null default '',                    -- ชื่อช่างที่เบิก (จากลิงก์ช่าง)
  status        text not null default 'open' check (status in ('open', 'checked', 'cancelled')),
  checked_at    timestamptz,
  checked_by    uuid,
  checked_by_name text not null default '',
  cancelled_at  timestamptz,
  cancel_reason text not null default '',
  cancelled_by_name text not null default '',
  note          text not null default '',
  created_by    uuid,                                        -- null = ช่างผ่านลิงก์
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_alu_picks_job on public.alu_picks(job_id);
create index if not exists idx_alu_picks_created on public.alu_picks(created_at desc);
create index if not exists idx_alu_picks_picker on public.alu_picks(picker_name);

create table if not exists public.alu_pick_items (
  id            bigserial primary key,
  pick_id       bigint not null references public.alu_picks(id) on delete cascade,
  stock_item_id bigint not null references public.stock_items(id),
  qty           numeric(14,2) not null default 0,            -- จำนวนเบิกปัจจุบัน (หลังแก้แล้ว)
  returned      numeric(14,2) not null default 0,            -- คืนแล้วกี่เส้น
  sort_order    int not null default 0
);
create index if not exists idx_alu_pick_items_pick on public.alu_pick_items(pick_id);
create index if not exists idx_alu_pick_items_item on public.alu_pick_items(stock_item_id);

drop trigger if exists trg_alu_picks_touch on public.alu_picks;
create trigger trg_alu_picks_touch before update on public.alu_picks
  for each row execute function public.touch_updated_at();

-- RLS: อ่านทุกคนที่ active · เขียน = ชุดเดียวกับสโตร์ (STORE_WRITE) · ช่างผ่านลิงก์ใช้ service client (สิทธิ์คุมที่ API)
alter table public.alu_picks enable row level security;
alter table public.alu_pick_items enable row level security;
drop policy if exists alu_picks_read on public.alu_picks;
create policy alu_picks_read on public.alu_picks for select using (public.is_active());
drop policy if exists alu_picks_write on public.alu_picks;
create policy alu_picks_write on public.alu_picks for all
  using (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'));
drop policy if exists alu_pick_items_read on public.alu_pick_items;
create policy alu_pick_items_read on public.alu_pick_items for select using (public.is_active());
drop policy if exists alu_pick_items_write on public.alu_pick_items;
create policy alu_pick_items_write on public.alu_pick_items for all
  using (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'));
