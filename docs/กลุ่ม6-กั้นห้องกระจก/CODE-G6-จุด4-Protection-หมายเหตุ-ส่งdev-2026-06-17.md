# [โค้ดจริง · ส่ง dev B] จุด 4 — Protection: ลบบรรทัดราคาอังกฤษ → หมายเหตุไทย

**มติพี่นัท 17 มิ.ย.: เคาะแล้ว = เอาบรรทัดราคา `Protection พื้น/ผนัง` ออก · เงินยังบวกเท่าเดิม · โชว์เป็นหมายเหตุไทยแทน**
ใช้ทุกงาน (ไม่เฉพาะ G6) — `jobServices` เป็น quote-level ใช้ร่วมทุกกลุ่ม

---

## ปัญหา
`jobServices` (L4750) ดัน `lines.push(['Protection พื้น/ผนัง', 2000+pts*1000])` → ขึ้นเป็น **บรรทัดราคาภาษาอังกฤษ** ในใบ
ต้องการ: เงินยังบวก (golden ห้ามเพี้ยน) แต่ไม่ขึ้นบรรทัด → ขึ้นเป็น **หมายเหตุไทย** แทน

## ของที่มีอยู่แล้ว (ไม่ต้องสร้างใหม่)
- `jobServices` คืน `{amt, lines, notes}` · `amt`=ผลรวม lines→บวก subtotal · `notes`=หมายเหตุ (มีอยู่แล้ว เช่น 'รวมงานรื้อหลังคาเดิม' L4779)
- `notes` ถูก render เป็นบล็อก **"หมายเหตุ: ..."** ที่ L5014 (`svc-notes` · join ' · ') แล้ว — แค่ push เข้า notes ก็โชว์

---

## แก้ `jobServices` (L4750-4785) — 3 บรรทัด

### (1) บนสุดของฟังก์ชัน — ย้าย `notes` ขึ้นมา + เพิ่มตัวสะสมยอดเงียบ
เดิม L4751:
```js
function jobServices(net, totalArea){
  const lines=[];
```
แก้เป็น:
```js
function jobServices(net, totalArea){
  const lines=[];
  const notes=[];          // ย้ายขึ้นบนสุด (เดิมอยู่ L4776) เพื่อให้ Protection push ได้
  let _hidden=0;           // ยอดที่บวกเข้าใบแต่ไม่แตกบรรทัด (Protection)
```

### (2) บล็อก Protection L4753-4756 — เลิก push line → push note + สะสมยอด
เดิม:
```js
  if(svcChk('svc-protect')){
    const pts=Math.max(0, Math.round(svcNum('svc-protect-points'))||0);
    lines.push(['Protection พื้น/ผนัง', 2000 + pts*1000]);
  }
```
แก้เป็น:
```js
  if(svcChk('svc-protect')){
    const pts=Math.max(0, Math.round(svcNum('svc-protect-points'))||0);
    _hidden += 2000 + pts*1000;   // บวกเงินเงียบ · ไม่แตกบรรทัด
    notes.push('ราคาที่เสนอรวมงาน Protection เฉพาะบริเวณแนวติดตั้ง (ไม่รวมเฟอร์นิเจอร์)');
  }
```

### (3) ลบ `const notes=[];` เดิมที่ L4776 (ย้ายขึ้นบนแล้ว = ประกาศซ้ำ ต้องเอาออก)
เดิม L4775-4776:
```js
  // Q15 งานรื้อของเดิม
  const notes=[];
```
แก้เป็น (เหลือแค่ comment):
```js
  // Q15 งานรื้อของเดิม
```

### (4) return L4785 — บวก `_hidden` เข้า amt (เงินยังครบ)
เดิม:
```js
  return {amt:lines.reduce((x,l)=>x+l[1],0), lines, notes};
```
แก้เป็น:
```js
  return {amt:lines.reduce((x,l)=>x+l[1],0)+_hidden, lines, notes};
```

---

## ⚠ กันซ้ำ — REMARK_PRESETS (สำคัญ)
ข้อความ Protection ตัวนี้มีอยู่ใน `REMARK_PRESETS` L1769 ด้วย (ให้เซลล์ติ๊กเลือก):
```
'ราคาที่เสนอรวมงาน Protection เฉพาะบริเวณแนวติดตั้ง (ไม่รวมเฟอร์นิเจอร์)',
```
**ตอนนี้ svc-protect ติ๊ก default → หมายเหตุนี้ขึ้นอัตโนมัติทุกใบแล้ว** → ถ้าเซลล์ติ๊กใน REMARK_PRESETS ซ้ำ = โผล่ 2 ที่
→ **ลบบรรทัด L1769 ออกจาก REMARK_PRESETS** (เพราะเป็น auto แล้ว ไม่ต้องให้ติ๊กเอง)

---

## กฎ / เช็คหลังแก้
- ☐ `node scripts/golden-snapshot.mjs` → **149 ต้องตรง** (amt เท่าเดิม เพราะ _hidden=2000 แทนบรรทัดที่ลบ)
- ☐ verify เบราว์เซอร์จริง: ติ๊ก Protection (default) กด genQuote →
  - ไม่มีบรรทัด "Protection พื้น/ผนัง 2,000" ในตารางราคา
  - มีบล็อก "หมายเหตุ: ราคาที่เสนอรวมงาน Protection เฉพาะบริเวณแนวติดตั้ง (ไม่รวมเฟอร์นิเจอร์)"
  - ยอดรวม/VAT/total เท่าเดิม (เงินไม่หาย)
- ☐ ไม่ขึ้นหมายเหตุ Protection ซ้ำ 2 บรรทัด (ลบ REMARK_PRESETS L1769 แล้ว)
- ☐ เทสเดิมไม่พัง: `g6-room-quote-detail` / `g6-floor-fan` / golden
- ☐ ทำเฉพาะ jobServices + REMARK_PRESETS (ไม่แตะ qrow/genQuote/ราคาสินค้า)

## เสร็จ → รายงาน
แก้กี่บรรทัด + golden 149 ผ่าน + แปะใบที่ genQuote (เห็นหมายเหตุ Protection · ไม่มีบรรทัดราคาอังกฤษ · total เท่าเดิม)

## ⚠ ถ้าติด → หยุดถาม อย่าเดา
ถ้า `amt`/subtotal ไหลผ่านที่อื่นนอกจาก return → หยุดถามก่อนแตะ (กัน golden เพี้ยน)
