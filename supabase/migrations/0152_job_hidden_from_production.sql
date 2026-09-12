-- 0152 — ซ่อนงานออกจากหน้าผลิต (soft delete + กู้คืนได้) · เจ้าของสั่ง 12 ก.ย.69
--   "ในหน้าผลิตชอบมีลูกค้าโผล่มาเอง อยากกดลบออกได้ แล้วเอากลับมาได้เผื่อลบผิด"
--   ต่างจากปุ่ม 'ลบงานทิ้ง' (0149/DELETE) ที่ลบถาวร — อันนี้แค่ซ่อน ข้อมูลอยู่ครบ กดคืนได้
--   scope: ซ่อนจาก "หน้าผลิต" อย่างเดียว (ไม่ยกเลิกงาน ไม่แตะเงิน/เอกสาร)
alter table public.jobs
  add column if not exists hidden_from_production boolean not null default false,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles(id);

comment on column public.jobs.hidden_from_production is
  'true = ซ่อนงานนี้จากหน้าผลิต (soft delete · กู้คืนได้) — ไม่กระทบสถานะงาน/เงิน/เอกสาร';
