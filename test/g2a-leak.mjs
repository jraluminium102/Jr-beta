import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>{if(!/Not implemented:|scrollIntoView|scrollTo/.test(e.message))errs.push(e.message);});
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{if(dom.window.document.readyState==='complete')r();else dom.window.addEventListener('load',r);setTimeout(r,1500);});
const w=dom.window,doc=w.document; const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const C=[]; const want=(n,ok,d)=>C.push({n,ok:!!ok,d:d||""});
function render(g,id){ doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch"); const gs=ch.querySelector(".i-group"); gs.value=g; fire(gs,"change"); const ps=ch.querySelector(".i-prod"); if(ps.querySelector('option[value="'+id+'"]')){ps.value=id;fire(ps,"change");} return ch; }
// ระแนง (กลุ่ม 2) — หา id ระแนงตัวแรก
const ch2=render("2",""); const ranaeId=Array.from(ch2.querySelector(".i-prod").options).map(o=>o.value).find(v=>{const p=undefined; return /rn/.test(v);});
// ใช้ rn2 (ระแนงบังตา) ถ้ามี
for(const rid of ['rn2','rn7','rn38']){ const ch=render("2",rid); if(ch.querySelector(".i-prod").value!==rid)continue;
  want("ระแนง "+rid+" → ไม่มีคาดตาราง (o-gridmark)", !ch.querySelector(".o-gridmark"), ch.querySelector(".o-gridmark")?"ยังมี":"หาย");
  want("ระแนง "+rid+" → ไม่มีฝังรางยู (o-uchannel)", !ch.querySelector(".o-uchannel"), ch.querySelector(".o-uchannel")?"ยังมี":"หาย");
  break;
}
// ประตูรั้ว
for(const gid of ['gate','gate_slide','fence_gate']){ const ch=render("2",gid); if(ch.querySelector(".i-prod").value!==gid)continue;
  const gt=ch.querySelector(".o-gatetype");
  want("ประตูรั้ว → o-gatetype เหลือ 1 ตัวเลือก (บานเลื่อน)", gt && gt.options.length===1 && gt.value==='slide_bottom', gt?("opts="+gt.options.length+" val="+gt.value):"ไม่มี gatetype");
  want("ประตูรั้ว → ไม่มีคาดตาราง", !ch.querySelector(".o-gridmark"), ch.querySelector(".o-gridmark")?"ยังมี":"หาย");
  want("ประตูรั้ว → ไม่มีฝังรางยู", !ch.querySelector(".o-uchannel"), ch.querySelector(".o-uchannel")?"ยังมี":"หาย");
  break;
}
let pass=0; for(const c of C){console.log((c.ok?"✅":"❌")+" "+c.n+"  ["+c.d+"]"); if(c.ok)pass++;}
console.log(`\n${pass}/${C.length} ผ่าน`+(errs.length?` · jsErrors:${errs.length}`:""));
process.exit(pass===C.length?0:1);
