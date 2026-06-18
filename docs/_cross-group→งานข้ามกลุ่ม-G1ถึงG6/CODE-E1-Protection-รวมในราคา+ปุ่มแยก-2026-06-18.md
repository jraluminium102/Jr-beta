# [CODE ส่งคิวกลาง · จากแชท A-G6] แก้ E1 — Protection รวมในราคาชุดหลัก + ปุ่ม "แยกราคา"
**18 มิ.ย. 2026** · มติพี่นัท · ⛔ A-G6 READ-ONLY ไม่แก้ index.html เอง — คิวกลาง/B implement
**🔴 งานการเงิน — แนะ accountant ตรวจก่อน merge + golden ต้องนิ่ง**

## เป้าหมาย (พี่นัท 18มิ.ย.)
> "ให้รวม [Protection] ในราคาชุดหลักของแต่ละข้อไปเลย · กดแยกราคาค่อยโชว์ออกมา"

- **DEFAULT = รวม:** Protection (และ service ที่ซ่อนอยู่) **ถูกพับเข้าราคารายการหลัก** → ใบโชว์ราคาที่รวม Protection แล้ว → **รายการรวม = รวมเป็นเงิน = ฐาน VAT → ยอด reconcile** (ไม่มี 2,000 หายไป) · หมายเหตุ "ราคารวมงาน Protection" คงไว้
- **ปุ่ม "แยกราคา" (toggle):** กดแล้ว **ดึง Protection ออกมาเป็นบรรทัดแยก** — รายการโชว์ราคาฐาน + บรรทัด "งาน Protection" + รวมเป็นเงิน(เฉพาะรายการ) + VAT
- **ยอดรวมทั้งสิ้นต้องเท่าเดิมทั้ง 2 โหมด** (เปลี่ยนแค่ "ที่โชว์" ไม่เปลี่ยนเงินที่เก็บ)

## ROOT CAUSE ปัจจุบัน (ยืนยันโค้ด — ดู E1 ในใบรวมก้อน)
- `jobServices` L5044-5047: svc-protect → `_hidden += 2000+pts*1000` + push **หมายเหตุ** (ไม่ทำบรรทัด) · L5076 `return {amt: lines.sum + _hidden, lines, notes}`
- `buildQuoteDoc`: L5322 `รวมเป็นเงิน = q2(subtotal)` (ไม่รวม svcAmt) · L5325 `svcLines.map` ว่าง · L5301 `vat=(net+svcAmt)*vatPct/100` (รวม) · grand = net+svcAmt+vat
- → 2,000 อยู่ในฐาน VAT+grand แต่ไม่โผล่ที่ไหน = บั๊กแสดงผล (กระทบทุกใบ · svc-protect default ติ๊ก)

## CODE ที่เสนอ (anchors + แนวทาง · B ปรับให้เข้ากับ pattern เดิม)

### 1) `jobServices` L5039-5076 — เก็บ Protection เป็น "service พับได้" แทน _hidden ลอยๆ
แทนที่จะ `_hidden += ...` เฉยๆ ให้เก็บเป็น object มี label+amt เพื่อ itemize ได้ตอน toggle:
```js
// เดิม L5042: let _hidden=0;
const foldable=[];   // service ที่ default พับเข้าราคา · toggle "แยกราคา" ค่อยโชว์
// เดิม L5044-5048 Protection:
if(svcChk('svc-protect')){
  const pts=Math.max(0, Math.round(svcNum('svc-protect-points'))||0);
  foldable.push(['งาน Protection (เฉพาะแนวติดตั้ง)', 2000 + pts*1000]);   // label ไทย
  notes.push('ราคาที่เสนอรวมงาน Protection เฉพาะบริเวณแนวติดตั้ง (ไม่รวมเฟอร์นิเจอร์)');
}
// L5076 return: เพิ่ม foldable + foldAmt
const foldAmt=foldable.reduce((x,l)=>x+l[1],0);
return {amt: lines.reduce((x,l)=>x+l[1],0)+foldAmt, lines, notes, foldable, foldAmt};
```
(หมายเหตุ: ถ้ามี service อื่นที่ตอนนี้ใช้ `_hidden` ให้ย้ายมา foldable เหมือนกัน)

### 2) เพิ่ม toggle ปุ่ม "แยกราคา" (default OFF = รวม) — ใกล้ #vat-pct L402
```html
<label class="chk mt"><input type="checkbox" id="svc-itemize" onchange="genQuote&&genQuote()"> แยกราคางานบริการ (Protection) เป็นบรรทัด</label>
```

### 3) `buildQuoteDoc` L5283-5327 — โหมดรวม(default) พับเข้าราคา / โหมดแยกโชว์บรรทัด
```js
const itemize = (document.getElementById('svc-itemize')||{}).checked;
const foldAmt = (svc&&svc.foldAmt)||0;
const foldable = (svc&&svc.foldable)||[];
// svcAmt เดิม = svc.amt (รวม foldAmt อยู่แล้ว) — VAT base คงเดิม (net+svcAmt) → grand เท่าเดิมทั้ง 2 โหมด
...
// L5322 รวมเป็นเงิน:
//   - โหมดรวม (default): บวก foldAmt เข้า "รวมเป็นเงิน" + พับเข้าแถวรายการหลัก (ดูข้อ 4)
//   - โหมดแยก: รวมเป็นเงิน = subtotal (เฉพาะรายการ) + โชว์ foldable เป็นบรรทัด
const subDisp = itemize ? subtotal : (subtotal + foldAmt);
`<div class="l"><span>${qET('t_subtotal','รวมเป็นเงิน')}</span><span>${q2(subDisp)} บาท</span></div>` +
... (ส่วนลดเหมือนเดิม) ...
// แสดงบรรทัด service เฉพาะโหมดแยก:
(itemize ? foldable.map(l=>`<div class="l"><span>${l[0]}</span><span>${q2(l[1])} บาท</span></div>`).join('') : '') +
svcLines.map(...) +   // service อื่นที่ itemize อยู่แล้ว คงเดิม
`<div class="l">VAT ${vatPct}% ... ${q2(vat)} ...</div>` +
`<div class="g">รวมทั้งสิ้น ... ${q2(withVat)} ...</div>`
```

### 4) ⚠ จุดต้องเคาะ (decision เดียวที่เหลือ · ขอ B/พี่นัทยืนยันตอน implement)
"รวมในราคาชุดหลักของ**แต่ละข้อ**" — โหมดรวม ต้องพับ foldAmt เข้า **แถวรายการ** ให้ผลรวมแถว = รวมเป็นเงิน (ไม่งั้นแถวรวมไม่ตรงซับโทเทิล) :
- **เคส 1 รายการ (เช่น G6 ห้องเหมา):** พับทั้งก้อนเข้าแถวนั้น — ตรงไปตรงมา
- **เคสหลายรายการ:** ต้องมีกติกากระจาย → **เสนอ: บวกเข้าแถวหลัก/แถวแรก** (ง่าย·ไม่มีปัญหาปัดเศษ) หรือ proportional ตามสัดส่วนราคา
- จุดพับแถว: ทำตอน build `rows` ใน genQuote (L6203-6248) ก่อนส่ง buildQuoteDoc · หรือปรับ amount ในแถวหลักตอน itemize=off

## Guardrails
- **ยอดรวมทั้งสิ้น (withVat) ต้องเท่าเดิมเป๊ะทั้ง 2 โหมด** — เช่น ใบพื้นฐาน = 23,540 เสมอ (เปลี่ยนแค่การโชว์)
- Protection เป็น quote-level (ไม่ใช่ราคาต่อ product) → **golden 149 ไม่ควรกระทบ** · แต่รัน golden ยืนยันนิ่งหลังแก้
- เทสทั้ง 2 โหมด: default(รวม) แถวรวม=ซับโทเทิล=ฐาน VAT · แยก → กลับมาเหมือนเดิม + บรรทัด Protection โผล่
- **กระทบทุกใบทั้งระบบ** (genQuote/genQuoteFromX/Excel L6342-6373 ที่ใช้ jobServices+VAT เดียวกัน) → เช็คทุกทางออกใบ
- หลักฐานบั๊ก + เคสเทส: `docs/กลุ่ม6-กั้นห้องกระจก/เทสใบ-G6-5งานต่างกัน-2026-06-18.html` (+PDF)
