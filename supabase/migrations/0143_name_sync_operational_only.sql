-- ============================================================
-- 0143 · SYNC ชื่อลูกค้า = "เฉพาะเชิงปฏิบัติงาน" (jobs + queue) · เอกสารเป็นนามอิสระต่อใบ
--
-- กฎเจ้าของ (ย้ำหลายรอบ):
--   · "ชื่อลูกค้า *" ในคิวประเมิน = ชื่อที่โชว์ในผลิต/ติดตั้งเสมอ (= customers.name)
--   · เอกสาร (ใบเสนอ/บิล/ใบเสร็จ/ฯลฯ) จะออกชื่อไหนแล้วแต่เคส (บริษัท/ที่อยู่อื่น) → เป็น "นามออกบิล"
--     เก็บใน customer_snapshot ของใบนั้นเอง · ห้ามให้ rename ทะเบียนไปทับ
--
-- ปัญหาเดิม (0051/0071): rename customers.name → tg_sync_customer_name เขียน snapshot->>'name'
--   ของทุกเอกสารที่ name = ชื่อเดิม → พอเผลอตั้งชื่อบริษัทเป็นชื่อทะเบียน (บั๊กหัวเอกสาร)
--   ทริกเกอร์ทับ jobs/queue = ผลิตโชว์บริษัท + ชื่อคนเดิมหาย · และแม้แก้ทะเบียนคืน ก็ไปทับนามบริษัทบนบิลอีก
--
-- แก้: apply_customer_name ซิงก์ "เฉพาะ jobs + queue_entries" (ชื่อเชิงปฏิบัติงาน)
--   ไม่แตะ customer_snapshot ของเอกสารใด ๆ อีก → เอกสารคงนามที่เลือกไว้ต่อใบเสมอ
--   (แก้นามบนเอกสาร = ผ่านปุ่ม "แก้หัวเอกสาร" ของใบนั้นเท่านั้น)
-- idempotent · เจ้าของรัน
-- ============================================================

create or replace function public.apply_customer_name(p_id bigint, p_old_name text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- เชิงปฏิบัติงาน: customer_name = ชื่อลูกค้าเสมอ (ไม่ใช่นามบิล) → ตามชื่อทะเบียน
  update public.jobs set customer_name = p_name
   where customer_id = p_id and customer_name is distinct from p_name;
  update public.queue_entries set customer_name = p_name
   where customer_id = p_id and customer_name is distinct from p_name;

  -- ⚠ เอกสารทั้งหมด (quotations/billing_notes/receipts/production_orders/warranties/boqs)
  --   ไม่ซิงก์ชื่อจาก rename ทะเบียนอีกต่อไป — นามบนเอกสาร = นามออกบิลของใบนั้น (customer_snapshot)
  --   แก้ผ่าน "แก้หัวเอกสาร" ของใบนั้นเท่านั้น (p_old_name เก็บไว้เพื่อความเข้ากันได้ของ signature)
  perform p_old_name;
end $$;
