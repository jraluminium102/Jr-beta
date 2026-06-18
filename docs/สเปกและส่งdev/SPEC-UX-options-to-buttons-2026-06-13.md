# SPEC-UX-options-to-buttons-2026-06-13

สเปก: เปลี่ยน dropdown อุปกรณ์เสริม → ปุ่ม/ชิป + รวมหมวดใน groupGHOpts
วันที่: 2026-06-13 | สถานะ: READ-ONLY สเปก (ห้ามแก้ index.html โดยตรง — developer แชทอื่นทำ)

---

## ภาพรวม friction ที่พบ

| ปัญหา | ผลกระทบ |
|---|---|
| dropdown ≤5 ตัวเลือก ยังเป็น native select | กดมือถือ 2 ขั้น: tap → เลื่อน → tap confirm |
| 7 หมวด accordion ล่าง ⚙ เปิดมากเกินสำหรับงานปกติ | ตาหลุด + หายาก |
| "อื่นๆ ▾" ใน famSelector → native dropdown ทั้งกลุ่ม (~เกือบทุกรุ่น) | มือถือเลื่อนยาวมาก หาของไม่เจอ |
| หมวด "ธรณี" และ "ครอบวงกบ/ติดตาย/ช่องแสง" คนละ accordion | ขั้นตอนเดียวกันแต่กระจายที่ |

---

## ส่วน 1 — Select ที่ควรเปลี่ยนเป็นชิป (≤5 ตัวเลือก)

รูปแบบ: `rfChips('o-XXX', [[val,label],...], defaultVal)` + ซ่อน `<select class="o-XXX" style="display:none;">`
ทุกรายการนี้ logic/ราคาไม่เปลี่ยน — เปลี่ยนเฉพาะ UI input element

### 🔴 ต้องทำ — ใช้บ่อย โผล่ทันทีที่เลือกสินค้า

| # | Class | สินค้า/เงื่อนไข | ตัวเลือก | บรรทัดอ้างอิง | หมายเหตุ |
|---|---|---|---|---|---|
| 1 | o-thresh | บานเปิด (p.cat==='บานเปิด') | std / turtle (2 ตัว) | L2842 | ธรณีกันน้ำ / หลังเต่า+Drop Seal |
| 2 | o-threshf | บานเฟี้ยม (p.cat==='บานเฟี้ยม') | outer / inner (2 ตัว) | L2846 | ธรณีภายนอก / หลังเต่าภายใน |
| 3 | o-shtype | shower (p.id==='shower') | door_fixed / fixed_only / door_only (3 ตัว) | L2864 | รูปแบบ shower |
| 4 | o-shdoortype | shower | swing / sliding (2 ตัว) | L2865 | ประเภทประตู shower |
| 5 | o-frametype | frameless_door | swing / sliding (2 ตัว) | L2869 | ประเภทประตูบานเปลือย |
| 6 | o-framecolor | frameless_door | ขาว/ดำ/บรอนซ์/แชมเปญ/เทาซาฮาร่า/สีอบพิเศษ (6 ตัว) | L2870 | สีเฟรม — 6 ตัวเกิน 5 แต่ใช้บ่อยและ label สั้น → ชิปได้ (ซ่อน "สีอบพิเศษ" ไว้ใน details) |
| 7 | o-motor | p.motor (ประตูรั้วพับ) | 0/80/300 (3 ตัว) | L2916 | ไม่มี / 80กก. / 300กก. |
| 8 | o-lamfilm | roof_laminate | ใส/เขียว/กันร้อน (3 ตัว) | L3020 | ชนิดฟิล์ม |
| 9 | o-lamthick | roof_laminate | 4+4 / 5+5 (2 ตัว) | L3021 | ความหนากระจก |
| 10 | o-wallframe | ฝ้า-ผนัง | อลู / เหล็กชุบ (2 ตัว) | L3194 | โครงสร้าง |
| 11 | o-isothick | isowall | 10/5/7.5 (3 ตัว) | L3196 | ความหนา ISOWALL |
| 12 | o-ceilfinish | ceiling_smooth | ทาสีขาว/รองพื้นขาว/ไม่ทาสี (3 ตัว) | L3199 | |
| 13 | o-smartthick | smartboard (ไม่ใช่ ceiling) | 12/20 (2 ตัว) | L3202 | |
| 14 | o-wallpaint | smartboard | ทาสีขาว/รองพื้นขาว/ไม่ทา (3 ตัว) | L3203 | |
| 15 | o-grdir | ระแนง-เกล็ด | แนวตั้ง/แนวนอน (2 ตัว + blank) | L3174 | ทิศติดตั้ง |
| 16 | o-bocdir | bar_openclose | แนวตั้ง/แนวนอน (2 ตัว) | L3186 | ทิศระแนง |
| 17 | o-bgdir | bar_grid | v/h (2 ตัว) | L3173 | ทิศระแนง 38.1 |
| 18 | o-glassmode | glass_replace | auto/manual (2 ตัว) | L3165 | โหมดกำไร |

### 🟡 ควรทำ — ใช้บ้าง list ไม่สั้นมาก

| # | Class | สินค้า/เงื่อนไข | ตัวเลือก | บรรทัดอ้างอิง | แนะนำ |
|---|---|---|---|---|---|
| 19 | o-gfin | gate (ประตูรั้ว) | 6 ตัว | L3172 | ชิป 4 หลัก (ขาว/ดำ/ซาฮาร่า/ลายไม้สต๊อก) + "อบพิเศษ ▾" พับ |
| 20 | o-railtype | gate | ตรง/โค้ง (2 ตัว) | L3172 | ชิป 2 ตัว ง่ายมาก |
| 21 | o-wallmodel | ฝ้า-ผนัง | ไม่ระบุ + 2 รุ่น | L2979 | ชิป 3 ตัว |
| 22 | o-ckolor | ceiling (ฝ้า PVC) | ดึงจาก p.crates | L3191 | ชิป ถ้า ≤5 · dropdown ถ้า >5 |
| 23 | o-sl-color | solidlower (แผ่นทึบล่าง) | 5 ตัว | L3239 | ชิป 5 ตัว (ต้องซ่อน wrap เดิมให้ยังทำงาน) |

### 🟢 คง dropdown — list ยาวหรือเป็น freeform

| Class | เหตุผล |
|---|---|
| o-roof2 | ~20 รุ่นหลังคา — dropdown เหมาะสม |
| o-roofcolor (polyton) | 8+ สี — dropdown เหมาะสม |
| o-mscolor | COLORS.length (20+) — dropdown |
| o-ftcolor | COLORS.length — dropdown |
| o-bsdoor | 6 รุ่นประตู + "ไม่มี" — ดูง่ายดีในรูปแบบ select |
| o-bsfinish, o-bocfinish | 9-10 ตัว + ราคาต่างกัน — dropdown |
| o-digi, o-stainless | list ยาว DIGI/HANDLE_STAINLESS |
| o-zmodel, o-zfab, o-zctrl | ม่านซิป — list ยาว + label ยาว |
| o-cmechcolor | อยู่ใน hsub พับแล้ว → ok |

---

## ส่วน 2 — แผนรวม 7 หมวด → 4 หมวด (non-roof groupGHOpts)

### สถานะปัจจุบัน 7 หมวด (CATS array L1896–1908)

| ลำดับแสดง (disp) | key | open | ข้อสังเกต |
|---|---|---|---|
| ① (disp:1) | 🚪 ธรณี / ครอบวงกบ / ติดตาย | open:true | ใช้บ่อย |
| ② (disp:2) | 🔧 มือจับ / ล็อค / โช๊ค | open:false | ใช้ปานกลาง |
| ③ (disp:3) | 🪟 มุ้ง | open:false | ใช้บ่อยเฉพาะงานมุ้ง |
| ④ (disp:4) | 📐 คาดตาราง | open:false | ใช้น้อย |
| ⑤ (disp:5) | 🏗️ โครงสร้าง / คาน / ราง / ซ่อน | open:false | รวม legacy kw เยอะ |
| ⑥ (disp:6) | 🧱 แผ่นทึบล่าง / ลูกฟูก | open:false | ใช้น้อย |
| ⑦ (disp:7) | ➕ งานเสริม / หมายเหตุ / OPTION | open:false | catch-all |

### แผนรวม → 4 หมวด

| # ใหม่ | key ใหม่ | disp | open | รวมจาก | keyword ที่ต้องรวม |
|---|---|---|---|---|---|
| A | 🚪 ธรณี · ครอบวงกบ · ช่องแสง | 1 | **true** | ① เดิม | 'ธรณี','ครอบวงกบ','ติดตาย','ช่องแสง','ดรอปพื้น' |
| B | 🔧 มือจับ · ล็อค · มุ้ง · คาดตาราง | 2 | **false** | ② + ③ + ④ | รวม kw ②③④ ทั้งหมด |
| C | 🏗️ โครงสร้าง · แผ่นทึบ · ราง | 3 | false | ⑤ + ⑥ | รวม kw ⑤⑥ ทั้งหมด |
| D | ➕ งานเสริม · หมายเหตุ | 4 | false | ⑦ เดิม | [] catch-all |

**เหตุผล:**
- หมวด B รวม มุ้ง + คาดตาราง เข้ามือจับ: งานเสริมต่อบาน 3 อย่างอยู่ที่เดียว เปิดครั้งเดียว
- หมวด C รวม แผ่นทึบล่าง เข้าโครงสร้าง: ทั้งคู่เป็น "ส่วนเสริมโครงสร้าง" ไม่ใช่ "option บาน"
- หมวด D ยังเป็น catch-all เพื่อไม่ orphan field ไหน

**สิ่งที่ต้องปรับใน groupGHOpts:**

1. เปลี่ยน `CATS` array (non-roof) จาก 7 → 4 รายการตามตาราง
2. รวม `kw` array ของหมวดที่ merge (copy-paste รวมกัน ไม่ลบ)
3. keyword Bug#OPT-001 ยังต้องอยู่: หมวด B ต้อง match 'Cmech','มือจับ' ก่อน ③ 'มุ้ง'
   - วิธีแก้: ใน B ใส่ kw มือจับ/Cmech ก่อน แล้วตาม kw มุ้ง ลำดับเดิม
4. `disp` property ยังต้องมี (ควบคุมลำดับ display แยกจากลำดับ match)

---

## ส่วน 3 — "อื่นๆ" ใน famSelector (154+ รุ่น dropdown)

### ปัญหา
`famPickOther()` → ซ่อนชิปทั้งหมด + โชว์ `.i-prod` native dropdown (PRODUCTS ทั้งกลุ่ม ~10-30 รุ่น/กลุ่ม)
มือถือ: เลื่อน list ยาว + ตัวอักษรเล็ก

### แนวทางที่แนะนำ: ชิปตาม cat + ช่องค้นหา

เมื่อกด "อื่นๆ ▾":
1. โชว์ช่อง `<input type="search" placeholder="ค้นชื่อรุ่น...">` (filter realtime)
2. โชว์ชิปรุ่นทั้งหมดใน cat ปัจจุบัน แบบ chip-grid (ตัดชื่อ cat prefix ออก)
3. เมื่อ filter → ซ่อนชิปที่ไม่ match
4. เมื่อกดชิป → `g3SyncProd(ch, id)` เหมือนเดิม (sync .i-prod hidden)
5. .i-prod (native select) ยังซ่อนอยู่ — เป็น source of truth ให้ readItem

**ข้อดี:** กดเร็ว + ค้นได้ + ไม่แตะ readItem / calcQuote เลย
**สิ่งที่ต้องแก้:** `famSelectorHTML()` (L2496–2512) และ `famPickOther()` (L2493–2495)

### Pattern โค้ดสำหรับ developer

```js
// เพิ่ม helper ใน famSelectorHTML ส่วน "อื่นๆ"
function famOtherHTML(cur, cats, famOther) {
  if (!famOther) return '';
  var models = PRODUCTS.filter(function(q){ return cats.indexOf(q.cat) >= 0 && !_hideRanaeSolo(q); });
  var h = '<div class="fam-other-search" style="margin-top:8px;">';
  h += '<input type="search" class="fam-other-q" placeholder="ค้นชื่อรุ่น..." '
     + 'style="width:100%;height:40px;border:1px solid #E5E7EB;border-radius:8px;padding:0 10px;"'
     + ' oninput="famOtherFilter(this)">';
  h += '<div class="chip-grid fam-other-chips" style="margin-top:6px;">';
  models.forEach(function(q){
    var lbl = q.name;
    cats.forEach(function(c){ lbl = lbl.replace(c, '').trim(); });
    h += '<button type="button" class="chip" data-id="' + q.id + '" onclick="g3SyncProd(this.closest(\'.ch\'),this.dataset.id)">' + lbl + '</button>';
  });
  h += '</div></div>';
  return h;
}
function famOtherFilter(inp){
  var q = inp.value.toLowerCase();
  inp.closest('.fam-other-search').querySelectorAll('.fam-other-chips .chip').forEach(function(btn){
    btn.style.display = (!q || btn.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
  });
}
```

---

## ส่วน 4 — Pattern sync ที่ต้องยึด (rfChips)

ทุก select → ชิป ต้องทำตาม pattern นี้เสมอ:

```js
// 1. select ซ่อน (เก็บ value + trigger onchange เดิม)
h += '<select class="o-XXX" style="display:none;" onchange="calcQuote();">...options...</select>';
// 2. ชิป (rfChips fire change event ให้ select ผ่าน chSetChip)
h += rfChips('o-XXX', [['val1','ป้าย1'],['val2','ป้าย2']], 'defaultVal');
```

**ข้อห้าม:**
- ห้ามลบ `<select>` ออก — readItem ทุกตัวอ่านจาก `.value` ของ select
- ห้ามเปลี่ยน `.value` format/type — calc engine ใช้ค่าเดิม

---

## ส่วน 5 — UX เพิ่มเติม (ไม่บังคับรอบนี้)

| รายการ | เหตุผล | ความยาก |
|---|---|---|
| หมวด B (มือจับ·มุ้ง·คาด) open:false แต่มี badge จำนวน เช่น "(1)" ถ้ามีที่เลือกแล้ว | ช่วยเห็นว่า "ใส่แล้ว" โดยไม่เปิด accordion | กลาง |
| ธรณีหมวด A — เปลี่ยน o-thresh เป็นชิป (รายการ #1 ด้านบน) + เอาออกจาก accordion เป็น inline บนฟอร์มหลัก | ธรณีใช้ทุกงาน — ไม่ควรซ่อนใน accordion | ง่าย |

---

## สรุปตัวเลข

- **dropdown → ชิป ทันที (🔴):** 18 รายการ
- **dropdown → ชิป ควรทำ (🟡):** 5 รายการ
- **คง dropdown:** 10+ รายการ (list ยาว / dynamic)
- **หมวด accordion รวม:** 7 → 4 หมวด
- **"อื่นๆ" ปุ่ม:** เปลี่ยนจาก native dropdown → ชิปกรอง

**ไม่มีรายการไหนแตะ readItem / calcQuote / PRODUCTS** — เปลี่ยนเฉพาะ buildItemOpts + groupGHOpts + famSelectorHTML

---

## ไฟล์ที่ developer ต้องแก้

- `public/calculator/index.html` — ส่วน `buildItemOpts` (L2809–L3326) และ `groupGHOpts` (L1883–L1941) และ `famSelectorHTML` + `famPickOther` (L2493–2512)
- ห้ามแตะ: `calcQuote`, `readItem`, `PRODUCTS`, `COLORS`, ข้อมูลราคาทั้งหมด
