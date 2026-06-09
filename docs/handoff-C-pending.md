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

## INVARIANT (เช็คทุกครั้งหลังแก้)
1. `node scripts/gen-quotes-full.mjs` → FullA "753,280" · FullB "8,377,351" (ถ้าเพิ่ม option คิดเงิน → re-baseline + อธิบาย)
2. `node test/quote-fidelity.mjs` 14/14 · `test/calc-glasshouse.mjs` 19/19 · `test/option-coverage.mjs` 13/13
   · `test/calc-mosq-frame.mjs` 18/18 · `test/calc-option-cascade.mjs` 9/9
3. `grep '=”'` = 0 (ห้าม curly quote ใน attribute) · ไม่มี NaN · jsdom 0 error
4. `test/calc-functional.mjs` = **20/21** (T1.1 พังมาก่อน — ดูข้อ 3C ล่าง · ไม่ใช่ของใหม่)

---

## 1. 🔴 รอราคาพี่นัท (ทำไม่ได้จนกว่าจะมีราคา)
| รายการ | สถานะ |
|---|---|
| กระจกอินซูเลท 5+8+5 | ยังไม่มีราคาในตาราง (ลบ checkbox เดิมแล้ว · ใช้ OPTION cascade เมื่อมีราคา) |
| งานพื้น (ไม้เทียม/สมาร์ทบอร์ด 20มม./ลามิเนต) | ลบ checkbox เดิมแล้ว · spec roof ข้อ4.8 "พิจารณาเพิ่ม product งานพื้น" รอราคา |
| ลูกฟูกบานเลื่อน · กระจกเงา/ลอนแก้ว · สีชุบ | รอราคา (ค้างจาก handoff เดิม) |
> ตอนนี้กรอกผ่าน "OPTION ทางเลือกลูกค้า" (หมวดอื่นๆ พิมพ์ราคาเอง) ได้ชั่วคราว

## 2. 🟡 ออปชั่นที่ยังไม่ทำ (จาก audit report-option-audit.html — P2/P3)
1. **พัดลมดูดอากาศ 8"+ฝาครอบ · เสริมโครงรับม่าน · กระจกเงา/โฟเมก้า** (P2-3) — ทำเป็น preset/custom_item ให้กรอกง่าย
2. **รุ่นมือจับเฉพาะ** HD182 / X-J(มีแล้วบางส่วน) / Berin / SlimLux / Digital X2 (P3-3) — อิงลิสต์ QC ที่มีราคา
3. **หลังคา รายละเอียดละเอียดขึ้น** (P3-2) — ท่อ PVC ขนาด/สี · โซ่ลาย/จำนวนจุด · "ปล่อยปลายไม่มีราง"/ยื่นปลาย (มีบางส่วนแล้ว)
4. **ชื่อสีลายไม้ตรงคำลูกค้า** (P3-4) — Golden Teak SMS · ไวท์แบมบู KL19022WD (ตอนนี้ใช้ "ลายไม้อบพิเศษ+รหัส")
5. **เดินไฟดาวน์ไลท์ N ดวง** เจาะจงจำนวน (P3-5) — ตอนนี้ generic "2 ดวง +3,000"
6. **ราวกันตก ชนิดกระจก** — ข้อ2 ทำ default เทมเปอร์10 แล้ว · ราวเหล็ก = พี่นัทสั่งตัดทิ้ง (ไม่ทำ)

## 3. 🧹 UX / cleanup ค้าง
A. **กระจกติดตาย "ด้านไหน"** — ใบจริงเขียน "ติดตายด้านข้าง/บน/ล่าง/โดยรอบ" · ตอนนี้ฟอร์มมี "จำนวนติดตาย" (กล่องฟ้า)
   + "+ เพิ่มบานย่อย" (มีชนิด ช่องแสงติดตาย/บานข้าง/ช่องแสงบน) — พี่นัทบอกพอแล้ว แต่ถ้าอยากให้ใบระบุด้านอัตโนมัติยังทำได้
B. **dead code** (ปลอดภัย ลบได้ถ้าว่าง): `addFixedToSet` (1900 · ปุ่มถูกลบแล้ว) · `addOptPreset`/`optPresetOptions` (1922 · dropdown ถูกลบ) ·
   `if(p.hide_slope)` calc (1232/1268 · ไม่มี product เรียกแล้ว) · hidden `.o-optdelta` (เก็บไว้กันโค้ดอ้าง)
C. **🔴 T1.1 พังมาก่อน (ไม่ใช่ของใหม่)** — `test/calc-functional.mjs` T1.1 "กระจกเขียว 6มม. dedup นับได้ 0"
   เป็น bug เก่า (ก่อนงานชุดนี้) · ยังไม่แก้ · ควรไล่ว่ากระจกซ้ำใน "รายละเอียดงาน" ของบานเดี่ยว
D. **accordion** (commit C): เพิ่มชุดแล้วพับตัวเก่า — ถ้าพี่นัทอยากปรับพฤติกรรม (เช่น พับเฉพาะกดเอง) แก้ที่ `collapseOthers`/`toggleCh`

## 4. ⚖️ การตัดสินใจ (ต้องเคาะ)
1. **merge เข้า main** — `feat/quote-phase5-ux` ยังเป็น preview · main มีงาน Phase 3 (src/) อีกแชท · ต้องเคาะว่า merge เมื่อไร/ใคร
2. **mosquito openRatio บานเลื่อน** — เคาะแล้ว (เฟรมคิดตามช่องเปิด) · ถ้าจะปรับมุ้งจีบด้วยค่อยว่า
3. **หลังคาเลื่อน** — ทำตาม spec rev2 (3 ช่อง + มอเตอร์ auto-fill) · ยังไม่มีเทส regression → ควรเพิ่ม

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
