-- 0076: ใบเสนอราคา — หัวข้อชุด (group heading) ต่อรายการ + เงื่อนไขท้ายใบแก้ได้ต่อใบ
-- พาริตี้เครื่องคิดราคาเดิม R3.9 (ตั้งชื่อชุด + แก้เงื่อนไขในใบ)

-- หัวข้อชุด/ตำแหน่ง ต่อรายการ (เว้นว่าง = ไม่มีหัวข้อ) — ใบพิมพ์จัดกลุ่มตามค่านี้
alter table public.quotation_items
  add column if not exists group_label text not null default '';

-- เงื่อนไขท้ายใบแก้ได้ต่อใบ (null = ใช้ค่ามาตรฐานจาก quote-constants.ts)
alter table public.quotations
  add column if not exists conditions_work  jsonb,
  add column if not exists conditions_quote jsonb;
