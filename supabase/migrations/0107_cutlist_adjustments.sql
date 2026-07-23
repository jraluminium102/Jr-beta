-- 0107_cutlist_adjustments — ปรับรายการตัดสต็อกใบตัด (ต่างจาก BOQ) ก่อนตัดจริง
-- ช่าง/ออฟฟิศ ลดเส้นที่ใช้เศษ หรือ เพิ่มอลู/อุปกรณ์ (งานดัดแปลง) → ตัดสต็อกตามที่ปรับ + รีมาร์กส่วนต่าง
--
-- โครง JSON (array ของบรรทัดปรับ · อิง stock_item_id เพื่อความแม่นยำ):
--   [{ id: string,          -- uid ฝั่ง client
--      sid: number,         -- stock_item_id (แม่น ไม่ต้องเดารหัส+สี)
--      kind: 'alu'|'hw',    -- ไว้โชว์/จัดกลุ่ม
--      name: string, unit?: string, sku?: string, img?: string,
--      qty: number,         -- + = เพิ่ม · − = ลด (ใช้เศษ)
--      note?: string,       -- เหตุผล (ใช้เศษ / ดัดแปลง ...)
--      fromBoq?: boolean }] -- true = ลดจากบรรทัด BOQ ที่คิดมา
alter table public.cutlists
  add column if not exists adjustments jsonb not null default '[]'::jsonb;
