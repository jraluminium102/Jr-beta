# Prompt ส่งน้องมะนาว (qa-tester) — ตรวจทั้งระบบ JR Beta

> วิธีใช้: ก๊อปบล็อก "PROMPT" ด้านล่างไปวางให้น้องมะนาว (qa-tester) ได้เลย
> หรือสั่งพี่ Claude ว่า "spawn น้องมะนาวด้วย prompt นี้"

---

## 🎯 GOAL การตรวจ (Definition of Done)

ตรวจให้ครบว่า **"ระบบเดินงานได้ตั้งแต่ลูกค้านัดดูหน้างาน → ส่งงาน+รับประกัน ครบ 24 ขั้น โดยเงินตรง สิทธิ์ตรง ไม่มีหน้าพัง"**

ผ่าน = ครบ 5 ข้อนี้:
1. **Flow เดินครบ** — job เดินหน้า/ย้อน loop ได้ตาม state machine 24 ขั้น ไม่ค้าง ไม่ข้ามผิด
2. **เงินตรง** — VAT / ส่วนลด / มัดจำ / งวด / ยอดค้างรับ คำนวณถูก, ผลรวมงวด = net เป๊ะ
3. **สิทธิ์ตรง (RBAC)** — 7 roles เห็น/แก้ได้เฉพาะที่ matrix อนุญาต, void ทำได้เฉพาะคนมีสิทธิ์
4. **ไม่มี regression** — `npm run build` ผ่าน, test เดิมใน `test/*.mjs` ยังเขียว
5. **Audit ครบ** — ทุก action สำคัญ (advance stage, pay, void) มี audit log

---

## 📋 PROMPT (ก๊อปส่วนนี้ส่งน้องมะนาว)

```
น้องมะนาว ช่วยตรวจ + เทสระบบ JR Beta ทั้งระบบให้พี่นัทหน่อย

== ระบบคืออะไร ==
แอพรวมของ JR Aluminium & Glass = บัญชี/ใบเสนอราคา + OMS งานผลิต/ติดตั้ง
สแตก: Next.js 14 (App Router) + Supabase (Postgres + RLS + triggers) แบบ BFF
กฎสถาปัตยกรรม: Frontend ห้าม query Supabase ตรง — ผ่าน /api/* เท่านั้น
โค้ดหลัก: src/app/(app)/* (หน้า), src/app/api/* (BFF), src/lib/* (logic)

== FLOW ทั้งงาน = หัวใจที่ต้องตรวจ (state machine 24 ขั้น) ==
ดู src/lib/stages.ts เป็น single source of truth:
  กลุ่มขาย (1-7): 1 นัดดูหน้างาน → 2 เข้าทะเบียนลูกค้า → 3 วาดแบบ →
                  4 เซลล์ตรวจแบบ → 5 ทำใบเสนอราคา → 6 เจรจาราคา → 7 ส่งใบเสนอ
  มัดจำ (8):      8 ลูกค้ามัดจำ
  ผลิต (9-19):    9 รอวัดจริง → 10 หัวหน้าช่างวัด → 11 ประชุมหลังวัด →
                  12 แก้แบบ+ใบเสนอ → 13 คอนเฟิร์ม → 14 ทำเอกสาร → 15 ลงคิวผลิต →
                  16 สั่งอลู → 17 สั่งกระจก → 18 ผลิต → 19 QC โรงงาน
  ติดตั้ง (20-24): 20 ผลิตเสร็จ/รอติดตั้ง → 21 เข้าติดตั้ง → 22 รอตรวจรับ →
                  23 แก้งาน → 24 ส่งงาน+รับประกัน
  Loop ย้อนได้ (ต้องเทสว่าย้อนได้จริง): 4→3, 6→5, 12→11, 23→22
  RPC: advance_stage (POST /api/jobs/[id]/advance), audit action = STAGE_ADVANCE

== RBAC 7 roles (ดู src/lib/rbac.ts = MATRIX) ==
ADMIN, SALES, DESIGNER, PRODUCTION, INSTALLER, ACCOUNTING, VIEWER
ต้องเทสว่าแต่ละ role เห็นเมนู (menusFor) + แก้ได้ (can) เฉพาะที่ matrix อนุญาต เช่น:
  - VIEWER แก้อะไรไม่ได้เลย (jobs/dashboard read อย่างเดียว)
  - SALES เห็น finance ได้แต่แก้ไม่ได้, แต่ sales_closure แก้ได้
  - มีแค่ ADMIN/ACCOUNTING ที่ void การเงินได้
  - finance_fields (ยอดเงินในจ๊อบ) เห็นได้เฉพาะ ADMIN/SALES/ACCOUNTING

== ขอบเขตการตรวจ — แบ่ง 5 ด้าน ==

[1] FLOW / STATE MACHINE
  - เดินหน้าทีละขั้น 1→24 ได้, ข้ามขั้นถูกบล็อก
  - loop ย้อน (4→3, 6→5, 12→11, 23→22) ทำได้, ย้อนนอกเหนือนี้ถูกบล็อก
  - stage ที่มีฟอร์มเฉพาะ (STAGE_FORM: 8 มัดจำ, 9-19 production, 21-23 installation)
    ปุ่มชี้ไปฟอร์มถูกตัว
  - followup.ts map current_stage → PhaseKey ถูก (ภาพรวมงานโชว์เฟสตรง)

[2] การเงิน (เรียก sub-agent accountant ช่วยถ้าจำเป็น)
  - VAT 7% คิดถูก (ยอดก่อน/หลัง VAT), ส่วนลด %/บาท
  - มัดจำ + งวด 2/3/สุดท้าย: ผลรวมงวด = net เป๊ะ (ดู src/lib/money.ts suggestInstallments)
  - ยอดค้างรับ (finance/outstanding) ถูก
  - void แล้วยอดกลับถูก + มี audit
  - ตรงกับ test/qa-t5-totals.mjs

[3] เครื่องคิดราคา (public/calculator/index.html — READ-ONLY ห้ามแก้)
  - รัน test เดิมทั้งหมดใน test/ แล้วสรุปว่าเขียว/แดง:
    node test/calc-smoke.mjs, calc-functional.mjs, qa-t1..t6, qa-options.mjs,
    option-coverage.mjs, quote-fidelity.mjs ฯลฯ
  - ของที่เคยเจอ (ดู memory + docs/FIXLIST*) แก้แล้วยังไม่ย้อนกลับ

[4] RBAC / RLS / API
  - ทุก route ใน src/app/api/* มี requirePermission/requireAuth ก่อนแตะ data
  - ไม่มี route ไหนเปิดให้ frontend query ตรง (เช็คว่าไม่มี supabase client ฝั่ง client component)
  - error handling: ส่ง 401/403/400 ถูก ไม่หลุด stack/secret

[5] REGRESSION / BUILD
  - npm run build ผ่าน (ไม่มี type error)
  - npm run lint (ถ้ามี warning สำคัญรายงาน)

== วิธีทำงาน ==
1. อ่านโค้ดจริงก่อนเสมอ — ยึดไฟล์ ห้ามเดา logic/ตัวเลข
2. เขียน test plan สั้น ๆ ต่อด้าน → รัน → เก็บผลจริง (อย่าเขียนว่า "น่าจะผ่าน")
3. แตะเรื่องเงิน → เรียก sub-agent accountant ตรวจซ้ำ
4. ถ้า dev server / Supabase รันไม่ได้ (ไม่มี .env.local จริง) → ตรวจแบบ static + รัน node test
   ที่ไม่ต้องต่อ DB (พวก test/*.mjs ใช้ jsdom อ่าน html ตรง ๆ ได้เลย) แล้วบอกพี่นัท
   ว่าด้านไหนต้องมี env ถึงเทสจบ

== ส่งงานยังไง ==
รายงาน 1 ไฟล์ docs/QA-REPORT-fullsystem-2026-06-10.md จัดลำดับ:
  🔴 ผิดแน่/พัง  →  🟡 น่าสงสัย (ติดป้าย "เช็คซ้ำ")  →  🟢 แค่ปรับให้ดีขึ้น
แต่ละจุด = ไฟล์+บรรทัด + อาการ + เสนอแก้ 1 บรรทัด
ปิดท้าย: ตาราง Goal 5 ข้อ ผ่าน/ไม่ผ่าน + เหลืออะไรต้องมี env ถึงตรวจจบ
ห้ามแก้โค้ดเอง — ตรวจ+รายงานอย่างเดียว (โดยเฉพาะ public/calculator/index.html)
```

---

## 📝 หมายเหตุพี่นัท
- น้องมะนาว = agent `qa-tester` (มี Read/Grep/Glob/Bash/Write — รัน build/test ได้ แต่ห้ามแก้โค้ด)
- ถ้าต้องตรวจเงินลึก น้องจะเด้งไปหา `accountant` ให้เอง
- ส่วนที่ต้องต่อ Supabase จริง (RLS, advance_stage RPC) ต้องมี `.env.local` ก่อนถึงเทส end-to-end ได้ — ถ้ายังไม่มี น้องจะตรวจ static + test offline ให้ก่อน
