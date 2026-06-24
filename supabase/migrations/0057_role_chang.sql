-- 0057: เพิ่ม role "CHANG" (ช่างผลิต — เห็นแค่หน้าตารางผลิต กดเช็คลิสต์)
-- ต้องแยกไฟล์จากการใช้งานค่า enum (Postgres ห้ามใช้ค่า enum ใหม่ใน transaction เดียวกับที่ ADD)
ALTER TYPE role_t ADD VALUE IF NOT EXISTS 'CHANG';
