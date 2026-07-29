-- 0113 · รวมรายการซ้ำในสโตร์ (merge duplicate stock items) — atomic + ADMIN-only
-- ปัญหา: วัสดุเดียวกันมีหลายแถว (เช่น "มือจับบานเปิดจีน" = "มือจับบานเปิด kingbo")
--   ตัวที่ผูกใบตัด/คิดราคา มักเป็นตัวสต็อก 0 → หักสต็อก/คิดราคาไปลงผิดตัว
-- วิธี (ทำในทรานแซกชันเดียว — all-or-nothing):
--   • บังคับตัวที่ลบ qty_on_hand = 0 (กันของหาย)
--   • boq_items.stock_item_id → keep (คงประวัติ BOQ + กัน FK RESTRICT บล็อกลบ)
--   • remap JSON ที่อ้าง stock_item_id: cutlists.stock_cut_summary + cutlists.adjustments (removed → keep)
--   • ลบตัวซ้ำถาวร → stock_moves/stock_prices ของมัน cascade หายไป (net-zero อยู่แล้ว · ไม่ยกมาปน keep กันบั๊ก void)
--   • ย้าย "ตัวตน": sku (ใบตัด/คิดราคาอลูอ้างรหัสนี้) · name (คิดราคาผูกด้วยชื่อ)
--   • adopt_price = เติมต้นทุนจากตัวที่ลบ "เฉพาะเมื่อ keep ยังไม่มีราคา" (ไม่ตีราคาคงคลังใหม่)
-- ผลตรวจบัญชี: ยอด/มูลค่า ณ ตอน merge ไม่เพี้ยน (trigger qty/cost เป็น AFTER INSERT), ใบเสนอ/BOQ เก่า snapshot ไม่กระทบ
-- idempotent · เจ้าของรัน
-- ============================================================

create or replace function public.merge_stock_items(
  p_keep bigint,
  p_remove bigint[],
  p_new_sku text default null,
  p_new_name text default null,
  p_adopt_price boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_keep       public.stock_items;
  v_bad        record;
  v_valid_sku  text := null;
  v_valid_name text := null;
  v_max_cost   numeric := 0;
  v_max_kg     numeric := 0;
  v_priced     numeric := null;
  v_boq        int := 0;
begin
  -- สิทธิ์: แอดมินเท่านั้น (RPC security definer ต้องเช็คเอง)
  if not public.has_role('ADMIN') then
    raise exception 'forbidden';
  end if;

  -- ตัดตัว keep ออกจากรายการลบ + unique
  p_remove := array(select distinct x from unnest(coalesce(p_remove, '{}'::bigint[])) x where x <> p_keep);
  if array_length(p_remove, 1) is null then
    raise exception 'no_remove';
  end if;

  select * into v_keep from public.stock_items where id = p_keep;
  if not found then raise exception 'keep_not_found'; end if;

  if (select count(*) from public.stock_items where id = any(p_remove)) <> array_length(p_remove, 1) then
    raise exception 'remove_not_found';
  end if;

  -- ตัวที่ลบต้องสต็อก 0
  select id, name, qty_on_hand into v_bad
    from public.stock_items where id = any(p_remove) and qty_on_hand <> 0 limit 1;
  if found then
    raise exception 'has_qty:%', v_bad.name;
  end if;

  -- newSku/newName ต้องมาจากตัวที่ลบจริง (กัน inject)
  if coalesce(p_new_sku, '') <> '' then
    if exists (select 1 from public.stock_items where id = any(p_remove) and sku = p_new_sku) then
      v_valid_sku := p_new_sku;
    else raise exception 'bad_sku'; end if;
  end if;
  if coalesce(p_new_name, '') <> '' then
    if exists (select 1 from public.stock_items where id = any(p_remove) and name = p_new_name) then
      v_valid_name := p_new_name;
    else raise exception 'bad_name'; end if;
  end if;

  -- เก็บราคาสูงสุดจากตัวที่ลบ (ก่อนลบ) — ใช้เฉพาะกรณี keep ยังไม่มีราคา
  select coalesce(max(unit_cost), 0), coalesce(max(price_per_kg), 0)
    into v_max_cost, v_max_kg
    from public.stock_items where id = any(p_remove);

  -- 1) ย้าย BOQ → keep (คงประวัติ + กัน FK RESTRICT)
  update public.boq_items set stock_item_id = p_keep where stock_item_id = any(p_remove);
  get diagnostics v_boq = row_count;

  -- 2) remap JSON ที่อ้าง stock_item_id ในใบตัด (กัน dangling หลังลบ)
  update public.cutlists c set stock_cut_summary = (
    select jsonb_agg(
      case when (e->>'stock_item_id') is not null and (e->>'stock_item_id')::bigint = any(p_remove)
           then jsonb_set(e, '{stock_item_id}', to_jsonb(p_keep))
           else e end)
    from jsonb_array_elements(c.stock_cut_summary) e)
  where c.stock_cut_summary is not null
    and jsonb_typeof(c.stock_cut_summary) = 'array'
    and exists (select 1 from jsonb_array_elements(c.stock_cut_summary) e
                where (e->>'stock_item_id') is not null and (e->>'stock_item_id')::bigint = any(p_remove));

  update public.cutlists c set adjustments = (
    select jsonb_agg(
      case when (e->>'sid') is not null and (e->>'sid')::bigint = any(p_remove)
           then jsonb_set(e, '{sid}', to_jsonb(p_keep))
           else e end)
    from jsonb_array_elements(c.adjustments) e)
  where jsonb_typeof(c.adjustments) = 'array'
    and exists (select 1 from jsonb_array_elements(c.adjustments) e
                where (e->>'sid') is not null and (e->>'sid')::bigint = any(p_remove));

  -- 3) ลบตัวซ้ำ (moves/prices cascade — net-zero, ไม่ยกมาปน keep)
  delete from public.stock_items where id = any(p_remove);

  -- 4) ย้ายตัวตนมา keep (ทำหลังลบ — กันชน sku ชั่วขณะ)
  update public.stock_items
    set sku  = coalesce(v_valid_sku, sku),
        name = coalesce(v_valid_name, name)
    where id = p_keep;

  -- 5) เติมราคา เฉพาะเมื่อ keep ยังไม่มีราคา (fill-missing — ไม่ตีราคาคงคลังใหม่)
  if p_adopt_price then
    if v_keep.is_weight_based then
      if coalesce(v_keep.price_per_kg, 0) = 0 and v_max_kg > 0 then
        insert into public.stock_prices (stock_item_id, price_per_kg, unit_cost, note, created_by)
          values (p_keep, v_max_kg, round(v_max_kg * coalesce(v_keep.weight_per_unit, 0), 2), 'ดึงราคาตอนรวมรายการซ้ำ', auth.uid());
        v_priced := v_max_kg;
      end if;
    else
      if coalesce(v_keep.unit_cost, 0) = 0 and v_max_cost > 0 then
        insert into public.stock_prices (stock_item_id, unit_cost, price_per_kg, note, created_by)
          values (p_keep, v_max_cost, null, 'ดึงราคาตอนรวมรายการซ้ำ', auth.uid());
        v_priced := v_max_cost;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'keepId', p_keep,
    'removed', to_jsonb(p_remove),
    'newSku', v_valid_sku,
    'newName', v_valid_name,
    'pricedTo', v_priced,
    'boqMoved', v_boq
  );
end $$;

grant execute on function public.merge_stock_items(bigint, bigint[], text, text, boolean) to authenticated;
