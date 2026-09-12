-- ============================================================
-- 0151 · แก้งวดชำระได้อิสระ — "total วิ่งตามงวด" (เจ้าของสั่ง 12 ก.ย.69)
--   เดิม replace_billing_installments (0028) บล็อกถ้า Σงวด ≠ billing_notes.total → คนแก้งวดเองไม่ได้
--   ใหม่: ไม่บล็อก · เขียน billing_notes.total = Σ(งวดใหม่) ให้เอง (เหมือน Rev path 0126/0150 ที่ทำอยู่แล้ว)
--         → deferred constraint tg_check_installment_sum (0026) ผ่านเสมอ (total=Σ ในทรานแซกชันเดียว)
--   คงไว้: guard "มีงวดจ่ายแล้ว ห้ามแก้ตรงนี้" (เงินรับจริงแตะไม่ได้ · ให้ใช้โหมด Rev) — money safety ไม่ใช่ lock ยอด
--   ระบบยังแบ่งงวดอัตโนมัติตามสูตรเป็นค่าเริ่มต้น · อันนี้แค่ปลดล็อกตอน "คนแก้เอง"
-- ============================================================

create or replace function public.replace_billing_installments(p_bn_id bigint, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_sum   numeric;
begin
  -- gate สิทธิ์ในฟังก์ชัน (กันยิง rpc ตรงข้าม BFF) — finance:write = ADMIN/ACCOUNTING (ให้ตรงกับ 0126)
  if not public.has_role('ADMIN', 'ACCOUNTING') then
    raise exception 'forbidden';
  end if;

  select total into v_total from public.billing_notes where id = p_bn_id;
  if v_total is null then raise exception 'ไม่พบใบวางบิล %', p_bn_id; end if;

  -- ผลรวมงวดใหม่ (ไม่บล็อกถ้าไม่ตรง total — total จะวิ่งตามงวดแทน)
  select coalesce(sum((e->>'amount')::numeric), 0) into v_sum
  from jsonb_array_elements(p_items) e;

  -- money safety: มีงวดชำระแล้ว = เงินรับจริง แตะไม่ได้ (ให้ใช้โหมด Rev ที่ตรึงงวด locked)
  if exists (
    select 1 from public.billing_installments
    where billing_note_id = p_bn_id and (status = 'paid' or coalesce(paid_amount,0) > 0)
  ) then
    raise exception 'ใบวางบิลนี้มีงวดที่ชำระแล้ว ปรับงวดไม่ได้';
  end if;

  -- replace ทั้งชุดใน txn เดียว
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

  -- ★ total วิ่งตามงวด: เขียนยอดบิล = Σงวดใหม่ (deferred constraint 0026 เช็คตอน commit → ผ่านเพราะเท่ากัน)
  update public.billing_notes set total = round(v_sum, 2) where id = p_bn_id;
end $$;

grant execute on function public.replace_billing_installments(bigint, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
