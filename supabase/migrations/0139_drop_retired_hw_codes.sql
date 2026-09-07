-- 0139: ลบรหัสอุปกรณ์ที่เจ้าของสั่งเลิกใช้ (ย้ายไปผูกรหัสใหม่ในสูตรเรียบร้อยแล้ว)
--
-- เจ้าของสั่ง 4 ก.ย.69 — ทุกตัวย้ายในสูตรแล้ว ไม่มีที่ไหนอ้างถึงอีก (เทส verify-hw-cutlist คุมไว้)
--   JR00228 ล้อ 27        → JR00576      JR00242 สักหลาด → JR00794
--   JR00195 ชุดกลอนใบลอง  → JR00596+598  JR00226 น็อต    → JR00864
--   JR00267 ฉากประคองมุม  → JR00480      JR00244 ยาง     → JR00771
--   JR00200 ฉากประกอบมุม  → JR00480      JR00276         → JR00592
--   JR00243               → JR00564
--
-- ปลอดภัย: ลบเฉพาะแถวที่ ยอดคงเหลือ = 0 · ไม่เคยมีความเคลื่อนไหวในสมุดสโตร์ · ไม่เคยเข้าใบตัด/BOQ
--   แถวที่มียอดหรือมีประวัติ จะไม่ถูกลบ แต่จะขึ้นในตารางสรุปท้ายสุดให้เห็นว่าเหลืออะไร

begin;

create temp table _retired(sku text primary key) on commit drop;
insert into _retired(sku) values
  ('JR00228'), ('JR00195'), ('JR00242'), ('JR00226'), ('JR00244'),
  ('JR00267'), ('JR00200'), ('JR00276'), ('JR00243');

create temp table _dead on commit drop as
select s.id, s.sku, s.name, s.qty_on_hand
from public.stock_items s
join _retired r on r.sku = s.sku
where coalesce(s.qty_on_hand, 0) = 0
  and not exists (select 1 from public.stock_moves m where m.stock_item_id = s.id)
  and not exists (select 1 from public.boq_items b where b.stock_item_id = s.id);

delete from public.stock_prices p using _dead d where p.stock_item_id = d.id;
delete from public.stock_items s using _dead d where s.id = d.id;

select 'ลบแล้ว' as สถานะ, count(*) as จำนวน,
       coalesce(string_agg(sku || ' ' || name, ' · ' order by sku), '-') as รายการ
from _dead
union all
select 'ลบไม่ได้ (ยังมียอด / เคยเบิก / เคยเข้าใบตัด)', count(*),
       coalesce(string_agg(s.sku || ' ' || s.name || ' (คงเหลือ ' || coalesce(s.qty_on_hand, 0) || ')', ' · ' order by s.sku), '-')
from public.stock_items s
join _retired r on r.sku = s.sku
where not exists (select 1 from _dead d where d.id = s.id);

commit;
