# G4 (ตู้อลู / ฝาตู้) — Reference ข้อมูลจริง สกัดจาก index.html

> 2026-06-14 · เลขยึดไฟล์+line · ตรวจซ้ำ cabinet block (L1078-1110) แล้ว · สินค้า 2 ตัว

## 0. method
- ทั้งคู่ปัดขึ้นพัน (`roundUp`) · ใช้ตาราง **FT_BASE** (ฐานบาน) + **FT_COLOR** (สีบาน) ร่วมกัน
- `ftR(a,t)`: a≤0 → tier แรก · ไม่งั้นหา tier ที่ a อยู่ในช่วง (a≥lo && a≤hi)
- `rateOf` (FIX/อื่น): a<ขั้นต่ำ → คืน tier แรก

## 1. สินค้า
| id | cat | flag | calc |
|---|---|---|---|
| cabinet_alu | ตู้อลู | cabinet:1 | L1078-1111 |
| future_tech | ฝาตู้ Future Tech (/บาน, max 3 บาน/ชุด) | future_tech:1 | L1226-1245 |

## 2. ตาราง/เรตคงที่ (ใช้ร่วม)
- **FT_BASE** (ฐานบานหน้า · พื้นที่ต่อบาน): [0.5–1.0 → 7,500] [1.0–1.5 → 10,000] [1.5–1.7 → 12,500] · L1087, L1230
- **FT_COLOR** (สีบาน · คิดเมื่อเลือกสี idx>0): [0.5–1.0 → 1,500] [1.0–1.5 → 2,000] [1.5–2.0 → 2,500] [2.0–2.5 → 3,000] [2.5–3.0 → 3,500] · L1088, L1231
- **ค่าบานเพิ่ม (extraFee):** (จำนวนบาน−1) × **5,500** เมื่อ ≥2 บาน · L1094, L1239
- **ผนังอลูทึบ:** พื้นที่ × **4,000**/ตร.ม. · **พื้น:** พื้นที่ × **4,000**/ตร.ม. · L1103, L1108
- **ผนังกระจก:** `max(5,000, พื้นที่×rateOf(FIX)) × 0.7` · L1103
- **เรตชั้น:** กระจก **1,000**/ชั้น · อลู **1,200**/ชั้น · L1083
- **RATES.FIX** (L474): [0.5–1:8000][1–1.5:7500][1.5–2:7000][2–2.5:6500][2.5–3:6000][3+:5000]
- **rn90FinRate(ci)** (ค่าสีอลู L949-956): idx2,3→400 · idx4 Aztec→950 · idx5-7→1500 · idx8,9,11→2200 · idx10,12→1600 · idx0,1→0

## 3. สูตรเต็ม

### A) cabinet_alu (ตู้อลู) — `roundUp(front + wall + fl + shc + colorStruct)`
input: W×H · D=ลึก(0.6) · stype(wardrobe/shoe) · spacing(shoe 0.2/อื่น 0.4) · nsh=ชั้น(ว่าง→max(2,round(H/spacing))) · sg=ชนิดชั้น(shoe→glass/อื่น→alu) · nDoors(2)
1. **บานหน้า** (สูตร Future Tech): `aPerDoor=(W×H)/nDoors` · `perDoor=FT_BASE(aPerDoor)+สี` · `front=perDoor×nDoors + (nDoors−1)×5500`
2. **ผนัง** `aWall=2·D·H + (ผนังหลัง? W·H:0)` → กระจก `max(5000,aWall×FIX)×0.7` / อลู `aWall×4000`
3. **พื้น** `fl=(W×D)×4000`
4. **ชั้น** `shc=nsh×srate` (1000/1200)
5. **ค่าสีโครง** `colorStruct` (ดู §4)

### B) future_tech (ฝาตู้) — `roundUp(perDoor×panelN + extraFee)`
- `aPerDoor=W×H` (ต่อบาน ไม่หาร) · `panelN=max(1,min(3,panels))` **บังคับ ≤3**
- `perDoor=FT_BASE(aPerDoor)+สี(o-ftcolor)` · `extraFee=(panelN−1)×5500`
- เตือน: aPerDoor>2.8 ⚠ · panels>3 ⚠ แยกชุด

## 4. ค่าสีโครงตู้ (colorStruct · L1101-1107) — เทียบมติ [[g4-cabinet-color-pricing]]
```
nShelfAlu = (ชั้นกระจก)?0:nsh           // ชั้นกระจกไม่คิดค่าสี
cWall  = ผนังกระจก? colorPrice(ci,aWall) : aWall×rn90FinRate(ci)
cFloor = aFloor×rn90FinRate(ci)
cShelf = (aFloor×nShelfAlu)×rn90FinRate(ci)
colorStruct = round(cWall+cFloor+cShelf)
```
- กระจก colorPrice · อลูทึบ rn90 ✓

### มติพี่นัท 2026-06-14 (เคาะแล้ว)
1. ✅ **ค่าบานเพิ่ม = 5,500** (ไม่ใช่ 5,000) → dev แก้ UI hint L3265 + comment L1227 ให้ตรง 5,500
2. ✅ **ค่าสีผนังตู้กระจก = ไม่มี min** → dev แก้ cWall: ใช้ `a×rateOf(a,rates)` ตรงๆ ไม่ครอบ `max(min,…)` (สำหรับสีที่มี rate) · ผล: ตู้กระจกใบเล็กค่าสีไม่พุ่ง
3. ✅ **สีชุบ = มีในระบบจริง** (COLORS idx 12 · L943) ไม่ใช่ค่าชั่วคราว:
   - `{n:'สีชุบ', min:16000, rates:null, series:'MLS', hasCode:1, sampleConfirm:1}`
   - **ผนังกระจก** (colorPrice idx12): rates null → คืน min = **16,000 คงที่** (L962 `if(!rates)return min`)
   - **ผนังอลูทึบ** (rn90FinRate idx12 · L954): **1,600/ตร.ม.**
   - ⚠ จุดที่ต้องเคลียร์: ข้อ 2 "ไม่มี min" ทำให้สีที่มี rate ตัด min ออก — แต่ **สีชุบ rates:null มีแต่ min 16,000** ถ้าตัด min จะกลายเป็น 0 (ฟรี) ซึ่งผิด · ดราฟจะถือว่า **สีชุบ = 16,000 คงที่ (ราคาจริงของงานชุบ ไม่ใช่ min floor)** — รอพี่นัทยืนยัน

## 5. ออปชั่น (control ที่ render)
**cabinet (L3197-3217):** ชิปสลับ ตู้อลู/ฝาตู้ · `o-cabtype`(wardrobe/shoe) · `o-cabdoors`(1/2/3) · `o-cabwallmat`(alu/glass) · `o-shelfmat` · `o-depth`(0.6) · `o-shelves`(auto) · `o-backwall`(✓ผนังหลัง) · สีโครง=`.i-color` · auto: shoe→H2.0/D0.4 · อื่น→H2.4/D0.6 (L3376)
**future_tech (L3263-3266):** ชิปสลับ · `o-ftcolor`(0=ขาว/ดำฟรี / idx≥2) · จำนวนบาน=`.i-panels` (calc max 3)

## จุดเช็คซ้ำ (ส่งพี่นัท/dev)
1. 🔴 **+5,000 vs +5,500** — UI hint (L3265) + comment (L1227) เขียน "+5,000" แต่คิดจริง **5,500** (L1094, L1239) · ลูกค้าเห็นเลขไม่ตรงที่คิด → แก้ hint หรือแก้เรต?
2. 🔴 **colorPrice มี min ขัดมติ "no-min"** (L962-963) — ผนังกระจก cabinet `max(min,…)` min สูง 15,000-16,000 → ค่าสีโครงพุ่งกับตู้กระจกเล็ก · ยืนยันตั้งใจ?
3. 🟡 **ค่าสีชุบยังค้าง** — rn90FinRate idx12(ชุบ)→1600 (เหมาเป็นอบพิเศษ) · มติ "รอไฟล์ R3.9 ข้อ 41" ยัง placeholder
4. 🟡 **max 3 บาน บังคับเฉพาะ future_tech** (L1233) · **cabinet ไม่บังคับ** (nDoors=parseInt||2 L1085) → ตู้กรอก 4+ บานได้ · ตั้งใจ?
5. 🟡 **extraFee 5,500 hardcode 2 ที่** ไม่มี constant กลาง (L1094, L1239) → แก้ที่เดียวพลาด
6. 🟢 NaN guard ครบ (parseFloat||0) · ชั้นกระจกไม่คิดค่าสีตรง hint UI

## ค้างยืนยันก่อนทำดราฟ (เฟส 2)
- เช็คซ้ำ #1 (+5,000/5,500) · #2 (min ค่าสีกระจก) · #3 (สีชุบ) — รอพี่นัทเคาะ
