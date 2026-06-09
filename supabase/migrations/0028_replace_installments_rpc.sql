-- ============================================================
-- 0028_replace_installments_rpc.sql (idempotent)
-- RPC แทนงวดทั้งชุดใน transaction เดียว — ให้ deferred constraint (sum=total)
-- เช็คตอน commit ได้ถูกต้อง (PostgREST แยก delete/insert เป็นคนละ txn ไม่ได้)
-- ============================================================

create or replace function public.replace_billing_installments(p_bn_id bigint, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_sum   numeric;
begin
  select total into v_total from public.billing_notes where id = p_bn_id;
  if v_total is null then raise exception 'ไม่พบใบวางบิล %', p_bn_id; end if;

  -- ผลรวมงวดใหม่ต้องเท่ายอดบิล
  select coalesce(sum((e->>'amount')::numeric), 0) into v_sum
  from jsonb_array_elements(p_items) e;
  if abs(v_sum - v_total) > 0.01 then
    raise exception 'ผลรวมงวด (%) ไม่ตรงกับยอดใบวางบิล (%)', v_sum, v_total;
  end if;

  -- กันแก้เมื่อมีการชำระแล้ว (เช็คซ้ำชั้นใน txn)
  if exists (
    select 1 from public.billing_installments
    where billing_note_id = p_bn_id and (status = 'paid' or coalesce(paid_amount,0) > 0)
  ) then
    raise exception 'ใบวางบิลนี้มีงวดที่ชำระแล้ว ปรับงวดไม่ได้';
  end if;

  -- replace ทั้งชุดใน txn เดียว (deferred constraint เช็คตอน commit)
  delete from public.billing_installments where billing_note_id = p_bn_id;

  insert into public.billing_installments(billing_note_id, seq, label, amount, due_date, sort_order, status)
  select p_bn_id,
         (e->>'seq')::int,
         e->>'label',
         (e->>'amount')::numeric,
         nullif(e->>'due_date','')::date,
         (e->>'seq')::int - 1,
         'pending'
  from jsonb_array_elements(p_items) e;
end $$;

grant execute on function public.replace_billing_installments(bigint, jsonb) to authenticated, service_role;
