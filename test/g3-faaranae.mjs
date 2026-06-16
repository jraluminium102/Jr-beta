// ฝ้าระแนงอลู 3 รุ่น (มติ 16มิ.ย.) — per_sqm · ceiling:1 ไม่มี crates (guard กัน crash)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>{if(!/Not implemented:|scrollIntoView|scrollTo/.test(e.message))errs.push(e.message);});
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{if(dom.window.document.readyState==='complete')r();else dom.window.addEventListener('load',r);setTimeout(r,1500);});
const w=dom.window,doc=w.document; const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const C=[]; const want=(n,ok,d)=>C.push({n,ok:!!ok,d:d||""});
const sv=(ch,sel,v)=>{const e=ch.querySelector(sel); if(e){e.value=String(v);fire(e,"input");fire(e,"change");}};
// ฝ้าออปชั่นในหลังคา (ธงC): delta = ราคาฝ้าระแนง
function roofCeil(ceilId,area){
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch");
  sv(ch,".i-group","3"); sv(ch,".i-prod","imp7"); sv(ch,".i-w","4"); sv(ch,".i-h","3");
  const base=w.readItem(ch).r.sell;
  const inB=Array.from(ch.querySelectorAll('[data-val="in"]')).find(b=>b.closest('.chip-group')); if(inB)inB.click();
  const tBtn=ch.querySelector('.chip[data-cid="'+ceilId+'"]'); if(tBtn)tBtn.click();
  sv(ch,".o-ceilarea",area);
  return w.readItem(ch).r.sell - base;
}
// standalone ฝ้า-ผนัง
function standalone(id,W,H){
  doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch");
  const gs=ch.querySelector(".i-group"); gs.value="3"; fire(gs,"change");
  const ps=ch.querySelector(".i-prod"); if(!ps.querySelector('option[value="'+id+'"]')) return "not-in-menu";
  ps.value=id; fire(ps,"change"); sv(ch,".i-w",W); sv(ch,".i-h",H);
  return w.readItem(ch).r.sell;
}
const d1=roofCeil("ceil_ranae_1x5",10);
want("ฝ้าระแนง 1x5 (3,300) พื้นที่ 10 → 33,000", d1===33000, "ได้ "+d1);
const d2=roofCeil("ceil_ranae_16_5",12);
want("ฝ้าระแนง 1.6 เว้น5 (3,700) พื้นที่ 12 → 12×3700 (roundUp)", d2>=44400&&d2<=45000, "ได้ "+d2);
const d3=roofCeil("ceil_ranae_16_2",10);
want("ฝ้าระแนง 1.6 เว้น2 (4,800) พื้นที่ 10 → 48,000", d3===48000, "ได้ "+d3);
// standalone (ฝ้า-ผนัง tab · ผ่าน G3_WALL_PRODS → ต้องอยู่ใน dropdown)
const s1=standalone("ceil_ranae_1x5",2,5); // 10 ตร.ม.
want("standalone ฝ้าระแนง 1x5 โผล่ในเมนู + คิด per_sqm (10×3300=33,000)", s1===33000, "ได้ "+s1);
want("ไม่มี crash (0 JS error · guard ทำงาน)", errs.length===0, errs.slice(0,2).join(" | "));
let pass=0; for(const c of C){console.log((c.ok?"✅":"❌")+" "+c.n+"  ["+c.d+"]"); if(c.ok)pass++;}
console.log(`\n${pass}/${C.length} ผ่าน`+(errs.length?` · jsErrors:${errs.length}`:""));
process.exit(pass===C.length?0:1);
