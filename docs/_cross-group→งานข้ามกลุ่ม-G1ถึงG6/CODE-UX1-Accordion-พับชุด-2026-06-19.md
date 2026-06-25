# CODE-UX1 · Accordion พับชุด — โหมดคิดเร็ว + โหมดเต็ม
วันที่: 2026-06-19 · ไฟล์: `public/calculator/index.html`

## ปัญหา
- โหมดคิดเร็ว: เพิ่มชุดใหม่ → ทุกชุดเปิดพร้อมกัน ไม่พับ ไม่รู้ว่ากรอกชุดไหน
- โหมดเต็ม: พับได้แล้ว แต่ชุดที่ active ไม่มีสีบอก

## ผลลัพธ์ที่ต้องการ
- เพิ่มชุด → ชุดเก่าพับ แสดงสรุป · ชุดใหม่เปิด หัวแดงจาง
- กดแถบชุดเก่า → ขยายกลับ ชุดปัจจุบันพับ
- ราคา/ใบ ไม่เปลี่ยนเลย

---

## แก้ 5 จุด

### จุดที่ 1 — CSS: active item มีหัวแดงจาง
หา (~L47):
```css
  .ch.collapsed{padding:7px 12px;margin-bottom:6px;background:#FAFBFD;}
```
เพิ่มต่อท้าย (บรรทัดใหม่หลัง `.ch.collapsed .top{...}`):
```css
  .ch:not(.collapsed) > .top{background:#FFF5F5;border-radius:8px 8px 0 0;border-bottom:1.5px solid #FECACA;}
```

---

### จุดที่ 2 — chSummary: รองรับโหมดคิดเร็ว (.qi-*)
หา (L4032):
```js
function chSummary(ch){ try{ var ps=ch.querySelector('.i-prod'); var p=ps?PBYID[ps.value]:null; var w=(ch.querySelector('.i-w')||{}).value, h=(ch.querySelector('.i-h')||{}).value; var ty=(ch.querySelector('.i-type')||{}).value==='window'?'หน้าต่าง':''; return (ty+(p?p.name:'')).trim()+((parseFloat(w)>0&&parseFloat(h)>0)?(' '+w+'×'+h+' ม.'):''); }catch(e){ return ''; } }
```
แทนด้วย:
```js
function chSummary(ch){ try{ var ps=ch.querySelector('.i-prod,.qi-prod'); var p=ps?PBYID[ps.value]:null; var w=(ch.querySelector('.i-w,.qi-w')||{}).value, h=(ch.querySelector('.i-h,.qi-h')||{}).value; var ty=((ch.querySelector('.i-type,.qi-type')||{}).value||'')==='window'?'หน้าต่าง':''; return (ty+(p?p.name:'')).trim()+((parseFloat(w)>0&&parseFloat(h)>0)?(' '+w+'×'+h+' ม.'):''); }catch(e){ return ''; } }
```

---

### จุดที่ 3 — ฟังก์ชันใหม่: collapseOthersQuick
หา (L4035 — บรรทัด `function collapseOthers`):
```js
function collapseOthers(active){
```
เพิ่มฟังก์ชันใหม่ **ก่อน** บรรทัดนั้น:
```js
function collapseOthersQuick(active){ document.querySelectorAll('#q-items .ch').forEach(function(ch){ setChCollapsed(ch, ch!==active); }); }
```

---

### จุดที่ 4 — quick mode top: เพิ่ม ch-summary + onclick toggle
หา (L2105):
```js
   '<div class="top"><b style="flex:1;color:var(--red-dark);font-size:13px;">ชุดที่ '+qSeq+'</b><button type="button" class="del" title="ลบ">&times;</button></div>'+
```
แทนด้วย:
```js
   '<div class="top" onclick="if(!event.target.closest(\'.del\'))toggleCh(this.closest(\'.ch\'));"><b style="flex:none;color:var(--red-dark);font-size:13px;">ชุดที่ '+qSeq+'</b><span class="ch-caret">▾</span><span class="ch-summary"></span><button type="button" class="del" title="ลบ">&times;</button></div>'+
```

---

### จุดที่ 5 — addQuickItem: เรียก collapseOthersQuick
หา (L2109):
```js
  document.getElementById('q-items').appendChild(d); renumberItems();
```
แทนด้วย:
```js
  document.getElementById('q-items').appendChild(d); renumberItems();
  try{ collapseOthersQuick(d); }catch(e){}
```

---

## ตรวจหลังแก้ (Chat B ทำเอง)

### golden-snapshot
```
node scripts/golden-snapshot.mjs
```
ต้องได้ ✅ ไม่มีความเปลี่ยนแปลง

### ตรวจ browser (คิดเร็ว)
1. เปิด `/calculator/index.html` → แท็บคิดเร็ว
2. เลือก G1 บานเลื่อน 1.8×2.0
3. กด "+ เพิ่มชุดถัดไป"
   - ✅ ชุดที่ 1 พับ แสดงสรุป "บานเลื่อน ยูโร 1.8×2.0 ม."
   - ✅ ชุดที่ 2 เปิด หัวแดงจาง
4. กดแถบ "ชุดที่ 1" → ขยายกลับ ชุดที่ 2 พับ
5. ออกใบ → ✅ ราคาครบทั้ง 2 ชุด ยอดรวมถูก

### ตรวจ browser (เต็ม)
1. แท็บเต็ม → เพิ่มส่วน
2. ✅ ส่วนที่เปิดอยู่มีหัวแดงจาง บอกว่ากรอกอยู่ตรงนี้

## Deploy
```
node scripts/golden-snapshot.mjs   # ต้อง ✅ ก่อน
git add public/calculator/index.html
git commit -m "ux(accordion): คิดเร็ว+เต็ม — พับชุดเก่าอัตโนมัติ+หัว active แดงจาง"
git pull --rebase
git push HEAD:main
```
แคปรูปก่อน/หลัง แล้วรายงานพี่นัท
