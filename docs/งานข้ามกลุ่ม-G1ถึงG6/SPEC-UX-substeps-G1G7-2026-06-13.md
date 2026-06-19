# SPEC-UX-substeps-G1G7 — ลำดับ "กลุ่มย่อย" หลังกดชิปกลุ่มงาน
วันที่: 2026-06-13 | อ้างอิง: index.html R3.9 commit 4c69516

---

## 1. ลำดับ DOM จริง (ก่อนแก้)

หลัง buildItemOpts + relocation รัน ลำดับที่ผู้ใช้เห็นจากบนลงล่างคือ:

| # | Element | Class/ตำแหน่ง | หมายเหตุ |
|---|---------|---------------|----------|
| 1 | หัว collapse | .top | tap พับ/ขยาย |
| 2 | ชิปกลุ่มงาน | .i-group chips | 7 ปุ่ม ✓ |
| 3 | dropdown แบบ | .i-prod .full | **ซ่อนอัตโนมัติ** เมื่อมี prodsel |
| 4 | **selector ตระกูล/รุ่น** | .fam-prodsel / .g3-prodsel / .mosq-prodsel / .rn-prodsel / .rail-prodsel | inject ใต้ .i-prod ถูกแล้ว (commit 4c69516) |
| 5 | ชิปประเภท ประตู/หน้าต่าง | .i-type chips .chip-2up | min-height 52px ✓ |
| 6 | ด้าน/ตำแหน่ง | .i-position | input text |
| 7 | กว้าง / สูง | .i-w / .i-h | row 2 cols |
| 8 | สีอลู / กระจก | .i-color-wrap / .i-glass-wrap | ย้ายขึ้นบนสุด .i-opts (L3135) |
| 9 | จำนวนบานทั้งหมด | .i-panels-wrap | ย้ายเข้า sliding-main-block สำหรับกลุ่ม slider/เปิด/ติดตาย |
| 10 | จำนวนชุด | .i-qty | |
| 11 | กล่องฟ้า sliding-main-block | ชนิดการเปิด + บาน + ราง | relocation L3138-3144 |
| 12 | หมายเหตุ / OPTION | .note-opt-group | |
| 13 | accordion "อุปกรณ์เสริม" | .optbox | |

**เป้าหมายที่ต้องการ:** ① กลุ่มงาน → ② ตระกูล/รูปแบบบาน → ③ รุ่น → ④ ขนาด/จำนวน → ⑤ ออปชั่นเด่น → ⑥ ของเสริมพับ

**สถานะปัจจุบัน:** ขั้น ② ตระกูล อยู่ที่ #4 ถูกต้องแล้ว แต่มี friction เพิ่มเติมตามแต่ละกลุ่มดังนี้

---

## 2. วิเคราะห์ต่อกลุ่ม

### กลุ่ม 1 — บานกระจก (ประตู/หน้าต่าง)

ลำดับจริงหลังกดชิปกลุ่ม 1:
- #4 .fam-prodsel — ชิป "แบบงาน" (15 cat: บานเลื่อน/เปิด/ติดตาย/เฟี้ยม/กระทุ้ง/...)
- #4b แถวรุ่น — ชิป chip-sm (กรณี cat ที่มี >1 รุ่น)
- #5 ชิปประเภท ประตู/หน้าต่าง (chip-2up 52px) — **คั่นระหว่างตระกูลกับขนาด**
- #6 ด้าน/ตำแหน่ง
- #7 กว้าง / สูง

ปัญหา:
- ลำดับ ② ตระกูล → ③ รุ่น → ④ประเภท(ประตู/หน้าต่าง) → ⑤ขนาด เป็น flow ที่สมเหตุ (เลือกประเภทตอนนี้ ก่อนขนาดได้)
- แต่ label กล่อง .fam-prodsel เขียนว่า **"แบบงาน"** ตัวเล็ก (font 12.5px label + chip-sm min-height 40px) ไม่เด่นพอ ผู้ใช้อาจข้ามไปกรอกขนาดก่อน
- chip-sm min-height **40px** ต่ำกว่า guideline 44px

### กลุ่ม 2 — ระแนง/รั้ว/ราวกันตก

ลำดับ:
- #4 .fam-prodsel — ชิป "แบบงาน" (6 cat: ระแนงบังตา/ผนัง/เกล็ด Z/ราวกันตก/ประตูรั้ว/ระแนงพิเศษ)
- #4b .rn-prodsel หรือ .rail-prodsel — cascade profile+spacing (เฉพาะ cat cascade)
- ประเภทประตู/หน้าต่าง — **ซ่อน** (ITYPE_NA ครอบ G2 ทุก cat) ✓
- #6 ด้าน/ตำแหน่ง
- #7 กว้าง/สูง หรือ ความยาว (per_length_tier)

ปัญหา:
- flow ดีกว่า G1: ไม่มีชิปประเภทคั่น
- แต่ label "แบบงาน" เหมือนกัน — ควรเป็น **"เลือกรูปแบบ"** ให้ชัดกว่า

### กลุ่ม 3 — หลังคา/ฝ้า-ผนัง

ลำดับ:
- #4 .g3-prodsel — ชิปแท็บ "หลังคา/ฝ้า-ผนัง" + ชิปกลุ่มวัสดุ + ชิปรุ่น (3 ชั้น cascade)
- ประเภทประตู/หน้าต่าง — ซ่อน ✓
- ด้าน/ตำแหน่ง
- label กว้าง/สูง เปลี่ยนเป็น "ยาว/ยื่น" ✓

ปัญหา:
- cascade 3 ชั้นใน card เล็ก — เพียงพอสำหรับ flow ✓
- ไม่มีปัญหาลำดับ

### กลุ่ม 4 — ตู้อลู/ฝาตู้

ลำดับ:
- #4 ไม่มี fam-prodsel (FAM_CATS ไม่มี key '4') → dropdown .i-prod **โชว์อยู่** (ไม่ถูกซ่อน)
- ประเภทประตู/หน้าต่าง — ซ่อน (ITYPE_NA มี 'ตู้อลู'/'ฝาตู้') ✓
- ด้าน/ตำแหน่ง
- กว้าง/สูง

ปัญหา:
- ผู้ใช้เห็น dropdown "แบบ" เป็น 154-item list ทันทีหลังกดกลุ่ม 4 — ไม่มี cascade ชิป
- ควรมีชิปสลับ ตู้อลู/ฝาตู้ เหมือนกลุ่มอื่น (มี cabProdSwitch ใน JS แต่ยังไม่มี HTML render)

### กลุ่ม 5 — มุ้ง

ลำดับ:
- #4 .mosq-prodsel — ชิปหมวดมุ้ง + ชิปรุ่น (2 ชั้น)
- ประเภทประตู/หน้าต่าง — ซ่อน ✓
- ด้าน/ตำแหน่ง
- กว้าง/สูง

ปัญหา: flow ดี ✓ ไม่มีปัญหาลำดับ

### กลุ่ม 6 — กั้นห้องกระจก

ลำดับ: เหมือน G1 (FAM_CATS['6'] มีครบ) — fam-prodsel โชว์ ✓
- เพิ่ม: label ด้าน/ตำแหน่ง เปลี่ยนเป็น "ด้านของห้องนี้" เมื่อกลุ่ม 6 ✓

ปัญหา: เหมือน G1 — label "แบบงาน" และ chip-sm 40px

### กลุ่ม 7 — ม่านซิป

ลำดับ:
- #4 ไม่มี fam-prodsel (FAM_CATS ไม่มี key '7') → dropdown .i-prod **ซ่อน** (_hideProd true เพราะ p.cat==='ม่านซิป') — หน้าจอว่างเปล่า!
- ช่อง zipscreen options อยู่ใน .i-opts accordion (**ยังไม่ถูก relocation ออกมา**)

ปัญหา: กดชิปกลุ่ม 7 แล้วไม่เห็นอะไรเพิ่ม (dropdown ซ่อน + options อยู่ใน .optbox พับ)

---

## 3. จุดแก้ต่อกลุ่ม (เรียงความสำคัญ)

### กลุ่ม 7 — ม่านซิป (สำคัญที่สุด)

**🔴 G7-1: zipscreen options หลุดออกมาจาก .optbox**
- ปัญหา: p.zipscreen block (L2726-2731) build เข้า h แล้วโดน groupGHOpts จัดเข้า accordion "⚙ อุปกรณ์เสริม" (L3158) ผู้ใช้ต้องเปิด accordion ก่อนถึงเห็น
- แก้: ใน groupGHOpts ให้ skip node ที่มี class `zipscreen-block` (เพิ่ม class ให้ div ที่ L2726) หรือ inject zipscreen block เป็น skipEl ด้านบน box ก่อน groupGHOpts รัน (pattern เดียวกับ .sliding-main-block)
- Anchor: L2726 `if(p.zipscreen){` / L3158 `groupGHOpts(d)`

**🔴 G7-2: dropdown .i-prod กลุ่ม 7 ถูกซ่อนโดยไม่มีตัวแทน**
- ปัญหา: _hideProd=true (p.cat==='ม่านซิป') ซ่อน dropdown แต่ไม่มี selector ชิปรุ่นม่านซิป (มีแค่ 1 product id=zipscreen ?) → ผู้ใช้ไม่รู้ว่ากำลังเลือกอะไร
- แก้: ถ้ามีแค่ 1 SKU ไม่ต้องทำอะไรเพิ่ม (แต่ต้องมีป้ายชื่อสินค้าโชว์)
- แก้ทางด่วน: เพิ่ม heading ชื่อสินค้า `<div class="g7-prodname">ม่านซิป JR Zip Screen</div>` inject ใต้ .i-prod ก่อน options เปิด

### กลุ่ม 4 — ตู้อลู (สำคัญ)

**🔴 G4-1: ไม่มี selector ชิปตู้ — dropdown 154 รายการโผล่ทันที**
- ปัญหา: FAM_CATS ไม่มี key '4' → .i-prod dropdown โชว์ · ผู้ใช้เห็น list ยักษ์
- แก้: เพิ่ม FAM_CATS['4'] = ['ตู้อลู','ฝาตู้'] + FAM_LABEL ที่เหมาะสม หรือ สร้าง cabSelectorHTML ใน buildItemOpts (คล้าย famSelectorHTML)
- Anchor: L2368 `var FAM_CATS={` / L2686 `function buildItemOpts`
- หมายเหตุ: cabProdSwitch ที่ L2427 มีอยู่แล้ว รองรับ pattern นี้

**🟡 G4-2: ออปชั่นตู้สำคัญ (ชนิดตู้/วัสดุผนัง/วัสดุชั้น) อยู่ใน .optbox accordion**
- แก้: groupGHOpts skipEl list เพิ่ม `.cab-main-block` (wrap ออปชั่นหลักตู้) ให้โผล่ฟอร์มหลัก
- ขอบเขต: ไม่แตะ logic/calc เพียง skip accordion

### กลุ่ม 1 และ 6 — label "แบบงาน"

**🟡 G1G6-1: label .fam-prodsel เขียนว่า "แบบงาน" ตัวเล็ก**
- ปัญหา: `<label class="opt">แบบงาน` (font 12.5px) + chip-sm min-height 40px — ไม่เด่นพอ ผู้ใช้อาจข้ามลงขนาดก่อน
- แก้ A (label): เปลี่ยน "แบบงาน" → หัวข้อ bold ขนาด 14px `<b style="font-size:14px;color:#B3151D;">เลือกรูปแบบบาน</b>`
- แก้ B (tap target): เปลี่ยน `.chip-sm .chip{ min-height:40px }` → `min-height:44px` (L239)
- Anchor: L2384 `h+='<label class="opt" style="width:100%;margin:0;">แบบงาน` / L239 `.chip-sm .chip`

**🟡 G1G6-2: ประเภท (ประตู/หน้าต่าง) คั่นอยู่ระหว่างตระกูลกับขนาด**
- ปัจจุบัน: ② ตระกูล → ③ ประเภท(ประตู/หน้าต่าง) → ④ ด้าน/ตำแหน่ง → ⑤ ขนาด
- ปัญหา: "ด้าน/ตำแหน่ง" คั่นก่อน "กว้าง/สูง" เล็กน้อย — ถือว่ายอมรับได้ (ด้านเป็นบริบท ขนาดตาม)
- แต่: ชิป chip-2up ประเภทห้าง อยู่หลังตระกูล ก่อนขนาด — flow สมเหตุผล ไม่ต้องย้าย

### ทุกกลุ่ม — chip-sm tap target

**🟡 ALL-1: chip-sm min-height 40px < 44px guideline**
- Anchor: L239 `.chip-sm .chip{ min-height:40px; padding:6px 12px; font-size:13px; }`
- แก้: `min-height:44px` (เพิ่ม 4px · กระทบ: famSel, g3Sel, mosqSel, rnSel, railSel, slidingOpenType, bottomRail, topRail, ชุดล็อค)
- ไม่แตะ logic ใด

### กลุ่ม 2 — label "แบบงาน"

**🟢 G2-1: label .fam-prodsel กลุ่ม 2 เขียน "แบบงาน" เหมือนกัน**
- แก้พร้อม G1G6-1 เดียวกัน — เปลี่ยน label ใน famSelectorHTML L2384

---

## 4. สิ่งที่ไม่ต้องแก้ (ถูกต้องแล้ว)

| รายการ | สถานะ |
|--------|-------|
| fam/g3/mosq/rn/rail prodsel ย้ายใต้ .i-prod แล้ว | ✓ commit 4c69516 |
| sliding-main-block relocation ขึ้นฟอร์มหลัก | ✓ L3138-3144 |
| ชิปประเภท (chip-2up 52px) | ✓ L238 |
| ประเภทซ่อนเมื่อ G2/G3/G4/G5 (ITYPE_NA) | ✓ L3669 |
| ชิปกลุ่มงาน 7 ปุ่ม 44px | ✓ L234 |
| กล่องฟ้า sliding-main-block ชนิดการเปิด+บาน+ราง | ✓ G1G6-E |

---

## 5. สรุปลำดับความสำคัญ

| ลำดับ | จุด | กลุ่ม | anchor | impact |
|-------|-----|-------|--------|--------|
| 1 | 🔴 G7-1 | G7 | L2726 + L3158 groupGHOpts | zipscreen options หลุดออกมาเห็นทันที |
| 2 | 🔴 G7-2 | G7 | L3154-3157 _hideProd | ป้ายชื่อสินค้าโชว์เมื่อ prod ซ่อน |
| 3 | 🔴 G4-1 | G4 | L2368 FAM_CATS | เพิ่ม cascade ชิปตู้ แทน dropdown ยักษ์ |
| 4 | 🟡 ALL-1 | ทุกกลุ่ม | L239 chip-sm | min-height 40→44px |
| 5 | 🟡 G1G6-1 | G1/G6/G2 | L2384 famSelectorHTML | label "แบบงาน" → "เลือกรูปแบบบาน" bold แดง |
| 6 | 🟡 G4-2 | G4 | L3158 groupGHOpts skipEl | ออปชั่นหลักตู้โผล่ฟอร์มหลัก |
| 7 | 🟢 G2-1 | G2 | L2384 (พร้อมกัน) | label เหมือน G1 |

---

## 6. หลักการทำ

- **เปลี่ยนเฉพาะลำดับ/หน้าตา** ไม่แตะ logic/ราคา/readItem
- ทุก control ซ่อน **ยังต้อง sync ค่าเข้า class เดิม** (pattern: visible chip + hidden select + chSetChip fire change)
- groupGHOpts skipEl pattern: เพิ่ม class พิเศษให้ node แล้วเพิ่ม selector ใน skipEls array (L1831 หรือ logic ก่อน `box.innerHTML=''`)
- ทดสอบ: เปิดแต่ละกลุ่ม → กด cascade ทุกชั้น → เช็คราคาไม่เปลี่ยน
