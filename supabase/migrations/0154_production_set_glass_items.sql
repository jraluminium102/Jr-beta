-- ============================================================
-- 0154 · กระจกหลายแผ่นต่อชุด (เจ้าของสั่ง 24 ก.ย.69)
--   เดิม 1 ชุดมีสเปคกระจก/สั่ง/ใส่ อย่างละค่าเดียว → ชุดที่มีกระจกหลายแบบบันทึกแยกไม่ได้
--   เพิ่ม glass_items (jsonb array) = แหล่งจริงต่อแผ่น: [{spec, order, installed}]
--   คอลัมน์เดิม glass_spec/glass_order/glass_installded คงไว้เป็น "roll-up ระดับชุด"
--     → derivePhase / setIsDone / ตารางช่าง / install-gate ใช้ glass_installed เหมือนเดิม ไม่ต้องแก้
--   API เป็นคนคิด roll-up จาก glass_items ทุกครั้งที่บันทึก (แหล่งเดียว ไม่ชนกัน)
-- idempotent · เจ้าของรัน
-- ============================================================

alter table public.production_sets
  add column if not exists glass_items jsonb not null default '[]'::jsonb;

-- backfill: ชุดเดิมที่มี glass_spec แต่ยังไม่มี glass_items → ตั้งเป็น 1 แผ่นจากค่าเดิม
--   (แยกหลายบรรทัดถ้าเคยกรอกกระจกหลายแบบคั่น \n ในช่องเดิม)
update public.production_sets s
   set glass_items = (
     select coalesce(jsonb_agg(jsonb_build_object(
              'spec', trim(line),
              'order', coalesce(s.glass_order, ''),
              'installed', coalesce(s.glass_installed, '')
            )), '[]'::jsonb)
     from unnest(string_to_array(s.glass_spec, E'\n')) as line
     where trim(line) <> ''
   )
 where coalesce(s.glass_spec, '') <> ''
   and (s.glass_items is null or s.glass_items = '[]'::jsonb);

notify pgrst, 'reload schema';
