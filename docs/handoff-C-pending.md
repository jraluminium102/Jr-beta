# HANDOFF C — งานค้างเครื่องคิดราคา JR (ส่งแชทถัดไป)

> สร้าง 2026-06-09 · จากแชทที่แก้ `public/calculator/index.html` มาต่อเนื่อง (มุ้ง → ออปชั่นราคา → UX → หลังคา/ฝ้า)
> **แชทเดียวที่แก้ `public/calculator/index.html`** — ห้ามมีแชทอื่นแก้พร้อมกัน · branch `feat/quote-phase5-ux`

---

## 0. สถานะปัจจุบัน (อ่านก่อน)
- ทำเสร็จล่าสุด: งานมุ้ง(เฟรม+บั๊กไม่เข้ายอด) · ออปชั่นราคา(สี/ราวกันตก/หลังคา/ลูกฟูก/Cmech/X-J/ครอบวงกบ) ·
  UX(กล่องฟ้าบานเลื่อน+ราง · accordion พับ · ลบ OPTION±ซ้ำ · รวมปุ่มบานย่อย · ไล่เลขใหม่ · หัวข้อไม่ซ้ำ) ·
  หลังคา/ฝ้า-ผนัง(ตัดคาด/ฝังรางยู · หลังคาเลื่อน 3 ช่อง · ฝ้า-ผนัง matLines ครบ)
- **baseline ปัจจุบัน: `node scripts/gen-quotes-full.mjs` → FullA grand 753,280 · FullB grand 8,377,351**
  - ⚠️ FullB เคย 8,224,341 → ขยับเป็น 8,377,351 ตอน commit `3558e3d` เพราะ **ลบ product `imp34`**
    (ตะแกรงเหล็กสาน ซ้ำ `steel_mesh`) ที่ติดมาจาก working tree. fixture FullB สุ่มขนาดตาม index
    (`B_SIZES[autoIdx]` ใน gen-quotes-full.mjs) → ลบ product = index shift = ยอดขยับ **ไม่ใช่ราคาเพี้ยน**
    (FullA ใบ curated คงที่ 753,280 ยืนยัน · imp34 dedup ถูกต้อง). **อย่า restore imp34** — ใช้ 8,377,351 เป็น anchor
- งานทั้งหมด push แล้ว (`origin/feat/quote-phase5-ux`) → Vercel preview auto-deploy · **ยังไม่ merge เข้า main**

### อัปเดต 2026-06-09 (รอบที่ 2) — push แล้วถึง commit `40ff5b2`
- ✅ tilt & turn บานกระทุ้ง +5,000/บาน (commit ของค้างที่ลอยใน working tree)
- ✅ แก้ T1.1 (เทสเก่า string กระจกไม่มีคำ "หนา") → functional 21/21
- ✅ ลบ dead code: `addFixedToSet` · `OPT_PRESETS`/`optPresetOptions`/`addOptPreset` · `hide_slope` ×2 (−66 บรรทัด)
- ✅ เทส regression ใหม่ `test/calc-roof-tilt.mjs` 16/16 (หลังคาเลื่อน + tilt&turn + มือจับรุ่นอื่น)
- ✅ ดาวน์ไลท์เจาะจงจำนวน: checkbox+ช่อง "จำนวนดวง" · ราคา = ดวง×**1,500** (เดิม 2 ดวง=3,000) · default 2=3,000 ไม่กระทบยอด
- ✅ มือจับรุ่นอื่น: ช่อง `o-handlename`+`o-handleprice` กรอกชื่อ+ราคาเอง (HD182/Berin) · X2/X-J/XO/XT มีอยู่แล้ว
- ⚠️ เรตที่ derive รอพี่นัทยืนยัน: ดาวน์ไลท์ 1,500/ดวง (แก้เลขเดียวที่ calc) · มือจับ = กรอกเอง (ยังไม่ฝังราคาตายตัว)

## INVARIANT (เช็คทุกครั้งหลังแก้)
1. `node scripts/gen-quotes-full.mjs` → FullA "753,280" · FullB "8,377,351" (ถ้าเพิ่ม option คิดเงิน → re-baseline + อธิบาย)
2. `node test/quote-fidelity.mjs` 14/14 · `test/calc-glasshouse.mjs` 19/19 · `test/option-coverage.mjs` 13/13
   · `test/calc-mosq-frame.mjs` 18/18 · `test/calc-option-cascade.mjs` 9/9 · `test/calc-roof-tilt.mjs` **16/16**
3. `grep '=”'` = 0 (ห้าม curly quote ใน attribute) · ไม่มี NaN · jsdom 0 error
4. `test/calc-functional.mjs` = **21/21** (T1.1 แก้แล้ว 2026-06-09)

---

## 1. ⛔ รอราคาพี่นัท — **ยกเลิกทั้งหมด** (มติ 2026-06-09: ไว้ติดปัญหาค่อยมาทำ)
~~กระจกอินซูเลท 5+8+5 · งานพื้น · ลูกฟูกบานเลื่อน · กระจกเงา/ลอนแก้ว · สีชุบ~~
> พี่นัทสั่งยกเลิกออกจาก backlog · ถ้าลูกค้าถามถึงค่อยกรอกผ่าน "OPTION ทางเลือกลูกค้า" (พิมพ์ราคาเอง) ชั่วคราว

## 2. 🟡 ออปชั่นที่ยังไม่ทำ (จาก audit report-option-audit.html — P2/P3)
1. ~~**พัดลมดูดอากาศ · เสริมโครงรับม่าน · กระจกเงา/โฟเมก้า** (P2-3)~~ — **กระจกเงา/โฟเมก้า ตัดทิ้ง** (มติ 2026-06-09) · พัดลม/เสริมโครงม่าน ยังไม่ทำ (ถ้าจะทำ = preset/custom_item)
2. ~~**รุ่นมือจับเฉพาะ** (P3-3)~~ — **เสร็จแล้ว 2026-06-09**: ช่อง "มือจับรุ่นอื่น (กรอกชื่อ+ราคาเอง)" · X2/X-J/XO/XT มีอยู่แล้ว
3. **หลังคา รายละเอียดละเอียดขึ้น** (P3-2) — ท่อ PVC ขนาด/สี · โซ่ลาย/จำนวนจุด · "ปล่อยปลายไม่มีราง"/ยื่นปลาย (มีบางส่วนแล้ว)
4. ~~**ชื่อสีลายไม้ตรงคำลูกค้า** (P3-4)~~ — **ไม่ทำ** (มติ 2026-06-09 · ใช้ "ลายไม้อบพิเศษ+รหัส" ต่อไป)
5. ~~**เดินไฟดาวน์ไลท์ N ดวง** (P3-5)~~ — **เสร็จแล้ว 2026-06-09**: ช่อง "จำนวนดวง" × 1,500/ดวง (รอพี่นัทยืนยันเรต)
6. **ราวกันตก ชนิดกระจก** — ข้อ2 ทำ default เทมเปอร์10 แล้ว · ราวเหล็ก = พี่นัทสั่งตัดทิ้ง (ไม่ทำ)

## 3. 🧹 UX / cleanup ค้าง
A. **กระจกติดตาย "ด้านไหน"** — ใบจริงเขียน "ติดตายด้านข้าง/บน/ล่าง/โดยรอบ" · ตอนนี้ฟอร์มมี "จำนวนติดตาย" (กล่องฟ้า)
   + "+ เพิ่มบานย่อย" (มีชนิด ช่องแสงติดตาย/บานข้าง/ช่องแสงบน) — พี่นัทบอกพอแล้ว แต่ถ้าอยากให้ใบระบุด้านอัตโนมัติยังทำได้
B. ~~**dead code**~~ — **ลบแล้ว 2026-06-09**: `addFixedToSet` · `OPT_PRESETS`/`optPresetOptions`/`addOptPreset` · `hide_slope` ×2
   (เหลือ hidden `.o-optdelta` เก็บไว้กันโค้ดอ้าง — ไม่ลบ)
C. ~~**🔴 T1.1 พังมาก่อน**~~ — **แก้แล้ว 2026-06-09** (เป็นเทสเก่าหา string ผิด ไม่ใช่บั๊กโปรแกรม · dedup ทำงานถูก) → functional 21/21
D. **accordion** (commit C): เพิ่มชุดแล้วพับตัวเก่า — ถ้าพี่นัทอยากปรับพฤติกรรม (เช่น พับเฉพาะกดเอง) แก้ที่ `collapseOthers`/`toggleCh`

## 4. ⚖️ การตัดสินใจ
1. **merge เข้า main** — **พี่นัท merge เอง** (มติ 2026-06-09) · รองานจากแชทอื่นมารวม → merge + push ขึ้น GitHub ทีเดียว
   → **แชทนี้ push ถึง `40ff5b2` แล้ว หยุดไว้ ไม่ push/merge เพิ่ม** จนกว่าพี่นัทสั่ง
2. **mosquito openRatio บานเลื่อน** — เคาะแล้ว (เฟรมคิดตามช่องเปิด) · ถ้าจะปรับมุ้งจีบด้วยค่อยว่า
3. ~~**หลังคาเลื่อน เทส regression**~~ — **เพิ่มแล้ว 2026-06-09** (`test/calc-roof-tilt.mjs` 16/16)

## 5. กฎสำหรับแชทถัดไป (สำคัญ)
- แก้ `public/calculator/index.html` แชทเดียว · `git pull` ก่อน · commit แยกข้อ (`git commit -F` ไทย) ปิดท้าย `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **เทสต้องคลิกปุ่มจริง (dispatch click)** ไม่ใช่เรียกฟังก์ชันตรง · ใช้ straight quote (") เท่านั้น
- **อย่าใช้ `sed` แก้โค้ดที่มีภาษาไทย/regex พิเศษ** — เคยทำไฟล์พังมาแล้ว · ใช้ Edit tool
- fixture FullB สุ่มขนาดตาม index → **เพิ่ม/ลบ product = baseline ขยับ** (ไม่ใช่บั๊ก ถ้า FullA คงที่) · re-baseline ได้
- option ที่ enableAllOpts แตะ = `select` (เลือก option[1]) เท่านั้น · **ไม่ติ๊ก checkbox** · number input ไม่แตะ
  → ถ้าเพิ่ม option คิดเงินเป็น checkbox/number จะไม่กระทบ baseline · ถ้าเป็น select จะกระทบ (ดู o-thresh/o-fcsides ที่ skip ไว้)

## 6. ไฟล์อ้างอิง
- โค้ดหลัก: `public/calculator/index.html` (vanilla HTML/JS ไฟล์เดียว ~3,600 บรรทัด)
- spec: `docs/spec-roof-ceiling-options.pdf` (หลังคา/ฝ้า — ทำครบแล้ว) · `docs/handoff-B-option-prices.md` (ออปชั่นราคา) ·
  `docs/report-option-audit.html` (audit P1/P2/P3) · `docs/handoff-B-ux-redesign.md` (INVARIANT)
- ใบจริง 16 ใบ: `...JR ERP/วิศวกรสูตร (Formula Engineer JR)/07_ต้นฉบับทุน_อ้างอิง/ตัวอย่างใบเสนอราคา/`
  (อ่านแล้ว 3 ใบ: ธนบัตร/ยี/ชวลิต — ใบจริงระบุ ชนิดเปิด+รางล่างกันน้ำ+กระจกติดตายด้าน+มุ้ง+OPTION ลด/เพิ่ม)
- เทส: `test/*.mjs` (รันทีละไฟล์ ไม่มี runner รวม) · fixture: `scripts/gen-quotes-full.mjs`
