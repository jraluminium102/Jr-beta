-- ============================================================
-- 0150 · แก้บั๊ก Rev ใบวางบิลพัง: "column status is of type billing_status but expression is of type text"
--   ต้นเหตุ: 0126 บรรทัด recompute สถานะบิล เขียน `set status = v_bl_status` โดย v_bl_status เป็น text
--            แต่ billing_notes.status เป็น enum billing_status → Postgres ไม่ implicit cast → Rev ล้มทุกครั้ง
--   แก้: cast เป็น v_bl_status::billing_status (จุดเดียว บรรทัด update status ท้ายฟังก์ชัน)
--   ที่เหลือเหมือน 0126 ทุกอย่าง · signature/return เท่าเดิม → create or replace ได้ ไม่ต้อง drop
--   (เจ้าของเจอตอนกด Rev บิล BL2569080087 · 12 ก.ย.69)
-- ============================================================

create or replace function public.replace_unpaid_installments(
  p_bn_id bigint,
  p_items jsonb,
  p_expected_locked_sum numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_status           text;
  v_old_total        numeric;
  v_locked_sum       numeric := 0;
  v_paid_locked      numeric := 0;
  v_locked_count     int := 0;
  v_max_seq          int := 0;
  v_locked_snapshot  jsonb := '[]'::jsonb;
  v_new_sum          numeric := 0;
  v_zero             int := 0;
  v_new_total        numeric;
  v_total_paid       numeric;
  v_bl_status        text;
begin
  -- gate สิทธิ์ในฟังก์ชัน (กันยิง rpc ตรงข้าม BFF) — finance:write = ADMIN/ACCOUNTING
  if not public.has_role('ADMIN', 'ACCOUNTING') then
    raise exception 'forbidden';
  end if;

  -- ล็อกใบวางบิล (serialize concurrent) + เช็คสถานะ
  select status, total into v_status, v_old_total
  from public.billing_notes where id = p_bn_id for update;
  if v_status is null then raise exception 'NOT_FOUND'; end if;
  if v_status = 'cancelled' then raise exception 'CANCELLED'; end if;

  -- ล็อกแถวงวดทั้งหมดของบิลนี้ กัน concurrent จ่าย/แก้ระหว่างทาง
  perform 1 from public.billing_installments where billing_note_id = p_bn_id for update;

  -- งวด locked (สดจาก DB ตอนนี้ — ไม่เชื่อของที่ route.ts เห็นตอนวางแผน)
  select
    coalesce(sum(bi.amount), 0),
    coalesce(sum(coalesce(bi.paid_amount, 0)), 0),
    coalesce(max(bi.seq), 0),
    count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', bi.id, 'seq', bi.seq, 'label', bi.label, 'amount', bi.amount,
      'status', bi.status, 'paid_amount', bi.paid_amount, 'kind', bi.kind
    ) order by bi.seq), '[]'::jsonb)
  into v_locked_sum, v_paid_locked, v_max_seq, v_locked_count, v_locked_snapshot
  from public.billing_installments bi
  where bi.billing_note_id = p_bn_id
    and (
      bi.status = 'paid'
      or coalesce(bi.paid_amount, 0) > 0
      or exists (select 1 from public.receipts r where r.installment_id = bi.id)
      or exists (select 1 from public.finance_entries f where f.billing_installment_id = bi.id)
    );

  -- race guard: ถ้า route.ts ส่ง expected มา ต้องตรงกับที่เห็นสดตอนนี้ (ห่างเกิน 1 สตางค์ = มีคนแทรกกลางทาง)
  if p_expected_locked_sum is not null and abs(v_locked_sum - p_expected_locked_sum) > 0.01 then
    raise exception 'LOCKED_CHANGED: เงื่อนไขงวดที่ชำระแล้วเปลี่ยนระหว่างทาง (คาด % ปัจจุบัน %) — รีเฟรชหน้าแล้วลองใหม่', p_expected_locked_sum, v_locked_sum;
  end if;

  -- validate p_items: ห้าม amount=0 เป๊ะ (ไม่มีความหมาย) · negative อนุญาต (รายการปรับปรุงยอด "รับเกิน")
  select coalesce(sum((e->>'amount')::numeric), 0),
         count(*) filter (where (e->>'amount')::numeric = 0)
    into v_new_sum, v_zero
  from jsonb_array_elements(p_items) e;
  if v_zero > 0 then raise exception 'ยอดงวดต้องไม่เป็น 0'; end if;

  v_new_total := round(coalesce(v_locked_sum, 0) + coalesce(v_new_sum, 0), 2);
  if v_new_total <= 0 then raise exception 'ยอดสุทธิรวมต้องมากกว่า 0'; end if;

  -- ลบเฉพาะงวดที่ "ไม่ locked" (เงื่อนไขเดียวกับด้านบน ประเมินสดอีกครั้งตอน delete — ปลอดภัยแม้ query แรกเพี้ยนไปก่อนหน้า)
  delete from public.billing_installments bi
  where bi.billing_note_id = p_bn_id
    and not (
      bi.status = 'paid'
      or coalesce(bi.paid_amount, 0) > 0
      or exists (select 1 from public.receipts r where r.installment_id = bi.id)
      or exists (select 1 from public.finance_entries f where f.billing_installment_id = bi.id)
    );

  -- insert งวดใหม่ seq ต่อจากงวด locked (ฟิลด์ภาษี booked เป็น optional — ไม่ส่ง = null/0 เหมือนงวดทั่วไป)
  insert into public.billing_installments(
    billing_note_id, seq, label, amount, due_date, sort_order, status,
    base_amt, vat_amt, wht_amt, vat_rate, wht_rate, kind
  )
  select p_bn_id,
         v_max_seq + t.ord::int,
         t.e->>'label',
         (t.e->>'amount')::numeric,
         nullif(t.e->>'due_date', '')::date,
         v_max_seq + t.ord::int - 1,
         'pending',
         nullif(t.e->>'base_amt', '')::numeric,
         coalesce(nullif(t.e->>'vat_amt', '')::numeric, 0),
         coalesce(nullif(t.e->>'wht_amt', '')::numeric, 0),
         coalesce(nullif(t.e->>'vat_rate', '')::numeric, 0),
         coalesce(nullif(t.e->>'wht_rate', '')::numeric, 0),
         nullif(t.e->>'kind', '')
  from jsonb_array_elements(p_items) with ordinality as t(e, ord);

  -- เขียนยอดบิลใหม่ = Σ(locked คงเดิม) + Σ(งวดใหม่) — deferred constraint (0026) เช็คตอน commit ว่าตรง
  update public.billing_notes set total = v_new_total where id = p_bn_id;

  -- recompute สถานะบิล (unpaid/partial/paid) จากผลรวม paid_amount จริงเทียบ total ใหม่ (ตรรกะเดียวกับ lib/billing.ts)
  select coalesce(sum(coalesce(paid_amount, 0)), 0) into v_total_paid
    from public.billing_installments where billing_note_id = p_bn_id;
  v_bl_status := case
    when v_total_paid <= 0 then 'unpaid'
    when v_total_paid >= v_new_total then 'paid'
    else 'partial'
  end;
  -- ★ 0150: cast text → enum billing_status (เดิม 0126 ลืม cast → Rev พัง)
  update public.billing_notes set status = v_bl_status::billing_status where id = p_bn_id and status <> 'cancelled';

  return jsonb_build_object(
    'old_total', v_old_total,
    'new_total', v_new_total,
    'locked_sum', v_locked_sum,
    'locked_count', v_locked_count,
    'paid_locked', v_paid_locked,
    'locked_snapshot', v_locked_snapshot,
    'status', v_bl_status,
    'overpaid', greatest(0, round(v_paid_locked - v_new_total, 2))
  );
end $$;

revoke all on function public.replace_unpaid_installments(bigint, jsonb, numeric) from public;
grant execute on function public.replace_unpaid_installments(bigint, jsonb, numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
