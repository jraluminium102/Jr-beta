# SPEC-UX-form-6groups-2026-06-13

สเปก layout/CSS แท็บ Quote — แก้ size-row + ปุ่ม 6 กลุ่ม  
วันที่: 2026-06-13  
READ-ONLY (ห้ามแก้ index.html โดยตรง — developer/แชท B ใช้สเปกนี้)  
เปลี่ยนแค่ layout/CSS ไม่แตะ logic/ราคา ทุก class/id คงเดิม

---

## สรุปปัญหาหลัก (2 จุด พี่นัทย้ำ)

| # | จุด | สาเหตุ (โค้ด) | ผลที่เห็น |
|---|-----|----------------|-----------|
| 1 | **size-row: "ชุด" หลุดไปใต้บล็อกฟ้า** | buildItemOpts ~L3246: relocation ย้าย `.sliding-main-block` มาแทรกหลัง `.i-panels-wrap` ใน DOM ของ `.size-row` ทำให้ layout order เป็น [กว้าง][สูง][panels-wrap → ถูกดูดเข้า SMB] [ชุด] แต่ SMB ถูก insert ก่อน `i-qty` จึงแทรก block-element กลางแถว | บนมือถือ "ชุด" ขึ้นบรรทัดใหม่ใต้กล่องฟ้า |
| 2 | **ปุ่ม cascade selector: เรียงสวย แต่บางกลุ่มยังมีจุดเล็กน้อย** | ดูรายละเอียด G2/G4/G5 ด้านล่าง | ปุ่มบางชุดกว้างไม่เท่า / หมวดกระจาย |

---

## ส่วน 1 — size-row (🔴 ต้องทำ · สำคัญสุด)

### สภาพปัจจุบัน

```
.size-row (flex-wrap) ใน HTML template (addItem ~L2657-2663):
  [itype-seg: ประเภท ประตู/หน้าต่าง]
  [div: กว้าง (ม.)]
  [div: สูง (ม.)]
  [.i-panels-wrap: บาน stepper]   ← buildItemOpts ดูดออกเข้า sliding-main-block
  [div: ชุด]
```

หลัง buildItemOpts รัน (~L3246-3252) เมื่อสินค้าเป็นบานเลื่อน:

```
DOM จริง ใน .chgrid:
  .size-row
    [itype-seg]
    [กว้าง]
    [สูง]
    ← .sliding-main-block ถูก insert ตรงนี้ (หลัง panels-wrap เดิม)
       └─ .smb-panels-slot
       └─ .i-panels-wrap  (ย้ายเข้ามา)
    [ชุด]  ← ยังอยู่ใน .size-row แต่อยู่หลัง SMB ที่เป็น full-width block
```

ผลคือ `ชุด` กดใหม่อยู่ใน flex แต่ SMB ที่มี `flex:none; width:100%` ดันมันลงบรรทัดถัดไป

### วิธีแก้ที่แนะนำ (Option A — ย้าย i-qty ออกจาก size-row)

**เป้าหมาย:** แยก `ชุด` ออกจาก `.size-row` ให้มันอยู่ใต้ sliding-block อย่างตั้งใจ โดยจัด layout ใหม่เป็น 2 แถว

**แถวที่ 1 (size-row เดิม — คงแค่ขนาด+ประเภท):**
```
[ประเภท] [กว้าง] [สูง] [บาน stepper]
```

**แถวที่ 2 (อยู่ใต้ SMB — ชุด+ราคาต่อชุด):**
```
[ชุด] ← ขนาด 58px เดิม
```

#### การเปลี่ยนแปลงที่ต้องทำ

**1. HTML template addItem (~L2657-2663): แยก i-qty ออกจาก size-row**

ก่อน (บรรทัดเดิม ~L2662):
```html
`<div style="flex:0 0 auto;"><label>ชุด</label><input class="i-qty" type="number" step="1" min="1" value="1" style="width:58px;"></div>`+
`</div>`+  /* ปิด size-row */
```

หลัง (แยกออกมา ต่อหลัง size-row ปิด):
```html
`</div>`+  /* ปิด size-row */
`<div class="full qty-row" style="display:flex;align-items:flex-end;gap:8px;margin-top:0;">`+
  `<div style="flex:0 0 auto;"><label>ชุด</label><input class="i-qty" type="number" step="1" min="1" value="1" style="width:58px;height:40px;text-align:center;"></div>`+
`</div>`+
```

**2. CSS (~L246-247): เพิ่ม .qty-row**

เพิ่มหลัง `.size-row > div{ margin:0; }`:
```css
.qty-row{ display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; }
```

**3. buildItemOpts (~L3246-3252): sliding-main-block insert ลงใน .qty-row แทน**

เปลี่ยน target ของ `insertBefore`:
```js
// เดิม: insert SMB หลัง i-panels-wrap ใน size-row (ทำให้ qty หลุด)
_pw.parentNode.insertBefore(_smb, _pw.nextSibling);

// ใหม่: insert SMB หลัง .size-row (หรือหลัง .qty-row)
// หา qty-row ซึ่งอยู่หลัง size-row
var _qtyRow = d.querySelector('.qty-row');
if(_qtyRow && _qtyRow.parentNode){
  _qtyRow.parentNode.insertBefore(_smb, _qtyRow);  // SMB อยู่เหนือ qty-row
}
```

ผลลัพธ์ DOM หลังแก้:
```
.size-row: [ประเภท][กว้าง][สูง][บาน stepper — ถ้าไม่ใช่บานเลื่อน]
.sliding-main-block (บานเลื่อน): [ชนิดเปิด][บานทั้งหมด stepper][ติดตาย][เปิด N บาน][ราง]
.qty-row: [ชุด]
.cg-row: [สีอลู][กระจก]
```

**4. ALLG 2.2 (~L2039): ซ่อน i-qty ในโหมด GH**

เดิมซ่อนผ่าน `el.parentElement` — หลังแก้ i-qty อยู่ใน `.qty-row` ต้องอัปเดต selector:
```js
// เดิม
(s==='.i-qty')?el.parentElement

// ใหม่
(s==='.i-qty')?el.closest('.qty-row')
```

### Option B (ทางเลือก — ถ้าไม่อยากแตะ build logic)

เพิ่ม CSS ให้ sliding-main-block ไม่ทำลาย flex row:

```css
/* force SMB ออกไปหลัง size-row โดย order */
.size-row .sliding-main-block{
  order: 99;
  flex: 0 0 100%;
}
/* ชุด ลง order ที่ต่ำกว่า SMB */
.size-row .i-qty-wrap{ order: 10; }
```

ข้อเสีย Option B: SMB ยังอยู่ใน size-row (DOM ยุ่ง) · ชุดจะอยู่บรรทัดเดียวกับ SMB ไม่ใช่ใต้ · ไม่แนะนำ

---

## ส่วน 2 — ปุ่มเลือกแบบ/cascade 6 กลุ่ม (🟡 ควร · ตรวจพบจากโค้ด)

### G1 บานกระจก (fam-prodsel)

**สภาพ:** famSelectorHTML ~L2480  
- chip-grid (auto-fill minmax 92px) → บนมือถือ 3 คอลัมน์ ขนาดเท่ากัน  
- ปุ่ม: 10 ปุ่มรูปแบบบาน + ปุ่ม "อื่นๆ" = รวม 11 ปุ่ม → แถว 3 col: แถวสุดท้าย 2 ปุ่มกว้างกว่า  

**แก้:** เพิ่ม class `cg3` ให้ chip-grid ใน famSelectorHTML เมื่อ grp=1 (3 คอลัมน์ตลอด บนทุกหน้าจอ):
```js
// ~L2484
h+='<label class="opt" style="width:100%;margin:0;"><b ...>'+_famHead+'</b>'
+ '<div class="chip-grid'+(grp==='1'?' cg3':'')+'">'; 
```

แถวสุดท้าย 2 ปุ่มยังกว้างเท่ากันถ้าใช้ `grid-template-columns:repeat(3,1fr)` (not auto-fill)

**หมายเหตุ:** ถ้าทีมเห็นว่า 10+ ปุ่ม cg3 ยาวเกินไป ให้พิจารณา cg4 (4 คอลัมน์ ≥ 400px · 3 คอลัมน์ มือถือ) ซึ่งทำได้โดยใช้ `cg4` + media query ที่มีอยู่แล้ว

**ส่วนรุ่น (หลัง famSelectorHTML):** chip-grid ปกติ → ปุ่มเท่ากัน ไม่ต้องแก้

---

### G2 ระแนง/รั้ว/ราวกันตก (rn-prodsel + rnSelectorHTML)

**สภาพ:** rnSelectorHTML ~L2409, rnChips ~L2402  
- rnChips สร้าง `<div class="chip-grid">` → auto-fill → OK  
- แต่ label.opt ของ rnSelectorHTML มี `display:flex` ปกติ → chip-grid ถูกบีบถ้า label ไม่ได้เป็น block  

**ตรวจ:** L248 `label.opt:has(> .chip-grid){ display:block; }` ครอบอยู่แล้ว  
**สถานะ:** CSS ครอบแล้ว ไม่ต้องแก้เพิ่ม  

**จุดที่ยังเหลือ (🟡):** railSelectorHTML ~L2518 ใช้ `rnChips` ซึ่ง label ห่ออยู่ใน `.opt` ปกติ — CSS L248 ครอบแล้ว → OK

---

### G3 หลังคา/ฝ้า-ผนัง (g3-prodsel)

**สภาพ:** g3SelectorHTML ~L2317  
- หมวด "กลุ่มวัสดุ" + "รุ่น" แต่ละหมวดใช้ chip-grid  
- L248 ครอบ `label.opt:has(> .chip-grid)` → ปุ่มเต็มกว้าง  

**สถานะ:** ไม่มีปัญหา — ปุ่มเท่ากัน  

---

### G4 ตู้อลู (famSelectorHTML grp=4)

**สภาพ:** famSelectorHTML ~L2480 เมื่อ grp=4  
- cats: ตู้อลู / ฝาตู้ = 2 หมวด  
- chip-grid auto-fill minmax 92px → 2 ปุ่มกว้างมาก บนหน้าจอใหญ่  

**แก้ (🟡):** เพิ่ม `cg2` เมื่อ grp=4:
```js
h+='<div class="chip-grid'+(grp==='4'?' cg2':'')+(grp==='1'?' cg3':'')+'">'; 
```
CSS `cg2` มีอยู่แล้ว L252 → 2 คอลัมน์เสมอ

---

### G5 มุ้ง (mosq-prodsel)

**สภาพ:** mosqSelectorHTML ~L2344  
- หมวดมุ้ง (3-4 ปุ่ม) + รุ่น (2-5 ปุ่ม)  
- chip-grid → L248 ครอบ → ปุ่มเท่ากัน  
- label.opt `style="width:100%"` ในแต่ละหมวด — OK  

**สถานะ:** ไม่มีปัญหา

---

### G6 กั้นห้องกระจก (famSelectorHTML grp=6)

**สภาพ:** famSelectorHTML ~L2480 เมื่อ grp=6  
- cats: บานเลื่อน / บานเปิด / ติดตาย (3 ปุ่ม) + อื่นๆ = 4 ปุ่ม  
- chip-grid auto-fill minmax 92px → 4 ปุ่มบนมือถือ: แถว 1 = 3 ปุ่ม + แถว 2 = 1 ปุ่มกว้างเต็ม  

**แก้ (🟡):** เพิ่ม `cg2` หรือ `cg4` เมื่อ grp=6:
```js
// รวมเงื่อนไขในบรรทัดเดียว
var _cgClass = {'1':'cg3','4':'cg2','6':'cg2'}[grp]||'';
h+='<div class="chip-grid'+(_cgClass?' '+_cgClass:'')+'">'; 
```
cg2 → 2 คอลัมน์เสมอ (บานเลื่อน/บานเปิด · ติดตาย/อื่นๆ) — อ่านง่ายกว่า

---

## ส่วน 3 — รายการแก้ทั้งหมด (เรียงลำดับ)

### 🔴 ต้องทำ

| # | จุด | ไฟล์/บรรทัด | action |
|---|-----|-------------|--------|
| R1 | **size-row: แยก i-qty ออกเป็น .qty-row** | addItem template ~L2662 | ลบ `div ชุด` จาก size-row + เพิ่ม `.qty-row` ต่อหลัง `</div>` ปิด size-row |
| R2 | **CSS: เพิ่ม .qty-row** | CSS ~L247 | `css .qty-row{ display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; }` |
| R3 | **buildItemOpts: SMB insert เหนือ .qty-row** | ~L3246-3248 | เปลี่ยน `_pw.parentNode.insertBefore(_smb, _pw.nextSibling)` → insert SMB เหนือ `.qty-row` |
| R4 | **GH ซ่อน i-qty: ใช้ .qty-row** | ~L2039 | `(s==='.i-qty')?el.closest('.qty-row')` |

### 🟡 ควร (layout ดีขึ้น)

| # | จุด | ไฟล์/บรรทัด | action |
|---|-----|-------------|--------|
| Y1 | **G1: chip-grid cg3** | famSelectorHTML ~L2484 | เพิ่ม `cg3` เมื่อ grp=1 → ปุ่มรูปแบบบาน 3 คอลัมน์เท่ากันตลอด |
| Y2 | **G4: chip-grid cg2** | famSelectorHTML ~L2484 | เพิ่ม `cg2` เมื่อ grp=4 → 2 ปุ่ม (ตู้/ฝา) ขนาดสมส่วน |
| Y3 | **G6: chip-grid cg2** | famSelectorHTML ~L2484 | เพิ่ม `cg2` เมื่อ grp=6 → 4 ปุ่ม 2 คอลัมน์ เรียบร้อย |

---

## ส่วน 4 — จุดอ้างอิงโค้ด (developer ใช้ค้นหา)

```
addItem HTML template:   ~L2645 (function addItem)
  size-row div:          L2657
  i-panels-wrap:         L2661
  i-qty:                 L2662
  cg-row (สี/กระจก):    L2665

buildItemOpts:           ~L2790 (function buildItemOpts)
  cleanup SMB orphan:    L2806
  sliding-main-block G1: L2906
  smb-panels-slot:       L2911
  SMB relocation:        L3246-3252
  SMB insert i-panels-wrap into SMB: L3250

famSelectorHTML:         L2480
  chip-grid header:      L2484

mosqSelectorHTML:        L2344
g3SelectorHTML:          L2317
rnSelectorHTML:          L2409
railSelectorHTML:        L2518

CSS size-row:            L245-247
CSS chip-grid:           L249-254
CSS fam/rn/g3/mosq:      L244, L248
```

---

## ส่วน 5 — กฎ (developer อ่านก่อนแก้)

1. ห้ามแตะ logic ราคา/การคำนวณ — แก้แค่ class/style/DOM position
2. ทุก class เดิมคงอยู่ — อย่าเปลี่ยนชื่อ `.i-qty`, `.i-panels-wrap`, `.sliding-main-block`
3. `.qty-row` ใหม่ต้องซ่อนได้ด้วย `display:none` (GH mode) — ตรวจว่า closest ของ i-qty หาถูก
4. หลังแก้: ทดสอบเปิดสินค้า 4 รายการ — บานเลื่อน (SMB มี) / บานเปิด (SMB ไม่มี) / ระแนง (G2) / มุ้ง (G5) — ดูว่า size-row เรียบร้อยทุกกรณี
5. สินค้าที่ไม่มี sliding-main-block: `i-qty` ยัง render ใน `.qty-row` ได้ปกติ — ไม่ต้องเพิ่มเงื่อนไข
