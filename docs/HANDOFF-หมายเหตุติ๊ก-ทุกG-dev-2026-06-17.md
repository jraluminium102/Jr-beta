# 📤 ใบสั่ง dev — "หมายเหตุมาตรฐาน" ดรอปดาวน์ → ติ๊กหลายข้อ (ทุกกลุ่ม) → แชท B

> มติพี่นัท 17 มิ.ย. · ดราฟเคาะแล้ว `docs/กลุ่ม1-งานบาน-เลื่อนเปิดเฟี้ยม/DRAFT-G1-หมายเหตุติ๊ก-2026-06-17.html` (verify เบราว์เซอร์จริง 17 แถวติ๊กไหลลง .i-note OK)
> **งานข้อความ/UI ล้วน — ห้ามแตะ calc · golden ต้องไม่เพี้ยน · ไหลลง `.i-note` เหมือนเดิม (genQuote ไม่เปลี่ยน)**

## ปัญหา
`o-remark-add` (L1782-1784) เป็น `<select>` ดรอปดาวน์ "เลือกทีละข้อ" → เปิด-เลือก-ปิด ซ้ำทุกข้อ กดยากบนมือถือ · พี่นัทอยากได้ **ติ๊กหลายข้อในที** ตามสไตล์ฟอร์ม "เน้นติ๊กไม่เน้นดรอปดาวน์"

## ขอบเขต
- แก้ **จุดเดียว** = `remarkSelectHTML()` + `addRemark()` (L1782-1786) · mount จุดเดียว L3662 → **ทุกกลุ่ม G1-G7 ได้พร้อมกัน** (กล่องหมายเหตุใช้ร่วม)
- **ไม่แตะ** "OPTION ทางเลือกลูกค้า" (oc-block) และ "อุปกรณ์เสริม" (optbox) ที่เป็น accordion อยู่แล้ว
- `REMARK_PRESETS` (L1760-1781) คงเดิม ไม่แก้
- **พับไว้ (▶) เป็น default** ให้เหมือนเพื่อนบ้าน oc-block/optbox (ไม่เปิดค้าง · กันยาวเป็นพืด) — ดราฟโชว์เปิดไว้เพื่อให้ดูง่ายเฉยๆ

## 🔧 แก้โค้ด (ก็อปวางทับ L1782-1786)

```js
// 17 มิ.ย.: หมายเหตุมาตรฐาน = กล่องพับ + แถวติ๊กหลายข้อ (แทน dropdown) · ไหลลง .i-note เหมือนเดิม
function remarkSelectHTML(){
  var h='<details class="rk-block" style="margin-bottom:6px;border:1px solid var(--line);border-radius:6px;padding:4px 8px;">'
    +'<summary style="cursor:pointer;font-size:13px;color:var(--red);font-weight:600;">＋ เพิ่มหมายเหตุมาตรฐาน (ติ๊กได้หลายข้อ · ขึ้นในใบ)</summary>'
    +'<div class="rk-list" style="margin-top:6px;">';
  REMARK_PRESETS.forEach(function(grp){
    h+='<div style="font-size:12px;font-weight:700;color:var(--red-dark,#7f1d1d);margin:7px 2px 2px;">'+grp.g+'</div>';
    grp.items.forEach(function(t){
      var esc=t.replace(/"/g,'&quot;');
      h+='<label class="rk-item" style="display:flex;gap:8px;align-items:flex-start;padding:6px 6px;font-size:12.5px;cursor:pointer;border-radius:6px;">'
        +'<input type="checkbox" class="rk-cb" data-t="'+esc+'" onchange="rkToggle(this)" style="width:16px;height:16px;margin-top:2px;flex:none;">'
        +'<span>'+t+'</span></label>';
    });
  });
  return h+'</div></details>';
}
// ติ๊ก = เพิ่มบรรทัดลง .i-note · ติ๊กออก = ลบบรรทัดนั้น (เทียบ trim เป๊ะ · คงบรรทัดที่พิมพ์เอง)
function rkToggle(cb){
  var ch=cb.closest('.ch'); var n=ch?ch.querySelector('.i-note'):null; if(!n)return;
  var t=cb.dataset.t, arr=n.value.split('\n'), idx=-1;
  for(var i=0;i<arr.length;i++){ if(arr[i].trim()===t){ idx=i; break; } }
  if(cb.checked){ if(idx<0){ var base=n.value.replace(/\s+$/,''); n.value=(base?base+'\n':'')+t; } }
  else if(idx>=0){ arr.splice(idx,1); n.value=arr.join('\n').replace(/\n{2,}/g,'\n').replace(/^\n+|\n+$/g,''); }
  if(typeof calcQuote==='function')calcQuote();
}
// sync ติ๊กจากเนื้อ .i-note (เผื่อ note ถูกตั้งค่า/พิมพ์เอง) — เรียกหลังสร้างรายการ
function rkSync(ch){
  if(!ch)return; var n=ch.querySelector('.i-note'); if(!n)return;
  var has={}; n.value.split('\n').forEach(function(s){ has[s.trim()]=1; });
  ch.querySelectorAll('.rk-cb').forEach(function(cb){ cb.checked=!!has[cb.dataset.t]; });
}
```

## เรียก rkSync (เล็กน้อย · กันติ๊กไม่ตรงเนื้อ)
- หลัง `addItem()` สร้างรายการเสร็จ → `rkSync(ch)` (ปกติ note ว่าง ไม่มีผล แต่กันเคส note มีค่า)
- ถ้ามีโค้ดที่ตั้ง `.i-note` ด้วยโปรแกรม (เช่น โหลด draft เก่า) → เรียก `rkSync(ch)` ตามหลัง
- ไม่จำเป็นต้องเรียกใน buildItemOpts (rk-block อยู่นอก .i-opts ไม่ถูก rebuild · ติ๊กคงอยู่ตอนคิดราคา)

## (ออปชั่นเสริม) hover/ติ๊กแล้วไฮไลต์ — ใส่ใน `<style>` ถ้าอยากสวยขึ้น
```css
.rk-item:hover{ background:#f9fafb; }
.rk-cb:checked + span{ color:#7f1d1d; font-weight:600; }
```

## ✅ เทส (ทำครบก่อนปิด)
- `node scripts/golden-snapshot.mjs` → **ต้องไม่เพี้ยน** (งานข้อความ/UI ไม่แตะ calc)
- **เบราว์เซอร์จริง** หลายกลุ่ม (G1 บาน · G2 ระแนง · G5 มุ้ง อย่างน้อย):
  - กดขยาย "เพิ่มหมายเหตุมาตรฐาน" → เห็น 17 ข้อ จัด 3 หมวด
  - ติ๊ก 2-3 ข้อ → ขึ้นใน `.i-note` ครบ · กด genQuote → ขึ้นในใบจริง
  - ติ๊กออก → บรรทัดนั้นหายจาก .i-note (บรรทัดที่พิมพ์เองยังอยู่)
  - พิมพ์เองในช่องหมายเหตุ → ยังได้ปกติ
- ส่ง Chat A verify

## กันบานปลาย
- แก้แค่ remarkSelectHTML/addRemark→rkToggle · ลบ `addRemark` เดิมได้ (ไม่มี caller อื่น · grep ยืนยัน)
- ไม่ย้าย/ไม่แตะ textarea .i-note, oc-block, optbox · ไม่แตะราคา/VAT
```
