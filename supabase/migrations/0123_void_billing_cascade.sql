-- 0123: ยกเลิกใบวางบิล แบบ cascade — void ใบเสร็จที่ผูกอยู่ให้ในตัว (atomic RPC เดียว)
--   [ACCOUNTANT sign-off spec] ห้ามยิง update เรียงหลาย await แบบ endpoint เดิม — cascade แตะหลายตาราง
--   เสี่ยงสถานะครึ่งๆ ถ้า error กลางทาง → รวมเป็น RPC เดียว atomic (transaction เดียวของ Postgres function)
--
--   ⚠ security definer + grant authenticated → **ต้องเช็คสิทธิ์ในฟังก์ชันเอง** (กัน bypass BFF ยิง rpc ตรง)
--     gate has_role('ADMIN','ACCOUNTING') = finance:void (เหมือน undeposit_job 0112)
--
--   ลำดับ (ลูกก่อนแม่):
--     1) lock billing_notes for update
--     2) หา active receipts (is_voided=false) ที่ผูกงวดของบิลนี้ หรือผูกบิลนี้ตรง (billing_note_id)
--     3) void ใบเสร็จทุกใบ (is_voided/void_reason/voided_at/voided_by) — เก็บ id+code ไว้ return
--     4) finance_entries ที่ผูก (installment ของบิลนี้ OR receipt ที่เพิ่ง void)
--          is_auto_created=true (มัดจำรับจริง) → unlink (billing_installment_id/receipt_id/source = null, คง amount+is_voided=false)
--          is_auto_created=false → void ปกติ
--     5) cancel บิล (status='cancelled')
--     6) คืนงวด: ไม่ใช่มัดจำ → pending/paid_amount=0/paid_date=null
--                เป็นมัดจำ (มี finance is_auto_created ผูกงวดนั้น ก่อน unlink) → คง paid ไว้ (ตรง logic receipts void เดิม)
--
--   ห้าม reuse เลขเอกสาร — ฟังก์ชันนี้ไม่แตะ next_document_code/job_sequence เลย (แค่ set is_voided/cancelled)
create or replace function public.void_billing_note_cascade(p_bn_id bigint, p_reason text, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  -- voided_by = ผู้เรียกจริงจาก JWT เสมอ (auth.uid) — ห้ามเชื่อ p_user_id ที่ client ส่ง (กันปลอม audit trail)
  --   p_user_id คงไว้ใน signature เพื่อ compat แต่ถ้าส่งมาไม่ตรงตัวจริง = ปฏิเสธ (กัน bypass BFF ปลอมชื่อ)
  v_uid uuid := auth.uid();
  v_status text;
  v_inst_ids bigint[];
  v_deposit_inst_ids bigint[];  -- งวดที่มี finance is_auto_created ผูกอยู่ ณ ก่อน unlink (ต้องคง paid)
  v_receipt_ids bigint[];
  v_receipts jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  -- gate สิทธิ์ในฟังก์ชัน (กันยิง rpc ตรงข้าม BFF) — finance:void = ADMIN/ACCOUNTING
  if not public.has_role('ADMIN', 'ACCOUNTING') then raise exception 'forbidden'; end if;
  -- กันปลอม voided_by: ถ้า client ส่ง p_user_id ที่ไม่ใช่ตัวเอง = ปฏิเสธ
  if p_user_id is not null and p_user_id <> v_uid then raise exception 'forbidden'; end if;

  -- 1) lock billing note
  select status into v_status from public.billing_notes where id = p_bn_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;

  select array_agg(id) into v_inst_ids
  from public.billing_installments where billing_note_id = p_bn_id;
  v_inst_ids := coalesce(v_inst_ids, array[]::bigint[]);

  -- งวดที่เป็นมัดจำ (ผูก finance is_auto_created=true active) ก่อนที่จะ unlink — จำไว้กันคืน pending ผิด
  select coalesce(array_agg(distinct billing_installment_id), array[]::bigint[])
    into v_deposit_inst_ids
  from public.finance_entries
  where billing_installment_id = any(v_inst_ids)
    and coalesce(is_auto_created, false) = true
    and coalesce(is_voided, false) = false;

  -- 2) หา active receipts ผูกกับบิลนี้ (ทาง installment หรือ billing_note_id ตรง) + lock
  select array_agg(r.id) into v_receipt_ids
  from public.receipts r
  where coalesce(r.is_voided, false) = false
    and (r.installment_id = any(v_inst_ids) or r.billing_note_id = p_bn_id);
  v_receipt_ids := coalesce(v_receipt_ids, array[]::bigint[]);

  perform 1 from public.receipts where id = any(v_receipt_ids) for update;

  -- 3) void ใบเสร็จทุกใบ — เก็บ id+code ไว้ return ก่อนแตะแถว
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code)), '[]'::jsonb)
    into v_receipts from public.receipts where id = any(v_receipt_ids);

  update public.receipts
    set is_voided = true, void_reason = p_reason, voided_at = v_now, voided_by = v_uid
    where id = any(v_receipt_ids);

  -- 4) finance_entries ผูกงวดของบิลนี้ หรือผูก receipt ที่เพิ่ง void — is_auto_created=true → unlink, ไม่งั้น void
  update public.finance_entries
    set billing_installment_id = null, receipt_id = null, source = null
    where coalesce(is_voided, false) = false
      and coalesce(is_auto_created, false) = true
      and (billing_installment_id = any(v_inst_ids) or receipt_id = any(v_receipt_ids));

  update public.finance_entries
    set is_voided = true, void_reason = p_reason, voided_at = v_now, voided_by = v_uid
    where coalesce(is_voided, false) = false
      and coalesce(is_auto_created, false) = false
      and (billing_installment_id = any(v_inst_ids) or receipt_id = any(v_receipt_ids));

  -- 5) cancel บิล
  update public.billing_notes set status = 'cancelled' where id = p_bn_id;

  -- 6) คืนงวด — งวดมัดจำ (อยู่ใน v_deposit_inst_ids) คง paid ไว้เหมือน receipts void เดิม, งวดอื่นคืน pending
  update public.billing_installments
    set paid_amount = 0, paid_date = null, status = 'pending'
    where billing_note_id = p_bn_id
      and not (id = any(v_deposit_inst_ids));

  return jsonb_build_object('voided_receipts', v_receipts, 'billing_cancelled', true);
end $$;

grant execute on function public.void_billing_note_cascade(bigint, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
