-- ============================================================
-- JR Beta — Seed (ตัวอย่าง dev) · รันหลัง migrations
-- ใส่ผ่าน service role / SQL editor (ข้าม RLS)
-- หมายเหตุ: profiles สร้างอัตโนมัติเมื่อสมัคร user (trigger on_auth_user_created)
--   ตั้ง role คนแรกเป็น ADMIN ด้วยคำสั่งท้ายไฟล์ (แก้อีเมลให้ตรง)
-- ============================================================

-- ---------- OMS: เลข running เริ่มต้น + งานตัวอย่าง ----------
insert into public.job_sequence(year, last_seq) values (2026, 0)
  on conflict (year) do nothing;

insert into public.jobs (customer_name, customer_tel, customer_area, channel, assess_date, net_amount, status, deposit_amount, deposit_date)
values
  ('คุณกฤติกา','081-234-5678','ภูเก็ต','LINE','2026-01-12', 85000, 'COMPLETED', 42500, '2026-01-20'),
  ('คุณสมชาย','089-111-2222','กรุงเทพฯ','FACEBOOK','2026-02-03', 128000, 'DEPOSITED', 64000, '2026-02-10'),
  ('คุณวีระ','062-333-4444','นนทบุรี','INSTAGRAM','2026-02-18', 54000, 'DEPOSITED', 27000, '2026-02-25'),
  ('คุณนภา','095-555-6666','ภูเก็ต','LINE','2026-03-01', 210000, 'DEPOSITED', 105000, '2026-03-08'),
  ('คุณอรุณี','061-999-0000','กรุงเทพฯ','INSTAGRAM','2026-03-22', 96000, 'QUOTE_SENT', null, null),
  ('คุณพิชัย','088-121-3434','สมุทรปราการ','LINE','2026-04-02', null, 'PENDING_QUOTE', null, null);

-- ---------- บัญชี: ลูกค้าตัวอย่าง ----------
insert into public.customers (name, job, address, tax_id, line_id, phone, contact_person) values
  ('คุณสมชาย รุ่งเรือง', 'บ้านทรายทอง', '13 พหลโยธิน 25 จตุจักร กทม. 10140', '1100xxxxxxxxx', '@somchai', '089-xxx-1234', 'คุณสมชาย'),
  ('คุณเอ ทุ่งครุ', 'ต่อเติมครัวหลังบ้าน', '88/12 ประชาอุทิศ ทุ่งครุ กทม.', '', '@aeyy', '081-xxx-5678', 'คุณเอ'),
  ('บจก. กรีนวิว', 'อาคารสำนักงาน 3 ชั้น', '200 รัชดาภิเษก ห้วยขวาง กทม.', '0105xxxxxxxxx', '@greenview', '02-xxx-9000', 'ฝ่ายจัดซื้อ');

-- ตั้ง role ให้ user คนแรกเป็น ADMIN (แก้อีเมลให้ตรง แล้วรันบรรทัดนี้)
-- update public.profiles set role='ADMIN', full_name='พี่นัท' where email = 'you@jr-aluminium.com';
