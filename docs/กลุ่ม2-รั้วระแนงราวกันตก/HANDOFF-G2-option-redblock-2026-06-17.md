# 🔧 HANDOFF dev chat B — G2 OPTION ลายไม้ขึ้นบล็อกแดง (17 มิ.ย. · ต่อจาก a6d754b)

> ต่อจาก commit `a6d754b` (4ปุ่ม+ไอคอน+ใบ5บล็อก · apply main แล้ว) · งานนี้ = แก้ known limitation 1 จุด (มติพี่นัท "ย้ายแดง")
> **VERIFIED ใน worktree**: golden 149 · check-g2 🔴0 · verify-4btn 26/26 · OPTION div แดงอยู่ก่อน "รายละเอียด"
> **Apply:** `git apply docs/กลุ่ม2-รั้วระแนงราวกันตก/HANDOFF-G2-option-redblock-2026-06-17.patch` (4 hunk · 8+/5-)

## ปัญหา → แก้
**OPTION ลายไม้ Golden Teak (ประตูรั้ว · `gatewood>0`)** เดิมต่อท้าย det หลัง marker → ขึ้นใต้บล็อก "รายละเอียด"(เทา) · **ย้ายให้ขึ้นบล็อก "OPTION"(หัวแดง)** ตามสเปก 5 บล็อก (ตรง G1)

## กลไก (qrow อ่าน OPTION จาก `note` argument ไม่ใช่ det หลัง marker)
4 จุดใน `genQuote`/`itemDetail`:
1. `let gateOptNote='';` declare ต้น itemDetail (~L5328)
2. gate branch: `_gOptNote` ต่อท้าย det → `gateOptNote='OPTION : เปลี่ยนเป็น...Golden Teak...'` แยก (ไม่ต่อ det)
3. itemDetail return เพิ่ม field `gateOptNote`
4. ungrouped loop: `_itemNote=[it.note, d.gateOptNote].filter(Boolean).join('\n')` → ส่งเป็น `note` arg ของ qrow → qrow แยกบรรทัด startsWith "OPTION" เป็นบล็อกแดง (`#B3151D`) ระหว่างรายการ↔รายละเอียด

## ✅ Verify (รันยืนยันเอง)
| script | ผล |
|---|---|
| golden-snapshot | ✅ 149 ตรง ไม่เพี้ยน |
| check-g2 | ✅ 🔴0 |
| verify-g2-4buttons | ✅ 26/26 |
| show-g2-quote ข้อ 5 (gatewood=15000) | ✅ div[17] [แดง] OPTION ลายไม้ · div[18] รายละเอียด ตามหลัง (ลำดับถูก · ไม่อยู่ใต้ spec) |

## ปลอดภัย
- `gateOptNote` reset '' ทุกครั้งที่เรียก itemDetail → ไม่รั่วข้ามรายการ · กลุ่มอื่นไม่แตะ gate → ='' → filter(Boolean) ตัดออก → note เดิมไม่เปลี่ยน
- ไม่แตะราคา · golden ไม่เพี้ยน
