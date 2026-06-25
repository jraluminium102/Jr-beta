# ตรวจ "วิธีคิดราคา / แยกราคาแต่ละส่วน" เทียบดราฟ A
วันที่ตรวจ: 2026-06-25 | ดราฟ: `docs/DRAFT-price-calc-review-A-full-2026-06-24.html`
เคสที่ render: G1 บานเลื่อน (L1/L2/+มุ้ง) · G3 หลังคา (L1/+สีโครง) · G4 ตู้ · G5 มุ้งอย่างเดียว

---

## ผลตรวจ (engine jsdom จริง)

| # | section / โหมด | สถานะ | จุดไม่ตรง (ดราฟ → เว็บ) | selector / fn | เสนอแก้ |
|---|---|---|---|---|---|
| 1 | toolbar: 3 ปุ่ม | OK | ครบ: qmCust / qmSplit / qmFirm · ป้าย ลูกค้า/แยกราคา/วิธีคิดราคา ตรงดราฟ | `#qmCust` `#qmSplit` `#qmFirm` | — |
| 2 | fn: setQMode / qCalcStepLines / qFirmHTML | OK | ทั้ง 3 fn มีจริง · qMode default = cust | `window.qMode` | — |
| 3 | cust mode — ซ่อน q-bd + qcs-block | OK | cust ไม่โชว์กล่องแยกราคา / วิธีคิดราคา ตรงดราฟ | `window.qSplit=false` | — |
| 4 | split mode — G1 บานเลื่อน L1 | OK | q-bd โชว์ 3 บรรทัด: ค่าบาน 22,000 / กระจก รวมในราคา / สี รวมในราคา · reconcile diff=0 | `qBdHTML`, `qBdGet` | — |
| 5 | split mode — G1 + มุ้ง imp21 | OK | q-bd โชว์ 4 บรรทัด: ค่าบาน 22,000 / กระจก รวมในราคา / สี รวมในราคา / มุ้งเฟรมเล็ก 6,000 = รวม 28,000 ตรงดราฟ | `r.breakdown` + `addonLines` | — |
| 6 | **split mode — G3 หลังคา L1 (ไม่มีสีโครง)** | **WARN** | **q-bd ไม่โชว์เลย** เพราะ breakdown มี 1 บรรทัด (ค่าหลังคา 69,600) → logic `lines.length<=1 && !qEdit` return '' · ดราฟ split ต้องการโชว์ "หลังคา+โครง = 72,000" อย่างน้อย 1 บรรทัด | `qBdHTML` L6857 | ดูหัวข้อ "เสนอแก้" ด้านล่าง |
| 7 | split mode — G3 หลังคา + สีโครง | OK | bd 2 บรรทัด (ค่าหลังคา 70,520 + สีโครง 6,480) → q-bd โชว์ถูกต้อง | — | — |
| 8 | firm mode — G1 บานเลื่อน | OK | qcs-block สร้างได้ · มีบรรทัด พื้นที่ / เรต / ปัดขึ้นพัน ครบ · no-print guard มี | `qFirmHTML`, `qCalcStepLines` | — |
| 9 | firm mode — G1 + มุ้ง | OK | step lines: พื้นที่ / เรต 5,700 / มุ้ง 6,000 / ปัดขึ้น 28,000 ตรงดราฟ เป๊ะ | `qCalcStepLines` L8037 | — |
| 10 | firm mode — G3 หลังคา 4×3 | OK | step lines: พื้นที่ 12 ตร.ม. / เรต 5,800 × 12 = 69,600 / ปัดขึ้น 70,000 · ขั้นต่ำ 28,000 (สูงกว่า) ตรงดราฟ | `qCalcStepLines` | — |
| 11 | firm mode — G4 ตู้ cabinet_alu | OK | firm block สร้างได้ · split bd 3 บรรทัด: Future Tech 2 บาน 26,120 + พื้น 2,880 + ชั้น 6,000 | `qFirmHTML` | — |
| 12 | firm mode — G5 มุ้ง imp21 | OK | firm block สร้างได้ · sell 4,000 | `qFirmHTML` | — |
| 13 | firm mode แสดงทั้ง q-bd + qcs-block | OK | firm = split + วิธีคิด ทั้ง 2 โชว์พร้อมกัน ตรงดราฟ | `window.qSplit=true` เมื่อ firm | — |
| 14 | VAT + รวมทั้งสิ้น ทุกโหมด | OK | ทั้ง 3 โหมด (cust/split/firm) โชว์ VAT 7% + รวมทั้งสิ้นครบ | `buildQuoteDoc` | — |
| 15 | no-print guard firm block | OK | qcs-block มี class `no-print` + ข้อความ "ไม่พิมพ์ให้ลูกค้า" | `qFirmHTML` L8052 | — |
| 16 | ผสมบาน subItems — qFirmHTML ไม่ crash | OK | qFirmHTML(it) ไม่ throw เมื่อ subItems=[] | L8037 | — |
| 17 | ผสมบาน subItems — reconcile | OK | qBdGet sum = sell diff=0 (L1 กรณีนี้ subItems ว่าง = งานเดี่ยว) | `qBdGet` L6844-6848 | — |

---

## จุดที่พบ (รายละเอียด)

### #6 — G3 หลังคา L1 split mode ไม่โชว์กล่องแยกราคา

**เคสที่ตรวจ:** imp7 (เมทัลชีท) · 4.0×3.0 ม. · ไม่มีสีโครง

**ตัวเลข:**
- engine: sell = 70,000 | breakdown = [{ ค่าหลังคา (เมทัลชีท...) = 69,600 }] (1 บรรทัด)
- qBdGet คืน 1 บรรทัด: ค่าหลังคา = 70,000 (reconcile ปัดเข้า)
- qBdHTML return '' เพราะ `lines.length<=1 && !qEdit` (L6857)
- ผล: split mode ไม่มีกล่อง "แยกราคา" ใต้รายการ G3

**ดราฟต้องการ:**
- ดราฟ item 2: หลังคา+โครง = 72,000 → split โชว์ "หลังคา+โครง = 72,000" อย่างน้อย 1 บรรทัด
- ไม่ใช่กล่องว่าง แต่ต้องการ "confirm" ว่ายอดนี้คืออะไร

**เหตุผลของ logic เดิม:** `lines.length<=1` ซ่อนเพราะ 1 บรรทัด = ซ้ำยอดรวม → ไม่ต้องโชว์ (L6857 comment: "#4 22มิ.ย.")

**ผลกระทบ:** เฉพาะ G3 หลังคา L1 (ไม่มีสีโครงพิเศษ) · G3+สีโครง ปกติ (2 บรรทัด → โชว์)

**เสนอแก้ (2 option):**
- Option A (ง่ายสุด — ไม่ต้องแก้ logic): ยอมรับว่า G3 L1 ไม่มีกล่องแตกราคา เพราะ 1 บรรทัด = ยอดรวมอยู่แล้ว · ดราฟ item 2 จริงๆ ก็โชว์แค่ "หลังคา+โครง = 72,000" ซึ่งก็คือยอดรายการนั้นเอง
- Option B (ตรงดราฟมากกว่า): เปลี่ยน condition L6857 จาก `lines.length<=1` เป็น `lines.length===0` → ถ้ามี 1 บรรทัดก็โชว์ (ไม่ซ้ำ เพราะ p อาจไม่เท่า sell หลัง reconcile)

---

## สรุปเรียงลำดับ

### ไม่มี FAIL

### WARN 1 จุด (ตัดสินใจต้องการ):
| จุด | section | รายละเอียด | เสนอ |
|---|---|---|---|
| G3 split 1 บรรทัด | #6 qBdHTML L6857 | G3 L1 ไม่มีกล่อง "แยกราคา" เพราะ logic ซ่อน 1 บรรทัด | Option A = ยอมรับ (logic ตั้งใจ) / Option B = แก้ `<=1` → `===0` |

### OK 16/17 จุด
ทุกโหมด (cust/split/firm) ทำงานถูกต้อง · G1/G3/G4/G5 firm block ครบ · ผสมบาน+มุ้ง reconcile ตรง · no-print guard มี · VAT ครบทุกโหมด

---

## หมายเหตุ WARN ที่เป็น false positive
- `active cust_active`: rgb(179,21,29) = #B3151D เหมือนกัน (jsdom แปลง hex เป็น rgb) — ไม่ใช่บั๊ก
- `setbox subItems`: script section 8 ไม่ได้ inject sub-item จริงผ่าน UI (ปุ่ม .add-sub ไม่ได้ถูกกด) — engine subItems logic ทดสอบแยก ผ่านแล้ว

---

*script ตรวจ: `scripts/check-quote-breakdown-vs-draft.mjs` · READ-ONLY · ห้ามแก้ index.html*
