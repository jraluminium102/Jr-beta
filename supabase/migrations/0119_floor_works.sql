-- 0119: ระบบคิดราคางานพื้น / งานผู้รับเหมา (ช่างเพยาว์)
--
-- บริบท (เจ้าของเคาะ 6 ส.ค.2569 หลังอ่านใบเสนอจริง 3 ใบ + ใบเบิกงวด 1 ใบ):
--   · เอกสารออก "ตามฟอร์มช่าง" — หัวเรื่อง "เอกสารแสดงปริมาณและราคางานสถาปัตย์"
--     ชื่อ/เบอร์/บัญชี = ของช่างผู้รับจ้าง · ไม่มี VAT · ยอดรวม = ผลบวกรายการตรง ๆ
--   · ราคาในไฟล์ = ราคาขายลูกค้า (ไม่บวกกำไรทับ · แยกขาดจากคิดราคา 4.0)
--   · เลขเอกสารคนละชุดกับใบเสนออลูมิเนียม → doc_type = 'FL'
--   · ผูก job ที่ floor_work='jr' ได้ หรือพิมพ์ชื่อลูกค้านอกระบบก็ได้ (job_id/customer_id null ได้ทั้งคู่)
--
-- 3 ตาราง: หัวเอกสาร · รายการ (แบ่งหมวดได้ · เพิ่มเองได้) · งวดเงิน (ใบเบิกงวด)

-- ═══════════ 1) หัวเอกสาร ═══════════
create table if not exists public.floor_quotations (
  id                bigserial primary key,
  code              text not null unique,                    -- FL2569080001
  job_id            uuid references public.jobs(id) on delete set null,
  customer_id       bigint references public.customers(id) on delete set null,
  -- ลูกค้า: ผูกทะเบียนก็ได้ พิมพ์เองก็ได้ → snapshot คือแหล่งความจริงของ "ใบนี้" เสมอ
  customer_snapshot jsonb not null default '{}'::jsonb,      -- { name, address, phone }
  -- ผู้รับจ้าง (ช่าง) — ขึ้นหัว/ท้ายเอกสารและใบเบิกงวด · เก็บ snapshot ต่อใบ เผื่อเปลี่ยนช่าง
  contractor        jsonb not null default '{}'::jsonb,      -- { name, phone, bank_name, bank_acc }
  issue_date        date not null default (now() at time zone 'Asia/Bangkok')::date,
  rev               int  not null default 0,                 -- 0 = ใบแรก · 1+ → พิมพ์ "(Rev01)"
  status            text not null default 'draft',           -- draft|sent|accepted|cancelled
  -- ตัวตั้งจากเครื่องคิด — เก็บไว้เปิดกลับมาแก้/วาดผังซ้ำได้ (ห้ามคิดใหม่จาก total)
  calc              jsonb not null default '{}'::jsonb,      -- { width, length, pile_key, pile_price, rows_b, rows_l, piles, beam_len, area }
  total             numeric(14,2) not null default 0,        -- = ผลบวก line_total ทุกรายการ (ไม่มี VAT)
  note              text not null default '',
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_fq_job on public.floor_quotations(job_id);
create index if not exists idx_fq_customer on public.floor_quotations(customer_id);
create index if not exists idx_fq_issue on public.floor_quotations(issue_date desc);

-- ═══════════ 2) รายการ ═══════════
-- group_label = ชื่อหมวด (ใบจริงมีหลายหมวด แต่ละหมวดมียอดรวมของตัวเอง · เลขข้อเริ่ม 1 ใหม่ทุกหมวด)
-- material_price/labor_price = คอลัมน์ "ค่าวัสดุ/ค่าแรง" ในฟอร์มช่าง — เว้นว่างได้ (ใบจริงส่วนใหญ่ใส่ค่าแรงอย่างเดียว)
create table if not exists public.floor_quotation_items (
  id             bigserial primary key,
  quotation_id   bigint not null references public.floor_quotations(id) on delete cascade,
  group_label    text not null default '',
  sort_order     int  not null default 0,
  name           text not null,
  qty            numeric(12,2) not null default 1,
  unit           text not null default 'งาน',
  material_price numeric(12,2),                              -- null = ไม่ระบุ (พิมพ์ "-" บนใบ)
  labor_price    numeric(12,2),
  unit_price     numeric(12,2) not null default 0,           -- "ราคางาน" ต่อหน่วย
  line_total     numeric(14,2) not null default 0,           -- = qty × unit_price
  remark         text not null default '',                   -- ช่องหมายเหตุ เช่น "งานเพิ่ม"
  source         text not null default 'manual'              -- auto = เครื่องคิดให้ · suggest = ค่าแนะนำ · manual = พิมพ์เอง
);
create index if not exists idx_fqi_quotation on public.floor_quotation_items(quotation_id, sort_order);

-- ═══════════ 3) งวดเงิน (ใบเบิกงวด) ═══════════
-- seq 0 = มัดจำ · 1..N = งวด · is_final = งวดสุดท้าย ("เก็บเงินส่วนที่เหลือ")
-- work_items = รายการงานในงวดนั้น (ข้อความ บรรทัดละข้อ — ลอกจากใบจริงที่เขียนเป็นลิสต์)
create table if not exists public.floor_installments (
  id           bigserial primary key,
  quotation_id bigint not null references public.floor_quotations(id) on delete cascade,
  seq          int not null,
  label        text not null default '',
  amount       numeric(14,2) not null default 0,
  work_items   text not null default '',
  is_final     boolean not null default false,
  unique (quotation_id, seq)
);
create index if not exists idx_fi_quotation on public.floor_installments(quotation_id, seq);

-- ═══════════ RLS ═══════════
-- อ่าน: ทุกคนที่ใช้งานอยู่ · เขียน: ADMIN/SALES (คนออกใบเสนอ) — เหมือนสิทธิ์ใบเสนอปกติ
alter table public.floor_quotations      enable row level security;
alter table public.floor_quotation_items enable row level security;
alter table public.floor_installments    enable row level security;

drop policy if exists fq_read  on public.floor_quotations;
drop policy if exists fq_write on public.floor_quotations;
create policy fq_read  on public.floor_quotations for select using (public.is_active());
create policy fq_write on public.floor_quotations for all
  using (public.has_role('ADMIN','SALES')) with check (public.has_role('ADMIN','SALES'));

drop policy if exists fqi_read  on public.floor_quotation_items;
drop policy if exists fqi_write on public.floor_quotation_items;
create policy fqi_read  on public.floor_quotation_items for select using (public.is_active());
create policy fqi_write on public.floor_quotation_items for all
  using (public.has_role('ADMIN','SALES')) with check (public.has_role('ADMIN','SALES'));

drop policy if exists fi_read  on public.floor_installments;
drop policy if exists fi_write on public.floor_installments;
create policy fi_read  on public.floor_installments for select using (public.is_active());
create policy fi_write on public.floor_installments for all
  using (public.has_role('ADMIN','SALES')) with check (public.has_role('ADMIN','SALES'));

-- ═══════════ updated_at ═══════════
create or replace function public.tg_floor_quotation_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_fq_touch on public.floor_quotations;
create trigger trg_fq_touch before update on public.floor_quotations
  for each row execute function public.tg_floor_quotation_touch();

comment on table public.floor_quotations is
  'ใบเสนอราคางานพื้น/งานผู้รับเหมา — ออกตามฟอร์มช่าง (ไม่มี VAT · ยอดรวม = ผลบวกรายการ) · เลขชุด FL แยกจาก QT';

notify pgrst, 'reload schema';
