# JR Beta — แอพรวม JR Aluminium & Glass

รวม 2 ระบบเดิมเป็นแอพเดียว ดีไซน์เดียว (ธีมแดง JR) บน **Next.js 14 (App Router) + Supabase (BFF)**:

- **บัญชี / เอกสาร** (เดิม `Quotation`): ทะเบียนลูกค้า · ใบเสนอราคา (+AI ตรวจ) · เครื่องคิดราคา · ใบวางบิล · ใบเสร็จ/กำกับภาษี · ใบสั่งผลิต · ใบรับประกัน · เช็คสต๊อก
- **ปฏิบัติงาน / OMS** (เดิม `JRerp`): ภาพรวมงาน · งาน (Jobs) · ผลิต · ติดตั้ง · ปัญหา (Issues) · การเงิน · ตั้งค่า/ผู้ใช้

> spec ฉบับเต็ม: [docs/SPEC_JR_BETA_MERGE.md](docs/SPEC_JR_BETA_MERGE.md)

## สถาปัตยกรรม

```
Next.js (src/, App Router)  →  BFF (app/api/*)  →  Supabase (Postgres + RLS + triggers)
```

- Frontend ห้าม query Supabase ตรง — ผ่าน `/api/*` เท่านั้น
- RBAC ชุดเดียว `role_t` (7 roles): `ADMIN · SALES · DESIGNER · PRODUCTION · INSTALLER · ACCOUNTING · VIEWER`
- ธีมแดง `#B3151D` + Sarabun + glassmorphism (Shell แดงทุกหน้า, โซน OMS เป็นพื้นแดงเข้ม)

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env.local          # แล้วเติมค่า Supabase
npm run dev                         # http://localhost:3000
```

## ตั้งฐานข้อมูล (Supabase)

1. สร้าง project ใน Supabase
2. เปิด SQL editor → วางไฟล์ `supabase/setup-all.sql` ทั้งไฟล์ → Run
   (รวม migration `0001–0008` + grants + seed ตัวอย่าง · รันต่อได้ทันที)
   - ติดตั้งใหม่หมด: uncomment บล็อก `RESET` ส่วนบนของไฟล์ก่อน Run
3. สมัคร user ใน **Authentication** (trigger จะสร้าง `profiles` ให้อัตโนมัติ role = `VIEWER`)
4. ตั้งคนแรกเป็นแอดมิน:
   ```sql
   update public.profiles set role='ADMIN', full_name='พี่นัท'
   where email = 'you@jr-aluminium.com';
   ```

> migration แยกไฟล์อยู่ใน `supabase/migrations/` (`0001–0004` = OMS, `0005–0008` = บัญชี, `0009` = seed)

## โครงสร้างหลัก

```
src/
  app/
    (app)/                 ← หน้าใน (ต้อง login)
      dashboard, customers, quotations, calculator,
      billing-notes, receipts, production-orders, warranties, stock   ← บัญชี
      (oms)/               ← โซน OMS (พื้นแดงเข้ม + React Query)
        operations, jobs, production, installation, issues, finance, settings
    api/                   ← BFF ทั้งหมด (บัญชี + OMS ไม่ชนกัน)
    login, auth
  components/              ← Shell (รวม) + Icon/ui (บัญชี) + ui/jobs/production/finance/issues (OMS)
  lib/                     ← auth, rbac, bff, money/finance, types, database.types, supabase, ai, calculator
supabase/migrations/       ← 0001–0009 + setup-all.sql
```

## หมายเหตุการรวม

- ไม่แตะ structure ตารางธุรกิจของทั้ง 2 ฝั่ง — แก้เฉพาะจุดชน auth/role (`profiles`, `user_role→role_t`, `can_write`, `current_user_role`)
- "ใบสั่งผลิต" มี 2 ความหมาย: OMS `productions` (ติดตามงานผลิต) กับบัญชี `production_orders` (เอกสารใบสั่งผลิต) — เก็บแยกตามเดิม
- ตั้ง `typescript.ignoreBuildErrors`/`eslint.ignoreDuringBuilds` ระหว่างรวม (type ข้ามฝั่งยังไม่ครบ 100%)
