// ธง3: G1 = 6 ปุ่มกลุ่มแบบ G6 (G1GROUPS · navigation · ไม่แตะราคา)
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>{if(!/Not implemented:|scrollIntoView|scrollTo/.test(e.message))errs.push(e.message);});
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{if(dom.window.document.readyState==='complete')r();else dom.window.addEventListener('load',r);setTimeout(r,1500);});
const w=dom.window,doc=w.document; const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const C=[]; const want=(n,ok,d)=>C.push({n,ok:!!ok,d:d||""});
function g1(){ doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch"); const gs=ch.querySelector(".i-group"); gs.value="1"; fire(gs,"change"); return ch; }
const ch=g1();
const grpBtns=Array.from(ch.querySelectorAll('.fam-prodsel .chip[data-g1grp]'));
want("G1 → มีปุ่มกลุ่ม (G1GROUPS)", grpBtns.length>=5, "groups="+grpBtns.map(b=>b.dataset.g1grp).join(","));
want("ครบ 6 กลุ่ม slide/swing/fold/fix/curve/other", ['slide','swing','fold','fix','curve','other'].every(k=>grpBtns.some(b=>b.dataset.g1grp===k)), grpBtns.map(b=>b.dataset.g1grp).join(","));
// กดแต่ละกลุ่ม → product valid
const validByGrp={slide:/sliding|inner/, swing:/casement|awning|pivot/, fold:/folding/, fix:/fixed|frameless|wall_|isowall/, curve:/curved/, other:/pc_door|ykk|lift|shower/};
for(const k of ['slide','swing','fold','fix','curve','other']){
  const chx=g1(); const b=Array.from(chx.querySelectorAll('.chip[data-g1grp="'+k+'"]'))[0]; if(b)b.click();
  const pid=doc.querySelector("#items .ch .i-prod").value;
  want("กดกลุ่ม "+k+" → product ตรงกลุ่ม", validByGrp[k].test(pid), "pid="+pid);
}
// สลับกลุ่มแล้วราคา engine ยังมาจาก product (ไม่ error)
want("0 JS error", errs.length===0, errs.slice(0,2).join(" | "));
let pass=0; for(const c of C){console.log((c.ok?"✅":"❌")+" "+c.n+"  ["+c.d+"]"); if(c.ok)pass++;}
console.log(`\n${pass}/${C.length} ผ่าน`+(errs.length?` · jsErrors:${errs.length}`:""));
process.exit(pass===C.length?0:1);
