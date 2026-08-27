import { PRODUCTS } from './src/lib/calculator40/products.mjs';
const out = [];
for (const [id,p] of Object.entries(PRODUCTS)) {
  for (const g of ['hardware','consum']) for (const h of (p[g] || [])) {
    if (h.sku || h.ref || h.box || h.orderOnly) continue;
    out.push({ id, g, pname: p.name || id, name: h.name, price: String(h.price ?? ''), qty: String(h.qty ?? '') });
  }
}
const by = {};
for (const r of out) (by[r.pname] ||= []).push(r);
console.log('รวม', out.length, 'บรรทัด ·', Object.keys(by).length, 'รุ่น');
for (const k of Object.keys(by).sort((a,b)=>by[b].length-by[a].length))
  console.log('\n### '+String(by[k].length).padStart(2)+'  '+k+' ['+by[k][0].id+']\n'+by[k].map(r=>'   - '+r.name+'   ราคา='+r.price).join('\n'));
