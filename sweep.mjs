import fs from 'fs';
import { compareCut, COMPARABLE } from './src/lib/calculator40/compare-cut.ts';
import { PRODUCTS } from './src/lib/calculator40/products.mjs';
const PB=JSON.parse(fs.readFileSync('src/lib/calculator40/pricebook.json','utf8'));
let tot=0, bad=0;
for (const id of COMPARABLE) {
  const P=PRODUCTS[id]; if(!P) continue;
  console.log('\n████', id, '—', P.name);
  const forms = P.forms?.length ? P.forms : [P.defForm];
  for (const form of forms.slice(0,8)) for (const n of [1,2,3,4]) {
    if (n < (P.minP||1) || n > (P.maxP||1)) continue;
    const r = compareCut(PB, { prodId:id, w:200, h:200, p:n, form, color:'white', glassType:'เขียว 6มม.', spec:{} });
    if (!r?.ok) { console.log('  ', (form||'').slice(0,20).padEnd(22), n, '⛔', (r?.note||'').slice(0,52)); continue; }
    tot++;
    const ba = (r.alu||[]).filter(x=>x.status!=='ตรง'), bh = (r.hardware||[]).filter(x=>x.status!=='ตรง');
    if (ba.length+bh.length) bad++;
    console.log('  ', (form||'').slice(0,20).padEnd(22), n, '→', r.cutSpecId.padEnd(18), (ba.length+bh.length?'❌ อลู '+ba.length+' · อุป '+bh.length:'✅ ตรงหมด'));
    for (const x of [...ba,...bh].slice(0,6)) console.log('        ', (x.name||'').slice(0,26).padEnd(28), (x.code||x.sku||'').padEnd(9), x.status, '| คิดราคา', x.calcPieces ?? x.calcQty, '· ใบตัด', x.cutPieces ?? x.cutQty);
  }
}
console.log(`\n═══ เทียบได้ ${tot} เคส · ไม่ตรง ${bad} ═══`);
