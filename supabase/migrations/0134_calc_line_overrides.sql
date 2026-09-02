-- 0134 — ชั้นทับค่าสูตรคิดราคา 4.0 / ใบตัด (เจ้าของสั่ง 1 ก.ย.69)
--
-- สูตรทั้งหมดอยู่ใน "ซอร์สโค้ด" (products.mjs / cutlist/products.ts) ไม่ใช่ฐานข้อมูล
-- เว็บที่ deploy แล้วแก้ไฟล์ตัวเองไม่ได้ → "แก้ในเว็บ" ต้องทำผ่านตารางทับค่านี้
-- แล้วให้เอนจินอ่านมาประกบตอนรัน (ดู src/lib/calculator40/line-overrides.ts)
--
--   ซอร์ส (สูตรตั้งต้น) + ตารางทับค่านี้ = สูตรที่ใช้จริง
--
-- 1 แถว = 1 บรรทัดวัสดุที่ถูกทับค่า ผูกด้วย (product_id, scope, match_key)
--   product_id = id รุ่นใน products.mjs (คิดราคา) หรือ id ของ CutSpec (ใบตัด) — คนละ namespace กัน scope กันตายตัว
--   scope      = 'calc' (ฝั่งคิดราคา) | 'cut' (ฝั่งใบตัด)
--   match_key  = รหัสเส้น/สโตร์ (B####/F####/JR#####) ถ้าบรรทัดต้นทางไม่มีรหัสใช้ 'name:<ชื่อ>'
create table if not exists public.calc_line_overrides (
  id           bigint generated always as identity primary key,
  product_id   text    not null,
  scope        text    not null check (scope in ('calc', 'cut')),
  match_key    text    not null,
  -- ชื่อบรรทัด — ต้องมีคู่กับ match_key เพราะ "รหัสเดียวถูกใช้หลายบรรทัดในรุ่นเดียวกัน" เป็นเรื่องปกติ
  --   บานเปิดใช้ F7935 (คิ้วกระจก) 5 บรรทัด · ใบตัดชนกัน 92 กลุ่ม
  --   ถ้าอ้างด้วยรหัสอย่างเดียว = แก้ได้แค่บรรทัดแรก และ unique จะบล็อกไม่ให้สร้างของบรรทัดที่เหลือ
  --   ตรวจข้อมูลจริงแล้ว (รหัส + ชื่อ) ไม่ซ้ำเลยจาก 598 บรรทัดคิดราคา + 1,140 บรรทัดใบตัด
  match_name   text    not null default '',
  -- ค่าที่ทับ (null = ไม่ทับ ใช้ของเดิม)
  set_sku      text,                      -- เปลี่ยนรหัสสโตร์/รหัสเส้น
  set_qty      text,                      -- สูตรจำนวนใหม่ (ข้อความสูตรเดียวกับในซอร์ส)
  set_len      text,                      -- สูตรความยาว/ขนาดตัดใหม่ (ฝั่งใบตัด)
  set_price    numeric(14,2),             -- ราคาสำรองใหม่
  set_kg       numeric(10,4),             -- น้ำหนัก กก./เส้น (เฉพาะเส้นอลูที่เพิ่มเอง) — ไม่มี = ค่าอบสีคิดขาด
  -- แถวที่ "เพิ่มเอง" (ไม่มีในซอร์ส)
  is_added     boolean not null default false,
  item_name    text,
  unit         text,
  disabled     boolean not null default false,   -- ปิดแถวที่ซอร์สมีแต่ไม่ใช้แล้ว
  note         text    not null default '',
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- "ตรวจแล้ว" (หน้า /calculator40/link ไล่ตรวจ 550 แถว) — แยกจากการทับค่าจริง
  --   แถวที่มีแค่ reviewed_at (set_* ทุกช่อง null) = แค่ทำเครื่องหมายว่าดูแล้ว ไม่ได้ทับสูตรอะไร
  --   (ต้องมี row นี้เพื่อกันสถานะ "ตรวจแล้ว" หายตอน refresh/คนอื่นเห็นความคืบหน้าด้วย)
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users(id),
  unique (product_id, scope, match_key, match_name)
);

create index if not exists idx_clo_product on public.calc_line_overrides(product_id, scope);

-- updated_at อัตโนมัติ (ลอกแพทเทิร์นเดิมของโปรเจกต์ — ไม่มี trigger กลางใช้ร่วม เขียน trigger เฉพาะตารางนี้)
create or replace function public.calc_line_overrides_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_calc_line_overrides_touch on public.calc_line_overrides;
create trigger trg_calc_line_overrides_touch
  before update on public.calc_line_overrides
  for each row execute function public.calc_line_overrides_touch();

alter table public.calc_line_overrides enable row level security;

-- อ่าน: ทุก role ที่ล็อกอินอยู่ (หน้าคิดราคา/เทียบใบตัด/ตรวจสโตร์ เปิดได้ทุก role ที่ active — ตาม pattern 0093 qrev_read)
drop policy if exists clo_read on public.calc_line_overrides;
create policy clo_read on public.calc_line_overrides for select using (public.is_active());

-- เขียน: ADMIN/SALES/ACCOUNTING/PRODUCTION (คนที่ดูแลราคา/ต้นทุน/สูตรผลิตจริง — ไม่ให้ STORE เพราะตาบอดราคา)
drop policy if exists clo_write on public.calc_line_overrides;
create policy clo_write on public.calc_line_overrides for all
  using      (public.has_role('ADMIN', 'SALES', 'ACCOUNTING', 'PRODUCTION'))
  with check (public.has_role('ADMIN', 'SALES', 'ACCOUNTING', 'PRODUCTION'));

notify pgrst, 'reload schema';
