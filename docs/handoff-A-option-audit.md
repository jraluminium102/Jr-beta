# HANDOFF A — แชท "ตรวจออปชั่น" (audit เทียบใบจริง · READ-ONLY)

> วาง prompt นี้ในแชทใหม่ · งานนี้ **อ่าน + ออกรายงานอย่างเดียว ห้ามแก้ index.html** (แชท B เป็นคนแก้)

```
คุณคือแชท "ตรวจออปชั่น" ของเครื่องคิดราคา JR — งานคือ audit ว่าออปชั่น/ข้อมูลที่ระบบออกในใบเสนอราคา
"ตรงกับใบจริงไหม" แล้วออกรายงานตารางเทียบ 3 คอลัมน์ · ทำงาน READ-ONLY ห้ามแก้ public/calculator/index.html (แชทอื่นแก้)

โปรเจกต์: C:\Users\Nut\Documents\Claude\Projects\Jr-beta · branch: feat/quote-phase5-ux
แก้ได้แค่: เพิ่มไฟล์ report ใหม่ (docs/report-option-audit.html) + test ใหม่ถ้าจำเป็น · ห้ามแตะ index.html/src

## แหล่งอ้างอิง (เกณฑ์เทียบ)
1. ใบจริง 16 ใบ (PDF): C:\Users\Nut\Documents\Claude\Projects\วิศวกรสูตร (Formula Engineer JR)\07_ต้นฉบับทุน_อ้างอิง\ตัวอย่างใบเสนอราคา\  (อ่านด้วย Read tool, pages param)
2. R3.9 spec: docs/SPEC_Calculator_R3.9.md
3. ตาราง option 19 หมวด: docs/ร่าง-option-ทุกหมวด.docx
4. HTML R3.9 เดิม: C:\Users\Nut\...\วิศวกรสูตร\00_ล่าสุด_ส่งUX\JR_คิดราคา_R3.9_UX.html
5. ระบบปัจจุบัน: public/calculator/index.html + เทสที่มี (test/quote-fidelity.mjs, scripts/gen-quotes-d.mjs)

## งาน
สำหรับทุกหมวดสินค้า + รายการตัวอย่างจากใบจริง (เลือก 15-25 รายการครอบคลุม):
1. อ่านใบจริงว่าแต่ละรายการ "ช่องรายการ + รายละเอียดงาน" เขียนอะไร (วัสดุ/สี/กระจก/มุ้ง/option/เงื่อนไข)
2. render รายการเดียวกันในระบบ (jsdom — เลียน scripts/gen-quotes-full.mjs) แล้ว strip tags ดูเนื้อใบจริง
3. เทียบว่า ระบบ "มี option ให้เลือก" + "ออกในใบครบ" ไหม
4. หา root cause ของที่ขาด: ไม่มี product? ไม่มี option? จัดหมวดผิด? กรอกแล้วไม่ดึงลงใบ? UX กรอกยากเลยข้าม?

## OUTPUT — docs/report-option-audit.html (ตารางเทียบ 3 คอลัมน์ ธีมแดง #B3151D อ่านง่าย)
| รายการ (จากใบจริง) | ใบจริงเขียนอะไร | ระบบมี option + ออกในใบครบไหม | ขาด/ผิด/ต้องแก้ + root cause |
+ สรุปท้าย: รายการ "ออปชั่นที่ต้องเพิ่ม/แก้/จัดหมวดใหม่" จัดกลุ่มตามความสำคัญ → ส่งให้แชท B แก้

## กฎเหล็ก (verify/คุณภาพ)
- ดูเนื้อใบจริง (render + strip tags) ไม่ใช่อ่านโค้ดเดา หรือ grep อย่างเดียว
- jsdom โหลด index.html ใช้ VirtualConsole ดัก jsdomError (กรอง "scrollTo") — error เงียบ
- ภาษาไทยใช้ Grep tool เช็ค อย่าใช้ PowerShell .Contains (เพี้ยน)
- ลบไฟล์ temp ทุกครั้ง · commit ไทยใช้ git commit -F
- baseline ปัจจุบัน FullA 679,450 / FullB 8,057,421 (ห้ามทำพังเพราะแค่ audit ไม่แตะ index.html อยู่แล้ว)

## จบงาน
commit report เข้า branch + push + สรุปสั้น: เจอออปชั่นขาด/ผิดกี่จุด + ลิงก์ report
```
