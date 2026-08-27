import { PRODUCTS } from './src/lib/calculator40/products.mjs';
const L=[],D=[],R=[];
for (const [id,p] of Object.entries(PRODUCTS)) {
  for (const g of ['hardware','consum']) for (const h of (p[g]||[])) {
    if (h.sku||h.ref||h.box||h.orderOnly) continue;
    const n=h.name||'', pr=String(h.price??'');
    if (/^ค่า(แรง|กรีด|ดัด|เปิด)|ค่าแรง|ปัดขึ้น|สีพิเศษ|ค่าบริการ|สั่งร้านอื่น/.test(n)) L.push([id,n,pr]);
    else if (/[A-Z]{3,}|ROW\.|CF\*|\*/.test(pr)) D.push([id,n,pr]);
    else R.push([id,n,pr]);
  }
}
const pr=(t,a)=>{console.log('\n=== '+t+' '+a.length+' ===');a.forEach(x=>console.log(x[0].padEnd(18),x[1].padEnd(42),x[2]))};
pr('ค่าแรง/ค่าบริการ (ไม่ใช่ของสโตร์)',L); pr('ราคามาจากตารางอื่น (ผูกทางอ้อม)',D); console.log('\nของจริงที่ต้องผูก = '+R.length);
