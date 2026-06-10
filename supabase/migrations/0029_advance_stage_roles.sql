-- ============================================================
-- JR Beta — 0029 ผ่อนสิทธิ์ advance_stage ให้ตรงกับ BFF (jobs:write)
-- ปัญหา (audit 2026-06-10 🔴#1):
--   RPC advance_stage เดิม (0014:51) บังคับ has_role('ADMIN') เดี่ยว
--   แต่ BFF /api/jobs/[id]/advance ใช้ requirePermission("jobs","write")
--   = ADMIN/SALES/DESIGNER และ StageAdvanceButton ไม่ gate role
--   → SALES/DESIGNER กดปุ่ม "ไปขั้นต่อไป" ผ่าน BFF แต่ถูก RPC เด้ง forbidden
--   → flow 24 ขั้นเดิน manual ได้แค่ ADMIN (ขัด goal: แต่ละ role ขับขั้นของตัวเอง)
-- แก้: ผ่อน role check ใน advance_stage ให้ตรง BFF (ADMIN/SALES/DESIGNER)
--   (สเตจฝั่งผลิต/ติดตั้ง 9-19/21-23 ขับผ่านฟอร์ม production/installation + trigger
--    ไม่ผ่าน advance_stage ตรง จึงไม่ต้องเปิดให้ PRODUCTION/INSTALLER ที่ BFF กันอยู่แล้ว)
-- idempotent (create or replace) · รันหลัง 0028 · logic อื่นคงเดิมทุกบรรทัด
-- ============================================================

create or replace function public.advance_stage(p_job uuid, p_to smallint, p_note text default null)
returns smallint language plpgsql security definer set search_path = public as $$
declare cur smallint;
begin
  -- [🔴#1] ผ่อนจาก ADMIN เดี่ยว → ตรงกับ BFF jobs:write (ADMIN/SALES/DESIGNER)
  if not (public.has_role('ADMIN') or public.has_role('SALES') or public.has_role('DESIGNER')) then
    raise exception 'forbidden: ต้องเป็น ADMIN/SALES/DESIGNER';
  end if;
  select current_stage into cur from public.jobs where id = p_job for update;
  if cur is null then raise exception 'ไม่พบงาน %', p_job; end if;
  if cur >= 24 then raise exception 'งานจบแล้ว (stage 24)'; end if;

  -- valid: ไปหน้า +1 หรือ loop ที่ whitelist (4→3, 6→5, 12→11, 23→22)
  if not (p_to = cur + 1
          or (cur = 4 and p_to = 3) or (cur = 6 and p_to = 5)
          or (cur = 12 and p_to = 11) or (cur = 23 and p_to = 22)) then
    raise exception 'เปลี่ยนสเตจไม่ถูกต้อง % -> % (ไปทีละขั้น หรือ loop ที่อนุญาตเท่านั้น)', cur, p_to;
  end if;

  update public.jobs
    set current_stage = p_to,
        stage_history = stage_history || jsonb_build_object(
          'from', cur, 'to', p_to, 'at', now(), 'by', auth.uid(), 'note', p_note)
    where id = p_job;

  perform public._sync_legacy_status(p_job, p_to);
  return p_to;
end $$;

grant execute on function public.advance_stage(uuid, smallint, text) to authenticated, service_role;
