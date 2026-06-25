# Handoff — ④ G2 สีโครง L1/L2/L3 option-swap + ③ G3 visual reorg
23 มิ.ย. · map จาก 6 agent (exhaustive) · ทำต่อแบบเต็มสมาธิ กันพัง

## แม่แบบที่ทำสำเร็จแล้ว = ② G3 หลังคา (commit e36dacf) — ลอก pattern นี้
- **ฟอร์ม** (buildItemOpts, block หลังคา ~L4926-4931): กล่องสีน้ำเงิน + `<select class="o-rfcoopt">` + `rfChips('o-rfcoopt',...)` (เปลี่ยนสีโครงเป็น) + `o-rfmatopt` (เปลี่ยนวัสดุมุง)
- **readItem** (~L5531): `optSel.rfcoopt = querySelector('.o-rfcoopt').value`
- **genQuote** (itemDetail): `let roofOptNote=''` (~L6371) → roof block (~L6685) คำนวณ signed diff → `roofOptNote='OPTION : เปลี่ยน... ราคาเพิ่ม/ลด Z บาท'`
- **return** itemDetail (~L6880): เพิ่ม field `roofOptNote`
- **merge** (~L7009): `_itemNote=[it.note, d.gateOptNote, d.roofOptNote].filter(Boolean).join('\n')`
- **กลไก noSum**: บรรทัด note ขึ้นต้น "OPTION" → qrow (~L5850-5875) โชว์แดง #B3151D **ไม่บวกยอด** อัตโนมัติ
- signed: บวก="ราคาเพิ่ม" ลบ="ราคาลดลง"

## ④ G2 — 3 โมเดลราคาสีต่างกัน (ห้ามใช้ colorPrice แบบหลังคา · ต้องใช้โมเดล G2 จริง)

### A. ประตูรั้ว (fence_gate) — fin = `rnp.fin[gfin] × A × (1-ranaeDisc(A))`
- **calc** L1597: `fkey=optSel.gfin; fup=rnp.fin[fkey]||0; finC=Math.round(A*fup*(1-ranaeDisc(A)))` · `rnp=PBYID[optSel.gatern]` (ลายระแนงประตู)
- **ranaeDisc** L1271: >30→.15 >20→.11 >15→.08 >10→.05 else 0
- **ฟอร์ม** L5153-5163 (`if(p.gate)`): มี `o-gfin` (สีอบ) + `o-gatewood` · เพิ่มกล่อง swap ก่อนปิด block
- **readItem** L5588: `optSel.gfin=(o-gfin.value)+g2FinNameSuffix` ⚠ suffix อบพิเศษ → rnp.fin lookup อาจ miss (เหมือน calc เดิม)
- **genQuote** L6482-6506 (`else if(it.p.gate)`): มี `gateOptNote` อยู่แล้ว (Golden Teak L6505) → **ต่อบรรทัด** swap
- **swap**: `Z=(rnp.fin[gatecoopt]||0 - rnp.fin[gfinClean]||0)×A×(1-ranaeDisc(A))`
- ⚠ **ต้องเช็ค**: o-gfin option values ↔ rnp.fin keys ตรงกันไหม (string ต้องเป๊ะ) · gatecoopt ควรเก็บ key สะอาด (ไม่มี suffix)

### B. ระแนง (rn2/rn37/rn38/rn84/rn85, p.fin) — fin = `optSel.finish × a` (ไม่มี disc)
- **calc** L1869: `if(p.fin&&optSel.finish){ opt+=(parseFloat(optSel.finish)||0)*a; }`
- **ฟอร์ม สีอบ (o-finish)**: ⚠ **ไม่ได้อยู่ใน block p.ranae (L5089)** — render ใน generic p.fin section (ยังต้อง pin จุดสร้าง select · grep buildOptSel/p.opts/o-finish creation)
- **readItem** L5549: `optSel.finish=o-finish.value (rate)` · `optSel.finishLbl=data-n (ชื่อ)`
- **genQuote** L6373 (`if(it.p.fin)`) → ระแนง det L6289-6302 (`/^ระแนง/`): _rnWork/_rnSpec · เพิ่ม `ranaeOptNote`
- **swap**: control เก็บ target rate+label → `Z=(targetRate - optSel.finish)×area` · option list = p.fin entries (+ อบขาว 0)
- โมเดลนี้ **clean สุด** → ทำก่อน

### C. ระแนงพิเศษ (bar_slide/bar_openclose) — fin = `finRate × A`
- bar_slide `bsFinish` L1533 · bar_openclose `bocFinish` L1562 (`finRate=parseFloat(optSel.bsFinish); finCost=finRate*A`)
- bar_grid `bgColor` = display ไม่คิดเงิน → label-only/ข้าม
- **genQuote** bar det L6375-6394 (`it.p.bar_*`): _bWork/_bSpec · เพิ่ม `barOptNote`
- swap: `Z=(rateNew - rateCur)×A`

### D. ราวกันตก (imp1-6) — ❌ **ข้าม (ตัดสินใจแล้ว)**
- railalucolor = อลู 3 สี (ขาว/เทา/ดำ) **ราคาเท่ากัน** (RATES[IMP2-6] flat tier ไม่มี color column · L569-574)
- swap = 0 บาทเสมอ ไม่มีความหมาย → **ไม่ทำ** (โชว์สีในรายละเอียดอยู่แล้ว L6761)

## ③ G3 visual 3 กล่อง+ลาก — ⚠ จุดห้ามแตะ (กัน G6 พัง)
G6 ซ่อนฟอร์มบานปกติด้วย CSS `.ch.g6room ... display:none!important` (L7317-7326):
- ❌ ห้ามเปลี่ยน/ลบ class `.ch.g6room` (CSS + JS L4686/4688/4699 toggle)
- ❌ ห้ามลบ anchor `.note-opt-group` / `.chfoot` (G6 insertBefore builder · L4692)
- ❌ ห้ามย้าย `.i-prod` ออกจาก `.full` wrapper (CSS `.full:has(>.i-prod)` L7323)
- ❌ ห้ามย้าย `.size-row/.optbox/.i-color-wrap/.note-opt-group/.subitem-wrap` ออกจาก `.ch` (CSS target `.ch.g6room .X`)
- ✅ reorg ต้องคงทุก class hook + element เป็น child ของ `.ch` · เทส G6 ทุกครั้ง ([[verify-g6-on-layout-change]])
- drag-reorder tool: grep ทั้งไฟล์หา draggable/ondragstart/grip ที่ reusable (G6 builder/อื่นมี)

## ลำดับทำ (เต็มสมาธิ · verify ทุกก้อน)
1. ④-B ระแนง (clean สุด · pin o-finish ก่อน) → golden+browser → push
2. ④-A gate (เช็ค key alignment) → push
3. ④-C พิเศษ → push
4. ③ visual (เทส G6 ทุกขั้น) → push
ทุกก้อน: `node scripts/golden-snapshot.mjs` ต้องนิ่ง (swap ไม่แตะ calcUnit) + render ใบจริงเช็ค OPTION line + ยอดไม่ขยับ

อ้างอิง: map เต็ม temp tasks/wx3pptfh4.output · memory [[color-swap-option-line]] [[g3-newstyle-draft-master]] [[g2-fix-batch-pending-queue]]
