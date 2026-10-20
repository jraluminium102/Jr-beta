-- 0160 · เฟบหน้าตัดอลูในหน้าสรุปคงเหลือ (สโตร์อลู)
--
-- เจ้าของสั่ง 20 ต.ค.69: "ขอแบบกดเฟบได้ด้วย ตัวที่เฟบให้เอาไว้บนสุด"
--   เก็บกลาง (ทุกเครื่อง/ทุกคนในสโตร์เห็นชุดเดียวกัน) · pkey = คีย์หน้าตัด (รหัส B/F หรือ "N:ชื่อ") ตัวเดียวกับหน้าเบิกช่าง
-- idempotent · เจ้าของรัน
create table if not exists public.alu_favorites (
  pkey        text primary key,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
alter table public.alu_favorites enable row level security;
drop policy if exists alu_fav_read on public.alu_favorites;
create policy alu_fav_read on public.alu_favorites for select using (public.is_active());
drop policy if exists alu_fav_write on public.alu_favorites;
create policy alu_fav_write on public.alu_favorites for all
  using (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','STORE'));
