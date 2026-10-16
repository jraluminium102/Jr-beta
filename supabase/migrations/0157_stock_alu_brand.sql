-- 0157 · stock_items.alu_brand — แบรนด์เส้นอลูที่ "เลือกเอง" ตอนเพิ่มวัสดุ
--
-- เจ้าของสั่ง 16 ต.ค.69: นำเข้าอลูใหม่ ต้องกดเลือกแบรนด์+สี แล้วล็อกเรต ฿/กก. ตามตารางเรตแบรนด์ (PB.ALU_BRAND)
--   เดิมสโตร์ไม่มีช่องเก็บแบรนด์ → ระบบเดาจากรหัส (B=SMS · F=Fuji · ชื่อกล่อง/ฉาก) → อลูรหัส JR ใหม่เดาไม่ได้
--   = ตกกอง "ซื้อเป็นเส้น" ไม่มีเรต · หน้าเรตอลูอัปเดตราคาไม่ถึง
-- ค่าว่าง ('') = ไม่ได้เลือก → ระบบยังเดาจากรหัส/ชื่อเหมือนเดิม (แถวเก่าไม่เปลี่ยนพฤติกรรม)
-- idempotent · เจ้าของรัน

alter table public.stock_items add column if not exists alu_brand text not null default '';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_items_alu_brand_chk') then
    alter table public.stock_items
      add constraint stock_items_alu_brand_chk check (alu_brand in ('', 'fuji', 'sms', 'market', 'fixed'));
  end if;
end $$;
