-- ============================================================
-- JR OMS — 0175 ที่มาของลูกค้า (รหัสแอด) ในคิวประเมิน
--
-- เจ้าของอยากรู้ว่าแอดตัวไหนทำให้เกิดยอดมัดจำ โดยไม่ต้องให้แอดมินถามลูกค้า
--   ลิงก์ไลน์ของแต่ละแอดเปิดแชทพร้อมข้อความพิมพ์รอไว้ มีรหัสสั้นในวงเล็บ เช่น "สนใจหน้าต่างบานยกครับ (A12)"
--   → เก็บรหัสนั้นไว้กับคิวตั้งแต่วันเปิดคิว (จากทักจนมัดจำ 1–4 เดือน ถ้าไม่เก็บตั้งแต่แรกจะหาย)
--
-- contact_channel (0043) = ช่องทางที่ใช้คุย (LINE/FB) · คนละเรื่องกับ "ที่มา"
--   lead_source       = ที่มา (ชุดปิด) — null = ยังไม่ได้ระบุ (รายงานนับเป็น "ไม่ทราบ")
--   lead_source_code  = รหัสแอด ข้อความอิสระสั้น ๆ เช่น A12
-- idempotent · โค้ดกันไว้แล้ว ถ้ายังไม่รันไฟล์นี้ คิวยังบันทึกได้ (แค่ไม่เก็บที่มา)
-- ============================================================

alter table public.queue_entries
  add column if not exists lead_source text,
  add column if not exists lead_source_code text;

-- กันค่าแปลก (ชุดปิด · null ได้) — NOT VALID กันพังถ้ามีข้อมูลเดิม แล้ว validate
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'queue_entries_lead_source_chk'
  ) then
    alter table public.queue_entries
      add constraint queue_entries_lead_source_chk
      check (lead_source is null or lead_source in
        ('FB_AD','TIKTOK','YOUTUBE','GOOGLE_MAPS','REFERRAL','OTHER','UNKNOWN')) not valid;
    alter table public.queue_entries validate constraint queue_entries_lead_source_chk;
  end if;
end $$;

-- รายงานแยกตามรหัสแอด
create index if not exists queue_entries_lead_source_idx
  on public.queue_entries (lead_source, lead_source_code)
  where lead_source is not null or lead_source_code is not null;

comment on column public.queue_entries.lead_source is
  'ที่มาของลูกค้า: FB_AD | TIKTOK | YOUTUBE | GOOGLE_MAPS | REFERRAL | OTHER | UNKNOWN · null = ยังไม่ระบุ (0175)';
comment on column public.queue_entries.lead_source_code is
  'รหัสแอดจากข้อความแรกของลูกค้า เช่น A12 (0175)';
