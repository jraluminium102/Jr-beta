-- ============================================================
-- JR — 0010 คิวงาน/นัดประเมิน (Queue) — Supabase เป็น source of truth
-- เลิกพึ่ง Google Sheet เดิม · BFF บังคับ RBAC ชั้นแรก, RLS ชั้นสุดท้าย
-- เฟส 1: โครงสร้าง + กรอก/แสดงคิว (เครื่องยนต์จัดอัตโนมัติอยู่เฟส 2)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS (กัน error เมื่อรันซ้ำ) ----------
do $$ begin
  create type queue_status_t as enum ('PENDING','PROPOSED','CONFIRMED','DONE','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type queue_team_t as enum ('BKK','PHUKET');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_size_t as enum ('SINGLE','MULTI','FULLDAY');  -- จุดเดียว/หลายจุด/เต็มวัน
exception when duplicate_object then null; end $$;

do $$ begin
  create type avail_kind_t as enum ('LEAVE_FULL','LEAVE_HALF','OFFICE_HALF','HOLIDAY');
exception when duplicate_object then null; end $$;

-- ---------- เซลล์ (พร้อมจุดเริ่มต้นเดินทาง = ออฟฟิศ JR) ----------
create table if not exists public.queue_sales (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,                 -- lai / mac / bas
  name        text not null,                         -- ไล้ / แม็ก / บาส
  team        queue_team_t not null default 'BKK',
  start_label text,                                  -- ชื่อจุดเริ่มต้น (ออฟฟิศ)
  start_lat   double precision,                      -- พิกัดออฟฟิศ (ใช้ตอนเฟส 2)
  start_lng   double precision,
  profile_id  uuid references public.profiles(id),   -- ผูกกับบัญชี login เพื่อให้เซลล์ดูคิวตัวเอง
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- คิวงาน ----------
create table if not exists public.queue_entries (
  id            uuid primary key default gen_random_uuid(),
  status        queue_status_t not null default 'PENDING',
  queue_date    date,                                -- วันที่นัด (null = ยังไม่จัด)
  queue_time    text,                                -- HH:MM
  job_type      text,                                -- ประเภทงาน (ประเมินหน้างาน/โชว์รูม/…)
  sales_id      uuid references public.queue_sales(id),
  line_contact  text,                                -- LINE ติดต่อลูกค้า
  customer_name text not null,
  tel           text,
  address       text,
  location_url  text,                                -- ลิงก์แผนที่/โลเคชั่น
  lat           double precision,                    -- พิกัดลูกค้า (สำหรับคำนวณระยะ เฟส 2)
  lng           double precision,
  job_size      job_size_t,                          -- จุดเดียว/หลายจุด/เต็มวัน
  job_count     int,                                 -- จำนวนงาน/จุดที่ต้องประเมิน
  assess_fee    numeric(12,2),                       -- ค่าประเมิน
  payment       text,                                -- การชำระ
  receipt_done  boolean not null default false,      -- ส่งใบเสร็จให้ลูกค้าแล้ว (checklist)
  note_admin    text,
  note_ai       text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists queue_entries_date_idx   on public.queue_entries (queue_date);
create index if not exists queue_entries_status_idx on public.queue_entries (status);
create index if not exists queue_entries_sales_idx  on public.queue_entries (sales_id);

-- auto-stamp updated_at (ใช้ฟังก์ชันเดิมจาก 0002)
drop trigger if exists touch_queue_entries on public.queue_entries;
create trigger touch_queue_entries before update on public.queue_entries
  for each row execute function public.tg_touch_updated_at();

-- ---------- ตารางว่าง/ลา/วันอยู่ออฟฟิศ (แอดมินลงเอง) ----------
create table if not exists public.sales_availability (
  id        uuid primary key default gen_random_uuid(),
  sales_id  uuid not null references public.queue_sales(id) on delete cascade,
  date      date not null,
  kind      avail_kind_t not null,
  half      text check (half in ('AM','PM')),        -- สำหรับครึ่งวัน
  note      text,
  created_at timestamptz not null default now()
);
create index if not exists sales_availability_idx on public.sales_availability (sales_id, date);

-- ---------- ตั้งค่าปรับได้ (ใช้ตอนเฟส 2) ----------
create table if not exists public.queue_settings (
  id            int primary key default 1,
  avg_speed_kmh numeric not null default 40,          -- ความเร็วเฉลี่ยแปลง กม.→นาที
  detour_factor numeric not null default 1.3,         -- ตัวคูณอ้อมถนนจากเส้นตรง
  monthly_quota int not null default 24,              -- โควตา/เดือน/เซลล์ (เตือน ไม่ห้ามเกิน)
  max_pair_min  int not null default 45,              -- เวลาเดินทางระหว่าง 2 เจ้าสูงสุด
  constraint queue_settings_singleton check (id = 1)
);

-- ============================================================
-- RLS (อ่านได้ทุก active user · เขียนเฉพาะ ADMIN — แอดมินจัดคิว)
-- ============================================================
alter table public.queue_sales        enable row level security;
alter table public.queue_entries      enable row level security;
alter table public.sales_availability enable row level security;
alter table public.queue_settings     enable row level security;

drop policy if exists queue_sales_read  on public.queue_sales;
drop policy if exists queue_sales_write on public.queue_sales;
create policy queue_sales_read  on public.queue_sales  for select using (public.is_active());
create policy queue_sales_write on public.queue_sales  for all    using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

drop policy if exists queue_entries_read  on public.queue_entries;
drop policy if exists queue_entries_write on public.queue_entries;
-- ADMIN เห็นทุกคิว · เซลล์เห็นเฉพาะคิวที่ผูก sales_id กับบัญชีตัวเอง (กัน 2 ชั้น ไม่พึ่ง BFF อย่างเดียว)
create policy queue_entries_read on public.queue_entries for select using (
  public.has_role('ADMIN') or exists (
    select 1 from public.queue_sales s where s.id = queue_entries.sales_id and s.profile_id = auth.uid()
  )
);
create policy queue_entries_write on public.queue_entries for all   using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

drop policy if exists sales_avail_read  on public.sales_availability;
drop policy if exists sales_avail_write on public.sales_availability;
create policy sales_avail_read  on public.sales_availability for select using (public.is_active());
create policy sales_avail_write on public.sales_availability for all   using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

drop policy if exists queue_settings_read  on public.queue_settings;
drop policy if exists queue_settings_write on public.queue_settings;
create policy queue_settings_read  on public.queue_settings for select using (public.is_active());
create policy queue_settings_write on public.queue_settings for all   using (public.has_role('ADMIN')) with check (public.has_role('ADMIN'));

-- ============================================================
-- SEED — เซลล์ + ออฟฟิศ + ตั้งค่า
-- ⚠️ พิกัดออฟฟิศเป็นค่าประมาณ — ให้แก้เป็นพิกัดจริงก่อนใช้เครื่องยนต์จัดคิว (เฟส 2)
--    BKK ออฟฟิศ JR พุทธบูชา 26/1 · PHUKET ดูจากลิงก์ที่ให้ไว้
-- ============================================================
insert into public.queue_sales (code, name, team, start_label, start_lat, start_lng) values
  ('lai', 'ไล้', 'BKK',    'ออฟฟิศ JR พุทธบูชา 26/1', 13.6466, 100.4936),
  ('mac', 'แม็ก', 'BKK',   'ออฟฟิศ JR พุทธบูชา 26/1', 13.6466, 100.4936),
  ('bas', 'บาส', 'PHUKET', 'ออฟฟิศ JR ภูเก็ต',        null,     null)
on conflict (code) do nothing;

insert into public.queue_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- GRANTS — ให้ PostgREST (role authenticated/anon) แตะตารางได้ (RLS ยังบังคับสิทธิ์อยู่)
-- จำเป็นเพราะ migration นี้รันแยกจาก setup-all.sql (ซึ่ง grant ก่อนสร้างตารางนี้)
-- ============================================================
grant all on public.queue_sales, public.queue_entries, public.sales_availability, public.queue_settings
  to anon, authenticated, service_role;

-- ผูกบัญชี login ของเซลล์เพื่อให้เซลล์เห็นคิวของตัวเอง (แก้อีเมลให้ตรงจริงแล้วรัน)
-- update public.queue_sales set profile_id=(select id from public.profiles where email='lai@jr.com')  where code='lai';
-- update public.queue_sales set profile_id=(select id from public.profiles where email='mac@jr.com')  where code='mac';
-- update public.queue_sales set profile_id=(select id from public.profiles where email='bas@jr.com')  where code='bas';
