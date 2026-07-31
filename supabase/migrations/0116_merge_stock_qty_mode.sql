-- 0116 · รวมรายการซ้ำ: เลือกจำนวนคงเหลือได้ (เดิม/ตัวที่ลบ/รวมกัน) + ต้นทุนถูกหลักบัญชี
-- ต่อจาก 0113. ปัญหา: เดิมบังคับตัวที่ลบ qty_on_hand=0 ก่อนรวม (raise has_qty)
--   เคสจริง: ตัวที่ผูกคิดราคา/ใบตัด (keep) มักสต็อก 0 · ตัวซ้ำ (remove) มีของจริง → อยากยุบให้ของไปกองที่ตัวหลัก
--
-- ✅ ผ่านรีวิวบัญชี (แก้ตามเงื่อนไข):
--   keep กับ remove = แถวซ้ำของ "วัสดุตัวเดียวกันทางกายภาพ" → ของจริง = keep_qty + remove_qty
--   1) p_qty_mode:
--        'block'   (default · เข้ากันได้เดิม) = บังคับตัวที่ลบต้อง 0 (ไม่งั้น has_qty) — STORE ทำได้แค่โหมดนี้
--        'sum'     = รวมกัน (keep+removed)              ← เคสปกติ · ต้นทุน = ถัวเฉลี่ยถ่วงน้ำหนัก (moving-average)
--        'removed' = ใช้จำนวนตัวที่ลบ (ทิ้ง keep_qty)    · ต้นทุน = ต้นทุนถัวเฉลี่ยของตัวที่ลบ
--        'keep'    = คงจำนวนตัวหลัก (ทิ้ง removed_qty)    · ต้นทุน = ต้นทุน keep เดิม
--   2) ต้นทุน (mode≠block) เขียนผ่าน stock_prices → trigger apply_stock_price sync เข้า stock_items.unit_cost
--        * ไม่ใช่แค่ stamp บน adjust move (adjust ไม่ถัวเฉลี่ย — 0075 คิดเฉพาะ type='in')
--        * เคส keep_qty=0 → ถัวเฉลี่ย = ต้นทุนตัวที่ลบพอดี (รักษามูลค่าคงคลังเป๊ะ)
--   3) mode ที่ "ทิ้งของจริง" ('removed' ทิ้ง keep · 'keep' ทิ้ง removed) = ตัดจำหน่ายสต็อก → บังคับ p_reason
--   4) mode≠block จำกัดเฉพาะ ADMIN/ACCOUNTING (= การปรับมูลค่าคงคลัง) · STORE ได้แค่ block
--   5) ปรับยอด: insert stock_moves type='adjust' → มีรอยในสมุดสโตร์ (route snapshot moves ตัวที่ลบลง audit ก่อนเรียก)
--   * ledger route ไม่ replay ยอดต่อแถว (อ่าน qty_on_hand ที่ stored) → cascade delete ปลอดภัย · void = soft+recompute จึงไม่ re-point (กันบั๊ก void เดิม)
-- idempotent · เจ้าของรัน
-- ============================================================

-- ลบ signature 0113 (5 args) — 0116 เพิ่ม p_qty_mode + p_reason
drop function if exists public.merge_stock_items(bigint, bigint[], text, text, text);

create or replace function public.merge_stock_items(
  p_keep bigint,
  p_remove bigint[],
  p_new_sku text default null,
  p_new_name text default null,
  p_price_mode text default 'keep',   -- (ใช้เฉพาะ block) 'keep'=ตัวเก็บชนะ · 'remove'=เอาราคาตัวลบมาทับ
  p_qty_mode text default 'block',    -- 'block'/'sum'/'removed'/'keep' (ดูหัวไฟล์)
  p_reason text default null           -- เหตุผล (บังคับเมื่อโหมดทิ้งของจริง = write-off)
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_keep         public.stock_items;
  v_bad          record;
  v_valid_sku    text := null;
  v_valid_name   text := null;
  v_max_cost     numeric := 0;   -- max (สำหรับ block adopt เดิม)
  v_max_kg       numeric := 0;
  v_rm_qty       numeric := 0;   -- คงเหลือรวมตัวที่ลบ
  v_rm_cost      numeric := 0;   -- ต้นทุนถัวเฉลี่ยตัวที่ลบ (ถ่วง qty)
  v_rm_kg        numeric := 0;   -- ราคา/โล ถัวเฉลี่ยตัวที่ลบ
  v_keep_qty     numeric := 0;
  v_priced       numeric := null;
  v_boq          int := 0;
  v_target       numeric := null;   -- จำนวนสุดท้ายตัวหลัก
  v_discard      numeric := 0;      -- จำนวนที่ตัดจำหน่าย (write-off)
  v_writeoff     numeric := 0;      -- มูลค่า write-off
  v_final_cost   numeric := null;   -- ต้นทุนใหม่ที่จะเขียน (non-weight)
  v_final_kg     numeric := null;   -- ราคา/โลใหม่ (weight-based)
  v_stamp_cost   numeric := 0;
begin
  -- สิทธิ์พื้นฐาน: แอดมิน + สโตร์ + บัญชี (บัญชีคือ role ที่ปรับมูลค่าคงคลัง — ต้องผ่านด่านแรกด้วย)
  if not public.has_role('ADMIN', 'STORE', 'ACCOUNTING') then
    raise exception 'forbidden';
  end if;
  -- โหมดที่เปลี่ยนยอด/มูลค่าคงคลัง (≠block) = ต้อง ADMIN/ACCOUNTING เท่านั้น (STORE ได้แค่ block)
  if p_qty_mode <> 'block' and not public.has_role('ADMIN', 'ACCOUNTING') then
    raise exception 'qty_forbidden';
  end if;

  p_remove := array(select distinct x from unnest(coalesce(p_remove, '{}'::bigint[])) x where x <> p_keep);
  if array_length(p_remove, 1) is null then
    raise exception 'no_remove';
  end if;

  select * into v_keep from public.stock_items where id = p_keep;
  if not found then raise exception 'keep_not_found'; end if;
  v_keep_qty := coalesce(v_keep.qty_on_hand, 0);

  if (select count(*) from public.stock_items where id = any(p_remove)) <> array_length(p_remove, 1) then
    raise exception 'remove_not_found';
  end if;

  -- กันรวมข้ามชนิดคิดต้นทุน (อลูคิดต่อโล vs คิดต่อชิ้น) — ถัวเฉลี่ยข้ามชนิดจะเพี้ยนเงียบ (บัญชีสั่ง)
  if exists (select 1 from public.stock_items
             where id = any(p_remove) and coalesce(is_weight_based, false) <> coalesce(v_keep.is_weight_based, false)) then
    raise exception 'type_mismatch';
  end if;

  -- aggregate ตัวที่ลบ (ก่อนลบ): qty รวม, ต้นทุนถัวเฉลี่ยถ่วง qty (fallback max ถ้า qty=0), ราคา/โล ถัวเฉลี่ย, max (block adopt)
  --   coalesce ต้นทุน/ราคา null → 0 กัน null propagate ทำ denominator เจือจาง (บัญชีจับ edge ของไม่เคยตั้งราคา)
  select
    coalesce(sum(qty_on_hand), 0),
    case when coalesce(sum(qty_on_hand), 0) > 0 then round(sum(qty_on_hand * coalesce(unit_cost, 0)) / sum(qty_on_hand), 2) else coalesce(max(unit_cost), 0) end,
    case when coalesce(sum(qty_on_hand), 0) > 0 then round(sum(qty_on_hand * coalesce(price_per_kg, 0)) / sum(qty_on_hand), 2) else coalesce(max(price_per_kg), 0) end,
    coalesce(max(unit_cost), 0),
    coalesce(max(price_per_kg), 0)
  into v_rm_qty, v_rm_cost, v_rm_kg, v_max_cost, v_max_kg
  from public.stock_items where id = any(p_remove);

  -- โหมด block (เดิม) = ยังบังคับตัวที่ลบต้อง 0
  if p_qty_mode = 'block' then
    select id, name, qty_on_hand into v_bad
      from public.stock_items where id = any(p_remove) and qty_on_hand <> 0 limit 1;
    if found then raise exception 'has_qty:%', v_bad.name; end if;
  end if;

  -- โหมดที่ทิ้งของจริง → บังคับเหตุผล (ตัดจำหน่ายสต็อก)
  v_discard := case p_qty_mode when 'removed' then v_keep_qty when 'keep' then v_rm_qty else 0 end;
  if v_discard > 0 and coalesce(btrim(p_reason), '') = '' then
    raise exception 'need_reason';
  end if;

  -- newSku/newName ต้องมาจากตัวที่ลบจริง (กัน inject)
  if coalesce(p_new_sku, '') <> '' then
    if exists (select 1 from public.stock_items where id = any(p_remove) and sku = p_new_sku) then v_valid_sku := p_new_sku;
    else raise exception 'bad_sku'; end if;
  end if;
  if coalesce(p_new_name, '') <> '' then
    if exists (select 1 from public.stock_items where id = any(p_remove) and name = p_new_name) then v_valid_name := p_new_name;
    else raise exception 'bad_name'; end if;
  end if;

  -- 1) ย้าย BOQ → keep
  update public.boq_items set stock_item_id = p_keep where stock_item_id = any(p_remove);
  get diagnostics v_boq = row_count;

  -- 2) remap JSON ในใบตัด
  update public.cutlists c set stock_cut_summary = (
    select jsonb_agg(
      case when (e->>'stock_item_id') is not null and (e->>'stock_item_id')::bigint = any(p_remove)
           then jsonb_set(e, '{stock_item_id}', to_jsonb(p_keep)) else e end)
    from jsonb_array_elements(c.stock_cut_summary) e)
  where c.stock_cut_summary is not null and jsonb_typeof(c.stock_cut_summary) = 'array'
    and exists (select 1 from jsonb_array_elements(c.stock_cut_summary) e
                where (e->>'stock_item_id') is not null and (e->>'stock_item_id')::bigint = any(p_remove));

  update public.cutlists c set adjustments = (
    select jsonb_agg(
      case when (e->>'sid') is not null and (e->>'sid')::bigint = any(p_remove)
           then jsonb_set(e, '{sid}', to_jsonb(p_keep)) else e end)
    from jsonb_array_elements(c.adjustments) e)
  where jsonb_typeof(c.adjustments) = 'array'
    and exists (select 1 from jsonb_array_elements(c.adjustments) e
                where (e->>'sid') is not null and (e->>'sid')::bigint = any(p_remove));

  -- 3) ลบตัวซ้ำ (moves/prices cascade — route snapshot ประวัติ moves ลง audit ก่อนแล้ว)
  delete from public.stock_items where id = any(p_remove);

  -- 4) ย้ายตัวตนมา keep
  update public.stock_items set sku = coalesce(v_valid_sku, sku), name = coalesce(v_valid_name, name) where id = p_keep;

  -- 5) ต้นทุน (เขียนผ่าน stock_prices → sync stock_items.unit_cost) — ตั้งได้เฉพาะ ADMIN/ACCOUNTING
  --    ทำ "ก่อน" อ่านต้นทุนไป stamp adjust เสมอ (บัญชีสั่ง: price step ก่อน blend)
  if public.has_role('ADMIN', 'ACCOUNTING') then
    if p_qty_mode = 'block' then
      -- เดิม (0113): qty ไม่เปลี่ยน → แค่เลือก "ราคาอ้างอิง" ที่คิดราคา4.0/ใบตัดใช้
      if v_keep.is_weight_based then
        if v_max_kg > 0 and ((p_price_mode = 'remove' and v_max_kg <> coalesce(v_keep.price_per_kg, 0)) or coalesce(v_keep.price_per_kg, 0) = 0) then
          v_final_kg := v_max_kg;
        end if;
      else
        if v_max_cost > 0 and ((p_price_mode = 'remove' and v_max_cost <> coalesce(v_keep.unit_cost, 0)) or coalesce(v_keep.unit_cost, 0) = 0) then
          v_final_cost := v_max_cost;
        end if;
      end if;
    elsif p_qty_mode = 'sum' then
      -- ถัวเฉลี่ยถ่วงน้ำหนัก (moving-average) — รักษามูลค่าคงคลังจริง
      if v_keep.is_weight_based then
        if (v_keep_qty + v_rm_qty) > 0 then v_final_kg := round((v_keep_qty * coalesce(v_keep.price_per_kg,0) + v_rm_qty * v_rm_kg) / (v_keep_qty + v_rm_qty), 2); end if;
      else
        if (v_keep_qty + v_rm_qty) > 0 then v_final_cost := round((v_keep_qty * coalesce(v_keep.unit_cost,0) + v_rm_qty * v_rm_cost) / (v_keep_qty + v_rm_qty), 2); end if;
      end if;
    elsif p_qty_mode = 'removed' then
      -- เอาของตัวที่ลบมา → ต้นทุน = ต้นทุนตัวที่ลบ
      if v_keep.is_weight_based then v_final_kg := v_rm_kg; else v_final_cost := v_rm_cost; end if;
    end if;
    -- 'keep' = ต้นทุนคงเดิม (ไม่เขียนราคาใหม่ · มี write-off ของ removed)

    if v_final_kg is not null and v_final_kg > 0 and v_final_kg <> coalesce(v_keep.price_per_kg, 0) then
      insert into public.stock_prices (stock_item_id, price_per_kg, unit_cost, note, created_by)
        values (p_keep, v_final_kg, round(v_final_kg * coalesce(v_keep.weight_per_unit, 0), 2), 'ต้นทุนตอนรวมรายการซ้ำ (' || p_qty_mode || ')', auth.uid());
      v_priced := v_final_kg;
    elsif v_final_cost is not null and v_final_cost > 0 and v_final_cost <> coalesce(v_keep.unit_cost, 0) then
      insert into public.stock_prices (stock_item_id, unit_cost, price_per_kg, note, created_by)
        values (p_keep, v_final_cost, null, 'ต้นทุนตอนรวมรายการซ้ำ (' || p_qty_mode || ')', auth.uid());
      v_priced := v_final_cost;
    end if;
  end if;

  -- 6) ปรับยอดคงเหลือตัวหลักตามโหมด (insert adjust move → มีรอยในสมุดสโตร์)
  v_target := case p_qty_mode when 'removed' then v_rm_qty when 'sum' then v_keep_qty + v_rm_qty else v_keep_qty end;
  if v_target is not null and v_target <> v_keep_qty then
    select coalesce(unit_cost, 0) into v_stamp_cost from public.stock_items where id = p_keep;  -- ต้นทุนหลังเขียนราคาใหม่แล้ว
    insert into public.stock_moves (stock_item_id, type, qty, ref, note, requester, unit_cost, total_price, created_by)
      values (p_keep, 'adjust', v_target, 'MERGE',
              'รวมรายการซ้ำ — ปรับยอด (' || p_qty_mode || ')' || case when coalesce(btrim(p_reason),'') <> '' then ' · ' || btrim(p_reason) else '' end,
              '', v_stamp_cost, round(v_target * v_stamp_cost, 2), auth.uid());
  end if;

  -- มูลค่า write-off (โหมดทิ้งของจริง) เพื่อรายงาน/audit
  v_writeoff := case p_qty_mode when 'removed' then round(v_keep_qty * coalesce(v_keep.unit_cost,0), 2) when 'keep' then round(v_rm_qty * v_rm_cost, 2) else 0 end;

  return jsonb_build_object(
    'keepId', p_keep,
    'removed', to_jsonb(p_remove),
    'newSku', v_valid_sku,
    'newName', v_valid_name,
    'pricedTo', v_priced,
    'boqMoved', v_boq,
    'qtyMode', p_qty_mode,
    'keepQtyBefore', v_keep_qty,
    'removedQty', v_rm_qty,
    'finalQty', coalesce(v_target, v_keep_qty),
    'discardQty', v_discard,
    'writeoffValue', v_writeoff
  );
end $$;

grant execute on function public.merge_stock_items(bigint, bigint[], text, text, text, text, text) to authenticated;
