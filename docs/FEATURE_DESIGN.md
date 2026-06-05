# FEATURE_DESIGN — ดีไซน์สุดท้าย 3 ฟีเจอร์ (ผ่าน expert + user จำลอง)

> หลักการ: **ไม่ rewrite** — เกาะ `jobs`/reuse `issues/customers/quotations/next_document_code/has_role/can_write` · migration idempotent · ไม่แตะ enum/trigger/RPC เดิม

## ฟีเจอร์ 1 — หน้าจัดการงานเขียนแบบ (Designer board)
**Gantt decision:** มุมมองหลัก = **Board (Kanban) 5 คอลัมน์** (รอเริ่ม→กำลังเขียน→รอลูกค้าคอนเฟิร์ม→แก้แบบ→เสร็จ) · **Gantt = แถบ timeline อ่านอย่างเดียวต่อคน** (tab รอง) — เพราะทีมเล็ก งานแบบไม่มี dependency ซับซ้อน สิ่งที่อยากเห็นคือ "ใครงานล้น/งานไหนค้างนาน" ไม่ใช่ critical path

- **reuse:** `jobs.designer_id/design_start/design_end` (มีอยู่แล้ว!) + `current_stage` (ช่วง 3–7 = งานแบบ)
- **NEW บน jobs:** `design_due_date date`, `design_state design_state_t`, `design_revise_count smallint`
- **enum NEW:** `design_state_t` = NOT_STARTED/DRAWING/PENDING_CUSTOMER/REVISING/DONE
- **RPC:** `set_design_state(job,state,note)` — นับ revise, set design_end, log jsonb
- **KPI:** งานในมือ/คน · เลยกำหนด · รอบเฉลี่ย (end−start) · จำนวนรอบแก้แบบ
- **API:** `GET/PATCH /api/designer`, `GET /api/designer/timeline` · reuse `POST /api/issues`
- migration `0016_designer_board.sql`

## ฟีเจอร์ 2 — หน้า BOQ (ตัดประกอบอลูมิเนียม)
**Decision:** scaffold เต็มตาราง + ออกรหัส แต่ **สูตรตัด/optimize = เฟสหลัง** (MVP = ลิสต์ของที่ต้องสั่ง/ตัดต่องาน + พิมพ์)

- **NEW tables:** `boqs` (code, job_id, quotation_id, customer_snapshot, status) + `boq_items` (category, name, spec, qty, unit, stock_item_id)
- **enum NEW:** `boq_status_t` = draft/confirmed/ordered
- **reuse:** `next_document_code('BQ')`, `quotations/quotation_items` (prefill), `stock_items` (FK nullable), `production_orders.items` pattern
- **API:** `GET/POST /api/boq`, `GET/PATCH /api/boq/[id]`, `PUT /api/boq/[id]/items`
- migration `0017_boq.sql`

## ฟีเจอร์ 3 — Redesign ระบบปัญหางาน (track ให้แอดมิน)
**Decision:** ไม่สร้างระบบใหม่ — redesign "หน้า track" + เพิ่ม field ที่ขาด (ฐาน `issues` พร้อม 90%)

- **NEW บน issues:** `due_date date`, `priority smallint`
- **NEW table:** `issue_updates` (issue_id, note, new_status, author_id) — timeline ความคืบหน้า
- **reuse:** `issues` ทั้งก้อน (code/phase/type/severity/owner_id/auto-create), guard "ต้องระบุวิธีแก้ก่อนปิด"
- **หน้าหลัก:** ตาราง track + filter (status/severity/phase/owner/เลย due) + SLA badge (อายุ/เลยกำหนด) + แถบสรุปแอดมิน
- **API:** ขยาย `GET/PATCH /api/issues` + `POST/GET /api/issues/[id]/updates`
- migration `0018_issue_tracking.sql`

## สรุป schema NEW
| ฟีเจอร์ | เพิ่มบนตารางเดิม | ใหม่ |
|---------|------------------|------|
| Designer board | jobs: design_due_date, design_state, design_revise_count | enum design_state_t + RPC set_design_state |
| BOQ | — | tables boqs/boq_items + enum boq_status_t |
| Issue tracking | issues: due_date, priority | table issue_updates |
