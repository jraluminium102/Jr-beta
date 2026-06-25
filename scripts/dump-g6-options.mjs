// READ-ONLY dump: ดึงออปชั่น/อุปกรณ์เสริมย่อยของบานทุกชนิดในกลุ่ม 1 จากระบบจริง
// โหลด index.html ใน jsdom → addItem + เลือก product + buildItemOpts → dump ทุก control .o-* / .i-*
// หมายเหตุ: const/function ในสคริปต์ index.html อยู่ใน global script-scope (ไม่ใช่ window.*) → ต้องใช้ window.eval
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const htmlPath = path.join(ROOT, 'public', 'calculator', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.scrollTo = () => {};
window.alert = () => {};
window.requestAnimationFrame = (cb)=>setTimeout(cb,0);

await new Promise(r=>setTimeout(r,300)); // ให้สคริปต์รันครบ

// โค้ดที่จะรันในบริบทหน้าเว็บ (เข้าถึง PRODUCTS/addItem/buildItemOpts ได้ตรง)
const pageCode = String.raw`(function(){
  var G1_CATS = ['บานเลื่อน','บานเปิด','ติดตาย','บานเฟี้ยม','บานกระทุ้ง','เลื่อนภายใน','PC Door','บานเปลือย','shower','บานยก','YKK','บานหมุน','ดัดโค้ง','เส้นคาด','ลูกฟูก+คอมโพสิททึบ'];
  var SIXGROUP = {
    slide: ['บานเลื่อน','เลื่อนภายใน'],
    swing: ['บานเปิด','บานหมุน','บานยก','PC Door'],
    fold:  ['บานเฟี้ยม'],
    fix:   ['ติดตาย','บานกระทุ้ง'],
    curve: ['ดัดโค้ง'],
    other: ['บานเปลือย','shower','YKK','เส้นคาด','ลูกฟูก+คอมโพสิททึบ']
  };
  function sixGroupOf(cat){ for(var k in SIXGROUP){ if(SIXGROUP[k].indexOf(cat)>=0) return k; } return 'other'; }

  function labelText(el){
    var clone = el.cloneNode(true);
    clone.querySelectorAll('select,input,textarea,button').forEach(function(n){n.remove();});
    return clone.textContent.replace(/\s+/g,' ').trim();
  }
  function dumpControl(el){
    var cls=''; for(var i=0;i<el.classList.length;i++){ if(/^o-|^i-/.test(el.classList[i])){ cls=el.classList[i]; break; } }
    if(!cls) cls=el.className;
    var tag=el.tagName.toLowerCase();
    var out={cls:cls, tag:tag};
    if(tag==='select'){
      out.type='select';
      out.options=[].map.call(el.options,function(o){return {v:o.value,t:o.textContent.replace(/\s+/g,' ').trim(),sel:o.selected};});
    } else if(tag==='input'){
      out.type=el.type;
      if(el.placeholder) out.ph=el.placeholder;
      if(el.value!=='' && el.type!=='checkbox') out.val=el.value;
      if(el.type==='checkbox') out.checked=el.checked;
    } else if(tag==='textarea'){ out.type='textarea'; }
    return out;
  }
  function dumpItem(d){
    var box=d.querySelector('.i-opts');
    var ctrls=[]; var seen=new Set();
    // sliding-main-block (ชนิดการเปิด/ติดตาย/ราง) ถูกย้ายออกจาก .i-opts ไปไว้ในการ์ดหลัก → เก็บก่อน
    var smb=d.querySelector('.sliding-main-block');
    if(smb){
      smb.querySelectorAll('label').forEach(function(el){
        var inner=el.querySelectorAll('select,input');
        if(!inner.length) return;
        ctrls.push({ label: labelText(el), controls:[].map.call(inner,dumpControl), block:'main' });
        inner.forEach(function(n){seen.add(n);});
      });
    }
    box.querySelectorAll('label').forEach(function(el){
      var inner=el.querySelectorAll('select,input,textarea');
      if(!inner.length) return;
      var anySeen=false; inner.forEach(function(n){ if(seen.has(n)) anySeen=true; });
      if(anySeen) return;
      ctrls.push({ label: labelText(el), controls: [].map.call(inner,dumpControl) });
      inner.forEach(function(n){seen.add(n);});
    });
    box.querySelectorAll('select,input,textarea').forEach(function(el){
      if(seen.has(el)) return; if(el.closest('label')) return;
      ctrls.push({ label:'(no-label)', controls:[dumpControl(el)] });
      seen.add(el);
    });
    var cw=d.querySelector('.i-color-wrap'), gw=d.querySelector('.i-glass-wrap'), pw=d.querySelector('.i-panels-wrap');
    return { ctrls: ctrls, meta: {
      showColor: !!(cw && cw.style.display!=='none'),
      showGlass: !!(gw && gw.style.display!=='none'),
      usesPanels: !!(pw && pw.style.display!=='none')
    }};
  }

  var g1=PRODUCTS.filter(function(p){return G1_CATS.indexOf(p.cat)>=0;});
  var items=document.getElementById('items');
  var results=[];
  g1.forEach(function(p){
    var d;
    try{
      addItem(items);
      d=items.lastElementChild;
      var grp=d.querySelector('.i-group'); if(grp) grp.value='1';
      var ps=d.querySelector('.i-prod');
      if(!ps.querySelector('option[value="'+p.id+'"]')){ var o=document.createElement('option'); o.value=p.id; o.textContent=p.name; ps.appendChild(o); }
      ps.value=p.id;
      buildItemOpts(d);
    }catch(e){ results.push({id:p.id,name:p.name,cat:p.cat,error:String(e&&e.message||e)}); return; }
    var dumped=dumpItem(d);
    results.push(Object.assign({
      id:p.id, name:p.name, cat:p.cat, method:p.method, min:p.min,
      six: sixGroupOf(p.cat),
      flags:{ digihandle:!!p.digihandle, mosquito:!!p.mosquito, closer:!!p.closer, motor:!!p.motor, ceLinear:!!p.ceLinear, solid_door:!!p.solid_door, full_grid:!!p.full_grid, optBeam:!!p.optBeam }
    }, dumped));
  });

  var catalogs={ DIGI:DIGI, HANDLE_STAINLESS:HANDLE_STAINLESS, MOSQUITO_SCREENS:MOSQUITO_SCREENS, COMMON_OPTS:COMMON_OPTS };
  return JSON.stringify({ results: results, catalogs: catalogs });
})()`;

let raw;
try {
  raw = window.eval(pageCode);
} catch(e){
  console.error('eval failed:', e && e.stack || e);
  process.exit(1);
}
const data = JSON.parse(raw);
const results = data.results;

fs.writeFileSync(path.join(ROOT,'docs','_g6-option-detail.json'), JSON.stringify(results,null,2),'utf8');
fs.writeFileSync(path.join(ROOT,'docs','_g6-catalogs.json'), JSON.stringify(data.catalogs,null,2),'utf8');
console.log('Wrote _g6-option-detail.json —', results.length, 'products');
const errs = results.filter(r=>r.error);
if(errs.length){ console.log('ERRORS:\n'+errs.map(e=>'  '+e.id+': '+e.error).join('\n')); }
else console.log('No errors.');
console.log('Products by six-group:');
const by={}; results.forEach(r=>{ (by[r.six]=by[r.six]||[]).push(r.id); });
Object.keys(by).forEach(k=>console.log('  '+k+': '+by[k].join(', ')));
