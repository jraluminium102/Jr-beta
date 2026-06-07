-- ============================================================
-- 0012 — เฟส 3: ระบบเช็คลิสต์ผูกกับบทบาท
-- tables: checklist_templates, checklist_items, job_checklists
-- RLS:
--   อ่าน template/items = ทุก authenticated + is_active
--   เขียน template/items = ADMIN เท่านั้น
--   job_checklists: เขียนได้โดย role ที่อยู่ใน target_role ของ template หรือ ADMIN
-- ============================================================

-- ─── checklist_templates ────────────────────────────────────────────────────
-- หนึ่ง template = ชุดเช็คลิสต์สำหรับบทบาทนั้น ๆ
create table if not exists public.checklist_templates (
  id            bigint  generated always as identity primary key,
  name          text    not null,           -- ชื่อชุดเช็ค เช่น "ช่างวัดหน้างาน"
  target_role   role_t[] not null default '{}',  -- role ที่ใช้ template นี้ได้ (ว่าง = ทุก role)
  product_keys  text[]  not null default '{}',   -- กรองเฉพาะสินค้า (ว่าง = ทุกสินค้า)
  is_active     boolean not null default true,
  created_by    uuid    references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists checklist_templates_active_idx
  on public.checklist_templates (is_active);

-- ─── checklist_items ────────────────────────────────────────────────────────
-- รายการเช็คในแต่ละ template (ordered by seq)
create table if not exists public.checklist_items (
  id               bigint  generated always as identity primary key,
  template_id      bigint  not null references public.checklist_templates(id) on delete cascade,
  seq              smallint not null default 0,  -- ลำดับแสดง
  text             text    not null,             -- ข้อความรายการ เช่น "วัดช่องเปิดจริง"
  requires_sign    boolean not null default false, -- ต้องมีลายเซ็นหรือไม่
  created_at       timestamptz not null default now()
);

create index if not exists checklist_items_template_idx
  on public.checklist_items (template_id, seq);

-- ─── job_checklists ─────────────────────────────────────────────────────────
-- บันทึกผลการติ๊กเช็คลิสต์ต่อ production_order (ใช้ production_order_id แทน job_id
-- เพราะ production_order คือ entity ที่มีรายการสินค้าครบสำหรับสร้าง cover sheet)
create table if not exists public.job_checklists (
  id               bigint  generated always as identity primary key,
  production_order_id integer not null references public.production_orders(id) on delete cascade,
  template_id      bigint  not null references public.checklist_templates(id) on delete restrict,
  checked_by       uuid    not null references public.profiles(id) on delete restrict,
  checked_at       timestamptz not null default now(),
  items_state      jsonb   not null default '{}',
  -- items_state schema: { [item_id: string]: { checked: boolean, note?: string } }
  constraint uq_job_template unique (production_order_id, template_id)
);

create index if not exists job_checklists_po_idx
  on public.job_checklists (production_order_id);

-- ─── updated_at triggers ────────────────────────────────────────────────────
-- (set_updated_at() มีอยู่แล้วจาก 0011 — reuse)
drop trigger if exists checklist_templates_updated_at on public.checklist_templates;
create trigger checklist_templates_updated_at
  before update on public.checklist_templates
  for each row execute function public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.checklist_templates enable row level security;
alter table public.checklist_items     enable row level security;
alter table public.job_checklists      enable row level security;

-- checklist_templates: read = ทุก authenticated (กรอง is_active ที่ app layer)
create policy "read checklist_templates" on public.checklist_templates
  for select to authenticated
  using (public.is_active());

-- checklist_templates: write = ADMIN เท่านั้น
create policy "write checklist_templates" on public.checklist_templates
  for all to authenticated
  using  (public.is_active() and public.auth_role() = 'ADMIN')
  with check (public.is_active() and public.auth_role() = 'ADMIN');

-- checklist_items: read = ทุก authenticated
create policy "read checklist_items" on public.checklist_items
  for select to authenticated
  using (public.is_active());

-- checklist_items: write = ADMIN เท่านั้น
create policy "write checklist_items" on public.checklist_items
  for all to authenticated
  using  (public.is_active() and public.auth_role() = 'ADMIN')
  with check (public.is_active() and public.auth_role() = 'ADMIN');

-- job_checklists: read = authenticated ที่ is_active
create policy "read job_checklists" on public.job_checklists
  for select to authenticated
  using (public.is_active());

-- job_checklists: insert/update = เฉพาะ role ที่อยู่ใน target_role ของ template หรือ ADMIN
-- ตรวจผ่าน subquery เทียบ role ของ user กับ target_role array ใน template
create policy "write job_checklists" on public.job_checklists
  for all to authenticated
  using (
    public.is_active()
    and (
      public.auth_role() = 'ADMIN'
      or public.auth_role()::text = any(
        select unnest(t.target_role)::text
        from public.checklist_templates t
        where t.id = template_id
      )
    )
  )
  with check (
    public.is_active()
    and (
      public.auth_role() = 'ADMIN'
      or public.auth_role()::text = any(
        select unnest(t.target_role)::text
        from public.checklist_templates t
        where t.id = template_id
      )
    )
  );

-- ─── SEED: ตัวอย่างชุดเล็ก (เนื้อจริงทีมช่าง/เซลล์ต้องเพิ่มผ่านหน้า Admin) ───
-- หมายเหตุ: ค่า seq เว้น 10 เพื่อให้เพิ่มรายการแทรกกลางได้ง่าย

insert into public.checklist_templates (name, target_role, product_keys, is_active) values
  ('ช่างวัดหน้างาน', array['ADMIN','PRODUCTION','INSTALLER']::role_t[], '{}', true),
  ('เซลล์ปิดงาน',    array['ADMIN','SALES']::role_t[],                 '{}', true),
  ('ฝ่ายผลิต',       array['ADMIN','PRODUCTION']::role_t[],            '{}', true);

-- Template 1 items: ช่างวัดหน้างาน
insert into public.checklist_items (template_id, seq, text, requires_sign)
select t.id, v.seq, v.text, v.sign
from public.checklist_templates t,
(values
  (10,  'วัดช่องเปิดจริง (กว้าง × สูง ทุกช่อง)',    false),
  (20,  'ชนิดผนัง (ปูน / เบา / เหล็ก / อื่น ๆ)',    false),
  (30,  'ระดับพื้น / ผนังตรง (ระบุผลต่างถ้ามี)',      false),
  (40,  'ทิศบาน (สำหรับงานบานเปิด/บานเลื่อน)',        false),
  (50,  'สภาพผนังรอบช่อง (แตกร้าว/ชื้น/ฉาบใหม่)',     false),
  (60,  'ลายเซ็นผู้วัดหน้างาน',                      true)
) as v(seq, text, sign)
where t.name = 'ช่างวัดหน้างาน';

-- Template 2 items: เซลล์ปิดงาน
insert into public.checklist_items (template_id, seq, text, requires_sign)
select t.id, v.seq, v.text, v.sign
from public.checklist_templates t,
(values
  (10,  'ยืนยันสีอลูมิเนียม (รหัสสี/ชื่อสี)',             false),
  (20,  'ยืนยันชนิดกระจก (ใส/เขียว/เทมเปอร์/ลามิเนต)',    false),
  (30,  'ยืนยันทิศเปิด-ปิดบาน',                          false),
  (40,  'ระบุกำหนดส่ง: ผลิต / ติดตั้ง',                  false),
  (50,  'เงื่อนไขมัดจำ/ชำระเงิน',                        false),
  (60,  'ลายเซ็นลูกค้ายืนยันรายการ',                     true)
) as v(seq, text, sign)
where t.name = 'เซลล์ปิดงาน';

-- Template 3 items: ฝ่ายผลิต
insert into public.checklist_items (template_id, seq, text, requires_sign)
select t.id, v.seq, v.text, v.sign
from public.checklist_templates t,
(values
  (10,  'ตรวจจำนวนรายการครบ (ตามใบสั่งผลิต)',                false),
  (20,  'ตรวจสีอลูมิเนียมครบ / แยกล็อตสีถ้ามีหลายสี',        false),
  (30,  'กระจกพิเศษ (เทมเปอร์/ลามิเนต) — สั่งล่วงหน้าแล้ว?', false),
  (40,  'งานเร่ง — ยืนยันกำหนดส่ง + แจ้งทีม',                false),
  (50,  'วัดหน้างานแล้วก่อนผลิต',                            false),
  (60,  'QC ก่อนส่ง + ลายเซ็นผู้ตรวจ',                      true)
) as v(seq, text, sign)
where t.name = 'ฝ่ายผลิต';
