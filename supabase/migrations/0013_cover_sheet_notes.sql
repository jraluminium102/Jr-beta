-- ============================================================
-- 0013 — เฟส 3: ใบปะหน้า (cover sheet) เก็บโน้ตที่กรอกมือ
--
-- ใบปะหน้า = ตาราง 3 คอลัมน์ ต่อ 1 ใบสั่งผลิต (production_order):
--   คอลัมน์ 1 "สั่งของเตรียมผลิต"   = สร้างอัตโนมัติจากรายการในใบสั่งผลิต (ไม่เก็บใน DB)
--   คอลัมน์ 2 "แจ้งช่างตอนติดตั้ง"  = เก็บที่ installer_notes
--   คอลัมน์ 3 "แจ้งลูกค้าเตรียมของ" = เก็บที่ customer_notes
--
-- ตารางนี้เก็บเฉพาะส่วนที่คนกรอกมือ (คอลัมน์ 2-3 + คำเตือน)
-- คอลัมน์ 1 คำนวณสดตอนเปิดหน้า ไม่ต้องเก็บ
--
-- สิทธิ์: อ่าน = ผู้ใช้ที่ใช้งานอยู่ทุกคน · เขียน = ผลิต/เซลล์/แอดมิน
-- ============================================================

create table if not exists public.cover_sheet_notes (
  id                  bigint  generated always as identity primary key,

  -- ผูกกับใบสั่งผลิต 1 ใบปะหน้า ต่อ 1 ใบสั่งผลิต (ลบใบสั่งผลิต = ลบโน้ตตาม)
  production_order_id  bigint  not null
                       references public.production_orders(id) on delete cascade,

  -- คอลัมน์ 2: สิ่งที่ต้องแจ้งช่างให้เตรียมตอนไปติดตั้ง
  -- (เช่น เสริมกล่อง / ดรอปพื้น / เดินไฟ — หลายบรรทัดคั่นด้วยขึ้นบรรทัดใหม่)
  installer_notes      text    not null default '',

  -- คอลัมน์ 3: วัสดุที่ "ไม่รวม" ในราคา ลูกค้าต้องเตรียมไว้ให้ตอนติดตั้ง
  -- (เช่น สีทาเก็บงาน — หลายบรรทัดคั่นด้วยขึ้นบรรทัดใหม่)
  customer_notes       text    not null default '',

  -- คำเตือนตัวแดงมุมบนของใบ (ซ้าย/ขวา) เช่น "ระวังมุ้งผิด", "งานพื้นช่างเพยาว์"
  warning_left         text    not null default '',
  warning_right        text    not null default '',

  -- ใครแก้ล่าสุด + เวลา
  updated_by           uuid    references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- 1 ใบสั่งผลิต มีใบปะหน้าได้ใบเดียว
  constraint uq_cover_sheet_per_order unique (production_order_id)
);

create index if not exists cover_sheet_notes_order_idx
  on public.cover_sheet_notes (production_order_id);

-- อัปเดต updated_at อัตโนมัติเมื่อแก้ (reuse ฟังก์ชันเดิมจาก 0011)
drop trigger if exists cover_sheet_notes_updated_at on public.cover_sheet_notes;
create trigger cover_sheet_notes_updated_at
  before update on public.cover_sheet_notes
  for each row execute function public.set_updated_at();

-- ─── สิทธิ์การเข้าถึง (RLS) ───────────────────────────────────────────────────
alter table public.cover_sheet_notes enable row level security;

-- อ่าน = ผู้ใช้ที่ยังใช้งานอยู่ทุกคน
create policy "read cover_sheet_notes" on public.cover_sheet_notes
  for select to authenticated
  using (public.is_active());

-- เขียน = ฝ่ายผลิต / เซลล์ / แอดมิน เท่านั้น
create policy "write cover_sheet_notes" on public.cover_sheet_notes
  for all to authenticated
  using  (public.is_active() and public.auth_role() in ('ADMIN','PRODUCTION','SALES'))
  with check (public.is_active() and public.auth_role() in ('ADMIN','PRODUCTION','SALES'));
