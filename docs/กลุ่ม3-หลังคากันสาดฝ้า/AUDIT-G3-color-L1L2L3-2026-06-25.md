# AUDIT G3 สีโครง L1/L2/L3 — 2026-06-25

ตรวจ: โหมดเต็ม G3 หลังคา · render jsdom + อ่าน source
เกณฑ์: DRAFT-G3-สีโครง-L1L2L3-ติ๊กโผล่-2026-06-23.html + DRAFT-G3-ภาพรวมครบ-2026-06-24.html

รุ่นที่ตรวจ: roof_vinyl / roof_polyton / imp7 (เมทัล) / imp15 (ชินโค)
ผล consistency ข้ามรุ่น: สม่ำเสมอ 4/4 (โครงสร้าง L1/L2/L3 เหมือนกันทุกรุ่น)

---

## ตาราง: ดราฟ vs เว็บ

| # | ส่วน | ดราฟกำหนด | เว็บเป็น | สถานะ |
|---|------|-----------|----------|--------|
| 1 | L1 row | มีบรรทัดเดียว "L1 · ทั้งใบ: [ชื่อสี] (ฟรี/+X) ⟳" | มีบรรทัดเดียว "L1 · ทั้งใบ: [ชื่อสี] ⟳" — ไม่มี `(ฟรี)` / `(+X บาท)` | RED ขาด |
| 2 | L3 ซ้อนใน L2 | L3 toggle + body อยู่ใน `l2body` (tg-body ของ L2) — L3 ซ่อน/โชว์พร้อมกับ L2 | L3 toggle + body อยู่นอก `rf-l2-host` ระดับเดียวกับ L2 toggle — L3 label แสดงตลอดแม้ L2 ปิด | RED ขาด |
| 3 | L3 หมวดสี (catChips) | L3 มีหมวดสี (l3catChips) + chips สีต่อหมวดแยก (ดราฟ 24มิ.ย. line 238-241) | L3 ใช้ `msftColorChips` flat list ไม่มีหมวดสีแยก | RED ขาด |
| 4 | L1 แสดงราคาสี | ดราฟ 23มิ.ย. line 82-83: `(ฟรี)` หรือ `(+X)` อัปเดตตาม global-color | เว็บ L1 row ไม่มี price span (แสดงแค่ชื่อสี + ⟳) | RED ขาด |
| 5 | L2 default ซ่อน | L2 host ซ่อนจนกว่าจะติ๊ก | L2 host ซ่อน default: PASS | GREEN |
| 6 | L2 label | "ใช้สีต่างจากทั้งใบ — เฉพาะหลังคานี้" | "L2 · ใช้สีต่างเฉพาะหลังคานี้ (สีจริง · บวกยอด)" — ต่างเล็กน้อย | GREEN (ยอมรับ — ดราฟ 24มิ.ย. ไม่ขัด) |
| 7 | L2 หมวดสี (catChips) | มาตรฐาน/ซาฮาร่า/ลายไม้/อบพิเศษ | colorDrill: มาตรฐาน/ซาฮาร่า/ลายไม้/อบพิเศษ | GREEN |
| 8 | L2 chips สี | ชิปต่อหมวด + จุดสีกลม | chips ต่อหมวด + `.cdot` จุดสีกลม | GREEN |
| 9 | L2 open behavior | ติ๊กแล้ว L2 host โผล่ | ติ๊กแล้ว host โผล่: PASS | GREEN |
| 10 | L2 uncheck ล้าง L3 | ปิด L2 → force uncheck + ซ่อน L3 host | rfL2CbToggle ทำ: force uncheck l3cb + ซ่อน l3-host | GREEN |
| 11 | L3 label text | "เทียบราคา OPTION — ถ้าเปลี่ยนสีอื่น +/- เท่าไร" | "L3 · เทียบราคา สี/วัสดุมุง (ออปชั่น · ไม่บวกยอด)" | GREEN (ความหมายตรง) |
| 12 | L3 chips สีโครง | chips สีเทียบ (ตาม catChips) | msftColorChips 12 chips (index 2-12, ไม่มีหมวด) | ORANGE เกิน–ขาด |
| 13 | L3 เทียบวัสดุมุง | `select` เทียบวัสดุมุงอื่น | `rfChips` + select ซ่อน (วัสดุมุง 18 chips) | GREEN |
| 14 | L3 codeRow สีพิเศษ | codebox โผล่เมื่อเลือกสีมีรหัส | `.l3coderow` โผล่ตาม hasCode | GREEN |
| 15 | L3 host hidden default | ซ่อนจนกว่าติ๊ก | hostHidden=true default: PASS | GREEN |

---

## สรุปจุดไม่ตรง (RED ก่อน)

### RED 1 — L3 ไม่ซ้อนใน L2-host
- ดราฟ: L3 toggle + body อยู่ใน `l2body` (tg-body ภายใน L2) — L3 มองเห็นเฉพาะเมื่อ L2 เปิด
- เว็บ: L3 label/toggle อยู่นอก `rf-l2-host` เป็น sibling ของ L2 toggle — L3 toggle โชว์ตลอด แม้ L2 ปิด (แม้ rfL2CbToggle จะ force ซ่อน l3-host และ uncheck l3cb แต่ L3 label ยังแสดงอยู่)
- selector: line 5429-5435 ใน index.html — L3 label สร้างหลัง `rf-l2-host` div ในระดับ sibling ไม่ใช่ child
- เสนอแก้: ย้าย L3 label + rf-l3-host เข้าไปสร้างข้างใน `rf-l2-host` (ต้องสร้างก่อน inject .i-color-wrap หรือ append หลัง)

### RED 2 — L1 ไม่แสดงราคาสี "(ฟรี)" / "(+X บาท)"
- ดราฟ: L1 row มี `<span class="lfree">(ฟรี)</span>` อัปเดตตามสี L1 ปัจจุบัน
- เว็บ: rf-l1row ไม่มี price span ใดเลย (line 5421-5426)
- selector: `.rf-l1row` — ไม่มี `.lfree` หรือ price indicator
- เสนอแก้: เพิ่ม span ราคาใน rf-l1row และอัปเดตใน rfCycleL1() / calcQuote()

### RED 3 — L3 ไม่มีหมวดสี (catChips) แยก
- ดราฟ 24มิ.ย. line 238-241: L3 มีหมวดสี (OPTION) แยก แล้วค่อยโชว์ chips สีต่อหมวด
- เว็บ: L3 ใช้ `msftColorChips` flat list ไม่แยกหมวด (12 chips รวมกัน index 2-12)
- selector: `.rf-l3-host .chip-group` — มีแค่ 1 chip-group สีโครง ไม่มี cat row
- เสนอแก้: เพิ่ม catChips แยกหมวดใน L3 (แบบเดียวกับ L2 ที่ใช้ color-drill)

---

## จุดสังเกตเพิ่มเติม (ไม่ใช่ RED แต่ควรเช็ค)

- L3 chip สีโครง: เริ่มจาก index 2 (ซาฮาร่า) — ตัด 0 (ขาว) กับ 1 (ดำ) ออก ตรงกับ DRAFT-23มิ.ย. ที่ `COLORS.map` ใช้ `i>=2`
- ตัวเลขชิป L3 สี: 12 chips (index 2-12) รวมสีชุบ (index 12) ซึ่งดราฟใช้ `i>=2` เหมือนกัน (ตรงกัน)
- Consistency: ข้ามรุ่น roof_vinyl / roof_polyton / imp7 / imp15 โครงสร้าง L1/L2/L3 เหมือนกันทุกรุ่น

---

## สรุปนับ

- RED (ขาด/ต่าง): 3 จุด
- GREEN (ตรง): 10 จุด
- ORANGE: 1 จุด (L3 catChips ขาด = ถูกนับใน RED 3 แล้ว)

script ตรวจ: `scripts/check-g3-color.mjs`
