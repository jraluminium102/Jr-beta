-- 0128: แก้ trigger รายได้งาน (0125) ให้ "คิดใหม่ทั้งงานเก่าและงานใหม่" เมื่อย้าย job_id
--
-- RISK-A (accountant เจอ 30 ส.ค.69): เดิม trigger ใช้ v_job := coalesce(new.job_id, old.job_id)
--   → ตอน UPDATE ย้าย billing_notes.job_id (เช่นตอน "แตกงาน") จะคิดใหม่แค่ "งานใหม่"
--   งานเดิมยังรวมยอดบิลที่ย้ายออกไปแล้ว = รายได้งานเดิมเกินจริง (นับซ้ำข้ามงาน)
-- แก้ที่ราก: แยกสูตรเป็นฟังก์ชัน _recompute_job_revenue(job) แล้ว trigger เรียกทั้ง old.job_id + new.job_id

-- ฟังก์ชันคิดยอดงานเดียว (สูตรเดียวกับ 0125 · ก่อน/หลัง VAT เป๊ะจากใบวางบิลที่ไม่ยกเลิก)
create or replace function public._recompute_job_revenue(p_job uuid)
returns void language plpgsql as $$
declare
  v_net numeric; v_vat numeric; v_total numeric; v_rate numeric;
begin
  if p_job is null then return; end if;
  select
    coalesce(sum(total - coalesce(vat_amt, 0)), 0),
    coalesce(sum(coalesce(vat_amt, 0)), 0),
    coalesce(sum(total), 0),
    coalesce(max(vat_rate), 7)
  into v_net, v_vat, v_total, v_rate
  from public.billing_notes
  where job_id = p_job and status is distinct from 'cancelled';

  -- step 1: net + rate (calc_financials 0034 คิด vat/total ประมาณ) · step 2: ทับด้วยผลรวมเป๊ะ
  update public.jobs set net_amount = v_net, vat_rate = v_rate where id = p_job;
  update public.jobs set vat_amount = v_vat, total_amount = v_total where id = p_job;
end $$;

create or replace function public.tg_sync_job_revenue_from_billing()
returns trigger language plpgsql as $$
declare
  v_new uuid := case when tg_op <> 'DELETE' then new.job_id else null end;
  v_old uuid := case when tg_op <> 'INSERT' then old.job_id else null end;
begin
  -- คิดใหม่ทุกงานที่เกี่ยวข้อง: งานปลายทาง (new) + งานต้นทาง (old) ถ้าต่างกัน (ย้าย job_id/ลบ)
  if v_new is not null then perform public._recompute_job_revenue(v_new); end if;
  if v_old is not null and v_old is distinct from v_new then perform public._recompute_job_revenue(v_old); end if;
  return coalesce(new, old);
end $$;

-- trigger เดิม (0125) ยังผูกอยู่ — แค่เปลี่ยน body ของฟังก์ชัน · เพิ่ม DELETE ให้ handle old ด้วย
drop trigger if exists sync_job_revenue on public.billing_notes;
create trigger sync_job_revenue
  after insert or delete or update of total, vat_amt, vat_rate, status, job_id
  on public.billing_notes
  for each row execute function public.tg_sync_job_revenue_from_billing();

notify pgrst, 'reload schema';
