-- 0060: แก้ข้อมูลที่เผลอกรอกปี พ.ศ. (>= 2500) ให้เป็น ค.ศ. (ลบ 543 ปี)
-- ขอบเขต: เฉพาะคอลัมน์ชนิด "date" (วันธุรกิจที่คนกรอกเอง) ในสคีมา public
--   - ไม่แตะ timestamptz (created_at/updated_at/*_at = audit trail จาก now() เป็น ค.ศ. อยู่แล้ว)
--   - ไม่แตะ int (เช่น year_be รหัสเอกสาร) และ numeric (ยอดเงิน/VAT) → การเงินไม่กระทบ
-- idempotent: รันซ้ำไม่ทำอะไร (หลังแก้รอบแรกไม่เหลือแถวปี >= 2500)
-- ตรวจโดย accountant agent (24 มิ.ย. 2026): VAT/total/ยอดค้างรับ (numeric) ไม่กระทบ,
--   warranty_until (derived) ยังถูกเพราะ trigger recompute จาก completed_date ที่แก้แล้ว
-- ⚠ หลังรัน: ต้องกระทบยอดเงินรับรายเดือน (มิ.ย. 2026) ใหม่ — งวดที่เคยตกปี 2569 จะกลับเข้าเดือนจริง

-- (1) AUDIT — เก็บค่าเดิมของคอลัมน์การเงินก่อนแก้ (หลักฐานกระทบยอด/ตรวจย้อนได้)
do $$
declare
  fin text[][] := array[
    ['finance_entries','payment_date'],
    ['jobs','deposit_date'],
    ['installments','due_date'],
    ['installments','paid_date'],
    ['billing_notes','issue_date'],
    ['receipts','issue_date']
  ];
  i int; tbl text; col text; j jsonb;
begin
  for i in 1 .. array_length(fin, 1) loop
    tbl := fin[i][1]; col := fin[i][2];
    -- ข้ามถ้าตาราง/คอลัมน์ไม่มีในสคีมานี้
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = col
    ) then
      continue;
    end if;
    execute format(
      'select jsonb_agg(jsonb_build_object(''id'', id, ''old'', %I)) '
      || 'from public.%I where %I >= date ''2500-01-01''',
      col, tbl, col
    ) into j;
    if j is not null then
      insert into public.audit_logs(action, table_name, old_value, new_value)
      values (
        'BE_YEAR_FIX', tbl,
        jsonb_build_object('column', col, 'rows', j),
        jsonb_build_object('shift', '-543 years', 'reason', 'แก้ปี พ.ศ. -> ค.ศ. (migration 0060)')
      );
    end if;
  end loop;
end $$;

-- (2) FIX — กวาดทุกคอลัมน์ชนิด date ที่มีค่าปี >= 2500 แล้วลบ 543 ปี
do $$
declare r record; n bigint;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and data_type = 'date'
    order by table_name, column_name
  loop
    execute format(
      'update public.%I set %I = %I - interval ''543 years'' where %I >= date ''2500-01-01''',
      r.table_name, r.column_name, r.column_name, r.column_name
    );
    get diagnostics n = row_count;
    if n > 0 then
      raise notice 'แก้ %.% : % แถว', r.table_name, r.column_name, n;
    end if;
  end loop;
end $$;
