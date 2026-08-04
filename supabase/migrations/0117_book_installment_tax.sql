-- 0117: book_installment_tax RPC — แก้ footer ต่องวด (พิมพ์แยกงวด) = "book จริง" ลงงวด
--   บั๊กเดิม: PATCH /api/billing-installments/[id] เขียนแค่ footer_override (display-only jsonb)
--     → ใบเสร็จอ่าน base_amt/vat_amt/wht_amt ของงวด (0102) ไม่เจอค่าที่แก้ → ภาษีไม่ตรง
--   ทางแก้ (accountant approve): เขียนภาษีจริงลงคอลัมน์ booked ของงวด + ล้าง footer_override
--     + recompute billing_notes.total = Σ amount ทุกงวด ใน "transaction เดียว" (RPC เดียว)
--     เพราะ tg_check_installment_sum (0026) เป็น constraint trigger DEFERRABLE INITIALLY DEFERRED
--     เช็ค Σamount = billing_notes.total ตอน commit — 2 call แยกจาก PostgREST จะ fail
--
--   ⚠ security definer + grant authenticated → ต้องเช็คสิทธิ์ในฟังก์ชันเอง (กัน bypass BFF ยิง rpc ตรง)
--     gate has_role('ADMIN','ACCOUNTING') = finance:write (ตรง rbac.ts — ไม่ใช้ can_write() เพราะรวม SALES ด้วย)
--
--   Guard (raise exception → API แปลเป็นข้อความไทย):
--     NOT_FOUND / CANCELLED / PAID / BN_WHT_SET / HAS_RECEIPT / HAS_FINANCE_ENTRY
--     INVALID_VAT_RATE / INVALID_WHT_RATE / NEGATIVE_AMOUNT
create or replace function public.book_installment_tax(
  p_inst_id  bigint,
  p_base_amt numeric,
  p_vat_amt  numeric,
  p_wht_amt  numeric,
  p_vat_rate numeric,
  p_wht_rate numeric,
  p_amount   numeric
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_bn_id       bigint;
  v_inst_status text;
  v_paid_amount numeric;
  v_bn_status   text;
  v_bn_wht_rate numeric;
  v_new_total   numeric;
begin
  -- gate สิทธิ์ในฟังก์ชัน (กันยิง rpc ตรงข้าม BFF) — finance:write = ADMIN/ACCOUNTING
  if not public.has_role('ADMIN', 'ACCOUNTING') then
    raise exception 'forbidden';
  end if;

  if p_vat_rate not in (0, 7) then raise exception 'INVALID_VAT_RATE'; end if;
  if p_wht_rate not in (0, 1, 2, 3, 5) then raise exception 'INVALID_WHT_RATE'; end if;
  if p_base_amt < 0 or p_vat_amt < 0 or p_wht_amt < 0 or p_amount < 0 then
    raise exception 'NEGATIVE_AMOUNT';
  end if;

  select billing_note_id, status, coalesce(paid_amount, 0)
    into v_bn_id, v_inst_status, v_paid_amount
    from public.billing_installments where id = p_inst_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  select status, coalesce(wht_rate, 0)
    into v_bn_status, v_bn_wht_rate
    from public.billing_notes where id = v_bn_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if v_bn_status = 'cancelled' then raise exception 'CANCELLED'; end if;
  if v_inst_status = 'paid' or v_paid_amount > 0 then raise exception 'PAID'; end if;
  -- บิลมี WHT ระดับใบ (regime ผสม) → กันหักซ้ำ · ให้แก้ที่ใบเสนอ/แก้ทั้งใบแทน
  if v_bn_wht_rate > 0 then raise exception 'BN_WHT_SET'; end if;

  if exists (
    select 1 from public.receipts
    where installment_id = p_inst_id and coalesce(is_voided, false) = false
  ) then
    raise exception 'HAS_RECEIPT';
  end if;
  if exists (
    select 1 from public.finance_entries
    where billing_installment_id = p_inst_id and coalesce(is_voided, false) = false
  ) then
    raise exception 'HAS_FINANCE_ENTRY';
  end if;

  update public.billing_installments
    set base_amt = p_base_amt,
        vat_amt  = p_vat_amt,
        wht_amt  = p_wht_amt,
        vat_rate = p_vat_rate,
        wht_rate = p_wht_rate,
        amount   = p_amount,
        footer_override = null
    where id = p_inst_id;

  -- recompute ยอดบิล = Σ amount ทุกงวด (WHT ในงวด → amount ลด → bn.total ลดตาม · ไม่ลดฐาน VAT)
  select coalesce(sum(amount), 0) into v_new_total
    from public.billing_installments where billing_note_id = v_bn_id;

  update public.billing_notes set total = v_new_total where id = v_bn_id;

  return jsonb_build_object(
    'installment_id', p_inst_id,
    'base_amt', p_base_amt, 'vat_amt', p_vat_amt, 'wht_amt', p_wht_amt,
    'vat_rate', p_vat_rate, 'wht_rate', p_wht_rate,
    'amount', p_amount, 'bn_total', v_new_total
  );
end $$;

revoke all on function public.book_installment_tax(bigint, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.book_installment_tax(bigint, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
