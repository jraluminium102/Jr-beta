-- 0112: ถอยมัดจำ (un-deposit) — เครื่องมือแอดมินแก้เคส "มัดจำผิด/ลงงานผิด"
--   atomic RPC เดียว (security definer) — void มัดจำ (ไม่ลบ) + ลบ production + reset job กลับก่อนมัดจำ
--   [ACCOUNTANT sign-off] void ไม่ delete · block เมื่อมีเอกสาร/เงินจริง · reason บังคับ · ไม่แตะ total/net/vat
--
--   ⚠ security definer + grant authenticated → **ต้องเช็คสิทธิ์ในฟังก์ชันเอง** (กัน bypass BFF ยิง rpc ตรง)
--     ใช้ auth.uid() เป็น voided_by (ไม่รับจาก client) · gate has_role('ADMIN','ACCOUNTING') = finance:void
--
--   BLOCK (raise exception → API แปลเป็นข้อความไทย):
--     HAS_RECEIPT / HAS_BILLING / HAS_OTHER_PAYMENT / HAS_STOCK_CUT / HAS_INSTALL_STARTED
--   เฟสผลิตเฉย ๆ (ยังไม่ตัดสต๊อก) = ไม่บล็อก (เตือนที่ UI แล้วถอยได้)
create or replace function public.undeposit_job(p_job uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_status text; v_amt numeric; v_date date; v_stage int;
begin
  -- gate สิทธิ์ในฟังก์ชัน (กันยิง rpc ตรงข้าม BFF) — finance:void = ADMIN/ACCOUNTING
  if not public.has_role('ADMIN', 'ACCOUNTING') then raise exception 'forbidden'; end if;

  select status, deposit_amount, deposit_date, current_stage
    into v_status, v_amt, v_date, v_stage
    from public.jobs where id = p_job for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- รับทั้ง DEPOSITED และ IN_PRODUCTION (งานที่ย้ายเฟสไปผลิตแล้วยังถอยได้)
  if v_status not in ('DEPOSITED', 'IN_PRODUCTION') then raise exception 'NOT_DEPOSITED'; end if;

  if exists (select 1 from public.receipts r join public.billing_notes b on r.billing_note_id = b.id
             where b.job_id = p_job and coalesce(r.is_voided, false) = false) then
    raise exception 'HAS_RECEIPT';
  end if;
  if exists (select 1 from public.billing_notes where job_id = p_job and status <> 'cancelled') then
    raise exception 'HAS_BILLING';
  end if;
  if exists (select 1 from public.finance_entries
             where job_id = p_job and coalesce(is_voided, false) = false
               and not (type = 'DEPOSIT' and coalesce(is_auto_created, false) = true)) then
    raise exception 'HAS_OTHER_PAYMENT';
  end if;
  if exists (select 1 from public.stock_moves
             where job_id = p_job and type = 'out' and coalesce(is_voided, false) = false) then
    raise exception 'HAS_STOCK_CUT';
  end if;
  -- ติดตั้งเริ่มแล้ว: มีวันติดตั้งจริง/ช่าง/สถานะเกิน PENDING หรือถูกจัดคิวลงทีม (install_assignments 0086)
  if exists (select 1 from public.installations
             where job_id = p_job and (install_actual is not null or lead_installer_id is not null
                    or status <> 'PENDING'))
     or exists (select 1 from public.install_assignments where job_id = p_job) then
    raise exception 'HAS_INSTALL_STARTED';
  end if;

  -- void มัดจำ auto (ไม่ลบ — เก็บ audit trail) · voided_by = auth.uid()
  update public.finance_entries
    set is_voided = true,
        void_reason = left('ถอยมัดจำ: ' || coalesce(p_reason, ''), 500),
        voided_at = now(), voided_by = v_uid
    where job_id = p_job and type = 'DEPOSIT'
      and coalesce(is_auto_created, false) = true and coalesce(is_voided, false) = false;

  -- ลบใบติดตั้ง auto (PENDING) + งานผลิต
  delete from public.installations where job_id = p_job and status = 'PENDING';
  delete from public.productions where job_id = p_job;

  -- reset job กลับก่อนมัดจำ — แตะแค่ status/deposit/current_stage (ห้ามแตะ total/net/vat)
  update public.jobs
    set status = 'QUOTE_SENT', deposit_date = null, deposit_amount = null, current_stage = 7
    where id = p_job;

  return jsonb_build_object('voided_amount', coalesce(v_amt, 0), 'prev_stage', v_stage, 'prev_deposit_date', v_date);
end $$;

grant execute on function public.undeposit_job(uuid, text) to authenticated, service_role;
