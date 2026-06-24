-- 0058: ให้ role CHANG เขียน production_sets ได้ (กดเช็คลิสต์ช่าง)
-- รันหลัง 0057 commit แล้ว (ค่า 'CHANG' พร้อมใช้)
-- production_sets อ่านได้อยู่แล้ว (read = is_active) · เพิ่มเฉพาะสิทธิ์เขียน
drop policy if exists production_sets_write on public.production_sets;
create policy production_sets_write on public.production_sets for all
  using (public.has_role('ADMIN','PRODUCTION','CHANG'))
  with check (public.has_role('ADMIN','PRODUCTION','CHANG'));

notify pgrst, 'reload schema';
