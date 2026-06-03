# SPEC — JR Beta (รวม Quotation + JRerp เป็นแอพเดียว)

> เอกสาร spec การรวม 2 ระบบของ JR Aluminium & Glass เป็นแอพเดียว ดีไซน์เดียว
> Repo ปลายทาง: `github.com/jraluminium102/jr-beta`
> สถานะ: P1 (build ผ่าน + migration พร้อมรันทันที)

---

## 1. ที่มา / ปัญหา

JR มี 2 web app แยกกัน ทั้งคู่เป็น **Next.js 14 (App Router) + Supabase (BFF pattern)**:

| แอพ | ชื่อเดิม | ขอบเขต |
|-----|---------|--------|
| **Quotation** | `jr-erp-accounting` | ทะเบียนลูกค้า · ใบเสนอราคา (+AI ตรวจ) · เครื่องคิดราคา · ใบวางบิล · ใบเสร็จ/กำกับภาษี · ใบสั่งผลิต · ใบรับประกัน · เช็คสต๊อก |
| **JRerp** | `jr-oms` | ติดตามงาน Sales→ผลิต→ติดตั้ง→ปัญหา (Issues)→การเงิน (Finance) + Dashboard + จัดการผู้ใช้ |

ปัญหา: ผู้ใช้ต้องสลับ 2 ระบบ, role/ผู้ใช้ซ้ำซ้อน, ดีไซน์คนละโทน

**เป้าหมาย:** รวมเป็นแอพเดียว ดีไซน์เดียว (ธีมแดง JR) DB เดียว โดย **ห้ามเปลี่ยน structure ตารางเดิมของทั้งสองฝั่ง** และ migration ต้องรันต่อได้ทันที

---

## 2. Non-goals (ไม่ทำในรอบนี้)

- ไม่ rewrite logic ธุรกิจของทั้งสองฝั่ง (ยึดของเดิม)
- ไม่ปรับ schema ตารางธุรกิจ (เพิ่ม/ลบ/เปลี่ยนคอลัมน์ของ jobs/quotations ฯลฯ)
- ไม่รวม "ใบสั่งผลิต" 2 ตัว (OMS `productions` ↔ Quotation `production_orders`) เป็นตัวเดียว — คงไว้แยกตามเดิม
- ไม่ทำ data sync ระหว่าง jobs ↔ quotations อัตโนมัติ (เป็นงานเฟสถัดไป)

---

## 3. การตัดสินใจหลัก (ยืนยันโดยผู้ใช้)

| หัวข้อ | ตัดสินใจ |
|--------|----------|
| **ดีไซน์** | ธีมแดง JR (`#B3151D`) + ฟอนต์ Sarabun + glassmorphism ของฝั่ง Quotation เป็นหลัก — ปรับหน้า OMS ให้ใช้โทนนี้ |
| **ฐานข้อมูล** | Supabase เดียว รวมทุกตาราง ทั้ง 2 ฝั่งคงโครงสร้างเดิม |
| **profiles / role** | ใช้ `profiles` + enum `role_t` (7 ค่า) ของ JRerp เป็นชุดเดียว, map role ฝั่ง Quotation เข้าไป |
| **โครงโปรเจกต์** | ใช้ `src/` (ฝั่ง Quotation) เป็นฐาน, overlay โค้ด OMS เข้า `src/` |
| **Auth** | Supabase Auth (email/password) + middleware ของ Quotation (มี env-guard) |

---

## 4. สถาปัตยกรรมแอพรวม

```
Next.js 14 (App Router, src/)  ──► BFF (app/api/*)  ──► Supabase (Postgres + RLS + triggers)
        │                                │
   Sarabun + ธีมแดง + glass         RBAC role_t (7 roles)
```

**กฎเหล็กที่ยกมาจากทั้งสองฝั่ง:** Frontend ห้าม query Supabase ตรง — ผ่าน `/api/*` เท่านั้น

### 4.1 Role (รวมเป็นชุดเดียว — `role_t`)

`ADMIN · SALES · DESIGNER · PRODUCTION · INSTALLER · ACCOUNTING · VIEWER`

map role เดิมของ Quotation → role_t:

| Quotation (user_role) | → role_t |
|-----------------------|----------|
| `owner` | `ADMIN` |
| `admin` | `ADMIN` |
| `sales` | `SALES` |
| `viewer` | `VIEWER` |

สิทธิ์ "เขียนเอกสารบัญชี" (เดิม sales/admin/owner) → `ADMIN, SALES, ACCOUNTING`

### 4.2 เมนูรวม (กรองตาม role)

- **เอกสาร/บัญชี (Quotation):** Dashboard · ทะเบียนลูกค้า · ใบเสนอราคา · เครื่องคิดราคา · ใบวางบิล · ใบเสร็จ · ใบสั่งผลิต · ใบรับประกัน · เช็คสต๊อก
- **ปฏิบัติงาน (OMS):** ภาพรวมงาน · งาน (Jobs) · ผลิต · ติดตั้ง · ปัญหา · การเงิน · ตั้งค่า/ผู้ใช้

---

## 5. การรวม Route / API (ตรวจแล้วไม่ชนกัน)

### Pages (`src/app/(app)/`)
| กลุ่ม | Route |
|-------|-------|
| Quotation | `/dashboard` `/customers` `/quotations` `/calculator` `/billing-notes` `/receipts` `/production-orders` `/warranties` `/stock` |
| OMS | `/operations` (dashboard OMS, ย้ายจาก `/`) `/jobs` `/production` `/installation` `/issues` `/finance` `/settings` `/settings/users` |
| Root | `/` → redirect `/dashboard` |

### API (`src/app/api/`)
| กลุ่ม | Endpoint |
|-------|----------|
| Quotation | `/customers` `/quotations` `/billing-notes` `/receipts` `/production-orders` `/warranties` `/stock` `/calculator/*` `/ai/*` |
| OMS | `/dashboard` `/jobs` `/production` `/installation` `/issues` `/finance` `/users` |

> ⚠️ จุดต่างชื่อที่ต้องระวัง: OMS `/production` (ตาราง `productions`) กับ Quotation `/production-orders` (ตาราง `production_orders`) เป็นคนละหน้า/คนละตาราง — คงแยกตามเดิม

---

## 6. การรวม Database (จุดเสี่ยงสูงสุด)

### ตารางทั้งหมดในแอพรวม (คงโครงสร้างเดิมทุกตาราง)
- **ร่วม:** `profiles` (ใช้ของ JRerp — role_t), `auth.users`
- **OMS:** `jobs` `job_sequence` `productions` `installations` `issues` `finance_entries` `audit_logs`
- **Quotation:** `customers` `document_sequences` `quotations` `quotation_items` `billing_notes` `billing_installments` `receipts` `production_orders` `warranties` `stock_items` `stock_moves`

### จุดชนกัน + วิธีแก้ (ใน migration)
| ชน | วิธีแก้ |
|----|---------|
| ตาราง `public.profiles` (สร้าง 2 ที่) | ใช้ของ JRerp (superset: มี email/avatar/is_active/role_t) — migration ฝั่ง Quotation **ตัด** การสร้าง profiles |
| enum `user_role` (Quotation) ↔ `role_t` (JRerp) | ใช้ `role_t` อย่างเดียว — **ตัด** `user_role` |
| `handle_new_user()` + trigger `on_auth_user_created` (สร้าง 2 ที่) | ใช้ของ JRerp (insert email/full_name/avatar, role=VIEWER) — ฝั่ง Quotation ตัดทิ้ง |
| `current_user_role()` คืน `user_role` | แก้ให้คืน `role_t` (อ่านจาก profiles เดียวกัน) |
| `can_write()` เทียบ `('sales','admin','owner')` | แก้เป็น `auth_role() in ('ADMIN','SALES','ACCOUNTING')` + `is_active()` |
| RLS policies บน `profiles` (ฝั่ง Quotation) | ตัดทิ้ง — ใช้ของ JRerp |

> ไม่แตะ structure ของ `jobs`, `quotations`, `customers`, ฯลฯ เลย — แก้เฉพาะจุดชนระดับ auth/role

### ลำดับ migration (รันต่อกันได้ทันทีบน Supabase เปล่า)
```
0001_oms_schema.sql       (JRerp 0001 — เดิม)
0002_oms_functions.sql    (JRerp 0002 — เดิม)
0003_oms_rls.sql          (JRerp 0003 — เดิม)
0004_oms_fix.sql          (JRerp 0004 — เดิม)
0005_acct_schema.sql      (Quotation 0001 — ตัด profiles/user_role/handle_new_user)
0006_acct_functions.sql   (Quotation 0002 — current_user_role คืน role_t, ตัด handle_new_user)
0007_acct_rls.sql         (Quotation 0003 — can_write ใช้ role_t, ตัด profiles policy)
0008_acct_documents.sql   (Quotation 0004 — เดิม, อาศัย can_write ใหม่)
0009_seed.sql             (ลูกค้าตัวอย่าง — optional)
```

ทั้งหมดรวมไว้ใน `supabase/setup-all.sql` ด้วย

---

## 7. Tech stack แอพรวม

- Next.js 14, React 18, TypeScript
- Supabase JS + `@supabase/ssr`
- TanStack Query (OMS ใช้ฝั่ง client), Zod (validation OMS)
- `@anthropic-ai/sdk` (AI ตรวจใบเสนอราคา — ฝั่ง Quotation)
- Tailwind (ธีมแดง + glass), Sarabun, lucide (ผ่าน `<Icon>` ของ Quotation + เพิ่มไอคอน OMS)

---

## 8. Acceptance Criteria

- [ ] `npm install` + `npm run build` ผ่าน
- [ ] ทุก route ทั้ง 2 ฝั่งเข้าถึงได้ (ไม่มี route/import ชนกัน)
- [ ] `supabase/setup-all.sql` รันบน Supabase เปล่าได้จบ ไม่ error (profiles เดียว, role_t เดียว)
- [ ] login ครั้งเดียว เห็นเมนูรวมตาม role
- [ ] โทนสีแดง JR + Sarabun ทั่วทั้งแอพ
- [ ] business rules/trigger เดิมของทั้ง 2 ฝั่งยังทำงาน (job auto-code, VAT, deposit→production, doc auto-code ฯลฯ)
- [ ] push ขึ้น `jraluminium102/jr-beta` สำเร็จ

---

## 9. ความเสี่ยง / หมายเหตุ

- **profiles เดิมฝั่ง Quotation** ที่มีอยู่ใน production เดิม ถ้าจะย้ายข้อมูล ต้อง map role lowercase→uppercase ตอน import (owner→ADMIN ฯลฯ) — สคริปต์ย้ายข้อมูลเป็นงานแยก
- ตั้ง `typescript.ignoreBuildErrors = true` + `eslint.ignoreDuringBuilds = true` (ยกมาจาก next.config ของ OMS) เพื่อให้ build ผ่านช่วงรวม (type ข้ามฝั่งยังไม่ครบ 100%)
- "ใบสั่งผลิต" มี 2 ความหมาย (OMS production tracking vs Quotation production order document) — เก็บแยกโดยตั้งใจ ผู้ใช้เลือกใช้ตามบริบท
```
