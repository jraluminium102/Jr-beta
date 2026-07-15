-- 0095: แก้บั๊ก "ใบเสร็จยอดไม่ตรงใบวางบิล" (เจ้าของแจ้ง 15 ก.ค.69) — บัญชีตรวจ+เคาะแล้ว
--
-- ปัญหา: ใบเสร็จอ่าน vat_rate จาก jobs.vat_rate ซึ่งเขียนครั้งเดียวตอนสร้างใบเสนอ ไม่เคยอัปเดต
--        กด "แก้ VAT/ส่วนลด" ที่ใบวางบิล → billing_notes.vat_rate เปลี่ยน แต่ใบเสร็จยังใช้ค่าเก่าจากงาน
--        → ฐาน/VAT บนใบเสร็จไม่ตรงใบวางบิลทั้งก่อนและหลัง VAT

-- ── (1) billing_notes.vat_rate_set — "อัตรา VAT ของใบนี้ยืนยันแล้ว" ──
-- ต้องแยกจาก has_tax_breakdown เพราะ 2 ธงคนละหน้าที่ (บัญชีเตือน: เอามารวมกัน = กับระเบิด):
--   has_tax_breakdown = "subtotal เป็นยอดก่อน VAT จริง ตรง quotations.subtotal" → คุม UI (ปุ่มแก้ VAT/footer)
--   vat_rate_set      = "อัตรา VAT ยืนยันแล้ว"                                  → คุมใบเสร็จ
-- เดิม "แก้ยอดบิล" (mode A) ล้าง has_tax_breakdown=false → ใบเสร็จ fallback jobs.vat_rate → VAT 7% กลับมาเงียบ ๆ
-- ทั้งที่ผู้ใช้เพิ่งติ๊ก VAT ออก · แยกคอลัมน์แล้ว mode A จะ carry forward การตัดสินใจ VAT ได้โดยไม่โกหกเรื่อง subtotal
alter table public.billing_notes
  add column if not exists vat_rate_set boolean not null default false;

-- backfill: ใบที่ 0079/0080 มาร์คว่ามียอดแยกจริง = เคยยืนยันอัตรา VAT แล้ว
-- → ใบเสร็จที่ออกถูกอยู่แล้ววันนี้ "ไม่เปลี่ยนพฤติกรรมแม้แต่ใบเดียว" (ใบเก่า/import ยัง fallback jobs เหมือนเดิม)
update public.billing_notes set vat_rate_set = true where has_tax_breakdown = true;

comment on column public.billing_notes.vat_rate_set is
  'อัตรา VAT ของใบนี้ยืนยันแล้ว (ผู้ใช้ติ๊กเอง) → ใบเสร็จใช้ vat_rate ของใบ · false = ใบเก่า/import ให้ fallback jobs.vat_rate';

-- ── (2) receipts: snapshot ฐาน/หัก ณ ที่จ่าย ณ วันออกใบ ──
-- เอกสารภาษีต้อง snapshot ทุกตัวเลข ณ วันออก — สูตรเปลี่ยนวันหลัง ใบเก่าต้องพิมพ์ออกมาเหมือนเดิมเป๊ะ
-- เดิมหน้าพิมพ์คำนวณเอง (amount − vat_amt) → พอมีหัก ณ ที่จ่ายจะได้ฐานผิด (VAT ขายขาด กระทบ ภ.พ.30)
alter table public.receipts
  add column if not exists base_amt numeric(14,2),          -- ฐานภาษี (ก่อน VAT) · null = ใบเก่า → fallback amount − vat_amt
  add column if not exists wht_rate numeric(5,2) not null default 0,
  add column if not exists wht_amt  numeric(14,2) not null default 0;

comment on column public.receipts.base_amt is
  'ฐานภาษีก่อน VAT ณ วันออกใบ (snapshot) · null = ใบเก่าก่อน 0095 → หน้าพิมพ์ fallback amount − vat_amt (ใบเก่า wht=0 จึงตรงพอดี)';
comment on column public.receipts.wht_amt is
  'หัก ณ ที่จ่าย (memo ใต้ "จำนวนเงินรวมทั้งสิ้น") · amount/net = เงินสดรับจริงเสมอ · รวมทั้งสิ้น = amount + wht_amt';

-- ⚠ ไม่ backfill base_amt/wht ของใบเก่า โดยตั้งใจ:
--    ใบกำกับภาษีที่ออก+ส่งลูกค้าแล้วเป็นเอกสารตามกฎหมาย — ห้ามแก้ตัวเลขย้อนหลังในระบบ
--    (สำเนาจะไม่ตรงต้นฉบับที่ลูกค้าถือ และลูกค้าใช้เครดิตภาษีซื้อไปแล้ว)
--    ใบเก่าที่ vat_rate ผิด → ต้องยกเลิก+ออกใหม่ ตามคำแนะนำผู้สอบบัญชี ไม่ใช่ UPDATE ทับ
