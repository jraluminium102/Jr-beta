# HANDOFF G5 (delta) → แชท B · มุ้งจีบ: แยก 4 หมวด + นิรภัยตัวเดียว

> 2026-06-15 · แก้ `public/calculator/index.html` · **จุดแก้เดียว** (MOSQ_GRP_PRODS L2365-2370) · ที่เหลือ engine มุ้งทำครบแล้ว (drill-down + ออปชั่น + imp33/35 ซ่อน)

## มติพี่นัท (เคาะแล้ว 15 มิ.ย.)
1. **แยกหมวดจีบเป็น 2:** "จีบ" + "จีบม่านรังผึ้ง" (เดิม engine รวมหมวดเดียว)
2. **มุ้งจีบนิรภัย = `mj_screen_safety` ตัวเดียว** (ติดล้นนอกวงกบ) → **ซ่อน imp31/imp32 จากชิป** (เก็บ PRODUCTS L728/729 + RATES IMP31/IMP32 ไว้ เผื่อใบเก่า · เหมือน imp33/imp35)

## จุดแก้: `MOSQ_GRP_PRODS` + `MOSQ_GRP_LABEL` (L2365-2370)

### ก่อน
```js
var MOSQ_GRP_PRODS={
  frame:[['imp21','เฟรมเล็ก'],['imp22','เฟรมเล็กติดตาย'],['imp23','เฟรมใหญ่'],['imp30','แม่เหล็กพับ']],
  pleat:[['imp28','ตีนตะขาบ'],['mj_sd_basic','SD พื้นฐาน'],['mj_sd_twoway','SD ทูเวย์'],['mj_keep_twoway','ตีนตะขาบ ทูเวย์'],['mj_keep_honey','ตีนตะขาบ รังผึ้ง'],['mj_blackout','Blackout'],['imp31','นิรภัย 0.8'],['imp32','นิรภัย เสริมวงกบ'],['mj_screen_safety','จีบนิรภัย']],
  roll:[['imp29','ม้วน'],['mj_kick_150','เตะ 150'],['mj_kick_300','เตะ 300'],['mj_kick_600','เตะ 600']]
};
var MOSQ_GRP_LABEL={frame:'เฟรม',pleat:'จีบ',roll:'ม้วน'};
```

### หลัง
```js
var MOSQ_GRP_PRODS={
  frame:[['imp21','เฟรมเล็ก'],['imp22','เฟรมเล็กติดตาย'],['imp23','เฟรมใหญ่'],['imp30','แม่เหล็กพับ']],
  pleat:[['imp28','ตีนตะขาบ'],['mj_sd_basic','SD พื้นฐาน'],['mj_screen_safety','จีบนิรภัย (ติดล้นนอกวงกบ)']],
  honey:[['mj_blackout','Blackout'],['mj_sd_twoway','SD ทูเวย์'],['mj_keep_twoway','ตีนตะขาบ ทูเวย์'],['mj_keep_honey','ตีนตะขาบ รังผึ้ง']],
  roll:[['imp29','ม้วน'],['mj_kick_150','เตะ 150'],['mj_kick_300','เตะ 300'],['mj_kick_600','เตะ 600']]
};
var MOSQ_GRP_LABEL={frame:'เฟรม',pleat:'จีบ',honey:'จีบม่านรังผึ้ง',roll:'ม้วน'};
```

## สรุป diff
- **pleat:** เอา `mj_sd_twoway / mj_keep_twoway / mj_keep_honey / mj_blackout` → ย้ายไป honey · เอา `imp31 / imp32` ออก (ซ่อน) → เหลือ imp28, mj_sd_basic, mj_screen_safety
- **honey (ใหม่):** mj_blackout, mj_sd_twoway, mj_keep_twoway, mj_keep_honey
- **MOSQ_GRP_LABEL:** เพิ่ม `honey:'จีบม่านรังผึ้ง'`
- imp31/imp32 = ไม่อยู่ชิปแล้ว (PRODUCTS + RATES คงเดิม · ใบเก่าเปิดได้)

## DoD
- ✅ ฟอร์มมุ้งโชว์ 4 หมวด: เฟรม / จีบ(3 รุ่น) / จีบม่านรังผึ้ง(4) / ม้วน(4)
- ✅ จีบนิรภัยเหลือ mj_screen_safety ตัวเดียว · imp31/imp32 ไม่โผล่ในชิป (แต่ใบเก่าที่ใช้ imp31/32 ยังเปิด/คิดราคาได้)
- ✅ `node test/quote-fidelity.mjs` + golden-snapshot PASS (ราคาไม่เพี้ยน — แก้แค่ grouping ไม่แตะ RATES)

> ดราฟ reference (กดเล่นได้ · ตรงมติ 4 หมวด): `docs/กลุ่ม5-มุ้ง/DRAFT-G5-ux-FULL-2026-06-14.html` (localhost:5599/review/DRAFT-G5-มุ้ง.html)
