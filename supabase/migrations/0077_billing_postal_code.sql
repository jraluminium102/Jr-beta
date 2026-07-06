-- 0077: รหัสไปรษณีย์แยกช่องในนามออกบิล (ตามที่เจ้าของขอ — ฟอร์มนิติบุคคลแบบในรูป)
-- เก็บแยกจาก address เพื่อออกบิล/หัวเอกสารได้ครบ

alter table public.billing_profiles
  add column if not exists postal_code text not null default '';

-- คิวงานเก็บรหัสไปรษณีย์ด้วย (เผื่อ autofill นามออกบิลจากคิว)
alter table public.queue_entries
  add column if not exists bill_postal text;
