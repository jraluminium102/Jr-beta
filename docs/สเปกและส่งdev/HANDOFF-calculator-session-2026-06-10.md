# HANDOFF — เครื่องคิดราคา calculator (ต่อจากแชทเต็ม) · 2026-06-10

> แชทเดิมเต็ม — เอกสารนี้ให้แชทใหม่ทำงานต่อได้ทันที **อ่านครบก่อนเริ่ม**

## 0. สถานะไฟล์
- ไฟล์หลัก: `public/calculator/index.html`
- **มีการแก้ค้างใน working tree (~+65/-30 บรรทัด) ยังไม่ commit/ยังไม่ push** (ตามที่พี่นัทสั่ง)
- backup: `public/calculator/index.bak-build-2026-06-09.html`, `index.bak-2026-06-09.html`
- baseline: `node test/quote-fidelity.mjs` ต้อง **PASS 14/14** (smoke test เช็ค รายการครบ/ราคา>0 — รันก่อน+หลังแก้ทุกครั้ง · ไม่เช็คค่าตรงเป๊ะ จึงเปลี่ยน logic ราคาได้)

## 1. เครื่องมือ/วิธี (จำเป็น — เคยเสียเวลาเพราะไม่รู้)
- **รัน calc จริง:** JSDOM — ใช้ `test/quote-fidelity.mjs` เป็นแม่แบบ (node v24 + jsdom พร้อม) · `runScripts:"dangerously"`
- **gen ใบ standalone → PDF:** ดู `scripts/gen-quotes-full.mjs` (L337-347) — **wrapper ต้องมี `<div id="sheet"><div class="quote">...</div></div>` + visibility CSS** ไม่งั้น PDF ออกมาว่าง (footer fixed ขึ้นอันเดียว) · แปลง PDF: `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="out.pdf" "in.html"`
- **อ่านใบจริง PDF:** `/mingw64/bin/pdftotext -enc UTF-8 "file.pdf" -` — **ห้ามใส่ `-layout`** (ภาษาไทยหาย) · Read tool ใช้ไม่ได้ (ไม่มี pdftoppm) · ไม่มี Python/tesseract
- **ใบจริง 14 ใบ:** `C:/Users/Nut/Documents/Claude/Projects/วิศวกรสูตร (Formula Engineer JR)/07_ต้นฉบับทุน_อ้างอิง/ตัวอย่างใบเสนอราคา/`
- **ไฟล์ชื่อไทยใน git bash:** unzip/cp มักล้ม (Unicode ไม่ตรง byte) → ใช้ glob ASCII anchor หรือ copy ในโฟลเดอร์นั้นเอง

## 2. เป้าหมาย (GOAL)
ระบบออกใบเสนอราคา **ข้อมูลครบเหมือนใบจริง** (จัดเรียง/คำต่างได้ · ขนาดบานตรง · แบ่งบรรทัดอ่านง่าย) · UX สวย กรอกง่าย ไม่ซ้ำซ้อน ของเดิมที่ดีเก็บไว้ · จบแล้ว gen ใบเทียบใบจริงโชว์

## 3. ทำเสร็จแล้ว session นี้ (verified · fidelity PASS ทุกรอบ)
1. **สีเฟรมมุ้งลงใบ** — "(เฟรมสีX / ผ้าY)" (calc render บานเลื่อน L~3275 + บานอื่น L~3350)
2. **dropdown หมายเหตุมาตรฐาน** — `REMARK_PRESETS` + `remarkSelectHTML()` + `addRemark()` (3 กลุ่ม optgroup) เพิ่มเข้า `.i-note`
3. **หมายเหตุ render เทา / OPTION แดง** — สลับ `it.note` ไป param `note` ของ qrow (เลิกไป optText แดง)
4. **Cmech เลือกสีเดี่ยว** (ดำ/ขาว แยก) — o-cmechcolor/o-cmechawn + calc 4 จุด
5. **สีวัสดุ default ไม่มี "ไม่ระบุ"** — roof color (ไวนิล=ขาว/โพลีตัน=Opal103) + เฟรมมุ้ง "ตามสีบาน"
6. **บานเลื่อนโชว์ ชนิดเปิด + เลื่อน/ติดตาย** (มีในฟอร์มเดิม L2263-2290 · render L3107-3120)
7. **Batch A — มุ้งสูตรต่อบาน** (calc L~1497): `mosqBase = max(min/บาน × จำนวนบาน, พื้นที่รวม × เรท)` · เพิ่มช่อง UI `.o-mosqw/.o-mosqh/.o-mosqpanels` (L~2383) + readItem (L~2631) · frame เดิมถูก, non-frame แก้แล้ว, กรอกขนาด/บานเองได้ (ว่าง=auto)
8. **กั้นห้องกระจก หมวดต่อด้านครบ** — `_GM['6']` (L853) เพิ่ม เปลื่อย/shower/ราวบันได/บานยก/บานหมุน/ดัดโค้ง/PC/เลื่อนภายใน
9. **opentype บังคับเลือก** — placeholder `<option disabled selected>— เลือกลักษณะการเปิด —` (L2271)
10. **ชุดล็อค default มีกุญแจ** (L2288) · ตัด `ตู้อลู` ออกจาก NO_COLOR_CATS (L901)

## 4. ค้าง — ต้องทำต่อ (พี่นัทเพิ่งติ + fix-list)
**ด่วน (พี่นัทติในใบล่าสุด `SAMPLE-quote-final.pdf`):**
- **A) มุ้งจีบต้องโชว์ขนาดมุ้งในรายละเอียด** — เดิมตัด `_szTxt` ออกหมด (รอบก่อนพี่นัทสั่งตัด AUTO area) แต่ตอนนี้มีช่องกรอก `.o-mosqw/.o-mosqh` แล้ว → ต้อง **render ขนาดจาก input** เป็น "X.X × Y.Y ม. (N บาน)" ในบรรทัดมุ้ง (anchor: `_slLines.push(_msNameSl` L~3275 + `lines.push(msName` L~3350)
- **B) sample ใบ มุ้งบานเลื่อนไม่ได้เลือกลักษณะเปิด ใส่มาหมด** — เพราะ `enableAllOpts` (gen script) ข้าม `.o-opentype` (อยู่นอก `.i-opts`) → ตอน gen ต้อง `setF(ch,'.o-opentype','บานเลื่อนสลับ')` เอง · **ฟอร์มจริงมี placeholder บังคับแล้ว** แต่ตอน gen ตัวอย่างต้องเซ็ตให้

**fix-list เต็ม 75 จุด → `docs/FIXLIST-all-products-2026-06-10.pdf` (🔴9 🟡29 🟢37):**
- 🔴 **selector สีหาย** — ระแนงเกล็ด(bar_grid_z) · หลังคาลามิเนต(roof_laminate) · ชินโคไลท์(imp15-20) · ม่านซิปสีผ้า(zipscreen) → **ต้องการ list สีจริง** (ดู `ราคาสีอลู+ออปชั่น_R3.9.docx` ในโฟลเดอร์วิศวกรสูตร + `fin:{}` ของ ระแนง rn* ในโค้ดเป็นแม่แบบสี)
- 🔴 **ประตูรั้ว(fence_gate)** — hardcode บานเลื่อน(ราง 2×กว้าง) ไม่มีลักษณะเปิด · ใบจริงมีรั้วแบบอื่น (ต้องรู้ราคา/แบบก่อน)
- 🔴 **standalone มุ้ง (cat 'มุ้ง' products)** — ยังไม่ per-panel + ไม่มีช่องจำนวนบาน (`usesPanels()` ไม่รวม 'มุ้ง') · ตัว addon เสร็จแล้ว
- 🟡 **ตู้อลู สี** — ลบจาก NO_COLOR_CATS แล้วแต่ `.i-color-wrap` ยังซ่อน (มี gate อื่น show/hide — หา logic ที่ตั้ง display ของ i-color-wrap ตาม cat · น่าจะผูก AREA_CATS L840 ด้วย)
- 🟡 ที่เหลือ ~25 จุด — ดู FIXLIST (discontinued ซ่อน, opentype validation เข้ม, ฯลฯ)

## 5. มติ/สูตรสำคัญ (พี่นัทยืนยัน)
- **มุ้งต่อบาน:** ราคา = จำนวนบานมุ้ง × max( min/บาน , (กว้าง×ยาว ÷ จำนวนบาน) × เรท/ตร.ม. ) = `max(min×บาน, พื้นที่รวม×เรท)`
- **บังคับสีทุก selector** (อลู/กระจก/เฟรมมุ้ง/มือจับ/วัสดุมุง) default สีที่ใช้บ่อย — **ไม่บังคับ/ไม่บล็อก** (แค่ไม่มี "ไม่ระบุ"/2สีรวม)
- **ออปชั่นต้องตรงประเภทสินค้า** (เช่น ประตูรั้วไม่ควรมีกระจกของบาน) จัดกลุ่มออปชั่นให้ตรง
- **ราคามุ้งเฟรมต้องรวมเข้าราคารายการหลัก** (เสร็จแล้ว · `sell += _mosqPrice` L~1526)
- **กั้นห้อง: ออปชั่นต่อด้านต้องครบเท่าบานปกติ** (เสร็จ _GM['6'])
- แยกราคาทุกสินค้า (มีอยู่แล้ว — ผ่าน)

## 6. เอกสารอ้างอิง (docs/)
- `FIXLIST-all-products-2026-06-10.pdf` — fix-list 75 จุด (ทำต่อจากนี้)
- `REPORT-option-audit-FULL-2026-06-09.pdf` — เทียบใบจริง 14 ใบ (gap วัสดุ/สี/หมายเหตุ)
- `TEST-REPORT-quotation-2026-06-09.pdf` — QA คำนวณ + วิธีกรอก+สูตร 7 กลุ่ม
- `UX-CHECKLIST-quotation-2026-06-09.pdf` — UX 21 จุด
- `ปรับแก้UXตรวจเอง.docx` — feedback 5 ข้อ (มุ้งรวมราคา/เลือกลักษณะเปิด/แยกราคา/กั้นห้องออปชั่น/ประตูเปิดกล่องเขียว+บังคับสี)
- `SAMPLE-quote-final.pdf` — ใบที่ระบบออกล่าสุด (มีจุดมุ้งที่พี่นัทติ)
- `SPEC_Calculator_R3.9.md` · memory: `calculator-audit-2026-06-09.md`, `quote-wip.md`, `mosquito-addon-not-billed.md`

## 7. ขั้นถัดไปแนะนำ (เรียงตามคุ้ม)
1. แก้ A+B (มุ้งโชว์ขนาด + gen ตัวอย่าง set opentype) → gen ใบเทียบใบจริงใหม่ให้พี่นัทดู
2. standalone มุ้ง per-panel + ช่องจำนวนบาน
3. ขอ list สี → เติม selector สีที่หาย (ระแนง/หลังคา/ม่านซิป)
4. ตู้อลู gate สี · ประตูรั้ว ลักษณะเปิด
5. ไล่ 🟡 ที่เหลือใน FIXLIST · จบแล้ว push (ตอนนี้ยังไม่ push)
