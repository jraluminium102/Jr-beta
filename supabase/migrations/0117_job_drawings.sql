-- 0117 · แบบลูกค้า (PDF) + สแตมป์สเปคจากใบเสนอ/ใบปะหน้า ลากวางเอง แก้ได้ พิมพ์ได้
-- เจ้าของ: ปกติพิมพ์สเปค (สีอลู/กระจก/มุ้ง ต่อข้อ) ลงแบบให้ช่างอ่าน ไม่ต้องเปิดใบเสนอ · ทำเฉพาะงานมัดจำแล้ว
-- เก็บ: ไฟล์แบบ (bucket 'drawings') + รูปต่อหน้า (เว็บ render จาก pdfjs) + ตำแหน่งข้อความ (สัดส่วน 0..1 ไม่เพี้ยนตามจอ)
-- idempotent · เจ้าของรัน
-- ============================================================

create table if not exists public.job_drawings (
  id            bigint generated always as identity primary key,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  title         text not null default '',            -- ชื่อชุดแบบ (พิมพ์เอง) เผื่อ 1 งานมีหลายแผ่น
  pdf_path      text not null default '',            -- ไฟล์ PDF ต้นฉบับใน bucket 'drawings'
  original_name text not null default '',
  pages         jsonb not null default '[]'::jsonb,  -- [{path, w, h}] รูป PNG ต่อหน้า (เว็บ render จาก pdf)
  annotations   jsonb not null default '[]'::jsonb,  -- [{page, xf, yf, size, text, color, align}] xf/yf = สัดส่วน 0..1 ของหน้า
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);
create index if not exists job_drawings_job_idx on public.job_drawings(job_id);

alter table public.job_drawings enable row level security;

-- อ่านได้: role ที่เห็นงานผลิต/ช่าง (เอาไว้ให้ช่างเปิดดูแบบ+สเปค) · เขียน: แอดมิน/ผลิต/ดีไซเนอร์ (คนเตรียมแบบ)
drop policy if exists job_drawings_read on public.job_drawings;
create policy job_drawings_read on public.job_drawings for select
  using (public.has_role('ADMIN','PRODUCTION','SALES','DESIGNER','ACCOUNTING','INSTALLER'));
drop policy if exists job_drawings_write on public.job_drawings;
create policy job_drawings_write on public.job_drawings for all
  using (public.has_role('ADMIN','PRODUCTION','DESIGNER'))
  with check (public.has_role('ADMIN','PRODUCTION','DESIGNER'));

-- ── storage bucket 'drawings' (เลียนแบบ 'stock' 0073/0074) ──
-- public=true: path เป็น uuid สุ่ม (เดาไม่ได้) · เว็บโชว์รูป <img src=publicUrl> ตรง ๆ ไม่ต้อง signed url
insert into storage.buckets (id, name, public)
  values ('drawings', 'drawings', true)
  on conflict (id) do nothing;

drop policy if exists "drawings bucket read"   on storage.objects;
create policy "drawings bucket read"   on storage.objects for select using (bucket_id = 'drawings');
drop policy if exists "drawings bucket write"  on storage.objects;
create policy "drawings bucket write"  on storage.objects for insert to authenticated
  with check (bucket_id = 'drawings' and public.has_role('ADMIN','PRODUCTION','DESIGNER'));
drop policy if exists "drawings bucket update" on storage.objects;
create policy "drawings bucket update" on storage.objects for update to authenticated
  using (bucket_id = 'drawings' and public.has_role('ADMIN','PRODUCTION','DESIGNER'));
drop policy if exists "drawings bucket delete" on storage.objects;
create policy "drawings bucket delete" on storage.objects for delete to authenticated
  using (bucket_id = 'drawings' and public.has_role('ADMIN','PRODUCTION','DESIGNER'));
