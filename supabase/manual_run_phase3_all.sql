-- ============================================================
-- เฟส 3 — รันมือใน Supabase Dashboard → SQL Editor (ครั้งเดียวจบ)
-- สร้าง: ระบบเช็คลิสต์ (3 ตาราง) + ใบปะหน้า (1 ตาราง)
--
-- วิธีใช้: ก๊อปทั้งไฟล์ → วางใน SQL Editor → กด Run
-- ปลอดภัย: รันซ้ำได้ไม่พัง (drop policy ก่อนสร้าง, seed ใส่เฉพาะตอนยังไม่มีข้อมูล)
-- รวมฟังก์ชัน set_updated_at ในตัวแล้ว — ไม่ต้องรัน migration อื่นก่อน
-- ============================================================

-- 0) ฟังก์ชันอัปเดตเวลาแก้ล่าสุด
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- ส่วน A — เช็คลิสต์ (tick-list เตือนเซลล์/ช่าง)
-- ════════════════════════════════════════════════════════════

-- ชุดเช็ค (1 ชุด = 1 บทบาท)
create table if not exists public.checklist_templates (
  id            bigint  generated always as identity primary key,
  name          text    not null,                       -- ชื่อชุดเช็ค
  target_role   role_t[] not null default '{}',          -- บทบาทที่ใช้ชุดนี้ได้
  product_keys  text[]  not null default '{}',           -- กรองเฉพาะสินค้า (ว่าง = ทุกสินค้า)
  is_active     boolean not null default true,
  created_by    uuid    references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists checklist_templates_active_idx
  on public.checklist_templates (is_active);

-- รายการเช็คในแต่ละชุด
create table if not exists public.checklist_items (
  id               bigint  generated always as identity primary key,
  template_id      bigint  not null references public.checklist_templates(id) on delete cascade,
  seq              smallint not null default 0,           -- ลำดับแสดง
  text             text    not null,                      -- ข้อความรายการ
  requires_sign    boolean not null default false,        -- ต้องมีลายเซ็นหรือไม่
  created_at       timestamptz not null default now()
);
create index if not exists checklist_items_template_idx
  on public.checklist_items (template_id, seq);

-- ผลการติ๊กต่อใบสั่งผลิต
create table if not exists public.job_checklists (
  id               bigint  generated always as identity primary key,
  production_order_id integer not null references public.production_orders(id) on delete cascade,
  template_id      bigint  not null references public.checklist_templates(id) on delete restrict,
  checked_by       uuid    not null references public.profiles(id) on delete restrict,
  checked_at       timestamptz not null default now(),
  items_state      jsonb   not null default '{}',
  constraint uq_job_template unique (production_order_id, template_id)
);
create index if not exists job_checklists_po_idx
  on public.job_checklists (production_order_id);

drop trigger if exists checklist_templates_updated_at on public.checklist_templates;
create trigger checklist_templates_updated_at
  before update on public.checklist_templates
  for each row execute function public.set_updated_at();

-- สิทธิ์ (RLS)
alter table public.checklist_templates enable row level security;
alter table public.checklist_items     enable row level security;
alter table public.job_checklists      enable row level security;

drop policy if exists "read checklist_templates" on public.checklist_templates;
create policy "read checklist_templates" on public.checklist_templates
  for select to authenticated using (public.is_active());

drop policy if exists "write checklist_templates" on public.checklist_templates;
create policy "write checklist_templates" on public.checklist_templates
  for all to authenticated
  using  (public.is_active() and public.auth_role() = 'ADMIN')
  with check (public.is_active() and public.auth_role() = 'ADMIN');

drop policy if exists "read checklist_items" on public.checklist_items;
create policy "read checklist_items" on public.checklist_items
  for select to authenticated using (public.is_active());

drop policy if exists "write checklist_items" on public.checklist_items;
create policy "write checklist_items" on public.checklist_items
  for all to authenticated
  using  (public.is_active() and public.auth_role() = 'ADMIN')
  with check (public.is_active() and public.auth_role() = 'ADMIN');

drop policy if exists "read job_checklists" on public.job_checklists;
create policy "read job_checklists" on public.job_checklists
  for select to authenticated using (public.is_active());

drop policy if exists "write job_checklists" on public.job_checklists;
create policy "write job_checklists" on public.job_checklists
  for all to authenticated
  using (
    public.is_active() and (
      public.auth_role() = 'ADMIN'
      or public.auth_role()::text = any(
        select unnest(t.target_role)::text from public.checklist_templates t where t.id = template_id)
    )
  )
  with check (
    public.is_active() and (
      public.auth_role() = 'ADMIN'
      or public.auth_role()::text = any(
        select unnest(t.target_role)::text from public.checklist_templates t where t.id = template_id)
    )
  );

-- SEED ตัวอย่าง 3 ชุด (ใส่เฉพาะตอนยังไม่มีชุดเช็คเลย — รันซ้ำไม่ทำให้ซ้ำ)
do $$
begin
  if not exists (select 1 from public.checklist_templates) then
    insert into public.checklist_templates (name, target_role, product_keys, is_active) values
      ('ช่างวัดหน้างาน', array['ADMIN','PRODUCTION','INSTALLER']::role_t[], '{}', true),
      ('เซลล์ปิดงาน',    array['ADMIN','SALES']::role_t[],                 '{}', true),
      ('ฝ่ายผลิต',       array['ADMIN','PRODUCTION']::role_t[],            '{}', true);

    insert into public.checklist_items (template_id, seq, text, requires_sign)
    select t.id, v.seq, v.text, v.sign
    from public.checklist_templates t,
    (values
      (10,'วัดช่องเปิดจริง (กว้าง × สูง ทุกช่อง)',false),
      (20,'ชนิดผนัง (ปูน / เบา / เหล็ก / อื่น ๆ)',false),
      (30,'ระดับพื้น / ผนังตรง (ระบุผลต่างถ้ามี)',false),
      (40,'ทิศบาน (สำหรับงานบานเปิด/บานเลื่อน)',false),
      (50,'สภาพผนังรอบช่อง (แตกร้าว/ชื้น/ฉาบใหม่)',false),
      (60,'ลายเซ็นผู้วัดหน้างาน',true)
    ) as v(seq, text, sign) where t.name = 'ช่างวัดหน้างาน';

    insert into public.checklist_items (template_id, seq, text, requires_sign)
    select t.id, v.seq, v.text, v.sign
    from public.checklist_templates t,
    (values
      (10,'ยืนยันสีอลูมิเนียม (รหัสสี/ชื่อสี)',false),
      (20,'ยืนยันชนิดกระจก (ใส/เขียว/เทมเปอร์/ลามิเนต)',false),
      (30,'ยืนยันทิศเปิด-ปิดบาน',false),
      (40,'ระบุกำหนดส่ง: ผลิต / ติดตั้ง',false),
      (50,'เงื่อนไขมัดจำ/ชำระเงิน',false),
      (60,'ลายเซ็นลูกค้ายืนยันรายการ',true)
    ) as v(seq, text, sign) where t.name = 'เซลล์ปิดงาน';

    insert into public.checklist_items (template_id, seq, text, requires_sign)
    select t.id, v.seq, v.text, v.sign
    from public.checklist_templates t,
    (values
      (10,'ตรวจจำนวนรายการครบ (ตามใบสั่งผลิต)',false),
      (20,'ตรวจสีอลูมิเนียมครบ / แยกล็อตสีถ้ามีหลายสี',false),
      (30,'กระจกพิเศษ (เทมเปอร์/ลามิเนต) — สั่งล่วงหน้าแล้ว?',false),
      (40,'งานเร่ง — ยืนยันกำหนดส่ง + แจ้งทีม',false),
      (50,'วัดหน้างานแล้วก่อนผลิต',false),
      (60,'QC ก่อนส่ง + ลายเซ็นผู้ตรวจ',true)
    ) as v(seq, text, sign) where t.name = 'ฝ่ายผลิต';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
-- ส่วน B — ใบปะหน้า (เก็บโน้ตคอลัมน์ 2-3 + คำเตือน)
-- ════════════════════════════════════════════════════════════

create table if not exists public.cover_sheet_notes (
  id                  bigint  generated always as identity primary key,
  production_order_id  bigint  not null
                       references public.production_orders(id) on delete cascade,
  installer_notes      text    not null default '',   -- คอลัมน์ 2 แจ้งช่างติดตั้ง
  customer_notes       text    not null default '',   -- คอลัมน์ 3 แจ้งลูกค้าเตรียมของ
  warning_left         text    not null default '',   -- คำเตือนแดงมุมซ้าย
  warning_right        text    not null default '',   -- คำเตือนแดงมุมขวา
  updated_by           uuid    references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint uq_cover_sheet_per_order unique (production_order_id)
);
create index if not exists cover_sheet_notes_order_idx
  on public.cover_sheet_notes (production_order_id);

drop trigger if exists cover_sheet_notes_updated_at on public.cover_sheet_notes;
create trigger cover_sheet_notes_updated_at
  before update on public.cover_sheet_notes
  for each row execute function public.set_updated_at();

alter table public.cover_sheet_notes enable row level security;

drop policy if exists "read cover_sheet_notes" on public.cover_sheet_notes;
create policy "read cover_sheet_notes" on public.cover_sheet_notes
  for select to authenticated using (public.is_active());

drop policy if exists "write cover_sheet_notes" on public.cover_sheet_notes;
create policy "write cover_sheet_notes" on public.cover_sheet_notes
  for all to authenticated
  using  (public.is_active() and public.auth_role() in ('ADMIN','PRODUCTION','SALES'))
  with check (public.is_active() and public.auth_role() in ('ADMIN','PRODUCTION','SALES'));

-- ✅ เสร็จ — ถ้าขึ้น "Success" คือสร้างครบทั้งเช็คลิสต์ + ใบปะหน้า
