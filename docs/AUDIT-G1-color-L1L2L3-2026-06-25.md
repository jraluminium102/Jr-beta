# AUDIT G1 — กล่องสี L1/L2/L3 vs ดราฟ DRAFT-G1G4-L1L2L3-redesign-2026-06-23

วันที่ตรวจ: 2026-06-25  
โหมด: Full (.i-*/.o-*) เท่านั้น  
ดราฟอ้างอิง: `docs/DRAFT-G1G4-L1L2L3-redesign-2026-06-23.html`  
เครื่องมือ: jsdom render จริง (scripts/audit-g1-color-l1l2l3-v2.mjs + audit-g1-order-check.mjs + audit-g1-l3-position.mjs + audit-g1-codebox2.mjs)  

---

## ผลสรุปรวม: 🔴0  🟠0  🟡2  ✅ส่วนใหญ่ตรง

ชนิดบานที่ตรวจ: sliding_sms · casement_euro · frameless_door · folding_euro · fixed_glass

---

## ตารางต่อชนิดบาน

| # | ชนิด | สถานะ | จุดไม่ตรง |
|---|------|--------|-----------|
| 1 | sliding_sms (บานเลื่อนเซมิยูโร) | ✅ | — |
| 2 | casement_euro (บานเปิด) | ✅ | — |
| 3 | frameless_door (เปลือย) | ✅ | — |
| 4 | folding_euro (บานเฟี้ยม) | ✅ | — |
| 5 | fixed_glass (ติดตาย) | ✅ | — |

ทั้ง 5 ชนิดพฤติกรรมเหมือนกันหมด — ไม่มีชนิดที่กล่องสีพัง/ขาดต่างจากชนิดอื่น

---

## มิติ 1-4 ต่อชนิดบาน (ผลเหมือนกันทุกตัว)

### มิติ 1: โครงสร้าง/ลำดับ control

| # | รายการ | ดราฟ | เว็บ | สถานะ |
|---|--------|------|------|--------|
| 1 | L1 checkbox .g1co-l1cb | มี | มี | ✅ |
| 2 | L1 checked default | ติ๊ก | ติ๊ก | ✅ |
| 3 | L1 label "สีตามทั้งใบ" | มี | มี | ✅ |
| 4 | L1 span สีหัวใบ (.g1co-l1c) | มี | มี | ✅ |
| 5 | L1 span กระจกหัวใบ (.g1co-l1g) | มี | มี | ✅ |
| 6 | L1 ติ๊ก → g1-rare-body ซ่อน | ซ่อน | ซ่อน | ✅ |
| 7 | ปลด L1 → g1-rare-body โชว์ | โชว์ | โชว์ | ✅ |
| 8 | L2 mode radio 2 ปุ่ม | 🟢+🔵 | 🟢+🔵 | ✅ |
| 9 | L2 mode default = 🟢ใช้จริง | checked | checked | ✅ |
| 10 | L2 dropdown สีอลู (.i-color) ใน g1-rare-body | มี | มี | ✅ |
| 11 | L2 codebox ซ่อน default | ซ่อน | ซ่อน | ✅ |
| 12 | L2 codebox โผล่เมื่อเลือกสีพิเศษ (hasCode) | โผล่ | โผล่ | ✅ |
| 13 | L2 dropdown กระจก (.i-glass) ใน g1-rare-body | มี ≥66 | มี ≥66 | ✅ |
| 14 | L3 wrap (.g1co-l3-wrap) | มี | มี | ✅ |
| 15 | L3 ซ่อนตอน L1 ติ๊ก | ซ่อน | ซ่อน | ✅ |
| 16 | L3 โชว์หลังปลด L1 | โชว์ | โชว์ | ✅ |
| 17 | L3 details พับ (.g1co-l3det) | details | details | ✅ |
| 18 | L3 select สีอลู (.g1co-l3c) + "— ไม่เทียบ —" option แรก | มี | มี | ✅ |
| 19 | L3 select กระจก (.g1co-l3g) + "— ไม่เทียบ —" option แรก | มี | มี | ✅ |
| 20 | L3 codebox (.g1co-l3code-wrap) + โผล่เมื่อเลือกสีพิเศษ | มี+โผล่ | มี+โผล่ | ✅ |
| 21 | .cg-row ซ่อน (G1 ใช้ g1-rare-section แทน) | ซ่อน | ซ่อน | ✅ |
| 22 | ไม่มี .color-drill chip ใน g1-rare-body | ไม่มี | ไม่มี | ✅ |

### มิติ 2: โซน / ตำแหน่ง DOM

**ลำดับ DOM ใน .g1-rare-body (ผลจาก render จริง):**

```
[0] div (L2 mode radio — 🟢ใช้จริง / 🔵ออปชั่น)
[1] .i-color-wrap (L2 dropdown สีอลู)
[2] .i-colorcode-wrap (L2 codebox รหัสสีพิเศษ)
[3] .i-glass-wrap (L2 dropdown กระจก)
```

**ลำดับใน .g1-rare-section:**
```
[0] div header "🎨 สี / กระจก (เฉพาะข้อนี้)"
[1] label (L1 checkbox)
[2] .g1-rare-body (L2 controls)
[3] .g1co-l3-wrap (L3)   ← อยู่นอก .g1-rare-body
```

**ดราฟ spec (แบบ mockup):**
```
mode → สีอลู → codebox → กระจก → L3
```

**จุดต่าง 🟡 (minor):** L3 wrap อยู่นอก .g1-rare-body (เป็น sibling) ไม่ได้อยู่ภายใน  
→ behavior ถูกต้อง (L3 ซ่อน/โชว์ตาม g1L1Change/g1L2ModeSync ยังทำงานได้ผ่าน ch.querySelector)  
→ ดราฟเป็นแค่ mockup ไม่ได้ระบุ DOM nesting ชัดเจน  
→ ไม่กระทบ UX หรือราคา

### มิติ 3: ออปชั่น/label text

| # | รายการ | ดราฟ | เว็บ | สถานะ |
|---|--------|------|------|--------|
| 1 | Label สีอลู L2 | "L2 ① สีอลูมิเนียม (13 สี · ดรอปดาวน์)" | "สีอลูมิเนียม (รายการนี้)" | 🟡 ต่าง |
| 2 | Label กระจก L2 | "L2 ② สเปกกระจก (66 รุ่น · ดรอปดาวน์ครบ)" | "กระจก (รายการนี้)" | 🟡 ต่าง |
| 3 | จำนวน options สีอลู | 13 สี (ดราฟ mockup) | filter ตาม series ของ product | ✅ ถูกต้อง |
| 4 | จำนวน options กระจก | 66 รุ่น | 66 รุ่น | ✅ |

**หมายเหตุจำนวนสีอลู:** ดราฟ mockup ระบุ "13 สี" แต่ไม่ได้ filter series  
ใน index.html จริง sliding_sms (series=M) ได้ 12 options เพราะ Aztec gray (series=L) ถูก filter ออก  
→ นี่คือ business logic ถูกต้อง ไม่ใช่ bug

### มิติ 4: ราคา (Logic ตรวจจาก code)

ตรวจ code โดยตรง (ไม่ได้ probe engine จริงในรอบนี้):

| # | รายการ | ดราฟ | code index.html | สถานะ |
|---|--------|------|-----------------|--------|
| 1 | L2 🟢 บวกยอด | บวก | coOverride='1' → calcUnit ใช้ ci ของ L2 | ✅ |
| 2 | L2 🔵 ไม่บวก + ขึ้น OPTION | ไม่บวก | coOverride='opt' → force ci/gi=global (L6594) + g1CoOptNote | ✅ |
| 3 | L3 ไม่บวก + ขึ้น OPTION | ไม่บวก | g1CoOptNote L1272-1286 → baseline=L2 หรือ global | ✅ |
| 4 | L1 กลับ → คืนสีหัวใบ | คืน global | g1L1Change ตั้ง ci=gc.value | ✅ |

---

## สรุปจุดไม่ตรงดราฟ

### 🟡 จุดเล็ก (ไม่กระทบ UX/ราคา)

**จุด 1 — Label text ไม่ตรงดราฟ**
- บรรทัด: L4880 (`i-color-wrap`) และ L4881 (`i-glass-wrap`)  
- เว็บ: "สีอลูมิเนียม (รายการนี้)" / "กระจก (รายการนี้)"  
- ดราฟ: "L2 ① สีอลูมิเนียม (13 สี · ดรอปดาวน์)" / "L2 ② สเปกกระจก (66 รุ่น · ดรอปดาวน์ครบ)"  
- ผล: UX label อ่านเข้าใจได้ แต่ไม่มีเลข ① ② และไม่บอกจำนวน

**จุด 2 — L3 wrap อยู่นอก .g1-rare-body**
- ดราฟ: L3 อยู่ใน body เดียวกับ L2  
- เว็บ: L3 เป็น sibling ของ .g1-rare-body ภายใน .g1-rare-section  
- ผล: behavior ถูกต้อง (ซ่อน/โชว์ได้) แต่ DOM structure ต่างจาก mockup  
- selector: `.g1-rare-section > .g1co-l3-wrap` (ไม่ได้อยู่ใน `.g1-rare-body`)

### ✅ ทุกอย่างอื่นตรงดราฟ

ไม่มีจุด 🔴 (ขาด) หรือ 🟠 (เกิน/ผิดที่)

---

## ข้อเสนอสำหรับ dev (ถ้าต้องการแก้)

1. **Label text** (ถ้าพี่อยากให้ตรงดราฟ):  
   - L4880: เปลี่ยน `"สีอลูมิเนียม (รายการนี้)"` → `"L2 ① สีอลูมิเนียม"`  
   - L4881: เปลี่ยน `"กระจก (รายการนี้)"` → `"L2 ② สเปกกระจก"`  
   - (ไม่จำเป็นเร่งด่วน เพราะ UX ยังอ่านได้)

2. **L3 position** — ไม่แนะนำให้แก้ (risk ทำ state toggle พัง ประโยชน์น้อย)

---

*ตรวจโดย JR (READ-ONLY) · ไม่แก้ index.html · ส่ง dev/Chat B แก้เองถ้าต้องการ*
