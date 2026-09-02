# DESIGN — หน้า `/calculator40/link` "สโตร์ ↔ ใบตัด ↔ คิดราคา 4.0"

ออกแบบตาม `docs/SPEC-หน้าลิงก์รวม-สโตร์-ใบตัด-คิดราคา.md`
ฐานหน้าตา = `calculator40/compare/CompareClient.tsx` (เจ้าของชมว่าดูง่าย) + ยุบ `stock-audit/AuditClient.tsx` เข้ามา

**หลักคิดทั้งหน้า** — เจ้าของบอกว่า "เจอตัวอักษรเป็นพรืดแล้วตาลาย" ทุกการตัดสินใจข้างล่างนี้
ตอบโจทย์เดียว: *ให้ตาไม่ต้องเปรียบเทียบเอง* ระบบต้องชี้ให้แล้วว่าบรรทัดไหนไม่ตรง ตรงช่องไหน

---

## 0. โครงหน้า (บนลงล่าง)

```
┌ แถบหัว (sticky) ─────────────────────────────────────────┐
│ 🔗 ลิงก์ สโตร์ ↔ ใบตัด ↔ คิดราคา 4.0                      │
│ [แถบความคืบหน้า  ตรวจแล้ว 214/550 (39%)]  [รุ่นถัดไป →]   │
└──────────────────────────────────────────────────────────┘
[ ปุ่มโหมด: ที่ต้องลงมือ · ที่ต้องคิด · ยังไม่ได้ตรวจ · ทั้งหมด ]
[ ไทล์นับ 7 สถานะ — กดเพื่อกรอง (เลือกได้หลายอัน) ]
┌ กล่องตั้งขนาด (พับได้) รุ่น/กว้าง/สูง/บาน/รูปแบบ/สี + [ไล่ทุกรูปแบบ] ┐
[ ตัวกรองแถวเดียว: หมวด · ค้นหา · เฉพาะที่แก้แล้ว · ซ่อนที่เคลียร์แล้ว ]
┌ ตารางหลัก (scroll ในกล่องตัวเอง) ────────────────────────┐
│ แถบหมวด: อลูมิเนียม 18 แถว · เคลียร์ 12                   │
│  แถวๆๆๆ ...                                              │
│ ▸ ✓ ผ่าน 312 แถว — กดดู                                   │
└──────────────────────────────────────────────────────────┘
        ← ซ้ายมือ (desktop ≥xl): รายการ 54 รุ่น + ความคืบหน้าต่อรุ่น
```

ค่าตั้งต้นเมื่อเปิดหน้า = เรียง "ที่ต้องแก้ก่อน" ขึ้นบน + พับ `✓ ผ่าน` ไว้ท้ายหมวด
(เปิดมาเห็นเฉพาะงานที่ต้องทำ แต่ไม่มีอะไรหายไปเงียบ ๆ — กดเปิดดูได้ตลอด)

---

## 1. ตารางหลัก — 3 ช่องความจริงเคียงกันโดยไม่ตาลาย

### หัวตารางซ้อน 2 ชั้น + เส้นแบ่งกลุ่ม (ตัวหลัก)

ชั้นบน = ชื่อ 3 แหล่งความจริง มีพื้นสีอ่อนคนละสี · ชั้นล่าง = ชื่อช่องย่อย

| กลุ่ม | พื้นหัว | เส้นแบ่งซ้าย | ช่องย่อย |
|---|---|---|---|
| (ตัวตน) | ขาว sticky | — | ✔ตรวจแล้ว + สถานะ · ชื่อรายการ + รหัส |
| **คิดราคา 4.0** | `bg-brand-soft` (ชมพู) | `border-l-2 border-brand/20` | จำนวน · ฿/หน่วย · รวม ฿ |
| **ใบตัด** | `bg-sky-50` | `border-l-2 border-sky-300/60` | ชิ้น · ยาว/ชิ้น (ซม.) |
| **สโตร์** | `bg-emerald-50` | `border-l-2 border-emerald-300/60` | ชื่อจริง · ฿/หน่วย · คงเหลือ |

**เส้นแบ่งกลุ่มต้องลากลงมาถึงทุกแถวในตาราง** ไม่ใช่แค่หัว — นี่คือตัวช่วยที่ได้ผลที่สุด
เพราะทำให้ตาเห็นเป็น "3 ก้อน" ไม่ใช่ "11 ช่องเรียงกันเป็นพรืด"

### กฎลดของบนจอ

- **สูงสุด 3 ตัวเลขต่อกลุ่ม** ที่เหลือ (เส้น/กก.ต่อเส้น/฿ต่อกก./ยาวรวม/รหัสสำรอง) ย้ายไปแถวขยาย `▸`
  หน้าเทียบเดิมมี 12 ช่องตัวเลขในตารางเดียว = ต้นเหตุตาลายหลัก
- **ไม่ใช้ zebra สลับสีรายแถว** เพราะซ้อนกับพื้น 3 สีของกลุ่มแล้วเละ ใช้แทนด้วย
  - เส้นคั่นบาง `border-t border-line/60`
  - `hover:bg-brand-soft/40` ไล่ตามแถวได้ตอนกวาดตาข้ามช่อง
  - กดแถว = ค้างไฮไลต์ `ring-1 ring-brand/30` (ปักหมุดว่า "ฉันอยู่บรรทัดนี้")
- **แถบหมวดคั่น** (อลูมิเนียม / อุปกรณ์ / สิ้นเปลือง / กระจก) เป็นแถวเต็มความกว้าง พื้น `bg-brand-soft/60`
  มีตัวนับ "เคลียร์ 12/18" ในตัว → แบ่งสายตาเป็นก้อนละ 10-20 แถว

### ระบบชี้ให้เอง (สำคัญที่สุด)

ถ้า `จำนวนคิดราคา ≠ ชิ้นใบตัด` → **ทั้งสองช่องเปลี่ยนเป็น `bg-red-50 text-red-800 font-bold ring-1 ring-red-200`**
เจ้าของไม่ต้องเอาตาไปเทียบเลข 2 ช่องที่อยู่ห่างกัน 4 คอลัมน์เอง — ระบบทาสีให้แล้ว
(ใช้กฎเดียวกับ `sweep-compare.mjs`: ต่างเกิน max(0.05, 2%) = ไม่ตรง)

### รายละเอียดเทคนิค

- ตาราง `min-w-[1120px]` ใน `overflow-x-auto` — **หน้าเว็บไม่ scroll แนวนอน ตารางเลื่อนในกล่องตัวเอง**
  (⚠ กล่องที่อยู่ใน flex/grid ต้องใส่ `min-w-0` ไม่งั้นดันหน้าบาน)
- `thead` sticky top-0 · 2 ช่องแรก sticky left (`left-0` / `left-[150px]`) พื้น `bg-white/85 backdrop-blur`
  (ตามแพตเทิร์นที่มีแล้วใน `QueueCalendarView.tsx`) → เลื่อนขวาไปดูสโตร์ ยังเห็นว่าเป็นแถวไหน สถานะอะไร
- `border-separate border-spacing-0` เพื่อให้ sticky + เส้นขอบไม่หลุด
- ตัวเลขชิดขวา + `tabular-nums` (ทั้งโปรเจกต์ใช้อยู่แล้ว) · ไม่มีค่า = `—`
- ปุ่มสลับความหนาแน่น **[แน่น | สบายตา]** ค่าตั้งต้น = สบายตา (`text-sm`, `py-2.5`)

---

## 2. แก้ในที่ (inline edit) — กดง่าย แต่ไม่พลาดง่าย

**หลัก: พิมพ์ง่าย (ไม่มี modal) · เซฟยาก (บังคับ modal)**

### จังหวะการใช้งาน

1. กด ✏ ท้ายแถว (หรือกดที่ตัวเลข/รหัสตรง ๆ) → **ทั้งแถวเข้าโหมดแก้ในที่**
   พื้นแถวเป็น `bg-amber-50/60 ring-1 ring-amber-300` · 3 ช่องที่แก้ได้กลายเป็น input
   (รหัส → `set_sku` · จำนวน → `set_qty` · ยาวตัด → `set_len`)
2. ใต้แถวโผล่ **แถวปุ่ม** (`<tr>` ซ้อนอีกแถว) โชว์ผลกระทบสด + `[ยกเลิก] [ตรวจผลกระทบ →]`
3. กด `ตรวจผลกระทบ` (หรือ Enter) → **modal ยืนยัน** โชว์ทุนเดิม→ทุนใหม่
4. กด `บันทึกการแก้` เท่านั้นถึงจะเขียน DB

**ห้าม save ตอน blur เด็ดขาด** — blur-save คือวิธีที่เงินขยับเงียบ ๆ (บทเรียนเดิมทั้งโปรเจกต์)
Esc = ยกเลิก

### กันพิมพ์รหัสมั่ว (spec ข้อ 3)

ช่องรหัสมี `<datalist>` รหัสสโตร์ทั้งหมด + บรรทัดตรวจสดใต้ช่อง:

- เจอ → `✓ JR00377 · ยางอัดกระจก 5 มม. · ฿12.00 · คงเหลือ 320` (emerald)
- ไม่เจอ → `⚠ ไม่มีรหัสนี้ในสโตร์ — จะผูกกับของที่ไม่มีตัวตน` (amber) **เตือน ไม่บล็อก**
  พร้อมปุ่ม `＋ สร้างในสโตร์` → เปิดฟอร์มกรอกให้ **ไม่สร้างอัตโนมัติ** (spec ข้อ 5)

### ช่องจำนวน / ยาวตัด = สูตรข้อความ

เก็บเป็นสูตร (`set_qty`/`set_len` เป็น text) แต่ใต้ช่องโชว์ผลลัพธ์จริงที่ขนาดปัจจุบัน:
`→ ที่ขนาดนี้ = 4 ชิ้น` · คิดไม่ออก → แดง `สูตรนี้คิดไม่ออก` + ปิดปุ่มยืนยัน

### Modal ยืนยัน (บังคับ — spec ข้อ 1)

```
ยืนยันการแก้ · เส้นกรอบบน SMS
┌──────────────────────────────────┐
│ ช่อง      เดิม        ใหม่        │
│ รหัส      F7864   →   F7962      │
│ จำนวน     4       →   6          │
├──────────────────────────────────┤
│ ทุนรวมของรุ่นนี้                   │
│   เดิม  ฿12,480.00                │
│   ใหม่  ฿12,655.00                │
│   ต่าง  +฿175.00  (+1.4%)   ← แดง │
├──────────────────────────────────┤
│ ⓘ ใบเสนอที่ออกไปแล้วไม่กระทบ       │
│   (เก็บราคาของตัวเองไว้)           │
│ หมายเหตุ: [_______________]       │
│        [ยกเลิก]  [บันทึกการแก้]    │
└──────────────────────────────────┘
```

ทุนขึ้น = `text-red-700` · ทุนลง = `text-emerald-700` · เท่าเดิม = เทา "ไม่ขยับ"
บรรทัด "ใบเสนอเก่าไม่กระทบ" ต้องมี — ตอบความกลัวข้อแรกของเจ้าของก่อนที่จะถาม (spec ข้อ 4)

### หลังเซฟ

- แถวติดป้าย **"แก้แล้ว"** (tone sky) + แถบซ้ายบาง `border-l-4 border-sky-400`
  → กวาดตาทั้งตารางเห็นทันทีว่าบรรทัดไหนถูกทับค่าไว้
- hover ป้าย = โชว์ ใคร/เมื่อไหร่ (`created_by`/`updated_at`)
- ปุ่ม ↺ **คืนค่าเดิม** = ลบ override (ถามยืนยันสั้น ๆ พร้อมโชว์ผลกระทบทุนกลับทาง)
- **เพิ่มรายการ** = แถวท้ายหมวด `＋ เพิ่มบรรทัดในหมวดนี้` → แทรกแถวโหมดแก้ (`is_added`)
- **ปิดแถว** (`disabled`) = ยังโชว์อยู่ แต่ `opacity-50 line-through` + ป้าย "ปิดใช้"
  ห้ามให้แถวหายไปเฉย ๆ (บทเรียน entity-disappears)

### RBAC (spec ข้อ 9)

`canSeeCost` = false → ซ่อนช่องราคาทั้ง 3 กลุ่ม + ซ่อนบล็อกผลกระทบ **และปิดการแก้ทั้งหน้า**
(ตัดสินใจแก้ไม่ได้ถ้ามองไม่เห็นผลกระทบทางเงิน → ให้เป็นโหมดอ่านอย่างเดียว)

---

## 3. แผงข้าง (drawer) ดูข้อมูลสโตร์

**เปิด:** กดที่รหัสตรงไหนก็ได้ (render เป็นปุ่ม `font-mono underline decoration-dotted`)
**ไม่เด้งออกจากหน้า** — overlay ทับ ตารางยังอยู่ที่เดิม scroll ไม่หาย (spec สั่งไว้ตรง ๆ)

**เรียงตามลำดับคำถามที่เจ้าของถามจริง:**

1. **หัว** — รหัสตัวใหญ่ mono + ชื่อจริงในสโตร์ + ชิปสี + `[เปิดหน้าสโตร์ ↗]` (แท็บใหม่) + `✕`
2. **ตัวเลขที่ใช้ตัดสินใจ** — 4 ไทล์: ราคา/หน่วย · หน่วย · คงเหลือ · มูลค่าคงเหลือ
   คงเหลือ ≤ 0 → ไทล์แดง "ของหมด"
3. **รายละเอียด** — หมวด · ผู้ขาย · อัปเดตราคาล่าสุด
   ถ้าเป็นของคิดต่อโล → โชว์สมการให้เห็น `น้ำหนัก/เส้น 2.4 กก. × ฿187 = ฿448.80/เส้น`
   (ถ้าไม่มีน้ำหนัก → แดง "ไม่มีน้ำหนัก — ขึ้นเรตต่อโลแล้วราคาไม่ขยับ" + ลิงก์หน้าเติมน้ำหนัก)
4. **ใช้ที่ไหนบ้าง** — ชิปรายชื่อรุ่นในคิดราคา 4.0 ที่เรียกรหัสนี้ กดแล้วสลับรุ่นในตารางหลักได้เลย
   → ตอบ "ถ้าฉันแก้ตัวนี้ กระทบรุ่นอื่นไหม" ก่อนกดเซฟ
5. **ถ้าเจอหลายแถว/หลายสี** — ตารางย่อย สี · ฿ · คงเหลือ (ปัญหาของซ้ำในสโตร์มีจริง)
6. **ถ้าไม่เจอรหัส** — empty state ส้ม `ไม่มี JR00377 ในสโตร์` + `＋ สร้างในสโตร์ (กรอกเอง)`
   + รายการชื่อใกล้เคียงให้กดเลือกแทน

**ปิด:** `✕` · `Esc` · กดฉากหลัง (`scrim`) · มือถือปัดลง
**ทรง:** desktop = แผงขวา `sm:max-w-md h-[100dvh] slide-in` (ลอกโครง `OpsSummaryDrawer.tsx`
แต่ใช้คลาสโซนสว่าง `glass`/`glass-soft` ไม่ใช่โซนเข้ม) · มือถือ = bottom sheet `max-h-[85dvh] rounded-t-3xl`
(นิ้วโป้งถึง + ยังเห็นตารางด้านบน)

---

## 4. ป้ายสถานะ 7 แบบ + ตัวกรอง

### ทำให้กวาดตาเจอเร็ว

1. **อีโมจิ + คำ อยู่ด้วยกันเสมอ** ห้ามใช้สีอย่างเดียว (🟠 กับ 🟡 แยกด้วยสีไม่ทัน แต่แยกด้วยอีโมจิ+คำได้ทันที)
   เจ้าของอ่านคำชุดนี้จาก CSV มาแล้ว = คุ้นอยู่แล้ว ห้ามเปลี่ยนคำ
2. **ป้ายอยู่ในช่อง sticky ซ้ายสุด** → เลื่อนตารางไปขวาแค่ไหนป้ายก็ยังอยู่ นี่คือช่องทางกวาดตาหลัก
3. **แถบสีซ้ายแถว `border-l-4`** — อ่านได้แม้กวาดเร็วจนตัวหนังสือเบลอ
4. เรียงตามความเร่งด่วน (rank เดียวกับ CSV): 🔴 → 🟠 → 🔵 → 🟡 → 🟣 → ⚪ → ✓

| สถานะ | tone (Badge) | แถบซ้าย |
|---|---|---|
| ✓ ผ่าน | `emerald` | `border-emerald-400` |
| 🔴 ต้องแก้ | `red` | `border-red-500` |
| 🟠 ต้องเติม | `amber` | `border-orange-400` |
| 🔵 เช็คว่าคิดเกินไหม | `sky` | `border-sky-400` |
| 🟣 ยังไม่ได้ตรวจ | `violet` | `border-violet-400` |
| 🟡 ต้องเคาะ | `yellow` ← **ต้องเพิ่ม 1 บรรทัดใน `src/components/ui.tsx`** | `border-yellow-400` |
| ⚪ ดูเฉย ๆ | `gray` | `border-gray-300` |

> `TONES` เดิมมี 6 โทน ขาดเหลือง — เพิ่ม `yellow: "bg-yellow-100 text-yellow-900"` เข้าไป
> เป็นการเติมคีย์ ไม่กระทบของเดิม (ไม่ต้องลงไลบรารีใหม่)

### ตัวกรอง

- **ปุ่มโหมด 4 ปุ่มบนสุด** (ทางลัดจริงที่ใช้ 90% ของเวลา):
  `[ที่ต้องลงมือ 🔴🟠]` · `[ที่ต้องคิด 🔵🟡]` · `[ยังไม่ได้ตรวจ 🟣]` · `[ทั้งหมด]`
- **ไทล์นับ 7 สถานะ** (ลอกแพตเทิร์นไทล์ใน `AuditClient.tsx`) แต่ **เลือกได้หลายอันพร้อมกัน**
  ของเดิมเลือกได้ทีละอัน — พอมี 7 สถานะแล้วต้องเลือกหลายอัน ("ขอดู 🔴 กับ 🟠 พร้อมกัน")
- แถวตัวกรองรอง: `รุ่น (54)` · `หมวด` · `ค้นหา รหัส/ชื่อ` · toggle `เฉพาะที่แก้แล้ว` · `ซ่อนที่เคลียร์แล้ว`
- **ไม่ทำหัวตารางกดเรียง** — เรียงตายตัวตามความเร่งด่วน (กดเรียงเองเพิ่มความสับสน + คลิกเปล่า)
- จำตัวกรอง + รุ่นล่าสุดไว้ใน `localStorage` ปิดเบราว์เซอร์แล้วกลับมาที่เดิม

---

## 5. "ตรวจไปถึงไหนแล้ว" จาก 550 แถว

ใช้ 3 ชั้นซ้อนกัน — ชั้นเดียวไม่พอ

### ชั้น 1 — ติ๊กเคลียร์รายแถว (ของจริงที่ตอบคำถาม)

ช่อง checkbox ซ้ายสุด **"ตรวจแล้ว"** แยกจากสถานะเด็ดขาด:
สถานะ = เครื่องคิดว่ายังไง · ✔ = **ฉันดูแล้ว รับทราบแล้ว** (ติ๊ก 🔵 ได้โดยไม่ต้องแก้อะไร)
ติ๊กแล้ว → แถวจาง `opacity-60` และตกไปท้ายหมวด (หรือหายถ้าเปิด "ซ่อนที่เคลียร์แล้ว")

> **ต้องเพิ่ม 2 คอลัมน์ใน migration 0134:** `reviewed_at timestamptz` · `reviewed_by uuid`
> (เก็บใน `calc_line_overrides` แถวเดียวกัน · แถวที่ติ๊กอย่างเดียวไม่มี override = ทุกช่อง set_* เป็น null)
> ราคาถูกมาก แต่ทำให้ความคืบหน้าไม่หายตอน refresh และคนอื่นเห็นด้วย

### ชั้น 2 — แถบความคืบหน้าบนสุด (sticky ตามลงมา)

`ตรวจแล้ว 214 / 550 แถว (39%)` + แถบแบ่งสี (เขียว=ผ่าน/เคลียร์ · แดง-ส้ม=เหลือต้องลงมือ · ม่วง=ยังไม่ได้ตรวจ)
**แต่ละท่อนกดได้ = กรอง** · อยู่ในแถบ sticky → เลื่อนไปไหนก็ตอบได้ว่า "ถึงไหนแล้ว"

### ชั้น 3 — นับต่อรุ่น + ปุ่มไปรุ่นถัดไป

รายการ 54 รุ่น (desktop = คอลัมน์ซ้าย `xl:block` · มือถือ = dropdown) แต่ละรุ่นมี `12/18` + จุดสถานะ
🟢 เคลียร์หมด · 🟡 เหลือ n · ⚪ ยังไม่เริ่ม → เจ้าของเลือกงานถัดไปจากลิสต์นี้ คือแผนที่ของ 550 แถว

**ปุ่ม `ไปรุ่นถัดไปที่ยังไม่เคลียร์ →` ท้ายตาราง** = ของชิ้นที่มีประโยชน์ที่สุดในหน้า
ตรวจจบรุ่น กดปุ่มเดียวไปต่อ ไม่ต้องจำเองว่าค้างรุ่นไหน

---

## 6. มือถือ

**ไม่เอาตาราง 11 ช่องมาย่อ** — ต่ำกว่า `md` เปลี่ยนเป็นการ์ด (โปรเจกต์ใช้ `md:hidden` / `hidden md:block` อยู่แล้ว)

```
┌────────────────────────────────┐
│ 🔴 ต้องแก้        [✔ ตรวจแล้ว] │
│ เส้นกรอบบน SMS                 │
│ F7864  ← กดเปิดสโตร์            │
│ ┃ คิดราคา  4 ชิ้น · ฿120 · ฿480 │  ┃ ชมพู
│ ┃ ใบตัด    6 ชิ้น · 240 ซม.     │  ┃ ฟ้า  ← เลข 6 แดงเพราะไม่ตรง
│ ┃ สโตร์    ฿118 · คงเหลือ 12    │  ┃ เขียว
│                      [แก้ไข ✏] │
└────────────────────────────────┘
```

- **3 ความจริงกลายเป็น 3 บรรทัด** (แทน 3 กลุ่มคอลัมน์) แต่ละบรรทัดมีแถบสีซ้ายสีเดียวกับหัวตารางบน desktop
  → ภาษาสีเดียวกันทั้งสองจอ
- เลขที่ไม่ตรงยังทาแดงเหมือนเดิม (ไม่ต้องเทียบเอง)
- แตะการ์ด = ขยาย (accordion) โชว์รายละเอียด + ปุ่ม
- **แก้ไขบนมือถือ = bottom sheet ทีละช่อง** (ปุ่ม/ช่อง ≥ 44px) ไม่ใช่ input เล็ก ๆ ในการ์ด
  → ผ่าน modal ยืนยันทุนเดิม→ทุนใหม่เหมือนกัน ไม่ลดขั้นตอนความปลอดภัยบนมือถือ
- **แถบล่างติดจอ** (`pb-safe`): `214/550` · `[ตัวกรอง]` (เปิด bottom sheet) · `[รุ่นถัดไป →]`
  ตัวกรองบนมือถือห้ามเป็นชิปเรียงจนล้น 4 บรรทัด
- แท็บเล็ต (`md`) ใช้ตารางได้ เลื่อนแนวนอนในกล่อง — **หน้าเว็บไม่เลื่อนแนวนอน**

---

## โครง JSX — ตารางหลัก

```tsx
"use client";
import { Fragment, useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import Icon from "@/components/Icon";
import { cn } from "@/lib/format";
import { baht } from "@/lib/money";

/* ── ป้ายสถานะ 7 แบบ — อีโมจิ+คำมาคู่กันเสมอ ── */
const ST = {
  fix:      { emoji: "🔴", label: "ต้องแก้",             tone: "red",     bar: "border-red-500" },
  add:      { emoji: "🟠", label: "ต้องเติม",            tone: "amber",   bar: "border-orange-400" },
  over:     { emoji: "🔵", label: "เช็คว่าคิดเกินไหม",   tone: "sky",     bar: "border-sky-400" },
  decide:   { emoji: "🟡", label: "ต้องเคาะ",            tone: "yellow",  bar: "border-yellow-400" },
  untested: { emoji: "🟣", label: "ยังไม่ได้ตรวจ",       tone: "violet",  bar: "border-violet-400" },
  fyi:      { emoji: "⚪", label: "ดูเฉย ๆ",             tone: "gray",    bar: "border-gray-300" },
  pass:     { emoji: "✓",  label: "ผ่าน",               tone: "emerald", bar: "border-emerald-400" },
} as const;
type StKey = keyof typeof ST;
const ORDER: StKey[] = ["fix", "add", "over", "decide", "untested", "fyi", "pass"];

/* เส้นแบ่ง 3 ก้อนความจริง — ต้องลากลงมาทุกแถว ไม่ใช่แค่หัว */
const G = {
  calc:  "border-l-2 border-brand/20",
  cut:   "border-l-2 border-sky-300/60",
  stock: "border-l-2 border-emerald-300/60",
};
const num  = "px-2 py-2.5 text-right tabular-nums whitespace-nowrap";
const stick = "sticky z-10 bg-white/85 backdrop-blur";
/* ไม่ตรง = ทาแดงให้ทั้งสองช่อง ตาไม่ต้องเทียบเอง */
const diff = (bad: boolean) => bad ? " bg-red-50 text-red-800 font-bold ring-1 ring-red-200 rounded" : "";

export function LinkTable({ sections, canSeeCost, onOpenSku, onEdit, onToggleReviewed }: Props) {
  return (
    <Card className="p-3 sm:p-5">
      {/* ตารางเลื่อนในกล่องตัวเอง — หน้าเว็บห้ามเลื่อนแนวนอน */}
      <div className="overflow-auto max-h-[70vh] rounded-xl border border-line/60">
        <table className="w-full min-w-[1120px] text-sm border-separate border-spacing-0">
          {/* ── หัวซ้อน 2 ชั้น ── */}
          <thead className="sticky top-0 z-20 text-brand-dark">
            <tr>
              <th className={cn(stick, "left-0 w-[150px] p-2 text-left")}>ตรวจ / สถานะ</th>
              <th className={cn(stick, "left-[150px] w-[240px] p-2 text-left")}>รายการ · รหัส</th>
              <th className={cn("bg-brand-soft p-2 text-center", G.calc)} colSpan={canSeeCost ? 3 : 1}>คิดราคา 4.0</th>
              <th className={cn("bg-sky-50 p-2 text-center", G.cut)} colSpan={2}>ใบตัด</th>
              <th className={cn("bg-emerald-50 p-2 text-center", G.stock)} colSpan={canSeeCost ? 3 : 2}>สโตร์</th>
              <th className="bg-white/85 p-2 w-[92px]" />
            </tr>
            <tr className="text-[11px] font-normal text-ink-3">
              <th className={cn(stick, "left-0 border-b border-line")} />
              <th className={cn(stick, "left-[150px] border-b border-line")} />
              <th className={cn("bg-brand-soft/60 px-2 pb-1.5 text-right border-b border-line", G.calc)}>จำนวน</th>
              {canSeeCost && <th className="bg-brand-soft/60 px-2 pb-1.5 text-right border-b border-line">฿/หน่วย</th>}
              {canSeeCost && <th className="bg-brand-soft/60 px-2 pb-1.5 text-right border-b border-line">รวม ฿</th>}
              <th className={cn("bg-sky-50/60 px-2 pb-1.5 text-right border-b border-line", G.cut)}>ชิ้น</th>
              <th className="bg-sky-50/60 px-2 pb-1.5 text-right border-b border-line">ยาว/ชิ้น (ซม.)</th>
              <th className={cn("bg-emerald-50/60 px-2 pb-1.5 text-left border-b border-line", G.stock)}>ชื่อจริงในสโตร์</th>
              {canSeeCost && <th className="bg-emerald-50/60 px-2 pb-1.5 text-right border-b border-line">฿/หน่วย</th>}
              <th className="bg-emerald-50/60 px-2 pb-1.5 text-right border-b border-line">คงเหลือ</th>
              <th className="bg-white/85 border-b border-line" />
            </tr>
          </thead>

          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.key}>
                {/* แถบหมวด — แบ่งสายตาเป็นก้อนละ 10-20 แถว + บอกความคืบหน้าในตัว */}
                <tr>
                  <td colSpan={11} className="bg-brand-soft/60 px-3 py-1.5 text-xs font-bold text-brand-dark">
                    {sec.label}
                    <span className="ml-2 font-normal text-ink-3">
                      {sec.rows.length} แถว · เคลียร์แล้ว {sec.done}
                    </span>
                  </td>
                </tr>

                {sec.rows.map((r) => {
                  const s = ST[r.status];
                  const qtyBad = r.status === "fix" && r.calcQty != null && r.cutQty != null;
                  return (
                    <tr key={r.key}
                      className={cn("border-t border-line/60 hover:bg-brand-soft/40 align-middle",
                        r.reviewed && "opacity-60",
                        r.override && "bg-sky-50/40")}>

                      {/* ① sticky: ติ๊กตรวจแล้ว + ป้ายสถานะ (อยู่ซ้ายสุด เลื่อนขวาก็ยังเห็น) */}
                      <td className={cn(stick, "left-0 px-2 py-2 border-l-4", s.bar)}>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={r.reviewed} aria-label="ตรวจแล้ว"
                            onChange={() => onToggleReviewed(r)}
                            className="w-5 h-5 shrink-0 accent-[#b3151d]" />
                          <Badge tone={s.tone}>{s.emoji} {s.label}</Badge>
                        </label>
                      </td>

                      {/* ② sticky: ชื่อ + รหัส (รหัสกดเปิด drawer ไม่เด้งออกจากหน้า) */}
                      <td className={cn(stick, "left-[150px] px-2 py-2")}>
                        <div className={cn("text-xs leading-snug", r.disabled && "line-through opacity-60")}>{r.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {r.sku ? (
                            <button onClick={() => onOpenSku(r.sku!)}
                              className="press font-mono text-xs text-brand-dark underline decoration-dotted underline-offset-2">
                              {r.sku}
                            </button>
                          ) : <span className="font-mono text-xs text-ink-3">—</span>}
                          {r.override && <Badge tone="sky">แก้แล้ว</Badge>}
                          {r.disabled && <Badge tone="gray">ปิดใช้</Badge>}
                        </div>
                      </td>

                      {/* ③ คิดราคา 4.0 */}
                      <td className={cn(num, G.calc, diff(qtyBad))}>{r.calcQty ?? "—"}</td>
                      {canSeeCost && <td className={num}>{r.calcPrice != null ? baht(r.calcPrice) : "—"}</td>}
                      {canSeeCost && <td className={cn(num, "font-semibold")}>{r.calcAmount != null ? baht(r.calcAmount) : "—"}</td>}

                      {/* ④ ใบตัด */}
                      <td className={cn(num, G.cut, diff(qtyBad))}>{r.cutQty ?? "—"}</td>
                      <td className={num}>{r.cutLen ?? "—"}</td>

                      {/* ⑤ สโตร์ */}
                      <td className={cn("px-2 py-2 text-xs", G.stock)}>
                        {r.stockName ?? <span className="text-orange-700">⚠ ไม่มีในสโตร์</span>}
                      </td>
                      {canSeeCost && <td className={num}>{r.stockPrice != null ? baht(r.stockPrice) : "—"}</td>}
                      <td className={cn(num, (r.stockQty ?? 0) <= 0 && "text-red-700 font-semibold")}>
                        {r.stockQty ?? "—"}
                      </td>

                      {/* ⑥ ปุ่ม */}
                      <td className="px-2 py-2 whitespace-nowrap">
                        <button onClick={() => onEdit(r)} aria-label="แก้ไขบรรทัดนี้"
                          className="press w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-3 hover:bg-brand-soft hover:text-brand-dark">
                          <Icon name="pencil" size={14} />
                        </button>
                        {r.override && (
                          <button onClick={() => onEdit(r, "revert")} aria-label="คืนค่าเดิม"
                            className="press w-8 h-8 inline-flex items-center justify-center rounded-lg text-ink-3 hover:bg-brand-soft">
                            <Icon name="refresh" size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* เพิ่มบรรทัดในหมวดนี้ (is_added) */}
                <tr>
                  <td colSpan={11} className="px-3 py-1.5">
                    <button onClick={() => onEdit(null, "add", sec.key)}
                      className="press text-xs font-semibold text-brand-dark inline-flex items-center gap-1">
                      <Icon name="plus" size={13} /> เพิ่มบรรทัดในหมวด{sec.label}
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ✓ ผ่าน พับไว้ท้ายตาราง — เปิดมาเห็นเฉพาะงานที่ต้องทำ แต่ไม่มีอะไรหายไปเงียบ ๆ */}
      <details className="mt-3">
        <summary className="press text-xs font-semibold text-brand-dark cursor-pointer">
          ✓ ผ่าน {passCount} แถว — กดดู
        </summary>
        {/* …ตารางชุดเดียวกัน เฉพาะแถว pass… */}
      </details>
    </Card>
  );
}
```

### แถวโหมดแก้ (แทรกแทนแถวปกติเมื่อ `editing === r.key`)

```tsx
<>
  <tr className="bg-amber-50/60 ring-1 ring-amber-300">
    <td className={cn(stick, "left-0 px-2 py-2 border-l-4 border-amber-400")}>
      <Badge tone="amber">กำลังแก้</Badge>
    </td>
    <td className={cn(stick, "left-[150px] px-2 py-2")}>
      <div className="text-xs">{r.name}</div>
      <input value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value })}
        list="stock-skus" placeholder="รหัสสโตร์"
        className="mt-1 w-full min-h-[38px] glass-soft rounded-lg px-2 font-mono text-xs outline-none" />
      {/* ตรวจสดใต้ช่อง — เตือน ไม่บล็อก */}
      {skuHit
        ? <p className="mt-1 text-[11px] text-emerald-700">✓ {skuHit.name} · ฿{baht(skuHit.price)} · คงเหลือ {skuHit.qty}</p>
        : d.sku && (
          <p className="mt-1 text-[11px] text-amber-800">
            ⚠ ไม่มีรหัสนี้ในสโตร์ — จะผูกกับของที่ไม่มีตัวตน
            <button onClick={openCreateStock} className="press ml-1 underline font-semibold">＋ สร้างในสโตร์</button>
          </p>
        )}
    </td>

    <td className={cn("px-2 py-2", G.calc)} colSpan={canSeeCost ? 3 : 1}>
      <input value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })}
        className="w-full min-h-[38px] glass-soft rounded-lg px-2 text-sm text-right tabular-nums outline-none"
        placeholder="สูตรจำนวน" />
      <p className={cn("mt-1 text-[11px] text-right", qtyPreview == null ? "text-red-700" : "text-ink-3")}>
        {qtyPreview == null ? "สูตรนี้คิดไม่ออก" : `→ ที่ขนาดนี้ = ${qtyPreview}`}
      </p>
    </td>

    <td className={cn("px-2 py-2", G.cut)} colSpan={2}>
      <input value={d.len} onChange={(e) => setD({ ...d, len: e.target.value })}
        className="w-full min-h-[38px] glass-soft rounded-lg px-2 text-sm text-right tabular-nums outline-none"
        placeholder="สูตรความยาวตัด (ซม.)" />
      <p className="mt-1 text-[11px] text-right text-ink-3">
        {lenPreview == null ? "—" : `→ ${lenPreview} ซม.`}
      </p>
    </td>

    <td colSpan={canSeeCost ? 4 : 3} />
  </tr>

  {/* แถวปุ่ม — ไม่มี save ตอน blur เด็ดขาด */}
  <tr className="bg-amber-50/60">
    <td colSpan={11} className="px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        {canSeeCost && (
          <span className="text-xs text-ink-3">
            ทุนรุ่นนี้ ฿{baht(costBefore)} → <b className="text-ink">฿{baht(costAfter)}</b>{" "}
            <b className={delta > 0 ? "text-red-700" : delta < 0 ? "text-emerald-700" : "text-ink-3"}>
              {delta === 0 ? "ไม่ขยับ" : `${delta > 0 ? "+" : ""}฿${baht(Math.abs(delta))}`}
            </b>
          </span>
        )}
        <button onClick={cancel} className="press ml-auto rounded-xl px-4 py-2 text-sm glass-soft">ยกเลิก</button>
        <button onClick={openConfirm} disabled={qtyPreview == null}
          className="press rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand shadow-brand disabled:opacity-40">
          ตรวจผลกระทบ →
        </button>
      </div>
    </td>
  </tr>
</>
```

---

## โครง JSX — Drawer สโตร์

```tsx
"use client";
import { useEffect } from "react";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import { baht } from "@/lib/money";

// แผงข้างดูของในสโตร์ — เปิดทับหน้า ไม่นำทางออกไป (ตารางไม่เสีย scroll)
export default function StockDrawer({ sku, data, usedBy, onClose, onPickProduct }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex sm:justify-end items-end sm:items-stretch"
      role="dialog" aria-modal="true" aria-label={`ข้อมูลสโตร์ ${sku}`}>
      <div className="absolute inset-0 scrim fade-in" onClick={onClose} />

      {/* desktop = แผงขวาเต็มความสูง · มือถือ = bottom sheet (นิ้วโป้งถึง + ยังเห็นตารางด้านบน) */}
      <div className="relative w-full sm:max-w-md max-h-[85dvh] sm:max-h-none sm:h-[100dvh]
                      glass rounded-t-3xl sm:rounded-t-none sm:rounded-l-3xl overflow-y-auto slide-in">

        {/* ① หัว */}
        <div className="sticky top-0 glass px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="font-mono font-bold text-lg text-brand-dark">{sku}</div>
            <div className="text-sm text-ink-2 truncate">{data?.name ?? "ไม่มีรหัสนี้ในสโตร์"}</div>
            {data?.color && <span className="mt-1 inline-block"><Badge tone="gray">{data.color}</Badge></span>}
          </div>
          <div className="flex gap-1 shrink-0">
            <a href={`/stock?q=${encodeURIComponent(sku)}`} target="_blank" rel="noopener"
              aria-label="เปิดหน้าสโตร์"
              className="press w-10 h-10 inline-flex items-center justify-center rounded-xl text-ink-3 hover:bg-brand-soft">
              <Icon name="external" size={17} />
            </a>
            <button onClick={onClose} aria-label="ปิด"
              className="press w-10 h-10 inline-flex items-center justify-center rounded-xl text-ink-3 hover:bg-brand-soft">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {!data ? (
            /* ⑥ ไม่เจอรหัส — เตือน + ให้เจ้าของกดสร้างเอง ห้ามสร้างอัตโนมัติ */
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              ⚠ ไม่มี <b className="font-mono">{sku}</b> ในสโตร์ — บรรทัดนี้กำลังผูกกับของที่ไม่มีตัวตน
              <button onClick={onCreateInStock}
                className="press mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-brand shadow-brand">
                ＋ สร้างในสโตร์ (กรอกเอง)
              </button>
            </div>
          ) : (
            <>
              {/* ② ตัวเลขที่ใช้ตัดสินใจ */}
              <div className="grid grid-cols-2 gap-2">
                {[["ราคา/หน่วย", `฿${baht(data.price)}`], ["หน่วย", data.unit],
                  ["คงเหลือ", String(data.qty)], ["มูลค่าคงเหลือ", `฿${baht(data.price * data.qty)}`]
                ].map(([k, v], i) => (
                  <div key={k} className={"glass-soft rounded-xl px-3 py-2 " + (i === 2 && data.qty <= 0 ? "bg-red-50" : "")}>
                    <div className="text-[11px] text-ink-3">{k}</div>
                    <div className="font-bold tabular-nums">{v}</div>
                  </div>
                ))}
              </div>

              {/* ③ รายละเอียด + สมการราคาต่อโล (จุดที่พลาดบ่อยที่สุด) */}
              <div className="glass-soft rounded-xl px-4 divide-y divide-black/5 text-sm">
                <Row label="หมวด">{data.category ?? "—"}</Row>
                <Row label="ผู้ขาย">{data.supplier ?? "—"}</Row>
                {data.isWeightBased && (
                  <Row label="คิดราคาต่อโล">
                    {data.kgPerUnit
                      ? <>{data.kgPerUnit} กก. × ฿{baht(data.ratePerKg)} = <b>฿{baht(data.price)}</b></>
                      : <span className="text-red-700">ไม่มีน้ำหนัก — ขึ้นเรตต่อโลแล้วราคาไม่ขยับ{" "}
                          <a href="/stock/weight-backfill" className="underline font-semibold">เติมน้ำหนัก</a></span>}
                  </Row>
                )}
                <Row label="อัปเดตราคาล่าสุด">{data.priceUpdatedAt ?? "—"}</Row>
              </div>

              {/* ⑤ หลายแถว/หลายสี */}
              {data.siblings?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-brand-dark mb-1.5">รหัสนี้มีหลายสีในสโตร์</div>
                  <table className="w-full text-xs">
                    <tbody>
                      {data.siblings.map((s) => (
                        <tr key={s.id} className="border-t border-line/60">
                          <td className="py-1.5">{s.color || "—"}</td>
                          <td className="py-1.5 text-right tabular-nums">฿{baht(s.price)}</td>
                          <td className="py-1.5 text-right tabular-nums text-ink-3">{s.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ④ ใช้ที่ไหนบ้าง — ตอบ "แก้ตัวนี้แล้วกระทบรุ่นไหนอีก" ก่อนกดเซฟ */}
          <div>
            <div className="text-xs font-semibold text-brand-dark mb-1.5">
              ใช้ในคิดราคา 4.0 · {usedBy.length} รุ่น
            </div>
            <div className="flex flex-wrap gap-1.5">
              {usedBy.map((p) => (
                <button key={p.id} onClick={() => { onPickProduct(p.id); onClose(); }}
                  className="press text-xs rounded-lg px-2.5 py-1.5 glass-soft text-ink-2">
                  {p.name}
                </button>
              ))}
              {!usedBy.length && <span className="text-xs text-ink-3">— ยังไม่มีรุ่นไหนเรียกใช้รหัสนี้</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## สรุปสิ่งที่ต้องแตะนอกหน้าใหม่

| ไฟล์ | แก้อะไร | เสี่ยงไหม |
|---|---|---|
| `src/components/ui.tsx` | เพิ่ม `yellow: "bg-yellow-100 text-yellow-900"` ใน `TONES` | ไม่ (เติมคีย์) |
| migration `0134` | เพิ่ม `reviewed_at timestamptz` · `reviewed_by uuid` ในตาราง `calc_line_overrides` | ไม่ |
| `stock-link.ts` | จุดประกบ override เดียวตาม SPEC | ตาม SPEC เดิม |

**ไม่ต้องลงไลบรารีใหม่** ทุกอย่างข้างบนใช้ Tailwind + `Card`/`Badge`/`Icon`/`cn`/`baht` ที่มีอยู่แล้ว
