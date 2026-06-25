# AUDIT: G4 กล่องสี L1/L2/L3 vs ดราฟ DRAFT-G1G4-L1L2L3-redesign-2026-06-23.html
วันที่ตรวจ: 2026-06-25 | วิธี: jsdom render จริง cabinet_alu + future_tech | โหมด: เต็ม (.i-*)

---

## สรุปรวม: พบ 5 จุดไม่ตรง (🔴3 · 🟠2 · 🟢ที่เหลือตรง)

---

## ตาราง cabinet_alu

| # | มิติ | ดราฟกำหนด | เว็บเป็น | สถานะ | selector + บรรทัดอ้างอิง |
|---|------|-----------|---------|-------|--------------------------|
| 1 | L1 checkbox "สีตามทั้งใบ" checked default | ติ๊ก default | ติ๊ก default | 🟢 ตรง | `.o-cabcofollow` L5817 |
| 2 | L2 mode radio 2 ปุ่ม (🟢/🔵) | มี ปุ่ม real + opt | มี on=real | 🟢 ตรง | `.o-cabcomode-real/.o-cabcomode-opt` L5822-5823 |
| 3 | L2 ① สีหน้าบาน (FT) chips | ขาว/ดำ · ซาฮาร่า · ลายไม้สต๊อก · อบพิเศษ · สีชุบ | ครบ 5 chip | 🟢 ตรง | `.chip[onclick*=cabfrontcolor]` L5828-5832 |
| 4 | L2 ② สีโครงตู้ (rn90) chips | ตามหัวใบ · ซาฮาร่า · Aztec gray · ลายไม้สต๊อก · อบพิเศษ · ลายไม้อบพิเศษ · สีชุบ | ครบ 7 chip | 🟢 ตรง | `.chip[onclick*=cabstructcolor]` L5836-5842 |
| 5 | L2 codebox หน้าบาน (เมื่อเลือกอบพิเศษ/สีชุบ) | มี codebox input | มี `.o-cabfrontcode-row` | 🟢 ตรง | L5833 |
| 6 | L2 codebox โครง (เมื่อเลือกอบพิเศษ) | มี codebox input | มี `.o-cabstructcode-row` | 🟢 ตรง | L5843 |
| 7 | L2 ③ สเปกกระจก (ชั้น/ผนัง) โผล่เมื่อเลือกกระจก | cascade ใน g4-b1 ชั้นกระจก | `.cab-shelfglass-row` อยู่ใน g4-b1 (ไม่ใช่ใน cab-co-body) | 🟠 เกิน/ต่างที่ | ดราฟวาง "L2 ③" ไว้ใน color box เดียวกัน — เว็บแยกอยู่ใน box ① ชนิดชั้น (ยัง cascade ถูก แต่ UX ต่างจากดราฟ) |
| 8 | L3 summary text | "เทียบราคาสีหน้าบาน/โครง/กระจกอื่น (ออปชั่น · ไม่บวกยอด · **ครบเหมือน L2**)" | "เทียบราคาสีหน้าบาน/โครงอื่น (L3 ออปชั่น · ไม่บวกยอด)" | 🔴 ขาด | L5846: ข้อความหาย **"กระจก"** และหาย **"ครบเหมือน L2"** |
| 9 | L3 ① หน้าบาน chips ครบเหมือน L2 | ขาว/ดำ · ซาฮาร่า · ลายไม้สต๊อก · อบพิเศษ · สีชุบ (5 chip) + codebox | มีแค่ 2 chip: ขาว/ดำ · **สีพิเศษ** (รวม) + **ไม่มี codebox L3** | 🔴 ขาด | L5851-5855: L3 ① ไม่ครบเหมือน L2 ① (ขาด ซาฮาร่า/ลายไม้/แยก chip · ขาด `.o-cabfrontcodeL3-row`) |
| 10 | L3 ② struct chips ครบเหมือน L2 | ตามหัวใบ · ซาฮาร่า · Aztec gray · ลายไม้สต๊อก · อบพิเศษ · ลายไม้อบพิเศษ · **สีชุบ** | มี 6 chip ขาด **สีชุบ (val=12)** | 🔴 ขาด | L5857-5862: L3 ② ไม่มี chip สีชุบ ทั้งที่ L2 ② มี |
| 11 | L3 ③ กระจก chips | ดราฟ: เทียบกระจก ชั้น/ผนัง (เหมือน L2 ③) | มีแค่ ใส 5-6 / ฝ้า/ชาดำ (binary · ไม่ครบ spec ชั้น) | 🟠 เกิน/ต่างราย | L5866-5871: ตัวเลือกกระจก L3 น้อยกว่า L2 ③ มาก (L2 มี 6 chip ชั้นกระจก · L3 มีแค่ 2 chip binary) |

---

## ตาราง future_tech (ฝาตู้)

| # | มิติ | ดราฟกำหนด | เว็บเป็น | สถานะ | selector + บรรทัดอ้างอิง |
|---|------|-----------|---------|-------|--------------------------|
| 1 | L1 checkbox "สีตามทั้งใบ" checked default | ติ๊ก default | ติ๊ก default | 🟢 ตรง | `.o-ftcofollow` L6005 |
| 2 | L2 mode 2 ปุ่ม (🟢/🔵) | มี real + opt | มี on=real | 🟢 ตรง | `.o-ftcomode-real/.o-ftcomode-opt` L6010-6011 |
| 3 | ft-co-colgrid อยู่ใน ft-co-body (ซ่อนเมื่อ L1=tick) | colgrid ควรซ่อนพร้อม body เมื่อ L1 ติ๊ก | ft-co-colgrid **อยู่นอก** ft-co-body (sibling) → โชว์ตลอดเวลาแม้ L1=tick | 🔴 ขาด | L6013-6019: ft-co-colgrid เป็น sibling ของ ft-co-body ใน g4-fld — ควรอยู่ **ใน** ft-co-body เพื่อซ่อนพร้อมกัน |
| 4 | L2 สีฝาตู้ (o-ftcolor) chips | ขาว/ดำ + สีพิเศษหลายรุ่น | 12 chip ครบ | 🟢 ตรง | `.ft-alucolor-row .chip` L6017 |
| 5 | L2 วัสดุหน้าบาน (o-ftmat) อลู/กระจก | 2 chip | 2 chip | 🟢 ตรง | L6016 |
| 6 | L2 สีกระจก (o-ftglasscolor) cascade | โผล่เมื่อเลือก glass | ซ่อน default / โผล่เมื่อ glass | 🟢 ตรง | `.ft-glasscolor-row` L6018 |
| 7 | FT L3 | ดราฟ **ไม่กำหนด L3 สำหรับ FT** (ดราฟมีแค่ L1/L2) | ไม่มี .cab-co-l3det สำหรับ FT | 🟢 ตรง (ตามดราฟ) | — |
| 8 | FT codebox (.o-ftcolorcode) | มี input รหัสสีพิเศษ | มี | 🟢 ตรง | L6021 |

---

## จุดสำคัญ 🔴 (ส่ง dev แก้)

### จุดที่ 1 — cabinet_alu L3 ① หน้าบาน ไม่ครบเหมือน L2 ①
- ดราฟ: L3 ① ต้องมีชิปครบเหมือน L2 (ขาว/ดำ · ซาฮาร่า · ลายไม้สต๊อก · อบพิเศษ · สีชุบ) + codebox `o-cabfrontcodeL3-row`
- เว็บ: มีแค่ 2 chip (ขาว/ดำ · สีพิเศษ) + **ไม่มี codebox L3**
- บรรทัด: L5848-5855 (`.chip[onclick*=cabfrontcolorL3]`)
- เสนอแก้: เพิ่ม chip ซาฮาร่า/ลายไม้สต๊อก/อบพิเศษ/สีชุบ ให้เหมือน L2 ① + เพิ่ม `.o-cabfrontcodeL3-row` codebox

### จุดที่ 2 — cabinet_alu L3 ② struct ขาด chip สีชุบ
- ดราฟ: L3 ② ต้องมีครบเหมือน L2 ② รวม สีชุบ (val=12)
- เว็บ: L3 มี 6 chip แต่ขาด สีชุบ (L2 มี 7 chip รวมสีชุบ)
- บรรทัด: L5857-5862 (`.chip[onclick*=cabstructcolorL3]`)
- เสนอแก้: เพิ่ม chip สีชุบ `data-val="12"` ใน L3 ② ตามท้าย ลายไม้อบพิเศษ

### จุดที่ 3 — future_tech ft-co-colgrid อยู่นอก ft-co-body
- ดราฟ: วัสดุหน้าบาน+สีฝาตู้ ควรอยู่ใน L2 section ที่ซ่อนเมื่อ L1=tick
- เว็บ: `.ft-co-colgrid` เป็น sibling ของ `.ft-co-body` ใน div.g4-fld → โชว์ตลอดเวลา ไม่ซ่อนแม้ L1 ติ๊ก
- บรรทัด: L6013-6019 (ft-co-colgrid อยู่หลัง ft-co-body ปิด)
- เสนอแก้: ย้าย `ft-co-colgrid` เข้าไปอยู่ **ก่อน** `</div>` ปิด `.ft-co-body`

---

## จุดเสริม 🟠 (แจ้งพี่ตัดสินใจ)

### จุด 4 — cabinet_alu L2 ③ กระจก อยู่ผิดกล่อง (UX ต่างจากดราฟ)
- ดราฟ: วาง "L2 ③ สเปกกระจก (ชั้น/ผนัง)" ใน color box เดียวกันกับ L1/L2/L3
- เว็บ: cascade ชั้นกระจกอยู่ใน box ① ชนิดชั้น (g4-b1) ไม่ใช่ใน color box
- ราคา cascade ยังถูก แต่ UX ต่างจากดราฟ — ให้พี่เคาะว่าจะย้ายหรือไม่

### จุด 5 — cabinet_alu L3 ③ กระจก binary เท่านั้น (ขาด spec เต็ม)
- ดราฟ: L3 ③ เทียบกระจก "เหมือน L2 ③"
- เว็บ: L3 มีแค่ ใส 5-6 / ฝ้า+ชาดำ binary (ดีกว่าไม่มี แต่ไม่เหมือน L2 ③ ที่มี 6 chip ชั้นกระจก)
- ให้พี่เคาะว่าจะให้ L3 ③ เต็มเหมือน L2 หรือ binary พอ

---

## ยืนยัน false positive = 0
- ตรวจ 2 prod แยก (fresh render ทุกตัว) กัน orphan DOM
- L2 สีหน้าบาน chips=8 มาจากการ query `onclick*=cabfrontcolor` ดึงทั้ง L2 และ L3 รวมกัน — แยก div count ยืนยัน L2 ①=5 chip จริง
- FT details ที่เจอ = class="optbox" (อุปกรณ์เสริม) ไม่ใช่ L3 สี — ยืนยันว่า FT ไม่มี L3 จริง
