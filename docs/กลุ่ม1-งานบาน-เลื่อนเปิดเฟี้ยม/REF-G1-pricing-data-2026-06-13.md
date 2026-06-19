# G1 (งานบาน/กระจก) — Reference ข้อมูลจริง สกัดจาก public/calculator/index.html

> สกัดโดย subagent 2026-06-13 · ยึดเลขตามไฟล์เป๊ะ + line number · จุดต้องยืนยันติดป้าย (เช็คซ้ำ)
> ใช้เป็นฐานข้อมูลทำดราฟ UX (`DRAFT-G1-ux-FULL-2026-06-13.html`) + เอกสาร PDF + handoff dev

---

## 1. Engine — วิธีคิดราคา (method)

ฟังก์ชันแกน (L984–1006): `rateOf(area,t)` หาเรต/ตร.ม.ตาม tier · `monoRate` = area×rateOf บังคับ monotonic · `roundUp` ปัดขึ้นพัน

| method | สูตร | line |
|---|---|---|
| bucket (default) | max(min, monoRate(area, RATES)) | L1004 |
| area_rate | max(min, monoRate) | L1001 |
| area_rate_addon | monoRate (ไม่มี min) + addon ตามจำนวนบาน | L1002 |
| per_sqm | max(min, area×rate) | L1003 |
| fold | max(area×unit_rate, per_panel_min×panels) | L998 |
| fold_flat | max(min, area×unit_rate) | L999 |
| ref_plus_panel | basePrice(ref) + per_panel×panels | L1000 |
| same_as | ใช้ทุกอย่างจาก ref | L995 |
| lift | ≤1.5→20,000 · ≤2.0→23,000 · เกิน→max(23000, area×8500) | L997 |

- **Floor หลายบาน** (L1555): panels>1 & usesPanels & ไม่ใช่ ceLinear → floor = monoRate(area/panels)×(1+0.67×(panels−1)) (บานแรกเต็ม · ถัดไป 0.67/บาน)
- **ราคาขาย** (L1558): core=max(base+addon, floor) · extras=glassUp+colorUp+opt · sell=roundUp(core+extras) · ceLinear: sell=Math.round (ปัดร้อยที่ฐาน กัน +1,000)

---

## 2. RATES ที่ G1 ใช้ (tier [min,max,เรต/ตร.ม.]) — L471+

**บาน (พื้นที่):**
- SMS: 2.0–2.3:6500/2.3–3.5:6000/3.5–4.5:5700/4.5–5:5000/5–7:4700/7–9:4400/9–12:4200/12+:4000
- EURO: 2.0–2.3:7200/2.3–3.5:6600/3.5–4.5:6300/4.5–5:5500/5–7:5200/7–9:4900/9–12:4700/12+:4400
- ESERIES: 2.0–2.3:7000/…/13.5+:4200 (เลิกขาย)
- FIX (ติดตาย): 0.5–1:8000/1–1.5:7500/1.5–2:7000/2–2.5:6500/2.5–3:6000/3+:5000
- AWN (กระทุ้ง): 0.6–0.8:18000/0.8–1.1:14400/1.1–1.3:12000/1.3–1.6:10800/1.6–2:9600/2–2.5:8400/2.5–2.9:7800/2.9–5.5:7200/5.5–6:6600/6+:6300
- OPEN: 2.0–2.4:7500/2.4–3:7000/3–3.5:7000/3.5–4:6500/4–5:6000/5–6:5500/6+:5000 (แต่ casement_euro ใช้ ceLinear override · OPEN ใช้สำหรับ floor/โซลิด)
- DSERIES (เลิกขาย): 2.0–2.4:9500/…/6+:6500
- XOPEN: 2.0–2.2:12500/2.2–2.5:11500/2.5–2.8:10700/2.8–3.2:9800/3.2–4:9500/4–4.5:9000/4.5–5:8300/5–5.5:7700/5.5–6:7200/6+:6800
- VELORA: 2.0–2.4:8000/2.4–3:7500/3–3.5:7500/3.5–4:7000/4–5:6500/5–6:6000/6+:5500
- PIVOT: 2.0–2.5:14000/2.5–3:13000/3–3.5:12000/3.5–4:11000/4–4.5:10000/4.5+:9000

**เลื่อนภายใน:**
- INTOP: 4–4.5:4800/4.5–5:4500/5–5.5:4200/5.5–6:3900/6+:3700
- SLIMLUX: 4–4.5:7500/4.5–5:7200/5–5.5:6700/5.5–7:6300/7–9:6000/9+:5600
- INBOT_SMS: 4–5:3800/5–5.5:3500/5.5–8:3200/8–11:2900/11+:2600
- INBOT_EURO: 4–5:4200/5–5.5:3900/5.5–8:3600/8–11:3200/11+:2900

**PC/เปลือย/ดัดโค้ง:**
- PC2: 3–3.5:11000/3.5–4:10000/4–4.5:9500/4.5–5:9200/5+:9000
- PC4: 4–4.5:11500/…/9+:8500
- FRAMELESS: 1–2:7200/2–3:6800/3–4:6400/4–5:6000/5–6:5600/6–7:5200/7–8:4800/8+:4500
- CURVE_DBL: 4–5:12000/5–6:11500/6+:11000 · CURVE_SGL: 2.3–2.5:14000/2.5+:13500 · CURVE_FIX: 1.8–2:6500/2–2.5:6000/2.5–3:5500/3–4:5000/4–5:4500/5+:4000 · CURVE_SLIM: 2.5–2.8:20000/2.8+:19000

**YKK/ผนังเบา:**
- EXHIDO: 0–4:30000/4+:20000
- ISOWALL: 1–1.5:7000/1.5–2:6500/2–2.5:6000/2.5–3:5500/3–3.5:5000/3.5+:4500
- WALL_EXT: 3–4.5:4500/4.5–6:4200/6–7.5:3900/7.5+:3600
- WALL_INT: 3–4.5:4100/4.5–6:3800/6–7.5:3500/7.5+:3200
- BEAM (optBeam เฟี้ยม): 3.5–8:1300/8–10:1100/10–12:900/12+:800

---

## 3. Product G1 (L609–833)

**บานเลื่อน:** sliding_sms (bucket min6500 SMS · M · digihandle,mosquito) · sliding_euro (min7500 EURO · L) · sliding_eseries (min12000 ESERIES เลิกขาย)

**บานเปิด:** casement_euro (min18000 OPEN · **ceLinear** convention B · closer,digihandle,mosquito L) · casement_dseries (min24000 DSERIES addon door 19000 เลิกขาย) · casement_xseries (min28000 XOPEN addon 5000 S) · casement_velora (min19000 VELORA addon 15000 S) · casement_flush_solid โซลิดทู (min18000 OPEN solid_door solid_sides=2 full_grid) · casement_inset_solid โซลิดวัน (solid_sides=1)
- **convention B (L1070):** กรอกกว้างรวม×สูง+จำนวนบาน · a=พื้นที่รวม · _paneA=a/บาน · ฐาน Linear=15000+max(0,_paneA−1.2)×4166.67 ปัดขึ้นร้อย ×บาน · ไม่มีเพดาน ไม่ใช้ floor · กระจก+มุ้งคิดพื้นที่รวม · สีคิดต่อบาน×บาน · เตือนถ้า กว้าง/บาน>1.5 หรือสูง>3.0
- **โซลิด (L1410):** ทึบไม่คิดกระจกทั้งบาน · กระจกเฉพาะช่องแสง o-solidlight ×GLASS.s · ทึบลูกฟูก 2หน้า = พื้นที่×3500×solid_sides auto

**บานกระทุ้ง:** awning_euro (bucket min10000 AWN addon window 2900 · opts awn_mode+tilt_turn) · awning_aluinch (same_as เลิกขาย)
- awn_mode: เปิดล่าง / เปิดข้าง / tilt&turn (+5,000/บาน เมื่อ mode=2, L1441) · เตือนเปิดออกนอกเท่านั้น

**บานหมุน:** pivot (bucket min26000 PIVOT addon window 5000 digihandle) · pivot_aluinch (same_as)

**บานเฟี้ยม:** folding เซมิ (fold unit9000 per_panel_min15000 M) · folding_euro (L) · folding_xseries (fold_flat min36000 unit12000 S) · optBeam → +max(4000, area×BEAM)

**เลื่อนภายใน:** inner_top_stack (area_rate_addon INTOP addon 4000/10000/16000/22000) · inner_top_slimlux (SLIMLUX 4000/10000/20000/28000 S) · inner_top_xseries (SLIMLUX) · inner_bottom_sms (INBOT_SMS) · inner_bottom_euro (INBOT_EURO 4400/11000/17600/24200) · floor พิเศษ inner_top: max(floor,14000×(1+0.67×(panels−1)))

**PC Door:** pc_door_2 (bucket min36000 PC2) · pc_door_4 (area_rate min46000 PC4)

**บานยก:** lift_sms (lift maxPanels2 motor mosquito) · lift_aluinch (same_as) · Guard >10ตร.ม.=ห้ามรับงาน

**ดัดโค้ง:** curved_double (min47000 CURVE_DBL glassDef60) · curved_single (min32000 CURVE_SGL) · curved_fixed (min10000 CURVE_FIX) · curved_slim (min50000 CURVE_SLIM) · glassDef60=กระจกดัดโค้ง เตือนถ้าเลือกธรรมดา ราคาขาด ~26000

**YKK:** ykk_vent (per_sqm rate17500 min30000 · กว้าง0.6–0.9 สูง2.0–2.2) · ykk_exhido (bucket min120000 EXHIDO · กว้าง≤2.2 สูง1.8–3.0) · tostem_a01 (per_sqm rate17500 min34000) · ทุกตัว closer

**บานเปลือย:** frameless_fixed (bucket min7000 FRAMELESS) · frameless_door (ref_plus_panel per_panel8000) · opts frametype(สวิง/เลื่อน) framecolor(6สี) · NO_COLOR (ไม่มีสีอลู ใช้สีเฟรม)

**ผนังเบา (ฝ้า-ผนัง · ยืมเข้าติดตาย):** isowall (min7000 ISOWALL) · wall_ext (min13500 WALL_EXT) · wall_int (min13500 WALL_INT) · ฉนวน o-insul +600×area

**เส้นคาด/ลูกฟูก:** grid_bars (grid standalone) · rn89 ลูกฟูก1ทาง (per_sqm 3500 fin{ซาฮาร่า700/ลายไม้สต๊อก2500/อบพิเศษ2500/อบลายไม้3500}) · rn90 ลูกฟูก2ทาง (3500 fin{400/1500/1600/2200}) · rn91 คอม3มม (3300) · rn92 คอม4มม (4000) · ranae ส่วนลดพื้นที่ (>30:15%/>20:11%/>15:8%/>10:5%)

---

## 4. ออปชั่น (o-* controls)

- **มือจับ** (กล่องรวม multi L2911): Cmech (ฝัง/เมโทร+สี · CMECH_PRICE embed door 1050/special1470 win350/490 · metro door1000/1400 win600/840 · special=สีชุบ) · ดิจิตอล DIGI (S1ก้านโยก/ลูกบิด10000·S3 18000nc·S4 18000nc·L600 24000nc·A300 10000·L900 13000·C300 11000·X1 13000·X2 20000nc·JR Prime 24900nc) nc=ต้องมีโช๊ค → +5000 · JR Prime เฉพาะ casement_euro/flush/inset · สแตนเลส (30.5:1500/45:2000/60:2000/80:2500/100:3000/120:3200) · X-series ฟรี (X-J/XO/XT) · Cmech หลบมุ้ง กระทุ้ง (ธรรมดา600/ชุบ840) · รุ่นอื่นกรอกเอง
- **โช๊ค o-closer** (closer:1): ไม่มี/แขนยื่น5000/รางเลื่อน5000/บานพับ5000
- **บานเลื่อน block:** opentype (เลื่อน/สลับ/เปิดคู่กลาง/ลากจูง · คู่กลาง auto ติดตาย=2) · o-fixed ติดตาย (+ เปิด auto=panels−fixed) · bottomrail (กันน้ำ/เตี้ย7มม label) · track รางบน (โชว์ราง/**ซ่อนราง +5000** L1437) · slidelock (มีกุญแจ/ไม่มี label)
- **ธรณี:** thresh บานเปิด (กันน้ำ/หลังเต่า+Drop Seal +1000 ถ้าไม่ติ๊กรางยู) · threshf เฟี้ยม (cosmetic)
- **มุ้ง** (p.mosquito L3118): o-mosq ชนิด · o-mosqpanels จำนวน · o-mosqw/h ขนาดเอง · o-mosqfabric (ไฟเบอร์เทา0/ดำ0/กันแมว+800/กันหนู+1200/นิรภัย tier 3500-3000) · o-mosqcolor สีกรอบ×0.5 · สูตร L1603: mosqArea=a×openRatio · mosqBase=max(min×บาน, area×เรต) · roundUp(base+fabric+color)
- **มอเตอร์ o-motor** (บานยก): ไม่มี/80กก.+18000(≤3.5ตร.ม.)/300กก.+28000
- **แผ่นทึบล่าง o-solidlower:** ไม่มี/ลูกฟูก3500/คอม3300 ×พื้นที่ + สี(ซาฮาร่า400/ลายไม้สต๊อก1500/อบพิเศษ1600/ลายไม้อบ2200)×พื้นที่ · (ซ้ำลูกฟูก — มติเลิกตัว นี้)
- **ครอบวงกบ o-fcsides:** 3ด้าน(W+2H)/4ด้าน(2(W+H)) × เรตตามสี ci≤2:700/≤4:800/≤7:1000/≤9:1100/=10:1200/=11:1300
- **ดรอปพื้น o-dfm:** +5000 + max(0,m−7)×750
- **รื้อของเดิม o-removeold** · **ฝังรางยู o-uchannel** (ล็อกธรณีหลังเต่า)
- **คาดตาราง o-gridmark:** (nh×W+nv×H)×rate(default200) + curve×3000 · nv auto=จำนวนบาน
- **ตารางเต็มบาน o-fullgrid** (โซลิด) +5000 · **combo กระทุ้งเข้าใน** กรอกเอง · **ช่องแสงโซลิด o-solidlight** ×GLASS.s · **ฉนวน o-insul** +600/ตร.ม.

---

## 5. Shared

- **GLASS[] (L560):** s=ราคาบวก/ตร.ม. · glassUp=GLASS.s×พื้นที่ · 60+ แบบ (ดูดราฟ 6 กลุ่ม) · ดัดโค้งใส10=8550 · ดัดโค้งลามิเนต5+5=11150
- **COLORS[]+colorPrice (L912):** อบขาว/ดำ=0 · ซาฮาร่า tier 540-440 · ลายไม้สต๊อก min4000 850/750 · ลายไม้อบพิเศษ min11000-15000 · อบพิเศษ min10000 · สีชุบ min16000 (เห็นตัวอย่างจริง) · colorPrice=max(min,a×rateOf) · ceLinear คิดต่อบาน×บาน
- **addon:** door/window (panels−1)×extra · sliding amounts[min(4,panels)]

---

## 6. มุ้ง catalog (standalone cat 'มุ้ง' L721) — จัด 4 กลุ่มในดราฟ
จีบ: imp28(ตีนตะขาบ) · mj_sd_basic(3500) · mj_sd_twoway(4000) · mj_keep_twoway(6000) · mj_keep_honey(4500) · mj_blackout(3500) · mj_screen_safety(5000)
ม้วน: imp29 · mj_kick_150(15000)/300(37500)/600(67500)
เฟรม: imp21(เล็ก door2400/win1200) · imp22(เล็กติดตาย) · imp23(ใหญ่ door7200/win4800)
พิเศษ: imp30(แม่เหล็ก) · imp31(นิรภัยสแตน0.8) · imp32(เสริมวงกบ) · imp33(กันแมว/หมา800) · imp35(สแตน0.3กันหนู1200)

---

## 7. การกรอก/Convention
- ขนาด: กว้าง×สูง+จำนวนบาน+จำนวนชุด · area=w×h
- casement convention B (กว้างรวม÷บาน) · usesPanels โชว์ช่องบาน
- Guard: casement กว้าง/บาน≤1.5 สูง≤3.0 · บานยก≤10ตร.ม. · YKK ขนาดเฉพาะ · มุ้งม้วนเตะเกิน maxW=ไม่คิด+เตือน

## จุดเช็คซ้ำ
1. mj_sd_sahara — มี RATES key (3200) แต่ไม่เจอ product entry (dead key?)
2. COLORS idx6/7 (มะฮอกกานี/ไวท์โอ๊ค) ติด "เช็ค KC" — สต๊อกต้องยืนยัน
3. สีชุบ idx12 rates=null คืนแค่ min16000 · ต้องเห็นตัวอย่างจริง
4. casement_euro ใช้ Linear override ไม่ใช่ tier OPEN
5. ออปชั่นจำนวนมาก render เป็นชิป (rfChips) ซ่อน select sync
