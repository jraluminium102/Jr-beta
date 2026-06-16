// test/g4-wall-sides.mjs — ผนังตู้ 3 ด้าน (G4 wall-sides)
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/calculator/index.html', import.meta.url), 'utf8');
const vc = new VirtualConsole(); const errors = [];
vc.on('jsdomError', e=>{ if(!/Not implemented:|scrollIntoView|scrollTo/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc, url:'http://localhost/calculator/index.html' });
await new Promise(r=>{ if(dom.window.document.readyState==='complete')r(); else dom.window.addEventListener('load',r); setTimeout(r,1500); });
const w=dom.window, doc=w.document;
const checks=[]; const want=(n,ok,d)=>checks.push({n,ok:!!ok,d:d||''});
function sf(d,s,v){ const e=d.querySelector(s); if(!e)return; e.value=String(v); e.dispatchEvent(new w.Event('change',{bubbles:true})); e.dispatchEvent(new w.Event('input',{bubbles:true})); }
function chk(d,s,on){ const e=d.querySelector(s); if(!e)return; e.checked=!!on; e.dispatchEvent(new w.Event('change',{bubbles:true})); }
function cab(W,H,opts={}){
  doc.getElementById('items').innerHTML=''; w.addItem(doc.getElementById('items'));
  const d=doc.querySelector('#items .ch');
  sf(d,'.i-group','4'); sf(d,'.i-prod','cabinet_alu'); sf(d,'.i-w',W); sf(d,'.i-h',H);
  sf(d,'.o-depth', opts.D||'0.6'); sf(d,'.o-cabdoors', opts.doors||'2'); sf(d,'.o-shelves', opts.shelves||'5');
  sf(d,'.i-color', opts.ci||'0');
  if(opts.left)  { chk(d,'.o-cabwall-left-on',true);  sf(d,'.o-cabwall-left-mat', opts.leftMat||'alu'); }
  if(opts.right) { chk(d,'.o-cabwall-right-on',true); sf(d,'.o-cabwall-right-mat',opts.rightMat||'alu'); }
  if(opts.back)  { chk(d,'.o-cabwall-back-on',true);  sf(d,'.o-cabwall-back-mat', opts.backMat||'alu'); }
  if(opts.leftW)  sf(d,'.o-cabwall-left-w',  opts.leftW);
  if(opts.leftH)  sf(d,'.o-cabwall-left-h',  opts.leftH);
  return w.readItem(d);
}
const r0 = cab(1.2,2.4);
const base = r0.r.sell;
want('ไม่ติ๊กด้านใด: wall=0 → sell baseline (โชว์ค่า)', base>0, 'baseline='+base);
const r1 = cab(1.2,2.4,{left:true,leftMat:'alu',ci:'0'});  // +1.44×4000=5760
want('ซ้ายอลูขาว → +5,760 (1.44×4000 · roundUp)', r1.r.sell-base===6000||r1.r.sell-base===5760, 'Δ='+(r1.r.sell-base));
const r2 = cab(1.2,2.4,{right:true,rightMat:'glass',ci:'0'}); // +1.44×3000=4320
want('ขวากระจก → +4,320 (3000 ไม่คิดค่าสี)', Math.abs((r2.r.sell-base)-4320)<=1000, 'Δ='+(r2.r.sell-base));
const r3 = cab(1.2,2.4,{back:true,backMat:'alu',ci:'0'}); // +2.88×4000=11520
want('หลังอลูขาว → +11,520 (W×H 2.88×4000)', Math.abs((r3.r.sell-base)-11520)<=1000, 'Δ='+(r3.r.sell-base));
const r4 = cab(1.2,2.4,{left:true,right:true,back:true,ci:'0'}); // +23040
want('3 ด้านอลูขาว → +23,040', Math.abs((r4.r.sell-base)-23040)<=1000, 'Δ='+(r4.r.sell-base));
const r5 = cab(1.2,2.4,{left:true,leftMat:'alu',leftW:'0.4',leftH:'0.5'}); // 0.2<1 → min1 → +4000
want('ด้านเล็ก <1m² → min 1m² → +4,000', Math.abs((r5.r.sell-base)-4000)<=1000, 'Δ='+(r5.r.sell-base));
const r6g = cab(1.2,2.4,{right:true,rightMat:'glass',ci:'10'});
const r6a = cab(1.2,2.4,{right:true,rightMat:'alu',ci:'10'});
want('กระจกสีพิเศษ ≤ อลูสีพิเศษ (กระจกไม่คิดค่าสีผนัง)', r6g.r.sell<=r6a.r.sell, 'glass='+r6g.r.sell+' alu='+r6a.r.sell);
const r7 = cab(1.2,2.4,{left:true,leftMat:'alu',ci:'2'});
want('อลูซาฮาร่า > อลูขาว (บวกค่าสีผนัง)', r7.r.sell>r1.r.sell, 'sahara='+r7.r.sell+' white='+r1.r.sell);
const r8 = cab(1.2,2.4,{left:true,right:true,back:true});
want('optSel cabwall_left_on=true', r8.optSel.cabwall_left_on===true);
want('optSel cabwall_back_on=true', r8.optSel.cabwall_back_on===true);
want('optSel cabwall_left_mat=alu', r8.optSel.cabwall_left_mat==='alu');
want('ไม่มี JS error', errors.length===0, errors.slice(0,2).join(' / '));
let pass=0;
for(const c of checks){ console.log((c.ok?'✅':'❌')+' '+c.n+(c.d?'  ['+c.d+']':'')); if(c.ok)pass++; }
console.log('\nสรุป: ผ่าน '+pass+'/'+checks.length);
process.exit(pass===checks.length?0:1);
