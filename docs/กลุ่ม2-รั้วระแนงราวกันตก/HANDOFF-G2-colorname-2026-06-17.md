# 🔧 HANDOFF (คิวกลาง → dev) — G2 ช่องกรอกชื่อสีพิเศษ (17 มิ.ย.)

> มติพี่นัท: "ใช่เหมือน G1" — เพิ่มช่องกรอกชื่อสีพิเศษทุกจุดสีอบใน G2 · เลือก "อบสีพิเศษ/ลายไม้อบพิเศษ" → โผล่ช่องกรอกชื่อสี (เช่น Golden Teak SMS) → ขึ้นใบ + ⚠ ถ้าไม่กรอก
> เตรียมโค้ด+VERIFY ในแชทตรวจ (worktree · READ-ONLY ไม่แตะ index.html จริง) · **ส่งคิวกลาง ไม่ส่ง B ตรง**
> **Apply:** `git apply docs/กลุ่ม2-รั้วระแนงราวกันตก/HANDOFF-G2-colorname-2026-06-17.patch` (138 บรรทัด · base b468d45 · ถ้า conflict ดู 5 จุดล่าง manual)

## ที่มา
ใบจริงระบุชื่อสีลายไม้เฉพาะ "Golden Teak SMS" · ระบบ G2 เดิมเลือกได้แค่ "อบสีพิเศษ/ลายไม้" (คำกลางๆ ไม่มีชื่อรุ่น) → audit ใบจริงเจอ P2 · พี่นัทเคาะเพิ่มช่องกรอกชื่อ (เหมือน G1 รหัสสี)

## วิธีแก้ (ฟังก์ชันกลาง + 5 จุด · ไม่แตะราคา)
**ฟังก์ชันใหม่** `g2ColorNameToggle(sel, inputClass)` (ก่อน buildItemOpts): อ่าน data-n/value ของ option → match `/พิเศษ|อบสีลายไม้/` → show/hide label+input ชื่อสี

**5 จุด** (เพิ่ม `onchange="g2ColorNameToggle(...)"` + `<input class="o-X-colorname" display:none>` + readItem `optSel.Xcolorname` + genQuote ⚠):
| จุด | select | input |
|---|---|---|
| ประตูรั้ว | o-gfin | o-gfin-colorname |
| ระแนง cascade | o-finish | o-finish-colorname |
| ระแนงพิเศษ เกล็ดอลู | o-bgcolor | o-bgcolor-colorname |
| ระแนงพิเศษ เปิด-ปิด | o-bocfinish | o-bocfinish-colorname |
| ระแนงพิเศษ เลื่อน | o-bsfinish | o-bsfinish-colorname |

**genQuote** (itemDetail · block รายละเอียด/spec): เลือกพิเศษ → `"สีอบพิเศษ"` + (กรอกชื่อ ? `" (Golden Teak SMS)"` : `" ⚠ ระบุชื่อสี"`) · สีปกติ = เดิม

## ✅ Verify (รันยืนยันเองในแชทตรวจ)
| script | ผล |
|---|---|
| golden-snapshot | ✅ 149 ตรง ไม่เพี้ยน (ชื่อสี = ข้อความ ไม่กระทบราคา) |
| check-g2 | ✅ 🔴0 · 🟡0 · 🟢44 |
| test-g2-colorname (ใหม่ · `scripts/test-g2-colorname.mjs`) | ✅ 16/16 — เลือกพิเศษ+กรอก → "(Golden Teak SMS)" · ไม่กรอก → "⚠ ระบุชื่อสี" · สีปกติ ไม่มี ⚠ · ครบ 5 จุด |
| show-g2-quote | ✅ ใบเดิมราคาตรง (rn2=32k·imp3=30k·fence_gate=145k·bar_slide=56k) |

## edge case dev ควรรู้
- o-finish/o-bgcolor อยู่ใน CHIPIFY_SELECTS → chipify fire change บน select → toggle ทำงาน (verify แล้ว)
- input ชื่อสี default `display:none` · buildItemOpts rebuild → reset hidden (ไม่ค้างค่าเก่า)
- "Fuji" (o-bsfinish/bocfinish) ไม่ match regex = สีมีชื่อชัด ไม่ต้องกรอก (ถ้าอยากเพิ่ม แก้ regex)

## เทสหลัง apply
รัน golden + check-g2 + test-g2-colorname ซ้ำ + verify browser: เลือกอบสีพิเศษ → ช่องชื่อสีโผล่ → กรอก → ขึ้นใบ
