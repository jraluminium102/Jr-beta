-- ============================================================
-- 0069 · "นามออกบิล" (billing_profiles) — 1 ลูกค้า → ออกเอกสารได้หลายนาม
--
-- เคสจริง: ผู้ติดต่อเป็นดีไซน์เนอร์ → ออกบิลได้หลายนาม
--   (ชื่อเจ้าของบ้าน / บริษัทของดีไซน์เนอร์ / ชื่อตัวเองทำบ้านตัวเอง)
-- เดิม customers เก็บ name/address/tax_id เดียว → ออกได้นามเดียว
--
-- ทำ: ตาราง billing_profiles (หลายนาม/ลูกค้า) แยก บุคคล/นิติบุคคล + เลขภาษี + สาขา + ที่อยู่ภาษี
--   เอกสารยัง snapshot หัวบิลเหมือนเดิม (freeze) — เฟสถัดไปจะให้ "เลือกนาม" ตอนออกเอกสาร
-- backfill: สร้างนามเริ่มต้น 1 นาม/ลูกค้า จากข้อมูลเดิม (ไม่เสียของ)
-- idempotent · เจ้าของรัน
-- ============================================================

create table if not exists public.billing_profiles (
  id             bigint generated always as identity primary key,
  customer_id    bigint not null references public.customers(id) on delete cascade,
  kind           text not null default 'INDIVIDUAL'
                   check (kind in ('INDIVIDUAL','COMPANY')),   -- บุคคลธรรมดา / นิติบุคคล
  bill_name      text not null,                                 -- ชื่อที่ออกบิล (คน/บริษัท)
  tax_id         text not null default '',                      -- เลขผู้เสียภาษี 13 หลัก
  branch         text not null default 'สำนักงานใหญ่',          -- 'สำนักงานใหญ่' หรือ 'สาขาที่ NNNNN'
  address        text not null default '',                      -- ที่อยู่ตามภาษี (ออกบิล)
  ship_address   text not null default '',                      -- ที่อยู่จัดส่ง/หน้างาน (แยกจากที่อยู่บิล)
  contact_person text not null default '',                      -- ผู้ติดต่อ (แยกจากชื่อบิล)
  phone          text not null default '',
  is_default     boolean not null default false,                -- นามหลัก (auto-เลือกตอนออกเอกสาร)
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- เผื่อรันเวอร์ชันก่อนแล้ว (ยังไม่มี ship_address) — เพิ่มแบบ idempotent
alter table public.billing_profiles add column if not exists ship_address text not null default '';

create index if not exists billing_profiles_customer_idx on public.billing_profiles(customer_id);
-- 1 นามหลัก ต่อลูกค้า (partial unique)
create unique index if not exists billing_profiles_one_default
  on public.billing_profiles(customer_id) where is_default;

-- touch updated_at
drop trigger if exists touch_billing_profiles on public.billing_profiles;
create trigger touch_billing_profiles before update on public.billing_profiles
  for each row execute function public.tg_touch_updated_at();

-- RLS: อ่าน/เขียนตามสิทธิ์เดียวกับ customers (ผูก policy ภายหลังถ้าจำเป็น — ตอนนี้ผ่าน service/BFF)
alter table public.billing_profiles enable row level security;
drop policy if exists billing_profiles_all on public.billing_profiles;
create policy billing_profiles_all on public.billing_profiles
  for all using (true) with check (true);

-- ── backfill: สร้างนามเริ่มต้น 1 นาม/ลูกค้า จากข้อมูลเดิม (เฉพาะลูกค้าที่ยังไม่มี profile) ──
insert into public.billing_profiles
  (customer_id, kind, bill_name, tax_id, branch, address, contact_person, phone, is_default)
select c.id,
       'INDIVIDUAL',                       -- เริ่มเป็นบุคคลทั้งหมด (ปรับเป็นนิติบุคคลทีหลังในทะเบียน)
       c.name,
       coalesce(c.tax_id, ''),
       'สำนักงานใหญ่',
       coalesce(c.address, ''),
       coalesce(c.contact_person, ''),
       coalesce(c.phone, ''),
       true
from public.customers c
where not exists (select 1 from public.billing_profiles bp where bp.customer_id = c.id);
