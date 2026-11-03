-- ============================================================
-- 0167 · จัดคิวอัตโนมัติ: กันจับคู่คิวเช้า-บ่ายที่ไกลกัน (เจ้าของ 3 พ.ย.69 "เรื่องระยะทางบัคมาตลอด แก้ให้หายขาด")
--   เคส: นนทบุรี (วัดเขมาฯ) → สาทร เส้นตรง 11 กม. ORS บอก ~30 นาที (ถนนโล่ง) < 45 → ระบบจับคู่ให้ ทั้งที่รถติดจริง 1 ชม.+
--   กติกาใหม่ 2 ชั้น (ต้องผ่านทั้งคู่):
--     1) max_pair_km   = ระยะเส้นตรงระหว่าง 2 หน้างานในวันเดียวกัน ห้ามเกิน (ค่าเริ่มต้น 8 กม.)
--     2) traffic_factor = ตัวคูณเวลาขับจาก ORS ให้ใกล้รถติดกรุงเทพ (1.5) แล้วค่อยเทียบ max_pair_min (45 นาที)
--   ปรับได้:  update queue_settings set max_pair_km = 10 where id = 1;
-- ============================================================
alter table public.queue_settings
  add column if not exists max_pair_km    numeric not null default 8,
  add column if not exists traffic_factor numeric not null default 1.5;

notify pgrst, 'reload schema';
