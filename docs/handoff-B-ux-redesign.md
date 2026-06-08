# HANDOFF B — แชท "แก้ UX/UI + ออปชั่น" (แก้ index.html · แชทเดียวที่แตะไฟล์นี้)

> วาง prompt นี้ในแชทใหม่ · **แชทนี้แชทเดียวที่แก้ public/calculator/index.html** (กันชนกับแชท A) · ทำหลังแชท A ออกรายงาน

```
คุณคือแชท "แก้ UX/UI + ออปชั่น" ของเครื่องคิดราคา JR — งานคือจัดหมวดออปชั่นใหม่ + แก้ฟอร์ม
ให้ "ใบเสนอราคาที่ออกมาข้อมูลครบเหมือนใบจริง" (การจัดเรียงต่างกันได้) + กรอกง่าย ไม่รก

โปรเจกต์: C:\Users\Nut\Documents\Claude\Projects\Jr-beta · branch: feat/quote-phase5-ux
แก้ได้: public/calculator/index.html + test/scripts · ห้ามแตะ src/ (Phase 3 อีกแชท)
**แชทนี้แชทเดียวที่แก้ index.html — ห้ามมีแชทอื่นแก้พร้อมกัน**

## อินพุตหลัก
1. docs/report-option-audit.html (รายงานจากแชท A — ออปชั่นที่ขาด/ผิด/จัดหมวดผิด) ← ทำตามนี้
2. ใบจริง PDF: ...\07_ต้นฉบับทุน_อ้างอิง\ตัวอย่างใบเสนอราคา\
3. R3.9: docs/SPEC_Calculator_R3.9.md · HTML R3.9: ...\00_ล่าสุด_ส่งUX\JR_คิดราคา_R3.9_UX.html
4. ตาราง option: docs/ร่าง-option-ทุกหมวด.docx

## งาน
1. **จัดหมวดออปชั่นใหม่** — option ปัจจุบันจัดเป็น 5 กลุ่ม <details> (groupGHOpts ~line 1568) ด้วย keyword (เปราะ!)
   → จัดให้ตรงกับ flow ใบจริง + robust ขึ้น (พิจารณาให้ buildItemOpts สร้างกลุ่มตั้งแต่ต้น แทน keyword post-process)
2. **เติม/แก้ออปชั่น** ตามรายงานแชท A ให้ output ครบเหมือนใบจริง (อันที่ราคายังไม่ชัด → ใส่ field ให้กรอก/flag ไว้)
3. **กรอกง่าย ไม่รก** — ทุกรายการ · เลียนความเรียบของโหมดกั้นห้องกระจก

## ⚠️ บทเรียนสำคัญ (เจอมาแล้ว ห้ามพลาดซ้ำ)
- **เทสต้อง "คลิกปุ่มจริง" (dispatch click) ไม่ใช่แค่เรียกฟังก์ชัน** — เคยมีบั๊ก curly quotes (onclick=”...”) ทำปุ่มคลิกไม่ได้ แต่เทสไม่จับเพราะเรียกฟังก์ชันตรง
- **ใช้ straight quotes (") เท่านั้นใน attribute** — ห้าม curly `=”` (grep เช็คต้องได้ 0)
- **groupGHOpts keyword เปราะ** — เคย match 'ราง ' ชน 'คาดตาราง' ทำ option แยกกลุ่มผิด · ระวังตอนจัดหมวด
- **fixture enableAllOpts เลือก option[1] ทุก dropdown** → option ใหม่ที่คิดเงินจะทำ baseline เพี้ยน (ดู .o-thresh ที่ skip ใน gen-quotes-full.mjs)
- jsdom VirtualConsole กลืน JS error — ต้องดัก jsdomError เอง (กรอง scrollTo)
- PowerShell .Contains ภาษาไทยเพี้ยน → ใช้ Grep tool
- ดูเนื้อใบจริง (render + strip tags) ไม่ใช่ grep อย่างเดียว
- ลบ temp ทุกครั้ง · commit ไทยใช้ git commit -F · ปิดท้าย Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## INVARIANT (เช็คซ้ำเองหลังแก้ทุกครั้ง — ห้ามพัง)
1. node scripts/gen-quotes-full.mjs → FullA grand "755,420" · FullB grand "8,229,691"
   (เดิม 679,450 / 8,057,421 — re-baseline 2026-06-08 หลังแก้บั๊กมุ้งต่อบาน [[mosquito-addon-not-billed]] → 760,770;
    แล้ว ข้อ4A Cmech ตารางราคา → FullA 755,420)
2. node test/option-coverage.mjs → 13/13 · node test/quote-fidelity.mjs → 14/14 · node test/calc-glasshouse.mjs → 19/19 · node test/calc-mosq-frame.mjs → 15/15
3. jsdom 0 error · grep ไม่มี `=”` · ไม่มี NaN
4. คลิกปุ่มหลัก (ส่งเข้าระบบ JR/พรีวิว/ล้าง) ใน jsdom ทำงาน (มี onclick ถูก)
* ถ้าเพิ่ม option ที่คิดเงิน → อัปเดต baseline + tests + อธิบายเลขที่เปลี่ยน

## จบงาน
commit เป็นสเตปที่ verify แล้ว + push branch + ออก HTML report สรุป (จัดหมวดใหม่อะไร + เติม option อะไร + ก่อน/หลัง)
+ ลิงก์ preview: jr-beta-git-feat-quote-phase5-ux-jraluminium103.vercel.app/calculator/index.html
```

## สถานะปัจจุบัน (ส่งต่อ)
- option จัดเป็น 5 กลุ่ม collapsible: ชนิด/การเปิด · มือจับ-ล็อค · มุ้ง · คาดตาราง · อื่นๆ (groupGHOpts ~1568)
- เพิ่งทำ: สีอลู/กระจก global · OPTION ±/รายการ · ราคาเหมา · ฝังรางยู/งานเสริม/รื้อต่อรายการ · เสริมคานทุกราง · จำนวนบาน มี/เปิด/ติดตาย · พับกล่องลูกค้า · ยกเลิกค่าทำชุดกั้นห้อง 5,000
- ค้าง (รอราคาพี่นัท): ลูกฟูกบานเลื่อน · กระจกอินซูเลทหน้าต่าง · พื้น · กระจกเงา/ลอนแก้ว · สีชุบ
- (8) ISOWALL multi-side ในชุดกั้นห้อง: เลือกได้ (group6 มี ฝ้า-ผนัง) แต่ render หลายด้านยังไม่เนียน — ต้อง polish
