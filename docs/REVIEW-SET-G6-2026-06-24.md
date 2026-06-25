# 🛡️ REVIEW-SET G6 (กั้นห้องกระจก redesign v8) — แผนกันแก้วนซ้ำ (acceptance criteria + แผน gate)

**วันที่:** 2026-06-24 · **เป้า:** แปลงดราฟ v8 + ใบสั่ง dev 9 ธง → เกณฑ์ตรวจที่ "วัดได้" + แผน gate (DOM eval) เพื่อให้ dev แก้ `public/calculator/index.html` **รอบเดียวเหมือนดราฟ** (ไม่วนแก้แบบ G2/G3)
**สถานะไฟล์:** READ-ONLY — เอกสารนี้คือ "ข้อสอบ" ที่ dev รันเองได้ก่อน push · ห้ามแก้ index.html จากเอกสารนี้
**แม่แบบรูปแบบ:** `docs/REVIEW-SET-G1G4-2026-06-24.md`

> ⚠️ **บริบทสำคัญ:** ของ G6 redesign v8 **ยังไม่ถูกแก้ลง index.html เลย** (ตรวจสด 24มิ.ย.) — engine ปัจจุบันยังเป็นแท็บ 5 ปุ่ม (`['🏠หลังคา/ฝ้า','⚡ไฟ','📄สรุป']` · `np()=sides+3` · ไม่มี roomColor/services state). REVIEW-SET นี้จึงเป็น "เกณฑ์รับงานก่อนแก้" ทั้งหมด (ไม่ใช่ตรวจของที่แก้แล้วแบบ G1/G4)

---

## ⚠️ 0. แก้ก่อนส่ง dev — เลขบรรทัดในใบสั่ง dev คลาดเคลื่อน (ตรวจสดแล้ว)

ใบสั่ง `ORDER-dev-G6-2026-06-24.md` อ้าง engine G6R ที่ "~L8123–8542" แต่ index.html ถูกแชทอื่นแก้ → **เลื่อนลง ~107 บรรทัด**. ตรวจสด 24มิ.ย. ได้ค่าจริง:

| สิ่งที่อ้างในใบสั่ง | บรรทัดในใบสั่ง | บรรทัดจริง (24มิ.ย.) |
|---|---|---|
| `np()` | L8244 | **L8351** |
| `pageName()` | L8245 | **L8352** |
| `tabsHTML()` | L8251–8254 | **L8358–8361** |
| `render()` dispatcher | L8255–8262 | **L8362–8369** |
| `roomTotal()` | L8248 | **L8355** |
| `g6rPrice(pc)` | L8235–8237 | **L8342–8344** |
| `freshState()` | L8125 | **L8232–8234** |
| `elecPage(bc)` | L8392–8416 | **L8499** |
| `sumPage(bc)` | L8417–8425 | **L8524** |
| `colorPrice(ci,a,series)` | L1341 | **L1341 ✅ ตรง** |
| `g1CoOptNote(d,area)` | L1236–1277 | **L1237 ✅ ตรง** |
| `g6ColorChips` / `g6GlassOpts` | L8230 / L8227 | **L8337 / L8334** |
| GLASS array | L652 | **L652 ✅ ตรง (66 รุ่น)** |

> 🔴 **dev ต้อง `grep` หา function name เอา ไม่ยึดเลขบรรทัดในใบสั่ง** (index ขยับทุกครั้งที่แชทอื่นแก้) · `git pull --rebase` ก่อนเริ่ม แล้ว grep ซ้ำอีกรอบ

---

## A. ✅ ยืนยัน Canonical เดียว + ไฟล์เก่าที่ควร archive

### 🎯 Canonical (ยึดอันเดียว — ห้ามเปิดอันอื่นมาเทียบ)
| บทบาท | ไฟล์ |
|---|---|
| **ต้นแบบ UX (approve แล้ว v8)** | `docs/DRAFT-G6-redesign-full-2026-06-23.html` ⭐ |
| **ใบสั่ง dev (ธง A–I)** | `docs/ORDER-dev-G6-2026-06-24.md` |
| script ตรวจ (meta-runner) | `scripts/check-g6.mjs` |

> ⭐ **`DRAFT-G6-redesign-full-2026-06-23.html` คือไฟล์เดียวที่ต้องเหมือนเป๊ะ** (v8 · แท็บ 6: ด้าน/🎨สี-กระจก/🏠หลังคา/🔧งานเสริม/📄สรุป) · ไฟล์ G6 อื่นทั้งหมดเป็นรอบก่อน (builder/mixer/5บล็อก/สเปคสี) **คนละ scope** — อย่าหยิบมาเทียบ

### 🗂️ Sprawl ไฟล์เก่า G6 (มีเยอะกว่า G1/G4 — ดราฟ G6 ทำซ้ำหลายรอบ) → ควร archive แยกโฟลเดอร์ (ไม่ลบ · กันสับสน)
**นับจาก Glob: ดราฟ/เอกสาร G6 รวม ~70 ไฟล์** กระจาย 4 โฟลเดอร์ — ที่เป็น **ดราฟ UX เก่า (ไม่ใช่ v8)** ควร archive:

- `docs/กลุ่ม6-กั้นห้องกระจก/DRAFT-G6-*.html` (ux/ux-v2/ux-FULL/ux-FINAL/ux-REAL/UX-จัดกลุ่ม/UX-สเปควัสดุ/UX-เป้าหมายรวม/UX-เลือกกระจกสี-v2/สเปคสีกระจก/งานพื้น-พัดลม = **~14 ไฟล์**)
- `docs/DRAFT-G6-*.html` (ราก docs · ux-2026-06-19/20 · mirror/5บั๊ก/structure-proposal/feature-order/ux-REAL-20 = **~7 ไฟล์**)
- `docs/งานข้ามกลุ่ม-G1ถึงG6/DRAFT-G6-options-6groups` · `docs/DRAFT-สลับตรวจ-G6กับG1...` · `docs/DRAFT-G6-UX-*` (cross) = **~3 ไฟล์**
- HANDOFF/SPEC/REVIEW/COMPARE/AUDIT/SAMPLE/PRICELIST รอบ 11–18 มิ.ย. (= **~40 ไฟล์** · เก็บเป็นประวัติ ไม่ต้องเทียบ)

> **ข้อเสนอ:** ย้ายดราฟ UX เก่า (~24 ไฟล์ DRAFT-G6-* ที่ไม่ใช่ v8) เข้า `docs/_archive/G6-pre-v8/` ก่อนส่ง dev (ลด sprawl · canonical โดดเดี่ยว) — **ถามพี่นัทก่อนย้าย · อย่าลบ · เลื่อนทำตอน index/แชทอื่นว่าง** (กันชน เหมือนมติ G1/G4)

---

## B. 📋 ตารางเกณฑ์ตรวจวัดได้ ต่อธง A–I (acceptance criteria)

> หลักการ: ทุกแถว "ตรง/ไม่ตรง" ตอบได้ด้วยตัวเลข/DOM ไม่ใช่ความรู้สึก · ราคา/สี/กระจก ดึงจาก **engine จริง** (COLORS · GLASS L652=66 · colorPrice L1341 · g1CoOptNote L1237) ไม่ใช่จากเดโม ALU/GLASS ในดราฟ (ดราฟใช้ array ย่อ — ของจริงใหญ่กว่า)

### 🎌 ธง A — แท็บ 6 ปุ่ม (reuse pager)

| # | เกณฑ์ (วัดได้) | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| A-① | `np()` คืน sides+**4** (เพิ่มหน้า color) | `np()===G6R.sides.length+4` (เดิม +3) | DOM eval: เพิ่มห้อง → อ่าน `np()` · นับ tab ใน `.g6r-tabs` |
| A-② | ลำดับแท็บตรงดราฟเป๊ะ | `ด้าน A · …(+ด้าน) · 🎨สี/กระจก · 🏠หลังคา/ฝ้า · 🔧งานเสริม · 📄สรุป` (ดราฟ L106–113) | DOM: อ่าน textContent ปุ่มใน `.g6r-tabs` ตามลำดับ |
| A-③ | `render()` dispatch ถูก: o=0→color, 1→roof, 2→extra, 3→sum | กดแต่ละแท็บ → body เปลี่ยนถูกหน้า | DOM eval: `G6Rgo(idx)` แต่ละค่า → ตรวจ `.ph` ในbody |
| A-④ | ＋ด้าน ยังเพิ่มด้านได้ (ไม่พังจากการเพิ่มหน้า) | `G6RaddSide()` → np เพิ่ม 1 · แท็บด้านใหม่โผล่ | DOM eval: addSide → นับแท็บด้านเพิ่ม |
| A-⑤ | เปลี่ยน ⚡ไฟ → 🔧งานเสริม (label) | ไม่มีแท็บ label "⚡ไฟ" เดี่ยว · มี "🔧งานเสริม" | DOM: grep textContent tabs |

### 🎌 ธง B — 🎨 สี/กระจก ระดับห้อง L1/L2/L3 + override ต่อด้าน (engine ใหม่) ★ จุดเสี่ยงสุด

| # | เกณฑ์ (วัดได้) | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| B-① | state `roomColor` + `sideOvr` ถูกเพิ่มใน freshState | `freshState().roomColor` มี {on,mode,colorIdx,colorCode,glassIdx,l3ColorIdx,l3Code,l3GlassIdx} · `sideOvr` = {} | DOM eval: อ่าน `freshState()` keys |
| B-② | L1 checkbox "สีตามทั้งใบ" ติ๊ก default · body L2/L3 ซ่อน | `#l1`/equiv checked=true · `.l2l3` display none ตอนเปิด | DOM eval: เปิดแท็บ color → ตรวจ checked + display |
| B-③ | ปลด L1 → โผล่ L2 (mode 🟢/🔵) + L3 | ปลด → `.l2l3.show` · มี radio 2 (real/opt) | DOM eval: uncheck → fire change → display!='none' · radio count===2 |
| B-④ | L2 สีอลู = dropdown COLORS เต็ม (ไม่ใช่ ALU ย่อในดราฟ) | options = COLORS.length (เต็ม engine) จัด optgroup · **ไม่ใช่ 13 ตัวจากเดโม** | DOM eval: select L2สี options.length===COLORS.length |
| B-⑤ | L2 กระจก = dropdown ครบ **66** + optgroup ตาม GLASS_CATS | options.length===66 (reuse `g6GlassOpts`) | DOM eval: นับ options · เทียบ GLASS.length===66 |
| B-⑥ | รหัสสีโผล่เมื่อสีมี code (อบพิเศษ/ลายไม้อบ/ชุบ/Fuji) | เลือกสี hasCode → `.codebox.show` (L2 + L3) | DOM eval: เลือก index ที่ COLORS มี code → codebox display!='none' |
| B-⑦ 🔴 | L3 "ตามห้อง/ไม่เทียบ" option value=**-1** (กันบั๊กแบบ A1 ของ G1) | `#l3c` option[0].value==='-1' · `.sidec`/`.sideg` value[0]==='-1' | DOM eval: ตรวจ value option[0] ทุก select ที่มี "ตามห้อง" |
| B-⑧ | marker ＋/－ สลับใน L3 details | `.l3 summary::before` = '＋' ปิด / '－' เปิด | เว็บสด + CSS rule `[open]` |
| B-⑨ | override ต่อด้าน sA/sB ติ๊กแล้วโผล่ select สี+กระจกเฉพาะด้าน | ติ๊ก "ด้าน X ต่างจากห้อง" → `.det.show` มี 2 select | DOM eval: ติ๊ก ovr → ตรวจ det display + select count |
| B-⑩ 🔴**ราคา·core** | resolve สีบานต่อช่อง: `pc.colorIdx > sideOvr[ด้าน] > roomColor(real) > 0` | ต้องเพิ่ม helper รู้ "ด้านไหน" (g6rPrice เดิมไม่รู้ side) | DOM eval E-series (ดูส่วน C) |
| B-⑪ 🔴**ราคา·Q2** | OPTION line สี/กระจก L1/L2 = colorPrice/glass × **พื้นที่รวมบานกระจกทั้งห้อง** | คูณ Σ พื้นที่บานกระจกทุกบาน (ไม่ใช่ต่อบาน) · override=เฉพาะด้านนั้น | DOM eval: ตั้ง 2 บาน → opt mode → diff = colorPrice × (area1+area2) |
| B-⑫ | default (ไม่ติ๊ก roomColor) = ราคาเท่าเดิมเป๊ะ (golden นิ่ง) | roomColor.on=0 → g6rPrice ใช้ ci0/gi0 เดิม | golden 150/150 |

### 🎌 ธง C — 🔧 งานเสริม รวมหน้าเดียว (reuse elecPage + ย้าย floor/fan เข้า)

| # | เกณฑ์ | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| C-① | extraPage มีครบ 5 หัวข้อเรียงตรงดราฟ | ⚡ไฟ → 🚰ประปา → 🟫พื้น/พัดลม → 🔧ผรม./รื้อ → 📝หมายเหตุ (ดราฟ L155–233) | DOM eval: แท็บ extra → นับ `.ph`/หัวข้อตามลำดับ |
| C-② | ไฟ/พื้น/พัดลมเดิมยังคิดราคาถูก (ย้ายไม่ทำพัง) | elecTotalReal/floorTotal/fanTotal เท่าเดิม | golden + DOM eval: ตั้งค่าเดิม → ราคาเท่าเดิม |

### 🎌 ธง D — รายการบริการห้อง (ประปา/ผรม.กรอกเอง) + 💾เซฟ + svc-demo 4 ช่อง (engine ใหม่) ★ กุญแจ

| # | เกณฑ์ (วัดได้) | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| D-① | state `services:[]` + `svc:{demo,protect,protectPts}` เพิ่ม | freshState มี services array + svc obj | DOM eval: อ่าน freshState keys |
| D-② | เพิ่มบรรทัดประปา → roomTotal เพิ่ม = qty×rate | `servicesTotal()` บวกเข้า roomTotal ก่อน ceil/100 | DOM eval: svcAdd plumb qty4 rate3000 → roomTotal +12,000 |
| D-③ | ลบบรรทัดได้ | `G6RsvcRm(idx)` → services.length ลด · roomTotal ลด | DOM eval: rm → ตรวจ length + total |
| D-④ 🔴**Q1** | รื้อ = **svc-demo 4 ช่องย่อย** (ไม่ใช่เหมา 1 ช่อง) | หลังคา 5,000/ชุด · กรีดพื้นฝังรางยู 5,000/ราง · ราวกันตก 3,000+700/ม. · ประตู(เหมา) · เรตตรง svc-demo เดิม | DOM eval: ติ๊กรื้อหลังคา → +5,000 · ราวกันตก 2ม. → 3,000+1,400 · ตรวจ 4 ช่องมีจริง |
| D-⑤ | Protection = svc-protect เดิม (2,000 min + 1,000/จุด) | ติ๊ก → +2,000 · +จุด → +1,000/จุด | DOM eval: togProtect → +2,000 · protectPts=2 → +4,000 |
| D-⑥ | 💾 เซฟพรีเซ็ตลง localStorage + try/catch | กดเซฟ → key `jr_g6_*_presets` มีค่า · reload → ชิปยังอยู่ · JSON พังไม่ crash | DOM eval: savePreset → อ่าน localStorage · ใส่ค่าพัง → ไม่ throw |
| D-⑦ | พรีเซ็ตชิปประปา/ผรม. ครบตามดราฟ | ประปา 8 ชิป (ดราฟ L167–174) · ผรม.รีโนเวท 9 ชิป (L197–207) | DOM eval: นับชิป chk แต่ละหมวด |

### 🎌 ธง E — แตกราคา 2 แบบในใบ (engine ใหม่)

| # | เกณฑ์ | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| E-① | ใบมี 2 ปุ่ม 📊ภาพรวม / 🔍ละเอียด · default ภาพรวม | `billMode('o')` default on · toggle ได้ | DOM eval: render ใบ → ตรวจ 2 ปุ่ม + default class on |
| E-② 🔴 | 🔍ละเอียด = แตกราคารายออปชั่นต่อบาน (บานฐาน/ล็อก/มุ้ง/มือจับ/คาด/ลูกฟูก/โช้ค/ครอบ) | ใช้ `calcUnit` คืน `r.addonLines` (readItem ใช้อยู่แล้ว) map เป็น sub-line | DOM eval: บานมีมุ้ง+ล็อก → billDetail มีบรรทัดมุ้ง+ล็อกแยกราคา |
| E-③ 🔴 | ยอด 🔍ละเอียด รวม === ยอด 📊ภาพรวม === roomTotal | Σ บรรทัดละเอียด = ยอดด้าน = roomTotal | DOM eval: sum billDetail lines === roomTotal |

### 🎌 ธง F — แท็บ 📄 สรุป = ใบเต็ม + วิธีคิด

| # | เกณฑ์ | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| F-① | sumPage render บล็อกใบห้องเต็ม (ไม่ใช่ย่อต่อด้าน) | หัวห้อง→บานรายด้าน→งานเสริมแยกราคา→OPTION(1)(2)→หมายเหตุ→รายละเอียด→รวมห้อง (ดราฟ L270–322) | DOM eval: แท็บ sum → ตรวจ block sections มีครบ |
| F-② | ปุ่ม 📊/🔍 (ธง E) อยู่ในหน้า sum | toggle ทำงานในแท็บ sum | DOM eval |
| F-③ | G6 **ไม่ทำหัวใบ/VAT/ลงนามเอง** — engine ห่อทั้งใบเหมือน G1–G5 | readItem คาย work/spec/note/roomLines · หัวใบมาจาก genQuote | เทส genQuote: ใบจริงมี VAT/ลงนาม จาก engine กลาง |

### 🎌 ธง G — หมายเหตุ (ติ๊กพรีเซ็ต + กรอกเอง)

| # | เกณฑ์ | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| G-① | reuse REMARK_PRESETS + กล่องพับติ๊กหลายข้อ ในแท็บ extra ล่างสุด | render จาก REMARK_PRESETS · ไม่ hardcode | DOM eval: นับ preset = REMARK_PRESETS |
| G-② 🔴**กับดัก** | หมายเหตุเก็บใน `__g6state` (ไม่ใช่ `.i-note` ที่ถูก CSS ซ่อน) → คายผ่าน g6rRoomNote → readItem | `.ch.g6room .note-opt-group` ถูกซ่อน (L8223) → ต้องเก็บใน state | DOM eval: ติ๊ก 2 + พิมพ์ 1 → readItem note มีครบ |

### 🎌 ธง H — ราคาทุกส่วนแตกบรรทัดในใบ

| # | เกณฑ์ | ค่าที่ถูกต้อง | วิธีตรวจ |
|---|---|---|---|
| H-① | g6rRoomSummary เพิ่มบรรทัด: ประปา/รื้อ/Protection/ผรม. | summary lines = [ด้าน…, หลังคา, ไฟ, ประปา, พื้น, พัดลม, รื้อ, Protection, ผรม.] เรียงตรง pricebar ดราฟ L88–100 | DOM eval: ตั้งครบทุกส่วน → นับบรรทัดในใบ |
| H-② | ยอดรวมบรรทัด === roomTotal | Σ ทุกบรรทัด = roomTotal | DOM eval |

### 🎌 ธง I — กันพัง (รวมในส่วน C ด้านล่าง)

---

## C. 🚦 แผน gate — DOM eval ที่ golden จับไม่ได้ (สำคัญสุด)

> **ธง B/D/E เป็น engine ใหม่ + option-driven → golden จับไม่ได้** (golden render แค่ base config = ไม่ติ๊กอะไร). บทเรียน glassWallArea (memory): ฟีเจอร์ option-driven bug โผล่ตอน render จริง golden เงียบ. **ต้องรันสคริปต์ DOM eval แยกบนเว็บสด/jsdom หลัง dev** แต่ละเคส:

### ① golden-snapshot — กันราคา base เพี้ยนข้ามกลุ่ม (บังคับ · ก่อน+หลัง)
```
node scripts/golden-snapshot.mjs        # ต้องขึ้น 150/150 เป๊ะ (24มิ.ย. ยืนยัน 150/150 · imp31 ไม่กระทบ G6)
```
- default G6 (roomColor.on=0 · services ว่าง · svc ไม่ติ๊ก) = **ราคาต้องเท่าเดิมทุกตัว**

### ② check-g6.mjs — meta-runner 6 มิติ G6 เดิม (รันได้เลย · บังคับหลังทุกธง)
```
node scripts/check-g6.mjs 2026-06-24    # → docs/กลุ่ม6-กั้นห้องกระจก/CHECK-G6-vs-draft-2026-06-24.html
```
- รวม: golden + `test/g6-room-options.mjs` (parity G1) + `test/g6-room-quote-detail.mjs` (ใบแตกบาน) + `test/g6-floor-fan.mjs` (พื้น/พัดลม) + `test/g6-phaseB-flags.mjs` (มุ้ง/ผ้า)
- 🔴 **แต่ทั้ง 5 เทสยังไม่ครอบ v8 ใหม่** (สี/กระจกระดับห้อง · services · แตกราคา 2 แบบ · แท็บ 6) → **ต้องเพิ่มเทส/DOM eval ③ ก่อนถือว่า gate ครบ**

### ③ test G6 ที่มีอยู่ (7 ไฟล์ · ใช้เป็นฐาน · ต้องไม่พังหลังแก้)
| ไฟล์ | ครอบอะไร | สถานะกับ v8 |
|---|---|---|
| `test/g6-room-options.mjs` | ออปชั่นบาน + parity ราคา G1 | ✅ ต้องยังเขียว (ธง B ห้ามทำ panel ต่อบานพัง) |
| `test/g6-room-quote-detail.mjs` | ใบแตกรายบาน/ออปชั่น | 🟡 ต่อยอด → ธง E/H (แตกราคา 2 แบบ) |
| `test/g6-floor-fan.mjs` | พื้น 5,000/ตร.ม. ลด10% · พัดลม | ✅ ธง C ย้ายเข้า extra ห้ามพัง |
| `test/g6-phaseB-flags.mjs` | มุ้ง/ผ้ามุ้ง | ✅ ต้องยังเขียว |
| `test/g6-a2-glasscolor.mjs` | สี/กระจกต่อช่อง (A2) | 🟡 ต่อยอด → ธง B (เพิ่มชั้นระดับห้อง) |
| `test/ux-all-g1-g6.mjs` | ปุ่ม/ฟอร์มรวม G1–G6 | 🟡 อัปเดตแท็บ 6 ปุ่ม |
| `test/g6-room-quote-detail.mjs` | (ดูบน) | — |

### ④ รายการ DOM eval ที่ต้องเขียนใหม่ (.mjs ชั่วคราว · jsdom render → ติ๊ก → อ่าน roomTotal/quoteContent)

**ธง A (แท็บ):**
1. **A-①/A-②:** render G6 item → assert `np()===sides+4` · textContent tabs เรียงตรงดราฟ 6 ค่า
2. **A-③:** `G6Rgo(0..3)` → ตรวจ body `.ph` = color/roof/extra/sum ตามลำดับ

**ธง B (สี/กระจก · เสี่ยงสุด):**
3. **B-②/B-③:** เปิดแท็บ color → L1 checked + l2l3 ซ่อน → uncheck → l2l3.show + radio×2
4. **B-④/B-⑤:** assert select L2สี options===COLORS.length · L2กระจก===66
5. **B-⑥/B-⑦:** เลือกสี hasCode → codebox โผล่ · option "ตามห้อง" value==='-1' (l3c/sidec/sideg)
6. **B-⑩/B-⑪ (ราคา core · Q2):** ตั้ง 2 บานกระจก (area A0, B0) → roomColor on + สีพิเศษ + mode=real → assert roomTotal +colorPrice×(A0+B0) · mode=opt → roomTotal **เท่าเดิม** + quoteContent มี "OPTION" + diff = colorPrice×(A0+B0)
7. **B-⑨:** override ด้าน A สีพิเศษ → บานด้าน A คิดสีด้าน · ด้านอื่นตามห้อง (assert ราคาต่างกันถูก)
8. **B-⑫:** roomColor.on=0 → roomTotal === baseline (golden นิ่ง)

**ธง D (services · กุญแจ):**
9. **D-②/D-③:** svcAdd plumb(qty4,rate3000) → roomTotal +12,000 · svcRm → −12,000
10. **D-④ (Q1):** ติ๊กรื้อหลังคา → +5,000 · ราวกันตก 2ม. → +(3,000+1,400) · assert มี 4 ช่องย่อย ไม่ใช่เหมา
11. **D-⑤:** togProtect → +2,000 · protectPts=2 → +4,000 (= 2,000+2×1,000)
12. **D-⑥:** savePreset → localStorage key มีค่า · ใส่ JSON พัง → ไม่ throw (try/catch)

**ธง E/F/H (ใบ):**
13. **E-②/E-③:** บานมีมุ้ง+ล็อก → billDetail แตกบรรทัดมุ้ง/ล็อกแยกราคา · Σ billDetail === Σ billOverview === roomTotal
14. **F-①/F-③:** genQuote จริง → ใบมีบล็อกห้องครบ section + หัวใบ/VAT มาจาก engine กลาง (G6 ไม่ทำเอง)
15. **H-①/H-②:** ตั้งครบทุกส่วน → ใบมีบรรทัด ประปา/รื้อ/Protection/ผรม. · Σ = roomTotal

**ธง G + กันพัง:**
16. **G-②:** ติ๊กหมายเหตุ 2 + พิมพ์ 1 → readItem note มีครบ (เก็บใน __g6state ไม่ใช่ .i-note)
17. **console error:** ทุกเคส assert `jsErr===0` (กันบั๊กแบบ glassWallArea/box=null)
18. **G1 ไม่พัง (engine ร่วม):** render G1 บานเลื่อน L2/L3 ยังทำงาน · golden 150/150

### ⑤ เว็บสดจริง (เปิด preview) — visual ที่ DOM eval จับไม่ได้
- B-⑧ marker ＋/－ สลับ · optgroup สี/กระจกจัดหมวดถูก · 6 แท็บกดสลับลื่น · ใบ 2 โหมดสวย
- **โหมดเร็ว (.qi-):** เพิ่มกั้นห้อง = ไม่ error (G6 มีโหมดเต็มเท่านั้น)
- screenshot ค้างใน env → DOM eval + เปิด preview ดูตาเปล่า · แคป before/after ส่งพี่นัท

---

## D. ⚠️ กับดัก G6 ที่เคยทำพัง (จาก memory — อย่าพลาดซ้ำ)

| กับดัก | รายละเอียด | กันยังไง |
|---|---|---|
| 🔴 **hook box=null crash** | A4 เคย blanket replace กลุ่ม 6 → `Cannot set innerHTML of null` บน setbox เดิม (3 เทสแตก · revert) | guard null เสมอ (`if(!mt)return` แบบ L8473 เดิม) · mount เฉพาะ item มี `.g6r-mount` |
| 🔴 **engine ร่วม G1↔G6** | ทุกบานคิดผ่าน `calcUnit` ตัวเดียวกับ G1/G3 ผ่าน g6rPrice. แก้ map ใน g6rOptSel ผิด = ราคา G6 เพี้ยน + อาจกระทบ G1 | **ห้ามแก้ calcUnit เพื่อ G6** · ทุกอย่าง map ผ่าน g6rOptSel · golden 150/150 + เทส G1 |
| 🔴 **escape JS ใน inline onclick** | engine เก็บ `window.G6R*` เรียกผ่าน `onclick="G6Rxxx('...')"` · ค่ามี `'`/`\n` ต้อง escape (A3c เคยพังจาก `\'` ผิด) | escape ตามสไตล์เดิม (String.fromCharCode L8370) · **subagent แตะ inline JS → `node --check` ทันที** |
| 🔴 **CSS .g6room ซ่อนฟอร์ม** | `.ch.g6room` ซ่อนฟอร์มบาน G1 + `.note-opt-group`/`.optbox`/`.i-note` ด้วย CSS (L8217–8227) · DOM ใหม่ที่ตรง selector เดิมโดนซ่อน | ใช้ class ใหม่ namespace `.g6r-*` · หมายเหตุเก็บ state ไม่ใช่ `.i-note` (ธง G-②) |
| 🔴 **state pointer หลายห้อง** | public API สลับ `G6R=itemEl.__g6state` ชั่วคราวแล้วคืน · ฟังก์ชัน room-level ใหม่ (สี/services) ต้องเก็บใน `__g6state` ไม่ใช่ global ลอย | มิฉะนั้นหลายห้องในใบเดียวปนกัน · เทส 2 ห้องในใบ |
| 🟠 **โหมดเร็ว (.qi-) พัง** | G6 มีในโหมดเต็มเท่านั้น | เปิดโหมดเร็ว เพิ่มกั้นห้อง = ไม่ error |
| 🟠 **g6rPrice ไม่รู้ side** | ธง B-⑩ ต้อง resolve สีตามด้าน แต่ g6rPrice เดิมรับแค่ pc (ไม่รู้ตัวอยู่ด้านไหน) | เพิ่ม param/helper `pcResolveColor(sideIdx,pc)` · ไม่งั้น override ด้านคิดผิด |
| 🟠 **เลขบรรทัดในใบสั่งคลาด** | ORDER อ้าง L8123–8542 แต่จริง ~+107 (ดูส่วน 0) | grep function name · pull --rebase ก่อน |

---

## E. ✅ Checklist "ผ่านทุกข้อ = เหมือนดราฟ v8" (dev ติ๊กก่อน push)

**ราคา/regression:**
- [ ] golden-snapshot **150/150** ก่อน + หลัง
- [ ] G1 บานเลื่อน L2/L3 + G2–G5 ไม่พัง (engine ร่วม · เปิดดู 1–2 กลุ่ม)
- [ ] โหมดเร็ว (.qi-) เพิ่มกั้นห้อง = ไม่ error
- [ ] console jsErr === 0 ทุกเคส DOM eval
- [ ] `node scripts/check-g6.mjs 2026-06-24` 6 มิติเขียว + test G6 7 ไฟล์ไม่พัง

**ธง A (แท็บ 6):**
- [ ] A-① np=sides+4 · A-② ลำดับ 6 แท็บตรงดราฟ · A-③ dispatch ถูก · A-④ ＋ด้านได้ · A-⑤ ⚡ไฟ→🔧งานเสริม

**ธง B (สี/กระจก · เสี่ยงสุด):**
- [ ] B-① state roomColor+sideOvr · B-②/③ L1 default→ปลด L2/L3 · B-④ สี=COLORS เต็ม · B-⑤ กระจก 66
- [ ] B-⑥ รหัสสีโผล่ · B-⑦ value=-1 (กันบั๊ก A1) · B-⑧ marker ＋/－ · B-⑨ override ด้าน
- [ ] B-⑩ resolve สีตามด้านถูก · B-⑪ OPTION × พื้นที่รวมทั้งห้อง (Q2) · B-⑫ default golden นิ่ง

**ธง C–D (งานเสริม + services):**
- [ ] C-① 5 หัวข้อเรียงตรงดราฟ · C-② ไฟ/พื้น/พัดลมเดิมไม่พัง
- [ ] D-① state services+svc · D-②/③ เพิ่ม/ลบบรรทัดยอดถูก · D-④ รื้อ 4 ช่อง svc-demo (Q1)
- [ ] D-⑤ Protection 2,000+1,000/จุด · D-⑥ 💾localStorage try/catch · D-⑦ พรีเซ็ตครบ

**ธง E–H (ใบ):**
- [ ] E-① 2 ปุ่ม default ภาพรวม · E-② ละเอียดแตกรายออปชั่น · E-③ ยอด 2 โหมด=roomTotal
- [ ] F-① สรุป=ใบเต็ม · F-③ หัวใบ/VAT จาก engine กลาง (G6 ไม่ทำเอง)
- [ ] G-① REMARK_PRESETS · G-② หมายเหตุเก็บ __g6state ขึ้นใบ
- [ ] H-① บรรทัดครบ (ประปา/รื้อ/Protection/ผรม.) · H-② Σ=roomTotal

**ทั่วไป:**
- [ ] เทสเบราว์เซอร์สด 6 แท็บ + ออกใบจริง 1 ใบ (หลายด้าน+สีพิเศษ+ประปา+ผรม.+หมายเหตุ) + 2 ห้องในใบไม่ปนกัน
- [ ] แคป before/after ส่งพี่นัท

> **จุดไหนไม่ชัด → ถามก่อนแก้ ห้ามเดา** (กันแก้เกินรอบ)

---

## 🔴 ประเด็นค้าง ต้องเคาะ/ทำก่อนส่ง dev

1. **✅ 3 Q เคาะแล้ว (24มิ.ย. · ในใบสั่ง):** Q1 รื้อ = svc-demo 4 ช่องเต็ม · Q2 OPTION สี L1/L2 = คูณพื้นที่รวมบานทั้งห้อง (override=ต่อด้าน) · Q3 = 2 โหมดราคา (ภาพรวม 1 บรรทัด / ละเอียดแตก)
2. **🔴 เลขบรรทัดใบสั่ง dev คลาด ~+107** (ดูส่วน 0) — dev ต้อง grep function name + pull --rebase ก่อน · **อย่ายึดเลขในใบสั่ง**
3. **🟡 ยังไม่มีเทส/DOM eval ครอบ v8 ใหม่** (สี/กระจกระดับห้อง · services · แตกราคา 2 แบบ · แท็บ 6) — check-g6 เดิม 6 มิติ + test 7 ไฟล์ ครอบแค่ของเดิม → **ต้องเขียน DOM eval ④ (18 เคส) ก่อนถือว่า gate ครบ** (Chat A ทำตอนใกล้ส่ง dev)
4. **🟡 archive sprawl ~24 ไฟล์ DRAFT-G6 เก่า** → ถามพี่นัทก่อนย้าย เข้า `docs/_archive/G6-pre-v8/` · เลื่อนทำตอน index ว่าง
5. **⚠️ G6 redesign v8 ยังไม่แตะ index เลย** — งานนี้คือ "แก้ครั้งแรก" ทั้งก้อน (ต่างจาก G1/G4 ที่แก้ไปแล้ว) · ลำดับแนะนำในใบสั่ง: A→C→G→H→D→B→E→F→I (โครงก่อน · engine ใหม่ทีหลัง · ใบท้ายสุด)
