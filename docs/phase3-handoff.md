# เฟส 3 — เช็คลิสต์ + ใบปะหน้า · Handoff สำหรับตรวจ/ทำต่อ

อัปเดต: 2026-06-05 · อ่านคู่กับ memory: `roadmap-rbac-features.md`, `quote-wip.md`

## สถานะ: สร้างโครงไว้แล้ว แต่ design ใบปะหน้า "ผิด" ต้องรื้อ · ยังไม่ commit · ยังไม่ผ่าน QA

---

## ✅ ทำไปแล้ว (ไฟล์ที่มีอยู่ใน working tree)

### Migration (ฐานข้อมูล)
- `supabase/migrations/0012_checklists.sql` — 3 ตาราง:
  - `checklist_templates` (target_role[], product_keys[])
  - `checklist_items` (condition_rule jsonb, highlight)
  - `job_checklists` (เก็บสถานะติ๊ก)
  - ⚠️ ยังไม่ apply

### API (BFF)
- `src/app/api/checklists/templates/route.ts` — CRUD template
- `src/app/api/checklists/templates/[id]/route.ts`
- `src/app/api/checklists/templates/[id]/items/route.ts` — items ใน template
- `src/app/api/checklists/job/[orderId]/route.ts` — เช็คลิสต์ของ order

### Engine
- `src/lib/checklist/engine.ts` — ประมวล condition_rule → ไฮไลต์

### UI
- `src/app/(app)/(oms)/settings/checklists/page.tsx` + `ChecklistAdmin.tsx` — หน้า admin จัดการ template
- `src/app/(app)/production-orders/[id]/checklist/page.tsx` + `ChecklistView.tsx` — หน้าเช็คลิสต์ของงาน
- `src/app/(app)/production-orders/[id]/cover/page.tsx` + `PrintButtons.tsx` — หน้าใบปะหน้า (print)

### ไฟล์ที่ถูกแก้ (modified)
- `src/lib/rbac.ts` — เพิ่ม resource `checklists`
- `src/components/Shell.tsx` — เพิ่มเมนู
- `src/components/Icon.tsx` — เพิ่ม icon
- `src/lib/database.types.ts` — types ตารางใหม่
- `src/app/(app)/production-orders/[id]/page.tsx` — ลิงก์ไปเช็คลิสต์/ใบปะหน้า

---

## 🔴 ปัญหา design ที่ต้องแก้ (มติพี่นัท)

agent รอบแรกทำ **"ใบปะหน้า = เช็คลิสต์กรองตาม role"** ซึ่ง **ผิด** — พี่นัทแยกชัดว่า 2 อย่างนี้คนละประเภท:

| | **เช็คลิสต์** | **ใบปะหน้า (cover sheet)** |
|---|---|---|
| เพื่อ | เตือน **เซลล์หน้างาน** คุยรายละเอียดกับลูกค้าให้ครบทุกสินค้า | **คนสั่งของ / ทีมผลิต** |
| คือ | tick-list โต้ตอบ (ติ๊กเอง) ผูก template | **สรุปอัตโนมัติจากข้อมูลออเดอร์** |
| เนื้อหา | รายการที่ต้องยืนยันกับลูกค้า | ของต้องสั่งซื้อ/จัดหาพิเศษ/**สีอลูมิเนียม/สีกระจก**/อื่นๆ เพื่อเตรียมก่อนผลิต/ไปหน้างาน |
| ที่มา | template ที่ admin ตั้ง | **ดึงจาก order items อัตโนมัติ** (ไม่ใช่ tick-list) |

→ **ใบปะหน้าต้องรื้อใหม่** ให้เป็น report สรุปจากข้อมูลออเดอร์ (สี/กระจก/ออปชั่นพิเศษ/มอเตอร์/งานเร่ง/ของขาด) ไม่ใช่ checklist กรอง role

---

## 📋 เนื้อเช็คลิสต์ที่ QA ร่างไว้แล้ว (ใช้เป็นตัวตั้งต้น seed)
QA ออกแบบไว้ครบ (ในประวัติแชทเฟส 1-3 วันที่ 2026-06-04):
- เช็คลิสต์ช่างวัดหน้างาน แยกตามกลุ่มสินค้า G1-G7 (วัดช่องเปิด/ชนิดผนัง/ทิศบาน ฯลฯ)
- คำเตือนเซลล์ต่อสินค้า (ยืนยันสีอลู/กระจก/ทิศบาน/มุ้ง ฯลฯ)
- เงื่อนไขไฮไลต์ผลิต (หลายสี→แดง, เทมเปอร์→เหลือง, งานเร่ง→แดง)
- edge case ที่ควรบล็อก (ยังไม่ระบุทิศบาน→ห้ามบันทึก, glasshouse ไม่ครบ 8 ด้าน→บล็อก)

---

## ⚠️ กฎกันชน (สำคัญ)
- **ห้าม commit ปนกับโซน A (ใบเสนอราคา)** — โซน A commit แล้ว (`ad0112b`)
- ทำเฉพาะไฟล์เฟส 3 (src/app/.../checklists, cover, api/checklists, lib/checklist, migration 0012, + rbac/Shell/Icon/database.types)
- **git แตก 2 สาย**: local กับ origin/main (20+ commit อีกสาย) ต่างกันมาก — เช็ค `git log origin/main..HEAD` ก่อน, อย่าเพิ่ง merge main
- commit เฟส 3 แล้ว push branch แยก (เช่น `feat/phase3-checklist`) กันหาย ไม่ push main
- ควร QA เทียบ business rule + RBAC ก่อนปิด (เหมือนเฟส 1-2 ที่ QA จับบั๊ก/ช่องโหว่ได้ทุกรอบ)
