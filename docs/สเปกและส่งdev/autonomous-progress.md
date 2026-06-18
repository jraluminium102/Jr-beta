# Autonomous Progress — baseline กั้นห้องกระจก (ระบบชุดใหม่)

## Baseline ราคาใบทดสอบ (อัปเดต 2026-06-08)

| ใบ | รวมทั้งสิ้น (withVAT 7%) | เหตุที่เปลี่ยน |
|----|------------------------|----------------|
| quote-FULL-A | **684,800 บาท** | กั้นห้องกระจกเลิกเหมา 318k → คิดราคา auto ตามสูตรจริง (3 ด้าน + หลังคาไวนิล) |
| quote-FULL-B | **8,073,471 บาท** | glasshouse ×3 เดิมเป็นราคาเหมา (420k+506k+318k) → เป็น 3 ชุดที่คิดราคา auto จากสูตร |

## เหตุผลที่ตัวเลข baseline เปลี่ยน

**ระบบเก่า (GH helper):**
- กั้นห้องกระจกเป็น `product glasshouse` → ราคาเหมาที่กรอกมือ (318,000 / 420,000 / 506,000)
- ค่าส่งเข้าใบ = ราคาเหมาเป๊ะ

**ระบบใหม่ (R5.0 ชุดใหม่):**
- กั้นห้องกระจก = ชุด (setbox) ของบานหลักปกติ (group 6)
  - แต่ละด้าน = item group 6 (sliding_euro / fixed_glass / casement_euro ฯลฯ) คิดราคาตามสูตรพื้นที่จริง
  - หลังคา = item group 3 (roof_vinyl / roof_delight) คิดราคาตามสูตรพื้นที่จริง
  - ค่าทำชุด = 5,000 บาท (inject อัตโนมัติเมื่อชื่อชุดมีคำว่า "กั้น")
- ราคาขึ้นกับขนาดที่กรอก ไม่ใช่ราคาเหมา

## coverage

- PRODUCTS ทั้งหมด (ไม่นับ SKIP/เสริม): **188 ตัว** (รวม 1 virtual "ชุดกั้นห้องกระจก")
- ใบ B ครอบคลุม: **188/188** ✓

## ไฟล์ที่แก้

- `scripts/gen-quotes-full.mjs` — ลบ GH() helper, เพิ่ม addGlasshouseSet2(), แก้ jobA/jobB
- `test/calc-glasshouse.mjs` — เขียนใหม่ทดสอบ flow ชุดใหม่ (19 checks)
- `test/gen-formats.mjs` — format-9 เปลี่ยนจาก glasshouse product → ชุดใหม่
- `test/qa-t5-totals.mjs` — TC1a-TC1f เปลี่ยนเป็นทดสอบชุดใหม่
