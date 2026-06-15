-- ============================================================
-- JR OMS — 0037 business field → current_stage sync (state drift fix)
--
-- ปัญหา: PATCH /api/jobs/:id เซ็ต quote_sent_date/design_state ตรง DB
--   ไม่ผ่าน advance_stage RPC → current_stage ไม่ขยับ → UI อ่าน stage เดิม = drift
--
-- แก้ 2 จุด:
--   (A) BEFORE trigger บน jobs: business field ขับ current_stage (forward-only)
--       เฉพาะงานก่อนมัดจำ (ไม่กวน production/install flow)
--   (B) Reconcile ข้อมูลเดิมที่ drift อยู่ (รันครั้งเดียว)
--
-- ไม่แตะ: advance_stage / tg_on_deposit / tg_production_changes /
--          tg_installation_changes / _sync_legacy_status
-- idempotent (create or replace + drop if exists trigger) · รันหลัง 0036
-- ============================================================

-- ============================================================
-- A) Trigger function: business field → current_stage (forward-only)
-- ============================================================
-- หลักการ:
--   - BEFORE UPDATE/INSERT on jobs
--   - คำนวณ "required_stage" จาก business field ที่มีความหมาย
--   - ใช้ greatest(NEW.current_stage, required_stage) → ไม่ถอยหลัง
--   - skip ถ้า status อยู่ในกลุ่ม DEPOSITED+ (production/install/completed/cancelled)
--     เพราะ trigger tg_on_deposit/tg_production_changes/tg_installation_changes
--     ดูแล stage 9-24 อยู่แล้ว
--   - ไม่เรียก _sync_legacy_status ตรง เพราะ trigger นี้เป็น BEFORE
--     (แก้ NEW.current_stage ใน row เดียวกัน → หลังจาก AFTER trigger on_deposit
--      จะ fire ตามปกติเมื่อ status = DEPOSITED)
--
-- ตรวจชน trigger เดิม:
--   touch_jobs         BEFORE UPDATE → tg_touch_updated_at()  (stamp updated_at เท่านั้น)
--   calc_financials    BEFORE INSERT/UPDATE OF net_amount,vat_rate → tg_calc_financials()
--                      (ไม่แตะ current_stage)
--   assign_job_code    BEFORE INSERT → assign code (ไม่แตะ current_stage)
--   → ไม่มีชน: trigger นี้เป็น BEFORE UPDATE/INSERT ตัวเดียวที่แตะ current_stage

create or replace function public.tg_business_field_stage_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  required_stage smallint;
begin
  -- Skip: งานที่ผ่านมัดจำแล้ว (stage 9+) → production/install trigger ดูแลเอง
  -- เงื่อนไข: ตรวจ status ของ NEW row (หลัง PATCH)
  if NEW.status in ('DEPOSITED', 'IN_PRODUCTION', 'INSTALLING', 'COMPLETED', 'CANCELLED') then
    return NEW;
  end if;

  -- คำนวณ required_stage จาก business field (มากสุดชนะ)
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

  -- Forward-only: ดันไปหน้าเท่านั้น ห้ามถอย
  if required_stage > coalesce(NEW.current_stage, 1) then
    NEW.current_stage := required_stage;
  end if;

  return NEW;
end $$;

-- Drop + recreate trigger (idempotent)
drop trigger if exists tg_business_field_stage_sync on public.jobs;
create trigger tg_business_field_stage_sync
  before insert or update on public.jobs
  for each row execute function public.tg_business_field_stage_sync();

-- Ensure function is accessible
grant execute on function public.tg_business_field_stage_sync() to authenticated, service_role;

-- ============================================================
-- B) Reconcile ข้อมูลเดิมที่ drift (forward-only, ไม่แตะงานหลังมัดจำ)
-- ============================================================
-- การ update นี้จะ fire trigger (A) ด้วย → idempotent
-- greatest() กันถอยหลัง, status filter กันกวน production flow

update public.jobs
set current_stage = greatest(
  coalesce(current_stage, 1),
  case
    when quote_sent_date is not null              then 7
    when design_state = 'DONE'                   then 4
    when design_state in ('DRAWING','REVISING','PENDING_CUSTOMER') then 3
    else 1
  end
)
where status not in ('DEPOSITED', 'IN_PRODUCTION', 'INSTALLING', 'COMPLETED', 'CANCELLED')
  -- เฉพาะ row ที่ stage จะเปลี่ยน (ไม่ update ที่ไม่จำเป็น)
  and greatest(
    coalesce(current_stage, 1),
    case
      when quote_sent_date is not null             then 7
      when design_state = 'DONE'                  then 4
      when design_state in ('DRAWING','REVISING','PENDING_CUSTOMER') then 3
      else 1
    end
  ) > coalesce(current_stage, 1);

-- Sync status สำหรับ row ที่ stage เพิ่ง reconcile
-- (advance_stage เรียก _sync_legacy_status; เราต้องทำเองเพราะ reconcile ผ่าน UPDATE ตรง
--  _sync_legacy_status เป็น function call ไม่ใช่ trigger → ไม่ auto-fire)
do $$ declare r record; begin
  for r in
    select id, current_stage
    from public.jobs
    where status not in ('DEPOSITED','IN_PRODUCTION','INSTALLING','COMPLETED','CANCELLED')
      and (
        (current_stage = 7 and status <> 'QUOTE_SENT')
        or (current_stage between 3 and 6 and status <> 'PENDING_QUOTE')
        or (current_stage in (1,2) and status <> 'LEAD')
      )
  loop
    perform public._sync_legacy_status(r.id, r.current_stage);
  end loop;
end $$;
