import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/calculator/index.html", import.meta.url), "utf8");
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>{if(!/Not implemented:|scrollIntoView|scrollTo/.test(e.message))errs.push(e.message);});
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,url:"http://localhost/calculator/index.html"});
await new Promise(r=>{if(dom.window.document.readyState==='complete')r();else dom.window.addEventListener('load',r);setTimeout(r,1500);});
const w=dom.window,doc=w.document; const fire=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const C=[]; const want=(n,ok,d)=>C.push({n,ok:!!ok,d:d||""});
function render(g,id){ doc.getElementById("items").innerHTML=""; w.addItem(doc.getElementById("items")); const ch=doc.querySelector("#items .ch"); const gs=ch.querySelector(".i-group"); gs.value=g; fire(gs,"change"); const ps=ch.querySelector(".i-prod"); if(id&&ps.querySelector('option[value="'+id+'"]')){ps.value=id;fire(ps,"change");} return ch; }
// 1) ระแนง-บังตา → cascade box
const ch=render("2","rn2");
want("ระแนง rn2 → มี .rn-prodsel (cascade)", !!ch.querySelector(".rn-prodsel"), ch.querySelector(".rn-prodsel")?"มี":"ไม่มี");
const boxChips=Array.from(ch.querySelectorAll('.rn-prodsel .chip[data-val]')).filter(b=>/rnPick\(this,'box'\)/.test(b.getAttribute('onclick')||""));
want("มีชิป ① ขนาดกล่อง (rnPick box)", boxChips.length>0, "boxes="+boxChips.length);
if(boxChips[0]) boxChips[0].click();
const pid=doc.querySelector("#items .ch .i-prod").value;
want("กดกล่อง → product = ระแนง id valid", /^rn\d+$/.test(pid), "pid="+pid);
// 2) ระแนง-ผนัง merge เข้า box
const chW=render("2","rn38");
want("ระแนง-ผนัง rn38 → cascade box (merge)", !!chW.querySelector(".rn-prodsel"), "");
// 3) กล่องที่มี 2 หน้า — เลือกกล่อง 1”x1.6” แล้วเช็คหน้าโชว์ >1
const chF=render("2","rn2");
const box16=Array.from(chF.querySelectorAll('.rn-prodsel .chip[data-val]')).find(b=>/1.x1.6/.test(b.dataset.val||"")&&/'box'/.test(b.getAttribute('onclick')||""));
if(box16)box16.click();
const chF2=doc.querySelector("#items .ch");
const faceChips=Array.from(chF2.querySelectorAll('.rn-prodsel .chip[data-val]')).filter(b=>/rnPick\(this,'face'\)/.test(b.getAttribute('onclick')||""));
want("กล่อง 1”x1.6” → หน้าโชว์ ≥2 (บังตา+ผนัง merge)", faceChips.length>=2, "faces="+faceChips.map(b=>b.dataset.val).join(","));
// 4) เกล็ด Z ผ่าน famPickCat
const chZ=render("2",null);
const zBtn=Array.from(chZ.querySelectorAll('button,.chip')).find(b=>/เกล็ด/.test(b.textContent)&&/famPickCat/.test(b.getAttribute('onclick')||""));
if(zBtn)zBtn.click();
const chZ2=doc.querySelector("#items .ch");
want("เกล็ด Z → gleed product + cascade ขนาดเกล็ด", /^rn8[3-8]$/.test(chZ2.querySelector(".i-prod").value)&&/ขนาดเกล็ด/.test(chZ2.textContent), "pid="+chZ2.querySelector(".i-prod").value);
// 5) ประตูรั้ว
const chG=render("2","fence_gate");
want("ประตูรั้ว fence_gate render ได้", /fence_gate/.test(chG.querySelector(".i-prod").value), "");
// 6) 0 JS error
want("0 JS error ตลอด cascade", errs.length===0, errs.slice(0,2).join(" | "));
let pass=0; for(const c of C){console.log((c.ok?"✅":"❌")+" "+c.n+"  ["+c.d+"]"); if(c.ok)pass++;}
console.log(`\n${pass}/${C.length} ผ่าน`+(errs.length?` · jsErrors:${errs.length}`:""));
process.exit(pass===C.length?0:1);
