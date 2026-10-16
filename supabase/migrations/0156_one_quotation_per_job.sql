-- 0156 · 1 งาน = 1 ใบเสนอที่ใช้งานอยู่ (กันหลายออเดอร์ปนงานเดียวตั้งแต่ต้นทาง)
--
-- เจ้าของสั่ง 16 ต.ค.69: "ไม่ต้องการให้มันปนกันแต่แรก ระบบควรแยกให้เลยตั้งแต่สร้างใบเสนอราคา"
--   ต้นเหตุเดิม: ผูกใบเสนอใบที่ 2 เข้างานเดิมได้ (ปุ่มยืนยันผูก / ใบเบาเช็คลิสต์ไม่ถูกยกเลิก)
--   → ผลิต/ใบปะหน้า/ใบตัด ต้องเดาว่าใบไหน → ชุดผลิตปนออเดอร์
--   แอป (POST /api/quotations) บังคับกติกานี้แล้ว · trigger นี้คือรั้วชั้นสุดท้าย กันทุกทางเข้า (SQL/เครื่องมืออื่น)
--
-- เช็คเฉพาะตอน "ใบเข้างาน" เท่านั้น: insert ใหม่ · ย้ายงาน (job_id เปลี่ยน) · กู้ใบที่ยกเลิกกลับมา
--   แก้ใบเดิม (Rev/หัวเอกสาร/เลื่อนสถานะ) ไม่เช็ค → งานเก่าที่มีหลายใบอยู่แล้ว (ข้อมูลก่อน 0156) ยังแก้ได้ตามปกติ
-- ทางที่ผ่านแน่: วางบิลสร้างงานใหม่ (งานว่าง) · แตกออเดอร์ 0129 (งานใหม่ว่าง) · ใบเบาเช็คลิสต์ (สร้างเมื่องานยังไม่มีใบ)
--
-- ⚠ ปิด trigger เก่า trg_quotation_link (0020): ใบเสนอที่ไม่มี job_id จะถูก "ยัดเข้างานล่าสุดของลูกค้า" อัตโนมัติ
--   = ต้นเหตุที่ปุ่ม "ออเดอร์ใหม่ (แยกงาน)" ถูกผูกกลับเข้างานเดิม (เคส QT2569090085 → JR2026-335 · 6 ต.ค.69)
--   แอปเลิกเดางานจากลูกค้าตั้งแต่ 24 ส.ค.69 แล้ว — ใบที่ไม่มีงาน จะได้งานใหม่ตอนวางบิล
-- idempotent · เจ้าของรัน
drop trigger if exists trg_quotation_link on public.quotations;

create or replace function public.tg_one_active_quotation_per_job()
returns trigger language plpgsql as $$
begin
  if NEW.job_id is null or NEW.status = 'cancelled' then
    return NEW;
  end if;
  -- แก้ใบเดิมที่อยู่ในงานเดิมอยู่แล้ว (ไม่ได้ย้ายงาน · ไม่ได้กู้จากยกเลิก) → ไม่เช็ค
  --   (if ซ้อน: ตอน INSERT ห้ามแตะ OLD)
  if TG_OP = 'UPDATE' then
    if OLD.job_id is not distinct from NEW.job_id and OLD.status <> 'cancelled' then
      return NEW;
    end if;
  end if;
  -- กัน 2 คำขอพร้อมกันใส่ใบเข้างานเดียวกัน
  perform pg_advisory_xact_lock(hashtext('one_quotation_per_job:' || NEW.job_id::text));
  if exists (
    select 1 from public.quotations q
     where q.job_id = NEW.job_id and q.id <> NEW.id and q.status <> 'cancelled'
  ) then
    raise exception 'ONE_QUOTATION_PER_JOB: งานนี้มีใบเสนอที่ใช้งานอยู่แล้ว (1 งาน = 1 ใบเสนอ) — แยกเป็นออเดอร์ใหม่ หรือยกเลิกใบเดิมก่อน';
  end if;
  return NEW;
end $$;

-- ชื่อขึ้นต้น zz = รันหลัง before-trigger ตัวอื่นเสมอ (เห็น job_id ค่าสุดท้าย)
drop trigger if exists trg_one_active_quotation_per_job on public.quotations;
drop trigger if exists trg_zz_one_active_quotation_per_job on public.quotations;
create trigger trg_zz_one_active_quotation_per_job
  before insert or update of job_id, status on public.quotations
  for each row execute function public.tg_one_active_quotation_per_job();
