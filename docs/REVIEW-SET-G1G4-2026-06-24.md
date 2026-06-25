# 🛡️ REVIEW-SET G1+G4 กล่องสี L1/L2/L3 — แผนกันพลาดซ้ำ (acceptance criteria + วิธีตรวจอัตโนมัติ)

**วันที่:** 2026-06-24 · **เป้า:** แปลงดราฟ → เกณฑ์ตรวจที่ "วัดได้" + วิธีตรวจอัตโนมัติ เพื่อให้ dev แก้ `public/calculator/index.html` **รอบเดียวเหมือนดราฟ** (ไม่วนแก้แบบ G2/G3)
**สถานะไฟล์:** READ-ONLY — เอกสารนี้คือ "ข้อสอบ" ที่ dev รันเองได้ก่อน push · ห้ามแก้ index.html จากเอกสารนี้

---

## A. ✅ ยืนยัน Canonical เดียว + ไฟล์เก่าที่ควร archive

### 🎯 Canonical (ยึดอันเดียว — ห้ามเปิดอันอื่นมาเทียบ)
| บทบาท | ไฟล์ |
|---|---|
| **ต้นแบบ UX (approve แล้ว)** | `docs/DRAFT-G1G4-L1L2L3-redesign-2026-06-23.html` ⭐ |
| **ใบสั่ง dev (ธง A–E)** | `docs/ORDER-dev-G1G4-L1L2L3-2026-06-23.md` |
| **manifest ก้อน** | `docs/BATCH-G1G4-รอแก้-index-ว่าง-2026-06-23.md` |
| หลักฐานเทสฟอร์มก่อนแก้ | `docs/TEST-G1G4-form-vs-draft-2026-06-23.html` |
| หลักฐานเทสใบ+ราคา | `docs/TEST-G1G4-invoices-2026-06-23.html` |

> ⭐ **DRAFT-G1G4-L1L2L3-redesign-2026-06-23.html คือไฟล์เดียวที่ต้องเหมือนเป๊ะ** สำหรับงานกล่องสี L1/L2/L3 รอบนี้ (ครอบทั้ง G1 แท็บ "🪟 G1 บานกระจก" + G4 แท็บ "📦 G4 ตู้อลู") · ไฟล์ G1/G4 อื่นทั้งหมดเป็นงานฟอร์มรอบก่อน (ฟอร์มชนิดบาน/ผนัง 3 ด้าน) **คนละ scope** — อย่าหยิบมาเทียบกล่องสี

### 🗂️ Sprawl ไฟล์เก่า (มี — เหมือน G2/G3) → ควร archive แยกโฟลเดอร์ (ไม่ลบ · กันสับสนว่าอันไหน canonical)
**G1 ดราฟเก่า (24 ไฟล์ · งานฟอร์มชนิดบาน — ไม่ใช่กล่องสีรอบนี้):**
- `docs/กลุ่ม1-งานบาน-เลื่อนเปิดเฟี้ยม/DRAFT-G1-ux-*.html` (v2–v9 + FINAL/FULL/G6style/v7A/v8 = ~21 ไฟล์)
- `docs/DRAFT-G1-คิดเร็ว-ux-2026-06-19.html` · `DRAFT-G1-เปลือยรวม+L1L3มาตรฐาน-2026-06-22.html` · `DRAFT-G1-ใบตัวอย่าง-ลากจัดบล็อก-2026-06-22.html` · `DRAFT-G1-3กล่อง-บานเลื่อน-2026-06-22.html` · `DRAFT-G1-GROUNDTRUTH-ปุ่มทุกปุ่ม-2026-06-22.html`

**G4 ดราฟเก่า (5 ไฟล์ · งานตู้/ผนัง — ไม่ใช่กล่องสีรอบนี้):**
- `docs/DRAFT-G4-ux-2026-06-12.html` · `docs/DRAFT-G4-ux-2026-06-23.html` · `docs/กลุ่ม4-ตู้/DRAFT-G4-ux-2026-06-11.html` · `DRAFT-G4-ux-FULL-2026-06-14.html` · `DRAFT-G4-ux-v2-2026-06-11.html`

> ⚠️ **`DRAFT-G4-ux-2026-06-23.html` ชื่อชนวันเดียวกับ canonical** — ระวังหยิบผิด · canonical ของกล่องสีคือ `DRAFT-G1G4-...` (มี "G1G4" และ "L1L2L3") ไม่ใช่ `DRAFT-G4-ux-2026-06-23` (อันนั้นเป็น UX ตู้/การ์ดราคารอบ 11)
> **ข้อเสนอ:** ย้ายไฟล์เก่าทั้ง 29 เข้า `docs/_archive/G1G4-pre-L1L2L3/` ก่อนส่ง dev (ลด sprawl · canonical โดดเดี่ยว) — **ถามพี่นัทก่อนย้าย** (อย่าลบ)

---

## B. 📋 ตารางเกณฑ์ตรวจวัดได้ ต่อธง A–E (acceptance criteria)

> หลักการ: ทุกแถว "ตรง/ไม่ตรง" ตอบได้ด้วยตัวเลข/DOM ไม่ใช่ความรู้สึก · ค่าที่ถูกต้องดึงจาก **engine จริง** (COLORS L1019-1042, GLASS L652, g1CoOptNote L1237-1280) ไม่ใช่จากเดโมในดราฟ

### 🎌 ธง A — G1 กล่องสี L1/L2/L3 (`g1-rare-section`)

| # | เกณฑ์ (วัดได้) | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| A-① | L1 checkbox ติ๊ก default | `.i-rare-color`/`#g1l1 equiv` checked=true ตอนเปิดการ์ด · body L2/L3 ซ่อน | DOM: `addItem()` → `.g1-rare-section input[type=checkbox]`.checked===true · `.g1co-l3-wrap` display==='none' |
| A-② | ปลดติ๊ก L1 → โผล่ L2(radio 🟢/🔵)+L3 | ปลด → `.g1co-l3-wrap` display!='none' · มี radio 2 ตัว (real/opt) | DOM: uncheck → fire change → ตรวจ display + radio count===2 |
| A-③ 🔴**บั๊ก A1** | L3 "ไม่เทียบ" ต้อง value=**-1** (ไม่ใช่ 0) | `.g1co-l3c` + `.g1co-l3g` option[0] value==="-1" | DOM: `.g1co-l3c option[0].value==='-1'` · **ปัจจุบันยัง `value="0"` (L6042-6043) = ยังไม่แก้** |
| A-④ 🔴**บั๊ก A1** | engine check `>=0` (เลือก index 0/สีอบขาว ใน L3 ราคาต้องเปลี่ยน) | g1CoOptNote ใช้ `l3ci>=0` `l3gi>=0` ทุกจุด (L1267-1273) | DOM: baseline สีอื่น → L3 เลือก index 0 → OPTION line โผล่ + diff≠0 · ปัจจุบัน L1263/1267-1273 ยัง `>0` |
| A-⑤ | L3 ชุดเดียว (ตัดชิป "L3 อัปอบพิเศษ" ใน color-drill) | ไม่มีชิป L3 ใน colorDrillRender · เหลือแค่ `.g1co-l3-wrap` | DOM: นับ element ที่มีคำ "L3"/"อัปเป็นอบ" ใน color-drill ===0 |
| A-⑥ | L2 สีอลู = **dropdown** 13 สี (ไม่ใช่ชิป) | `<select>` มี 13 option + optgroup 4 หมวด (มาตรฐาน/ซาฮาร่า/ลายไม้สต๊อก/อบพิเศษ) | DOM: select L2 สี options.length===13 · optgroup count===4 |
| A-⑦ | L2 กระจก = dropdown ครบ **66** รุ่น | `.i-glass` options.length===66 | DOM: นับ options · เทียบ GLASS.length (L652=66) |
| A-⑧ 🔴 | ช่องรหัสสี `.i-colorcode-wrap` ย้ายเข้าใต้ dropdown สี (ใน `g1-rare-body`) | อยู่ในลำดับ DOM ต่อจาก select สี L2 · ไม่ลอยที่ chgrid[7] | DOM: `.i-colorcode-wrap` closest('.g1-rare-body')!==null |
| A-⑨ ⚠️**conflict** | รหัสสีโผล่เมื่อ hasCode | **เช็คซ้ำ:** live engine `hasCode=index 8,9,10,11,12` (Fuji Oak/Makha มี hasCode:1 L1033/1035) · **แต่ ORDER/draft บอก 10,11,12 เท่านั้น (Fuji 8,9 ไม่ต้อง)** | ⚠️ **ต้องเคาะก่อนแก้** — ดูหัวข้อ "ประเด็นค้าง" |
| A-⑩ | radio 🟢/🔵 ครอบ picker · กรอบเปลี่ยนสี | กด 🔵 กรอบ/พื้นเป็นฟ้า · มี tag "บวกยอด"/"ไม่บวก" | เว็บสด: เปิด preview กด radio → ดูสีกรอบ (เขียว↔ฟ้า) |
| A-⑪ | L3 มีครบ 3: เทียบสีอลู + เทียบกระจก + ช่องรหัส | `.g1co-l3c` (13+ไม่เทียบ) · `.g1co-l3g` (66+ไม่เทียบ) · ช่องรหัส L3 โผล่เมื่อเลือก hasCode | DOM: นับ options · เลือกอบพิเศษใน L3 → ช่องรหัส L3 display!='none' |
| A-⑫ | marker ＋/－ สลับ (ธง D) | `.g1co-l3det>summary::before` content='＋' ปิด / '－' เปิด · ไม่มี literal ＋ ใน summary | เว็บสด: เปิด/ปิด details ดู marker · ตรวจ CSS rule `[open]` |

### 🎌 ธง B — G4 กล่องสี L1/L2/L3 (ตู้อลู)

| # | เกณฑ์ (วัดได้) | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| B-① | สีหน้าบาน + สีโครง = **dropdown 2 คอลัมน์** | `.cab-co-colgrid` grid 1fr/1fr · 2 select (o-cabfrontcolor FT / o-cabstructcolor rn90) · ไม่ใช่ชิป | DOM: select count ใน colgrid===2 · computed grid-template-columns 2 ค่า |
| B-② | L3 G4 เพิ่ม **เทียบกระจก (66)** | `.cab-co-l3det` มี dropdown กระจก 66 + "ไม่เทียบ" value=**-1** | DOM: select กระจก L3 options.length===67 (66+ไม่เทียบ) · option[0].value==='-1' |
| B-③ 🔴 | L3 ไม่เทียบ value=-1 (กันบั๊ก value ชนแบบ A1) | option "ไม่เทียบ" สีโครง + กระจก ทั้งคู่ value="-1" | DOM: ตรวจ value option[0] ทั้ง 2 select |
| B-④ | ช่องรหัสสี (`o-ftcolorcode`/struct) โผล่เมื่อสีพิเศษ | โผล่ทั้งโครง+หน้าบาน · L3 เพิ่มช่องรหัสอบพิเศษ | เว็บสด: เลือกอบพิเศษโครง/หน้าบาน → ช่องรหัสโผล่ |
| B-⑤ | marker ＋/－ สลับ (`.cab-co-l3det`) | เหมือน A-⑫ | เว็บสด + CSS rule |

### 🎌 ธง C — ลบ imp31

| # | เกณฑ์ | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| C-① | product imp31 ถูกลบ (L806) | ไม่มี `id:'imp31'` ใน PRODUCTS | Grep `imp31` ใน index.html === 0 |
| C-② 🔴**กันพัง** | golden ยัง 150/150 หลังลบ | ถ้า imp31 อยู่ใน golden 150 → ต้อง re-baseline + แจ้งก่อน | `node scripts/golden-snapshot.mjs` ก่อนลบ ดูว่า imp31 อยู่ในชุดไหม |
| C-③ | ไม่มี product อื่น ref/allow_with imp31 | Grep imp31 ทั้งไฟล์ === 0 (รวม MOSQ_GRP_PRODS) | Grep |

### 🎌 ธง D — marker ＋/－ → รวมในเกณฑ์ A-⑫ + B-⑤

### 🎌 ธง E — วิธีคิดราคา L1/L2/L3 (ราคาต้องถูกเป๊ะ · 4 เคส × 2 กลุ่ม = 8)

> **ห้ามแก้สูตรราคา** (`colorPrice(ci,area)` + `GLASS[gi].s × area` มีอยู่แล้ว) · แค่ทำ L1/L2/L3 เรียกถูก · ⚠️ engine ใช้ `GLASS[gi].s` (ไม่ใช่ `.p` แบบเดโมในดราฟ)

| # | เคส | dataset.coOverride | ค่าที่ถูกต้อง (เทสเว็บจริง) | วิธีตรวจ |
|---|---|---|---|---|
| E-1 | L1 สีตามทั้งใบ + global=สีพิเศษ | `'0'` | ยอดรวม **บวก** colorPrice(สี)×พื้นที่ + GLASS.s×พื้นที่ | DOM: ตั้ง global-color สีพิเศษ → grand เพิ่ม |
| E-2 | L2 🟢 ใช้จริง = สีพิเศษ | `'1'` | ยอดรวม **บวก** = colorPrice(สี L2)×พื้นที่ (แทน L1) · เทียบเลขจริง (เช่น สักทอง real +4,000 ตาม memory) | DOM: uncheck L1 → real → เลือกสี → grand เพิ่มเท่า colorPrice |
| E-3 🔴 | L2 🔵 ออปชั่น = สีพิเศษ | `'opt'` | ยอดรวม **ไม่เปลี่ยน (isolate 0)** + ใบมี OPTION line "เปลี่ยน X→Y ±Z" | DOM: opt mode → grand เท่าเดิม · quoteContent มี "OPTION"/"เปลี่ยนสี" |
| E-4 🔴 | L3 เลือกสี (รวม index 0/สีอบขาว) | (ต่อจาก L2) | ยอด **ไม่เปลี่ยน** + OPTION line ±Z ถูก (signed: ใหม่−เดิม) · **เลือกสีอบขาว index 0 ได้** (บั๊ก A1) | DOM: L3 เลือก index 0 ขณะ base สีอื่น → OPTION line โผล่ + grand เท่าเดิม |
| E-5 | G4 เคส E1-E4 ซ้ำ + สีโครง/หน้าบานแยก | — | สีโครง (rn90×พื้นที่อลู) + สีหน้าบาน (FT) **คิดแยก** · ผนังกระจก/สมาร์ทบอร์ด=ไม่คิดค่าสีโครง · ตู้ +6,000/ฝา +3,000 (memory) | check-g4.mjs + DOM eval |

---

## C. 🤖 วิธีตรวจอัตโนมัติหลัง dev (รันก่อน push ทุกครั้ง)

### ① golden-snapshot — กันราคา base เพี้ยนข้ามกลุ่ม (บังคับ)
```
node scripts/golden-snapshot.mjs        # ต้องขึ้น 150/150 เป๊ะ (ก่อน + หลังแก้)
```
- ก่อนแก้: รันเก็บ baseline ปัจจุบัน · หลังแก้: ต้องเท่าเดิมทุกตัว
- **ข้อยกเว้นเดียว:** ถ้าลบ imp31 แล้ว imp31 อยู่ในชุด 150 → baseline ลด 1 ตัว = **หยุด แจ้งพี่นัทก่อน** อย่า re-save เงียบๆ

### ② check-g1.mjs + check-g4.mjs — ฟอร์ม/ออปชั่น/ราคา
```
node scripts/check-g1.mjs <วันที่>      # → docs/กลุ่ม1.../CHECK-G1-vs-draft-<วันที่>.html
node scripts/check-g4.mjs <วันที่>      # → docs/กลุ่ม4-ตู้/CHECK-G4-vs-draft-<วันที่>.html
```
- ✅ **มีทั้ง 2 script แล้ว** (check-g1 = ปุ่ม/ออปชั่น/ราคา 4 มิติ · check-g4 = ผนัง 3 ด้าน 6 มิติ)
- 🔴 **แต่ทั้งคู่ยังไม่ครอบกล่องสี L1/L2/L3 ใหม่** (check-g1 ตรวจปุ่ม 6 กลุ่ม + o-gridmark/o-mosq · check-g4 ตรวจผนัง) → **ต้องเพิ่มเคส L1/L2/L3 ใน script หรือทำ DOM eval แยก** (ดู ③)

### ③ DOM eval ต่อธง (golden จับไม่ได้ — บทเรียน glassWallArea)
> ฟีเจอร์ option-driven (สีพิเศษ/กระจก/L3) golden ไม่จับ เพราะ golden render แค่ base config · **ต้องรันสคริปต์ DOM eval แยก** (jsdom render → ติ๊ก → อ่าน grand/quoteContent) แต่ละเคส:

**รายการ DOM eval ที่ต้องรัน (เขียนเป็น .mjs ชั่วคราว หรือเพิ่มใน check-g1/g4):**
1. **A-③/A-④/E-4 (บั๊ก A1):** render G1 → uncheck L1 → opt mode → L3 เลือก **index 0 (สีอบขาว)** ขณะ baseline สีอื่น → assert: OPTION line โผล่ใน quoteContent **AND** grand ไม่เปลี่ยน · (ถ้า OPTION ไม่โผล่ = บั๊ก A1 ยังอยู่)
2. **A-⑥/A-⑦:** assert select L2 สี options.length===13 + กระจก===66
3. **A-⑧:** assert `.i-colorcode-wrap` อยู่ใน `.g1-rare-body`
4. **E-2 (L2 real):** เลือกสักทอง real → assert grand เพิ่ม ~+4,000 (เทียบ colorPrice จริง)
5. **E-3 (L2 opt isolate):** opt mode สีพิเศษ → assert grand === grand ก่อนเลือกสี (isolate 0)
6. **B-①/B-②:** assert colgrid select count===2 + L3 กระจก options===67 (66+ไม่เทียบ) value[0]==='-1'
7. **E-5 (G4):** ตู้สีพิเศษ real → assert struct+front คิดแยก (ตู้ +6,000 / ฝา +3,000)
8. **console error:** ตรวจ jsErr===0 ทุกเคส (กันบั๊กแบบ glassWallArea undefined)

### ④ เว็บสดจริง (เปิด preview) — เฉพาะ visual ที่ DOM eval จับไม่ได้
- A-⑩ radio กรอบเปลี่ยนสี (เขียว↔ฟ้า) · A-⑫/B-⑤ marker ＋/－ สลับ · optgroup จัดหมวดถูก · 2 คอลัมน์ G4 เรียงสวย
- screenshot ค้างใน env นี้ → ใช้ DOM eval + เปิด preview ดูตาเปล่า · แคป before/after ส่งพี่นัท

---

## D. 🚦 ลำดับส่ง dev + กับดัก G1/G4 (จาก memory — เคยเจอจริง)

### ลำดับส่ง dev
1. `git pull --rebase` (รับงานแชทอื่นก่อน · index.html มีแชทอื่นแก้)
2. `node scripts/golden-snapshot.mjs` เก็บ baseline ก่อนแก้ (ยืนยัน 150/150)
3. **calculator-dev** แก้ตาม ORDER ธง A→E ทีละธง · golden 150/150 ทุกธง · **ไม่ push** รายงานกลับ
4. **draft-fidelity-checker** + **price-guardian** ตรวจ (เทียบ canonical + golden + DOM eval ③)
5. Chat A ตรวจซ้ำ (false positive เยอะ) → เปิด preview เว็บสด → แคป before/after → push origin HEAD:main
6. checklist ปิดท้ายต้องครบทุกข้อก่อน push

### ⚠️ กับดัก G1/G4 ที่เคยทำพัง (อย่าพลาดซ้ำ)
| กับดัก | รายละเอียด | กันยังไง |
|---|---|---|
| 🔴 **L3 value ชน (บั๊ก A1)** | "ไม่เทียบ" value=0 ชน "สีอบขาว" index 0 · engine `l3ci>0` ตัด index 0 → เลือกสีอบขาวใน L3 ไม่มีผล | value=-1 + engine `>=0` (HTML L6042-6043 + engine L1263/1267-1273 **คู่กัน**) · เทส E-4 |
| 🔴 **glassWallArea undefined** | ฟีเจอร์ option-driven golden จับไม่ได้ · bug ขึ้นตอน render จริง | DOM eval ③ ทุกเคส + assert jsErr===0 |
| ⚠️ **hasCode index conflict** | live engine Fuji Oak/Makha (8,9) **มี** hasCode:1 · แต่ ORDER บอก "Fuji 8,9 ไม่ต้องรหัส" | **เคาะก่อนแก้** (ดูประเด็นค้าง) — ถ้าจะให้ Fuji ไม่มีรหัส ต้องแก้ COLORS engine ด้วย ไม่ใช่แค่ UI |
| 🟠 **dropdown ชนค่า (selectedIndex)** | chipify/select เคยชนค่า (o-closer/o-finish) · L2 dropdown ต้องอ่าน `.i-color`.value เดิม | engine อ่าน .i-color/.i-glass value เดิม → ราคาไม่กระทบ (แค่ chip→dropdown) · golden 150/150 |
| 🟠 **imp31 อยู่ใน golden** | ลบ imp31 อาจทำ golden ลด 1 | C-② เช็คก่อนลบ · re-baseline = แจ้งก่อน |
| 🟠 **component ร่วม → ลามกลุ่มอื่น** | กล่องสี/มุ้ง ใช้ component ร่วม 7 กลุ่ม · แก้ที่เดียวลามหมด | scope G1+G4 · เปิด G2/G3/G5/G6/G7 ดู 1-2 กลุ่มว่าไม่พัง · golden 150/150 |
| 🟠 **โหมดเร็ว (.qi-) พัง** | ฟอร์ม 2 โหมด (.i-* เต็ม / .qi-* เร็ว) · แก้โหมดเต็มอาจลืมเร็ว | เทสโหมดเร็วไม่พังหลังแก้ |

---

## E. ✅ Checklist "ผ่านทุกข้อ = เหมือนดราฟ" (dev ติ๊กก่อน push)

**ราคา/regression:**
- [ ] golden-snapshot **150/150** ก่อน + หลัง (imp31 ลบแล้วยัง 150 หรือ re-baseline แจ้งแล้ว)
- [ ] G2/G3/G5/G6/G7 หน้าตา+ราคาไม่เปลี่ยน (เปิดดู 1-2 กลุ่ม)
- [ ] โหมดเร็ว (.qi-) ไม่พัง
- [ ] console jsErr === 0 ทุกเคส DOM eval

**G1 (ธง A):**
- [ ] A-③/A-④ บั๊ก A1 หาย: L3 "ไม่เทียบ" value=-1 + engine `>=0` · เลือกสีอบขาว(index 0)ใน L3 ได้ (E-4)
- [ ] A-⑤ L3 ชุดเดียว (ตัดชิป L3 ใน color-drill)
- [ ] A-⑥ L2 สีอลู dropdown 13 + optgroup 4 · A-⑦ กระจก dropdown 66
- [ ] A-⑧ รหัสสีย้ายเข้าใต้ dropdown สี (ใน g1-rare-body)
- [ ] A-⑨ hasCode ตามมติที่เคาะ (เช็คซ้ำ Fuji 8,9)
- [ ] A-⑩ radio ครอบ picker กรอบเปลี่ยนสี · A-⑪ L3 ครบ 3 (สี/กระจก/รหัส) · A-⑫ marker ＋/－

**G4 (ธง B):**
- [ ] B-① หน้าบาน/โครง dropdown 2 คอลัมน์ · B-②/B-③ L3 +กระจก 66 value=-1
- [ ] B-④ รหัสสีโผล่สีพิเศษ (โครง+หน้าบาน+L3) · B-⑤ marker ＋/－

**ราคา L1/L2/L3 (ธง E · 8 เคส):**
- [ ] E-1 L1 บวก · E-2 L2🟢 บวกเท่า colorPrice · E-3 L2🔵 isolate 0 + OPTION line · E-4 L3 ไม่บวก + OPTION ±Z (รวม index 0)
- [ ] E-5 G4 ทั้ง 4 เคส + สีโครง/หน้าบานแยกถูก

**ทั่วไป:**
- [ ] C imp31 ลบ (Grep===0) · แคป before/after G1+G4 ส่งพี่นัท

> **จุดไหนไม่ชัด → ถามก่อนแก้ ห้ามเดา** (กันแก้เกินรอบ)

---

## 🔴 ประเด็นค้าง ต้องเคาะก่อนส่ง dev

1. **✅ hasCode Fuji — เคาะแล้ว 24มิ.ย.:** **Fuji Oak/Makha (8,9) มีช่องรหัส (ตาม engine `hasCode:1`)** · **ห้ามแก้ COLORS engine** · ดราฟ + เกณฑ์ A-⑨ ถูกแล้ว · ของเดิม ORDER/memory ที่ว่า "Fuji ไม่ต้องรหัส" = ยกเลิก · hasCode = index 8,9,10,11,12
2. **archive sprawl:** ✅ พี่เลือกย้าย แต่ **เลื่อนทำตอน index/แชท G3 ว่าง** (กันชน) — list 29 ไฟล์อยู่ส่วน ข ของไฟล์นี้
3. **✅ gate ทำแล้ว 24มิ.ย.:** `scripts/check-g1g4-colorbox.mjs` (15 เกณฑ์ · รัน `node scripts/check-g1g4-colorbox.mjs`) · **baseline ก่อนแก้ = 🟢8/🔴7** (🔴 = A1 value=0 ×2 · engine l3ci>0/l3gi>0 ×2 · A3 L2 dropdown · A4 กระจก dropdown · C imp31 — ตรงงานใน ORDER เป๊ะ) · **หลัง dev ต้อง 🟢 ครบ 15 (exit 0) = เหมือนดราฟ** · ใช้คู่ golden 150/150 + check-g1.mjs + เทสเว็บสด
