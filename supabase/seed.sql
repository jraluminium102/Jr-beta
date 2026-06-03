-- ============================================================
-- Seed data (ตัวอย่างไว้ทดสอบ) — รันหลังสมัคร user แล้ว
-- ============================================================

-- ตั้งให้ user คนแรกเป็น Owner (พี่นัท) — แก้อีเมลให้ตรง
-- update public.profiles set role = 'owner', full_name = 'พี่นัท'
-- where id = (select id from auth.users where email = 'nut@jr-aluminium.com');

insert into public.customers (name, job, address, tax_id, line_id, phone, contact_person) values
  ('คุณสมชาย รุ่งเรือง', 'บ้านทรายทอง', '13 พหลโยธิน 25 จตุจักร กทม. 10140', '1100xxxxxxxxx', '@somchai', '089-xxx-1234', 'คุณสมชาย'),
  ('คุณเอ ทุ่งครุ', 'ต่อเติมครัวหลังบ้าน', '88/12 ประชาอุทิศ ทุ่งครุ กทม.', '', '@aeyy', '081-xxx-5678', 'คุณเอ'),
  ('บจก. กรีนวิว', 'อาคารสำนักงาน 3 ชั้น', '200 รัชดาภิเษก ห้วยขวาง กทม.', '0105xxxxxxxxx', '@greenview', '02-xxx-9000', 'ฝ่ายจัดซื้อ');
