// G2 B2/B4 (มติ 16มิ.ย.): ระแนงเกล็ด 38.1 (bar_grid_z) + เลื่อน 38.2 (bar_slide) ทำบานได้ · เปิด-ปิด 38.3 ทำไม่ได้
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>{if(!/Not implemented:|scrollIntoView|scrollTo/.test(e.message))errs.push(e.message);});
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{if(dom.window.document.readyState==='complete')r();else dom.window.addEventListener('load',r);setTimeout(r,1500);});
const w=dom.window,doc=w.document; const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const C=[]; const want=(n,ok,d)=>C.push({n,ok:!!ok,d:d||""});
const sv=(ch,sel,v)=>{const e=ch.querySelector(sel); if(e){e.value=String(v);fire(e,"input");fire(e,"change");}};
function prod(id){ doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch"); sv(ch,".i-group","2"); const ps=ch.querySelector(".i-prod"); if(!ps.querySelector('option[value="'+id+'"]')){ // bar_* เป็น cat ระแนง · inject ถ้าไม่มีใน dropdown
    const o=doc.createElement('option'); o.value=id; ps.appendChild(o); } ps.value=id; fire(ps,"change"); sv(ch,".i-w","1"); sv(ch,".i-h","2"); return ch; }
// bar_grid_z (38.1)
const cg=prod("bar_grid_z");
want("bar_grid_z (38.1) → มีเลือกประตู (o-bsdoor)", !!cg.querySelector(".o-bsdoor"), cg.querySelector(".o-bsdoor")?"มี":"ไม่มี");
const base=w.readItem(cg).r.sell;
const dd=cg.querySelector(".o-bsdoor"); if(dd){dd.value="sliding_sms"; fire(dd,"change");}
const withDoor=w.readItem(cg).r.sell;
want("bar_grid_z + ประตู sliding_sms → ราคาเพิ่ม", withDoor>base, "base="+base+" door="+withDoor);
// bar_slide (38.2) ยังทำบานได้
const cs=prod("bar_slide");
want("bar_slide (38.2) → ยังมีเลือกประตู", !!cs.querySelector(".o-bsdoor"), "");
// bar_openclose (38.3) ทำบานไม่ได้
const co=prod("bar_openclose");
want("bar_openclose (38.3) → ไม่มีเลือกประตู (ทำบานไม่ได้)", !co.querySelector(".o-bsdoor"), co.querySelector(".o-bsdoor")?"มี(ผิด)":"ไม่มี(ถูก)");
want("0 JS error", errs.length===0, errs.slice(0,2).join(" | "));
let pass=0; for(const c of C){console.log((c.ok?"✅":"❌")+" "+c.n+"  ["+c.d+"]"); if(c.ok)pass++;}
console.log(`\n${pass}/${C.length} ผ่าน`+(errs.length?` · jsErrors:${errs.length}`:""));
process.exit(pass===C.length?0:1);
