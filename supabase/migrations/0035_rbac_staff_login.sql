-- ============================================================
-- JR Beta — 0035 RBAC ให้พนักงานทุกตำแหน่ง login ทำงานตัวเองได้
-- least-privilege: เปิดเฉพาะที่แต่ละ role ต้องใช้จริง
-- idempotent (create or replace + drop/create policy) · รันหลัง 0034
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) promote_queue_to_job — เพิ่ม SALES เข้า guard (เซลล์ปิดคิว→งานเองได้)
--    คงเนื้อ logic เดิมทุกบรรทัด เปลี่ยนแค่บรรทัด role guard
-- ──────────────────────────────────────────────────────────────
create or replace function public.promote_queue_to_job(p_queue_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.queue_entries%rowtype; v_cust bigint; v_job uuid; has_cust boolean;
begin
  -- [0035] ผ่อนจาก ADMIN เดี่ยว → ADMIN/SALES (เซลล์ปิดคิวเป็นงานเองได้)
  if not public.has_role('ADMIN','SALES') then raise exception 'forbidden: ต้องเป็น ADMIN หรือ SALES'; end if;
  select * into q from public.queue_entries where id = p_queue_id;
  if q.id is null then raise exception 'ไม่พบคิว %', p_queue_id; end if;
  if q.job_id is not null then return q.job_id; end if;

  has_cust := to_regclass('public.customers') is not null;
  if has_cust then
    if coalesce(q.tel,'') <> '' then
      execute 'select id from public.customers where phone = $1 limit 1' into v_cust using q.tel;
    end if;
    if v_cust is null then
      execute 'insert into public.customers (name, address, line_id, phone) values ($1,$2,$3,$4) returning id'
        into v_cust using q.customer_name, coalesce(q.address,''), coalesce(q.line_contact,''), coalesce(q.tel,'');
    end if;
  end if;

  insert into public.jobs (customer_name, customer_tel, customer_area, channel,
                           assess_date, status, current_stage, customer_id, queue_entry_id, year, sequence)
  values (q.customer_name, q.tel, q.address, 'OTHER',
          coalesce(q.queue_date, current_date), 'LEAD', 2, v_cust, q.id, 0, 0)
  returning id into v_job;

  update public.queue_entries set job_id = v_job where id = q.id;
  return v_job;
end $$;

-- ──────────────────────────────────────────────────────────────
-- 2) issues RLS write — เพิ่ม DESIGNER (ช่างแบบแจ้งปัญหาแบบได้)
--    0003 เดิมมี ADMIN/PRODUCTION/INSTALLER/SALES → เพิ่ม DESIGNER
-- ──────────────────────────────────────────────────────────────
drop policy if exists issues_write on public.issues;
create policy issues_write on public.issues
  for all
  using  (public.has_role('ADMIN','SALES','PRODUCTION','INSTALLER','DESIGNER'))
  with check (true);

-- ──────────────────────────────────────────────────────────────
-- 3) queue_entries RLS write — เพิ่ม SALES เฉพาะคิวของตัวเอง
--    ADMIN ทำได้ทุกคิว (เหมือนเดิม)
--    SALES insert/update/delete ได้เฉพาะคิวที่ sales_id ↔ profile_id = auth.uid()
-- ──────────────────────────────────────────────────────────────
drop policy if exists queue_entries_write on public.queue_entries;

-- ADMIN: ทำได้ทุกแถว
create policy queue_entries_write_admin on public.queue_entries
  for all
  using  (public.has_role('ADMIN'))
  with check (public.has_role('ADMIN'));

-- SALES: เฉพาะคิวที่ sales_id ผูกกับบัญชีตัวเอง
--   INSERT: sales_id ต้องเป็น queue_sales ที่ profile_id = auth.uid()
--   UPDATE/DELETE: ตรวจที่ using clause (แถวที่จะแตะต้องเป็นของตัวเอง)
create policy queue_entries_write_sales on public.queue_entries
  for all
  using (
    public.has_role('SALES') and
    exists (
      select 1 from public.queue_sales s
      where s.id = queue_entries.sales_id
        and s.profile_id = auth.uid()
    )
  )
  with check (
    public.has_role('SALES') and
    exists (
      select 1 from public.queue_sales s
      where s.id = queue_entries.sales_id
        and s.profile_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 4) warranties RLS write — ปรับจาก can_write() (ADMIN/SALES/ACCOUNTING)
--    เป็น has_role(ADMIN/SALES/PRODUCTION/INSTALLER) เพื่อให้ช่างออกใบรับประกันได้
--    read ยังคงเป็น is_active() (ทุก login อ่านได้เหมือนเดิม)
-- ──────────────────────────────────────────────────────────────
drop policy if exists "write warranties" on public.warranties;
create policy "write warranties" on public.warranties
  for all
  to authenticated
  using  (public.has_role('ADMIN','SALES','PRODUCTION','INSTALLER'))
  with check (public.has_role('ADMIN','SALES','PRODUCTION','INSTALLER'));
