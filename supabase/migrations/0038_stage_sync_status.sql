-- ============================================================
-- JR OMS — 0038 stage sync → forward-sync jobs.status (gap fix)
--
-- ปัญหา: tg_business_field_stage_sync (0037) ดัน current_stage ถูกต้องแล้ว
--   แต่ไม่ sync jobs.status ไปด้วย → dashboard/jobsByStatus อ่าน status เดิม (drift)
--   ตัวอย่าง: PATCH quote_sent_date → current_stage=7 แต่ status ยังเป็น LEAD
--
-- แก้: CREATE OR REPLACE function เดิม + เพิ่ม rank-based forward-only status sync
--   ทำงานใน BEFORE trigger เดียวกัน (เซ็ต NEW.status ตรง ไม่ต้อง UPDATE/recursion)
--   Trigger เดิมชี้ฟังก์ชันนี้อยู่แล้ว (ไม่ต้อง drop/create trigger ใหม่)
--
-- หลักการ rank-based forward-only:
--   LEAD=1, PENDING_QUOTE=2, QUOTE_SENT=3, PENDING_DECISION=4
--   → bump ได้เฉพาะเมื่อ rank(implied) > rank(current status)
--   → PENDING_DECISION (rank4) ไม่ถูกทับโดย QUOTE_SENT (rank3) เด็ดขาด
--
-- ไม่แตะ: advance_stage / _sync_legacy_status / trigger tg_on_deposit
--          / tg_production_changes / tg_installation_changes
-- idempotent (create or replace) · รันหลัง 0037
-- ============================================================

create or replace function public.tg_business_field_stage_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  required_stage smallint;
  implied_status job_status_t;
  rank_implied   int;
  rank_current   int;
begin
  -- Skip: งานที่ผ่านมัดจำแล้ว (DEPOSITED+) → production/install trigger ดูแลเอง
  if NEW.status in ('DEPOSITED', 'IN_PRODUCTION', 'INSTALLING', 'COMPLETED', 'CANCELLED') then
    return NEW;
  end if;

  -- ================================================================
  -- ส่วน A (เดิมจาก 0037): คำนวณ required_stage จาก business field (forward-only)
  -- ================================================================
  required_stage := 1;  -- ค่า default (stage 1 = ลูกค้าใหม่)

  if NEW.quote_sent_date is not null then
    -- มีวันส่งใบเสนอ → อย่างน้อย stage 7 (ส่งใบเสนอให้ลูกค้า)
    required_stage := greatest(required_stage, 7::smallint);
  elsif NEW.design_state = 'DONE' then
    -- แบบเสร็จแล้ว → อย่างน้อย stage 4 (เซลล์ตรวจแบบ)
    required_stage := greatest(required_stage, 4::smallint);
  elsif NEW.design_state in ('DRAWING', 'REVISING', 'PENDING_CUSTOMER') then
    -- กำลังเขียนแบบ/แก้แบบ/รอลูกค้าอนุมัติ → อย่างน้อย stage 3 (เขียนแบบ)
    required_stage := greatest(required_stage, 3::smallint);
  end if;

  -- Forward-only stage: ดันไปหน้าเท่านั้น ห้ามถอย
  if required_stage > coalesce(NEW.current_stage, 1) then
    NEW.current_stage := required_stage;
  end if;

  -- ================================================================
  -- ส่วน B (ใหม่ 0038): forward-sync NEW.status จาก NEW.current_stage
  --   rank-based: bump ได้เฉพาะเมื่อ implied rank สูงกว่า current rank
  --   → ป้องกัน PENDING_DECISION ถูก clobber โดย QUOTE_SENT
  -- ================================================================

  -- คำนวณ implied status จาก stage ที่เพิ่งตั้ง
  implied_status := case
    when NEW.current_stage >= 7           then 'QUOTE_SENT'::job_status_t
    when NEW.current_stage between 3 and 6 then 'PENDING_QUOTE'::job_status_t
    else                                       'LEAD'::job_status_t
  end;

  -- rank: LEAD=1, PENDING_QUOTE=2, QUOTE_SENT=3, PENDING_DECISION=4
  -- (status นอกกลุ่มนี้ผ่าน guard บนไปแล้ว จึงไม่ต้องจัดการ DEPOSITED+ ที่นี่)
  rank_implied := case implied_status
    when 'LEAD'             then 1
    when 'PENDING_QUOTE'    then 2
    when 'QUOTE_SENT'       then 3
    when 'PENDING_DECISION' then 4
    else 0
  end;

  rank_current := case NEW.status
    when 'LEAD'             then 1
    when 'PENDING_QUOTE'    then 2
    when 'QUOTE_SENT'       then 3
    when 'PENDING_DECISION' then 4
    else 0
  end;

  -- bump เฉพาะเมื่อ implied rank สูงกว่า current rank (forward-only)
  -- → LEAD/PENDING_QUOTE จะถูก bump ขึ้น QUOTE_SENT ถ้า stage=7
  -- → PENDING_DECISION (rank4) ไม่ถูก clobber โดย QUOTE_SENT (rank3)
  if rank_implied > rank_current then
    NEW.status := implied_status;
  end if;

  return NEW;
end $$;

-- Trigger เดิม (จาก 0037) ยังชี้ฟังก์ชันนี้อยู่ → ไม่ต้อง drop/create ใหม่
-- แต่ใส่ไว้เพื่อ idempotent (ถ้ารัน 0038 โดยไม่มี 0037 ก็ยังทำงานได้)
drop trigger if exists tg_business_field_stage_sync on public.jobs;
create trigger tg_business_field_stage_sync
  before insert or update on public.jobs
  for each row execute function public.tg_business_field_stage_sync();

grant execute on function public.tg_business_field_stage_sync() to authenticated, service_role;
