-- 0129: "แตกออเดอร์ที่ปนอยู่ในงานเดียว ออกเป็นงานใหม่"
--   [ACCOUNTANT sign-off spec] เคสจริง: งานที่ปนหลายออเดอร์ (หลาย quotations/billing_notes เกาะ job เดียว)
--   ทำให้ผลิต (productions.job_id UNIQUE = 1 job ต่อ 1 order) ปนกัน → ใบปะหน้า/ใบตัด/ผลิตอ่านผิดออเดอร์
--   (เคสตัวอย่าง: คุณไอซ์)
--
-- แก้ที่ราก: แตกออเดอร์ (1 quotation) ออกเป็น job ใหม่ทั้งใบเสนอ+บิล+เงินที่เกี่ยวข้อง
--   งานเดิม/งานใหม่ "รายได้" re-sync เองจาก trigger 0128 (sync_job_revenue เรียกทั้ง old+new job
--   ตอน UPDATE billing_notes.job_id) — ห้ามแก้ trigger นั้นซ้ำ
--
-- ⚠ security definer + grant authenticated → ต้องเช็คสิทธิ์ในฟังก์ชันเอง (กัน bypass BFF ยิง rpc ตรง)
--   gate has_role('ADMIN') เท่านั้น (ไม่รวม ACCOUNTING — งานแตะโครงสร้างงาน/ผลิต ไม่ใช่แค่เงิน)
--
-- p_dry_run=true (ค่าเริ่มต้น) → รันจริงทุกขั้นตอนแล้ว "ยกเลิกกลับ" ก่อน return (ไม่ mutate จริง)
--   ใช้ pattern exception-block = savepoint โดยปริยายของ plpgsql: ทั้งฟังก์ชันมี EXCEPTION handler
--   เดียวที่ท้ายบล็อก → ถ้า raise exception ขึ้นมา (ไม่ว่าตั้งใจหรือพลาด) DML ทั้งหมดในฟังก์ชัน
--   จะถูก rollback กลับไปที่จุดเริ่มฟังก์ชัน (ยังอยู่ใน transaction เดิมของผู้เรียก ไม่ commit)
--   → dry-run ใช้วิธีนี้: ทำงานจริงจนสุด แล้ว raise exception พ่วง payload ผลลัพธ์ (jsonb::text) แล้ว
--   ในตัว handler เองอ่าน sqlerrm กลับมาแปลงเป็น jsonb คืนให้ (rollback ไปแล้ว ปลอดภัย 100%)
--
-- ลำดับ (ตรงสเปคบัญชีเป๊ะ):
--   1) lock + validate (ดูเคสห้ามแตกท้ายไฟล์)
--   2) INSERT job ใหม่ (customer_id/name จาก customers.name, customer_area จาก customers.address)
--   3) UPDATE quotations.job_id = new
--   4) UPDATE billing_notes.job_id = new (ทุก status ของบิลที่ผูกออเดอร์นี้ — รักษาประวัติรวม cancelled)
--   5) UPDATE finance_entries.job_id = new
--        (a) billing_installment_id ∈ งวดของบิลที่ย้าย (ทุก entry ไม่ว่า void หรือไม่)
--        (b) มัดจำ auto ที่ยังไม่ผูกงวด (RISK-B) — ย้ายเฉพาะกรณีไม่กำกวม (ดู guard ด้านล่าง)
--   6) productions: ย้ายเฉพาะกรณี "ไม่กำกวม" (งานเดิมไม่เหลือใบวางบิล active อื่นแล้วหลังย้าย)
--        กำกวม → ปล่อยให้ trigger DEPOSITED (tg_on_deposit) สร้าง production ใหม่ให้งานใหม่เอง
--   7) รายได้ 2 งาน re-sync เองจาก trigger 0128 (ย้าย billing_notes.job_id ทริกให้ทั้งสองฝั่ง)
--
-- เคสห้ามแตก (raise exception ชัดเจน — ไม่ทำครึ่ง ๆ):
--   NOT_FOUND               ไม่พบใบเสนอ
--   NO_JOB                  ใบเสนอยังไม่ผูกงาน — ไม่มีอะไรต้องแตก
--   SINGLE_ORDER            งานมีออเดอร์ (quotation active) เดียวอยู่แล้ว — ไม่ต้องแตก
--   NO_CUSTOMER             ใบเสนอนี้ไม่ได้ผูกลูกค้าในทะเบียน (customer_id null) — งานใหม่จะไม่รู้ว่าเป็นใคร
--   HAS_UNLINKED_EXTERNAL_BILLING
--                           งานเดิมมีใบวางบิลนอกระบบที่ยังไม่ผูกใบเสนอ (quotation_id null) ค้างอยู่
--                           — เงินนี้ผูกกับ "งาน" ไม่ใช่ "ออเดอร์" ระบุไม่ได้ว่าเป็นของออเดอร์ไหน
--   RECEIPT_CROSS_ORDER     พบใบเสร็จที่ installment_id อยู่ในชุดที่กำลังย้าย แต่ billing_note_id
--                           ไม่อยู่ในชุดบิลที่ย้าย (ผิดปกติจากโครงสร้างเดิม — เป็น data anomaly ต้องเช็คมือ)
--   AMBIGUOUS_DEPOSIT       มีมัดจำอัตโนมัติที่ยังไม่ผูกงวด (finance_entries billing_installment_id
--                           is null) บนงานเดิม + งานเดิมยังมีบิล active ของออเดอร์อื่นเหลืออยู่
--                           → ระบุไม่ได้ว่ามัดจำนี้เป็นของออเดอร์ไหน ให้บัญชีตัดยอดมือก่อน
--
-- นอกสโคปเจตนา (ไม่ย้ายอัตโนมัติ — แจ้งเป็น warning ให้ผู้ใช้ตรวจ/ย้ายมือ ถ้าจำเป็น):
--   installations (1 งาน unique เหมือน productions แต่ spec ไม่ได้ระบุ — ปกติยังไม่ถึงเฟสติดตั้งตอนแตก)
--   cutlists / production_sets (ผูก job_id เฉย ๆ ไม่มีคอลัมน์ผูกกับ quotation — แยกไม่ได้ว่าแถวไหนของออเดอร์ไหน)

-- ── กัน "มัดจำเด้งซ้ำ" (accountant BLOCKER 30 ส.ค.69) ──
--   tg_on_deposit เดิมสร้าง auto-deposit ถ้า deposit_amount/date เซ็ต + ไม่มี "auto-deposit" อยู่
--   → ตอนแตกงานที่มัดจำมาทางงวด (DEPOSIT non-auto) แล้วเซ็ต DEPOSITED บนงานใหม่ → มันมองไม่เห็น
--     ว่ามีมัดจำจริงอยู่แล้ว (เพราะเช็คแค่ is_auto_created) → เสก phantom ซ้ำ = paid เกินจริง
--   แก้ที่ราก: ไม่เสก auto-deposit ถ้ามี DEPOSIT "ไม่ void" ใด ๆ อยู่แล้ว (auto หรือ non-auto)
--   ปลอดภัยกับ flow ปกติ: onsite (คิว) ตอนทริกยังไม่มี deposit entry → ยังสร้าง auto ตามเดิม ·
--     billing งวด ไม่เซ็ต jobs.deposit_amount → เงื่อนไข deposit_amount is not null เป็นเท็จอยู่แล้ว
create or replace function public.tg_on_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'DEPOSITED'
     and (tg_op = 'INSERT' or old.status is distinct from 'DEPOSITED') then
    insert into public.productions(job_id, status) values (new.id, 'PENDING_MEASURE')
      on conflict (job_id) do nothing;

    if new.deposit_amount is not null and new.deposit_date is not null
       and not exists (select 1 from public.finance_entries
         where job_id = new.id and type = 'DEPOSIT' and not is_voided) then   -- เดิม: and is_auto_created
      insert into public.finance_entries(job_id, payment_date, amount, type, channel, note, is_auto_created)
      values (new.id, new.deposit_date, new.deposit_amount, 'DEPOSIT', 'TRANSFER', 'มัดจำ (auto)', true);
    end if;

    update public.jobs set current_stage = 9 where id = new.id and current_stage < 9;
  end if;
  return new;
end $$;

-- ── helper: snapshot ยอด/สถานะของ 1 งาน (ใช้ทำ before/after ให้บัญชีเทียบ) ──
create or replace function public._split_job_snapshot(p_job uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'job_id', j.id,
    'job_code', j.job_code,
    'status', j.status,
    'net_amount', coalesce(j.net_amount, 0),
    'vat_amount', coalesce(j.vat_amount, 0),
    'total_amount', coalesce(j.total_amount, 0),
    'deposit_amount', j.deposit_amount,
    'active_quotations', (
      select count(*) from public.quotations q where q.job_id = j.id and q.status <> 'cancelled'
    ),
    'active_billing_total', (
      select coalesce(sum(bn.total), 0) from public.billing_notes bn
      where bn.job_id = j.id and bn.status <> 'cancelled'
    ),
    'paid_total', (
      select coalesce(sum(fe.amount), 0) from public.finance_entries fe
      where fe.job_id = j.id and coalesce(fe.is_voided, false) = false
    ),
    'outstanding', greatest(0, coalesce(j.total_amount, 0) - (
      select coalesce(sum(fe.amount), 0) from public.finance_entries fe
      where fe.job_id = j.id and coalesce(fe.is_voided, false) = false
    ))
  )
  from public.jobs j where j.id = p_job;
$$;

create or replace function public.split_order_to_new_job(p_quotation_id bigint, p_dry_run boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old_job uuid;
  v_new_job uuid;
  v_q_code text;
  v_q_status text;
  v_cust_id bigint;
  v_cust_name text;
  v_cust_area text;
  v_moved_bn_ids bigint[];
  v_moved_inst_ids bigint[];
  v_deposit_ids uuid[];
  v_deposit_total numeric;
  v_remaining_bn_other int;   -- นับก่อนย้าย: บิล active ของ "ออเดอร์อื่น" บนงานเดิม (ใช้เช็ค AMBIGUOUS_DEPOSIT)
  v_remaining_bn_after int;   -- นับหลังย้าย: บิล active ที่เหลือทั้งหมดบนงานเดิม (ใช้ตัดสินย้าย production)
  v_old_prod_id uuid;
  v_prod_moved boolean := false;
  v_warnings text[] := array[]::text[];
  v_before jsonb;
  v_old_after jsonb;
  v_new_after jsonb;
  v_result jsonb;
  v_cnt int;
begin
  if not public.has_role('ADMIN') then
    raise exception 'forbidden: เฉพาะแอดมินแตกออเดอร์ได้';
  end if;

  -- 1) lock + load ใบเสนอที่จะแตก
  select job_id, code, status, customer_id
    into v_old_job, v_q_code, v_q_status, v_cust_id
    from public.quotations where id = p_quotation_id for update;
  if not found then raise exception 'NOT_FOUND: ไม่พบใบเสนอ %', p_quotation_id; end if;
  if v_old_job is null then raise exception 'NO_JOB: ใบเสนอนี้ยังไม่ผูกงาน ไม่มีอะไรต้องแตก'; end if;
  if v_cust_id is null then raise exception 'NO_CUSTOMER: ใบเสนอนี้ไม่ได้ผูกลูกค้าในทะเบียน — ผูกลูกค้าให้ใบเสนอนี้ก่อนจึงแตกได้'; end if;

  perform 1 from public.jobs where id = v_old_job for update;

  -- นับออเดอร์ (quotation active) บนงานเดิม — เหลือแค่ 1 (ตัวที่กำลังจะแตก) แปลว่าไม่ต้องแตก
  select count(*) into v_cnt from public.quotations where job_id = v_old_job and status <> 'cancelled';
  if v_cnt <= 1 then
    raise exception 'SINGLE_ORDER: งานนี้มีออเดอร์เดียวอยู่แล้ว ไม่ต้องแตก';
  end if;

  -- เคสห้ามแตก: บิลนอกระบบยังไม่ผูกใบเสนอค้างอยู่บนงานเดิม (เงินระดับงาน ระบุออเดอร์ไม่ได้)
  if exists (
    select 1 from public.billing_notes
    where job_id = v_old_job and quotation_id is null and status <> 'cancelled'
  ) then
    raise exception 'HAS_UNLINKED_EXTERNAL_BILLING: งานนี้มีใบวางบิลนอกระบบที่ยังไม่ผูกใบเสนอค้างอยู่ — ผูกใบเสนอให้บิลนั้นก่อนจึงแตกได้';
  end if;

  -- โหลดบิลของออเดอร์นี้ทุก status (รวม cancelled — ย้ายไปด้วยเพื่อรักษาประวัติ/ต่อเนื่องกับใบเสนอ)
  select coalesce(array_agg(id), array[]::bigint[]) into v_moved_bn_ids
    from public.billing_notes where quotation_id = p_quotation_id;

  select coalesce(array_agg(id), array[]::bigint[]) into v_moved_inst_ids
    from public.billing_installments where billing_note_id = any(v_moved_bn_ids);

  -- เคสห้ามแตก: receipt คร่อมออเดอร์ (integrity guard — ปกติเป็นไปไม่ได้ตามโครงสร้าง แต่กันไว้)
  if exists (
    select 1 from public.receipts
    where installment_id = any(v_moved_inst_ids)
      and (billing_note_id is null or billing_note_id <> all(v_moved_bn_ids))
  ) then
    raise exception 'RECEIPT_CROSS_ORDER: พบใบเสร็จที่ผูกข้ามออเดอร์ — ต้องตรวจสอบมือก่อน (ไม่ควรเกิดตามโครงสร้างปกติ)';
  end if;

  -- RISK-B (ขยายตาม QA 30 ส.ค.69): "รายการรับเงินที่ยังไม่ผูกงวด" บนงานเดิม
  --   ไม่จำกัดแค่ auto-deposit — รวมเงินที่บันทึกมือผ่านฟอร์ม finance (is_auto_created=false, ทุก type
  --   เช่น DEPOSIT/INSTALLMENT_2/3/FINAL ที่ไม่มี billing_installment_id) เพราะพวกนี้ก็ระบุออเดอร์ไม่ได้
  select coalesce(array_agg(id), array[]::uuid[]), coalesce(sum(amount), 0)
    into v_deposit_ids, v_deposit_total
    from public.finance_entries
    where job_id = v_old_job and coalesce(is_voided, false) = false and billing_installment_id is null;

  if array_length(v_deposit_ids, 1) > 0 then
    -- เหลือออเดอร์อื่น (นอกจากตัวที่กำลังแตก) บนงานเดิมที่มีบิล active ไหม — ถ้ามี = กำกวมว่าเงินเป็นของออเดอร์ไหน
    select count(*) into v_remaining_bn_other
      from public.billing_notes
      where job_id = v_old_job and quotation_id is distinct from p_quotation_id and status <> 'cancelled';
    if v_remaining_bn_other > 0 then
      raise exception 'AMBIGUOUS_DEPOSIT: มีรายการรับเงินที่ยังไม่ผูกงวด (฿%) บนงานเดิม และงานเดิมยังมีบิลของออเดอร์อื่น Active อยู่ — ระบุไม่ได้ว่าเงินนี้เป็นของออเดอร์ไหน ให้บัญชีผูกงวด/ตัดยอดมือก่อนจึงแตกได้', round(v_deposit_total, 2);
    end if;
    -- ไม่กำกวม (ออเดอร์นี้เป็นเจ้าของบิล active เดียวที่เหลือบนงานเดิม) → ย้ายเงินที่ไม่ผูกงวดนี้ไปด้วย
  end if;

  -- ── snapshot ก่อนแตก (งานเดิมยังถือทุกอย่างอยู่) ──
  v_before := public._split_job_snapshot(v_old_job);

  -- 2) สร้างงานใหม่ — ชื่อ/ที่อยู่จากทะเบียนลูกค้าเสมอ (ไม่ใช้ snapshot ในใบเสนอ/บิล)
  select name, address into v_cust_name, v_cust_area from public.customers where id = v_cust_id;
  insert into public.jobs (customer_name, customer_area, customer_id, channel, assess_date, status)
  values (coalesce(nullif(btrim(v_cust_name), ''), 'ลูกค้า'), nullif(btrim(coalesce(v_cust_area, '')), ''), v_cust_id, 'OTHER', current_date, 'PENDING_QUOTE')
  returning id into v_new_job;

  -- 3) ย้ายใบเสนอ (trigger trg_quotation_stage จะเลื่อน stage ของงานใหม่ตามสถานะใบเสนอเอง)
  update public.quotations set job_id = v_new_job where id = p_quotation_id;

  -- 4) ย้ายใบวางบิลทุก status (trigger sync_job_revenue 0128 จะ recompute รายได้ทั้ง 2 งานให้เอง)
  update public.billing_notes set job_id = v_new_job where id = any(v_moved_bn_ids);

  -- 5) ย้าย finance_entries — (a) ของงวดที่ย้าย (b) มัดจำ auto ที่ไม่กำกวม (ถ้ามี)
  update public.finance_entries set job_id = v_new_job where billing_installment_id = any(v_moved_inst_ids);
  if array_length(v_deposit_ids, 1) > 0 then
    update public.finance_entries set job_id = v_new_job where id = any(v_deposit_ids);
  end if;

  -- 6) productions — ย้ายเฉพาะกรณีไม่กำกวม: งานเดิมไม่เหลือใบวางบิล active ใด ๆ แล้วหลังย้าย
  --    (แปลว่ากิจกรรมผลิต/มัดจำทั้งหมดของงานเดิม เกิดจากออเดอร์นี้ล้วน ๆ — ย้ายให้ตามไปได้อย่างมั่นใจ)
  select count(*) into v_remaining_bn_after from public.billing_notes where job_id = v_old_job and status <> 'cancelled';
  select id into v_old_prod_id from public.productions where job_id = v_old_job;

  if v_old_prod_id is not null and v_remaining_bn_after = 0 then
    update public.productions set job_id = v_new_job where id = v_old_prod_id;
    v_prod_moved := true;
    -- งานเดิมไม่เหลือบิล/มัดจำแล้ว → ถอยสถานะ+stage กลับก่อนมัดจำ (เหมือนหลักการ undeposit_job 0112)
    --   กันค้างเป็น DEPOSITED/IN_PRODUCTION/stage 9+ ทั้งที่ไม่มีเงิน/งานผลิตอยู่กับตัวแล้ว
    --   หมายเหตุ: อ้างอิงสถานะของ "ใบเสนอที่เหลือ" บนงานเดิม (ล่าสุด) แทน v_q_status (ของใบที่ย้ายออกไปแล้ว)
    update public.jobs
      set status = case when exists (
            select 1 from public.quotations where job_id = v_old_job and status in ('sent','approved')
          ) then 'QUOTE_SENT' else 'PENDING_QUOTE' end,
          current_stage = case when exists (
            select 1 from public.quotations where job_id = v_old_job and status in ('sent','approved')
          ) then 7 else least(current_stage, 5) end,
          deposit_amount = null, deposit_date = null
      where id = v_old_job and status not in ('CANCELLED', 'COMPLETED');
  elsif v_old_prod_id is null then
    v_warnings := array_append(v_warnings, 'งานเดิมไม่มีงานผลิต (productions) อยู่ก่อน — ไม่มีอะไรต้องย้าย');
  else
    v_warnings := array_append(v_warnings, 'งานเดิมยังมีใบวางบิล/ออเดอร์อื่น Active เหลืออยู่ — ไม่ย้ายงานผลิตเดิมให้ (กำกวมว่าเป็นของออเดอร์ไหน) ถ้าออเดอร์ใหม่มัดจำแล้ว ระบบจะสร้างงานผลิตใหม่ให้เองอัตโนมัติ');
  end if;

  -- ดันงานใหม่เป็น DEPOSITED ถ้ามีมัดจำ (finance_entries type=DEPOSIT ไม่ void) ย้ายมาแล้ว
  --   → fire trigger tg_on_deposit: สร้าง production ให้ (on conflict do nothing ถ้าย้ายมาแล้วข้างบน) + เลื่อน stage 9
  if exists (select 1 from public.finance_entries where job_id = v_new_job and type = 'DEPOSIT' and coalesce(is_voided, false) = false) then
    update public.jobs j set
      status = 'DEPOSITED',
      deposit_amount = coalesce(j.deposit_amount, (
        select fe.amount from public.finance_entries fe
        where fe.job_id = v_new_job and fe.type = 'DEPOSIT' and coalesce(fe.is_voided, false) = false
        order by fe.payment_date asc limit 1)),
      deposit_date = coalesce(j.deposit_date, (
        select fe.payment_date from public.finance_entries fe
        where fe.job_id = v_new_job and fe.type = 'DEPOSIT' and coalesce(fe.is_voided, false) = false
        order by fe.payment_date asc limit 1))
    where j.id = v_new_job;
  elsif v_q_status in ('sent', 'approved') then
    update public.jobs set status = 'QUOTE_SENT' where id = v_new_job and status = 'PENDING_QUOTE';
  end if;

  -- นอกสโคป (ไม่ย้ายอัตโนมัติ) — เตือนให้ตรวจมือถ้ามี
  if exists (select 1 from public.installations where job_id = v_old_job) then
    v_warnings := array_append(v_warnings, 'งานเดิมมีใบติดตั้ง (installations) อยู่แล้ว — เครื่องมือนี้ไม่ย้ายให้อัตโนมัติ ตรวจสอบเอง');
  end if;
  if exists (select 1 from public.cutlists where job_id = v_old_job) then
    v_warnings := array_append(v_warnings, 'งานเดิมมีใบตัดอลู (cutlists) อยู่ — ผูกกับ job_id เฉย ๆ แยกเป็นออเดอร์ไม่ได้ ต้องตรวจ/ย้ายมือถ้าจำเป็น');
  end if;
  if exists (select 1 from public.production_sets where job_id = v_old_job) then
    v_warnings := array_append(v_warnings, 'งานเดิมมีรายละเอียดผลิต (production_sets/ชุดงาน) อยู่ — แยกเป็นออเดอร์ไม่ได้อัตโนมัติ ต้องตรวจ/ย้ายมือถ้าจำเป็น');
  end if;
  -- ── self-check อนุรักษ์ยอด (บัญชีบังคับ): total & paid (งานเดิม+ใหม่) หลังแตก = ก่อนแตก ±0.01 ──
  --   จับ "มัดจำเด้งซ้ำ"/เงินหาย ทุกกรณี (belt-and-suspenders) → ถ้าไม่ตรง raise = rollback ไม่แตะข้อมูล
  v_old_after := public._split_job_snapshot(v_old_job);
  v_new_after := public._split_job_snapshot(v_new_job);
  if abs((v_before->>'total_amount')::numeric - ((v_old_after->>'total_amount')::numeric + (v_new_after->>'total_amount')::numeric)) > 0.01
     or abs((v_before->>'net_amount')::numeric - ((v_old_after->>'net_amount')::numeric + (v_new_after->>'net_amount')::numeric)) > 0.01
     or abs((v_before->>'paid_total')::numeric - ((v_old_after->>'paid_total')::numeric + (v_new_after->>'paid_total')::numeric)) > 0.01 then
    raise exception 'CONSERVATION_MISMATCH: ยอดก่อน/หลังแตกไม่ตรง (เงินอาจนับซ้ำ/หาย) — ยกเลิกอัตโนมัติ ไม่แตะข้อมูล [total ก่อน %  หลัง %+%  ·  paid ก่อน %  หลัง %+%]',
      v_before->>'total_amount', v_old_after->>'total_amount', v_new_after->>'total_amount',
      v_before->>'paid_total', v_old_after->>'paid_total', v_new_after->>'paid_total';
  end if;

  v_result := jsonb_build_object(
    'quotation_id', p_quotation_id,
    'quotation_code', v_q_code,
    'old_job_id', v_old_job,
    'new_job_id', v_new_job,
    'before', v_before,
    'old_job_after', v_old_after,
    'new_job_after', v_new_after,
    'moved', jsonb_build_object(
      'billing_notes', to_jsonb(v_moved_bn_ids),
      'installments', to_jsonb(v_moved_inst_ids),
      'deposit_finance_entries', to_jsonb(v_deposit_ids),
      'production_moved', v_prod_moved
    ),
    'warnings', to_jsonb(v_warnings),
    'dry_run', p_dry_run
  );

  if p_dry_run then
    raise exception '%', ('__DRYRUN__' || v_result::text);
  end if;

  return v_result;
exception
  when others then
    if left(sqlerrm, 10) = '__DRYRUN__' then
      return substring(sqlerrm from 11)::jsonb;
    end if;
    raise;
end $$;

grant execute on function public._split_job_snapshot(uuid) to authenticated, service_role;
grant execute on function public.split_order_to_new_job(bigint, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
