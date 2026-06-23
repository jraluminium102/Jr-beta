-- ============================================================
-- 0053 · RPC แก้เฉพาะงวดที่ "ยังไม่จ่าย" ของใบวางบิลที่จ่ายมัดจำแล้ว
--   เก็บงวดที่จ่ายเต็มแล้วไว้เป๊ะ (ไม่แตะ FK receipt/finance) + แก้/เพิ่ม/ลบเฉพาะงวดยังไม่จ่าย
--   invariant: sum(งวดจ่ายเต็ม) + sum(งวดใหม่) = ยอดบิล
-- ผ่าน accountant (4 บล็อกเกอร์):
--   [1] block ถ้ามีงวดจ่ายบางส่วน (0<paid_amount<amount) — enum ไม่มี partial, re-split ต้องคนตัดสิน
--   [2] เช็ค FK (receipts/finance_entries รวม void) ในชั้น RPC ก่อนลบ + for update lock
--   [3] รองรับ p_items ว่าง (มัดจำจ่ายครบยอด) — raise ถ้า paid_sum≠total
--   [4] seq = max(seq งวดจ่าย)+ลำดับ · paid_sum นับเฉพาะงวดจ่ายเต็ม (ไม่นับ partial)
-- idempotent · เจ้าของรัน
-- ============================================================

create or replace function public.replace_unpaid_installments(p_bn_id bigint, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total    numeric;
  v_status   text;
  v_paid_sum numeric;
  v_max_seq  int;
  v_new_sum  numeric;
  v_neg      int;
  v_partial  int;
  v_fk       int;
begin
  -- ล็อกใบวางบิล (serialize concurrent) + เช็คสถานะ
  select total, status into v_total, v_status
  from public.billing_notes where id = p_bn_id for update;
  if v_total is null then raise exception 'ไม่พบใบวางบิล %', p_bn_id; end if;
  if v_status = 'cancelled' then raise exception 'ใบวางบิลถูกยกเลิกแล้ว'; end if;

  -- ล็อกแถวงวด กัน concurrent จ่าย/แก้ระหว่างทาง
  perform 1 from public.billing_installments where billing_note_id = p_bn_id for update;

  -- [1] กันงวดจ่ายบางส่วน — re-split งวดค้างจ่ายต้องคนตัดสิน ไม่ใช่ auto
  select count(*) into v_partial from public.billing_installments
   where billing_note_id = p_bn_id
     and coalesce(paid_amount,0) > 0 and coalesce(paid_amount,0) < amount;
  if v_partial > 0 then
    raise exception 'มีงวดที่จ่ายบางส่วน (ยังไม่เต็มงวด) ปรับงวดไม่ได้ — เก็บงวดนั้นให้ครบ หรือ void ใบวางบิลแล้วออกใหม่';
  end if;

  -- งวดที่จ่ายเต็มแล้ว (ล็อก ไม่แตะ) — นับ amount + หา seq สูงสุด
  select coalesce(sum(amount),0), coalesce(max(seq),0)
    into v_paid_sum, v_max_seq
  from public.billing_installments
  where billing_note_id = p_bn_id
    and (status = 'paid' or coalesce(paid_amount,0) >= amount);

  -- ผลรวมงวดใหม่ + กัน amount<=0 (กันเรียก RPC ตรง)
  select coalesce(sum((e->>'amount')::numeric),0),
         count(*) filter (where (e->>'amount')::numeric <= 0)
    into v_new_sum, v_neg
  from jsonb_array_elements(p_items) e;
  if v_neg > 0 then raise exception 'ยอดงวดต้องมากกว่า 0'; end if;

  -- invariant: จ่ายแล้ว + ใหม่ = ยอดบิล (round2 ทั้งคู่, tol 0.01) — ครอบ p_items ว่างด้วย
  if abs(round(v_paid_sum, 2) + round(v_new_sum, 2) - v_total) > 0.01 then
    raise exception 'ผลรวมงวด (จ่ายแล้ว % + ที่เหลือ %) ไม่ตรงยอดบิล %', v_paid_sum, v_new_sum, v_total;
  end if;

  -- [2] FK: งวดที่จะลบ (ยังไม่จ่าย) ต้องไม่มี receipt/finance ผูก (รวมที่ void แล้ว — FK ไม่สน is_voided)
  select count(*) into v_fk from public.billing_installments bi
  where bi.billing_note_id = p_bn_id
    and bi.status <> 'paid' and coalesce(bi.paid_amount,0) = 0
    and ( exists (select 1 from public.receipts r where r.installment_id = bi.id)
       or exists (select 1 from public.finance_entries f where f.billing_installment_id = bi.id) );
  if v_fk > 0 then
    raise exception 'มีงวดที่มีใบเสร็จ/รายการเงินผูกอยู่ (รวมที่ยกเลิกแล้ว) ปรับไม่ได้ — ต้อง void ใบวางบิลแล้วออกใหม่';
  end if;

  -- ลบเฉพาะงวดยังไม่จ่าย
  delete from public.billing_installments
  where billing_note_id = p_bn_id and status <> 'paid' and coalesce(paid_amount,0) = 0;

  -- insert งวดใหม่ seq ต่อจากงวดจ่ายแล้ว (deferred constraint sum=total เช็คตอน commit)
  insert into public.billing_installments(billing_note_id, seq, label, amount, due_date, sort_order, status)
  select p_bn_id,
         v_max_seq + (t.ord)::int,
         t.e->>'label',
         (t.e->>'amount')::numeric,
         nullif(t.e->>'due_date','')::date,
         v_max_seq + (t.ord)::int - 1,
         'pending'
  from jsonb_array_elements(p_items) with ordinality as t(e, ord);
end $$;

grant execute on function public.replace_unpaid_installments(bigint, jsonb) to authenticated, service_role;
