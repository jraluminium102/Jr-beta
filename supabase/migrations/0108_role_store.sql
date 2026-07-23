-- 0108_role_store — เพิ่ม role 'STORE' (พนักงานสโตร์ · ทำงานสต็อกได้ แต่ไม่เห็นราคา/ต้นทุน)
-- ⚠ ต้องแยก migration จากที่ "ใช้" ค่า enum นี้ (Postgres: ใช้ค่า enum ใหม่ใน transaction เดียวกับ ADD VALUE ไม่ได้)
--    → RLS ที่อ้าง 'STORE' อยู่ใน 0109 (รันหลังไฟล์นี้ commit แล้ว) · precedent = 0057 (CHANG)
alter type role_t add value if not exists 'STORE';
