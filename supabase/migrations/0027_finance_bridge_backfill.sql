-- ============================================================
-- 0027_finance_bridge_backfill.sql
-- backfill billing_notes.job_id จาก quotations.job_id
-- รันครั้งเดียว, idempotent (update where job_id is null)
-- ============================================================

update public.billing_notes bn
set job_id = q.job_id
from public.quotations q
where bn.quotation_id = q.id
  and q.job_id is not null
  and bn.job_id is null;
