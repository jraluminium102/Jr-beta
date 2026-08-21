-- 0125: ยอดขายของงาน (jobs.net_amount/vat_amount/total_amount) อิงจาก "ใบวางบิล" เป็นหลัก
--
-- ปัญหาที่เจ้าของแจ้ง (21 ส.ค.69):
--   · สถิติ "ยอดงานที่ขายได้" ไม่ตรง — jobs.net_amount เดิมเติมอัตโนมัติเฉพาะ flow ใบเสนอด่วน (quick)
--     งานที่ออกใบเสนอผ่านฟอร์มปกติ/แก้ Rev → net_amount ว่าง/0/ค้างค่าเก่า → สถิติขาด
--   · เดือน ส.ค. เห็นลูกค้ามัดจำแต่ยอด 0 บาท เยอะ (= net_amount null/0)
--   · ใบเสนอนอกระบบราคาอัปเดตแล้ว แต่ยอดบนงานค้างค่าเก่า → เจ้าของสั่ง "อิงยอดจากใบวางบิล"
--
-- หลักการ (บัญชีตรวจแล้ว):
--   · ยอดก่อน VAT ต่อใบ = total - vat_amt = ยอดหลังหักส่วนลด ก่อน VAT (= รายได้ตามหลักบัญชี · ไม่ตัด WHT)
--   · ยอดหลัง VAT = total (ยอดที่วางบิลจริง) — เก็บผลรวม "เป๊ะ" ไม่คิดใหม่จาก max(vat_rate)
--     (กันเคส VAT ผสม 7%/0% หลายใบ ที่การคิด net×rate ใหม่จะ overstate)
--   · ใบ status='cancelled' ไม่นับเป็นรายได้
--   · ใบวางบิล "ชนะเสมอ" ถ้ามี · งานมัดจำที่ยังไม่มีใบวางบิล → fallback ใบเสนอล่าสุด (กันยอด 0)
--
-- เก็บครบทั้ง "ก่อน VAT" (net_amount) และ "หลัง VAT" (total_amount) ตามที่เจ้าของสั่ง

-- ── trigger: ใบวางบิลเปลี่ยน (สร้าง/แก้ยอด/ผูกงาน/ยกเลิก/ลบ) → sync ยอดบนงานทันที ──
create or replace function public.tg_sync_job_revenue_from_billing()
returns trigger language plpgsql as $$
declare
  v_job uuid; v_net numeric; v_vat numeric; v_total numeric; v_rate numeric;
begin
  v_job := coalesce(new.job_id, old.job_id);
  if v_job is null then return coalesce(new, old); end if;

  select
    coalesce(sum(total - coalesce(vat_amt, 0)), 0),  -- ก่อน VAT (หลังส่วนลด)
    coalesce(sum(coalesce(vat_amt, 0)), 0),          -- VAT รวม
    coalesce(sum(total), 0),                         -- หลัง VAT (เป๊ะ = ยอดวางบิลจริง)
    coalesce(max(vat_rate), 7)
  into v_net, v_vat, v_total, v_rate
  from public.billing_notes
  where job_id = v_job and status is distinct from 'cancelled';

  -- step 1: net + rate → calc_financials (0034) คิด vat/total ประมาณจาก net×rate
  update public.jobs set net_amount = v_net, vat_rate = v_rate where id = v_job;
  -- step 2: ทับ vat/total ด้วยผลรวมเป๊ะจากใบวางบิล (ไม่ยิง calc_financials เพราะไม่แตะ net_amount/vat_rate)
  update public.jobs set vat_amount = v_vat, total_amount = v_total where id = v_job;

  return coalesce(new, old);
end $$;

drop trigger if exists sync_job_revenue on public.billing_notes;
create trigger sync_job_revenue
  after insert or delete or update of total, vat_amt, vat_rate, status, job_id
  on public.billing_notes
  for each row execute function public.tg_sync_job_revenue_from_billing();

-- ════════ backfill งานเดิม ════════

-- (1) งานที่มีใบวางบิล (ไม่ยกเลิก) → จากใบวางบิล · เป๊ะทั้งก่อน/หลัง VAT (สองสเต็ปเหมือน trigger)
update public.jobs j set net_amount = a.net, vat_rate = a.rate
from (
  select job_id,
         sum(total - coalesce(vat_amt, 0)) as net,
         coalesce(max(vat_rate), 7)        as rate
  from public.billing_notes
  where job_id is not null and status is distinct from 'cancelled'
  group by job_id
) a
where j.id = a.job_id;

update public.jobs j set vat_amount = a.vat, total_amount = a.total
from (
  select job_id,
         sum(coalesce(vat_amt, 0)) as vat,
         sum(total)                as total
  from public.billing_notes
  where job_id is not null and status is distinct from 'cancelled'
  group by job_id
) a
where j.id = a.job_id;

-- (2) fallback: งานที่มัดจำ/เข้าผลิตแล้ว แต่ "ไม่มีใบวางบิล" และ net ยังว่าง/0
--     → ใช้ใบเสนอล่าสุดที่ไม่ยกเลิก (ให้ approved มาก่อน) · ใบเสนอ VAT เดี่ยว → calc_financials คิด total เป๊ะ
--     (ใบวางบิลชนะเสมอ: ถ้ามีใบวางบิลจะไม่เข้าเงื่อนไขนี้ · ถ้ามีใบวางบิลทีหลัง trigger จะทับให้)
update public.jobs j set
  net_amount = greatest(q.total - coalesce(q.vat_amt, 0), 0),
  vat_rate   = q.vat_rate
from (
  select distinct on (job_id) job_id, total, vat_amt, vat_rate
  from public.quotations
  where job_id is not null and status is distinct from 'cancelled'
  order by job_id, (status = 'approved') desc, id desc
) q
where j.id = q.job_id
  and j.status in ('DEPOSITED', 'IN_PRODUCTION', 'INSTALLING', 'COMPLETED')
  and coalesce(j.net_amount, 0) = 0
  and not exists (
    select 1 from public.billing_notes b
    where b.job_id = j.id and b.status is distinct from 'cancelled'
  );

notify pgrst, 'reload schema';
