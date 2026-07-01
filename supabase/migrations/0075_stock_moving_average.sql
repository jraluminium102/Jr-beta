-- ============================================================
-- 0075 · ต้นทุนถัวเฉลี่ยถ่วงน้ำหนัก (moving average) ตอนรับเข้า
--   ปัญหาเดิม (บัญชีเตือน): รับเข้าราคาจริงไม่ขยับ unit_cost → เบิกออกคิดต้นทุนเก่า = กำไรลวง
--   แก้: trigger คำนวณต้นทุนถัวเฉลี่ยใหม่ทุกครั้งที่ "รับเข้า" (เฉพาะวัสดุที่ไม่ใช่ชั่งโล)
--     unit_cost ใหม่ = (คงเหลือเดิม×ต้นทุนเดิม + จำนวนรับ×ต้นทุนที่ซื้อ) / (คงเหลือเดิม+จำนวนรับ)
--   * ทำเป็น SECURITY DEFINER → ฝ่ายผลิต/สโตร์ (PRODUCTION) รับเข้าแล้วต้นทุนขยับได้
--     โดยไม่ชนสิทธิ์แก้ราคา (ADMIN/ACCOUNTING) ที่บังคับใน RLS/route
--   * วัสดุชั่งโล (อลู): ข้าม — ต้นทุนมาจากราคาต่อโล×น้ำหนัก (อัปเดตผ่าน "อัปเดตราคา")
--   BEFORE INSERT: อ่าน qty_on_hand ก่อนถูก apply_stock_move บวกจำนวนใหม่ (= คงเหลือเดิม)
-- idempotent · เจ้าของรัน
-- ============================================================

create or replace function public.tg_stock_move_avg_cost()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  q0 numeric;   -- คงเหลือเดิม (ก่อนรับเข้า)
  c0 numeric;   -- ต้นทุนเดิม/หน่วย
  wb boolean;   -- ชั่งโลหรือไม่
  new_cost numeric;
begin
  if new.type <> 'in' then return new; end if;

  select qty_on_hand, unit_cost, is_weight_based into q0, c0, wb
    from public.stock_items where id = new.stock_item_id;

  -- ชั่งโล → ต้นทุนคุมด้วยราคา/โล ไม่ถัวเฉลี่ย · ไม่มีต้นทุนที่ซื้อ (unit_cost<=0) → ไม่ทำ
  if wb is true or coalesce(new.unit_cost, 0) <= 0 then
    return new;
  end if;

  q0 := coalesce(q0, 0);
  c0 := coalesce(c0, 0);
  if (q0 + new.qty) > 0 then
    new_cost := round(((q0 * c0) + (new.qty * new.unit_cost)) / (q0 + new.qty), 2);
    update public.stock_items set unit_cost = new_cost where id = new.stock_item_id;
  end if;

  return new;
end $$;

drop trigger if exists trg_stock_move_avg_cost on public.stock_moves;
create trigger trg_stock_move_avg_cost
  before insert on public.stock_moves
  for each row execute function public.tg_stock_move_avg_cost();
