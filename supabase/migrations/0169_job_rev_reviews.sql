-- ============================================================
-- 0169 · "Rev. หลังมัดจำ" — เจ้าของสั่ง 3 พ.ย.69
--   ปัญหา: ลูกค้าแก้แบบ/ใบเสนอหลังมัดจำ แอดมินคอนเฟิร์มลูกค้า แต่ข่าวไปไม่ถึงฝ่ายผลิต → งานหลุด
--   แก้: ทุกครั้งที่ใบเสนอขึ้น Rev ขณะงานมัดจำแล้ว → บันทึก 1 แถวที่นี่ = "รอฝ่ายผลิตตรวจ"
--   เป็นสถานะพิเศษแยกจากวงจรผลิต (งานยังอยู่เฟสเดิม from_status) · ฝ่ายผลิตกด "รับทราบ" แล้วหาย
-- ============================================================
create table if not exists public.job_rev_reviews (
  id              bigserial primary key,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  quotation_id    int  not null references public.quotations(id) on delete cascade,
  rev_no          int  not null,
  rev_label       text not null default '',
  from_status     text not null default '',      -- productions.status ตอน Rev (เฟสจริงที่งานอยู่)
  job_status      text not null default '',      -- jobs.status ตอน Rev
  summary         jsonb not null default '[]',   -- อะไรเปลี่ยน (diffQuotationItems)
  sets_regen      text not null default 'none',  -- auto = ดึงชุดผลิตใหม่ให้แล้ว · deferred = กำลังผลิต รอฝ่ายผลิตตัดสิน · skipped = ชุดมาจากใบอื่น · none = ไม่มีชุด auto
  cover_sync      text not null default 'none',  -- auto = ใบปะหน้าอัปเดตให้แล้ว · manual = ใบปะหน้ามีแก้มือ ต้องดูเอง · none = ยังไม่มีใบปะหน้า
  created_by      uuid,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  ack_at          timestamptz,
  ack_by          uuid,
  ack_by_name     text not null default '',
  ack_note        text not null default '',
  ack_sets        text not null default ''       -- ตอนรับทราบเลือก: regen (ดึงชุดใหม่) · keep (ไม่ดึง)
);
create index if not exists idx_job_rev_reviews_job_open on public.job_rev_reviews (job_id) where ack_at is null;
create index if not exists idx_job_rev_reviews_created on public.job_rev_reviews (created_at desc);

alter table public.job_rev_reviews enable row level security;
drop policy if exists job_rev_reviews_read on public.job_rev_reviews;
create policy job_rev_reviews_read on public.job_rev_reviews for select using (public.is_active());
drop policy if exists job_rev_reviews_write on public.job_rev_reviews;
-- CHANG มี production:write ใน rbac (กดรับทราบจากหน้าผลิตได้) — ต้องอยู่ใน policy ด้วย (บทเรียน 0058/0098/0111)
create policy job_rev_reviews_write on public.job_rev_reviews for all
  using (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','CHANG'))
  with check (public.has_role('ADMIN','PRODUCTION','SALES','ACCOUNTING','CHANG'));

notify pgrst, 'reload schema';
